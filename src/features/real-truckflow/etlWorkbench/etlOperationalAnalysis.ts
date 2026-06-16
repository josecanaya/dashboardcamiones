import { recordsToCsv } from './etlCsv'
import type { MergedTruckflowMovimientoRow, MergeStatus } from './etlTruckflowMovimientosMerge'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'
import { normalizePlate } from './etlExternalNormalization'
import {
  journeyNeedsOperationalEnrichment,
  MERGE_STATUSES_WITH_PRODUCT,
} from './etlTruckflowMovimientosMerge'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'
import { p50, p90, p95, std, mean } from '../../../utils/stats'
import { formatTransitionLabel } from './etlSegmentTiming'
import { parseTimestampMs } from './etlTimestampNormalize'

export type TruckflowSegmentForMerge = {
  journey_uid: string
  plate_normalized: string
  circuit_code: string
  circuit_label: string
  segment_order: number
  segment_name: string
  segment_from: string
  segment_to: string
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  segment_plant: string
  segment_leg: string
  executive_status: string
  valid_detail: string
}

const VALID_DETAILS_ANALYSIS = new Set([
  'COMPLETO',
  'DEDUCIDO',
  'DEDUCIDO_FUERTE',
  'DEDUCIDO_GRUPO',
  'VARIACION_OPERATIVA',
])

const GOOD_MERGE_STATUSES = MERGE_STATUSES_WITH_PRODUCT

export function buildTruckflowJourneysForMerge(
  finalRows: Record<string, unknown>[],
  timingByUid: Map<string, { start: string; end: string }>
): TruckflowJourneyForMerge[] {
  return finalRows.map((row) => {
    const uid = String(row.journey_uid ?? '')
    const timing = timingByUid.get(uid)
    const start = timing?.start ?? String(row.first_event_at ?? '')
    const end = timing?.end ?? String(row.last_event_at ?? '')
    const sMs = parseTimestampMs(start)
    const eMs = parseTimestampMs(end)
    const duration_min =
      Number.isFinite(sMs) && Number.isFinite(eMs) ? Math.round(((eMs - sMs) / 60000) * 100) / 100 : 0

    const plateOriginal = String(row.truck_plate ?? row.normalized_plate ?? '')
    const plateNorm =
      normalizePlateStrict(String(row.normalized_plate ?? '')) ||
      normalizePlate(String(row.normalized_plate ?? '')) ||
      normalizePlate(plateOriginal) ||
      ''

    const exec = String(row.executive_status ?? '')
    const matrix = String(row.matrix_final_status ?? '')
    const anomaly_real = exec === 'ANOMALO' || matrix === 'ANOMALO'

    return {
      journey_uid: uid,
      plate_original: plateOriginal,
      plate_normalized: plateNorm,
      start_time: start,
      end_time: end,
      duration_min,
      plant_scope: String(row.analysis_scope ?? ''),
      circuit_code: String(row.executive_circuit_code ?? row.matched_circuit_code ?? ''),
      circuit_label: String(row.executive_circuit_label ?? ''),
      executive_status: exec,
      valid_detail: String(row.valid_detail ?? ''),
      observed_sequence: String(row.logical_sequence_front ?? ''),
      expected_sequence: '',
      matched_sequence_name: String(row.matched_sequence_name ?? ''),
      matched_variation_name: String(row.matched_variation_name ?? ''),
      coverage_percent: Number(row.coverage_percent ?? 0),
      has_strong_point: Boolean(row.has_strong_point),
      useful_events_count: Number(row.useful_events_count ?? row.event_count_front ?? 0),
      anomaly_real,
      anomaly_type: anomaly_real ? matrix || exec : '',
      anomaly_origin_plant: String(row.anomaly_origin_plant ?? ''),
      anomaly_leg: String(row.anomaly_leg ?? ''),
      committee_reason: String(row.committee_reason ?? ''),
    }
  })
}

