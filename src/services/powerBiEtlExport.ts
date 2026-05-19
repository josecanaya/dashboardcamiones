/**
 * Export CSV estables para Power BI (véase POWER_BI_ETL_SCHEMA_VERSION).
 * Fuente: pipeline comité + buildCleanRealDataset defaults.
 */

import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { RealAlertDto } from './realTruckflowApi'
import { strToU8, zipSync } from 'fflate'
import { buildCleanRealDataset } from './realTruckflowCleanDataset'
import { committeeEtlHintFromMeta, type CommitteePipelineResult } from './realCommitteePipeline'
import { normalizeRealAlertForView, type NormalizedRealAlertView } from './realAlertsInspector'
import {
  buildCameraDiagnostics,
  getEventOperationalInstantMs,
} from './liveCameraDiagnostics'
import { buildCircuitEtlV2CsvBundle, CIRCUIT_ETL_V2_FILENAMES } from './circuitEtlV2'

function normalizedAlertOccurredMs(a: NormalizedRealAlertView): number {
  const t = new Date(a.occurredAt).getTime()
  return Number.isNaN(t) ? NaN : t
}

const RELATED_EVENT_NEAR_MS = 30 * 60 * 1000
const RELATED_EVENT_WIDE_MS = 120 * 60 * 1000

function payloadRead(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  if (typeof v === 'string') return v.trim()
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

function indexSegmentedEventsByJourney(events: RealJourneyEventDto[]): Map<string, RealJourneyEventDto[]> {
  const m = new Map<string, RealJourneyEventDto[]>()
  for (const e of events) {
    const uid = String(e.journeyUid ?? '').trim()
    if (!uid) continue
    const arr = m.get(uid) ?? []
    arr.push(e)
    m.set(uid, arr)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => getEventOperationalInstantMs(a) - getEventOperationalInstantMs(b))
  }
  return m
}

/** Asocia alerta operativa ↔ evento segmentado si journey coincide y hay cercanía temporal + device/sector razonables. */
function findRelatedOperationalEvent(
  nav: NormalizedRealAlertView,
  byJourney: Map<string, RealJourneyEventDto[]>
): RealJourneyEventDto | undefined {
  const uid = (nav.journeyUid ?? '').trim()
  const list = byJourney.get(uid)
  if (!list?.length) return undefined
  const taMs = normalizedAlertOccurredMs(nav)
  if (!Number.isFinite(taMs)) return undefined

  const ad = (nav.deviceCode ?? '').trim().toUpperCase()
  const asc = (nav.sectorCode ?? '').trim().toUpperCase()

  type Scored = { e: RealJourneyEventDto; pri: number; dt: number }
  const cand: Scored[] = []

  for (const e of list) {
    const teMs = getEventOperationalInstantMs(e)
    if (!Number.isFinite(teMs)) continue
    const dt = Math.abs(teMs - taMs)
    const ed = (e.deviceCode ?? '').trim().toUpperCase()
    const ec = (e.sectorCode ?? '').trim().toUpperCase()

    const devMatch = !ad || !ed || ad === ed
    const secMatch = !asc || !ec || asc === ec
    const tight = Boolean(ad && ed && ad === ed && asc && ec && asc === ec)

    if (tight && dt <= RELATED_EVENT_NEAR_MS) {
      cand.push({ e, pri: 0, dt })
      continue
    }
    if (devMatch && secMatch && dt <= RELATED_EVENT_NEAR_MS) {
      cand.push({ e, pri: 1, dt })
      continue
    }
    if (devMatch && secMatch && dt <= RELATED_EVENT_WIDE_MS) {
      cand.push({ e, pri: 2, dt })
    }
  }

  if (!cand.length) return undefined
  cand.sort((a, b) => (a.pri !== b.pri ? a.pri - b.pri : a.dt - b.dt))
  return cand[0]!.e
}

function describeCleanAlert(nav: NormalizedRealAlertView): string {
  const parts = [nav.description.trim(), nav.message.trim(), nav.reason.trim()].filter(Boolean)
  return [...new Set(parts)].join(' | ')
}

export const POWER_BI_ETL_SCHEMA_VERSION = '3'

export const POWER_BI_ETL_FILENAMES = {
  raw_events_api: 'raw_events_api.csv',
  raw_alerts_api: 'raw_alerts_api.csv',
  clean_events: 'clean_events.csv',
  clean_alerts: 'clean_alerts.csv',
  clean_circuits: 'clean_circuits.csv',
  camera_diagnostics: 'camera_diagnostics.csv',
  alert_summary: 'alert_summary.csv',
  etl_summary: 'etl_summary.csv',
  ...CIRCUIT_ETL_V2_FILENAMES,
} as const

