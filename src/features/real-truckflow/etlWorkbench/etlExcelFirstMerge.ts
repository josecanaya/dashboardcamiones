/**
 * @deprecated Para imports nuevos usar `contractExcelFirstEvidence` en truckflowTransform/contractFirst.
 */
import { recordsToCsv } from './etlCsv'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'
import { externalDischargeReferenceMs } from './etlTruckflowMovimientosMerge'
import type { TruckflowSegmentForMerge } from './etlOperationalAnalysis'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import {
  formatTransitionLabel,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  synthesizeInferredRollupLegsFromTimedSegments,
} from './etlSegmentTiming'
import { normalizePlateStrict, plateSimilarityScore } from '../../../services/circuitPlateOcr'
import {
  createPlateMatchCache,
  plateMatchKindCached,
  type PlateMatchCache,
} from './etlPlateMatchCache'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import { parseTimestampMs } from './etlTimestampNormalize'

export type MatchQuality =
  | 'EXTERNAL_MATCH_EXACT'
  | 'EXTERNAL_MATCH_PROBABLE'
  | 'EXTERNAL_MATCH_FRAGMENTED'
  | 'EXTERNAL_MATCH_WIDE_WINDOW'
  | 'EXTERNAL_MATCH_LOW_CONFIDENCE'
  | 'EXTERNAL_MATCH_FUZZY_PLATE'
  | 'EXTERNAL_MATCH_AMBIGUOUS'
  | 'NO_TRUCKFLOW_EVIDENCE'
  | 'INSUFFICIENT_EXTERNAL_DATA'

export type NoTruckflowReason =
  | 'NO_PLATE_IN_TRUCKFLOW'
  | 'PLATE_EXISTS_OUT_OF_TIME_WINDOW'
  | 'PLATE_EXISTS_ONLY_OUTSIDE_EXCEL_PERIOD'
  | 'TRUCKFLOW_JOURNEY_WITHOUT_VALID_TIME'
  | 'ONLY_FUZZY_MATCH_REJECTED'
  | 'MULTIPLE_AMBIGUOUS_REJECTED'
  | 'NO_RECONSTRUCTED_JOURNEY'
  | 'INSUFFICIENT_EXTERNAL_TIME'
  | 'UNKNOWN_NO_EVIDENCE'
  | ''

export type RouteQuality =
  | 'ROUTE_COMPLETE'
  | 'ROUTE_DEDUCED'
  | 'ROUTE_OPERATIONAL_VARIATION'
  | 'ROUTE_PARTIAL'
  | 'ROUTE_NO_DISCHARGE_POINT'
  | 'ROUTE_ANOMALOUS'
  | 'ROUTE_INCOMPLETE'
  | 'ROUTE_NO_EVALUABLE'
  | 'ROUTE_UNKNOWN'

export type OperationalContextFromExcel = {
  resolved_product: string
  resolved_platform: string
  resolved_circuit_family: string
  resolved_operational_point: string
  resolved_plant_hint: string
  resolution_source: string
}

export type SearchWindowSpec = {
  startMs: number
  endMs: number
  lowConfidence: boolean
  wide: boolean
}

export type MatchSignals = {
  exact_plate: boolean
  fuzzy_plate: boolean
  same_day: boolean
  wide_window: boolean
  low_confidence_date: boolean
  fragmented: boolean
  exact_time: boolean
  platform_compatible: boolean
  product_assigned: boolean
}

export type TruckflowEvidenceResult = {
  matched_journey_uids: string[]
  exact_plate_journey_uids: string[]
  fuzzy_plate_journey_uids: string[]
  truckflow_first_seen_at: string
  truckflow_last_seen_at: string
  combined_observed_sequence: string
  combined_segments: TruckflowSegmentForMerge[]
  evidence_count: number
  match_quality: MatchQuality
  route_quality: RouteQuality
  warnings: string[]
  match_signals: MatchSignals
  no_truckflow_reason: NoTruckflowReason
  diagnostic_detail: string
  nearest_truckflow_journey_uid: string
  nearest_truckflow_start_time: string
  nearest_truckflow_end_time: string
  nearest_time_delta_min: number
  same_plate_journey_count: number
  same_plate_journey_count_in_period: number
  same_plate_journey_count_in_window: number
  fuzzy_plate_candidates: number
  possible_duplicate_assignment: boolean
}

export type ExcelOperationWithTruckflowRow = {
  external_operation_id: string
  source_file: string
  source_date: string
  plate_normalized: string
  product_normalized: string
  producto_original: string
  platform_normalized: string
  plataforma_original: string
  planta_normalized: string
  movement_type: string
  external_ingreso_at: string
  external_calado_at: string
  external_salida_at: string
  contrato: string
  comprob: string
  cp_remito: string
  ctg: string
  cupo: string
  kgs_neto: string
  matched_journey_uids: string
  matched_journey_count: number
  truckflow_first_seen_at: string
  truckflow_last_seen_at: string
  truckflow_duration_min: number
  truckflow_circuit_codes: string
  truckflow_circuit_labels: string
  truckflow_executive_statuses: string
  truckflow_valid_details: string
  truckflow_observed_sequence_combined: string
  truckflow_coverage_percent_avg: number
  truckflow_has_strong_point_any: boolean
  resolved_product: string
  resolved_platform: string
  resolved_circuit_family: string
  resolved_operational_point: string
  resolved_plant_hint: string
  resolution_source: string
  match_quality: MatchQuality
  route_quality: RouteQuality
  analysis_ready_for_scatter: boolean
  analysis_ready_for_full_route_kpi: boolean
  analysis_warning: string
  evidence_count: number
  no_truckflow_reason: NoTruckflowReason
  diagnostic_detail: string
  possible_duplicate_assignment: boolean
}

export type ExcelNoTruckflowDiagnosticRow = {
  external_operation_id: string
  plate_normalized: string
  product_normalized: string
  platform_normalized: string
  external_ingreso_at: string
  external_calado_at: string
  external_salida_at: string
  source_date: string
  no_truckflow_reason: NoTruckflowReason
  nearest_truckflow_journey_uid: string
  nearest_truckflow_start_time: string
  nearest_truckflow_end_time: string
  nearest_time_delta_min: number
  same_plate_journey_count: number
  same_plate_journey_count_in_period: number
  same_plate_journey_count_in_window: number
  fuzzy_plate_candidates: number
  diagnostic_detail: string
}

export type ExcelOperationSegmentScatterRow = {
  external_operation_id: string
  journey_uid: string
  plate_normalized: string
  product_normalized: string
  platform_normalized: string
  resolved_circuit_family: string
  resolved_operational_point: string
  segment_order_global: number
  segment_order_journey: number
  segment_name: string
  segment_from: string
  segment_to: string
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  segment_plant: string
  segment_leg: string
  truckflow_circuit_code: string
  /** Circuito R* inferido desde plataforma/planta Excel (fuente para KPI tiempos). */
  resolved_executive_circuit_code: string
  truckflow_executive_status: string
  truckflow_valid_detail: string
  match_quality: MatchQuality
  route_quality: RouteQuality
  analysis_ready_for_scatter: boolean
  analysis_warning: string
  /** Salida operativa Excel (fallback fin estadía SL sin cámara egreso). */
  external_salida_at?: string
  /** Calado/descarga operativa Excel (fallback punto C16/Volcable sin cámara). */
  external_calado_at?: string
  /** Ingreso/balanza ingreso Excel (match patente). */
  external_ingreso_at?: string
  planta_normalized?: string
}

export type ExcelFirstCandidateDiscardCounters = {
  no_plate_in_truckflow: number
  exact_plate_candidates: number
  fuzzy_plate_candidates: number
  rejected_by_time_window: number
  rejected_by_low_ocr_similarity: number
  rejected_by_ambiguous_fuzzy: number
  rejected_by_site_or_plant: number
  candidates_after_prefilter: number
  candidates_after_time_filter: number
  candidates_after_fuzzy_filter: number
  operations_with_exact_plate: number
  operations_with_only_fuzzy_plate: number
  operations_without_any_candidate: number
}

export type ExcelFirstCandidateDiagnosticsRow = {
  external_operation_id: string
  plate_normalized: string
  operation_date: string
  exact_candidates_count: number
  fuzzy_candidates_count: number
  rejected_by_time_window: number
  rejected_by_low_ocr_similarity: number
  rejected_by_ambiguous_fuzzy: number
  final_candidate_count: number
  match_quality: MatchQuality
  no_truckflow_reason: NoTruckflowReason
}

export type ExcelFirstMergeOptions = {
  windowBeforeIngresoMin?: number
  windowAfterSalidaMin?: number
  singleAnchorWindowMin?: number
  plateOcrThreshold?: number
  /** Ventana amplia: ingreso+salida ±480, ancla ±720, source_date ±6h. Default true. */
  excelFirstWideWindow?: boolean
  plateMatchCache?: PlateMatchCache
  fuzzyCandidatesByPlate?: Map<string, TruckflowJourneyForMerge[]>
  /** Acota universo OCR fuzzy a journeys que pueden entrar en ventana (equivalente si true). Default true. */
  useCandidatePrefilter?: boolean
  onExcelOperationProgress?: (
    current: number,
    total: number,
    details?: Partial<ExcelFirstCandidateDiscardCounters>
  ) => void
}

export function createEmptyExcelFirstDiscardCounters(): ExcelFirstCandidateDiscardCounters {
  return {
    no_plate_in_truckflow: 0,
    exact_plate_candidates: 0,
    fuzzy_plate_candidates: 0,
    rejected_by_time_window: 0,
    rejected_by_low_ocr_similarity: 0,
    rejected_by_ambiguous_fuzzy: 0,
    rejected_by_site_or_plant: 0,
    candidates_after_prefilter: 0,
    candidates_after_time_filter: 0,
    candidates_after_fuzzy_filter: 0,
    operations_with_exact_plate: 0,
    operations_with_only_fuzzy_plate: 0,
    operations_without_any_candidate: 0,
  }
}

export function mergeExcelFirstDiscardCounters(
  into: ExcelFirstCandidateDiscardCounters,
  add: Partial<ExcelFirstCandidateDiscardCounters>
): void {
  for (const k of Object.keys(into) as (keyof ExcelFirstCandidateDiscardCounters)[]) {
    const v = add[k]
    if (typeof v === 'number' && v) into[k] += v
  }
}

export type ExcelPeriodContext = {
  excel_min_ingreso_at: string
  excel_max_salida_at: string
  excel_min_source_date: string
  excel_max_source_date: string
  excel_period_start_ms: number
  excel_period_end_ms: number
  truckflow_min_start_time: string
  truckflow_max_end_time: string
  truckflow_total_journeys_in_excel_period: number
  truckflow_total_journeys_outside_excel_period: number
  period_mismatch: boolean
  period_alert: string
}

const NARROW_OPTS: Required<Omit<ExcelFirstMergeOptions, 'excelFirstWideWindow'>> = {
  windowBeforeIngresoMin: 360,
  windowAfterSalidaMin: 360,
  singleAnchorWindowMin: 480,
  plateOcrThreshold: 0.82,
}

const WIDE_OPTS: Required<Omit<ExcelFirstMergeOptions, 'excelFirstWideWindow'>> = {
  windowBeforeIngresoMin: 480,
  windowAfterSalidaMin: 480,
  singleAnchorWindowMin: 720,
  plateOcrThreshold: 0.82,
}

