import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import { occurredAtLocalDayKey } from '../../../services/realJourneyQuality'
import {
  compareRealEvents,
  reconstructRealJourneysIncludingInvalidPlates,
} from '../../../services/realJourneyEventsMapper'
import { applyJourneyCycleSplitsToEvents } from '../../../services/realJourneyCycleSplit'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { isEtlRearCameraDevice } from './etlRearDevices'
import { recordsToCsv } from './etlCsv'
import { makeTable, tableToCsv, type TypedTable } from '../../../etl-core/typedTable'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import {
  classifyJourneyAgainstCircuitMatrix,
  DEFAULT_CIRCUIT_MATRIX,
  computeJourneyReliability,
  confidenceLevelFromScore,
  executiveBucketLabel,
  finalStatusLabel,
  journeyDeviceSectorLogical,
  journeyHasBalansaCompleta,
  journeyHasLogicalEgreso,
  journeyHasStrongConfidenceBonus,
  journeyHasRicB2EgresoDevice,
  journeyHasStrongDefiningPoint,
  journeySequenceCoherent,
  isExecutiveSequenceConfigured,
  isRicSanLorenzoRouteCircuit,
  journeyHasLiquidStrongPoint,
  resolveExecutiveBucket,
  resolveExecutiveCircuitConfigForJourney,
  resolveExecutiveCircuitDecision,
  resolveProbableSolidExecutiveDecision,
  journeyMeetsDeducedEvidenceThreshold,
  journeyHasDeducedStrongEvidence,
  resolveFinalStatus,
  resolveOperationalEntry,
  resolveOperationalExit,
} from './finalCircuitScoring'
import { applySanLorenzoExecutiveSupport, snapshotSanLorenzoSupport } from './etlSanLorenzoSupport'
import {
  getCollapsedLogicalCodes,
  journeyHasSlIngresoEvidence,
  journeyIsRicSanLorenzoRouteEvidence,
  resolveTechnicalCircuitCodeForExecutive,
} from './etlRicSanLorenzoRoute'
import {
  journeyMeetsFlexibleInstrumentedDischargeRule,
  resolveFlexibleDischargeExecutiveCircuit,
  resolveFlexibleDischargePreliminaryCode,
} from './finalCircuitScoring'
import { resolveCommitteeClassification } from './committeeClassification'
import { type ClassifiedJourneyForTiming } from './etlSegmentTiming'
import type { CircuitTimingIndex } from './etlCircuitTiming'
import type { SegmentTimingIndex } from './etlSegmentTiming'
import { lookupSanLorenzoCameraByDevice } from '../../../data/sanLorenzoCameraCatalog'
import {
  applyExecutiveJourneyMerges,
  EXECUTIVE_MERGE_AUTO_GAP_MINUTES,
  EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES,
  EXECUTIVE_MERGE_OCR_AUTO_SIM,
} from './etlJourneyMerge'
import { normalizePlateStrict, plateSimilarityScore } from '../../../services/circuitPlateOcr'
import {
  accumulateOperationalAlertsMatch,
  attachExecutiveBucketsToOperationalAlertRows,
  computeOperationalAlertCrossMetrics,
  emptyJourneyOperationalAlertSummary,
  OPERATIONAL_ALERTS_CSV_COLUMNS,
  type JourneyMetaForAlertMatch,
  type JourneyOperationalAlertSummary,
} from './etlOperationalAlertMatch'
import type { TruckPlateRegistryDocument } from '../../../domain/truckPlateRegistry'
import { TRUCK_PLATE_REGISTRY_CATEGORY_LABELS } from '../../../domain/truckPlateRegistry'
import { buildRegistryLookup } from '../../../domain/truckPlateRegistry'
import {
  filterAlertsByPlateRegistry,
  filterEventsByPlateRegistry,
} from '../../../services/truckPlateRegistryFilter'
import {
  buildContractPrepFromTramo1Serialized,
  movimientosStatsFromIntegration,
  runContractFirstIntegration,
} from './etlTransformContractFirst'
import { runMovimientosContratoIntegration } from './etlMovimientosContratoIntegration'
import type { MovimientosContratoFileInput } from './etlExternalMovimientosContrato'
import type { KpiTiemposBuildInput } from './etlKpiTiemposBuild'
import {
  createPhaseStore,
  type EtlTransformPhaseStore,
  type EtlTransformRunOptions,
} from './etlTransformPhaseStore'
import { createEtlProfiler, type EtlProfiler } from './etlProfile'
import { ETL_DEV_MODE } from '../../../config/committeeEtlLite'

export const ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v12'
export type { FinalCircuitStatus } from './finalCircuitScoring'
export { finalStatusLabel } from './finalCircuitScoring'

function etlProfileMark(profiler: EtlProfiler, name: string, startMs: number): number {
  if (profiler.enabled) profiler.mark(name, performance.now() - startMs)
  return performance.now()
}

/** Cámara frontal de ingreso de referencia (comité Truckflow vs ingresos reales). Comparación trim + lowercase. */
const INGRESO_FRONT_REFERENCE_DEVICE_NORM = 'ricingcamfrente'
const INGRESO_FRONT_REFERENCE_SECTOR_NORM = 'ricardone_ingreso_camiones'

function normDeviceOrSector(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, '_') : ''
}

function indexEventsByJourney(events: RealJourneyEventDto[]): Map<string, RealJourneyEventDto[]> {
  const m = new Map<string, RealJourneyEventDto[]>()
  for (const e of events) {
    const uid = String(e.journeyUid ?? '').trim()
    if (!uid) continue
    const arr = m.get(uid) ?? []
    arr.push(e)
    m.set(uid, arr)
  }
  for (const arr of m.values()) {
    arr.sort(compareRealEvents)
  }
  return m
}

function journeyAlertSummaryToRow(sum: JourneyOperationalAlertSummary): Record<string, unknown> {
  return {
    operationalAlertCount: sum.operationalAlertCount,
    hasInvalidRoute: sum.hasInvalidRoute,
    hasInvalidJourneyStart: sum.hasInvalidJourneyStart,
    operationalAlertCodes: sum.operationalAlertCodes,
    firstOperationalAlertAt: sum.firstOperationalAlertAt,
    operationalAlertSectors: sum.operationalAlertSectors,
    possibleSystemCutReason: sum.possibleSystemCutReason,
  }
}

function emptyJourneyAlertSummaryRow(): Record<string, unknown> {
  return journeyAlertSummaryToRow({
    operationalAlertCount: 0,
    hasInvalidRoute: false,
    hasInvalidJourneyStart: false,
    operationalAlertCodes: '',
    firstOperationalAlertAt: '',
    operationalAlertSectors: '',
    possibleSystemCutReason: 'NONE',
    alertsWithoutEventMatch: 0,
  })
}

function isIngresoFrontalReferenceEvent(e: RealJourneyEventDto): boolean {
  return normDeviceOrSector(e.deviceCode) === INGRESO_FRONT_REFERENCE_DEVICE_NORM &&
    normDeviceOrSector(e.sectorCode) === INGRESO_FRONT_REFERENCE_SECTOR_NORM
}

const MERGE_SIMILAR_THRESHOLD = 0.8
const MERGE_TOP_LIMIT = 500
const LPR_MERGE_MODE = 'medium' as const
const LPR_MERGE_HIGH_THRESHOLD = 0.85
const LPR_MERGE_MEDIUM_THRESHOLD = 0.7
const LPR_MERGE_LOW_THRESHOLD = 0.55

type LprMergeConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
type LprMergeRule =
  | 'EXACT_DEVICE_TIME_PLATE'
  | 'DEVICE_OR_SECTOR_TIME_OCR'
  | 'SITE_TIME_OCR_WEAK'
  | 'NONE'

function inferSiteFromSectorCode(sectorCode: string): string {
  const sec = String(sectorCode ?? '').trim().toUpperCase()
  if (!sec) return 'unknown'
  if (sec.startsWith('RICARDONE_')) return 'ricardone'
  if (sec.startsWith('PUERTO_SAN_LORENZO_')) return 'san_lorenzo'
  if (sec.includes('AVELLANEDA')) return 'avellaneda'
  return 'unknown'
}

function extractPlateLikeFromText(text: string): string {
  const s = String(text ?? '').toUpperCase()
  const m =
    s.match(/\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/) ||
    s.match(/\b[A-Z]{3}\s?\d{3}\b/) ||
    s.match(/\b\d{2}\s?[A-Z]{3}\s?\d{2}\b/)
  return m ? m[0].replace(/\s+/g, '') : ''
}

function getLprObservedPlateRaw(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  const base =
    pickStr(p.normalizedPlate) ||
    pickStr(p.normalized_plate) ||
    pickStr(p.plate) ||
    pickStr(p.truckPlate) ||
    pickStr(a.truckPlate) ||
    pickStr(a.plate)
  if (base) return base
  const fromText =
    extractPlateLikeFromText(pickStr(a.description)) ||
    extractPlateLikeFromText(pickStr(a.message)) ||
    extractPlateLikeFromText(pickStr(p.description)) ||
    extractPlateLikeFromText(pickStr(p.message))
  return fromText
}

function timeScoreByDiffMinutes(diffMinutes: number): number {
  if (diffMinutes <= 5) return 1
  if (diffMinutes <= 15) return 0.7
  if (diffMinutes <= 30) return 0.4
  if (diffMinutes <= 60) return 0.2
  return 0
}

function inferLprMergeConfidence(score: number): LprMergeConfidence {
  if (score >= LPR_MERGE_HIGH_THRESHOLD) return 'HIGH'
  if (score >= LPR_MERGE_MEDIUM_THRESHOLD) return 'MEDIUM'
  if (score >= LPR_MERGE_LOW_THRESHOLD) return 'LOW'
  return 'NONE'
}

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

function parsePayloadRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown
      if (j && typeof j === 'object') return j as Record<string, unknown>
    } catch {
      return {}
    }
    return {}
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