/**
 * Solo circuitos/eventos reconstruidos v2 + calidad + incompletos + diagnóstico de cámaras (ZIP liviano para comité).
 */
export const POWER_BI_COMMITTEE_FILENAMES = {
  clean_circuits_v2: CIRCUIT_ETL_V2_FILENAMES.clean_circuits_v2,
  clean_events_v2: CIRCUIT_ETL_V2_FILENAMES.clean_events_v2,
  etl_quality_summary_v2: CIRCUIT_ETL_V2_FILENAMES.etl_quality_summary_v2,
  incompletos_por_motivo: CIRCUIT_ETL_V2_FILENAMES.incompletos_por_motivo,
  camera_diagnostics: POWER_BI_ETL_FILENAMES.camera_diagnostics,
} as const

export const POWER_BI_ETL_DEBUG_FILE_COUNT = Object.keys(POWER_BI_ETL_FILENAMES).length
export const POWER_BI_COMMITTEE_FILE_COUNT = Object.keys(POWER_BI_COMMITTEE_FILENAMES).length

export type PowerBiCommitteeCsvKey = keyof typeof POWER_BI_COMMITTEE_FILENAMES

export type PowerBiZipFilenameVariant = 'committee' | 'debug'

/** Cabeceras por archivo — cambiar orden/nombre de columnas implica subir POWER_BI_ETL_SCHEMA_VERSION. */
export const POWER_BI_CSV_HEADERS = {
  raw_events_api: [
    'id',
    'journey_uid',
    'sequence_number',
    'event_category',
    'event_type',
    'occurred_at',
    'recorded_at',
    'created_at',
    'modified_at',
    'truck_plate',
    'normalized_plate',
    'is_valid_plate',
    'sector_code',
    'device_code',
    'alert_level',
  ],
  raw_alerts_api: [
    'raw_id',
    'journey_uid',
    'plate',
    'truck_plate',
    'sector_code',
    'device_code',
    'site',
    'alert_type',
    'type_alt',
    'reason',
    'message',
    'occurred_at',
    'created_at',
    'recorded_at',
    'alert_level',
    'payload_json',
  ],
  clean_events: [
    'event_id',
    'journey_uid',
    'sequence_number',
    'event_category',
    'event_type',
    'occurred_at',
    'recorded_at',
    'truck_plate',
    'normalized_plate',
    'is_valid_plate',
    'sector_code',
    'device_code',
    'alert_level',
    'committee_source_journey_uid',
    'committee_segment_index',
    'committee_temporal_bucket',
    'committee_operational_circuit',
    'committee_flags',
    'related_alert_count',
    'related_alert_ids',
  ],
  clean_alerts: [
    'alert_id',
    'created_at',
    'modified_at',
    'journey_uid',
    'truck_plate',
    'normalized_plate',
    'sector_code',
    'device_code',
    'alert_code',
    'severity',
    'status',
    'description',
    'payload_plate',
    'payload_normalized_plate',
    'payload_event_id',
    'payload_device_code',
    'has_related_event',
    'related_event_id',
    'related_journey_uid',
    'etl_status',
    'etl_reason',
  ],
  clean_circuits: [
    'journey_uid',
    'plate',
    'started_at',
    'ended_at',
    'duration_minutes',
    'preliminary_circuit_code',
    'preliminary_circuit_name',
    'preliminary_circuit_confidence',
    'site_id',
    'event_count',
    'logical_code_sequence_joined',
    'raw_sector_sequence_joined',
    'quality_flags_joined',
    'is_complete_minimal',
    'is_suspicious_long',
    'feeds_operational_analytics',
    'committee_source_journey_uid',
    'committee_segment_index',
    'committee_temporal_bucket',
    'committee_operational_circuit',
    'committee_etl_hint',
    'committee_etl_reason',
    'included_in_clean_layer',
  ],
  alert_summary: ['alert_code', 'sector_code', 'device_code', 'alert_count', 'first_alert_at', 'last_alert_at'],
  camera_diagnostics: [
    'device_code',
    'sector_code',
    'event_count',
    'alert_count',
    'visible_event_count',
    'lpr_alert_count',
    'lpr_per_100_events',
    'events_last_10_min_of_window',
    'alerts_last_10_min_of_window',
    'last_valid_plate',
    'last_invalid_reading',
    'latest_kind',
    'latest_at',
    'suggested_status',
    'recommended_action',
  ],
  etl_summary: [
    'schema_version',
    'selected_start_datetime',
    'selected_end_datetime',
    'query_start',
    'query_end',
    'generated_at',
    'raw_events_count',
    'raw_alerts_count',
    'operational_events_count',
    'operational_alerts_count',
    'clean_events_count',
    'clean_alerts_count',
    'clean_circuits_count',
    'excluded_rear_events_count',
    'excluded_rear_alerts_count',
    'applied_rules_filters_json',
    'committee_pipeline_marker',
    'api_base_url',
    'exported_at_iso',
    'dataset_last_loaded_at_iso',
    'rear_excluded_device_codes',
    'rear_excluded_ingress_route_sectors',
    'rear_excluded_ingress_route_codes',
    'rear_excluded_ingress_route_device_codes',
    'raw_events_ricardone_count',
    'raw_alerts_fetched_count',
    'rear_excluded_events_count',
    'rear_excluded_alerts_count',
    'rear_excluded_ingress_route_alerts_count',
    'rear_only_rear_camera_journey_count',
    'committee_segmented_event_count',
    'committee_aligned_alert_count',
    'committee_executive_raw_event_count',
    'committee_executive_operational_event_count',
    'committee_executive_operational_alert_count',
    'committee_executive_journeys_processed_count',
    'committee_executive_included_circuit_journeys_count',
    'committee_executive_review_required_count',
    'committee_executive_excluded_count',
    'committee_executive_top_circuit_code',
    'committee_executive_top_circuit_count',
    'clean_rules_json',
    'clean_layer_raw_event_inputs',
    'clean_layer_raw_alert_inputs',
    'clean_layer_clean_event_rows',
    'clean_layer_clean_journey_rows',
    'clean_layer_discarded_event_rows',
    'clean_layer_discarded_journey_rows',
    'clean_layer_events_with_related_alert_tagged_count',
    'clean_layer_journeys_with_related_alert_tagged_count',
    'dataset_reconstructed_journey_count',
    'source_mode',
    'local_folder',
    'local_start_date',
    'local_end_date',
    'local_days_loaded',
  ],
} as const