const SCATTER_MATCH_QUALITIES = new Set<MatchQuality>([
  'EXTERNAL_MATCH_EXACT',
  'EXTERNAL_MATCH_PROBABLE',
  'EXTERNAL_MATCH_FRAGMENTED',
  'EXTERNAL_MATCH_WIDE_WINDOW',
  'EXTERNAL_MATCH_FUZZY_PLATE',
])

const KPI_ROUTE_QUALITIES = new Set<RouteQuality>([
  'ROUTE_COMPLETE',
  'ROUTE_DEDUCED',
  'ROUTE_OPERATIONAL_VARIATION',
])

const KPI_MATCH_QUALITIES = new Set<MatchQuality>([
  'EXTERNAL_MATCH_EXACT',
  'EXTERNAL_MATCH_PROBABLE',
  'EXTERNAL_MATCH_FRAGMENTED',
])

const ROUTE_QUALITY_RANK: Record<RouteQuality, number> = {
  ROUTE_COMPLETE: 0,
  ROUTE_DEDUCED: 1,
  ROUTE_OPERATIONAL_VARIATION: 2,
  ROUTE_PARTIAL: 3,
  ROUTE_NO_DISCHARGE_POINT: 4,
  ROUTE_INCOMPLETE: 5,
  ROUTE_ANOMALOUS: 6,
  ROUTE_NO_EVALUABLE: 7,
  ROUTE_UNKNOWN: 8,
}

function parseMs(iso: string): number {
  const t = parseTimestampMs(iso)
  return Number.isFinite(t) ? t : NaN
}