export function buildTruckflowSegmentsForMerge(
  legs: {
    journeyId: string
    plate: string
    executiveCircuitCode: string
    fromCode: string
    toCode: string
    durationMinutes: number
    occurredAtStart?: string
    occurredAtEnd?: string
  }[],
  journeyMeta: Map<
    string,
    { circuit_label: string; executive_status: string; valid_detail: string; plant_scope: string }
  >
): TruckflowSegmentForMerge[] {
  const byJourney = new Map<string, typeof legs>()
  for (const leg of legs) {
    const arr = byJourney.get(leg.journeyId) ?? []
    arr.push(leg)
    byJourney.set(leg.journeyId, arr)
  }

  const out: TruckflowSegmentForMerge[] = []
  for (const [journeyUid, jLegs] of byJourney) {
    const meta = journeyMeta.get(journeyUid)
    let order = 0
    for (const leg of jLegs) {
      order++
      out.push({
        journey_uid: journeyUid,
        plate_normalized: normalizePlate(leg.plate) ?? leg.plate,
        circuit_code: leg.executiveCircuitCode,
        circuit_label: meta?.circuit_label ?? '',
        segment_order: order,
        segment_name: formatTransitionLabel(leg.fromCode, leg.toCode),
        segment_from: leg.fromCode,
        segment_to: leg.toCode,
        segment_start_time: leg.occurredAtStart ?? '',
        segment_end_time: leg.occurredAtEnd ?? '',
        segment_duration_min: Math.round(leg.durationMinutes * 100) / 100,
        segment_plant: meta?.plant_scope ?? '',
        segment_leg: leg.fromCode.includes('SL_') ? 'SL' : leg.fromCode.includes('RIC') ? 'RIC' : '',
        executive_status: meta?.executive_status ?? '',
        valid_detail: meta?.valid_detail ?? '',
      })
    }
  }
  return out
}

export type CleanJourneyForAnalysis = {
  journey_uid: string
  plate_normalized: string
  start_time: string
  end_time: string
  duration_min: number
  circuit_code: string
  circuit_label: string
  executive_status: string
  valid_detail: string
  product_normalized: string
  platform_normalized: string
  planta_normalized: string
  movement_type: string
  external_operation_id: string
  merge_status: string
  merge_confidence: number
  coverage_percent: number
  has_strong_point: boolean
  observed_sequence: string
  expected_sequence: string
  matched_sequence_name: string
  matched_variation_name: string
  analysis_ready: boolean
  analysis_exclusion_reason: string
  operational_enrichment_ready: boolean
  missing_camera_discharge: boolean
  circuit_from_excel: boolean
  truckflow_circuit_code: string
}

export function evaluateAnalysisReady(row: MergedTruckflowMovimientoRow): {
  analysis_ready: boolean
  analysis_exclusion_reason: string
} {
  if (!row.journey_uid) return { analysis_ready: false, analysis_exclusion_reason: 'MISSING_JOURNEY' }
  if (!row.plate_normalized) return { analysis_ready: false, analysis_exclusion_reason: 'MISSING_PLATE' }
  if (!row.circuit_code || row.executive_status === 'NO_EVALUABLE') {
    if (!(row.circuit_from_excel && row.product_normalized)) {
      return { analysis_ready: false, analysis_exclusion_reason: 'NO_EVALUABLE_CIRCUIT' }
    }
  }
  if (!row.product_normalized) {
    return { analysis_ready: false, analysis_exclusion_reason: 'NO_PRODUCT' }
  }
  if (!GOOD_MERGE_STATUSES.has(row.merge_status)) {
    const reason =
      row.merge_status === 'NO_EXTERNAL_MATCH' ? 'NO_EXTERNAL_MATCH' : 'LOW_MERGE_CONFIDENCE'
    return { analysis_ready: false, analysis_exclusion_reason: reason }
  }
  if (row.merge_confidence < 0.6) {
    return { analysis_ready: false, analysis_exclusion_reason: 'LOW_MERGE_CONFIDENCE' }
  }

  if (
    row.anomaly_real &&
    row.circuit_from_excel &&
    row.product_normalized &&
    row.platform_normalized
  ) {
    return { analysis_ready: true, analysis_exclusion_reason: '' }
  }

  if (row.executive_status !== 'VALIDO' && row.executive_status !== 'PROBABLE') {
    return { analysis_ready: false, analysis_exclusion_reason: 'INCOMPLETE_EVIDENCE' }
  }
  if (!VALID_DETAILS_ANALYSIS.has(row.valid_detail) && row.valid_detail) {
    if (row.executive_status !== 'VALIDO') {
      return { analysis_ready: false, analysis_exclusion_reason: 'INCOMPLETE_EVIDENCE' }
    }
  }
  return { analysis_ready: true, analysis_exclusion_reason: '' }
}

export function evaluateOperationalEnrichmentReady(row: MergedTruckflowMovimientoRow): boolean {
  if (!row.product_normalized || !row.plate_normalized) return false
  if (!GOOD_MERGE_STATUSES.has(row.merge_status)) return false
  if (row.merge_confidence < 0.55) return false
  if (row.operational_enrichment_ready) return true
  if (row.circuit_from_excel && row.platform_normalized) return true
  if (journeyNeedsOperationalEnrichment(row) && row.platform_normalized) return true
  return false
}