/** @deprecated Usar POWER_BI_CSV_HEADERS; el nivel de contrato está en POWER_BI_ETL_SCHEMA_VERSION. */
export const POWER_BI_V1_CSV_HEADERS = POWER_BI_CSV_HEADERS

export type PowerBiNamedCsv = { filename: string; csv: string }

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))]
  return '\uFEFF' + lines.join('\n')
}

function alertPayloadCsv(a: RealAlertDto): string {
  const p = a.payload
  if (p === undefined || p === null) return ''
  if (typeof p === 'string') return p.trim()
  try {
    return JSON.stringify(p)
  } catch {
    return ''
  }
}

function maxIsoTsMs(events: RealJourneyEventDto[], normalizedAlerts: NormalizedRealAlertView[]): number {
  let m = 0
  for (const e of events) {
    const x = getEventOperationalInstantMs(e)
    if (Number.isFinite(x)) m = Math.max(m, x)
  }
  for (const a of normalizedAlerts) {
    const x = normalizedAlertOccurredMs(a)
    if (Number.isFinite(x)) m = Math.max(m, x)
  }
  return m || Date.now()
}

function uniqueCameraKeys(events: RealJourneyEventDto[], normalizedAlerts: NormalizedRealAlertView[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    const dc = String(e.deviceCode ?? '').trim()
    const sc = String(e.sectorCode ?? '').trim()
    if (dc && sc) set.add(`${dc}\t${sc}`)
  }
  for (const a of normalizedAlerts) {
    const dc = String(a.deviceCode ?? '').trim()
    const sc = String(a.sectorCode ?? '').trim()
    if (dc && sc) set.add(`${dc}\t${sc}`)
  }
  return [...set].sort()
}