function pickStr(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function getAlertPayload(a: RealAlertDto): Record<string, unknown> {
  return parsePayloadRecord(a.payload)
}

/** Código tal como en API; prioriza `alertCode`. */
function getAlertApiCode(a: RealAlertDto): string {
  const c = pickStr(a.alertCode) || pickStr(a.alertType) || pickStr(a.type)
  return c
}

/** Dispositivo efectivo: nivel raíz o dentro de payload. */
function getEffectiveAlertDeviceCode(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return (
    pickStr(a.deviceCode) ||
    pickStr(a.device) ||
    pickStr(p.deviceCode) ||
    pickStr(p.device) ||
    pickStr(p.cameraCode) ||
    '?'
  )
}

function getEffectiveAlertSectorCode(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return pickStr(a.sectorCode) || pickStr(a.sector) || pickStr(p.sectorCode) || pickStr(p.sector) || '?'
}

function alertOccurredAtIso(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return (
    pickStr(a.occurredAt) ||
    pickStr(a.createdAt) ||
    pickStr(a.recordedAt) ||
    pickStr(a.modifiedAt) ||
    pickStr(p.occurredAt) ||
    pickStr(p.createdAt) ||
    pickStr((p as { timestamp?: unknown }).timestamp) ||
    ''
  )
}

function isLprMalfunctionAlert(a: RealAlertDto): boolean {
  return getAlertApiCode(a).toUpperCase() === 'LPR_MALFUNCTION'
}

function flattenAlertForEtlCsv(a: RealAlertDto): Record<string, unknown> {
  const p = getAlertPayload(a)
  const deviceCode = getEffectiveAlertDeviceCode(a)
  const sectorCode = getEffectiveAlertSectorCode(a)
  const trailerPlate = pickStr(a.trailerPlate) || pickStr(p.trailerPlate)
  const truckPlate = pickStr(a.truckPlate) || pickStr(a.plate) || pickStr(p.truckPlate) || pickStr(p.plate)
  const payloadJson = Object.keys(p).length ? JSON.stringify(p) : ''

  return {
    id: a.id ?? '',
    version: pickStr(a.version),
    createdAt: pickStr(a.createdAt),
    modifiedAt: pickStr(a.modifiedAt),
    alertCode: getAlertApiCode(a),
    severity: pickStr(a.severity) ?? String(a.alertLevel ?? ''),
    status: pickStr(a.status),
    journeyUid: pickStr(a.journeyUid) || pickStr(a.journeyUuid) || pickStr(p.journeyUid) || pickStr(p.journeyUuid),
    truckPlate,
    trailerPlate,
    sectorCode,
    deviceCode,
    description:
      pickStr(a.description) ||
      pickStr(a.message) ||
      pickStr(a.reason) ||
      pickStr(p.description) ||
      pickStr(p.message),
    payload: payloadJson,
    payload_plate: pickStr(p.plate) || pickStr(p.truckPlate),
    payload_normalized_plate: pickStr(p.normalizedPlate) || pickStr(p.normalized_plate),
    payload_event_id: pickStr(p.eventId) || pickStr(p.event_id) || pickStr(p.id),
    payload_device_code: pickStr(p.deviceCode) || pickStr(p.device),
    camera_type: isEtlRearCameraDevice(deviceCode) ? 'rear' : 'front',
    occurredAt: alertOccurredAtIso(a),
  }
}

function parseLocalDateFromIsoMaybe(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

/** Número ISO de semana (lunes como inicio): YYYYWW */
function isoWeekMondayKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}W${String(weekNo).padStart(2, '0')}`
}

/** Franja horaria 4 horas etiquetada tipo 08–12 — hora LOCAL del cliente. */
function timeBucketFourHoursLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'unknown'
  const d = new Date(ts)
  const h = d.getHours()
  const bucket = Math.floor(h / 4) * 4
  const pad = (n: number) => String(n).padStart(2, '0')
  const endHour = bucket + 3
  return `${pad(bucket)}-${pad(endHour)}`
}

function dayNightLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'unknown'
  const h = new Date(ts).getHours()
  return h >= 7 && h < 19 ? 'dia' : 'noche'
}

function statusFromLprRate(events: number, lprAlerts: number): string {
  if (events <= 0 && lprAlerts > 0) return 'Sin base de eventos'
  if (events <= 0) return 'Sin eventos'
  const r = (lprAlerts / events) * 100
  if (r > 100) return 'Crítico'
  if (r >= 30 && r <= 100) return 'Alto'
  if (r > 10 && r < 30) return 'Medio'
  /** 0 a 10 inclusivo */
  return 'Bajo'
}

function distinctHas(seq: readonly string[], code: string): boolean {
  return new Set(seq.map((x) => String(x))).has(code)
}

function userCircuitTier(j: ReconstructedRealJourney): 'circuito_detectado' | 'circuito_incompleto' | 'sin_clasificar' {
  if (j.isDiscardedOperational) return 'circuito_incompleto'
  if (j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO') return 'sin_clasificar'
  return 'circuito_detectado'
}

function refinementLabel(j: ReconstructedRealJourney): string {
  const dr = new Set(j.logicalCodeSequence)
  const hasIngreso = dr.has('INGRESO')
  const hasPre = dr.has('PREINGRESO')
  const hasEgr = dr.has('EGRESO')
  const missing = j.missingExpectedPoints ?? []
  const missN = missing.length
  const tier = userCircuitTier(j)
  if (tier === 'sin_clasificar') return 'sin_clasificar'
  let tag = ''
  if (!hasIngreso && !hasPre && (hasEgr || dr.size >= 2)) tag = 'circuito_probable_sin_ingreso'
  else if (!hasEgr && (hasIngreso || hasPre)) tag = 'circuito_probable_sin_egreso'
  else if (missN >= 1 && missN <= 2) tag = 'circuito_probable'
  else if (missN > 2) tag = 'incompleto_revision'
  else tag = 'ok'

  if (journeyHasStrongDefiningPoint(j) && tag && tag !== 'ok') return `${tag}+punto_fuerte`
  return tag || '—'
}

export type EtlTransformInput = {
  events: RealJourneyEventDto[]
  alerts: RealAlertDto[]
  mergeWindowHours?: number
  loadedEventFilesCount: number
  loadedAlertFilesCount: number
  /** Catálogo manual (servicios, asociados, particulares). Si hay entradas activas, se excluyen de métricas. */
  plateRegistry?: TruckPlateRegistryDocument | null
  /** Archivos XLSX Movimientos por Contrato (opcional). */
  movimientosContratoFiles?: MovimientosContratoFileInput[]
  /** Planillas TiemposEntrePasos (balanza SL, opcional). */
  tiemposEntrePasosFiles?: import('./etlTiemposEntrePasos').TiemposEntrePasosFileInput[]
  /** Telemetría opcional Paso 3 (Contract-first). */
  onContractFirstProgress?: import('./etlContractFirstProgress').ContractFirstProgressCallback
}

export type EtlTransformOutput = {
  csv: Record<string, string>
  /** Fase 2: artefactos tipados. Las claves espejan las de csv. Opcional durante migración. */
  tables?: Record<string, import('../../../etl-core/typedTable').TypedTable>
  stats: {
    step1: {
      frontEvents: number
      rearEvents: number
      frontAlerts: number
      rearAlerts: number
      pctExcludedEvents: number
      deviceRearCounts: { device: string; count: number }[]
    }
    plateRegistry: {
      activeExclusionEntries: number
      eventsExcluded: number
      alertsExcluded: number
      uniquePlatesExcluded: number
    }
    step2: {
      rows: number
      camerasWithEvents: number
      camerasWithLpr: number
      criticalCameras: number
      sinBaseCameras: number
      totalLprMalfunctionAlerts: number
      lprMalfunctionByCamera: { deviceCode: string; count: number }[]
      cameraWithMostLpr: string | null
    }
    coherence: {
      ingreso_frontal_event_count: number
      ingreso_frontal_unique_plates: number
      ingreso_frontal_unique_journeys: number
      ingresos_operativos_count: number
      total_journeys_raw: number
      rear_only_journeys_excluded: number
      journeys_cycle_splits_applied: number
      journeys_after_rear_filter: number
      final_circuits_count: number
      final_classified_count: number
      final_incomplete_count: number
      final_circuitos_completos: number
      final_circuitos_probables: number
      final_circuitos_sin_ingreso: number
      final_circuitos_sin_egreso: number
      final_incompletos_revision: number
      final_descartados: number
      circuitos_con_ingreso_operativo: number
      circuitos_con_egreso_operativo: number
      circuitos_con_ingreso_y_egreso_operativo: number
      journey_vs_ingreso_ratio: number | null
      final_circuits_vs_ingreso_ratio: number | null
      journeyFragmentationWarn: boolean
      circuitsVersusIngresoWarn: boolean
      coherenceLabel: string
      coherenceDetail: string
      exclusionMotives: { motive: string; count: number }[]
    }
    step3: {
      journeysTotal: number
      journeysValidFront: number
      rearOnlyExcluded: number
      journeysWithRearEventsRemoved: number
      single_event_discarded: number
      duplicate_suspected: number
      incomplete_sequence_count: number
      classifiedCircuitsOperational: number
      incompleteOperational: number
      unclassifiedCount: number
      cleanJourneysCount: number
    }
    step4: {
      candidates: number
      candidatesBeforeCap: number
      byExactPlate: number
      bySimilarPlate: number
      bySequenceAndPlate: number
    }
    validation: {
      totalLprMalfunctionAlerts: number
      lprMalfunctionByCamera: { deviceCode: string; count: number }[]
      cameraWithMostLpr: string | null
      circuitosClasificados: number
      registrosIncompletosOperativos: number
      sinClasificar: number
      mergeCandidatesFiltered: number
      final_circuits_count: number
    }
    executive: {
      periodStart: string
      periodEnd: string
      eventCount: number
      alertCount: number
      completos: number
      incompletos: number
      anomalos: number
      deducidos: number
      validos: number
      probables: number
      journeysMergedApplied: number
      noEvaluables: number
      validComplete: number
      validDeduced: number
      lprAlerts: number
      operationalAlerts: number
      operationalAlertsCrossed: number
      journeysWithInvalidRoute: number
      journeysWithInvalidJourneyStart: number
      incompletosWithOperationalAlert: number
      anomalosWithOperationalAlert: number
      exportReady: boolean
      slFrontEvents: number
      slJourneysWithCorroboration: number
      slJourneysExecutiveReinforced: number
      committeeCompletos: number
      committeeVariaciones: number
      committeeAnomalias: number
    }
    segmentTiming?: SegmentTimingIndex | null
    circuitTiming?: CircuitTimingIndex | null
    kpiTiemposBuilt?: boolean
    movimientosContrato?: {
      enabled: boolean
      logs: string[]
      warnings: string[]
      filesRead: number
      rawCount: number
      normalizedCount: number
      withPlate: number
      withProduct: number
      withPlatform: number
      truckflowJourneys: number
      analysisReadyCount: number
      segmentScatterRows: number
      operationalSampleSelected: number
      merge: Record<string, unknown>
      excelFirst: Record<string, unknown>
      products: string[]
      platforms: string[]
      excelFirstScatterRows?: number
    }
  }
  rulesVersion: string
  /** Entrada para tramo 4 (KPI Tiempos); el contexto la guarda en ref y no la expone en estado. */
  kpiTiemposPrepared?: KpiTiemposBuildInput
}

function summarizeDeviceRear(events: RealJourneyEventDto[]) {
  const m = new Map<string, number>()
  for (const e of events) {
    if (!isEtlRearCameraDevice(e.deviceCode)) continue
    const k = (e.deviceCode ?? '').trim() || '?'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count)
}

function hydrateTramo1(s: Tramo1Serialized) {
  return {
    eventsForEtl: s.eventsForEtl as RealJourneyEventDto[],
    alertsForEtl: s.alertsForEtl as RealAlertDto[],
    plateRegistryStat: s.plateRegistryStat as EtlTransformOutput['stats']['plateRegistry'],
    plateRegistryExcludedCsv: String(s.plateRegistryExcludedCsv ?? ''),
    frontEv: s.frontEv as RealJourneyEventDto[],
    rearEv: s.rearEv as RealJourneyEventDto[],
    frontAl: s.frontAl as RealAlertDto[],
    rearAl: s.rearAl as RealAlertDto[],
    front_events_csv: String(s.front_events_csv ?? ''),
    rear_events_csv: String(s.rear_events_csv ?? ''),
    front_alerts_csv: String(s.front_alerts_csv ?? ''),
    rear_alerts_csv: String(s.rear_alerts_csv ?? ''),
    camera_lpr_status_csv: String(s.camera_lpr_status_csv ?? ''),
    step1Stat: s.step1Stat as EtlTransformOutput['stats']['step1'],
    step2Stat: s.step2Stat as EtlTransformOutput['stats']['step2'],
    slFrontEventsCount: Number(s.slFrontEventsCount ?? 0),
    totalLprMalfunctionAlerts: Number(s.totalLprMalfunctionAlerts ?? 0),
    lprMalfunctionByCamera: (s.lprMalfunctionByCamera ?? []) as { deviceCode: string; count: number }[],
    cameraWithMostLpr: (s.cameraWithMostLpr as string | null) ?? null,
    ingreso_frontal_event_count: Number(s.ingreso_frontal_event_count ?? 0),
    ingreso_frontal_unique_plates: Number(s.ingreso_frontal_unique_plates ?? 0),
    ingreso_frontal_unique_journeys: Number(s.ingreso_frontal_unique_journeys ?? 0),
    byJSize: Number(s.byJSize ?? 0),
    rear_only_journeys_excluded: Number(s.rear_only_journeys_excluded ?? 0),
    journeys_after_rear_filter: Number(s.journeys_after_rear_filter ?? 0),
    journeys_cycle_splits_applied: Number(s.journeys_cycle_splits_applied ?? 0),
    journeys: s.journeys as ReconstructedRealJourney[],
    journeyAuditByUid: new Map(s.journeyAuditEntries as [string, unknown][]),
    rear_only_journeys_debug_csv: String(s.rear_only_journeys_debug_csv ?? ''),
    cleanRows: (s.cleanRows ?? []) as Record<string, unknown>[],
    classifiedRows: (s.classifiedRows ?? []) as Record<string, unknown>[],
    unclassifiedRows: (s.unclassifiedRows ?? []) as Record<string, unknown>[],
    clean_journeys_csv: String(s.clean_journeys_csv ?? ''),
    classified_circuits_csv: String(s.classified_circuits_csv ?? ''),
    unclassified_journeys_csv: String(s.unclassified_journeys_csv ?? ''),
    reliabilityByUid: new Map((s.reliabilityEntries ?? []) as [string, number][]),
    classifiedOperationalCt: Number(s.classifiedOperationalCt ?? 0),
    incompleteOperationalCt: Number(s.incompleteOperationalCt ?? 0),
    unclassifiedCt: Number(s.unclassifiedCt ?? 0),
    journeysWithRearRemoved: Number(s.journeysWithRearRemoved ?? 0),
    operationalFrontEvents: (
      s.operationalFrontEvents ??
      (s.journeys as ReconstructedRealJourney[] | undefined)?.flatMap((j) => j.events) ??
      []
    ) as RealJourneyEventDto[],
  }
}

function buildPartialOutputTramo1(s: Tramo1Serialized): EtlTransformOutput {
  return {
    csv: {
      front_events: s.front_events_csv,
      rear_events: s.rear_events_csv,
      front_alerts: s.front_alerts_csv,
      rear_alerts: s.rear_alerts_csv,
      camera_lpr_status: s.camera_lpr_status_csv,
      clean_journeys: s.clean_journeys_csv,
      classified_circuits: s.classified_circuits_csv,
      unclassified_journeys: s.unclassified_journeys_csv,
      rear_only_journeys_debug: s.rear_only_journeys_debug_csv,
      plate_registry_excluded: s.plateRegistryExcludedCsv,
    },
    stats: {
      step1: s.step1Stat,
      plateRegistry: s.plateRegistryStat,
      step2: s.step2Stat,
      step3: {
        journeysTotal: s.journeys.length,
        journeysValidFront: s.journeys_after_rear_filter,
        rearOnlyExcluded: s.rear_only_journeys_excluded,
        journeysWithRearEventsRemoved: s.journeysWithRearRemoved,
        single_event_discarded: 0,
        duplicate_suspected: 0,
        incomplete_sequence_count: s.incompleteOperationalCt,
        classifiedCircuitsOperational: s.classifiedOperationalCt,
        incompleteOperational: s.incompleteOperationalCt,
        unclassifiedCount: s.unclassifiedCt,
        cleanJourneysCount: s.cleanRows.length,
      },
      step4: {
        candidates: 0,
        candidatesBeforeCap: 0,
        byExactPlate: 0,
        bySimilarPlate: 0,
        bySequenceAndPlate: 0,
      },
      coherence: {
        ingreso_frontal_event_count: Number(s.ingreso_frontal_event_count ?? 0),
        ingreso_frontal_unique_plates: Number(s.ingreso_frontal_unique_plates ?? 0),
        ingreso_frontal_unique_journeys: Number(s.ingreso_frontal_unique_journeys ?? 0),
        ingresos_operativos_count: 0,
        total_journeys_raw: Number(s.byJSize ?? 0),
        rear_only_journeys_excluded: Number(s.rear_only_journeys_excluded ?? 0),
        journeys_cycle_splits_applied: Number(s.journeys_cycle_splits_applied ?? 0),
        journeys_after_rear_filter: Number(s.journeys_after_rear_filter ?? 0),
        final_circuits_count: 0,
        final_classified_count: 0,
        final_incomplete_count: 0,
        final_circuitos_completos: 0,
        final_circuitos_probables: 0,
        final_circuitos_sin_ingreso: 0,
        final_circuitos_sin_egreso: 0,
        final_incompletos_revision: 0,
        final_descartados: 0,
        circuitos_con_ingreso_operativo: 0,
        circuitos_con_egreso_operativo: 0,
        circuitos_con_ingreso_y_egreso_operativo: 0,
        journey_vs_ingreso_ratio: null,
        final_circuits_vs_ingreso_ratio: null,
        journeyFragmentationWarn: false,
        circuitsVersusIngresoWarn: false,
        coherenceLabel: 'Pendiente tramo 2',
        coherenceDetail: 'Completá circuitos y comité (tramo 2).',
        exclusionMotives: [],
      },
      validation: {
        totalLprMalfunctionAlerts: Number(s.totalLprMalfunctionAlerts ?? 0),
        lprMalfunctionByCamera: (s.lprMalfunctionByCamera ?? []) as { deviceCode: string; count: number }[],
        cameraWithMostLpr: (s.cameraWithMostLpr as string | null) ?? null,
        circuitosClasificados: Number(s.classifiedOperationalCt ?? 0),
        registrosIncompletosOperativos: Number(s.incompleteOperationalCt ?? 0),
        sinClasificar: Number(s.unclassifiedCt ?? 0),
        mergeCandidatesFiltered: 0,
        final_circuits_count: 0,
      },
      executive: {
        periodStart: '',
        periodEnd: '',
        eventCount: (s.eventsForEtl as RealJourneyEventDto[]).length,
        alertCount: (s.alertsForEtl as RealAlertDto[]).length,
        completos: 0,
        incompletos: 0,
        anomalos: 0,
        deducidos: 0,
        validos: 0,
        probables: 0,
        journeysMergedApplied: 0,
        noEvaluables: 0,
        validComplete: 0,
        validDeduced: 0,
        lprAlerts: Number(s.totalLprMalfunctionAlerts ?? 0),
        operationalAlerts: 0,
        operationalAlertsCrossed: 0,
        journeysWithInvalidRoute: 0,
        journeysWithInvalidJourneyStart: 0,
        incompletosWithOperationalAlert: 0,
        anomalosWithOperationalAlert: 0,
        exportReady: false,
        slFrontEvents: Number(s.slFrontEventsCount ?? 0),
        slJourneysWithCorroboration: 0,
        slJourneysExecutiveReinforced: 0,
        committeeCompletos: 0,
        committeeVariaciones: 0,
        committeeAnomalias: 0,
      },
      kpiTiemposBuilt: false,
    },
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
  }
}

type Tramo1Serialized = Record<string, unknown>

export async function runEtlTransform(
  inp: EtlTransformInput,
  runOpts?: EtlTransformRunOptions
): Promise<EtlTransformOutput> {
  const phaseStore = runOpts?.phaseStore ?? createPhaseStore()
  const onlyTramo = runOpts?.onlyTramo
  const skipTramo1 = (onlyTramo === 2 || onlyTramo === 3) && phaseStore.tramo1 != null
  let tramo1: Tramo1Serialized | null = skipTramo1 ? (phaseStore.tramo1 as Tramo1Serialized) : null
  const profiler = runOpts?.profiler ?? createEtlProfiler()
  const emitDebugCsv = ETL_DEV_MODE || runOpts?.emitDebugCsv === true
  let profileAt = performance.now()

  if (onlyTramo === 1 && phaseStore.tramo1) {
    profiler.end()
    return buildPartialOutputTramo1(phaseStore.tramo1 as Tramo1Serialized)
  }

  await yieldToBrowser()

  if (!skipTramo1) {
  const evFiltered = filterEventsByPlateRegistry(inp.events, inp.plateRegistry)
  const alFiltered = filterAlertsByPlateRegistry(inp.alerts, inp.plateRegistry)
  const eventsForEtl = evFiltered.kept
  const alertsForEtl = alFiltered.kept
  const plateRegistryStat = {
    activeExclusionEntries:
      inp.plateRegistry?.entries.filter((e) => e.active && e.excludeFromAnalytics).length ?? 0,
    eventsExcluded: evFiltered.excluded.length,
    alertsExcluded: alFiltered.excluded.length,
    uniquePlatesExcluded: evFiltered.byPlate.size,
  }

  const registryLookup = buildRegistryLookup(inp.plateRegistry)
  const plateRegistryExcludedCsv =
    evFiltered.byPlate.size > 0 ?
      recordsToCsv(
        ['plate', 'category', 'category_label', 'events_excluded'],
        [...evFiltered.byPlate.entries()].map(([plate, count]) => {
          const entry = registryLookup.get(plate)
          const cat = entry?.category ?? 'prestador_servicio'
          return {
            plate,
            category: cat,
            category_label: TRUCK_PLATE_REGISTRY_CATEGORY_LABELS[cat],
            events_excluded: count,
          }
        })
      )
    : ''

  profileAt = etlProfileMark(profiler, 'plateRegistryFilter', profileAt)

  /** —— Paso 1 —— */
  const frontEv: RealJourneyEventDto[] = []
  const rearEv: RealJourneyEventDto[] = []
  for (const e of eventsForEtl) {
    if (isEtlRearCameraDevice(e.deviceCode)) rearEv.push(e)
    else frontEv.push(e)
  }
  const frontAl: RealAlertDto[] = []
  const rearAl: RealAlertDto[] = []
  for (const a of alertsForEtl) {
    const dev = getEffectiveAlertDeviceCode(a)
    const devTrim = dev === '?' ? '' : dev
    if (isEtlRearCameraDevice(devTrim)) rearAl.push(a)
    else frontAl.push(a)
  }

  const allEv = eventsForEtl.length
  const pctExcluded = allEv <= 0 ? 0 : Math.round((rearEv.length / allEv) * 1000) / 10

  let slFrontEventsCount = 0
  for (const e of frontEv) {
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    if (dev?.installed !== false && !dev?.rearExcluded) slFrontEventsCount++
  }

  const eventCols = [
    'id',
    'journeyUid',
    'sequenceNumber',
    'occurredAt',
    'truckPlate',
    'normalizedPlate',
    'isValidPlate',
    'sectorCode',
    'deviceCode',
    'eventType',
    'eventCategory',
  ] as const
  const evtRow = (e: RealJourneyEventDto) =>
    ({
      id: e.id,
      journeyUid: e.journeyUid,
      sequenceNumber: e.sequenceNumber,
      occurredAt: e.occurredAt,
      truckPlate: e.truckPlate,
      normalizedPlate: e.normalizedPlate,
      isValidPlate: e.isValidPlate,
      sectorCode: e.sectorCode,
      deviceCode: e.deviceCode,
      eventType: e.eventType,
      eventCategory: e.eventCategory,
    }) as Record<string, unknown>
  const front_events_csv = emitDebugCsv ? recordsToCsv([...eventCols], frontEv.map(evtRow)) : ''
  const rear_events_csv = emitDebugCsv ? recordsToCsv([...eventCols], rearEv.map(evtRow)) : ''

  const alertCols = [
    'id',
    'version',
    'createdAt',
    'modifiedAt',
    'alertCode',
    'severity',
    'status',
    'journeyUid',
    'truckPlate',
    'trailerPlate',
    'sectorCode',
    'deviceCode',
    'description',
    'payload',
    'payload_plate',
    'payload_normalized_plate',
    'payload_event_id',
    'payload_device_code',
    'camera_type',
    'occurredAt',
  ] as const
  const front_alerts_csv = emitDebugCsv ? recordsToCsv([...alertCols], frontAl.map(flattenAlertForEtlCsv)) : ''
  const rear_alerts_csv = emitDebugCsv ? recordsToCsv([...alertCols], rearAl.map(flattenAlertForEtlCsv)) : ''

  const totalLprMalfunctionAlerts = alertsForEtl.filter(isLprMalfunctionAlert).length
  const lprMalDeviceMap = new Map<string, number>()
  for (const a of alertsForEtl) {
    if (!isLprMalfunctionAlert(a)) continue
    const d = getEffectiveAlertDeviceCode(a)
    lprMalDeviceMap.set(d, (lprMalDeviceMap.get(d) ?? 0) + 1)
  }
  const lprMalfunctionByCamera = [...lprMalDeviceMap.entries()]
    .map(([deviceCode, count]) => ({ deviceCode, count }))
    .sort((a, b) => b.count - a.count)
  const cameraWithMostLpr = lprMalfunctionByCamera[0]?.deviceCode ?? null

  const step1Stat = {
    frontEvents: frontEv.length,
    rearEvents: rearEv.length,
    frontAlerts: frontAl.length,
    rearAlerts: rearAl.length,
    pctExcludedEvents: pctExcluded,
    deviceRearCounts: summarizeDeviceRear(eventsForEtl),
  }

  profileAt = etlProfileMark(profiler, 'splitFrontRear', profileAt)

  await yieldToBrowser()

  /** —— Paso 2 —— */
  type CamKey = string
  type CamAgg = {
    date: string
    week: string
    day_name: string
    time_bucket: string
    day_night: string
    deviceCode: string
    sectorCode: string
    camera_type: string
    event_count: number
    alert_count_total: number
    alert_lpr_count: number
    first_event_at: string
    last_event_at: string
    first_alert_at: string
    last_alert_at: string
  }

  const agg = new Map<CamKey, CamAgg>()

  function makeAggKey(iso: string, dev: string, sec: string, ctype: 'front' | 'rear'): CamKey {
    const ts = Date.parse(iso)
    const inst = Number.isNaN(ts) ? parseLocalDateFromIsoMaybe(iso) ?? new Date() : new Date(ts)
    const date = occurredAtLocalDayKey(iso)
    return [
      date,
      isoWeekMondayKey(inst),
      inst.toLocaleDateString('es-AR', { weekday: 'long' }),
      timeBucketFourHoursLabel(iso),
      dayNightLabel(iso),
      dev,
      sec,
      ctype,
    ].join('|')
  }

  function ensureKey(iso: string, dev: string, sec: string, ctype: 'front' | 'rear'): CamKey {
    const k = makeAggKey(iso, dev, sec, ctype)
    if (!agg.has(k)) {
      const ts = Date.parse(iso)
      const inst = Number.isNaN(ts) ? parseLocalDateFromIsoMaybe(iso) ?? new Date() : new Date(ts)
      const date = occurredAtLocalDayKey(iso)
      agg.set(k, {
        date,
        week: isoWeekMondayKey(inst),
        day_name: inst.toLocaleDateString('es-AR', { weekday: 'long' }),
        time_bucket: timeBucketFourHoursLabel(iso),
        day_night: dayNightLabel(iso),
        deviceCode: dev,
        sectorCode: sec,
        camera_type: ctype,
        event_count: 0,
        alert_count_total: 0,
        alert_lpr_count: 0,
        first_event_at: iso,
        last_event_at: iso,
        first_alert_at: iso,
        last_alert_at: iso,
      })
    }
    return k
  }
  for (const e of eventsForEtl) {
    const iso = String(e.occurredAt ?? '').trim()
    if (!iso) continue
    const dev = String(e.deviceCode ?? '').trim() || '?'
    const sec = String(e.sectorCode ?? '').trim() || '?'
    const ctype = isEtlRearCameraDevice(e.deviceCode) ? 'rear' : 'front'
    const k = ensureKey(iso, dev, sec, ctype)
    const row = agg.get(k)!
    row.event_count += 1
    if (!row.first_event_at || iso < row.first_event_at) row.first_event_at = iso
    if (!row.last_event_at || iso > row.last_event_at) row.last_event_at = iso
  }

  for (const a of alertsForEtl) {
    const iso = alertOccurredAtIso(a)
    if (!iso) continue
    const dev = getEffectiveAlertDeviceCode(a)
    const sec = getEffectiveAlertSectorCode(a)
    const ctype = isEtlRearCameraDevice(dev === '?' ? '' : dev) ? 'rear' : 'front'
    const k = ensureKey(iso, dev, sec, ctype)
    const row = agg.get(k)!
    row.alert_count_total += 1
    if (isLprMalfunctionAlert(a)) row.alert_lpr_count += 1
    if (!row.first_alert_at || iso < row.first_alert_at) row.first_alert_at = iso
    if (!row.last_alert_at || iso > row.last_alert_at) row.last_alert_at = iso
  }

  const camRowsArr = [...agg.values()].map((row) => {
    let lprPer100Disp: number | string = ''
    if (row.event_count > 0) {
      lprPer100Disp = Math.round((row.alert_lpr_count / row.event_count) * 100 * 1000) / 1000
    }
    const status = statusFromLprRate(row.event_count, row.alert_lpr_count)
    return {
      date: row.date,
      week: row.week,
      day_name: row.day_name,
      time_bucket: row.time_bucket,
      day_night: row.day_night,
      deviceCode: row.deviceCode,
      sectorCode: row.sectorCode,
      camera_type: row.camera_type,
      event_count: row.event_count,
      alert_count_total: row.alert_count_total,
      alert_lpr_count: row.alert_lpr_count,
      lpr_alerts_per_100_events: lprPer100Disp,
      first_event_at: row.first_event_at,
      last_event_at: row.last_event_at,
      first_alert_at: row.first_alert_at,
      last_alert_at: row.last_alert_at,
      status,
    } as Record<string, unknown>
  })

  const hdrCam = Object.keys(camRowsArr[0] ?? { date: '' })
  const camera_lpr_status_csv = emitDebugCsv ?
    recordsToCsv(hdrCam.length ? hdrCam : ['date'], camRowsArr)
  : ''

  let criticalCameras = 0
  let sinBase = 0
  for (const r of camRowsArr) {
    if (String(r.status) === 'Crítico') criticalCameras++
    if (String(r.status) === 'Sin base de eventos') sinBase++
  }
  const step2Stat = {
    rows: camRowsArr.length,
    camerasWithEvents: new Set(eventsForEtl.map((e) => (e.deviceCode ?? '').trim()).filter(Boolean)).size,
    camerasWithLpr: new Set(
      alertsForEtl.filter(isLprMalfunctionAlert).map((a) => getEffectiveAlertDeviceCode(a))
    ).size,
    criticalCameras,
    sinBaseCameras: sinBase,
    totalLprMalfunctionAlerts,
    lprMalfunctionByCamera,
    cameraWithMostLpr,
  }

  profileAt = etlProfileMark(profiler, 'cameraAggregates', profileAt)

  await yieldToBrowser()

  /** —— Paso 3 — filtros traseros + reconstrucción sólo con lecturas frontales permitidas —— */
  const ingreso_frontal_events = eventsForEtl.filter(isIngresoFrontalReferenceEvent)
  const ingreso_frontal_event_count = ingreso_frontal_events.length
  const ingresoPlateSet = new Set(
    ingreso_frontal_events
      .map((e) => normalizePlateStrict(String(e.normalizedPlate ?? e.truckPlate ?? '')))
      .filter((p) => p.length > 0)
  )
  const ingresoJourneyUidSet = new Set(
    ingreso_frontal_events.map((e) => String(e.journeyUid ?? '').trim()).filter(Boolean)
  )
  const ingreso_frontal_unique_plates = ingresoPlateSet.size
  const ingreso_frontal_unique_journeys = ingresoJourneyUidSet.size

  const byJ = new Map<string, RealJourneyEventDto[]>()
  for (const e of eventsForEtl) {
    const uid = String(e.journeyUid ?? '').trim()
    if (!uid) continue
    if (!byJ.has(uid)) byJ.set(uid, [])
    byJ.get(uid)!.push(e)
  }

  type JourneyAuditMeta = {
    uid: string
    total_event_count: number
    front_event_count: number
    rear_event_count: number
    rear_event_ratio: number
    has_front_events: boolean
    has_rear_events: boolean
    devices: string
    logical_sequence_before_rear_removed: string
    rear_events_removed: boolean
  }

  let rear_only_journeys_excluded = 0
  const operationalFrontEvents: RealJourneyEventDto[] = []
  const rearOnlyDebugRows: Record<string, unknown>[] = []
  const journeyAuditByUid = new Map<string, JourneyAuditMeta>()

  function devicesJoined(group: readonly RealJourneyEventDto[]): string {
    const codes = [...new Set(group.map((e) => String(e.deviceCode ?? '').trim()).filter(Boolean))]
    return codes.sort().join('|')
  }

  function logicalSeqFromRawEvents(group: readonly RealJourneyEventDto[]): string {
    const sorted = [...group].sort(compareRealEvents)
    const collapsed = collapseConsecutiveEqual(sorted.map((e) => normalizeRealEventPoint(e).logicalCode))
    return collapsed.join('>')
  }

  for (const [, groupRaw] of byJ) {
    const uid = String(groupRaw[0]?.journeyUid ?? '').trim()
    let frontCt = 0
    let rearCt = 0
    for (const e of groupRaw) {
      if (isEtlRearCameraDevice(e.deviceCode)) rearCt++
      else frontCt++
    }
    const total = groupRaw.length
    const ratio = total > 0 ? rearCt / total : 0
    const hasFront = frontCt > 0
    const hasRear = rearCt > 0

    if (rearCt > 0 && !hasFront) {
      rear_only_journeys_excluded++
      rearOnlyDebugRows.push({
        journey_uid: uid,
        total_event_count: total,
        front_event_count: frontCt,
        rear_event_count: rearCt,
        rear_event_ratio: Math.round(ratio * 10000) / 10000,
        has_front_events: false,
        has_rear_events: true,
        devices: devicesJoined(groupRaw),
        logical_sequence: logicalSeqFromRawEvents(groupRaw),
        exclusion_reason: 'rear_only_journey',
      })
      continue
    }

    const rear_events_removed = hasFront && hasRear

    journeyAuditByUid.set(uid, {
      uid,
      total_event_count: total,
      front_event_count: frontCt,
      rear_event_count: rearCt,
      rear_event_ratio: Math.round(ratio * 10000) / 10000,
      has_front_events: hasFront,
      has_rear_events: hasRear,
      devices: devicesJoined(groupRaw),
      logical_sequence_before_rear_removed: logicalSeqFromRawEvents(groupRaw),
      rear_events_removed,
    })

    if (rear_events_removed) {
      for (const e of groupRaw) {
        if (!isEtlRearCameraDevice(e.deviceCode)) operationalFrontEvents.push(e)
      }
    } else {
      operationalFrontEvents.push(...groupRaw)
    }
  }

  const cycleSplit = applyJourneyCycleSplitsToEvents(operationalFrontEvents)
  const journeys = reconstructRealJourneysIncludingInvalidPlates(cycleSplit.events)
  const journeys_after_rear_filter = journeys.length
  const journeys_cycle_splits_applied = cycleSplit.splitsApplied

  const rear_only_journeys_debug_csv =
    rearOnlyDebugRows.length ?
      recordsToCsv(Object.keys(rearOnlyDebugRows[0]), rearOnlyDebugRows)
    : 'journey_uid,exclusion_reason\n'

  const cleanRows: Record<string, unknown>[] = []
  const classifiedRows: Record<string, unknown>[] = []
  const unclassifiedRows: Record<string, unknown>[] = []

  const reliabilityByUid = new Map<string, number>()
  let classifiedOperationalCt = 0
  let incompleteOperationalCt = 0
  let unclassifiedCt = 0
  let journeysWithRearRemoved = 0

  for (const j of journeys) {
    const audit = journeyAuditByUid.get(j.journeyUid)
    const seqPack = journeyDeviceSectorLogical(j)
    if (audit?.rear_events_removed) journeysWithRearRemoved++

    const baseClean = {
      journey_uid: j.journeyUid,
      truck_plate: j.plate,
      normalized_plate: j.normalizedPlate,
      first_event_at: j.startedAt,
      last_event_at: j.endedAt,
      duration_minutes: j.durationMinutes,
      total_event_count_raw_uid: audit?.total_event_count ?? j.eventCount,
      event_count_front_reconstruction_only: j.eventCount,
      front_event_count_reconstruction: seqPack.frontEventCount,
      rear_event_count_historical: audit?.rear_event_count ?? seqPack.rearEventCount,
      rear_event_ratio_historical: audit?.rear_event_ratio ?? '',
      has_front_events: seqPack.frontEventCount > 0,
      /** histórico: había lecturas en cámaras excluídas antes de limpiar */
      has_rear_events_historical: audit?.has_rear_events ?? false,
      rear_only_excluded: false,
      rear_events_removed: audit?.rear_events_removed ?? false,
      devices_union_audit: audit?.devices ?? '',
      device_sequence_front: seqPack.deviceSequence,
      sector_sequence_front: seqPack.sectorSequence,
      logical_sequence_front: seqPack.logicalSequence,
      logical_sequence_before_rear_removed: audit?.logical_sequence_before_rear_removed ?? '',
      starts_at_valid_entry: seqPack.startsAtValidEntry,
      ends_at_valid_exit: seqPack.endsAtValidExit,
      preliminary_code: j.preliminaryCircuitCode,
      preliminary_name: j.preliminaryCircuitName,
      preliminary_confidence: j.preliminaryCircuitConfidence,
    }
    cleanRows.push(baseClean)

    const relPack = computeJourneyReliability(j)
    const tier = userCircuitTier(j)
    const refinement_note = refinementLabel(j)

    reliabilityByUid.set(j.journeyUid, relPack.reliability_score)

    const clsRow = {
      ...baseClean,
      tier_circuit_user: tier,
      circuit_classification: tier,
      refinement_note,
      reliability_score: relPack.reliability_score,
      reliability_explanation: relPack.reliability_explanation,
      expected_points_count: relPack.expected_points_count,
      matched_points_count: relPack.matched_points_count,
      missing_points_count: relPack.missing_points_count,
      extra_points_hint: '',
      missing_expected_points_join: (j.missingExpectedPoints ?? []).join('|'),
      is_discarded_operational: j.isDiscardedOperational,
    }

    if (tier === 'sin_clasificar') {
      unclassifiedCt++
      unclassifiedRows.push(clsRow)
    } else {
      classifiedRows.push(clsRow)
      if (tier === 'circuito_detectado') classifiedOperationalCt++
      else incompleteOperationalCt++
    }
  }

  const cleanCsvHeaders = Object.keys(cleanRows[0] ?? { journey_uid: '' })
  const clean_journeys_csv =
    recordsToCsv(cleanCsvHeaders.length ? cleanCsvHeaders : ['journey_uid'], cleanRows)

  const classified_circuits_csv =
    classifiedRows.length ?
      recordsToCsv(Object.keys(classifiedRows[0]), classifiedRows)
    : 'journey_uid\n'

  const unclassified_journeys_csv =
    unclassifiedRows.length ?
      recordsToCsv(Object.keys(unclassifiedRows[0]), unclassifiedRows)
    : 'journey_uid\n'

  tramo1 = {
    eventsForEtl,
    alertsForEtl,
    plateRegistryStat,
    plateRegistryExcludedCsv,
    frontEv,
    rearEv,
    frontAl,
    rearAl,
    front_events_csv,
    rear_events_csv,
    front_alerts_csv,
    rear_alerts_csv,
    camera_lpr_status_csv,
    step1Stat,
    step2Stat,
    slFrontEventsCount,
    totalLprMalfunctionAlerts,
    lprMalfunctionByCamera,
    cameraWithMostLpr,
    ingreso_frontal_event_count,
    ingreso_frontal_unique_plates,
    ingreso_frontal_unique_journeys,
    byJSize: byJ.size,
    rear_only_journeys_excluded,
    journeys_after_rear_filter,
    journeys_cycle_splits_applied,
    journeys,
    journeyAuditEntries: [...journeyAuditByUid.entries()],
    rear_only_journeys_debug_csv,
    cleanRows,
    classifiedRows,
    unclassifiedRows,
    clean_journeys_csv,
    classified_circuits_csv,
    unclassified_journeys_csv,
    reliabilityEntries: [...reliabilityByUid.entries()],
    classifiedOperationalCt,
    incompleteOperationalCt,
    unclassifiedCt,
    journeysWithRearRemoved,
    operationalFrontEvents,
  }
  phaseStore.tramo1 = tramo1
  phaseStore.tramoCompleted = 1
  profileAt = etlProfileMark(profiler, 'reconstructJourneys', profileAt)
  if (onlyTramo === 1) {
    profiler.end()
    return buildPartialOutputTramo1(tramo1)
  }
  }

  const t1 = hydrateTramo1((skipTramo1 ? phaseStore.tramo1 : tramo1)! as Tramo1Serialized)
  const eventsForEtl = t1.eventsForEtl
  const alertsForEtl = t1.alertsForEtl
  const plateRegistryStat = t1.plateRegistryStat
  const plateRegistryExcludedCsv = t1.plateRegistryExcludedCsv
  const frontEv = t1.frontEv
  const rearEv = t1.rearEv
  const frontAl = t1.frontAl
  const rearAl = t1.rearAl
  const front_events_csv = t1.front_events_csv
  const rear_events_csv = t1.rear_events_csv
  const front_alerts_csv = t1.front_alerts_csv
  const rear_alerts_csv = t1.rear_alerts_csv
  const camera_lpr_status_csv = t1.camera_lpr_status_csv
  const step1Stat = t1.step1Stat
  const step2Stat = t1.step2Stat
  const slFrontEventsCount = t1.slFrontEventsCount
  const totalLprMalfunctionAlerts = t1.totalLprMalfunctionAlerts
  const lprMalfunctionByCamera = t1.lprMalfunctionByCamera
  const cameraWithMostLpr = t1.cameraWithMostLpr
  const ingreso_frontal_event_count = t1.ingreso_frontal_event_count
  const ingreso_frontal_unique_plates = t1.ingreso_frontal_unique_plates
  const ingreso_frontal_unique_journeys = t1.ingreso_frontal_unique_journeys
  const rear_only_journeys_excluded = t1.rear_only_journeys_excluded
  const journeys_after_rear_filter = t1.journeys_after_rear_filter
  const journeys_cycle_splits_applied = t1.journeys_cycle_splits_applied
  const journeys = t1.journeys
  const journeyAuditByUid = t1.journeyAuditByUid
  const rear_only_journeys_debug_csv = t1.rear_only_journeys_debug_csv
  const cleanRows = t1.cleanRows
  const classifiedRows = t1.classifiedRows
  const unclassifiedRows = t1.unclassifiedRows
  const clean_journeys_csv = t1.clean_journeys_csv
  const classified_circuits_csv = t1.classified_circuits_csv
  const unclassified_journeys_csv = t1.unclassified_journeys_csv
  const reliabilityByUid = t1.reliabilityByUid
  const classifiedOperationalCt = t1.classifiedOperationalCt
  const incompleteOperationalCt = t1.incompleteOperationalCt
  const unclassifiedCt = t1.unclassifiedCt
  const journeysWithRearRemoved = t1.journeysWithRearRemoved
  const operationalFrontEvents = t1.operationalFrontEvents
  const byJ = { size: t1.byJSize }

  await yieldToBrowser()

  if (inp.movimientosContratoFiles?.length && !phaseStore.contractIntegration) {
    const prep = buildContractPrepFromTramo1Serialized(
      (phaseStore.tramo1 ?? tramo1)! as import('./etlTransformContractFirst').Tramo1SerializedLike
    )
    phaseStore.tramo2Prep = prep
    phaseStore.contractIntegration = await runContractFirstIntegration(
      inp,
      prep,
      phaseStore.excelStep?.normalized
    )
  }

  /** —— Paso 4 merge sugerencias —— */
  function sequencesComplementary(sa: string, sb: string): boolean {
    if (!sa || !sb) return false
    const A = sa.split('>').slice(0, 8)
    const B = sb.split('>').slice(0, 8)
    if (!A.length || !B.length) return false
    const set = new Set(B)
    let hits = 0
    for (const token of A) if (set.has(token)) hits++
    return hits >= 1 || A[0] === B[B.length - 1] || A[A.length - 1] === B[0]
  }

  type MatchTypeMerge = 'exact_plate' | 'similar_plate' | 'sequence_and_plate'

  type MergeCand = {
    a: ReconstructedRealJourney
    b: ReconstructedRealJourney
    similarity: number
    gapMinutes: number
    match_type: MatchTypeMerge
    should_review: boolean
    priority: 'alta' | 'media' | 'baja'
    plateSimilarity: number
  }

  function journeyGapMinutes(a: ReconstructedRealJourney, b: ReconstructedRealJourney): number {
    const a0 = new Date(a.startedAt).getTime()
    const a1 = new Date(a.endedAt).getTime()
    const b0 = new Date(b.startedAt).getTime()
    const b1 = new Date(b.endedAt).getTime()
    if ([a0, a1, b0, b1].some((x) => Number.isNaN(x))) return 1e9
    if (a1 < b0) return (b0 - a1) / 60000
    if (b1 < a0) return (a0 - b1) / 60000
    return 0
  }

  function plateExactNormalized(a: string, b: string): boolean {
    const na = normalizePlateStrict(a)
    const nb = normalizePlateStrict(b)
    return na.length > 0 && na === nb
  }

  const list = journeys
  /** Cap bajo para evitar O(n²) > ~1.2M comparaciones (bloquea UI varios minutos). */
  const cap = Math.min(list.length, 1600)

  const seqCache = new Map<string, ReturnType<typeof journeyDeviceSectorLogical>>()
  function seqFor(j: ReconstructedRealJourney) {
    let s = seqCache.get(j.journeyUid)
    if (!s) {
      s = journeyDeviceSectorLogical(j)
      seqCache.set(j.journeyUid, s)
    }
    return s
  }

  const rawMerge: MergeCand[] = []

  for (let i = 0; i < cap; i++) {
    if (i > 0 && i % 20 === 0) await yieldToBrowser()
    for (let j = i + 1; j < cap; j++) {
      const ja = list[i]
      const jb = list[j]
      const gapMin = journeyGapMinutes(ja, jb)
      if (gapMin > EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES) continue

      const pa = ja.normalizedPlate || ''
      const pb = jb.normalizedPlate || ''
      if (!normalizePlateStrict(pa) && !normalizePlateStrict(pb)) continue

      const sa = seqFor(ja).logicalSequence
      const sb = seqFor(jb).logicalSequence
      const seqOk = sequencesComplementary(sa, sb)
      const exact = plateExactNormalized(pa, pb)
      const sim = plateSimilarityScore(pa, pb)
      const similarEnough = sim >= MERGE_SIMILAR_THRESHOLD

      /** A/B siempre tienen gap ≤ ventana y patente igual o muy similar; nunca sólo por secuencia sin patente cercana */
      const plateOk = exact || similarEnough
      if (!plateOk) continue

      let match_type: MatchTypeMerge
      if (exact) match_type = 'exact_plate'
      else if (seqOk) match_type = 'sequence_and_plate'
      else match_type = 'similar_plate'

      let priority: 'alta' | 'media' | 'baja'
      if (exact && gapMin <= EXECUTIVE_MERGE_AUTO_GAP_MINUTES) priority = 'alta'
      else if (exact) priority = 'media'
      else if (
        seqOk &&
        similarEnough &&
        sim >= EXECUTIVE_MERGE_OCR_AUTO_SIM &&
        gapMin <= EXECUTIVE_MERGE_AUTO_GAP_MINUTES
      ) {
        priority = 'alta'
      } else if (similarEnough && sim >= EXECUTIVE_MERGE_OCR_AUTO_SIM) priority = 'media'
      else if (similarEnough || match_type === 'sequence_and_plate') priority = 'media'
      else priority = 'baja'

      const exactAuto = exact && gapMin <= EXECUTIVE_MERGE_AUTO_GAP_MINUTES
      const ocrSeqAuto =
        !exact &&
        seqOk &&
        similarEnough &&
        sim >= EXECUTIVE_MERGE_OCR_AUTO_SIM &&
        gapMin <= EXECUTIVE_MERGE_AUTO_GAP_MINUTES
      const should_review = !(exactAuto || ocrSeqAuto)

      rawMerge.push({
        a: ja,
        b: jb,
        similarity: exact ? 1 : Math.round(sim * 1000) / 1000,
        gapMinutes: Math.round(gapMin),
        match_type,
        should_review,
        priority,
        plateSimilarity: exact ? 1 : Math.round(sim * 1000) / 1000,
      })
    }
  }
  await yieldToBrowser()

  function mergeReliability(c: MergeCand): number {
    const ra = reliabilityByUid.get(c.a.journeyUid)
    const rb = reliabilityByUid.get(c.b.journeyUid)
    if (ra != null && rb != null) return Math.min(ra, rb)

    const r = ra ?? rb ?? 0
    return r
  }

  rawMerge.sort((u, v) => {
    if (v.similarity !== u.similarity) return v.similarity - u.similarity
    if (u.gapMinutes !== v.gapMinutes) return u.gapMinutes - v.gapMinutes
    return mergeReliability(v) - mergeReliability(u)
  })

  const candidatesBeforeCap = rawMerge.length
  const mergeTop = rawMerge.slice(0, MERGE_TOP_LIMIT)

  const mergePack = applyExecutiveJourneyMerges(journeys, mergeTop)
  const journeysForExecutive = mergePack.journeys
  const journeys_merged_applied = mergePack.mergeAppliedCount

  profileAt = etlProfileMark(profiler, 'executiveJourneyMerge', profileAt)

  /** UIDs absorbidos por merge automático (exacto u OCR+secuencia). */
  const mergeHighConfidenceUids = new Set(mergePack.suppressedSourceUids)

  let single_event_discarded = 0
  for (const mj of journeys) {
    if (mj.eventCount !== 1) continue
    if (mergeHighConfidenceUids.has(mj.journeyUid)) continue
    single_event_discarded++
  }

  const dayPlateToUids = new Map<string, Set<string>>()
  for (const mj of journeys) {
    const p = normalizePlateStrict(mj.normalizedPlate)
    const day = occurredAtLocalDayKey(mj.startedAt)
    if (!p || !day) continue
    const k = `${p}|${day}`
    if (!dayPlateToUids.has(k)) dayPlateToUids.set(k, new Set())
    dayPlateToUids.get(k)!.add(mj.journeyUid)
  }
  let duplicate_suspected = 0
  let duplicate_severe_excluded = 0
  for (const mj of journeys) {
    const p = normalizePlateStrict(mj.normalizedPlate)
    const day = occurredAtLocalDayKey(mj.startedAt)
    if (!p || !day) continue
    const nUid = dayPlateToUids.get(`${p}|${day}`)?.size ?? 0
    if (nUid > 1) duplicate_suspected++
    if (nUid >= 3) duplicate_severe_excluded++
  }

  function duplicateSeverityFor(j: ReconstructedRealJourney): 'none' | 'moderate' | 'severe' {
    const p = normalizePlateStrict(j.normalizedPlate)
    const day = occurredAtLocalDayKey(j.startedAt)
    if (!p || !day) return 'none'
    const nUid = dayPlateToUids.get(`${p}|${day}`)?.size ?? 0
    if (nUid >= 3) return 'severe'
    if (nUid > 1) return 'moderate'
    return 'none'
  }

  function journeyPassesFinalFilter(j: ReconstructedRealJourney): boolean {
    const tier = userCircuitTier(j)
    if (tier === 'sin_clasificar') return false
    if (duplicateSeverityFor(j) === 'severe') return false
    const nFront = j.eventCount
    if (nFront >= 2) return true
    if (nFront === 1) return mergeHighConfidenceUids.has(j.journeyUid)
    return false
  }

  function journeyIngresoFrontCount(j: ReconstructedRealJourney): number {
    let c = 0
    for (const ev of j.events) {
      if (isIngresoFrontalReferenceEvent(ev)) c++
    }
    return c
  }

  function pickDataQualityFlag(
    j: ReconstructedRealJourney,
    tier: ReturnType<typeof userCircuitTier>,
    suspiciousDup: boolean,
    mergedFragment: boolean
  ): string {
    const parts: string[] = []
    const ingresoN = journeyIngresoFrontCount(j)

    if (mergedFragment) parts.push('merged_fragment')
    if (journeyAuditByUid.get(j.journeyUid)?.rear_events_removed) parts.push('rear_events_removed')
    if (suspiciousDup) parts.push('suspicious_duplicate')
    if (ingresoN <= 0) parts.push('missing_ingreso_frontal')
    if (tier === 'circuito_incompleto') parts.push('incomplete_sequence')

    const uniq = [...new Set(parts)]
    if (!uniq.length) return 'ok'
    if (uniq.length === 1) return uniq[0]
    return uniq.sort().join('+')
  }

  const finalCsvRows: Record<string, unknown>[] = []
  const debugMatrixRows: Record<string, unknown>[] = []
  const journeyMatrixByUid = new Map<
    string,
    {
      matrixFinalStatus: 'COMPLETO' | 'INCOMPLETO' | 'DEDUCIDO' | 'ANOMALO'
      matrixReason: string
      matrixConfidence: number
      sequenceRespected: boolean
      legacyFinalStatus: string
      executiveBucket: 'COMPLETO' | 'INCOMPLETO' | 'ANOMALO' | 'DEDUCIDO'
      executiveStatus: 'VALIDO' | 'PROBABLE' | 'INCOMPLETO' | 'ANOMALO' | 'NO_EVALUABLE'
      executiveReason: string
      validDetail: string
      coveragePercent: number
      hasStrongPoint: boolean
      enabledForClassification: boolean
      sequenceConfigured: boolean
      usefulEventsCount: number
    }
  >()
  let final_classified_count = 0
  let final_incomplete_count = 0
  let final_circuitos_completos = 0
  let final_circuitos_probables = 0
  let final_circuitos_sin_ingreso = 0
  let final_circuitos_sin_egreso = 0
  let final_incompletos_revision = 0
  let final_descartados_en_csv = 0
  let circuitos_con_ingreso_operativo = 0
  let circuitos_con_egreso_operativo = 0
  let circuitos_con_ingreso_y_egreso_operativo = 0

  let executiveCompletos = 0
  let executiveIncompletos = 0
  let executiveAnomalos = 0
  let executiveDeducidos = 0
  let executiveValidos = 0
  let executiveProbables = 0
  let executiveStatusIncompletos = 0
  let executiveStatusAnomalos = 0
  let executiveNoEvaluables = 0
  let executiveValidComplete = 0
  let executiveValidDeduced = 0
  let executiveNonEvaluableByCoverage = 0
  let executiveNonEvaluableMissingSequence = 0
  let executiveAnomalousNoRespetaSecuencia = 0
  let validR7Journeys = 0
  let validSlInternalJourneys = 0
  let transileExternalJourneys = 0
  let anomaliesRicardone = 0
  let anomaliesSanLorenzo = 0
  let anomaliesMixto = 0

  let slJourneysWithCorroboration = 0
  let slJourneysExecutiveReinforced = 0

  let committeeCompletos = 0
  let committeeVariaciones = 0
  let committeeAnomalias = 0

  const classifiedForSegmentTiming: ClassifiedJourneyForTiming[] = []

  let ingresos_operativos_count = 0
  for (const mj of journeysForExecutive) {
    const logicals = new Set(mj.logicalCodeSequence.map((x) => String(x)))
    if (resolveOperationalEntry(logicals).has_operational_entry) ingresos_operativos_count++
  }

  const journeyMetaByUid = new Map<string, JourneyMetaForAlertMatch>()
  for (const mjInit of journeysForExecutive) {
    journeyMetaByUid.set(mjInit.journeyUid, {
      journeyUid: mjInit.journeyUid,
      normalizedPlate: mjInit.normalizedPlate,
      startedAt: mjInit.startedAt,
      endedAt: mjInit.endedAt,
      preliminaryCircuitCode: mjInit.preliminaryCircuitCode,
      executiveBucket: '',
    })
  }

  const operationalAlertsSansLpr = frontAl.filter((a) => !isLprMalfunctionAlert(a))
  const eventsByJourneyOperational = indexEventsByJourney(operationalFrontEvents)

  const operationalAlertsMatchAccumulator = accumulateOperationalAlertsMatch({
    operationalAlerts: operationalAlertsSansLpr,
    journeys: journeysForExecutive,
    eventsByJourney: eventsByJourneyOperational,
    journeyMetaByUid,
    read: {
      alertCode: getAlertApiCode,
      alertId: (a) => pickStr(a.id) || pickStr((a as { alertId?: unknown }).alertId),
      journeyUid: (a) =>
        pickStr(a.journeyUid) ||
        pickStr(a.journeyUuid) ||
        pickStr(getAlertPayload(a).journeyUid) ||
        pickStr(getAlertPayload(a).journeyUuid),
      truckPlate: (a) =>
        pickStr(a.truckPlate) || pickStr(a.plate) || pickStr(getAlertPayload(a).truckPlate) || pickStr(getAlertPayload(a).plate),
      deviceCode: getEffectiveAlertDeviceCode,
      sectorCode: getEffectiveAlertSectorCode,
      severity: (a) => pickStr(a.severity) ?? String(a.alertLevel ?? ''),
      status: (a) => pickStr(a.status),
      occurredAt: alertOccurredAtIso,
      createdAt: (a) => pickStr(a.createdAt),
    },
  })

  profileAt = etlProfileMark(profiler, 'operationalAlertsMatch', profileAt)

  const execSeqCache = new Map<string, ReturnType<typeof journeyDeviceSectorLogical>>()
  const execCollapsedCache = new Map<string, string[]>()

  let executiveJourneyPass = 0
  for (const mj of journeysForExecutive) {
    if (++executiveJourneyPass % 40 === 0) await yieldToBrowser()
    const tier = userCircuitTier(mj)
    const audit = journeyAuditByUid.get(mj.journeyUid)
    let seqPack = execSeqCache.get(mj.journeyUid)
    if (!seqPack) {
      seqPack = journeyDeviceSectorLogical(mj)
      execSeqCache.set(mj.journeyUid, seqPack)
    }
    const dupSev = duplicateSeverityFor(mj)
    const dupSus = dupSev !== 'none'
    const mergedFrag =
      mj.journeyUid.startsWith('merged_') ||
      mergePack.mergedUidBySource.has(mj.journeyUid) ||
      (mj.eventCount === 1 && mergeHighConfidenceUids.has(mj.journeyUid))

    const ingresoN = journeyIngresoFrontCount(mj)
    const hasIngresoFrontal = ingresoN > 0
    const relPack = computeJourneyReliability(mj)
    const rel = reliabilityByUid.get(mj.journeyUid) ?? relPack.reliability_score
    let collapsedLogical = execCollapsedCache.get(mj.journeyUid)
    if (!collapsedLogical) {
      collapsedLogical = getCollapsedLogicalCodes(mj)
      execCollapsedCache.set(mj.journeyUid, collapsedLogical)
    }
    const logicals = new Set(collapsedLogical)
    const entry = resolveOperationalEntry(logicals)
    const exit = resolveOperationalExit(logicals, journeyHasRicB2EgresoDevice(mj))
    const strong = journeyHasStrongDefiningPoint(mj)
    const balanzaCompleta = journeyHasBalansaCompleta(mj)
    const sequenceCoherent = journeySequenceCoherent(mj, seqPack)
    const confidence_level = confidenceLevelFromScore(
      rel,
      journeyHasStrongConfidenceBonus(mj)
    )

    const flexPreliminaryOverride =
      journeyMeetsFlexibleInstrumentedDischargeRule(mj) ?
        resolveFlexibleDischargePreliminaryCode(mj)
      : null

    let matrixClassification = classifyJourneyAgainstCircuitMatrix(mj, DEFAULT_CIRCUIT_MATRIX, {
      preliminaryCodeOverride: flexPreliminaryOverride ?? undefined,
    })
    let technicalCircuitCode =
      matrixClassification.matchedCircuitCode ?? flexPreliminaryOverride ?? mj.preliminaryCircuitCode
    const executiveCircuitConfig = resolveExecutiveCircuitConfigForJourney(mj, technicalCircuitCode)
    const technicalOverride =
      executiveCircuitConfig ?
        resolveTechnicalCircuitCodeForExecutive(mj, executiveCircuitConfig.code)
      : null
    if (technicalOverride && technicalOverride !== technicalCircuitCode) {
      matrixClassification = classifyJourneyAgainstCircuitMatrix(mj, DEFAULT_CIRCUIT_MATRIX, {
        preliminaryCodeOverride: technicalOverride,
      })
      technicalCircuitCode = technicalOverride
    }
    const executiveCircuitCode = executiveCircuitConfig?.code ?? ''
    const matrixExpectedPoints =
      matrixClassification.matchedCircuitCode ?
        (DEFAULT_CIRCUIT_MATRIX[matrixClassification.matchedCircuitCode]?.length ?? 0)
      : 0
    const matrixMatchedPoints = Math.max(0, matrixExpectedPoints - matrixClassification.missingPoints.length)
    const slSupport = snapshotSanLorenzoSupport(mj)
    const isRicSlzRoute =
      isRicSanLorenzoRouteCircuit(executiveCircuitCode) ||
      isRicSanLorenzoRouteCircuit(technicalCircuitCode) ||
      mj.preliminaryCircuitCode === 'CIRCUITO_SAN_LORENZO' ||
      journeyIsRicSanLorenzoRouteEvidence(mj)
    const sequenceConfigured = isExecutiveSequenceConfigured(executiveCircuitConfig)
    const coveragePercent = executiveCircuitConfig?.coveragePercent ?? 0
    let hasStrongPoint =
      executiveCircuitConfig?.code === 'R8' || executiveCircuitConfig?.code === 'R16' ?
        journeyHasLiquidStrongPoint(mj)
      : executiveCircuitConfig?.hasStrongPoint === true || strong
    if (isRicSlzRoute && journeyHasSlIngresoEvidence(mj)) {
      hasStrongPoint = true
    }
    const enabledForClassification = executiveCircuitConfig?.enabledForClassification === true
    const executiveCircuitLabel = executiveCircuitConfig?.label ?? ''
    const deducedStrongEvidence = journeyHasDeducedStrongEvidence({
      journey: mj,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
      frontEventCount: seqPack.frontEventCount,
      hasInstrumentedStrongPoint: hasStrongPoint,
    })
    const journeyEvidence = {
      matchedPoints: Math.max(relPack.matched_points_count, matrixMatchedPoints),
      expectedPoints: Math.max(relPack.expected_points_count, matrixExpectedPoints),
      hasJourneyStrongPoint: deducedStrongEvidence,
    }
    const deducedEvidenceOk = journeyMeetsDeducedEvidenceThreshold({
      matrixFinalStatus: matrixClassification.finalStatus,
      ...journeyEvidence,
      matrixConfidence: matrixClassification.confidence,
    })
    const executiveCircuitBase = resolveExecutiveCircuitDecision({
      matrixFinalStatus: matrixClassification.finalStatus,
      matrixReason: matrixClassification.reason,
      coverageInfo: {
        coveragePercent,
        hasStrongPoint,
      },
      sequenceConfig: {
        enabledForClassification,
        sequenceConfigured,
      },
      journeyEvidence,
    })
    let executiveCircuit = executiveCircuitBase
    if (executiveCircuitCode === 'RS_REC' || executiveCircuitCode === 'RS_DESP') {
      if (!deducedEvidenceOk && executiveCircuitBase.executiveStatus !== 'VALIDO') {
        executiveCircuit = resolveProbableSolidExecutiveDecision({
          matrixFinalStatus: matrixClassification.finalStatus,
          matrixReason: matrixClassification.reason,
          frontEventCount: seqPack.frontEventCount,
          hasOperationalEntry: entry.has_operational_entry,
          hasOperationalExit: exit.has_operational_exit,
        })
      }
    }
    executiveCircuit = applySanLorenzoExecutiveSupport({
      journey: mj,
      executiveCircuitCode,
      technicalCircuitCode: technicalCircuitCode,
      executive: executiveCircuit,
      frontEventCount: seqPack.frontEventCount,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
    })
    if (slSupport.hasSlCorroboration) slJourneysWithCorroboration++
    if (String(executiveCircuit.executiveReason ?? '').startsWith('SL_')) slJourneysExecutiveReinforced++

    const operationalAlertAgg =
      operationalAlertsMatchAccumulator.journeySummaries.get(mj.journeyUid) ??
      emptyJourneyOperationalAlertSummary()

    const committee = resolveCommitteeClassification({
      journey: mj,
      executiveCircuitConfig,
      executiveCircuitCode,
      technicalCircuitCode: technicalCircuitCode,
      matrixFinalStatus: matrixClassification.finalStatus,
      matrixReason: matrixClassification.reason,
      executive: executiveCircuit,
      sequenceConfigured,
      hasStrongPoint,
      frontEventCount: seqPack.frontEventCount,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
      matchedPoints: journeyEvidence.matchedPoints,
      expectedPoints: journeyEvidence.expectedPoints,
      matrixConfidence: matrixClassification.confidence,
      hasInvalidRouteOperationalAlert: operationalAlertAgg.hasInvalidRoute,
      hasInvalidJourneyStartOperationalAlert: operationalAlertAgg.hasInvalidJourneyStart,
    })
    executiveCircuit = {
      executiveStatus: committee.executive_status,
      executiveReason: committee.executive_reason,
      validDetail:
        committee.committee_group === 'COMPLETOS' && committee.committee_reason.includes('DEDUCIDO') ?
          'DEDUCIDO'
        : committee.committee_group === 'COMPLETOS' && committee.committee_reason === 'CIRCUITO_COMPLETO' ?
          'COMPLETO'
        : executiveCircuit.validDetail,
    }

    let reportExecutiveCode = executiveCircuitCode
    let reportExecutiveLabel = executiveCircuitLabel
    if (
      committee.committee_group === 'COMPLETOS' &&
      (committee.committee_reason.includes('DESCARGA_INSTRUMENTADA') ||
        journeyMeetsFlexibleInstrumentedDischargeRule(mj))
    ) {
      const flexCfg = resolveFlexibleDischargeExecutiveCircuit(mj)
      reportExecutiveCode = flexCfg.code
      reportExecutiveLabel = flexCfg.label
    }

    switch (committee.committee_group) {
      case 'COMPLETOS':
        committeeCompletos++
        break
      case 'VARIACIONES_OPERATIVAS':
        committeeVariaciones++
        break
      case 'ANOMALIAS':
        committeeAnomalias++
        break
    }
    if (executiveCircuit.executiveStatus === 'VALIDO') {
      if (reportExecutiveCode === 'R7') validR7Journeys++
      if (reportExecutiveCode === 'SL1') validSlInternalJourneys++
      if (reportExecutiveCode === 'R26' || reportExecutiveCode === 'R27' || reportExecutiveCode === 'R34') {
        transileExternalJourneys++
      }
    }
    if (
      committee.committee_group === 'ANOMALIAS' ||
      executiveCircuit.executiveStatus === 'ANOMALO' ||
      executiveCircuit.executiveStatus === 'INCOMPLETO'
    ) {
      if (committee.anomaly_origin_plant === 'RICARDONE') anomaliesRicardone++
      if (committee.anomaly_origin_plant === 'SAN_LORENZO') anomaliesSanLorenzo++
      if (committee.anomaly_origin_plant === 'MIXTO') anomaliesMixto++
    }
    classifiedForSegmentTiming.push({
      journey: mj,
      executiveCircuitCode: reportExecutiveCode,
      committeeGroup: committee.committee_group,
      executiveStatus: executiveCircuit.executiveStatus,
      validDetail: executiveCircuit.validDetail,
      circuitName: reportExecutiveLabel,
    })
    const legacyFinalStatus = resolveFinalStatus({
      j: mj,
      reliabilityScore: rel,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
      strong,
      balanzaCompleta,
      suspiciousDuplicate: dupSus,
      duplicateSeverity: dupSev,
      sequenceCoherent,
      eventCountFront: seqPack.frontEventCount,
    })
    const final_status =
      matrixClassification.finalStatus === 'COMPLETO' ? 'circuito_completo'
      : matrixClassification.finalStatus === 'DEDUCIDO' ? 'circuito_probable'
      : matrixClassification.finalStatus === 'ANOMALO' ? 'incompleto_revision'
      : 'incompleto_revision'

    const executive = resolveExecutiveBucket({
      finalStatus: final_status,
      frontEventCount: seqPack.frontEventCount,
      reliabilityScore: rel,
      sequenceCoherent,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
      strong,
      missingTemplatePointsCount: mj.missingExpectedPoints?.length ?? 0,
      expectedTemplatePoints: relPack.expected_points_count,
      j: mj,
      seqPack,
      hasInvalidRouteOperationalAlert: operationalAlertAgg.hasInvalidRoute,
      hasInvalidJourneyStartOperationalAlert: operationalAlertAgg.hasInvalidJourneyStart,
    })

    journeyMetaByUid.set(mj.journeyUid, {
      journeyUid: mj.journeyUid,
      normalizedPlate: mj.normalizedPlate,
      startedAt: mj.startedAt,
      endedAt: mj.endedAt,
      preliminaryCircuitCode: mj.preliminaryCircuitCode,
      executiveBucket: executive.bucket,
    })
    journeyMatrixByUid.set(mj.journeyUid, {
      matrixFinalStatus: matrixClassification.finalStatus,
      matrixReason: matrixClassification.reason,
      matrixConfidence: matrixClassification.confidence,
      sequenceRespected: matrixClassification.sequenceRespected,
      legacyFinalStatus: legacyFinalStatus,
      executiveBucket: executive.bucket,
      executiveStatus: executiveCircuit.executiveStatus,
      executiveReason: executiveCircuit.executiveReason,
      validDetail: executiveCircuit.validDetail,
      coveragePercent,
      hasStrongPoint,
      enabledForClassification,
      sequenceConfigured,
      usefulEventsCount: seqPack.frontEventCount,
    })

    if (!journeyPassesFinalFilter(mj)) continue

    switch (executiveCircuit.executiveStatus) {
      case 'VALIDO':
        executiveValidos++
        if (executiveCircuit.validDetail === 'COMPLETO') executiveValidComplete++
        if (executiveCircuit.validDetail === 'DEDUCIDO') executiveValidDeduced++
        break
      case 'PROBABLE':
        executiveProbables++
        break
      case 'INCOMPLETO':
        executiveStatusIncompletos++
        break
      case 'ANOMALO':
        executiveStatusAnomalos++
        if (executiveCircuit.executiveReason === 'NO_RESPETA_SECUENCIA') {
          executiveAnomalousNoRespetaSecuencia++
        }
        break
      case 'NO_EVALUABLE':
        executiveNoEvaluables++
        if (executiveCircuit.executiveReason === 'CONFIG_ERROR_MISSING_SEQUENCE') {
          executiveNonEvaluableMissingSequence++
        } else if (executiveCircuit.executiveReason === 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA') {
          executiveNonEvaluableByCoverage++
        }
        break
    }

    switch (executive.bucket) {
      case 'COMPLETO':
        executiveCompletos++
        break
      case 'INCOMPLETO':
        executiveIncompletos++
        break
      case 'ANOMALO':
        executiveAnomalos++
        break
      case 'DEDUCIDO':
        executiveDeducidos++
        break
    }

    if (entry.has_operational_entry) circuitos_con_ingreso_operativo++
    if (exit.has_operational_exit) circuitos_con_egreso_operativo++
    if (entry.has_operational_entry && exit.has_operational_exit) {
      circuitos_con_ingreso_y_egreso_operativo++
    }

    switch (final_status) {
      case 'circuito_completo':
        final_circuitos_completos++
        final_classified_count++
        break
      case 'circuito_probable':
        final_circuitos_probables++
        final_classified_count++
        break
      case 'circuito_probable_sin_ingreso':
        final_circuitos_sin_ingreso++
        break
      case 'circuito_probable_sin_egreso':
        final_circuitos_sin_egreso++
        break
      case 'incompleto_revision':
        final_incompletos_revision++
        final_incomplete_count++
        break
      case 'descartado':
        final_descartados_en_csv++
        break
    }

    finalCsvRows.push({
      journey_uid: mj.journeyUid,
      truck_plate: mj.plate,
      normalized_plate: mj.normalizedPlate,
      final_status,
      final_status_label: finalStatusLabel(final_status),
      executive_bucket: executive.bucket,
      executive_bucket_label: executiveBucketLabel(executive.bucket),
      executive_anomaly_reason: executive.anomalyReason ?? '',
      event_count_front: seqPack.frontEventCount,
      device_sequence_front: seqPack.deviceSequence,
      sector_sequence_front: seqPack.sectorSequence,
      logical_sequence_front: seqPack.logicalSequence,
      ingreso_frontal_reference: `RicIngCamFrente|RICARDONE_INGRESO_CAMIONES`,
      ingreso_frontal_event_hits_on_journey: ingresoN,
      has_ingreso_frontal: hasIngresoFrontal,
      has_operational_entry: entry.has_operational_entry,
      entry_source: entry.entry_source,
      has_operational_exit: exit.has_operational_exit,
      exit_source: exit.exit_source,
      has_strong_defining_point: strong,
      has_logical_egreso: journeyHasLogicalEgreso(mj),
      rear_only_excluded: false,
      rear_events_removed: audit?.rear_events_removed ?? false,
      preliminary_code: mj.preliminaryCircuitCode,
      expected_points_count: relPack.expected_points_count,
      matched_points_count: relPack.matched_points_count,
      missing_points_count: relPack.missing_points_count,
      reliability_score: rel,
      reliability_explanation: relPack.reliability_explanation,
      confidence_level,
      refinement_note: refinementLabel(mj),
      data_quality_flag: pickDataQualityFlag(mj, tier, dupSus, mergedFrag),
      matrix_final_status: matrixClassification.finalStatus,
      executive_status: executiveCircuit.executiveStatus,
      executive_reason: executiveCircuit.executiveReason,
      valid_detail: executiveCircuit.validDetail,
      matrix_reason: matrixClassification.reason,
      sequence_respected: matrixClassification.sequenceRespected,
      coverage_percent: coveragePercent,
      has_strong_point: hasStrongPoint,
      enabled_for_classification: enabledForClassification,
      sequence_configured: sequenceConfigured,
      matrix_missing_points: matrixClassification.missingPoints.join('|'),
      matched_circuit_code: reportExecutiveCode,
      executive_circuit_code: reportExecutiveCode,
      executive_circuit_label: reportExecutiveLabel,
      technical_matched_circuit_code: technicalCircuitCode,
      matrix_confidence: matrixClassification.confidence,
      final_status_legacy: legacyFinalStatus,
      committee_group: committee.committee_group,
      committee_reason: committee.committee_reason,
      operational_variation_type: committee.operational_variation_type,
      analysis_scope: committee.analysis_scope,
      strong_point_source: committee.strong_point_source,
      show_in_committee: committee.show_in_committee,
      show_as_exact_circuit: committee.show_as_exact_circuit,
      candidate_circuits: committee.candidate_circuits,
      missing_key_cameras: committee.missing_key_cameras,
      anomaly_origin_plant: committee.anomaly_origin_plant,
      anomaly_leg: committee.anomaly_leg,
      matched_sequence_name: committee.matched_sequence_name,
      matched_variation_name: committee.matched_variation_name,
      anomaly_kind: committee.anomaly_kind ?? 'NONE',
      anomaly_kind_reason: committee.anomaly_kind_reason ?? '',
    })

    const expectedSequence =
      matrixClassification.matchedCircuitCode ?
        (DEFAULT_CIRCUIT_MATRIX[matrixClassification.matchedCircuitCode] ?? []).join('>')
      : ''
    debugMatrixRows.push({
      journey_id: mj.journeyUid,
      plate: mj.normalizedPlate || mj.plate,
      site: mj.siteId,
      detected_sequence: seqPack.logicalSequence,
      device_sequence: seqPack.deviceSequence,
      first_event_at: mj.startedAt,
      last_event_at: mj.endedAt,
      matched_circuit_code: reportExecutiveCode,
      executive_circuit_code: reportExecutiveCode,
      executive_circuit_label: reportExecutiveLabel,
      technical_matched_circuit_code: technicalCircuitCode,
      expected_sequence: expectedSequence,
      matrix_final_status: matrixClassification.finalStatus,
      executive_status: executiveCircuit.executiveStatus,
      executive_reason: executiveCircuit.executiveReason,
      valid_detail: executiveCircuit.validDetail,
      matrix_reason: matrixClassification.reason,
      sequence_respected: matrixClassification.sequenceRespected,
      coverage_percent: coveragePercent,
      has_strong_point: hasStrongPoint,
      enabled_for_classification: enabledForClassification,
      sequence_configured: sequenceConfigured,
      matrix_missing_points: matrixClassification.missingPoints.join('|'),
      matrix_confidence: matrixClassification.confidence,
      useful_events_count: seqPack.frontEventCount,
      sl_support_points: slSupport.slPointCount,
      sl_support_strong_points: slSupport.slStrongPointCount,
      sl_support_corroboration: slSupport.hasSlCorroboration ? 'yes' : 'no',
      committee_group: committee.committee_group,
      committee_reason: committee.committee_reason,
      operational_variation_type: committee.operational_variation_type,
      analysis_scope: committee.analysis_scope,
      strong_point_source: committee.strong_point_source,
      show_in_committee: committee.show_in_committee ? 'yes' : 'no',
      show_as_exact_circuit: committee.show_as_exact_circuit ? 'yes' : 'no',
      candidate_circuits: committee.candidate_circuits,
      missing_key_cameras: committee.missing_key_cameras,
      final_status_legacy: legacyFinalStatus,
      executive_bucket: executive.bucket,
    })
  }
  profileAt = etlProfileMark(profiler, 'classifyCircuits', profileAt)
  await yieldToBrowser()

  const journeyTimesByUid = new Map<string, { start: string; end: string }>()
  for (const row of debugMatrixRows) {
    const uid = String(row.journey_id ?? '')
    if (!uid) continue
    journeyTimesByUid.set(uid, {
      start: String(row.first_event_at ?? ''),
      end: String(row.last_event_at ?? ''),
    })
  }

  let movimientosContratoCsv: Record<string, string> = {}
  let movimientosContratoTables: Record<string, import('../../../etl-core/typedTable').TypedTable> = {}
  let movimientosContratoStats: EtlTransformOutput['stats']['movimientosContrato']
  let kpiTiemposMovimientosSnapshot: KpiTiemposBuildInput['movimientosSnapshot'] = null

  const skipMovimientosEnTramo2 =
    onlyTramo === 2 ||
    Boolean(phaseStore.contractIntegration) ||
    Boolean(inp.movimientosContratoFiles?.length)

  if (phaseStore.contractIntegration && phaseStore.tramo2Prep) {
    const mc = phaseStore.contractIntegration
    const prep = phaseStore.tramo2Prep
    movimientosContratoCsv = mc.csv
    movimientosContratoTables = mc.tables ?? {}
    kpiTiemposMovimientosSnapshot = mc.kpiTiemposSnapshot
    movimientosContratoStats = movimientosStatsFromIntegration(mc, prep.finalCsvRows.length)
  } else if (!skipMovimientosEnTramo2 && inp.movimientosContratoFiles?.length) {
    await yieldToBrowser()
    const mc = await runMovimientosContratoIntegration({
      finalCsvRows,
      journeyTimesByUid,
      classifiedJourneys: classifiedForSegmentTiming,
      rawTruckflowEvents: operationalFrontEvents.map((e) => ({
        journeyUid: e.journeyUid,
        truckPlate: e.truckPlate,
        normalizedPlate: e.normalizedPlate,
        deviceCode: e.deviceCode,
        sectorCode: e.sectorCode,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })),
      movimientosFiles: inp.movimientosContratoFiles,
      tiemposEntrePasosFiles: inp.tiemposEntrePasosFiles,
      skipKpiTiemposArtifacts: true,
      onProgress: inp.onContractFirstProgress,
      profiler,
    })
    movimientosContratoCsv = mc.csv
    movimientosContratoTables = mc.tables ?? {}
    kpiTiemposMovimientosSnapshot = mc.kpiTiemposSnapshot
    movimientosContratoStats = {
      enabled: true,
      logs: mc.logs,
      warnings: mc.stats.movimientos.warnings,
      filesRead: mc.stats.movimientos.filesRead,
      rawCount: mc.stats.movimientos.rawCount,
      normalizedCount: mc.stats.movimientos.normalizedCount,
      withPlate: mc.stats.movimientos.withPlate,
      withProduct: mc.stats.movimientos.withProduct,
      withPlatform: mc.stats.movimientos.withPlatform,
      truckflowJourneys: finalCsvRows.length,
      analysisReadyCount: mc.stats.analysisReadyCount,
      segmentScatterRows: mc.stats.segmentScatterRows,
      excelFirstScatterRows: mc.stats.excelFirstScatterRows,
      operationalSampleSelected: mc.stats.operationalSampleSelected,
      merge: mc.stats.merge,
      excelFirst: mc.stats.excelFirst,
      products: mc.stats.products,
      platforms: mc.stats.platforms,
      liquidMovements: mc.stats.liquidMovements,
      transileInternoVolcable: mc.stats.transileInternoVolcable,
    }
  } else {
    movimientosContratoStats = {
      enabled: false,
      logs: ['Movimientos por Contrato: sin archivos cargados en memoria al procesar'],
      warnings: [],
      filesRead: 0,
      rawCount: 0,
      normalizedCount: 0,
      withPlate: 0,
      withProduct: 0,
      withPlatform: 0,
      truckflowJourneys: finalCsvRows.length,
      analysisReadyCount: 0,
      segmentScatterRows: 0,
      excelFirstScatterRows: 0,
      operationalSampleSelected: 0,
      merge: {},
      excelFirst: {},
      products: [],
      platforms: [],
    }
  }

  type LprMergeCandidateRow = {
    alert_id: string
    journey_uid: string
    device_code: string
    sector_code: string
    site: string
    occurred_at_alert: string
    started_at_journey: string
    ended_at_journey: string
    ocr_raw: string
    ocr_normalized: string
    journey_plate: string
    ocr_score: number
    time_diff_min: number
    time_score: number
    device_sector_score: number
    sequence_fit_score: number
    merge_score: number
    merge_rule: LprMergeRule
    merge_confidence: LprMergeConfidence
    merge_mode: typeof LPR_MERGE_MODE
    matrix_final_status: string
    matrix_reason: string
    matrix_confidence: number
    sequence_respected: boolean
    useful_events_count: number
    final_status_legacy: string
    executive_bucket: string
    executive_status: string
    executive_reason: string
    valid_detail: string
    coverage_percent: number
    has_strong_point: boolean
    enabled_for_classification: boolean
    sequence_configured: boolean
    merge_decision: 'APPLIED' | 'REVIEW' | 'REJECTED'
    review_reason: string
  }

  const lprMergeCandidatesAll: LprMergeCandidateRow[] = []
  const lprAlerts = frontAl.filter(isLprMalfunctionAlert)
  const journeyByUid = new Map(journeysForExecutive.map((j) => [j.journeyUid, j]))

  type LprJourneyScanCtx = {
    uid: string
    meta: { executiveBucket: string; normalizedPlate: string; startedAt: string; endedAt: string }
    j: (typeof journeysForExecutive)[number]
    matrix: {
      usefulEventsCount: number
      matrixFinalStatus: string
      matrixReason: string
      matrixConfidence: number
      sequenceRespected: boolean
      legacyFinalStatus: string
      executiveBucket: string
      executiveStatus: string
      executiveReason: string
      validDetail: string
      coveragePercent: number
      hasStrongPoint: boolean
      enabledForClassification: boolean
      sequenceConfigured: boolean
    }
    minW: number
    maxW: number
    jPlate: string
    devSet: Set<string>
    secSet: Set<string>
    jSite: ReturnType<typeof inferSiteFromSectorCode>
  }
  const lprJourneyScanCtx: LprJourneyScanCtx[] = []
  for (const [uid, meta] of journeyMetaByUid.entries()) {
    const j = journeyByUid.get(uid)
    if (!j) continue
    if (meta.executiveBucket === '') continue
    const matrix = journeyMatrixByUid.get(uid)
    if (!matrix || matrix.usefulEventsCount <= 0) continue
    const startMs = Date.parse(meta.startedAt)
    const endMs = Date.parse(meta.endedAt)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const minW = Math.min(startMs, endMs)
    const maxW = Math.max(startMs, endMs)
    const jPlate = normalizePlateStrict(meta.normalizedPlate || j.normalizedPlate || j.plate)
    const devSet = new Set(j.events.map((e) => String(e.deviceCode ?? '').trim()))
    const secSet = new Set(j.events.map((e) => String(e.sectorCode ?? '').trim()))
    const jSite = inferSiteFromSectorCode(String(j.events[0]?.sectorCode ?? ''))
    lprJourneyScanCtx.push({ uid, meta, j, matrix, minW, maxW, jPlate, devSet, secSet, jSite })
  }

  const LPR_MAX_WINDOW_MS = 60 * 60 * 1000
  const lprScansByTime = [...lprJourneyScanCtx].sort((a, b) => a.minW - b.minW)

  function lprScansForAlertMs(alertMs: number): LprJourneyScanCtx[] {
    const lo = alertMs - LPR_MAX_WINDOW_MS
    const hi = alertMs + LPR_MAX_WINDOW_MS
    const out: LprJourneyScanCtx[] = []
    for (const scan of lprScansByTime) {
      if (scan.maxW < lo) continue
      if (scan.minW > hi) break
      out.push(scan)
    }
    return out
  }

  for (let lprAlertIdx = 0; lprAlertIdx < lprAlerts.length; lprAlertIdx++) {
    if (lprAlertIdx > 0 && lprAlertIdx % 12 === 0) await yieldToBrowser()
    const alert = lprAlerts[lprAlertIdx]!
    const alertId = pickStr(alert.id) || pickStr((alert as { alertId?: unknown }).alertId)
    const alertAt = alertOccurredAtIso(alert)
    const alertMs = Date.parse(alertAt)
    if (!Number.isFinite(alertMs)) continue
    const alertDevice = getEffectiveAlertDeviceCode(alert)
    const alertSector = getEffectiveAlertSectorCode(alert)
    const alertSite = inferSiteFromSectorCode(alertSector)
    const ocrRaw = getLprObservedPlateRaw(alert)
    const ocrNorm = normalizePlateStrict(ocrRaw)

    for (const scan of lprScansForAlertMs(alertMs)) {
      const { uid, meta, matrix, minW, maxW, jPlate, devSet, secSet, jSite } = scan
      const diffMin =
        alertMs < minW ? (minW - alertMs) / 60000
        : alertMs > maxW ? (alertMs - maxW) / 60000
        : 0
      const tScore = timeScoreByDiffMinutes(diffMin)
      if (tScore <= 0) continue

      const ocrScore = ocrNorm && jPlate ? plateSimilarityScore(ocrNorm, jPlate) : 0

      const sameDevice = !!alertDevice && devSet.has(alertDevice)
      const sameSector = !!alertSector && secSet.has(alertSector)
      const sameSite = jSite !== 'unknown' && alertSite !== 'unknown' && jSite === alertSite

      const deviceSectorScore = sameDevice ? 1 : sameSector ? 0.7 : sameSite ? 0.3 : 0
      if (deviceSectorScore <= 0) continue

      const sequenceFitScore =
        matrix.matrixFinalStatus === 'COMPLETO' ? 1
        : matrix.matrixFinalStatus === 'DEDUCIDO' ? 0.85
        : matrix.matrixFinalStatus === 'INCOMPLETO' ? 0.6
        : 0

      const mergeScore =
        Math.round((0.4 * ocrScore + 0.25 * tScore + 0.2 * deviceSectorScore + 0.15 * sequenceFitScore) * 1000) /
        1000
      const mergeConfidence = inferLprMergeConfidence(mergeScore)

      let mergeRule: LprMergeRule = 'NONE'
      if (sameDevice && diffMin <= 5 && ocrScore >= 0.95) mergeRule = 'EXACT_DEVICE_TIME_PLATE'
      else if ((sameDevice || sameSector) && diffMin <= 15 && ocrScore >= 0.8) {
        mergeRule = 'DEVICE_OR_SECTOR_TIME_OCR'
      } else if (sameSite && diffMin <= 30 && ocrScore >= 0.65) {
        mergeRule = 'SITE_TIME_OCR_WEAK'
      }
      if (mergeRule === 'NONE') continue

      lprMergeCandidatesAll.push({
        alert_id: alertId,
        journey_uid: uid,
        device_code: alertDevice,
        sector_code: alertSector,
        site: alertSite,
        occurred_at_alert: alertAt,
        started_at_journey: meta.startedAt,
        ended_at_journey: meta.endedAt,
        ocr_raw: ocrRaw,
        ocr_normalized: ocrNorm,
        journey_plate: jPlate,
        ocr_score: Math.round(ocrScore * 1000) / 1000,
        time_diff_min: Math.round(diffMin * 100) / 100,
        time_score: Math.round(tScore * 1000) / 1000,
        device_sector_score: Math.round(deviceSectorScore * 1000) / 1000,
        sequence_fit_score: Math.round(sequenceFitScore * 1000) / 1000,
        merge_score: mergeScore,
        merge_rule: mergeRule,
        merge_confidence: mergeConfidence,
        merge_mode: LPR_MERGE_MODE,
        matrix_final_status: matrix.matrixFinalStatus,
        matrix_reason: matrix.matrixReason,
        matrix_confidence: matrix.matrixConfidence,
        sequence_respected: matrix.sequenceRespected,
        useful_events_count: matrix.usefulEventsCount,
        final_status_legacy: matrix.legacyFinalStatus,
        executive_bucket: matrix.executiveBucket,
        executive_status: matrix.executiveStatus,
        executive_reason: matrix.executiveReason,
        valid_detail: matrix.validDetail,
        coverage_percent: matrix.coveragePercent,
        has_strong_point: matrix.hasStrongPoint,
        enabled_for_classification: matrix.enabledForClassification,
        sequence_configured: matrix.sequenceConfigured,
        merge_decision: 'REJECTED',
        review_reason: '',
      })
    }
  }

  const candidatesByAlert = new Map<string, LprMergeCandidateRow[]>()
  for (const c of lprMergeCandidatesAll) {
    const arr = candidatesByAlert.get(c.alert_id) ?? []
    arr.push(c)
    candidatesByAlert.set(c.alert_id, arr)
  }
  const lprMergeAppliedRows: LprMergeCandidateRow[] = []
  const lprMergeReviewRows: LprMergeCandidateRow[] = []
  const lprMergeCandidatesRows: LprMergeCandidateRow[] = []
  const journeyLockedByAlert = new Set<string>()

  for (const [alertId, listCand] of candidatesByAlert.entries()) {
    const sorted = [...listCand].sort((a, b) =>
      b.merge_score !== a.merge_score ? b.merge_score - a.merge_score : a.time_diff_min - b.time_diff_min
    )
    const top = sorted[0]
    const second = sorted[1]
    const ambiguous = !!second && top && top.merge_score - second.merge_score < 0.05
    for (const c of sorted) {
      const row = { ...c }
      if (!top || row.journey_uid !== top.journey_uid) {
        row.merge_decision = 'REVIEW'
        row.review_reason = row.merge_confidence === 'LOW' ? 'LOW_CONFIDENCE' : 'SECONDARY_CANDIDATE'
        lprMergeReviewRows.push(row)
        lprMergeCandidatesRows.push(row)
        continue
      }

      const allowByMode =
        row.merge_confidence === 'HIGH' ||
        (LPR_MERGE_MODE === 'medium' && row.merge_confidence === 'MEDIUM')
      const blockedByAnomalous =
        row.matrix_final_status === 'ANOMALO' && row.merge_rule !== 'EXACT_DEVICE_TIME_PLATE'
      const locked = journeyLockedByAlert.has(`${alertId}|${row.journey_uid}`)

      if (ambiguous) {
        row.merge_decision = 'REVIEW'
        row.review_reason = 'AMBIGUOUS_TOP_CANDIDATE'
        lprMergeReviewRows.push(row)
      } else if (!allowByMode) {
        row.merge_decision = 'REVIEW'
        row.review_reason = 'MODE_THRESHOLD_NOT_MET'
        lprMergeReviewRows.push(row)
      } else if (blockedByAnomalous) {
        row.merge_decision = 'REVIEW'
        row.review_reason = 'ANOMALOUS_JOURNEY_REQUIRES_REVIEW'
        lprMergeReviewRows.push(row)
      } else if (locked) {
        row.merge_decision = 'REVIEW'
        row.review_reason = 'ONE_TO_ONE_LOCKED'
        lprMergeReviewRows.push(row)
      } else {
        row.merge_decision = 'APPLIED'
        row.review_reason = ''
        lprMergeAppliedRows.push(row)
        journeyLockedByAlert.add(`${alertId}|${row.journey_uid}`)
      }
      lprMergeCandidatesRows.push(row)
    }
  }

  profileAt = etlProfileMark(profiler, 'lprMerge', profileAt)

  await yieldToBrowser()

  const operationalAlertsCount = operationalAlertsSansLpr.length

  attachExecutiveBucketsToOperationalAlertRows(
    operationalAlertsMatchAccumulator.alertRows,
    journeyMetaByUid
  )
  const alertCrossMetrics = computeOperationalAlertCrossMetrics(
    operationalAlertsMatchAccumulator.journeySummaries,
    journeyMetaByUid,
    operationalAlertsMatchAccumulator.operationalAlertsCrossed
  )
  const crossResult = {
    alertRows: operationalAlertsMatchAccumulator.alertRows,
    journeySummaries: operationalAlertsMatchAccumulator.journeySummaries,
    metrics: alertCrossMetrics,
  }

  for (const row of finalCsvRows) {
    const uid = String(row.journey_uid ?? '')
    const sum = crossResult.journeySummaries.get(uid)
    Object.assign(row, sum ? journeyAlertSummaryToRow(sum) : emptyJourneyAlertSummaryRow())
  }

  const FINAL_CIRCUITS_EMPTY_HEADERS = [
    'journey_uid',
    'final_status',
    'final_status_label',
    'data_quality_flag',
  ] as const
  const finalCircuitsHeaders =
    finalCsvRows.length ?
      (Object.keys(finalCsvRows[0]!) as string[])
    : [...FINAL_CIRCUITS_EMPTY_HEADERS]
  const finalCircuitsTable: TypedTable = makeTable(
    'final_circuits',
    finalCircuitsHeaders,
    finalCsvRows
  )
  const final_circuits_csv =
    finalCsvRows.length ?
      tableToCsv(finalCircuitsTable)
    : `${FINAL_CIRCUITS_EMPTY_HEADERS.join(',')}\n`

  const DEBUG_MATRIX_HEADERS = [
    'journey_id',
    'plate',
    'site',
    'detected_sequence',
    'device_sequence',
    'first_event_at',
    'last_event_at',
    'matched_circuit_code',
    'executive_circuit_code',
    'executive_circuit_label',
    'technical_matched_circuit_code',
    'expected_sequence',
    'matrix_final_status',
    'executive_status',
    'executive_reason',
    'valid_detail',
    'matrix_reason',
    'sequence_respected',
    'coverage_percent',
    'has_strong_point',
    'enabled_for_classification',
    'sequence_configured',
    'matrix_missing_points',
    'matrix_confidence',
    'useful_events_count',
    'sl_support_points',
    'sl_support_strong_points',
    'sl_support_corroboration',
    'committee_group',
    'committee_reason',
    'operational_variation_type',
    'analysis_scope',
    'strong_point_source',
    'show_in_committee',
    'show_as_exact_circuit',
    'candidate_circuits',
    'missing_key_cameras',
    'final_status_legacy',
    'executive_bucket',
  ] as const
  const DEBUG_MATRIX_EMPTY_CSV =
    'journey_id,plate,site,detected_sequence,matched_circuit_code,executive_circuit_code,executive_circuit_label,technical_matched_circuit_code,expected_sequence,matrix_final_status,executive_status,executive_reason,valid_detail,matrix_reason,sequence_respected,coverage_percent,has_strong_point,enabled_for_classification,sequence_configured,matrix_missing_points,matrix_confidence,useful_events_count,final_status_legacy,executive_bucket\n'
  const debugMatrixTable: TypedTable = makeTable(
    'debug_matrix_classification',
    DEBUG_MATRIX_HEADERS,
    debugMatrixRows as Record<string, unknown>[]
  )
  const debug_matrix_classification_csv =
    debugMatrixRows.length ? tableToCsv(debugMatrixTable) : DEBUG_MATRIX_EMPTY_CSV
  const lprMergeHeaders = [
    'alert_id',
    'journey_uid',
    'device_code',
    'sector_code',
    'site',
    'occurred_at_alert',
    'started_at_journey',
    'ended_at_journey',
    'ocr_raw',
    'ocr_normalized',
    'journey_plate',
    'ocr_score',
    'time_diff_min',
    'time_score',
    'device_sector_score',
    'sequence_fit_score',
    'merge_score',
    'merge_rule',
    'merge_confidence',
    'merge_mode',
    'matrix_final_status',
    'matrix_reason',
    'matrix_confidence',
    'sequence_respected',
    'useful_events_count',
    'final_status_legacy',
    'executive_bucket',
    'executive_status',
    'executive_reason',
    'valid_detail',
    'coverage_percent',
    'has_strong_point',
    'enabled_for_classification',
    'sequence_configured',
    'merge_decision',
    'review_reason',
  ]
  const lpr_merge_candidates_csv =
    lprMergeCandidatesRows.length ?
      recordsToCsv(lprMergeHeaders, lprMergeCandidatesRows as unknown as Record<string, unknown>[])
    : `${lprMergeHeaders.join(',')}\n`
  const lpr_merge_applied_csv =
    lprMergeAppliedRows.length ?
      recordsToCsv(lprMergeHeaders, lprMergeAppliedRows as unknown as Record<string, unknown>[])
    : `${lprMergeHeaders.join(',')}\n`
  const lpr_merge_review_csv =
    lprMergeReviewRows.length ?
      recordsToCsv(lprMergeHeaders, lprMergeReviewRows as unknown as Record<string, unknown>[])
    : `${lprMergeHeaders.join(',')}\n`

  const operational_alerts_csv =
    crossResult.alertRows.length ?
      recordsToCsv(
        [...OPERATIONAL_ALERTS_CSV_COLUMNS],
        crossResult.alertRows as unknown as Record<string, unknown>[]
      )
    : `${OPERATIONAL_ALERTS_CSV_COLUMNS.join(',')}\n`

  const final_circuits_count = finalCsvRows.length
  const final_descartados =
    rear_only_journeys_excluded + single_event_discarded + duplicate_severe_excluded + final_descartados_en_csv

  const incomplete_not_in_final = journeys.reduce((acc, mj) => {
    if (userCircuitTier(mj) !== 'circuito_incompleto') return acc
    return journeyPassesFinalFilter(mj) ? acc : acc + 1
  }, 0)

  let byExactPlate = 0
  let bySimilarPlate = 0
  let bySeqPlate = 0
  for (const c of mergeTop) {
    if (c.match_type === 'exact_plate') byExactPlate++
    else if (c.match_type === 'similar_plate') bySimilarPlate++
    else bySeqPlate++
  }

  let candidateId = 0
  const mergeCsvRows = mergeTop.map((c) => {
    candidateId += 1
    const seqPackA = seqFor(c.a)
    const seqPackB = seqFor(c.b)
    const sugRel = mergeReliability(c)
    return {
      candidate_id: candidateId,
      journey_uid_a: c.a.journeyUid,
      journey_uid_b: c.b.journeyUid,
      plate_a: c.a.normalizedPlate,
      plate_b: c.b.normalizedPlate,
      similarity_score: c.similarity,
      time_gap_minutes: c.gapMinutes,
      sequence_a: seqPackA.logicalSequence,
      sequence_b: seqPackB.logicalSequence,
      suggested_merged_sequence: `${seqPackA.logicalSequence}|${seqPackB.logicalSequence}`,
      suggested_circuit: `${c.a.preliminaryCircuitCode}/${c.b.preliminaryCircuitCode}`,
      suggested_reliability_score: sugRel,
      match_type: c.match_type,
      should_review: c.should_review,
      priority: c.priority,
      merge_status: 'suggested',
    } as Record<string, unknown>
  })

  const journey_merge_candidates_csv =
    mergeCsvRows.length ?
      recordsToCsv(Object.keys(mergeCsvRows[0]), mergeCsvRows)
    : 'candidate_id,match_type,should_review,priority\n'

  const merge_candidates_debug_csv =
    mergeCsvRows.length ?
      journey_merge_candidates_csv
    : 'candidate_id,match_type,note\n1,suggested,merge_automatico_no_aplicado_solo_sugerencias\n'

  const step4Stat = {
    candidates: mergeCsvRows.length,
    candidatesBeforeCap,
    byExactPlate,
    bySimilarPlate,
    bySequenceAndPlate: bySeqPlate,
  }

  const step3Stat = {
    journeysTotal: byJ.size,
    journeysValidFront: journeys_after_rear_filter,
    rearOnlyExcluded: rear_only_journeys_excluded,
    journeysWithRearEventsRemoved: journeysWithRearRemoved,
    single_event_discarded,
    duplicate_suspected,
    incomplete_sequence_count: incomplete_not_in_final,
    classifiedCircuitsOperational: classifiedOperationalCt,
    incompleteOperational: incompleteOperationalCt,
    unclassifiedCount: unclassifiedCt,
    cleanJourneysCount: cleanRows.length,
  }

  await yieldToBrowser()

  const daysSorted = eventsForEtl
    .map((e) => occurredAtLocalDayKey(e.occurredAt))
    .filter(Boolean)
    .sort()
  const dateMin = daysSorted.length ? daysSorted[0] : ''
  const dateMax = daysSorted.length ? daysSorted[daysSorted.length - 1] : ''

  const baseIngreso = ingreso_frontal_event_count || 0
  const journey_vs_ingreso_ratio =
    baseIngreso > 0 ? Math.round((journeys_after_rear_filter / baseIngreso) * 10000) / 10000 : null
  const final_circuits_vs_ingreso_ratio =
    baseIngreso > 0 ? Math.round((final_circuits_count / baseIngreso) * 10000) / 10000 : null

  const journeyFragmentationWarn =
    baseIngreso > 0 && journeys_after_rear_filter > ingreso_frontal_event_count * 1.25
  const circuitsVersusIngresoWarn =
    baseIngreso > 0 && final_circuits_count > ingreso_frontal_event_count * 1.1

  const coherentPrelim =
    baseIngreso > 0 && final_circuits_count <= ingreso_frontal_event_count

  const warnParts: string[] = []
  if (journeyFragmentationWarn) {
    warnParts.push(
      'Cantidad de journeys superior a ingresos frontales. Posible fragmentación de recorridos.'
    )
  }
  if (circuitsVersusIngresoWarn) {
    warnParts.push(
      'Cantidad de circuitos finales superior a ingresos frontales. Revisar duplicación o fragmentación.'
    )
  }
  if (coherentPrelim) {
    warnParts.push('Coherente para análisis preliminar.')
  }

  let coherenceLabel: string
  if (journeyFragmentationWarn || circuitsVersusIngresoWarn) {
    const hiFrag =
      baseIngreso > 0 &&
      (journeys_after_rear_filter > ingreso_frontal_event_count * 1.5 ||
        final_circuits_count > ingreso_frontal_event_count * 1.2)
    coherenceLabel = hiFrag ? 'Fragmentación alta' : 'Fragmentación moderada'
  } else {
    coherenceLabel = 'Coherente'
  }

  const exclusionMotivesA = [
    { motive: 'rear_only_journey', count: rear_only_journeys_excluded },
    { motive: 'single_event_discarded', count: single_event_discarded },
    { motive: 'duplicate_suspected', count: duplicate_suspected },
    { motive: 'incomplete_sequence', count: incomplete_not_in_final },
  ]

  const coherenceStat = {
    ingreso_frontal_event_count,
    ingreso_frontal_unique_plates,
    ingreso_frontal_unique_journeys,
    ingresos_operativos_count,
    total_journeys_raw: byJ.size,
    rear_only_journeys_excluded,
    journeys_after_rear_filter,
    final_circuits_count,
    final_classified_count,
    final_incomplete_count,
    final_circuitos_completos,
    final_circuitos_probables,
    final_circuitos_sin_ingreso,
    final_circuitos_sin_egreso,
    final_incompletos_revision,
    final_descartados,
    circuitos_con_ingreso_operativo,
    circuitos_con_egreso_operativo,
    circuitos_con_ingreso_y_egreso_operativo,
    journey_vs_ingreso_ratio,
    final_circuits_vs_ingreso_ratio,
    journeyFragmentationWarn,
    circuitsVersusIngresoWarn,
    coherenceLabel,
    coherenceDetail:
      [
        ...warnParts,
        `Ingresos frontales RicIngCamFrente: ${ingreso_frontal_event_count}. Ingresos operativos (INGRESO/PREINGRESO en journey): ${ingresos_operativos_count}. Journeys Truckflow: ${journeys_after_rear_filter}. Circuitos finales: ${final_circuits_count} (completos ${final_circuitos_completos}, probables ${final_circuitos_probables}).`,
      ].join(' '),
    exclusionMotives: exclusionMotivesA,
  }

  const summaryRow = {
    generated_at: new Date().toISOString(),
    source_mode: 'manual_local_files',
    loaded_event_files_count: inp.loadedEventFilesCount,
    loaded_alert_files_count: inp.loadedAlertFilesCount,
    raw_events_count: inp.events.length,
    raw_alerts_count: inp.alerts.length,
    plate_registry_events_excluded: plateRegistryStat.eventsExcluded,
    plate_registry_alerts_excluded: plateRegistryStat.alertsExcluded,
    plate_registry_active_entries: plateRegistryStat.activeExclusionEntries,
    front_events_count: frontEv.length,
    rear_events_count: rearEv.length,
    front_alerts_count: frontAl.length,
    rear_alerts_count: rearAl.length,
    ingreso_frontal_event_count,
    ingreso_frontal_unique_plates,
    ingreso_frontal_unique_journeys,
    ingresos_operativos_count,
    total_journeys_raw: byJ.size,
    rear_only_journeys_excluded,
    journeys_after_rear_filter,
    final_circuits_count,
    final_classified_count,
    final_incomplete_count,
    final_circuitos_completos,
    final_circuitos_probables,
    final_circuitos_sin_ingreso,
    final_circuitos_sin_egreso,
    final_incompletos_revision,
    final_descartados,
    circuitos_con_ingreso_operativo,
    circuitos_con_egreso_operativo,
    circuitos_con_ingreso_y_egreso_operativo,
    journeys_vs_ingreso_ratio: journey_vs_ingreso_ratio ?? '',
    final_circuits_vs_ingreso_ratio: final_circuits_vs_ingreso_ratio ?? '',
    journey_vs_ingreso_ratio: journey_vs_ingreso_ratio ?? '',
    journey_fragmentation_warning: journeyFragmentationWarn ? 'yes' : 'no',
    circuits_above_ingreso_warning: circuitsVersusIngresoWarn ? 'yes' : 'no',
    coherence_diagnosis: coherenceLabel,
    coherence_messages: coherenceStat.coherenceDetail,
    motive_rear_only_journey: exclusionMotivesA.find((x) => x.motive === 'rear_only_journey')?.count,
    motive_single_event_discarded: exclusionMotivesA.find((x) => x.motive === 'single_event_discarded')?.count,
    motive_duplicate_suspected: exclusionMotivesA.find((x) => x.motive === 'duplicate_suspected')?.count,
    motive_incomplete_sequence: exclusionMotivesA.find((x) => x.motive === 'incomplete_sequence')?.count,
    clean_journeys_count: cleanRows.length,
    classified_circuits_count: classifiedOperationalCt,
    unclassified_journeys_count: unclassifiedCt,
    single_event_discarded,
    duplicate_suspected_flagged_journeys: duplicate_suspected,
    merge_candidates_count: mergeCsvRows.length,
    journeys_with_rear_events_removed: journeysWithRearRemoved,
    total_journeys: final_circuits_count,
    journeys_merged_applied,
    valid_journeys: executiveValidos,
    probable_journeys: executiveProbables,
    incomplete_journeys: executiveStatusIncompletos,
    anomalous_journeys: executiveStatusAnomalos,
    non_evaluable_journeys: executiveNoEvaluables,
    valid_complete: executiveValidComplete,
    valid_deduced: executiveValidDeduced,
    non_evaluable_by_coverage: executiveNonEvaluableByCoverage,
    non_evaluable_missing_sequence: executiveNonEvaluableMissingSequence,
    anomalous_no_respeta_secuencia: executiveAnomalousNoRespetaSecuencia,
    valid_r7_journeys: validR7Journeys,
    valid_sl_internal_journeys: validSlInternalJourneys,
    transile_external_journeys: transileExternalJourneys,
    anomalies_ricardone: anomaliesRicardone,
    anomalies_san_lorenzo: anomaliesSanLorenzo,
    anomalies_mixto: anomaliesMixto,
    date_min: dateMin ?? '',
    date_max: dateMax ?? '',
    rules_version: ETL_TRANSFORM_RULES_VERSION,
    journeys_with_operational_alerts: alertCrossMetrics.journeysWithOperationalAlerts,
    journeys_with_invalid_route: alertCrossMetrics.journeysWithInvalidRoute,
    journeys_with_invalid_journey_start: alertCrossMetrics.journeysWithInvalidJourneyStart,
    incompletos_with_invalid_journey_start: alertCrossMetrics.incompletosWithInvalidJourneyStart,
    anomalos_with_invalid_route: alertCrossMetrics.anomalosWithInvalidRoute,
    operational_alerts_crossed: alertCrossMetrics.operationalAlertsCrossed,
    sl_front_events: slFrontEventsCount,
    sl_journeys_corroboration: slJourneysWithCorroboration,
    sl_journeys_executive_reinforced: slJourneysExecutiveReinforced,
    committee_completos: committeeCompletos,
    committee_variaciones_operativas: committeeVariaciones,
    committee_anomalias: committeeAnomalias,
  } as Record<string, unknown>

  const transform_summary_csv = recordsToCsv(Object.keys(summaryRow), [summaryRow])

  const validationStats = {
    totalLprMalfunctionAlerts: totalLprMalfunctionAlerts,
    lprMalfunctionByCamera,
    cameraWithMostLpr,
    circuitosClasificados: classifiedOperationalCt,
    registrosIncompletosOperativos: incompleteOperationalCt,
    sinClasificar: unclassifiedCt,
    mergeCandidatesFiltered: mergeCsvRows.length,
    final_circuits_count,
  }

  const executiveStat = {
    periodStart: dateMin ?? '',
    periodEnd: dateMax ?? '',
    eventCount: eventsForEtl.length,
    alertCount: alertsForEtl.length,
    completos: executiveCompletos,
    incompletos: executiveIncompletos,
    anomalos: executiveAnomalos,
    deducidos: executiveDeducidos,
    validos: executiveValidos,
    probables: executiveProbables,
    journeysMergedApplied: journeys_merged_applied,
    noEvaluables: executiveNoEvaluables,
    validComplete: executiveValidComplete,
    validDeduced: executiveValidDeduced,
    lprAlerts: totalLprMalfunctionAlerts,
    operationalAlerts: operationalAlertsCount,
    operationalAlertsCrossed: alertCrossMetrics.operationalAlertsCrossed,
    journeysWithInvalidRoute: alertCrossMetrics.journeysWithInvalidRoute,
    journeysWithInvalidJourneyStart: alertCrossMetrics.journeysWithInvalidJourneyStart,
    incompletosWithOperationalAlert: alertCrossMetrics.incompletosWithOperationalAlert,
    anomalosWithOperationalAlert: alertCrossMetrics.anomalosWithOperationalAlert,
    exportReady: final_circuits_count > 0,
    slFrontEvents: slFrontEventsCount,
    slJourneysWithCorroboration,
    slJourneysExecutiveReinforced,
    committeeCompletos,
    committeeVariaciones,
    committeeAnomalias,
  }

  phaseStore.tramo2Prep = {
    finalCsvRows,
    classifiedForSegmentTiming,
    journeyTimesByUid: [...journeyTimesByUid.entries()],
    rawTruckflowEvents: operationalFrontEvents.map((e) => ({
      journeyUid: e.journeyUid,
      truckPlate: e.truckPlate,
      normalizedPlate: e.normalizedPlate,
      deviceCode: e.deviceCode,
      sectorCode: e.sectorCode,
      occurredAt: e.occurredAt,
      createdAt: e.createdAt,
    })),
  }
  if (onlyTramo === 2) {
    phaseStore.tramoCompleted = 2
  } else if (!onlyTramo) {
    phaseStore.tramoCompleted = phaseStore.contractIntegration ? 3 : 2
  }

  const outFinal = {
    csv: {
      front_events: front_events_csv,
      rear_events: rear_events_csv,
      front_alerts: front_alerts_csv,
      rear_alerts: rear_alerts_csv,
      camera_lpr_status: camera_lpr_status_csv,
      clean_journeys: clean_journeys_csv,
      classified_circuits: classified_circuits_csv,
      final_circuits: final_circuits_csv,
      debug_matrix_classification: debug_matrix_classification_csv,
      lpr_merge_candidates: lpr_merge_candidates_csv,
      lpr_merge_applied: lpr_merge_applied_csv,
      lpr_merge_review: lpr_merge_review_csv,
      unclassified_journeys: unclassified_journeys_csv,
      rear_only_journeys_debug: rear_only_journeys_debug_csv,
      journey_merge_candidates: journey_merge_candidates_csv,
      merge_candidates_debug: merge_candidates_debug_csv,
      alerts_operational: operational_alerts_csv,
      transform_summary: transform_summary_csv,
      plate_registry_excluded: plateRegistryExcludedCsv,
      ...movimientosContratoCsv,
    },
    tables: {
      ...movimientosContratoTables,
      final_circuits: finalCircuitsTable,
      debug_matrix_classification: debugMatrixTable,
    },
    stats: {
      step1: step1Stat,
      plateRegistry: plateRegistryStat,
      step2: step2Stat,
      step3: step3Stat,
      step4: step4Stat,
      coherence: coherenceStat,
      validation: validationStats,
      executive: executiveStat,
      segmentTiming: null,
      circuitTiming: null,
      kpiTiemposBuilt: false,
      movimientosContrato: movimientosContratoStats,
    },
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
    kpiTiemposPrepared: {
      classifiedJourneys: classifiedForSegmentTiming,
      movimientosSnapshot: kpiTiemposMovimientosSnapshot,
    },
  } as EtlTransformOutput
  profileAt = etlProfileMark(profiler, 'exportCsv', profileAt)
  profiler.end()
  return outFinal
}