function dayKeyFromIso(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function journeyHasValidTime(j: TruckflowJourneyForMerge): boolean {
  return Number.isFinite(parseMs(j.start_time)) || Number.isFinite(parseMs(j.end_time))
}

function journeyOverlapsWindow(
  journey: TruckflowJourneyForMerge,
  window: { startMs: number; endMs: number }
): boolean {
  const s = parseMs(journey.start_time)
  const e = parseMs(journey.end_time)
  if (!Number.isFinite(s) && !Number.isFinite(e)) return false
  const js = Number.isFinite(s) ? s : e
  const je = Number.isFinite(e) ? e : s
  return je >= window.startMs && js <= window.endMs
}

function journeyInPeriod(
  journey: TruckflowJourneyForMerge,
  periodStartMs: number,
  periodEndMs: number
): boolean {
  const s = parseMs(journey.start_time)
  const e = parseMs(journey.end_time)
  const js = Number.isFinite(s) ? s : e
  const je = Number.isFinite(e) ? e : s
  if (!Number.isFinite(js) && !Number.isFinite(je)) return false
  return je >= periodStartMs && js <= periodEndMs
}

function plateMatchKind(
  plateJ: string,
  plateM: string,
  ocrThreshold: number,
  cache?: PlateMatchCache
): 'exact' | 'fuzzy' | null {
  if (cache) return plateMatchKindCached(plateJ, plateM, ocrThreshold, cache)
  return plateMatchKindCached(plateJ, plateM, ocrThreshold, createPlateMatchCache())
}

function buildWindowFromOpts(
  mov: ExternalMovimientoContratoNormalized,
  opts: Required<Omit<ExcelFirstMergeOptions, 'excelFirstWideWindow'>>,
  wide: boolean
): SearchWindowSpec | null {
  const ing = parseMs(mov.external_ingreso_at)
  const cal = parseMs(mov.external_calado_at)
  const sal = parseMs(mov.external_salida_at)
  const w = opts.singleAnchorWindowMin * 60000

  if (Number.isFinite(ing) && Number.isFinite(sal)) {
    return {
      startMs: ing - opts.windowBeforeIngresoMin * 60000,
      endMs: sal + opts.windowAfterSalidaMin * 60000,
      lowConfidence: false,
      wide,
    }
  }
  if (Number.isFinite(sal)) {
    return { startMs: sal - w, endMs: sal + w, lowConfidence: false, wide }
  }
  if (Number.isFinite(cal)) {
    return { startMs: cal - w, endMs: cal + w, lowConfidence: false, wide }
  }
  if (Number.isFinite(ing)) {
    return { startMs: ing - w, endMs: ing + w, lowConfidence: false, wide }
  }
  if (mov.source_date) {
    const d = new Date(`${mov.source_date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) {
      const pad = wide ? 6 * 3600000 : 0
      const dayStart = new Date(d)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(d)
      dayEnd.setHours(23, 59, 59, 999)
      return {
        startMs: dayStart.getTime() - pad,
        endMs: dayEnd.getTime() + pad,
        lowConfidence: true,
        wide,
      }
    }
  }
  return null
}

export function computeExcelSearchWindow(
  mov: ExternalMovimientoContratoNormalized,
  opts: Required<Omit<ExcelFirstMergeOptions, 'excelFirstWideWindow'>>,
  wide = false
): SearchWindowSpec | null {
  return buildWindowFromOpts(mov, opts, wide)
}

export function buildExcelPeriodContext(
  movimientos: ExternalMovimientoContratoNormalized[],
  truckflowJourneys: TruckflowJourneyForMerge[]
): ExcelPeriodContext {
  let excelMinIng = ''
  let excelMaxSal = ''
  let excelMinSrc = ''
  let excelMaxSrc = ''

  for (const m of movimientos) {
    if (m.external_ingreso_at && (!excelMinIng || m.external_ingreso_at < excelMinIng)) {
      excelMinIng = m.external_ingreso_at
    }
    if (m.external_salida_at && (!excelMaxSal || m.external_salida_at > excelMaxSal)) {
      excelMaxSal = m.external_salida_at
    }
    if (m.source_date && (!excelMinSrc || m.source_date < excelMinSrc)) excelMinSrc = m.source_date
    if (m.source_date && (!excelMaxSrc || m.source_date > excelMaxSrc)) excelMaxSrc = m.source_date
  }

  const periodStartKey = excelMinSrc || dayKeyFromIso(excelMinIng) || ''
  const periodEndKey = excelMaxSrc || dayKeyFromIso(excelMaxSal) || ''
  const periodStartMs = periodStartKey ?
    new Date(`${periodStartKey}T00:00:00`).getTime()
  : NaN
  const periodEndMs = periodEndKey ?
    new Date(`${periodEndKey}T23:59:59.999`).getTime()
  : NaN

  let tfMin = ''
  let tfMax = ''
  let inPeriod = 0
  let outsidePeriod = 0

  for (const j of truckflowJourneys) {
    if (j.start_time && (!tfMin || j.start_time < tfMin)) tfMin = j.start_time
    if (j.end_time && (!tfMax || j.end_time > tfMax)) tfMax = j.end_time
    if (Number.isFinite(periodStartMs) && Number.isFinite(periodEndMs)) {
      if (journeyInPeriod(j, periodStartMs, periodEndMs)) inPeriod++
      else outsidePeriod++
    }
  }

  let periodMismatch = false
  let periodAlert = ''
  if (
    Number.isFinite(periodStartMs) &&
    Number.isFinite(periodEndMs) &&
    tfMin &&
    tfMax
  ) {
    const tfMinMs = parseMs(tfMin)
    const tfMaxMs = parseMs(tfMax)
    if (
      Number.isFinite(tfMinMs) &&
      Number.isFinite(tfMaxMs) &&
      (tfMaxMs < periodStartMs || tfMinMs > periodEndMs)
    ) {
      periodMismatch = true
      periodAlert = 'PERIOD_MISMATCH'
    }
  }

  return {
    excel_min_ingreso_at: excelMinIng,
    excel_max_salida_at: excelMaxSal,
    excel_min_source_date: excelMinSrc,
    excel_max_source_date: excelMaxSrc,
    excel_period_start_ms: periodStartMs,
    excel_period_end_ms: periodEndMs,
    truckflow_min_start_time: tfMin,
    truckflow_max_end_time: tfMax,
    truckflow_total_journeys_in_excel_period: inPeriod,
    truckflow_total_journeys_outside_excel_period: outsidePeriod,
    period_mismatch: periodMismatch,
    period_alert: periodAlert,
  }
}

export function resolveOperationalContextFromExcel(
  mov: ExternalMovimientoContratoNormalized
): OperationalContextFromExcel {
  const platform = (mov.platform_normalized ?? '').toUpperCase()
  const product = mov.product_normalized ?? ''
  let family = ''

  if (platform === 'CELDA_16' || platform.startsWith('CELDA_16') || platform.includes('CELDA')) {
    family = 'CELDA16'
  } else if (platform.startsWith('VOLCABLE_PTO_')) {
    family = 'SAN_LORENZO_VOLCABLE'
  } else if (platform.startsWith('VOLCABLE_') || platform.includes('VOLCABLE')) {
    family = 'VOLCABLE'
  } else if (
    platform.startsWith('KEPPLER_') ||
    platform.startsWith('KEPLER_') ||
    platform.includes('KEPPLER') ||
    platform.includes('KEPLER')
  ) {
    family = 'KEPLER'
  } else if (platform === 'ACEITE_OSL' || platform.includes('ACEITE')) {
    family = 'LIQUIDO'
  }

  if (!family && platform.startsWith('VOLCABLE')) family = 'VOLCABLE'

  const explicitMap: Record<string, string> = {
    CELDA_16: 'CELDA16',
    VOLCABLE_1: 'VOLCABLE',
    VOLCABLE_2: 'VOLCABLE',
    VOLCABLE_3: 'VOLCABLE',
    VOLCABLE_4: 'VOLCABLE',
    VOLCABLE_5: 'VOLCABLE',
    VOLCABLE_PTO_1: 'SAN_LORENZO_VOLCABLE',
    VOLCABLE_PTO_2: 'SAN_LORENZO_VOLCABLE',
    VOLCABLE_PTO_3: 'SAN_LORENZO_VOLCABLE',
    VOLCABLE_PTO_4: 'SAN_LORENZO_VOLCABLE',
    VOLCABLE_PTO_5: 'SAN_LORENZO_VOLCABLE',
    KEPPLER_1: 'KEPLER',
    KEPPLER_2: 'KEPLER',
    KEPLER_1: 'KEPLER',
    KEPLER_2: 'KEPLER',
    ACEITE_OSL: 'LIQUIDO',
  }
  if (!family && explicitMap[platform]) family = explicitMap[platform]!

  return {
    resolved_product: product,
    resolved_platform: mov.platform_normalized ?? '',
    resolved_circuit_family: family,
    resolved_operational_point: mov.platform_normalized ?? '',
    resolved_plant_hint: mov.planta_normalized ?? '',
    resolution_source: product || mov.platform_normalized ? 'EXCEL_PLATFORM_PRODUCT' : '',
  }
}

function committeeReasonImpliesOperationalVariation(committee: string, matchedVariation: string): boolean {
  const markers = [
    'ESPERA_EN_CALADA',
    'POSIBLE_RECHAZO',
    'DOBLE_PREINGRESO',
    'RECALADO_CONTEMPLADO',
    'RECALADO',
  ]
  const haystack = `${committee} ${matchedVariation}`.toUpperCase()
  return markers.some((m) => haystack.includes(m))
}

/** Rechazos operativos: no se emparejan con filas Excel (no hay movimiento de descarga). */
export function isPossibleRejectionTruckflowJourney(journey: TruckflowJourneyForMerge): boolean {
  const committee = String(journey.committee_reason ?? '').toUpperCase()
  const variation = String(journey.matched_variation_name ?? '').toUpperCase()
  return (
    committee.includes('POSIBLE_RECHAZO') ||
    committee.includes('RECHAZO_OPERATIVO') ||
    variation.includes('POSIBLE_RECHAZO') ||
    variation.includes('RECHAZO_OPERATIVO')
  )
}

function withoutPossibleRejectionJourneys(journeys: TruckflowJourneyForMerge[]): TruckflowJourneyForMerge[] {
  return journeys.filter((j) => !isPossibleRejectionTruckflowJourney(j))
}

export function deriveRouteQualityForJourney(journey: TruckflowJourneyForMerge): RouteQuality {
  const exec = (journey.executive_status ?? '').toUpperCase()
  const valid = (journey.valid_detail ?? '').toUpperCase()
  const committee = (journey.committee_reason ?? '').toUpperCase()
  const matchedVariation = (journey.matched_variation_name ?? '').toUpperCase()
  const circuit = (journey.circuit_code ?? '').toUpperCase()

  if (
    committee.includes('SIN_PUNTO') ||
    committee.includes('DESCARGA_SIN_PUNTO') ||
    circuit.includes('DESCARGA_SIN_PUNTO') ||
    circuit.includes('SIN_PUNTO')
  ) {
    return 'ROUTE_NO_DISCHARGE_POINT'
  }
  if (exec === 'NO_EVALUABLE') return 'ROUTE_NO_EVALUABLE'
  if (exec === 'NO_DIFERENCIABLE') return 'ROUTE_NO_DISCHARGE_POINT'
  if (exec === 'ANOMALO') return 'ROUTE_ANOMALOUS'
  if (committeeReasonImpliesOperationalVariation(committee, matchedVariation)) {
    return 'ROUTE_OPERATIONAL_VARIATION'
  }
  if (exec === 'INCOMPLETO') return 'ROUTE_INCOMPLETE'
  if (valid.includes('VARIACION_OPERATIVA') || valid.includes('VARIACION')) {
    return 'ROUTE_OPERATIONAL_VARIATION'
  }
  if (valid.includes('DEDUCIDO')) return 'ROUTE_DEDUCED'
  if (exec === 'VALIDO' && (valid === 'COMPLETO' || valid === '')) return 'ROUTE_COMPLETE'
  if (exec === 'PROBABLE') return 'ROUTE_DEDUCED'
  return 'ROUTE_UNKNOWN'
}

function combineRouteQualities(qualities: RouteQuality[], fragmented: boolean): RouteQuality {
  if (!qualities.length) return 'ROUTE_UNKNOWN'
  let worst: RouteQuality = 'ROUTE_COMPLETE'
  let worstRank = -1
  for (const q of qualities) {
    const r = ROUTE_QUALITY_RANK[q] ?? 8
    if (r > worstRank) {
      worstRank = r
      worst = q
    }
  }
  if (fragmented && qualities.length > 1) {
    const partialRank = ROUTE_QUALITY_RANK.ROUTE_PARTIAL
    if (worstRank < partialRank) return 'ROUTE_PARTIAL'
  }
  return worst
}

function temporalDeltaToJourney(journey: TruckflowJourneyForMerge, mov: ExternalMovimientoContratoNormalized): number {
  const ref = externalDischargeReferenceMs(mov)
  if (!Number.isFinite(ref)) return 999
  const jEnd = parseMs(journey.end_time)
  const jStart = parseMs(journey.start_time)
  if (Number.isFinite(jEnd)) {
    const toEnd = Math.abs(ref - jEnd) / 60000
    if (Number.isFinite(jStart)) return Math.min(toEnd, Math.abs(ref - jStart) / 60000)
    return toEnd
  }
  if (Number.isFinite(jStart)) return Math.abs(ref - jStart) / 60000
  return 999
}

function temporalOverlapScore(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized
): number {
  const ref = externalDischargeReferenceMs(mov)
  const s = parseMs(journey.start_time)
  const e = parseMs(journey.end_time)
  if (!Number.isFinite(ref) || !Number.isFinite(s) || !Number.isFinite(e)) return 0
  const slack = 90 * 60000
  if (ref >= s - slack && ref <= e + slack) return 3
  const mid = (s + e) / 2
  const deltaMin = Math.abs(ref - mid) / 60000
  if (deltaMin <= 120) return 2
  if (deltaMin <= 360) return 1
  return 0
}

export type PlateIndex = {
  byExactPlate: Map<string, TruckflowJourneyForMerge[]>
  /** Journeys por día calendario (start o end). */
  byDay: Map<string, TruckflowJourneyForMerge[]>
  all: TruckflowJourneyForMerge[]
}

export function buildPlateIndex(journeys: TruckflowJourneyForMerge[]): PlateIndex {
  const byExactPlate = new Map<string, TruckflowJourneyForMerge[]>()
  const byDay = new Map<string, TruckflowJourneyForMerge[]>()
  for (const j of journeys) {
    const p = normalizePlateStrict(j.plate_normalized)
    if (p) {
      const arr = byExactPlate.get(p) ?? []
      arr.push(j)
      byExactPlate.set(p, arr)
    }
    const day = dayKeyFromIso(j.start_time) || dayKeyFromIso(j.end_time)
    if (day) {
      const darr = byDay.get(day) ?? []
      darr.push(j)
      byDay.set(day, darr)
    }
  }
  return { byExactPlate, byDay, all: journeys }
}

function normalizePlantScopeKey(v: string): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
}

/** Solo métrica: no filtra matches (evita cambiar resultados). */
function countPlantScopeMismatchesInPool(
  mov: ExternalMovimientoContratoNormalized,
  pool: TruckflowJourneyForMerge[]
): number {
  const excelPlant = normalizePlantScopeKey(mov.planta_normalized ?? '')
  if (!excelPlant) return 0
  let n = 0
  for (const j of pool) {
    const tf = normalizePlantScopeKey(j.plant_scope ?? '')
    if (tf && tf !== excelPlant) n++
  }
  return n
}

/** Journeys que pueden pasar filterJourneysInWindow para esta ventana (prefiltro seguro antes de OCR fuzzy). */
export function journeysForFuzzyOcrPrefilter(
  plateIndex: PlateIndex,
  window: SearchWindowSpec,
  mov: ExternalMovimientoContratoNormalized
): TruckflowJourneyForMerge[] {
  const dayKey = mov.source_date || dayKeyFromIso(mov.external_salida_at) || dayKeyFromIso(mov.external_ingreso_at)
  const out: TruckflowJourneyForMerge[] = []
  const seen = new Set<string>()
  for (const j of plateIndex.all) {
    if (!journeyOverlapsWindow(j, window) && !(window.lowConfidence && sameCalendarDay(j, dayKey))) continue
    if (seen.has(j.journey_uid)) continue
    seen.add(j.journey_uid)
    out.push(j)
  }
  return out
}

type FuzzyCollectResult = {
  fuzzy: TruckflowJourneyForMerge[]
  rejectedLowOcr: number
}

function fuzzyMemoCacheKey(plateM: string, window: SearchWindowSpec, poolSize: number): string {
  return `${plateM}|${window.startMs}|${window.endMs}|${poolSize}`
}

function collectFuzzyCandidatesWithDiscardStats(
  plateM: string,
  pool: TruckflowJourneyForMerge[],
  ocrThreshold: number,
  cache: PlateMatchCache | undefined,
  memo: Map<string, TruckflowJourneyForMerge[]> | undefined,
  memoKey: string
): FuzzyCollectResult {
  if (memo?.has(memoKey)) {
    const fuzzy = memo.get(memoKey)!
    return { fuzzy, rejectedLowOcr: 0 }
  }
  const out: TruckflowJourneyForMerge[] = []
  let rejectedLowOcr = 0
  const c = cache ?? createPlateMatchCache()
  for (const j of pool) {
    const kind = plateMatchKind(j.plate_normalized, plateM, ocrThreshold, c)
    if (kind === 'fuzzy') out.push(j)
    else if (kind !== 'exact') rejectedLowOcr++
  }
  memo?.set(memoKey, out)
  return { fuzzy: out, rejectedLowOcr }
}

function collectFuzzyCandidates(
  plateM: string,
  allJourneys: TruckflowJourneyForMerge[],
  ocrThreshold: number,
  cache?: PlateMatchCache,
  memo?: Map<string, TruckflowJourneyForMerge[]>
): TruckflowJourneyForMerge[] {
  const memoKey = `${plateM}|all|${allJourneys.length}`
  return collectFuzzyCandidatesWithDiscardStats(plateM, allJourneys, ocrThreshold, cache, memo, memoKey).fuzzy
}

function filterJourneysInWindow(
  journeys: TruckflowJourneyForMerge[],
  window: SearchWindowSpec,
  mov: ExternalMovimientoContratoNormalized
): TruckflowJourneyForMerge[] {
  return journeys.filter((j) => {
    if (journeyOverlapsWindow(j, window)) return true
    if (window.lowConfidence) {
      const day = mov.source_date || dayKeyFromIso(mov.external_salida_at)
      return sameCalendarDay(j, day)
    }
    return false
  })
}

function sameCalendarDay(journey: TruckflowJourneyForMerge, dayKey: string): boolean {
  if (!dayKey) return false
  const jDay = dayKeyFromIso(journey.start_time) || dayKeyFromIso(journey.end_time)
  return Boolean(jDay && jDay === dayKey)
}

function journeyBoundsMs(j: TruckflowJourneyForMerge): { startMs: number; endMs: number } | null {
  const s = parseMs(j.start_time)
  const e = parseMs(j.end_time)
  if (!Number.isFinite(s) && !Number.isFinite(e)) return null
  const startMs = Number.isFinite(s) ? s : e
  const endMs = Number.isFinite(e) ? e : s
  return { startMs, endMs: Math.max(startMs, endMs) }
}

/** Evita mezclar recorridos distintos del mismo camión (>6 h entre journeys). */
function selectCoherentJourneyCluster(
  matched: TruckflowJourneyForMerge[],
  mov: ExternalMovimientoContratoNormalized
): TruckflowJourneyForMerge[] {
  if (matched.length <= 1) return matched

  const sorted = [...matched].sort((a, b) => parseMs(a.start_time) - parseMs(b.start_time))
  const gapMs = OPERATIONAL_TRIP_GAP_MAX_MINUTES * 60000
  const clusters: TruckflowJourneyForMerge[][] = [[sorted[0]!]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = journeyBoundsMs(sorted[i - 1]!)
    const cur = journeyBoundsMs(sorted[i]!)
    const cluster = clusters[clusters.length - 1]!
    if (!prev || !cur || cur.startMs - prev.endMs > gapMs) {
      clusters.push([sorted[i]!])
    } else {
      cluster.push(sorted[i]!)
    }
  }

  if (clusters.length === 1) return clusters[0]!

  const ingMs = parseMs(mov.external_ingreso_at)
  const salMs = parseMs(mov.external_salida_at)
  let best = clusters[0]!
  let bestScore = -Infinity

  for (const cluster of clusters) {
    const bounds = cluster
      .map((j) => journeyBoundsMs(j))
      .filter((b): b is { startMs: number; endMs: number } => b !== null)
    if (!bounds.length) continue
    const minS = Math.min(...bounds.map((b) => b.startMs))
    const maxE = Math.max(...bounds.map((b) => b.endMs))
    const spanMin = (maxE - minS) / 60000
    let score = 0
    if (spanMin > INFERRED_KPI_ROLLUP_MAX_MINUTES) score -= 10_000
    if (Number.isFinite(ingMs) && Number.isFinite(salMs)) {
      if (maxE >= ingMs && minS <= salMs) score += 1000
      score -= Math.abs((minS + maxE) / 2 - (ingMs + salMs) / 2) / 60000
    } else if (Number.isFinite(salMs)) {
      score -= Math.abs(maxE - salMs) / 60000
    } else if (Number.isFinite(ingMs)) {
      score -= Math.abs(minS - ingMs) / 60000
    }
    if (score > bestScore) {
      bestScore = score
      best = cluster
    }
  }
  return best
}

function buildEvidenceFromMatches(
  matched: TruckflowJourneyForMerge[],
  exactMatches: TruckflowJourneyForMerge[],
  fuzzyMatches: TruckflowJourneyForMerge[],
  mov: ExternalMovimientoContratoNormalized,
  truckflowSegments: TruckflowSegmentForMerge[],
  windowUsed: SearchWindowSpec,
  narrowHadMatch: boolean
): Omit<
  TruckflowEvidenceResult,
  | 'no_truckflow_reason'
  | 'diagnostic_detail'
  | 'nearest_truckflow_journey_uid'
  | 'nearest_truckflow_start_time'
  | 'nearest_truckflow_end_time'
  | 'nearest_time_delta_min'
  | 'same_plate_journey_count'
  | 'same_plate_journey_count_in_period'
  | 'same_plate_journey_count_in_window'
  | 'fuzzy_plate_candidates'
  | 'possible_duplicate_assignment'
> {
  matched.sort((a, b) => parseMs(a.start_time) - parseMs(b.start_time))
  const matchedIds = matched.map((j) => j.journey_uid)
  const sequences = matched.map((j) => String(j.observed_sequence ?? '').trim()).filter(Boolean)
  const combinedSeq = sequences.join('>')

  const combinedSegments: TruckflowSegmentForMerge[] = []
  for (const uid of matchedIds) {
    const segs = truckflowSegments
      .filter((s) => s.journey_uid === uid)
      .sort((a, b) => a.segment_order - b.segment_order)
    combinedSegments.push(...segs)
  }

  const starts = matched.map((j) => j.start_time).filter(Boolean)
  const ends = matched.map((j) => j.end_time).filter(Boolean)
  const fragmented = matched.length > 1
  const route_quality = combineRouteQualities(matched.map(deriveRouteQualityForJourney), fragmented)

  const warnings: string[] = []
  if (windowUsed.lowConfidence) warnings.push('SOURCE_DATE_ONLY_WINDOW')
  if (fragmented) warnings.push('FRAGMENTED_JOURNEYS')

  let match_quality: MatchQuality
  const usedExact = exactMatches.length > 0

  if (windowUsed.lowConfidence && !narrowHadMatch) {
    match_quality = 'EXTERNAL_MATCH_LOW_CONFIDENCE'
    warnings.push('LOW_CONFIDENCE_DATE_ONLY')
  } else if (windowUsed.wide && !narrowHadMatch) {
    match_quality = fragmented ? 'EXTERNAL_MATCH_FRAGMENTED' : 'EXTERNAL_MATCH_WIDE_WINDOW'
    warnings.push('WIDE_WINDOW_MATCH')
  } else if (usedExact) {
    if (fragmented) {
      match_quality = 'EXTERNAL_MATCH_FRAGMENTED'
    } else {
      const overlap = temporalOverlapScore(matched[0]!, mov)
      match_quality = overlap >= 2 ? 'EXTERNAL_MATCH_EXACT' : 'EXTERNAL_MATCH_PROBABLE'
    }
  } else {
    if (fuzzyMatches.length > 1) {
      const sims = fuzzyMatches.map((j) => plateSimilarityScore(j.plate_normalized, mov.plate_normalized))
      const spread = Math.max(...sims) - Math.min(...sims)
      match_quality = spread < 0.08 ? 'EXTERNAL_MATCH_AMBIGUOUS' : 'EXTERNAL_MATCH_FUZZY_PLATE'
      if (match_quality === 'EXTERNAL_MATCH_AMBIGUOUS') warnings.push('FUZZY_PLATE_AMBIGUOUS')
    } else {
      match_quality = fragmented ? 'EXTERNAL_MATCH_FRAGMENTED' : 'EXTERNAL_MATCH_FUZZY_PLATE'
    }
    warnings.push('FUZZY_PLATE_MATCH')
  }

  const match_signals: MatchSignals = {
    exact_plate: usedExact,
    fuzzy_plate: !usedExact && fuzzyMatches.length > 0,
    same_day: windowUsed.lowConfidence,
    wide_window: windowUsed.wide && !narrowHadMatch,
    low_confidence_date: windowUsed.lowConfidence && !narrowHadMatch,
    fragmented,
    exact_time: !fragmented && usedExact && temporalOverlapScore(matched[0]!, mov) >= 2,
    platform_compatible: Boolean(mov.platform_normalized),
    product_assigned: Boolean(mov.product_normalized),
  }

  return {
    matched_journey_uids: matchedIds,
    exact_plate_journey_uids: exactMatches.map((j) => j.journey_uid),
    fuzzy_plate_journey_uids: fuzzyMatches.map((j) => j.journey_uid),
    truckflow_first_seen_at: starts.sort()[0] ?? '',
    truckflow_last_seen_at: ends.sort().reverse()[0] ?? '',
    combined_observed_sequence: combinedSeq,
    combined_segments: combinedSegments,
    evidence_count: matched.length,
    match_quality,
    route_quality,
    warnings,
    match_signals,
  }
}

export function diagnoseNoTruckflowEvidence(
  mov: ExternalMovimientoContratoNormalized,
  plateIndex: PlateIndex,
  period: ExcelPeriodContext,
  narrowWindow: SearchWindowSpec | null,
  wideWindow: SearchWindowSpec | null,
  ocrThreshold: number
): Pick<
  TruckflowEvidenceResult,
  | 'no_truckflow_reason'
  | 'diagnostic_detail'
  | 'nearest_truckflow_journey_uid'
  | 'nearest_truckflow_start_time'
  | 'nearest_truckflow_end_time'
  | 'nearest_time_delta_min'
  | 'same_plate_journey_count'
  | 'same_plate_journey_count_in_period'
  | 'same_plate_journey_count_in_window'
  | 'fuzzy_plate_candidates'
> {
  const plateM = normalizePlateStrict(mov.plate_normalized || mov.patente_original)
  const empty = {
    no_truckflow_reason: 'UNKNOWN_NO_EVIDENCE' as NoTruckflowReason,
    diagnostic_detail: '',
    nearest_truckflow_journey_uid: '',
    nearest_truckflow_start_time: '',
    nearest_truckflow_end_time: '',
    nearest_time_delta_min: 0,
    same_plate_journey_count: 0,
    same_plate_journey_count_in_period: 0,
    same_plate_journey_count_in_window: 0,
    fuzzy_plate_candidates: 0,
  }

  if (!plateM) {
    return { ...empty, no_truckflow_reason: 'INSUFFICIENT_EXTERNAL_TIME', diagnostic_detail: 'MISSING_PLATE' }
  }

  const exactPlateJourneys = plateIndex.byExactPlate.get(plateM) ?? []
  const fuzzyAll = collectFuzzyCandidates(plateM, plateIndex.all, ocrThreshold)

  if (!exactPlateJourneys.length && !fuzzyAll.length) {
    return {
      ...empty,
      no_truckflow_reason: 'NO_PLATE_IN_TRUCKFLOW',
      diagnostic_detail: period.period_mismatch ? period.period_alert : 'plate_not_in_any_journey',
    }
  }

  if (!narrowWindow && !wideWindow) {
    return {
      ...empty,
      no_truckflow_reason: 'INSUFFICIENT_EXTERNAL_TIME',
      diagnostic_detail: 'NO_INGRESO_CALADO_SALIDA_NOR_SOURCE_DATE',
      same_plate_journey_count: exactPlateJourneys.length,
      fuzzy_plate_candidates: fuzzyAll.length,
    }
  }

  const searchWindow = wideWindow ?? narrowWindow!

  const inWindowExact = filterJourneysInWindow(exactPlateJourneys, searchWindow, mov)
  const inPeriodExact = exactPlateJourneys.filter((j) =>
    journeyInPeriod(j, period.excel_period_start_ms, period.excel_period_end_ms)
  )

  let nearest: TruckflowJourneyForMerge | null = null
  let nearestDelta = 999
  for (const j of exactPlateJourneys.length ? exactPlateJourneys : fuzzyAll) {
    const d = temporalDeltaToJourney(j, mov)
    if (d < nearestDelta) {
      nearestDelta = d
      nearest = j
    }
  }

  const base = {
    ...empty,
    nearest_truckflow_journey_uid: nearest?.journey_uid ?? '',
    nearest_truckflow_start_time: nearest?.start_time ?? '',
    nearest_truckflow_end_time: nearest?.end_time ?? '',
    nearest_time_delta_min: Number.isFinite(nearestDelta) ? Math.round(nearestDelta * 100) / 100 : 0,
    same_plate_journey_count: exactPlateJourneys.length,
    same_plate_journey_count_in_period: inPeriodExact.length,
    same_plate_journey_count_in_window: inWindowExact.length,
    fuzzy_plate_candidates: fuzzyAll.length,
  }

  if (!exactPlateJourneys.length) {
    if (fuzzyAll.length) {
      const inWindowFuzzy = filterJourneysInWindow(fuzzyAll, searchWindow, mov)
      if (inWindowFuzzy.length > 1) {
        return {
          ...base,
          no_truckflow_reason: 'MULTIPLE_AMBIGUOUS_REJECTED',
          diagnostic_detail: `fuzzy_in_window=${inWindowFuzzy.length}`,
        }
      }
      return {
        ...base,
        no_truckflow_reason: 'ONLY_FUZZY_MATCH_REJECTED',
        diagnostic_detail: `fuzzy_candidates=${fuzzyAll.length}`,
      }
    }
    return {
      ...base,
      no_truckflow_reason: 'NO_PLATE_IN_TRUCKFLOW',
      diagnostic_detail: period.period_mismatch ? period.period_alert : 'plate_not_in_any_journey',
    }
  }

  const invalidTime = exactPlateJourneys.filter((j) => !journeyHasValidTime(j))
  if (invalidTime.length === exactPlateJourneys.length) {
    return {
      ...base,
      no_truckflow_reason: 'TRUCKFLOW_JOURNEY_WITHOUT_VALID_TIME',
      diagnostic_detail: `journeys_with_invalid_time=${invalidTime.length}`,
    }
  }

  if (inPeriodExact.length === 0) {
    return {
      ...base,
      no_truckflow_reason: 'PLATE_EXISTS_ONLY_OUTSIDE_EXCEL_PERIOD',
      diagnostic_detail: `excel_period=${period.excel_min_source_date}..${period.excel_max_source_date}`,
    }
  }

  if (inWindowExact.length === 0) {
    return {
      ...base,
      no_truckflow_reason: 'PLATE_EXISTS_OUT_OF_TIME_WINDOW',
      diagnostic_detail: `in_period=${inPeriodExact.length},in_window=0,delta_min=${base.nearest_time_delta_min}`,
    }
  }

  return { ...base, no_truckflow_reason: 'UNKNOWN_NO_EVIDENCE', diagnostic_detail: 'unresolved_no_match' }
}

export type ExcelFirstOperationCandidateStats = {
  exact_candidates_count: number
  fuzzy_candidates_count: number
  rejected_by_time_window: number
  rejected_by_low_ocr_similarity: number
  rejected_by_ambiguous_fuzzy: number
  rejected_by_site_or_plant: number
  candidates_after_prefilter: number
  candidates_after_time_filter: number
  candidates_after_fuzzy_filter: number
  had_exact_plate_pool: boolean
  had_fuzzy_only_pool: boolean
  had_no_candidates: boolean
  counted_no_plate_in_truckflow: boolean
}

export function createEmptyExcelFirstOperationCandidateStats(): ExcelFirstOperationCandidateStats {
  return {
    exact_candidates_count: 0,
    fuzzy_candidates_count: 0,
    rejected_by_time_window: 0,
    rejected_by_low_ocr_similarity: 0,
    rejected_by_ambiguous_fuzzy: 0,
    rejected_by_site_or_plant: 0,
    candidates_after_prefilter: 0,
    candidates_after_time_filter: 0,
    candidates_after_fuzzy_filter: 0,
    had_exact_plate_pool: false,
    had_fuzzy_only_pool: false,
    had_no_candidates: false,
    counted_no_plate_in_truckflow: false,
  }
}

export function findTruckflowEvidenceForExcelOperation(
  mov: ExternalMovimientoContratoNormalized,
  truckflowJourneys: TruckflowJourneyForMerge[],
  truckflowSegments: TruckflowSegmentForMerge[],
  plateIndex: PlateIndex,
  period: ExcelPeriodContext,
  options?: ExcelFirstMergeOptions,
  opStatsOut?: ExcelFirstOperationCandidateStats
): TruckflowEvidenceResult {
  const useWide = options?.excelFirstWideWindow !== false
  const narrowOpts = { ...NARROW_OPTS, ...options }
  const wideOpts = { ...WIDE_OPTS, ...options }
  const plateCache = options?.plateMatchCache ?? createPlateMatchCache()
  const fuzzyMemo = options?.fuzzyCandidatesByPlate
  const useCandidatePrefilter = options?.useCandidatePrefilter !== false
  const plateM = normalizePlateStrict(mov.plate_normalized || mov.patente_original)
  const opStats = opStatsOut ?? createEmptyExcelFirstOperationCandidateStats()

  const emptyDiag = (): TruckflowEvidenceResult => ({
    matched_journey_uids: [],
    exact_plate_journey_uids: [],
    fuzzy_plate_journey_uids: [],
    truckflow_first_seen_at: '',
    truckflow_last_seen_at: '',
    combined_observed_sequence: '',
    combined_segments: [],
    evidence_count: 0,
    match_quality: 'INSUFFICIENT_EXTERNAL_DATA',
    route_quality: 'ROUTE_UNKNOWN',
    warnings: [],
    match_signals: {
      exact_plate: false,
      fuzzy_plate: false,
      same_day: false,
      wide_window: false,
      low_confidence_date: false,
      fragmented: false,
      exact_time: false,
      platform_compatible: false,
      product_assigned: false,
    },
    no_truckflow_reason: '',
    diagnostic_detail: '',
    nearest_truckflow_journey_uid: '',
    nearest_truckflow_start_time: '',
    nearest_truckflow_end_time: '',
    nearest_time_delta_min: 0,
    same_plate_journey_count: 0,
    same_plate_journey_count_in_period: 0,
    same_plate_journey_count_in_window: 0,
    fuzzy_plate_candidates: 0,
    possible_duplicate_assignment: false,
  })

  if (!plateM) {
    const r = emptyDiag()
    r.warnings = ['MISSING_PLATE']
    r.no_truckflow_reason = 'INSUFFICIENT_EXTERNAL_TIME'
    r.diagnostic_detail = 'MISSING_PLATE'
    return r
  }

  const narrowWindow = computeExcelSearchWindow(mov, narrowOpts, false)
  const wideWindow = useWide ? computeExcelSearchWindow(mov, wideOpts, true) : narrowWindow

  if (!narrowWindow && !wideWindow) {
    const r = emptyDiag()
    r.warnings = ['MISSING_TIMESTAMPS']
    r.no_truckflow_reason = 'INSUFFICIENT_EXTERNAL_TIME'
    r.diagnostic_detail = 'NO_TIMESTAMPS'
    return r
  }

  const applyTryStats = (stats: ExcelFirstOperationCandidateStats) => {
    opStats.exact_candidates_count = stats.exact_candidates_count
    opStats.fuzzy_candidates_count = stats.fuzzy_candidates_count
    opStats.rejected_by_time_window = stats.rejected_by_time_window
    opStats.rejected_by_low_ocr_similarity = stats.rejected_by_low_ocr_similarity
    opStats.rejected_by_ambiguous_fuzzy = stats.rejected_by_ambiguous_fuzzy
    opStats.rejected_by_site_or_plant = stats.rejected_by_site_or_plant
    opStats.candidates_after_prefilter = stats.candidates_after_prefilter
    opStats.candidates_after_time_filter = stats.candidates_after_time_filter
    opStats.candidates_after_fuzzy_filter = stats.candidates_after_fuzzy_filter
    opStats.had_exact_plate_pool = stats.had_exact_plate_pool
    opStats.had_fuzzy_only_pool = stats.had_fuzzy_only_pool
    opStats.had_no_candidates = stats.had_no_candidates
    opStats.counted_no_plate_in_truckflow = stats.counted_no_plate_in_truckflow
  }

  const tryWindow = (
    window: SearchWindowSpec
  ): {
    exact: TruckflowJourneyForMerge[]
    fuzzy: TruckflowJourneyForMerge[]
    matched: TruckflowJourneyForMerge[]
    stats: ExcelFirstOperationCandidateStats
  } => {
    const stats = createEmptyExcelFirstOperationCandidateStats()
    const exactPool = plateIndex.byExactPlate.get(plateM) ?? []
    stats.exact_candidates_count = exactPool.length
    stats.had_exact_plate_pool = exactPool.length > 0

    const exactInWindow = filterJourneysInWindow(exactPool, window, mov)
    stats.rejected_by_time_window += exactPool.length - exactInWindow.length
    const exact = withoutPossibleRejectionJourneys(exactInWindow)

    let fuzzy: TruckflowJourneyForMerge[] = []
    if (!exact.length) {
      const ocrPool =
        useCandidatePrefilter ?
          journeysForFuzzyOcrPrefilter(plateIndex, window, mov)
        : plateIndex.all
      stats.candidates_after_prefilter = ocrPool.length
      stats.rejected_by_site_or_plant = countPlantScopeMismatchesInPool(mov, ocrPool)
      const memoKey = fuzzyMemoCacheKey(plateM, window, ocrPool.length)
      const collected = collectFuzzyCandidatesWithDiscardStats(
        plateM,
        ocrPool,
        narrowOpts.plateOcrThreshold,
        plateCache,
        fuzzyMemo,
        memoKey
      )
      stats.fuzzy_candidates_count = collected.fuzzy.length
      stats.rejected_by_low_ocr_similarity = collected.rejectedLowOcr
      stats.had_fuzzy_only_pool = collected.fuzzy.length > 0

      const fuzzyInWindow = filterJourneysInWindow(collected.fuzzy, window, mov)
      stats.rejected_by_time_window += collected.fuzzy.length - fuzzyInWindow.length
      fuzzy = withoutPossibleRejectionJourneys(fuzzyInWindow)
      stats.candidates_after_fuzzy_filter = fuzzy.length
    } else {
      stats.candidates_after_prefilter = 0
    }

    stats.candidates_after_time_filter = exact.length + fuzzy.length
    if (!exactPool.length && !stats.fuzzy_candidates_count) {
      stats.had_no_candidates = true
    }

    const matched = exact.length ? exact : fuzzy
    return { exact, fuzzy, matched, stats }
  }

  let narrowTry = narrowWindow ?
    tryWindow(narrowWindow)
  : {
      exact: [] as TruckflowJourneyForMerge[],
      fuzzy: [] as TruckflowJourneyForMerge[],
      matched: [] as TruckflowJourneyForMerge[],
      stats: createEmptyExcelFirstOperationCandidateStats(),
    }
  let windowUsed = narrowWindow ?? wideWindow!
  let narrowHadMatch = narrowTry.matched.length > 0
  applyTryStats(narrowTry.stats)

  if (!narrowHadMatch && wideWindow && useWide) {
    const wideTry = tryWindow(wideWindow)
    applyTryStats(wideTry.stats)
    if (wideTry.matched.length) {
      narrowTry = wideTry
      windowUsed = wideWindow
      narrowHadMatch = false
    }
  }

  if (!narrowTry.matched.length) {
    const diag = diagnoseNoTruckflowEvidence(
      mov,
      plateIndex,
      period,
      narrowWindow,
      wideWindow,
      narrowOpts.plateOcrThreshold
    )
    if (diag.no_truckflow_reason === 'NO_PLATE_IN_TRUCKFLOW') {
      opStats.counted_no_plate_in_truckflow = true
      opStats.had_no_candidates = true
    }
    if (
      diag.no_truckflow_reason === 'MULTIPLE_AMBIGUOUS_REJECTED' ||
      diag.no_truckflow_reason === 'ONLY_FUZZY_MATCH_REJECTED'
    ) {
      opStats.rejected_by_ambiguous_fuzzy += 1
    }
    if (diag.no_truckflow_reason === 'PLATE_EXISTS_OUT_OF_TIME_WINDOW') {
      opStats.rejected_by_time_window += Math.max(1, opStats.exact_candidates_count)
    }
    return {
      ...emptyDiag(),
      match_quality: 'NO_TRUCKFLOW_EVIDENCE',
      warnings: ['NO_CAMERA_EVIDENCE_FOUND'],
      ...diag,
    }
  }

  let coherentMatched = narrowTry.matched
  const ingMs = parseMs(mov.external_ingreso_at)
  if (Number.isFinite(ingMs)) {
    const cutoffMs = ingMs - 30 * 60_000
    const afterIngreso = coherentMatched.filter((j) => {
      const b = journeyBoundsMs(j)
      return b && b.endMs >= cutoffMs
    })
    if (afterIngreso.length) coherentMatched = afterIngreso
  }

  coherentMatched = selectCoherentJourneyCluster(coherentMatched, mov)
  const built = buildEvidenceFromMatches(
    coherentMatched,
    narrowTry.exact,
    narrowTry.fuzzy,
    mov,
    truckflowSegments,
    windowUsed,
    narrowHadMatch
  )
  if (built.match_quality === 'EXTERNAL_MATCH_AMBIGUOUS') {
    opStats.rejected_by_ambiguous_fuzzy += 1
  }

  return {
    ...built,
    no_truckflow_reason: '',
    diagnostic_detail: '',
    nearest_truckflow_journey_uid: '',
    nearest_truckflow_start_time: '',
    nearest_truckflow_end_time: '',
    nearest_time_delta_min: 0,
    same_plate_journey_count: (plateIndex.byExactPlate.get(plateM) ?? []).length,
    same_plate_journey_count_in_period: (plateIndex.byExactPlate.get(plateM) ?? []).filter((j) =>
      journeyInPeriod(j, period.excel_period_start_ms, period.excel_period_end_ms)
    ).length,
    same_plate_journey_count_in_window: narrowTry.matched.length,
    fuzzy_plate_candidates: opStats.fuzzy_candidates_count,
    possible_duplicate_assignment: false,
  }
}

function hasMeasurableSegment(segments: TruckflowSegmentForMerge[]): boolean {
  return segments.some(
    (s) =>
      Boolean(s.segment_start_time) &&
      Boolean(s.segment_end_time) &&
      Number.isFinite(s.segment_duration_min) &&
      s.segment_duration_min > 0
  )
}

function computeAnalysisFlags(
  mov: ExternalMovimientoContratoNormalized,
  ctx: OperationalContextFromExcel,
  evidence: TruckflowEvidenceResult
): {
  analysis_ready_for_scatter: boolean
  analysis_ready_for_full_route_kpi: boolean
  analysis_warning: string
} {
  const hasProduct = Boolean(ctx.resolved_product)
  const hasPlatformOrCircuit = Boolean(ctx.resolved_platform || ctx.resolved_circuit_family)
  const hasSegments = hasMeasurableSegment(evidence.combined_segments)
  const scatterOk =
    hasProduct &&
    hasPlatformOrCircuit &&
    hasSegments &&
    SCATTER_MATCH_QUALITIES.has(evidence.match_quality)

  const kpiOk =
    scatterOk &&
    KPI_ROUTE_QUALITIES.has(evidence.route_quality) &&
    KPI_MATCH_QUALITIES.has(evidence.match_quality)

  const warnings = [...evidence.warnings]
  if (!hasProduct) warnings.push('MISSING_PRODUCT')
  if (!hasPlatformOrCircuit) warnings.push('MISSING_PLATFORM')
  if (!hasSegments) warnings.push('NO_MEASURABLE_SEGMENTS')
  if (evidence.match_quality === 'NO_TRUCKFLOW_EVIDENCE') {
    warnings.push('NO_CAMERA_EVIDENCE_FOUND')
  }

  return {
    analysis_ready_for_scatter: scatterOk,
    analysis_ready_for_full_route_kpi: kpiOk,
    analysis_warning: warnings.join('|'),
  }
}

function aggregateJourneyStats(matched: TruckflowJourneyForMerge[]): {
  duration_min: number
  coverage_avg: number
  has_strong_any: boolean
  circuit_codes: string
  circuit_labels: string
  executive_statuses: string
  valid_details: string
} {
  if (!matched.length) {
    return {
      duration_min: 0,
      coverage_avg: 0,
      has_strong_any: false,
      circuit_codes: '',
      circuit_labels: '',
      executive_statuses: '',
      valid_details: '',
    }
  }
  let totalDur = 0
  let covSum = 0
  let hasStrong = false
  for (const j of matched) {
    totalDur += j.duration_min ?? 0
    covSum += j.coverage_percent ?? 0
    if (j.has_strong_point) hasStrong = true
  }
  return {
    duration_min: Math.round(totalDur * 100) / 100,
    coverage_avg: Math.round((covSum / matched.length) * 100) / 100,
    has_strong_any: hasStrong,
    circuit_codes: matched.map((j) => j.circuit_code).filter(Boolean).join('|'),
    circuit_labels: matched.map((j) => j.circuit_label).filter(Boolean).join('|'),
    executive_statuses: matched.map((j) => j.executive_status).filter(Boolean).join('|'),
    valid_details: matched.map((j) => j.valid_detail).filter(Boolean).join('|'),
  }
}

export type ExcelFirstMergeResult = {
  operations: ExcelOperationWithTruckflowRow[]
  segmentRows: ExcelOperationSegmentScatterRow[]
  noEvidenceDiagnostics: ExcelNoTruckflowDiagnosticRow[]
  candidateDiagnostics: ExcelFirstCandidateDiagnosticsRow[]
  reviewSample: ExcelOperationWithTruckflowRow[]
  summary: Record<string, unknown>
  byProductPlatform: Record<string, unknown>[]
  period: ExcelPeriodContext
  discardCounters: ExcelFirstCandidateDiscardCounters
}

function incrementMatchSummary(summary: Record<string, number>, evidence: TruckflowEvidenceResult): void {
  const mq = evidence.match_quality
  if (mq === 'EXTERNAL_MATCH_EXACT') summary.external_match_exact = (summary.external_match_exact ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_PROBABLE') summary.external_match_probable = (summary.external_match_probable ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_FRAGMENTED') summary.external_match_fragmented = (summary.external_match_fragmented ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_WIDE_WINDOW') summary.external_match_wide_window = (summary.external_match_wide_window ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_LOW_CONFIDENCE') summary.external_match_low_confidence = (summary.external_match_low_confidence ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_FUZZY_PLATE') summary.external_match_fuzzy_plate = (summary.external_match_fuzzy_plate ?? 0) + 1
  else if (mq === 'EXTERNAL_MATCH_AMBIGUOUS') summary.external_match_ambiguous = (summary.external_match_ambiguous ?? 0) + 1
  else if (mq === 'INSUFFICIENT_EXTERNAL_DATA') summary.insufficient_external_data = (summary.insufficient_external_data ?? 0) + 1
  else if (mq === 'NO_TRUCKFLOW_EVIDENCE') summary.no_truckflow_evidence = (summary.no_truckflow_evidence ?? 0) + 1

  const sig = evidence.match_signals
  if (sig.exact_plate) summary.exact_plate_matches = (summary.exact_plate_matches ?? 0) + 1
  if (sig.fuzzy_plate) summary.fuzzy_plate_matches = (summary.fuzzy_plate_matches ?? 0) + 1
  if (sig.same_day) summary.same_day_matches = (summary.same_day_matches ?? 0) + 1
  if (sig.wide_window) summary.wide_window_matches = (summary.wide_window_matches ?? 0) + 1
  if (sig.low_confidence_date) summary.low_confidence_matches = (summary.low_confidence_matches ?? 0) + 1
  if (sig.fragmented) summary.fragmented_matches = (summary.fragmented_matches ?? 0) + 1
  if (sig.exact_time) summary.exact_time_matches = (summary.exact_time_matches ?? 0) + 1
  if (sig.platform_compatible) summary.platform_compatible_matches = (summary.platform_compatible_matches ?? 0) + 1
  if (sig.product_assigned) summary.product_assigned_matches = (summary.product_assigned_matches ?? 0) + 1
}

function incrementNoEvidenceReason(summary: Record<string, number>, reason: NoTruckflowReason): void {
  const map: Record<string, string> = {
    NO_PLATE_IN_TRUCKFLOW: 'no_evidence_no_plate_in_truckflow',
    PLATE_EXISTS_OUT_OF_TIME_WINDOW: 'no_evidence_plate_out_of_window',
    PLATE_EXISTS_ONLY_OUTSIDE_EXCEL_PERIOD: 'no_evidence_outside_period',
    TRUCKFLOW_JOURNEY_WITHOUT_VALID_TIME: 'no_evidence_invalid_truckflow_time',
    ONLY_FUZZY_MATCH_REJECTED: 'no_evidence_fuzzy_rejected',
    MULTIPLE_AMBIGUOUS_REJECTED: 'no_evidence_ambiguous',
    INSUFFICIENT_EXTERNAL_TIME: 'no_evidence_insufficient_external_time',
    UNKNOWN_NO_EVIDENCE: 'no_evidence_unknown',
  }
  const key = map[reason]
  if (key) summary[key] = (summary[key] ?? 0) + 1
}

export function buildExcelFirstReviewSample(
  operations: ExcelOperationWithTruckflowRow[],
  sampleSize = 100
): ExcelOperationWithTruckflowRow[] {
  const perBucket = Math.floor(sampleSize / 4)
  const pick = (pred: (o: ExcelOperationWithTruckflowRow) => boolean, n: number) =>
    operations.filter(pred).slice(0, n)

  const exactProb = pick(
    (o) => o.match_quality === 'EXTERNAL_MATCH_EXACT' || o.match_quality === 'EXTERNAL_MATCH_PROBABLE',
    perBucket
  )
  const fragmented = pick((o) => o.match_quality === 'EXTERNAL_MATCH_FRAGMENTED', perBucket)
  const noEvidence = pick((o) => o.match_quality === 'NO_TRUCKFLOW_EVIDENCE', perBucket)
  const rescued = pick(
    (o) =>
      (o.route_quality === 'ROUTE_ANOMALOUS' || o.route_quality === 'ROUTE_NO_DISCHARGE_POINT') &&
      o.evidence_count > 0,
    perBucket
  )

  const seen = new Set<string>()
  const out: ExcelOperationWithTruckflowRow[] = []
  for (const row of [...exactProb, ...fragmented, ...noEvidence, ...rescued]) {
    if (seen.has(row.external_operation_id)) continue
    seen.add(row.external_operation_id)
    out.push(row)
  }
  return out.slice(0, sampleSize)
}

export async function mergeExcelOperationsWithTruckflowEvidence(
  movimientosContrato: ExternalMovimientoContratoNormalized[],
  truckflowJourneys: TruckflowJourneyForMerge[],
  truckflowSegments: TruckflowSegmentForMerge[],
  options?: ExcelFirstMergeOptions
): Promise<ExcelFirstMergeResult> {
  const period = buildExcelPeriodContext(movimientosContrato, truckflowJourneys)
  const plateIndex = buildPlateIndex(truckflowJourneys)
  const journeyByUid = new Map(truckflowJourneys.map((j) => [j.journey_uid, j]))
  const journeyAssignmentCount = new Map<string, number>()
  const plateMatchCache = options?.plateMatchCache ?? createPlateMatchCache()
  const fuzzyCandidatesByPlate = options?.fuzzyCandidatesByPlate ?? new Map<string, TruckflowJourneyForMerge[]>()
  const mergeOptions: ExcelFirstMergeOptions = {
    ...options,
    plateMatchCache,
    fuzzyCandidatesByPlate,
  }
  const totalMov = movimientosContrato.length

  const operations: ExcelOperationWithTruckflowRow[] = []
  const segmentRows: ExcelOperationSegmentScatterRow[] = []
  const noEvidenceDiagnostics: ExcelNoTruckflowDiagnosticRow[] = []
  const candidateDiagnostics: ExcelFirstCandidateDiagnosticsRow[] = []
  const discardCounters = createEmptyExcelFirstDiscardCounters()
  const useCandidatePrefilter = options?.useCandidatePrefilter !== false

  const summaryCounts: Record<string, number> = {
    total_excel_operations: movimientosContrato.length,
    total_with_truckflow_evidence: 0,
    total_without_truckflow_evidence: 0,
    external_match_exact: 0,
    external_match_probable: 0,
    external_match_fragmented: 0,
    external_match_wide_window: 0,
    external_match_low_confidence: 0,
    external_match_fuzzy_plate: 0,
    external_match_ambiguous: 0,
    insufficient_external_data: 0,
    no_truckflow_evidence: 0,
    ready_for_scatter: 0,
    ready_for_full_route_kpi: 0,
    route_complete: 0,
    route_deduced: 0,
    route_partial: 0,
    route_no_discharge_point: 0,
    route_anomalous: 0,
    route_incomplete: 0,
    route_no_evaluable: 0,
    rescued_anomalous: 0,
    rescued_no_discharge_point: 0,
    exact_plate_matches: 0,
    fuzzy_plate_matches: 0,
    same_day_matches: 0,
    wide_window_matches: 0,
    low_confidence_matches: 0,
    fragmented_matches: 0,
    exact_time_matches: 0,
    platform_compatible_matches: 0,
    product_assigned_matches: 0,
    no_evidence_no_plate_in_truckflow: 0,
    no_evidence_plate_out_of_window: 0,
    no_evidence_outside_period: 0,
    no_evidence_invalid_truckflow_time: 0,
    no_evidence_fuzzy_rejected: 0,
    no_evidence_ambiguous: 0,
    no_evidence_insufficient_external_time: 0,
    no_evidence_unknown: 0,
    possible_duplicate_assignments: 0,
    ...createEmptyExcelFirstDiscardCounters(),
    use_candidate_prefilter: useCandidatePrefilter ? 1 : 0,
  }

  const byPp = new Map<
    string,
    {
      product_normalized: string
      platform_normalized: string
      resolved_circuit_family: string
      total: number
      with_evidence: number
      ready_scatter: number
      ready_kpi: number
      no_evidence: number
      duration_sum: number
      duration_n: number
    }
  >()

  let excelMergePass = 0
  for (const mov of movimientosContrato) {
    if (++excelMergePass % 35 === 0) await yieldToBrowser()
    if (excelMergePass % 25 === 0 || excelMergePass === totalMov) {
      mergeOptions.onExcelOperationProgress?.(excelMergePass, totalMov, { ...discardCounters })
    }
    const ctx = resolveOperationalContextFromExcel(mov)
    const opCand = createEmptyExcelFirstOperationCandidateStats()
    const evidence = findTruckflowEvidenceForExcelOperation(
      mov,
      truckflowJourneys,
      truckflowSegments,
      plateIndex,
      period,
      mergeOptions,
      opCand
    )

    mergeExcelFirstDiscardCounters(discardCounters, {
      no_plate_in_truckflow: opCand.counted_no_plate_in_truckflow ? 1 : 0,
      exact_plate_candidates: opCand.exact_candidates_count,
      fuzzy_plate_candidates: opCand.fuzzy_candidates_count,
      rejected_by_time_window: opCand.rejected_by_time_window,
      rejected_by_low_ocr_similarity: opCand.rejected_by_low_ocr_similarity,
      rejected_by_ambiguous_fuzzy: opCand.rejected_by_ambiguous_fuzzy,
      rejected_by_site_or_plant: opCand.rejected_by_site_or_plant,
      candidates_after_prefilter: opCand.candidates_after_prefilter,
      candidates_after_time_filter: opCand.candidates_after_time_filter,
      candidates_after_fuzzy_filter: opCand.candidates_after_fuzzy_filter,
      operations_with_exact_plate: opCand.had_exact_plate_pool ? 1 : 0,
      operations_with_only_fuzzy_plate:
        !opCand.had_exact_plate_pool && opCand.had_fuzzy_only_pool ? 1 : 0,
      operations_without_any_candidate: opCand.had_no_candidates ? 1 : 0,
    })

    candidateDiagnostics.push({
      external_operation_id: mov.external_operation_id,
      plate_normalized: mov.plate_normalized,
      operation_date: mov.source_date || dayKeyFromIso(mov.external_salida_at),
      exact_candidates_count: opCand.exact_candidates_count,
      fuzzy_candidates_count: opCand.fuzzy_candidates_count,
      rejected_by_time_window: opCand.rejected_by_time_window,
      rejected_by_low_ocr_similarity: opCand.rejected_by_low_ocr_similarity,
      rejected_by_ambiguous_fuzzy: opCand.rejected_by_ambiguous_fuzzy,
      final_candidate_count: evidence.evidence_count,
      match_quality: evidence.match_quality,
      no_truckflow_reason: evidence.no_truckflow_reason,
    })
    const flags = computeAnalysisFlags(mov, ctx, evidence)

    for (const uid of evidence.matched_journey_uids) {
      journeyAssignmentCount.set(uid, (journeyAssignmentCount.get(uid) ?? 0) + 1)
    }

    const matchedJourneys = evidence.matched_journey_uids
      .map((uid) => journeyByUid.get(uid))
      .filter(Boolean) as TruckflowJourneyForMerge[]
    const agg = aggregateJourneyStats(matchedJourneys)

    const possibleDup = evidence.matched_journey_uids.some(
      (uid) => (journeyAssignmentCount.get(uid) ?? 0) > 1
    )
    if (possibleDup) summaryCounts.possible_duplicate_assignments = (summaryCounts.possible_duplicate_assignments ?? 0) + 1

    const row: ExcelOperationWithTruckflowRow = {
      external_operation_id: mov.external_operation_id,
      source_file: mov.source_file,
      source_date: mov.source_date,
      plate_normalized: mov.plate_normalized,
      product_normalized: mov.product_normalized,
      producto_original: mov.producto_original,
      platform_normalized: mov.platform_normalized,
      plataforma_original: mov.plataforma_original,
      planta_normalized: mov.planta_normalized,
      movement_type: mov.movement_type,
      external_ingreso_at: mov.external_ingreso_at,
      external_calado_at: mov.external_calado_at,
      external_salida_at: mov.external_salida_at,
      contrato: mov.contrato,
      comprob: mov.comprob,
      cp_remito: mov.cp_remito,
      ctg: mov.ctg,
      cupo: mov.cupo,
      kgs_neto: mov.kgs_neto,
      matched_journey_uids: evidence.matched_journey_uids.join('|'),
      matched_journey_count: evidence.evidence_count,
      truckflow_first_seen_at: evidence.truckflow_first_seen_at,
      truckflow_last_seen_at: evidence.truckflow_last_seen_at,
      truckflow_duration_min: agg.duration_min,
      truckflow_circuit_codes: agg.circuit_codes,
      truckflow_circuit_labels: agg.circuit_labels,
      truckflow_executive_statuses: agg.executive_statuses,
      truckflow_valid_details: agg.valid_details,
      truckflow_observed_sequence_combined: evidence.combined_observed_sequence,
      truckflow_coverage_percent_avg: agg.coverage_avg,
      truckflow_has_strong_point_any: agg.has_strong_any,
      resolved_product: ctx.resolved_product,
      resolved_platform: ctx.resolved_platform,
      resolved_circuit_family: ctx.resolved_circuit_family,
      resolved_operational_point: ctx.resolved_operational_point,
      resolved_plant_hint: ctx.resolved_plant_hint,
      resolution_source: ctx.resolution_source,
      match_quality: evidence.match_quality,
      route_quality: evidence.route_quality,
      analysis_ready_for_scatter: flags.analysis_ready_for_scatter,
      analysis_ready_for_full_route_kpi: flags.analysis_ready_for_full_route_kpi,
      analysis_warning: flags.analysis_warning,
      evidence_count: evidence.evidence_count,
      no_truckflow_reason: evidence.no_truckflow_reason,
      diagnostic_detail: evidence.diagnostic_detail,
      possible_duplicate_assignment: possibleDup,
    }
    operations.push(row)

    if (evidence.evidence_count > 0) summaryCounts.total_with_truckflow_evidence++
    else {
      summaryCounts.total_without_truckflow_evidence++
      noEvidenceDiagnostics.push({
        external_operation_id: mov.external_operation_id,
        plate_normalized: mov.plate_normalized,
        product_normalized: mov.product_normalized,
        platform_normalized: mov.platform_normalized,
        external_ingreso_at: mov.external_ingreso_at,
        external_calado_at: mov.external_calado_at,
        external_salida_at: mov.external_salida_at,
        source_date: mov.source_date,
        no_truckflow_reason: evidence.no_truckflow_reason,
        nearest_truckflow_journey_uid: evidence.nearest_truckflow_journey_uid,
        nearest_truckflow_start_time: evidence.nearest_truckflow_start_time,
        nearest_truckflow_end_time: evidence.nearest_truckflow_end_time,
        nearest_time_delta_min: evidence.nearest_time_delta_min,
        same_plate_journey_count: evidence.same_plate_journey_count,
        same_plate_journey_count_in_period: evidence.same_plate_journey_count_in_period,
        same_plate_journey_count_in_window: evidence.same_plate_journey_count_in_window,
        fuzzy_plate_candidates: evidence.fuzzy_plate_candidates,
        diagnostic_detail: evidence.diagnostic_detail,
      })
      incrementNoEvidenceReason(summaryCounts, evidence.no_truckflow_reason)
    }

    incrementMatchSummary(summaryCounts, evidence)

    const rq = evidence.route_quality
    if (rq === 'ROUTE_COMPLETE') summaryCounts.route_complete++
    else if (rq === 'ROUTE_DEDUCED') summaryCounts.route_deduced++
    else if (rq === 'ROUTE_PARTIAL') summaryCounts.route_partial++
    else if (rq === 'ROUTE_NO_DISCHARGE_POINT') {
      summaryCounts.route_no_discharge_point++
      if (evidence.evidence_count > 0) summaryCounts.rescued_no_discharge_point++
    } else if (rq === 'ROUTE_ANOMALOUS') {
      summaryCounts.route_anomalous++
      if (evidence.evidence_count > 0) summaryCounts.rescued_anomalous++
    } else if (rq === 'ROUTE_INCOMPLETE') summaryCounts.route_incomplete++
    else if (rq === 'ROUTE_NO_EVALUABLE') summaryCounts.route_no_evaluable++

    if (flags.analysis_ready_for_scatter) summaryCounts.ready_for_scatter++
    if (flags.analysis_ready_for_full_route_kpi) summaryCounts.ready_for_full_route_kpi++

    const ppKey = `${ctx.resolved_product}|${ctx.resolved_platform}|${ctx.resolved_circuit_family}`
    const pp =
      byPp.get(ppKey) ??
      {
        product_normalized: ctx.resolved_product,
        platform_normalized: ctx.resolved_platform,
        resolved_circuit_family: ctx.resolved_circuit_family,
        total: 0,
        with_evidence: 0,
        ready_scatter: 0,
        ready_kpi: 0,
        no_evidence: 0,
        duration_sum: 0,
        duration_n: 0,
      }
    pp.total++
    if (evidence.evidence_count > 0) pp.with_evidence++
    else pp.no_evidence++
    if (flags.analysis_ready_for_scatter) pp.ready_scatter++
    if (flags.analysis_ready_for_full_route_kpi) pp.ready_kpi++
    if (agg.duration_min > 0) {
      pp.duration_sum += agg.duration_min
      pp.duration_n++
    }
    byPp.set(ppKey, pp)

    const inferredExecutive = inferCircuitFromExternalMovimiento(mov)
    const resolvedExecutiveCircuitCode = inferredExecutive?.circuit_code ?? ''

    let globalOrder = 0
    for (const uid of evidence.matched_journey_uids) {
      const j = journeyByUid.get(uid)
      const segs = evidence.combined_segments.filter((s) => s.journey_uid === uid)
      for (const seg of segs) {
        globalOrder++
        segmentRows.push({
          external_operation_id: mov.external_operation_id,
          journey_uid: uid,
          plate_normalized: mov.plate_normalized,
          product_normalized: ctx.resolved_product,
          platform_normalized: ctx.resolved_platform,
          resolved_circuit_family: ctx.resolved_circuit_family,
          resolved_operational_point: ctx.resolved_operational_point,
          segment_order_global: globalOrder,
          segment_order_journey: seg.segment_order,
          segment_name: seg.segment_name,
          segment_from: seg.segment_from,
          segment_to: seg.segment_to,
          segment_start_time: seg.segment_start_time,
          segment_end_time: seg.segment_end_time,
          segment_duration_min: seg.segment_duration_min,
          segment_plant: seg.segment_plant,
          segment_leg: seg.segment_leg,
          truckflow_circuit_code: j?.circuit_code ?? seg.circuit_code,
          resolved_executive_circuit_code: resolvedExecutiveCircuitCode,
          truckflow_executive_status: j?.executive_status ?? seg.executive_status,
          truckflow_valid_detail: j?.valid_detail ?? seg.valid_detail,
          match_quality: evidence.match_quality,
          route_quality: evidence.route_quality,
          analysis_ready_for_scatter: flags.analysis_ready_for_scatter,
          analysis_warning: flags.analysis_warning,
          external_salida_at: mov.external_salida_at,
          external_calado_at: mov.external_calado_at,
          external_ingreso_at: mov.external_ingreso_at,
          planta_normalized: mov.planta_normalized,
        })
      }
    }

    if (
      resolvedExecutiveCircuitCode &&
      flags.analysis_ready_for_scatter &&
      evidence.combined_segments.length
    ) {
      const opTimedSegments = evidence.combined_segments.map((s) => ({
        segment_from: s.segment_from,
        segment_to: s.segment_to,
        segment_start_time: s.segment_start_time,
        segment_end_time: s.segment_end_time,
      }))
      const synthLegs = synthesizeInferredRollupLegsFromTimedSegments({
        operationId: mov.external_operation_id,
        plate: mov.plate_normalized,
        executiveCircuitCode: resolvedExecutiveCircuitCode,
        segments: opTimedSegments,
        externalCaladoAt: mov.external_calado_at,
        externalSalidaAt: mov.external_salida_at,
        externalIngresoAt: mov.external_ingreso_at,
        platformNormalized: ctx.resolved_platform,
        plantaNormalized: mov.planta_normalized,
      })
      const existingTransitions = new Set(
        segmentRows
          .filter((r) => r.external_operation_id === mov.external_operation_id)
          .map((r) => `${r.segment_from}|${r.segment_to}`)
      )
      for (const leg of synthLegs) {
        const transitionKey = `${leg.fromCode}|${leg.toCode}`
        if (existingTransitions.has(transitionKey)) continue
        existingTransitions.add(transitionKey)
        globalOrder++
        segmentRows.push({
          external_operation_id: mov.external_operation_id,
          journey_uid: evidence.matched_journey_uids[0] ?? '',
          plate_normalized: mov.plate_normalized,
          product_normalized: ctx.resolved_product,
          platform_normalized: ctx.resolved_platform,
          resolved_circuit_family: ctx.resolved_circuit_family,
          resolved_operational_point: ctx.resolved_operational_point,
          segment_order_global: globalOrder,
          segment_order_journey: 0,
          segment_name: formatTransitionLabel(leg.fromCode, leg.toCode),
          segment_from: leg.fromCode,
          segment_to: leg.toCode,
          segment_start_time: leg.segment_start_time,
          segment_end_time: leg.segment_end_time,
          segment_duration_min: leg.durationMinutes,
          segment_plant: leg.fromCode.includes('SL_') ? 'SL' : 'RIC',
          segment_leg: leg.fromCode.includes('SL_') ? 'SL' : 'RIC',
          truckflow_circuit_code: leg.executiveCircuitCode,
          resolved_executive_circuit_code: resolvedExecutiveCircuitCode,
          truckflow_executive_status: '',
          truckflow_valid_detail: 'DEDUCIDO_INFERRED_ROLLUP',
          match_quality: evidence.match_quality,
          route_quality: evidence.route_quality,
          analysis_ready_for_scatter: flags.analysis_ready_for_scatter,
          analysis_warning: flags.analysis_warning,
          external_salida_at: mov.external_salida_at,
          external_calado_at: mov.external_calado_at,
          external_ingreso_at: mov.external_ingreso_at,
          planta_normalized: mov.planta_normalized,
        })
      }
    }
  }

  const products = new Set(operations.map((o) => o.resolved_product).filter(Boolean))
  const platforms = new Set(operations.map((o) => o.resolved_platform).filter(Boolean))
  const families = new Set(operations.map((o) => o.resolved_circuit_family).filter(Boolean))

  const byProductPlatform = [...byPp.values()].map((pp) => ({
    product_normalized: pp.product_normalized,
    platform_normalized: pp.platform_normalized,
    resolved_circuit_family: pp.resolved_circuit_family,
    total_excel_operations: pp.total,
    with_truckflow_evidence: pp.with_evidence,
    ready_for_scatter: pp.ready_scatter,
    ready_for_full_route_kpi: pp.ready_kpi,
    no_truckflow_evidence: pp.no_evidence,
    avg_truckflow_duration_min:
      pp.duration_n > 0 ? Math.round((pp.duration_sum / pp.duration_n) * 100) / 100 : 0,
  }))

  const reviewSample = buildExcelFirstReviewSample(operations)

  const coveragePct =
    movimientosContrato.length > 0 ?
      Math.round((summaryCounts.total_with_truckflow_evidence / movimientosContrato.length) * 10000) / 100
    : 0

  const summary: Record<string, unknown> = {
    ...summaryCounts,
    ...discardCounters,
    ...period,
    excel_first_wide_window: options?.excelFirstWideWindow !== false,
    use_candidate_prefilter: useCandidatePrefilter,
    coverage_excel_first_pct: coveragePct,
    unique_products: products.size,
    unique_platforms: platforms.size,
    unique_resolved_circuit_families: families.size,
    segment_scatter_rows: segmentRows.length,
    no_evidence_diagnostics_rows: noEvidenceDiagnostics.length,
    review_sample_rows: reviewSample.length,
    candidate_diagnostics_rows: candidateDiagnostics.length,
  }

  console.info('[CONTRACT_FIRST_EXCEL_FIRST] discardCounters', discardCounters)

  return {
    operations,
    segmentRows,
    noEvidenceDiagnostics,
    candidateDiagnostics,
    reviewSample,
    summary,
    byProductPlatform,
    period,
    discardCounters,
  }
}

const EXCEL_OPS_HEADERS = [
  'external_operation_id',
  'source_file',
  'source_date',
  'plate_normalized',
  'product_normalized',
  'producto_original',
  'platform_normalized',
  'plataforma_original',
  'planta_normalized',
  'movement_type',
  'external_ingreso_at',
  'external_calado_at',
  'external_salida_at',
  'contrato',
  'comprob',
  'cp_remito',
  'ctg',
  'cupo',
  'kgs_neto',
  'matched_journey_uids',
  'matched_journey_count',
  'truckflow_first_seen_at',
  'truckflow_last_seen_at',
  'truckflow_duration_min',
  'truckflow_circuit_codes',
  'truckflow_circuit_labels',
  'truckflow_executive_statuses',
  'truckflow_valid_details',
  'truckflow_observed_sequence_combined',
  'truckflow_coverage_percent_avg',
  'truckflow_has_strong_point_any',
  'resolved_product',
  'resolved_platform',
  'resolved_circuit_family',
  'resolved_operational_point',
  'resolved_plant_hint',
  'resolution_source',
  'match_quality',
  'route_quality',
  'analysis_ready_for_scatter',
  'analysis_ready_for_full_route_kpi',
  'analysis_warning',
  'evidence_count',
  'no_truckflow_reason',
  'diagnostic_detail',
  'possible_duplicate_assignment',
] as const

const NO_EVIDENCE_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'product_normalized',
  'platform_normalized',
  'external_ingreso_at',
  'external_calado_at',
  'external_salida_at',
  'source_date',
  'no_truckflow_reason',
  'nearest_truckflow_journey_uid',
  'nearest_truckflow_start_time',
  'nearest_truckflow_end_time',
  'nearest_time_delta_min',
  'same_plate_journey_count',
  'same_plate_journey_count_in_period',
  'same_plate_journey_count_in_window',
  'fuzzy_plate_candidates',
  'diagnostic_detail',
] as const

const REVIEW_SAMPLE_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'product_normalized',
  'platform_normalized',
  'external_ingreso_at',
  'external_salida_at',
  'matched_journey_uids',
  'truckflow_first_seen_at',
  'truckflow_last_seen_at',
  'truckflow_circuit_codes',
  'truckflow_executive_statuses',
  'resolved_circuit_family',
  'match_quality',
  'route_quality',
  'analysis_ready_for_scatter',
  'no_truckflow_reason',
  'diagnostic_detail',
] as const

const SEGMENT_SCATTER_HEADERS = [
  'external_operation_id',
  'journey_uid',
  'plate_normalized',
  'product_normalized',
  'platform_normalized',
  'resolved_circuit_family',
  'resolved_operational_point',
  'segment_order_global',
  'segment_order_journey',
  'segment_name',
  'segment_from',
  'segment_to',
  'segment_start_time',
  'segment_end_time',
  'segment_duration_min',
  'segment_plant',
  'segment_leg',
  'truckflow_circuit_code',
  'resolved_executive_circuit_code',
  'truckflow_executive_status',
  'truckflow_valid_detail',
  'match_quality',
  'route_quality',
  'analysis_ready_for_scatter',
  'analysis_warning',
  'external_salida_at',
  'external_calado_at',
] as const

export function excelOperationsWithTruckflowCsv(rows: ExcelOperationWithTruckflowRow[]): string {
  return recordsToCsv([...EXCEL_OPS_HEADERS], rows as unknown as Record<string, unknown>[])
}

export const EXCEL_FIRST_PANEL_CSV_KEYS = [
  'excel_operations_with_truckflow',
  'excel_operation_segments_for_scatter',
  'excel_first_by_product_platform',
  'excel_first_merge_summary',
] as const

export const COMMITTEE_CONCILIATION_CSV_KEYS = [
  'debug_matrix_classification',
  'merged_truckflow_movimientos',
] as const

export function excelOperationSegmentsForScatterCsv(rows: ExcelOperationSegmentScatterRow[]): string {
  return recordsToCsv([...SEGMENT_SCATTER_HEADERS], rows as unknown as Record<string, unknown>[])
}

export function excelNoTruckflowEvidenceDiagnosticsCsv(rows: ExcelNoTruckflowDiagnosticRow[]): string {
  return recordsToCsv([...NO_EVIDENCE_HEADERS], rows as unknown as Record<string, unknown>[])
}

const CANDIDATE_DIAG_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'operation_date',
  'exact_candidates_count',
  'fuzzy_candidates_count',
  'rejected_by_time_window',
  'rejected_by_low_ocr_similarity',
  'rejected_by_ambiguous_fuzzy',
  'final_candidate_count',
  'match_quality',
  'no_truckflow_reason',
] as const

export function excelFirstCandidateDiagnosticsCsv(rows: ExcelFirstCandidateDiagnosticsRow[]): string {
  return recordsToCsv([...CANDIDATE_DIAG_HEADERS], rows as unknown as Record<string, unknown>[])
}

export function excelFirstReviewSampleCsv(rows: ExcelOperationWithTruckflowRow[]): string {
  const slim = rows.map((r) => ({
    external_operation_id: r.external_operation_id,
    plate_normalized: r.plate_normalized,
    product_normalized: r.product_normalized,
    platform_normalized: r.platform_normalized,
    external_ingreso_at: r.external_ingreso_at,
    external_salida_at: r.external_salida_at,
    matched_journey_uids: r.matched_journey_uids,
    truckflow_first_seen_at: r.truckflow_first_seen_at,
    truckflow_last_seen_at: r.truckflow_last_seen_at,
    truckflow_circuit_codes: r.truckflow_circuit_codes,
    truckflow_executive_statuses: r.truckflow_executive_statuses,
    resolved_circuit_family: r.resolved_circuit_family,
    match_quality: r.match_quality,
    route_quality: r.route_quality,
    analysis_ready_for_scatter: r.analysis_ready_for_scatter,
    no_truckflow_reason: r.no_truckflow_reason,
    diagnostic_detail: r.diagnostic_detail,
  }))
  return recordsToCsv([...REVIEW_SAMPLE_HEADERS], slim)
}

export function excelFirstMergeSummaryCsv(summary: Record<string, unknown>): string {
  return recordsToCsv(Object.keys(summary), [summary])
}

export function excelFirstByProductPlatformCsv(rows: Record<string, unknown>[]): string {
  const headers =
    rows.length ?
      Object.keys(rows[0]!)
    : [
        'product_normalized',
        'platform_normalized',
        'resolved_circuit_family',
        'total_excel_operations',
        'with_truckflow_evidence',
        'ready_for_scatter',
        'ready_for_full_route_kpi',
        'no_truckflow_evidence',
        'avg_truckflow_duration_min',
      ]
  return recordsToCsv(headers, rows)
}