function buildCameraDiagnosticsPowerBiArtifact(
  segEvents: RealJourneyEventDto[],
  normalizedAligned: NormalizedRealAlertView[]
): PowerBiNamedCsv {
  const H = POWER_BI_CSV_HEADERS
  const nowMs = maxIsoTsMs(segEvents, normalizedAligned)
  const camKeys = uniqueCameraKeys(segEvents, normalizedAligned)
  const camRows = camKeys.map((key) => {
    const [deviceCode, sectorCode] = key.split('\t')
    const d = buildCameraDiagnostics(segEvents, normalizedAligned, deviceCode, sectorCode, nowMs)
    return [
      d.deviceCode,
      d.sectorCode,
      String(d.eventCount),
      String(d.alertCount),
      String(d.visibleEventCount),
      String(d.lprAlertCount),
      String(d.lprPer100Events),
      String(d.eventsLast10Min),
      String(d.alertsLast10Min),
      d.lastValidPlate,
      d.lastInvalidReading,
      d.latestKind,
      d.latestAt,
      d.suggestedStatus,
      d.recommendedAction,
    ]
  })
  return {
    filename: POWER_BI_ETL_FILENAMES.camera_diagnostics,
    csv: toCsv([...H.camera_diagnostics], camRows),
  }
}

const CLEAN_RULES_META = JSON.stringify({
  exclude_invalid_plates: true,
  exclude_alerted_journeys: true,
  exclude_alerted_events: false,
  exclude_only_ingreso: true,
  exclude_only_egreso: true,
  exclude_solo_ruta_probable: true,
  keep_preliminary_valid: true,
})

/** Meta opcional cuando el dataset proviene de JSON locales (`data/truckflow`). */
export type CommitteeLocalFilesMeta = {
  source_mode: 'local_files'
  local_folder: string
  start_date: string
  end_date: string
  days_loaded: number
}

/** Entrada compartida entre export completo y export mínimo comité (mismo dataset cargado en UI). */
export type CommitteePowerBiExportInput = {
  apiBaseUrl: string
  /** Rango elegido en UI (normalmente igual a query_* enviado al API). */
  selectedStartDatetime?: string
  selectedEndDatetime?: string
  queryStart?: string
  queryEnd?: string
  exportedAtIso: string
  lastLoadedAt: string
  eventsRawRicardone: RealJourneyEventDto[]
  alertsRaw: RealAlertDto[]
  committee: CommitteePipelineResult
  /** Si está definido, `etl_summary` agrega columnas de modo archivos locales (schema v3+). */
  localFilesMeta?: CommitteeLocalFilesMeta | null
}

/** Export liviano para comité (mismos datos que segmented + aligned). No usa journeyMeta/raw del input completo. */
export function buildCommitteePowerBiMinimalFromSegmented(
  segmentedOperationalEvents: RealJourneyEventDto[],
  alertsAlignedToSegments: RealAlertDto[]
): PowerBiNamedCsv[] {
  const normalizedAligned = alertsAlignedToSegments.map(normalizeRealAlertForView)

  const circuitV2Core = buildCircuitEtlV2CsvBundle(segmentedOperationalEvents, {
    rawEventsCountHint: segmentedOperationalEvents.length,
    committeePowerBiSubset: true,
  })
  const camera = buildCameraDiagnosticsPowerBiArtifact(segmentedOperationalEvents, normalizedAligned)
  return [...circuitV2Core, camera]
}

/** Export liviano para comité: solo circuitos/eventos v2 + calidad + incompletos + cámaras (sin raw ni capas legacy). */
export function buildCommitteePowerBiMinimalExport(input: CommitteePowerBiExportInput): PowerBiNamedCsv[] {
  return buildCommitteePowerBiMinimalFromSegmented(
    input.committee.segmentedOperationalEvents,
    input.committee.alertsAlignedToSegments
  )
}

/**
 * Deriva todos los CSV con nombres fijos desde Ricardone crudo + pipeline comité (modo debug completo).
 */
