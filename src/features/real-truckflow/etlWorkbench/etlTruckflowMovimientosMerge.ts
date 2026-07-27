/**
 * @deprecated Para imports nuevos usar `contractTruckflowMerge` en truckflowTransform/contractFirst.
 */
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { normalizePlate } from './etlExternalNormalization'
import { parseTimestampMs } from './etlTimestampNormalize'
import {
  applyExternalCircuitToJourney,
  excelAnchorJourneyPriority,
  inferCircuitFromExternalMovimiento,
  journeyNeedsCircuitFromExcel,
} from './etlPlatformCircuitInference'
import { isSlLiquidCircuit } from './slLiquidCameras'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'
import { createPlateMatchCache, type PlateMatchCache } from './etlPlateMatchCache'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'

import type { TruckflowJourneyForMerge } from './etlTruckflowMergeTypes'

export type { TruckflowJourneyForMerge }

export type MergeStatus =
  | 'MATCH_EXACT'
  | 'MATCH_PROBABLE'
  | 'MATCH_MULTIPLE_RESOLVED'
  | 'MATCH_AMBIGUOUS'
  | 'MATCH_MULTIPLE'
  | 'MATCH_ENRICHED_PLATE_DAY'
  | 'MATCH_FUZZY_PLATE'
  | 'MATCH_EXCEL_ANCHOR'
  | 'NO_EXTERNAL_MATCH'
  | 'NO_TRUCKFLOW_MATCH'
  | 'INSUFFICIENT_DATA'

export type MergeTruckflowMovimientosOptions = {
  timeWindowBeforeMin?: number
  timeWindowAfterMin?: number
  fallbackSameDay?: boolean
  requirePlantMatch?: boolean
  requirePlatformCircuitMatch?: boolean
  minExactConfidence?: number
  minProbableConfidence?: number
  /** Similaridad OCR 0..1 para cruzar patente Truckflow ↔ externa. */
  plateOcrThreshold?: number
  /** Segunda pasada: patente (+día) aunque no cruce ventana horaria de cámaras. */
  enrichUnmatchedByPlateDay?: boolean
  /** Primera pasada: cada fila Excel busca journey Truckflow (salida/calado como ancla). */
  excelFirstPass?: boolean
  /** Máx. minutos entre salida Excel y fin de journey Truckflow. */
  maxDischargeDeltaMin?: number
  /** Mismo día sin solape: tope de distancia salida ↔ journey. */
  maxSameDayDischargeDeltaMin?: number
  /** Segunda pasada enrich: tope distancia salida ↔ journey. */
  maxEnrichDischargeDeltaMin?: number
  /** Cache opcional OCR (misma salida, menos CPU en loops mov×journey). */
  plateMatchCache?: PlateMatchCache
}

const DEFAULT_OPTIONS: Required<MergeTruckflowMovimientosOptions> = {
  timeWindowBeforeMin: 480,
  timeWindowAfterMin: 480,
  fallbackSameDay: true,
  requirePlantMatch: false,
  requirePlatformCircuitMatch: false,
  minExactConfidence: 0.85,
  minProbableConfidence: 0.6,
  plateOcrThreshold: 0.82,
  enrichUnmatchedByPlateDay: true,
  excelFirstPass: true,
  maxDischargeDeltaMin: 480,
  maxSameDayDischargeDeltaMin: 360,
  maxEnrichDischargeDeltaMin: 240,
}

export const MERGE_STATUSES_WITH_PRODUCT = new Set<MergeStatus>([
  'MATCH_EXACT',
  'MATCH_PROBABLE',
  'MATCH_MULTIPLE_RESOLVED',
  'MATCH_ENRICHED_PLATE_DAY',
  'MATCH_FUZZY_PLATE',
  'MATCH_EXCEL_ANCHOR',
])

export type MergeCandidateScore = {
  movimiento: ExternalMovimientoContratoNormalized
  merge_confidence: number
  time_delta_min: number
  merge_reason: string
  matched_by: string
  platform_compatible: boolean | null
  plate_match: 'exact' | 'fuzzy'
}

export type MergedTruckflowMovimientoRow = TruckflowJourneyForMerge & {
  external_operation_id: string
  source_file: string
  source_date: string
  external_ingreso_at: string
  external_calado_at: string
  external_salida_at: string
  planta_normalized: string
  movement_type: string
  movement_type_detail: string
  product_normalized: string
  producto_original: string
  platform_normalized: string
  plataforma_original: string
  contrato: string
  cliente_contrato: string
  comprob: string
  cp_remito: string
  ctg: string
  cupo: string
  kgs_neto: string
  observaciones: string
  observacion_calidad: string
  merge_status: MergeStatus
  merge_confidence: number
  merge_reason: string
  matched_by: string
  time_delta_min: number
  ambiguous: boolean
  candidate_count: number
  candidate_operation_ids: string
  missing_camera_discharge: boolean
  operational_enrichment_ready: boolean
  circuit_from_excel: boolean
  truckflow_circuit_code: string
}