export function buildCleanJourneysForAnalysis(
  merged: MergedTruckflowMovimientoRow[]
): CleanJourneyForAnalysis[] {
  return merged.map((row) => {
    const { analysis_ready, analysis_exclusion_reason } = evaluateAnalysisReady(row)
    const operational_enrichment_ready = evaluateOperationalEnrichmentReady(row)

    return {
      journey_uid: row.journey_uid,
      plate_normalized: row.plate_normalized,
      start_time: row.start_time,
      end_time: row.end_time,
      duration_min: row.duration_min,
      circuit_code: row.circuit_code,
      circuit_label: row.circuit_label,
      executive_status: row.executive_status,
      valid_detail: row.valid_detail,
      product_normalized: row.product_normalized,
      platform_normalized: row.platform_normalized,
      planta_normalized: row.planta_normalized,
      movement_type: row.movement_type,
      external_operation_id: row.external_operation_id,
      merge_status: row.merge_status,
      merge_confidence: row.merge_confidence,
      coverage_percent: row.coverage_percent,
      has_strong_point: row.has_strong_point,
      observed_sequence: row.observed_sequence,
      expected_sequence: row.expected_sequence,
      matched_sequence_name: row.matched_sequence_name,
      matched_variation_name: row.matched_variation_name,
      analysis_ready,
      analysis_exclusion_reason,
      operational_enrichment_ready,
      missing_camera_discharge: row.missing_camera_discharge,
      circuit_from_excel: row.circuit_from_excel ?? false,
      truckflow_circuit_code: row.truckflow_circuit_code ?? row.circuit_code,
    }
  })
}

export type SegmentScatterRow = Record<string, unknown>

const MIN_OUTLIER_GROUP = 5

export function buildSegmentScatterAnalysis(
  segments: TruckflowSegmentForMerge[],
  mergedByUid: Map<string, MergedTruckflowMovimientoRow>,
  cleanByUid: Map<string, CleanJourneyForAnalysis>
): SegmentScatterRow[] {
  const baseRows: SegmentScatterRow[] = segments.map((seg) => {
    const m = mergedByUid.get(seg.journey_uid)
    const c = cleanByUid.get(seg.journey_uid)
    return {
      journey_uid: seg.journey_uid,
      plate_normalized: seg.plate_normalized,
      product_normalized: m?.product_normalized ?? '',
      platform_normalized: m?.platform_normalized ?? '',
      planta_normalized: m?.planta_normalized ?? '',
      movement_type: m?.movement_type ?? '',
      circuit_code: seg.circuit_code,
      circuit_label: seg.circuit_label,
      segment_order: seg.segment_order,
      segment_name: seg.segment_name,
      segment_from: seg.segment_from,
      segment_to: seg.segment_to,
      segment_start_time: seg.segment_start_time,
      segment_end_time: seg.segment_end_time,
      segment_duration_min: seg.segment_duration_min,
      segment_plant: seg.segment_plant,
      segment_leg: seg.segment_leg,
      executive_status: seg.executive_status,
      valid_detail: seg.valid_detail,
      merge_status: m?.merge_status ?? '',
      merge_confidence: m?.merge_confidence ?? 0,
      coverage_percent: m?.coverage_percent ?? 0,
      has_strong_point: m?.has_strong_point ?? false,
      analysis_ready: c?.analysis_ready ?? false,
      analysis_exclusion_reason: c?.analysis_exclusion_reason ?? '',
      is_outlier: false,
      outlier_method: '',
      outlier_reason: '',
      p50_segment_duration: '',
      p90_segment_duration: '',
      p95_segment_duration: '',
      avg_segment_duration: '',
      std_segment_duration: '',
      segment_duration_zscore: '',
    }
  })

  type GroupKey = string
  const groups = new Map<GroupKey, number[]>()
  const groupMeta = new Map<GroupKey, { circuit: string; product: string; segment: string }>()

  for (const row of baseRows) {
    const circuit = String(row.circuit_code ?? '')
    const product = String(row.product_normalized ?? '')
    const segment = String(row.segment_name ?? '')
    const dur = Number(row.segment_duration_min)
    if (!Number.isFinite(dur) || dur <= 0) continue
    const key = `${circuit}|${product}|${segment}`
    const arr = groups.get(key) ?? []
    arr.push(dur)
    groups.set(key, arr)
    groupMeta.set(key, { circuit, product, segment })
  }

  const statsByGroup = new Map<
    GroupKey,
    {
      p50: number
      p90: number
      p95: number
      avg: number
      stddev: number
      method: string
    }
  >()

  for (const [key, durations] of groups) {
    const meta = groupMeta.get(key)!
    let durs = durations
    let method = 'circuit+product+segment'
    if (durs.length < MIN_OUTLIER_GROUP) {
      const fbKey = `${meta.circuit}|${meta.segment}`
      const fb: number[] = []
      for (const [k, vals] of groups) {
        if (k.startsWith(`${meta.circuit}|`) && k.endsWith(`|${meta.segment}`)) {
          fb.push(...vals)
        }
      }
      if (fb.length >= MIN_OUTLIER_GROUP) {
        durs = fb
        method = 'circuit+segment_fallback'
      } else {
        statsByGroup.set(key, {
          p50: 0,
          p90: 0,
          p95: 0,
          avg: 0,
          stddev: 0,
          method: 'INSUFFICIENT_SAMPLE',
        })
        continue
      }
    }
    const sorted = [...durs].sort((a, b) => a - b)
    statsByGroup.set(key, {
      p50: p50(sorted),
      p90: p90(sorted),
      p95: p95(sorted),
      avg: mean(sorted),
      stddev: std(sorted),
      method,
    })
  }

  for (const row of baseRows) {
    const circuit = String(row.circuit_code ?? '')
    const product = String(row.product_normalized ?? '')
    const segment = String(row.segment_name ?? '')
    const key = `${circuit}|${product}|${segment}`
    const st = statsByGroup.get(key)
    if (!st) continue
    row.p50_segment_duration = st.p50
    row.p90_segment_duration = st.p90
    row.p95_segment_duration = st.p95
    row.avg_segment_duration = st.avg
    row.std_segment_duration = st.stddev
    row.outlier_method = st.method
    const dur = Number(row.segment_duration_min)
    if (st.method !== 'INSUFFICIENT_SAMPLE' && Number.isFinite(dur) && dur > st.p95) {
      row.is_outlier = true
      row.outlier_reason = 'above_p95'
    }
    if (st.stddev > 0 && Number.isFinite(dur)) {
      row.segment_duration_zscore = Math.round(((dur - st.avg) / st.stddev) * 100) / 100
    }
  }

  return baseRows
}