export function buildCommitteePowerBiEtlExport(input: CommitteePowerBiExportInput): PowerBiNamedCsv[] {
  const segEvents = input.committee.segmentedOperationalEvents
  const alignedAlerts = input.committee.alertsAlignedToSegments
  const rear = input.committee.rearCameraTrace

  const cleanDs = buildCleanRealDataset(segEvents, alignedAlerts)

  const normalizedAligned = alignedAlerts.map(normalizeRealAlertForView)

  /** Preferir aligned; si quedó vacío por dedupe/agrupación agresiva pero hay alertas operativas tras filtro trasero, exportar esas (regla 5). */
  const rearOperationalAlerts = rear.operationalAlerts
  const alertsForCleanCsv =
    alignedAlerts.length > 0 ? alignedAlerts : rearOperationalAlerts.length > 0 ? rearOperationalAlerts : alignedAlerts
  const normalizedForCleanAlerts = alertsForCleanCsv.map(normalizeRealAlertForView)
  const cleanAlertsFromRearFallback = alignedAlerts.length === 0 && rearOperationalAlerts.length > 0

  const H = POWER_BI_CSV_HEADERS

  const rawEventRows = input.eventsRawRicardone.map((e) => [
    String(e.id),
    e.journeyUid,
    String(e.sequenceNumber),
    e.eventCategory,
    e.eventType,
    e.occurredAt,
    e.recordedAt,
    e.createdAt ?? '',
    e.modifiedAt ?? '',
    e.truckPlate,
    e.normalizedPlate,
    e.isValidPlate ? 'true' : 'false',
    e.sectorCode,
    e.deviceCode,
    String(e.alertLevel),
  ])

  const rawAlertRows = input.alertsRaw.map((a) => {
    const o = a as Record<string, unknown>
    const idNum = typeof a.id === 'number' || typeof a.id === 'string' ? String(a.id) : ''
    return [
      idNum,
      String(a.journeyUid ?? a.journeyUuid ?? ''),
      String(a.plate ?? ''),
      String(a.truckPlate ?? ''),
      String(a.sectorCode ?? ''),
      String(a.deviceCode ?? ''),
      String(a.site ?? ''),
      String(a.alertType ?? ''),
      String(a.type ?? ''),
      String(a.reason ?? ''),
      String(a.message ?? ''),
      String(a.occurredAt ?? ''),
      String(a.createdAt ?? ''),
      String(a.recordedAt ?? ''),
      String(o.alertLevel ?? ''),
      alertPayloadCsv(a),
    ]
  })

  /** --- clean_events --- */
  const cleanEventRows = cleanDs.cleanEvents.map((e) => {
    const meta = input.committee.journeyMetaByUid.get(e.journeyUid)
    return [
      String(e.id),
      e.journeyUid,
      String(e.sequenceNumber),
      e.eventCategory,
      e.eventType,
      e.occurredAt,
      e.recordedAt,
      e.truckPlate,
      e.normalizedPlate,
      e.isValidPlate ? 'true' : 'false',
      e.sectorCode,
      e.deviceCode,
      String(e.alertLevel),
      meta?.sourceJourneyUid ?? '',
      meta?.segmentIndex === null || meta?.segmentIndex === undefined ? '' : String(meta.segmentIndex),
      meta?.temporalBucket ?? '',
      meta?.committeeOperationalCircuit ?? '',
      (meta?.committeeFlags ?? []).join('|'),
      String(e.relatedAlerts.length),
      e.relatedAlerts.map((r) => r.alertId).join('|'),
    ]
  })

  /** --- clean_alerts: todas las alertas operativas alineadas por comité (independiente de relatedAlerts en clean_events) --- */
  const eventsByJourneyUid = indexSegmentedEventsByJourney(segEvents)
  const alertSummaryAgg = new Map<string, { count: number; firstMs: number; lastMs: number }>()

  const cleanAlertRows = normalizedForCleanAlerts.map((nav) => {
    const related = findRelatedOperationalEvent(nav, eventsByJourneyUid)
    const raw = nav.raw as Record<string, unknown>
    const payload = nav.payload
    const hasRel = Boolean(related)

    const alertCodeAgg = ((nav.alertCode || nav.alertType || 'UNKNOWN').trim() || 'UNKNOWN').trim()
    const secAgg = nav.sectorCode.trim()
    const devAgg = nav.deviceCode.trim()
    const rollupKey = `${alertCodeAgg}\t${secAgg}\t${devAgg}`
    const tMs = normalizedAlertOccurredMs(nav)
    let agg = alertSummaryAgg.get(rollupKey)
    if (!agg) {
      agg = { count: 0, firstMs: NaN, lastMs: NaN }
    }
    agg.count += 1
    if (Number.isFinite(tMs)) {
      agg.firstMs = Number.isFinite(agg.firstMs) ? Math.min(agg.firstMs, tMs) : tMs
      agg.lastMs = Number.isFinite(agg.lastMs) ? Math.max(agg.lastMs, tMs) : tMs
    }
    alertSummaryAgg.set(rollupKey, agg)

    let etlReason = ''
    let etlStatus = cleanAlertsFromRearFallback ? 'committee_operational_rear_fallback' : 'committee_operational_aligned'
    if (!related) {
      etlReason = !(eventsByJourneyUid.get((nav.journeyUid ?? '').trim())?.length ?? 0)
        ? 'NO_SEGMENT_EVENTS_FOR_JOURNEY'
        : 'NO_CORRELATED_OPERATIONAL_EVENT'
      if (!cleanAlertsFromRearFallback) etlStatus = 'standalone_alert_no_event_match'
    }

    const statusFromPayload =
      payloadRead(payload, 'status') || String(raw.alertStatus ?? raw.status ?? '').trim()
    const bodyDesc = describeCleanAlert(nav) || nav.occurredAt || ''

    return [
      nav.alertId,
      String(nav.raw.createdAt ?? ''),
      String(raw.modifiedAt ?? ''),
      nav.journeyUid,
      nav.rawPlate,
      nav.normalizedPlate,
      nav.sectorCode,
      nav.deviceCode,
      nav.alertCode || nav.alertType,
      String(nav.alertLevel),
      statusFromPayload,
      bodyDesc,
      payloadRead(payload, 'plate') || payloadRead(payload, 'truckPlate'),
      payloadRead(payload, 'normalizedPlate'),
      payloadRead(payload, 'eventId') || payloadRead(payload, 'event_id'),
      payloadRead(payload, 'deviceCode') || payloadRead(payload, 'device_code'),
      hasRel ? 'true' : 'false',
      related ? String(related.id) : '',
      related ? related.journeyUid : '',
      etlStatus,
      etlReason,
    ]
  })

  /** --- alert_summary: agregado por tipo + cámara + sector --- */
  const alertSummaryRows = [...alertSummaryAgg.entries()]
    .map(([compound, agg]) => {
      const bits = compound.split('\t')
      const alert_code = bits[0] ?? ''
      const sector_code = bits[1] ?? ''
      const device_code = bits[2] ?? ''
      const firstIso = Number.isFinite(agg.firstMs) ? new Date(agg.firstMs).toISOString() : ''
      const lastIso = Number.isFinite(agg.lastMs) ? new Date(agg.lastMs).toISOString() : ''
      return [alert_code, sector_code, device_code, String(agg.count), firstIso, lastIso]
    })
    .sort((a, b) => Number(b[3]) - Number(a[3]))

  /** --- clean_circuits --- */
  const includedCleanUids = new Set(cleanDs.reconstructedJourneysClean.map((j) => j.journeyUid))
  const cleanCircuitRows = cleanDs.reconstructedJourneysRaw.map((j) => {
    const meta = input.committee.journeyMetaByUid.get(j.journeyUid)
    const hint = meta ? committeeEtlHintFromMeta(meta) : { etl: 'review_required' as const, reason: 'MISSING_COMMITTEE_META' }
    const incl = includedCleanUids.has(j.journeyUid)
    return [
      j.journeyUid,
      j.plate,
      j.startedAt,
      j.endedAt,
      String(j.durationMinutes),
      j.preliminaryCircuitCode,
      j.preliminaryCircuitName,
      j.preliminaryCircuitConfidence,
      j.siteId,
      String(j.eventCount),
      j.logicalCodeSequence.join('|'),
      j.rawSectorSequence.join('|'),
      j.qualityFlags.join('|'),
      j.isCompleteMinimal ? 'true' : 'false',
      j.isSuspiciousLong ? 'true' : 'false',
      j.feedsOperationalAnalytics ? 'true' : 'false',
      meta?.sourceJourneyUid ?? '',
      meta?.segmentIndex === null || meta?.segmentIndex === undefined ? '' : String(meta.segmentIndex),
      meta?.temporalBucket ?? '',
      meta?.committeeOperationalCircuit ?? '',
      hint.etl,
      hint.reason,
      incl ? 'true' : 'false',
    ]
  })

  const cameraArtifact = buildCameraDiagnosticsPowerBiArtifact(segEvents, normalizedAligned)

  /** --- etl_summary (una fila, columnas estables) --- */
  const EXEC = input.committee.executiveSummary

  const queryStartVal = input.queryStart ?? ''
  const queryEndVal = input.queryEnd ?? ''
  const selectedStartVal = input.selectedStartDatetime ?? queryStartVal
  const selectedEndVal = input.selectedEndDatetime ?? queryEndVal

  let cleanRulesParsed: Record<string, unknown> = {}
  try {
    cleanRulesParsed = JSON.parse(CLEAN_RULES_META) as Record<string, unknown>
  } catch {
    cleanRulesParsed = {}
  }
  const appliedRulesFiltersJson = JSON.stringify({
    committee_pipeline: 'buildCommitteeOperationalPipeline->buildCleanRealDataset(defaults)',
    scope_note:
      'Filas raw_events_api: eventos Ricardone tras filterRicardoneSiteEventsOnly; raw_alerts_api: respuesta completa del GET alert/list para la ventana pedida.',
    clean_dataset_rules: cleanRulesParsed,
  })

  const cleanAlertsCount = cleanAlertRows.length

  const circuitV2Artifacts = buildCircuitEtlV2CsvBundle(segEvents, { rawEventsCountHint: segEvents.length })

  const summaryRow = [
    POWER_BI_ETL_SCHEMA_VERSION,
    selectedStartVal,
    selectedEndVal,
    queryStartVal,
    queryEndVal,
    input.exportedAtIso,
    String(input.eventsRawRicardone.length),
    String(input.alertsRaw.length),
    String(EXEC.operationalEventCount),
    String(EXEC.operationalAlertCount),
    String(cleanDs.summary.cleanEventCount),
    String(cleanAlertsCount),
    String(cleanCircuitRows.length),
    String(rear.metadata.excludedEventsCount),
    String(rear.metadata.excludedAlertsCount),
    appliedRulesFiltersJson,
    'buildCommitteeOperationalPipeline->buildCleanRealDataset(defaults)',
    input.apiBaseUrl,
    input.exportedAtIso,
    input.lastLoadedAt,
    [...rear.metadata.excludedDeviceCodes].join('|'),
    [...rear.metadata.excludedIngressRouteAlertSectors].join('|'),
    [...rear.metadata.excludedIngressRouteAlertCodes].join('|'),
    [...rear.metadata.excludedIngressRouteAlertDeviceCodes].join('|'),
    String(input.eventsRawRicardone.length),
    String(input.alertsRaw.length),
    String(rear.metadata.excludedEventsCount),
    String(rear.metadata.excludedAlertsCount),
    String(rear.metadata.excludedIngressRouteAlertsCount),
    String(rear.metadata.excludedRearOnlyJourneyCount),
    String(segEvents.length),
    String(alignedAlerts.length),
    String(EXEC.rawEventCount),
    String(EXEC.operationalEventCount),
    String(EXEC.operationalAlertCount),
    String(EXEC.journeysProcessedCount),
    String(EXEC.includedCircuitCount),
    String(EXEC.reviewRequiredCount),
    String(EXEC.excludedCount),
    EXEC.topCircuitCode,
    String(EXEC.topCircuitCount),
    CLEAN_RULES_META,
    String(cleanDs.summary.rawEventCount),
    String(cleanDs.summary.rawAlertCount),
    String(cleanDs.summary.cleanEventCount),
    String(cleanDs.summary.cleanJourneyCount),
    String(cleanDs.summary.discardedEventCount),
    String(cleanDs.summary.discardedJourneyCount),
    String(cleanDs.summary.invalidPlateEventCount),
    String(cleanDs.summary.eventsWithAlertCount),
    String(cleanDs.summary.journeysWithAlertCount),
    String(cleanDs.summary.rawJourneyCount),
  ]

  const lm = input.localFilesMeta
  summaryRow.push(
    lm?.source_mode ?? 'api_direct',
    lm?.local_folder ?? '',
    lm?.start_date ?? '',
    lm?.end_date ?? '',
    lm ? String(lm.days_loaded) : ''
  )

  return [
    { filename: POWER_BI_ETL_FILENAMES.raw_events_api, csv: toCsv([...H.raw_events_api], rawEventRows) },
    { filename: POWER_BI_ETL_FILENAMES.raw_alerts_api, csv: toCsv([...H.raw_alerts_api], rawAlertRows) },
    { filename: POWER_BI_ETL_FILENAMES.clean_events, csv: toCsv([...H.clean_events], cleanEventRows) },
    { filename: POWER_BI_ETL_FILENAMES.clean_alerts, csv: toCsv([...H.clean_alerts], cleanAlertRows) },
    { filename: POWER_BI_ETL_FILENAMES.clean_circuits, csv: toCsv([...H.clean_circuits], cleanCircuitRows) },
    cameraArtifact,
    { filename: POWER_BI_ETL_FILENAMES.alert_summary, csv: toCsv([...H.alert_summary], alertSummaryRows) },
    { filename: POWER_BI_ETL_FILENAMES.etl_summary, csv: toCsv([...H.etl_summary], [summaryRow]) },
    ...circuitV2Artifacts,
  ]
}