export type MergeResult = {
  merged: MergedTruckflowMovimientoRow[]
  truckflowWithoutMatch: Record<string, unknown>[]
  movimientosWithoutMatch: Record<string, unknown>[]
  ambiguousCases: Record<string, unknown>[]
  summary: Record<string, unknown>
}

function parseMs(iso: string): number {
  const t = parseTimestampMs(iso)
  return Number.isFinite(t) ? t : NaN
}

function minutesBetween(aMs: number, bMs: number): number {
  return Math.abs(aMs - bMs) / 60000
}

function dayKeyFromIso(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isPlatformCompatibleWithCircuit(
  platform_normalized: string,
  circuit_code: string,
  circuit_label: string,
  observed_sequence: string
): boolean | null {
  if (!platform_normalized) return null
  const p = platform_normalized.toUpperCase()
  const code = (circuit_code ?? '').toUpperCase()
  const label = (circuit_label ?? '').toUpperCase()
  const seq = (observed_sequence ?? '').toUpperCase()

  if (p.startsWith('CELDA_16')) {
    if (code.includes('CELDA') || label.includes('CELDA') || seq.includes('CELDA16')) return true
    if (code.includes('VOLCABLE') && !seq.includes('CELDA')) return false
    return null
  }
  if (p.startsWith('VOLCABLE_PTO_')) {
    if (code === 'R7' || label.includes('SAN LORENZO') || seq.includes('SL_')) return true
    if (code === 'R5' || code === 'R6' || label.includes('VOLCABLE 1') || label.includes('VOLCABLE 2')) {
      return false
    }
    return null
  }
  if (p.startsWith('VOLCABLE_')) {
    if (code.includes('VOLCABLE') || label.includes('VOLCABLE') || seq.includes('VOLCABLE')) return true
    if (code.includes('CELDA16') && !seq.includes('VOLCABLE')) return false
    return null
  }
  if (p.startsWith('KEPPLER_') || p.startsWith('KEPLER_')) {
    if (label.includes('KEPPLER') || label.includes('KEPLER') || seq.includes('KEPPLER') || seq.includes('KEPLER')) {
      return true
    }
    return null
  }
  if (p === 'ACEITE_OSL' || p === 'ACEITE_PTO' || p === 'ACEITE') {
    if (
      code.includes('R34') ||
      code.includes('R8') ||
      code.includes('R16') ||
      label.includes('LIQUIDO') ||
      seq.includes('LIQUIDO') ||
      isSlLiquidCircuit(code)
    ) {
      return true
    }
    return null
  }
  return null
}

function plantScopeCompatible(
  plantScope: string,
  planta_normalized: string
): boolean | null {
  if (!planta_normalized) return null
  const scope = (plantScope ?? '').toUpperCase()
  const plant = planta_normalized.toUpperCase()
  if (!scope || scope === 'UNKNOWN') return null
  if (plant === 'RICARDONE' && scope.includes('RICARDONE')) return true
  if (plant === 'SAN_LORENZO' && scope.includes('SAN_LORENZO')) return true
  if (plant === 'AVELLANEDA' && scope.includes('AVELLANEDA')) return true
  if (plant === 'TERMINAL_EMBARQUE' && scope.includes('TRANSILE')) return true
  if (scope === 'MIXTO') return null
  return null
}

function externalTimeWindow(
  mov: ExternalMovimientoContratoNormalized,
  opts: Required<MergeTruckflowMovimientosOptions>
): { startMs: number; endMs: number } | null {
  const ing = parseMs(mov.external_ingreso_at)
  const sal = parseMs(mov.external_salida_at)
  const before = opts.timeWindowBeforeMin * 60000
  const after = opts.timeWindowAfterMin * 60000
  if (Number.isFinite(ing) && Number.isFinite(sal)) {
    return { startMs: ing - before, endMs: sal + after }
  }
  if (Number.isFinite(ing)) {
    const w = 360 * 60000
    return { startMs: ing - w, endMs: ing + w }
  }
  if (Number.isFinite(sal)) {
    const w = 360 * 60000
    return { startMs: sal - w, endMs: sal + w }
  }
  return null
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

export function journeyMissingInstrumentedDischarge(observed_sequence: string): boolean {
  const seq = String(observed_sequence ?? '').toUpperCase()
  if (!seq) return true
  return (
    !seq.includes('VOLCABLE') &&
    !seq.includes('CELDA16') &&
    !seq.includes('CELDA16_DESCARGA') &&
    !seq.includes('CELDA16_CARGA')
  )
}

export function journeyNeedsOperationalEnrichment(journey: TruckflowJourneyForMerge): boolean {
  if (journey.executive_status === 'NO_DIFERENCIABLE' || journey.executive_status === 'NO_EVALUABLE') {
    return true
  }
  if (String(journey.committee_reason ?? '').includes('SIN_PUNTO')) return true
  if (journeyMissingInstrumentedDischarge(journey.observed_sequence)) return true
  return false
}

function sameCalendarDay(journey: TruckflowJourneyForMerge, mov: ExternalMovimientoContratoNormalized): boolean {
  const jDay = dayKeyFromIso(journey.start_time) || dayKeyFromIso(journey.end_time)
  const mDay =
    mov.source_date ||
    dayKeyFromIso(mov.external_salida_at) ||
    dayKeyFromIso(mov.external_calado_at) ||
    dayKeyFromIso(mov.external_ingreso_at)
  return Boolean(jDay && mDay && jDay === mDay)
}

/** Ancla operativa del Excel: salida (descarga) > calado > ingreso. */
export function externalDischargeReferenceMs(mov: ExternalMovimientoContratoNormalized): number {
  const sal = parseMs(mov.external_salida_at)
  const cal = parseMs(mov.external_calado_at)
  const ing = parseMs(mov.external_ingreso_at)
  if (Number.isFinite(sal)) return sal
  if (Number.isFinite(cal)) return cal
  if (Number.isFinite(ing)) return ing
  return NaN
}

function dischargeInsideJourneyWindow(journey: TruckflowJourneyForMerge, mov: ExternalMovimientoContratoNormalized): boolean {
  const ref = externalDischargeReferenceMs(mov)
  const s = parseMs(journey.start_time)
  const e = parseMs(journey.end_time)
  if (!Number.isFinite(ref) || !Number.isFinite(s) || !Number.isFinite(e)) return false
  const slackMs = 90 * 60000
  return ref >= s - slackMs && ref <= e + slackMs
}

/** Distancia salida/calado Excel ↔ fin (o inicio) del journey Truckflow. */
function temporalDeltaToJourney(journey: TruckflowJourneyForMerge, mov: ExternalMovimientoContratoNormalized): number {
  const ref = externalDischargeReferenceMs(mov)
  if (!Number.isFinite(ref)) return 999

  const jEnd = parseMs(journey.end_time)
  const jStart = parseMs(journey.start_time)

  if (Number.isFinite(jEnd)) {
    const toEnd = minutesBetween(ref, jEnd)
    if (Number.isFinite(jStart)) {
      return Math.min(toEnd, minutesBetween(ref, jStart))
    }
    return toEnd
  }
  if (Number.isFinite(jStart)) return minutesBetween(ref, jStart)
  return 999
}

function compareMergeCandidates(a: MergeCandidateScore, b: MergeCandidateScore): number {
  if (a.time_delta_min !== b.time_delta_min) return a.time_delta_min - b.time_delta_min
  if (a.platform_compatible === true && b.platform_compatible !== true) return -1
  if (b.platform_compatible === true && a.platform_compatible !== true) return 1
  if (b.merge_confidence !== a.merge_confidence) return b.merge_confidence - a.merge_confidence
  const ingA = parseMs(a.movimiento.external_salida_at) || parseMs(a.movimiento.external_ingreso_at)
  const ingB = parseMs(b.movimiento.external_salida_at) || parseMs(b.movimiento.external_ingreso_at)
  if (Number.isFinite(ingA) && Number.isFinite(ingB)) return ingA - ingB
  return 0
}

function scoreCandidate(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized,
  opts: Required<MergeTruckflowMovimientosOptions>,
  plateKind: 'exact' | 'fuzzy'
): MergeCandidateScore | null {
  const plateJ = normalizePlateStrict(journey.plate_normalized)
  const plateM = normalizePlateStrict(mov.plate_normalized || mov.patente_original)
  if (!plateJ || !plateM) return null

  let confidence = plateKind === 'exact' ? 0.48 : 0.42
  const reasons: string[] = [plateKind === 'exact' ? 'plate_exact' : 'plate_fuzzy_ocr']
  let matched_by = plateKind === 'exact' ? 'plate' : 'plate_fuzzy'
  let time_delta_min = temporalDeltaToJourney(journey, mov)

  const window = externalTimeWindow(mov, opts)
  const hasTimeOverlap = window ? journeyOverlapsWindow(journey, window) : false
  const dischargeInJourney = dischargeInsideJourneyWindow(journey, mov)

  if (hasTimeOverlap || dischargeInJourney) {
    confidence += dischargeInJourney ? 0.3 : 0.27
    reasons.push(dischargeInJourney ? 'discharge_in_journey' : 'time_window')
    matched_by = `${matched_by}+${dischargeInJourney ? 'discharge_anchor' : 'time_window'}`
  } else if (opts.fallbackSameDay && sameCalendarDay(journey, mov)) {
    if (time_delta_min > opts.maxSameDayDischargeDeltaMin) return null
    confidence += 0.12
    reasons.push('same_day_discharge')
    matched_by = `${matched_by}+same_day_discharge`
  } else if (time_delta_min <= opts.maxDischargeDeltaMin) {
    confidence += 0.08
    reasons.push('discharge_proximity')
    matched_by = `${matched_by}+discharge_proximity`
  } else {
    return null
  }

  if (time_delta_min <= 45) {
    confidence += 0.12
    reasons.push('discharge_aligned')
  } else if (time_delta_min <= 120) {
    confidence += 0.06
    reasons.push('discharge_near')
  }

  const plantOk = plantScopeCompatible(journey.plant_scope, mov.planta_normalized)
  if (plantOk === true) {
    confidence += 0.1
    reasons.push('plant_match')
  } else if (opts.requirePlantMatch && plantOk === false) {
    return null
  }

  const platformOk = isPlatformCompatibleWithCircuit(
    mov.platform_normalized,
    journey.circuit_code,
    journey.circuit_label,
    journey.observed_sequence
  )
  if (platformOk === true) {
    confidence += 0.1
    reasons.push('platform_circuit')
  } else if (opts.requirePlatformCircuitMatch && platformOk === false) {
    return null
  }

  const inferred = inferCircuitFromExternalMovimiento(mov)
  if (inferred && journeyNeedsCircuitFromExcel(journey)) {
    confidence += 0.1
    reasons.push('excel_circuit_infer')
  }
  if (journey.anomaly_real && mov.platform_normalized) {
    confidence += 0.06
    reasons.push('anomaly_excel_match')
  }

  if (mov.product_normalized) {
    confidence += 0.05
    reasons.push('product_present')
  }

  confidence = Math.min(1, Math.round(confidence * 1000) / 1000)

  return {
    movimiento: mov,
    merge_confidence: confidence,
    time_delta_min: Number.isFinite(time_delta_min) ? Math.round(time_delta_min * 100) / 100 : 999,
    merge_reason: reasons.join('+'),
    matched_by,
    platform_compatible: platformOk,
    plate_match: plateKind,
  }
}

function collectCandidatesForJourney(
  journey: TruckflowJourneyForMerge,
  movByPlate: Map<string, ExternalMovimientoContratoNormalized[]>,
  opts: Required<MergeTruckflowMovimientosOptions>,
  excludeMovIds?: Set<string>
): MergeCandidateScore[] {
  const plateJ = normalizePlateStrict(journey.plate_normalized)
  if (!plateJ) return []

  const seen = new Set<string>()
  const candidates: MergeCandidateScore[] = []

  for (const mov of movByPlate.get(plateJ) ?? []) {
    if (excludeMovIds?.has(mov.external_operation_id)) continue
    if (seen.has(mov.external_operation_id)) continue
    const sc = scoreCandidate(journey, mov, opts, 'exact')
    if (sc) {
      seen.add(mov.external_operation_id)
      candidates.push(sc)
    }
  }

  return candidates
}

function collectCandidatesForMovimiento(
  mov: ExternalMovimientoContratoNormalized,
  journeysByExactPlate: Map<string, TruckflowJourneyForMerge[]>,
  opts: Required<MergeTruckflowMovimientosOptions>,
  excludeJourneyUids: Set<string>
): { journey: TruckflowJourneyForMerge; score: MergeCandidateScore }[] {
  const plateM = normalizePlateStrict(mov.plate_normalized || mov.patente_original)
  if (!plateM) return []
  if (!Number.isFinite(externalDischargeReferenceMs(mov)) && !mov.source_date) return []

  const out: { journey: TruckflowJourneyForMerge; score: MergeCandidateScore }[] = []
  const pushJourney = (journey: TruckflowJourneyForMerge) => {
    if (excludeJourneyUids.has(journey.journey_uid)) return
    const sc = scoreCandidate(journey, mov, opts, 'exact')
    if (!sc) return
    const maxDelta =
      journey.anomaly_real ||
      journey.executive_status === 'ANOMALO' ||
      journey.executive_status === 'NO_DIFERENCIABLE' ||
      !journey.circuit_code ?
        Math.round(opts.maxDischargeDeltaMin * 1.5)
      : opts.maxDischargeDeltaMin
    if (sc.time_delta_min > maxDelta) return
    out.push({ journey, score: sc })
  }

  for (const journey of journeysByExactPlate.get(plateM) ?? []) {
    pushJourney(journey)
  }
  out.sort((a, b) => {
    const pri = excelAnchorJourneyPriority(b.journey, mov) - excelAnchorJourneyPriority(a.journey, mov)
    if (pri !== 0) return pri
    return compareMergeCandidates(a.score, b.score)
  })
  return out
}

function scorePlateDayEnrichment(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized
): MergeCandidateScore {
  let confidence = 0.62
  const reasons = ['operational_enrichment', 'plate_day']
  if (mov.product_normalized) reasons.push('product_present')
  if (mov.platform_normalized) reasons.push('platform_from_external')
  if (journeyNeedsOperationalEnrichment(journey)) reasons.push('missing_camera_discharge')
  confidence = Math.min(0.72, confidence + (mov.product_normalized ? 0.05 : 0))
  return {
    movimiento: mov,
    merge_confidence: Math.round(confidence * 1000) / 1000,
    time_delta_min: temporalDeltaToJourney(journey, mov),
    merge_reason: reasons.join('+'),
    matched_by: 'enrich_plate_day',
    platform_compatible: null,
    plate_match: 'exact',
  }
}

function pickBestPlateDayCandidate(
  journey: TruckflowJourneyForMerge,
  pool: ExternalMovimientoContratoNormalized[],
  opts: Required<MergeTruckflowMovimientosOptions>,
  excludeMovIds?: Set<string>
): MergeCandidateScore | null {
  const plateJ = normalizePlateStrict(journey.plate_normalized)
  if (!plateJ) return null

  const day = dayKeyFromIso(journey.start_time) || dayKeyFromIso(journey.end_time)
  const dayPool = pool.filter((m) => {
    if (excludeMovIds?.has(m.external_operation_id)) return false
    const mDay =
      m.source_date ||
      dayKeyFromIso(m.external_salida_at) ||
      dayKeyFromIso(m.external_calado_at) ||
      dayKeyFromIso(m.external_ingreso_at)
    return !day || mDay === day
  })
  if (!dayPool.length) return null

  const scored: MergeCandidateScore[] = []
  for (const mov of dayPool) {
    const mp = normalizePlateStrict(mov.plate_normalized || mov.patente_original)
    if (mp !== plateJ) continue
    if (!mov.product_normalized && !mov.platform_normalized) continue
    const sc = scorePlateDayEnrichment(journey, mov)
    if (sc.time_delta_min > opts.maxEnrichDischargeDeltaMin) continue
    const platformOk = isPlatformCompatibleWithCircuit(
      mov.platform_normalized,
      journey.circuit_code,
      journey.circuit_label,
      journey.observed_sequence
    )
    scored.push({ ...sc, platform_compatible: platformOk })
  }
  if (!scored.length) return null

  scored.sort(compareMergeCandidates)

  const top = scored[0]!
  const second = scored[1]
  if (
    second &&
    top.movimiento.product_normalized &&
    second.movimiento.product_normalized &&
    top.movimiento.product_normalized !== second.movimiento.product_normalized &&
    Math.abs(top.time_delta_min - second.time_delta_min) < 45
  ) {
    return null
  }
  if (second && Math.abs(top.time_delta_min - second.time_delta_min) < 15) return null
  return top
}

function applyMovimientoToRow(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized,
  pick: MergeCandidateScore,
  status: MergeStatus,
  ambiguous: boolean,
  candidateCount: number,
  candidateIds: string
): MergedTruckflowMovimientoRow {
  const missingDischarge = journeyMissingInstrumentedDischarge(journey.observed_sequence)
  const hasProduct = Boolean(mov.product_normalized)
  const enriched =
    hasProduct &&
    (status === 'MATCH_ENRICHED_PLATE_DAY' ||
      status === 'MATCH_FUZZY_PLATE' ||
      status === 'MATCH_EXCEL_ANCHOR' ||
      (missingDischarge && MERGE_STATUSES_WITH_PRODUCT.has(status)))

  const withCircuit = applyExternalCircuitToJourney(journey, mov)

  return {
    ...withCircuit,
    external_operation_id: mov.external_operation_id,
    source_file: mov.source_file,
    source_date: mov.source_date,
    external_ingreso_at: mov.external_ingreso_at,
    external_calado_at: mov.external_calado_at,
    external_salida_at: mov.external_salida_at,
    planta_normalized: mov.planta_normalized,
    movement_type: mov.movement_type,
    movement_type_detail: mov.movement_type_detail,
    product_normalized: mov.product_normalized,
    producto_original: mov.producto_original,
    platform_normalized: mov.platform_normalized,
    plataforma_original: mov.plataforma_original,
    contrato: mov.contrato,
    cliente_contrato: mov.cliente_contrato,
    comprob: mov.comprob,
    cp_remito: mov.cp_remito,
    ctg: mov.ctg,
    cupo: mov.cupo,
    kgs_neto: mov.kgs_neto,
    observaciones: mov.observaciones,
    observacion_calidad: mov.observacion_calidad,
    merge_status: status,
    merge_confidence: pick.merge_confidence,
    merge_reason: pick.merge_reason,
    matched_by: pick.matched_by,
    time_delta_min: pick.time_delta_min,
    ambiguous,
    candidate_count: candidateCount,
    candidate_operation_ids: candidateIds,
    missing_camera_discharge: missingDischarge,
    operational_enrichment_ready: enriched,
  }
}

function resolveMergeStatus(
  candidates: MergeCandidateScore[],
  opts: Required<MergeTruckflowMovimientosOptions>
): {
  status: MergeStatus
  pick: MergeCandidateScore | null
  ambiguous: boolean
} {
  if (!candidates.length) {
    return { status: 'NO_EXTERNAL_MATCH', pick: null, ambiguous: false }
  }
  const sorted = [...candidates].sort(compareMergeCandidates)

  const top = sorted[0]!
  const second = sorted[1]

  if (sorted.length === 1) {
    if (top.merge_confidence >= opts.minExactConfidence) {
      return { status: 'MATCH_EXACT', pick: top, ambiguous: false }
    }
    if (top.merge_confidence >= opts.minProbableConfidence) {
      return { status: 'MATCH_PROBABLE', pick: top, ambiguous: false }
    }
    return { status: 'MATCH_PROBABLE', pick: top, ambiguous: false }
  }

  if (second && top.merge_confidence - second.merge_confidence >= 0.15) {
    if (top.merge_confidence >= opts.minExactConfidence) {
      return { status: 'MATCH_MULTIPLE_RESOLVED', pick: top, ambiguous: false }
    }
    if (top.merge_confidence >= opts.minProbableConfidence) {
      return { status: 'MATCH_MULTIPLE_RESOLVED', pick: top, ambiguous: false }
    }
    return { status: 'MATCH_MULTIPLE_RESOLVED', pick: top, ambiguous: false }
  }

  if (top.merge_confidence >= opts.minExactConfidence && !second) {
    return { status: 'MATCH_EXACT', pick: top, ambiguous: false }
  }

  const similar =
    !!second &&
    Math.abs(top.merge_confidence - second.merge_confidence) < 0.15
  if (similar) {
    return { status: 'MATCH_AMBIGUOUS', pick: top, ambiguous: true }
  }
  return { status: 'MATCH_MULTIPLE', pick: top, ambiguous: true }
}

function emptyExternalFields(): Pick<
  MergedTruckflowMovimientoRow,
  | 'external_operation_id'
  | 'source_file'
  | 'source_date'
  | 'external_ingreso_at'
  | 'external_calado_at'
  | 'external_salida_at'
  | 'planta_normalized'
  | 'movement_type'
  | 'movement_type_detail'
  | 'product_normalized'
  | 'producto_original'
  | 'platform_normalized'
  | 'plataforma_original'
  | 'contrato'
  | 'cliente_contrato'
  | 'comprob'
  | 'cp_remito'
  | 'ctg'
  | 'cupo'
  | 'kgs_neto'
  | 'observaciones'
  | 'observacion_calidad'
> {
  return {
    external_operation_id: '',
    source_file: '',
    source_date: '',
    external_ingreso_at: '',
    external_calado_at: '',
    external_salida_at: '',
    planta_normalized: '',
    movement_type: '',
    movement_type_detail: '',
    product_normalized: '',
    producto_original: '',
    platform_normalized: '',
    plataforma_original: '',
    contrato: '',
    cliente_contrato: '',
    comprob: '',
    cp_remito: '',
    ctg: '',
    cupo: '',
    kgs_neto: '',
    observaciones: '',
    observacion_calidad: '',
  }
}

export async function mergeTruckflowWithMovimientos(
  truckflowJourneys: TruckflowJourneyForMerge[],
  movimientosContrato: ExternalMovimientoContratoNormalized[],
  options?: MergeTruckflowMovimientosOptions
): Promise<MergeResult> {
  const opts: Required<MergeTruckflowMovimientosOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    plateMatchCache: options?.plateMatchCache ?? createPlateMatchCache(),
  }
  const merged: MergedTruckflowMovimientoRow[] = []
  const truckflowWithoutMatch: Record<string, unknown>[] = []
  const ambiguousCases: Record<string, unknown>[] = []
  const matchedMovIds = new Set<string>()

  const journeysByExactPlate = new Map<string, TruckflowJourneyForMerge[]>()
  for (const j of truckflowJourneys) {
    const p = normalizePlateStrict(j.plate_normalized)
    if (!p) continue
    const arr = journeysByExactPlate.get(p) ?? []
    arr.push(j)
    journeysByExactPlate.set(p, arr)
  }

  const movByPlate = new Map<string, ExternalMovimientoContratoNormalized[]>()
  for (const m of movimientosContrato) {
    const p =
      normalizePlateStrict(m.plate_normalized || m.patente_original) ||
      normalizePlate(m.patente_original) ||
      ''
    if (!p) continue
    const arr = movByPlate.get(p) ?? []
    arr.push(m)
    movByPlate.set(p, arr)
  }

  const statusCounts = new Map<MergeStatus, number>()

  const journeyByUid = new Map(truckflowJourneys.map((j) => [j.journey_uid, j]))
  const excelAssignedByJourney = new Map<string, MergedTruckflowMovimientoRow>()
  const assignedJourneyUids = new Set<string>()

  if (opts.excelFirstPass) {
    let excelAnchorPass = 0
    for (const mov of movimientosContrato) {
      if (++excelAnchorPass % 25 === 0) await yieldToBrowser()
      if (matchedMovIds.has(mov.external_operation_id)) continue
      const candidates = collectCandidatesForMovimiento(
        mov,
        journeysByExactPlate,
        opts,
        assignedJourneyUids
      )
      if (!candidates.length) continue

      const top = candidates[0]!
      const second = candidates[1]
      let ambiguous = false
      if (
        second &&
        top.score.movimiento.product_normalized &&
        mov.product_normalized &&
        top.score.movimiento.external_operation_id !== mov.external_operation_id &&
        Math.abs(top.score.time_delta_min - second.score.time_delta_min) < 45
      ) {
        ambiguous = true
      }

      const pick = top.score
      const journey = top.journey
      matchedMovIds.add(mov.external_operation_id)
      assignedJourneyUids.add(journey.journey_uid)

      const row = applyMovimientoToRow(
        journey,
        mov,
        pick,
        'MATCH_EXCEL_ANCHOR',
        ambiguous,
        candidates.length,
        candidates.map((c) => c.score.movimiento.external_operation_id).join('|')
      )
      excelAssignedByJourney.set(journey.journey_uid, row)
      statusCounts.set('MATCH_EXCEL_ANCHOR', (statusCounts.get('MATCH_EXCEL_ANCHOR') ?? 0) + 1)

      if (ambiguous) {
        ambiguousCases.push({
          journey_uid: journey.journey_uid,
          plate_normalized: journey.plate_normalized,
          external_operation_id: mov.external_operation_id,
          product_normalized: mov.product_normalized,
          candidate_count: candidates.length,
          reason: 'EXCEL_ANCHOR_AMBIGUOUS',
        })
      }
    }
  }

  let journeyMergePass = 0
  for (const journey of truckflowJourneys) {
    if (++journeyMergePass % 40 === 0) await yieldToBrowser()
    const preassigned = excelAssignedByJourney.get(journey.journey_uid)
    if (preassigned) {
      merged.push(preassigned)
      continue
    }

    if (!journey.plate_normalized) {
      const row: MergedTruckflowMovimientoRow = {
        ...journey,
        ...emptyExternalFields(),
        merge_status: 'INSUFFICIENT_DATA',
        merge_confidence: 0,
        merge_reason: 'missing_plate',
        matched_by: '',
        time_delta_min: 0,
        ambiguous: false,
        candidate_count: 0,
        candidate_operation_ids: '',
        missing_camera_discharge: journeyMissingInstrumentedDischarge(journey.observed_sequence),
        operational_enrichment_ready: false,
        circuit_from_excel: false,
        truckflow_circuit_code: journey.circuit_code,
      }
      merged.push(row)
      statusCounts.set('INSUFFICIENT_DATA', (statusCounts.get('INSUFFICIENT_DATA') ?? 0) + 1)
      truckflowWithoutMatch.push({
        journey_uid: journey.journey_uid,
        plate_normalized: '',
        start_time: journey.start_time,
        end_time: journey.end_time,
        circuit_code: journey.circuit_code,
        circuit_label: journey.circuit_label,
        executive_status: journey.executive_status,
        valid_detail: journey.valid_detail,
        observed_sequence: journey.observed_sequence,
        reason: 'MISSING_PLATE',
      })
      continue
    }

    const candidates = collectCandidatesForJourney(
      journey,
      movByPlate,
      opts,
      matchedMovIds
    )

    const { status, pick, ambiguous } = resolveMergeStatus(candidates, opts)
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)

    const candidateIds = candidates.map((c) => c.movimiento.external_operation_id).join('|')
    const candidateScores = candidates.map((c) => c.merge_confidence.toFixed(2)).join('|')

    if (status === 'NO_EXTERNAL_MATCH' || status === 'INSUFFICIENT_DATA') {
      merged.push({
        ...journey,
        ...emptyExternalFields(),
        merge_status: status,
        merge_confidence: 0,
        merge_reason: 'no_compatible_movimiento',
        matched_by: '',
        time_delta_min: 0,
        ambiguous: false,
        candidate_count: candidates.length,
        candidate_operation_ids: candidateIds,
        missing_camera_discharge: journeyMissingInstrumentedDischarge(journey.observed_sequence),
        operational_enrichment_ready: false,
        circuit_from_excel: false,
        truckflow_circuit_code: journey.circuit_code,
      })
      truckflowWithoutMatch.push({
        journey_uid: journey.journey_uid,
        plate_normalized: journey.plate_normalized,
        start_time: journey.start_time,
        end_time: journey.end_time,
        circuit_code: journey.circuit_code,
        circuit_label: journey.circuit_label,
        executive_status: journey.executive_status,
        valid_detail: journey.valid_detail,
        observed_sequence: journey.observed_sequence,
        reason: status,
      })
      continue
    }

    const mov = pick!.movimiento
    matchedMovIds.add(mov.external_operation_id)

    merged.push(
      applyMovimientoToRow(journey, mov, pick!, status, ambiguous, candidates.length, candidateIds)
    )

    if (ambiguous || status === 'MATCH_AMBIGUOUS' || status === 'MATCH_MULTIPLE') {
      ambiguousCases.push({
        journey_uid: journey.journey_uid,
        plate_normalized: journey.plate_normalized,
        start_time: journey.start_time,
        end_time: journey.end_time,
        circuit_code: journey.circuit_code,
        candidate_count: candidates.length,
        candidate_operation_ids: candidateIds,
        candidate_scores: candidateScores,
        reason: status,
      })
    }
  }

  if (opts.enrichUnmatchedByPlateDay) {
    const withoutIdx = new Set(
      truckflowWithoutMatch.map((r) => String(r.journey_uid ?? ''))
    )
    for (let i = 0; i < merged.length; i++) {
      const row = merged[i]!
      if (row.merge_status !== 'NO_EXTERNAL_MATCH') continue
      const journey = journeyByUid.get(row.journey_uid)
      if (!journey) continue

      const enrichPick = pickBestPlateDayCandidate(journey, movimientosContrato, opts, matchedMovIds)
      if (!enrichPick) continue

      const enrichStatus: MergeStatus =
        enrichPick.plate_match === 'fuzzy' ? 'MATCH_FUZZY_PLATE' : 'MATCH_ENRICHED_PLATE_DAY'

      statusCounts.set('NO_EXTERNAL_MATCH', Math.max(0, (statusCounts.get('NO_EXTERNAL_MATCH') ?? 1) - 1))
      statusCounts.set(enrichStatus, (statusCounts.get(enrichStatus) ?? 0) + 1)

      matchedMovIds.add(enrichPick.movimiento.external_operation_id)
      merged[i] = applyMovimientoToRow(
        journey,
        enrichPick.movimiento,
        enrichPick,
        enrichStatus,
        false,
        1,
        enrichPick.movimiento.external_operation_id
      )
      withoutIdx.delete(row.journey_uid)
    }
    if (withoutIdx.size !== truckflowWithoutMatch.length) {
      const keep = new Set(withoutIdx)
      for (let w = truckflowWithoutMatch.length - 1; w >= 0; w--) {
        if (!keep.has(String(truckflowWithoutMatch[w]!.journey_uid ?? ''))) {
          truckflowWithoutMatch.splice(w, 1)
        }
      }
    }
  }

  const movimientosWithoutMatch: Record<string, unknown>[] = []
  let noTruckflow = 0
  for (const m of movimientosContrato) {
    if (matchedMovIds.has(m.external_operation_id)) continue
    noTruckflow++
    statusCounts.set('NO_TRUCKFLOW_MATCH', (statusCounts.get('NO_TRUCKFLOW_MATCH') ?? 0) + 1)
    movimientosWithoutMatch.push({
      external_operation_id: m.external_operation_id,
      plate_normalized: m.plate_normalized,
      external_ingreso_at: m.external_ingreso_at,
      external_salida_at: m.external_salida_at,
      product_normalized: m.product_normalized,
      platform_normalized: m.platform_normalized,
      planta_normalized: m.planta_normalized,
      movement_type: m.movement_type,
      source_file: m.source_file,
      reason: 'NO_TRUCKFLOW_MATCH',
    })
  }

  const totalTruckflow = truckflowJourneys.length
  const totalMov = movimientosContrato.length
  const matchedTruckflow = merged.filter((r) => MERGE_STATUSES_WITH_PRODUCT.has(r.merge_status)).length
  const withProductAssigned = merged.filter((r) => r.product_normalized).length
  const operationalEnrichmentReady = merged.filter((r) => r.operational_enrichment_ready).length
  const enrichedSinDescarga = merged.filter(
    (r) => r.operational_enrichment_ready && r.missing_camera_discharge
  ).length

  const products = new Set(merged.map((r) => r.product_normalized).filter(Boolean))
  const platforms = new Set(merged.map((r) => r.platform_normalized).filter(Boolean))

  const summary: Record<string, unknown> = {
    total_truckflow_journeys: totalTruckflow,
    total_movimientos: totalMov,
    match_exact: statusCounts.get('MATCH_EXACT') ?? 0,
    match_probable: statusCounts.get('MATCH_PROBABLE') ?? 0,
    match_multiple_resolved: statusCounts.get('MATCH_MULTIPLE_RESOLVED') ?? 0,
    match_enriched_plate_day: statusCounts.get('MATCH_ENRICHED_PLATE_DAY') ?? 0,
    match_excel_anchor: statusCounts.get('MATCH_EXCEL_ANCHOR') ?? 0,
    match_fuzzy_plate: statusCounts.get('MATCH_FUZZY_PLATE') ?? 0,
    match_multiple: statusCounts.get('MATCH_MULTIPLE') ?? 0,
    match_ambiguous: statusCounts.get('MATCH_AMBIGUOUS') ?? 0,
    no_external_match: statusCounts.get('NO_EXTERNAL_MATCH') ?? 0,
    no_truckflow_match: noTruckflow,
    insufficient_data: statusCounts.get('INSUFFICIENT_DATA') ?? 0,
    journeys_with_product: withProductAssigned,
    operational_enrichment_ready: operationalEnrichmentReady,
    enriched_sin_descarga_camara: enrichedSinDescarga,
    match_rate_truckflow:
      totalTruckflow > 0 ? Math.round((matchedTruckflow / totalTruckflow) * 10000) / 10000 : 0,
    match_rate_movimientos:
      totalMov > 0 ? Math.round((matchedMovIds.size / totalMov) * 10000) / 10000 : 0,
    unique_products: products.size,
    unique_platforms: platforms.size,
  }

  return {
    merged,
    truckflowWithoutMatch,
    movimientosWithoutMatch,
    ambiguousCases,
    summary,
  }
}