export const TRUCKFLOW_JOURNEYS_FOR_MERGE_HEADERS = [
  'journey_uid',
  'plate_original',
  'plate_normalized',
  'start_time',
  'end_time',
  'duration_min',
  'plant_scope',
  'circuit_code',
  'circuit_label',
  'executive_status',
  'valid_detail',
  'observed_sequence',
  'expected_sequence',
  'matched_sequence_name',
  'matched_variation_name',
  'coverage_percent',
  'has_strong_point',
  'useful_events_count',
  'anomaly_real',
  'anomaly_type',
  'anomaly_origin_plant',
  'anomaly_leg',
  'committee_reason',
] as const

export function truckflowJourneysForMergeCsv(rows: TruckflowJourneyForMerge[]): string {
  return recordsToCsv([...TRUCKFLOW_JOURNEYS_FOR_MERGE_HEADERS], rows as unknown as Record<string, unknown>[])
}

export function truckflowSegmentsForMergeCsv(rows: TruckflowSegmentForMerge[]): string {
  const headers = [
    'journey_uid',
    'plate_normalized',
    'circuit_code',
    'circuit_label',
    'segment_order',
    'segment_name',
    'segment_from',
    'segment_to',
    'segment_start_time',
    'segment_end_time',
    'segment_duration_min',
    'segment_plant',
    'segment_leg',
    'executive_status',
    'valid_detail',
  ]
  return recordsToCsv(headers, rows as unknown as Record<string, unknown>[])
}

export function mergedTruckflowMovimientosCsv(rows: MergedTruckflowMovimientoRow[]): string {
  if (!rows.length) return 'journey_uid,merge_status\n'
  return recordsToCsv(Object.keys(rows[0]!), rows as unknown as Record<string, unknown>[])
}

export function cleanJourneysForAnalysisCsv(rows: CleanJourneyForAnalysis[]): string {
  const headers = Object.keys(rows[0] ?? { journey_uid: '' })
  return recordsToCsv(headers.length ? headers : ['journey_uid'], rows as unknown as Record<string, unknown>[])
}

export function segmentScatterAnalysisCsv(rows: SegmentScatterRow[]): string {
  const headers = [
    'journey_uid',
    'plate_normalized',
    'product_normalized',
    'platform_normalized',
    'planta_normalized',
    'movement_type',
    'circuit_code',
    'circuit_label',
    'segment_order',
    'segment_name',
    'segment_from',
    'segment_to',
    'segment_start_time',
    'segment_end_time',
    'segment_duration_min',
    'segment_plant',
    'segment_leg',
    'executive_status',
    'valid_detail',
    'merge_status',
    'merge_confidence',
    'coverage_percent',
    'has_strong_point',
    'analysis_ready',
    'analysis_exclusion_reason',
    'is_outlier',
    'outlier_method',
    'outlier_reason',
    'p50_segment_duration',
    'p90_segment_duration',
    'p95_segment_duration',
    'avg_segment_duration',
    'std_segment_duration',
    'segment_duration_zscore',
  ]
  return recordsToCsv(headers, rows)
}