/** Nombre seguro para Windows (sin caracteres reservados en rutas típicas de descarga). */
export function buildPowerBiZipDownloadName(
  now: Date = new Date(),
  variant: PowerBiZipFilenameVariant = 'committee'
): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const prefix = variant === 'debug' ? 'powerbi-etl-debug_' : 'powerbi-comite_'
  return `${prefix}${y}-${m}-${d}_${h}-${min}-${s}.zip`
}

export type TriggerPowerBiZipDownloadOptions = {
  variant?: PowerBiZipFilenameVariant
  /** Si se define, prevalece sobre `variant`. */
  zipFilename?: string
}

/**
 * ZIP síncrono (`level: 0` = STORE). Import estático para poder usar este helper en el mismo turno que un click
 * sin `await` — Chromium suele bloquear descargas cuando hubo una microtarea antes del `<a download>`.
 */
export function zipPowerBiNamedCsvSync(files: PowerBiNamedCsv[]): Uint8Array {
  const map: Record<string, Uint8Array> = {}
  for (const f of files) {
    map[f.filename] = strToU8(f.csv)
  }
  return zipSync(map, { level: 0 })
}

function triggerAnchorDownloadZip(zipped: Uint8Array, downloadName: string): void {
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/**
 * Un solo archivo CSV (`<a download>`). Pensado para navegadores que bloquean varias descargas simultáneas.
 */
export function triggerSinglePowerBiCsvDownload(file: PowerBiNamedCsv): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 180_000)
}

/**
 * Dispara todas las descargas en **un mismo turno síncrono** dentro del handler de `click` del usuario.
 * Si se llama tras un `await` (microtarea/async), Chromium suele bloquear descargas automáticas: para comité usar
 * «preparar» en un clic y este método en **otro clic** siguiente.
 *
 * Revoca cada `blob:` tras un tiempo prudencial (la descarga sigue activa por el mismo origen hasta completarse).
 */
export function triggerCommitteeCsvDownloadsSync(files: PowerBiNamedCsv[]): void {
  if (typeof window === 'undefined') return
  if (files.length === 0) return

  for (const f of files) {
    triggerSinglePowerBiCsvDownload(f)
  }
}

/**
 * Un único archivo ZIP por export. Preferimos `showSaveFilePicker` cuando existe (Chrome/Edge):
 * permite guardar tras compilar el ZIP sin políticas antisíncronos de las descargas automáticas.
 * Otros navegadores: fallback con `<a download>` (podría estar bloqueado según configuración).
 * @param opts `variant`: prefijo del nombre del ZIP (`committee` por defecto en descargas genéricas).
 */
export async function triggerBrowserDownloadsSequential(
  files: PowerBiNamedCsv[],
  opts?: TriggerPowerBiZipDownloadOptions
): Promise<void> {
  if (typeof window === 'undefined') return

  const downloadName = opts?.zipFilename ?? buildPowerBiZipDownloadName(new Date(), opts?.variant ?? 'committee')

  const wf = typeof window !== 'undefined' ? (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> }) : null

  if (wf && typeof wf.showSaveFilePicker === 'function') {
    try {
      const handle = await wf.showSaveFilePicker({
        suggestedName: downloadName,
        types: [{ description: 'ZIP — Power BI ETL', accept: { 'application/zip': ['.zip'] } }],
      })
      const zipped = zipPowerBiNamedCsvSync(files)
      const writable = await handle.createWritable()
      await writable.write(zipped)
      await writable.close()
      return
    } catch (e) {
      const name = (e as { name?: string })?.name
      if (name === 'AbortError') return
    }
  }

  const zipped = zipPowerBiNamedCsvSync(files)
  triggerAnchorDownloadZip(zipped, downloadName)
}

/** Alias: ZIP modo debug (`powerbi-etl-debug_…`). */
export async function triggerPowerBiDebugDownloadsSequential(files: PowerBiNamedCsv[]): Promise<void> {
  return triggerBrowserDownloadsSequential(files, { variant: 'debug' })
}

/**
 * Genera ZIP y dispara descarga en el mismo turno síncrono (conserva user activation).
 * Preferible al flujo asíncrono con `triggerPowerBiDebugDownloadsSequential` dentro de handlers que ya hicieron `await`.
 */
export function downloadPowerBiNamedCsvZipSync(
  files: PowerBiNamedCsv[],
  opts?: TriggerPowerBiZipDownloadOptions
): void {
  if (typeof window === 'undefined') return
  const zipped = zipPowerBiNamedCsvSync(files)
  const downloadName =
    opts?.zipFilename ?? buildPowerBiZipDownloadName(new Date(), opts?.variant ?? 'committee')
  triggerAnchorDownloadZip(zipped, downloadName)
}
