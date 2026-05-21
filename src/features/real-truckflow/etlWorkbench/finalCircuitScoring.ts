import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { isEtlRearCameraDevice } from './etlRearDevices'

export type EntrySource =
  | 'ingreso_frontal'
  | 'preingreso'
  | 'ingreso_y_preingreso'
  | 'sin_ingreso'

export type ExitSource = 'egreso' | 'balanza_egreso' | 'egreso_y_balanza' | 'sin_egreso'

export type ConfidenceLevel = 'alta' | 'media' | 'baja' | 'muy_baja'

export type FinalCircuitStatus =
  | 'circuito_completo'
  | 'circuito_probable'
  | 'circuito_probable_sin_ingreso'
  | 'circuito_probable_sin_egreso'
  | 'incompleto_revision'
  | 'descartado'

/** Taxonomía ejecutiva para comité (UI productiva). */
export type ExecutiveBucket = 'COMPLETO' | 'INCOMPLETO' | 'ANOMALO' | 'DEDUCIDO'

export type ExecutiveAnomalyReason = 'ANOMALIA_NO_RESPETA_SECUENCIA' | 'SCORE_BAJO' | null

const RIC_B2_EGRESO_NORM = 'ricb2egreso'

const LOGICAL_LABEL_ES: Record<string, string> = {
  INGRESO: 'ingreso',
  PREINGRESO: 'preingreso',
  CALADA: 'calada',
  BALANZA_INGRESO: 'balanza ingreso',
  BALANZA_EGRESO: 'balanza egreso',
  BALANZA: 'balanza',
  EGRESO: 'egreso',
  VOLCABLE: 'volcable',
  CELDA16_CARGA: 'celda16 carga',
  CELDA16_DESCARGA: 'celda16 descarga',
  LIQUIDO: 'líquido',
  SL_INGRESO: 'san lorenzo ingreso',
}

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

function logicalSet(j: ReconstructedRealJourney): Set<string> {
  return new Set(j.logicalCodeSequence.map((x) => String(x)))
}

function normDevice(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, '_') : ''
}

export function journeyHasRicB2EgresoDevice(j: ReconstructedRealJourney): boolean {
  return j.events.some((e) => normDevice(e.deviceCode) === RIC_B2_EGRESO_NORM)
}

export function resolveOperationalEntry(logicals: Set<string>): {
  has_operational_entry: boolean
  entry_source: EntrySource
  has_ingreso: boolean
  has_preingreso: boolean
} {
  const has_ingreso = logicals.has('INGRESO')
  const has_preingreso = logicals.has('PREINGRESO')
  const has_operational_entry = has_ingreso || has_preingreso

  let entry_source: EntrySource = 'sin_ingreso'
  if (has_ingreso && has_preingreso) entry_source = 'ingreso_y_preingreso'
  else if (has_ingreso) entry_source = 'ingreso_frontal'
  else if (has_preingreso) entry_source = 'preingreso'

  return { has_operational_entry, entry_source, has_ingreso, has_preingreso }
}

export function resolveOperationalExit(
  logicals: Set<string>,
  hasRicB2Egreso: boolean
): {
  has_operational_exit: boolean
  exit_source: ExitSource
  has_egreso: boolean
  has_balanza_egreso: boolean
} {
  const has_egreso = logicals.has('EGRESO') || hasRicB2Egreso
  const has_balanza_egreso = logicals.has('BALANZA_EGRESO')
  const has_operational_exit = has_egreso || has_balanza_egreso

  let exit_source: ExitSource = 'sin_egreso'
  if (has_egreso && has_balanza_egreso) exit_source = 'egreso_y_balanza'
  else if (has_egreso) exit_source = 'egreso'
  else if (has_balanza_egreso) exit_source = 'balanza_egreso'

  return { has_operational_exit, exit_source, has_egreso, has_balanza_egreso }
}

/** Egreso lógico en secuencia (EGRESO o RicB2Egreso); se mantiene por compatibilidad. */
export function journeyHasLogicalEgreso(j: ReconstructedRealJourney): boolean {
  const logicals = logicalSet(j)
  return resolveOperationalExit(logicals, journeyHasRicB2EgresoDevice(j)).has_egreso
}

export function journeyHasStrongDefiningPoint(j: ReconstructedRealJourney): boolean {
  const variant = j.preliminaryCircuitVariant ?? ''
  const code = j.preliminaryCircuitCode
  if (variant === 'TRANSILE_VOLCABLE_BALANZA' || code === 'TRANSILE_VOLCABLE_BALANZA') return true
  const strongDevice = j.events.some((e) => /^RicCalLiq/i.test((e.deviceCode ?? '').trim()))
  const logicals = logicalSet(j)
  return (
    strongDevice ||
    logicals.has('CELDA16_CARGA') ||
    logicals.has('CELDA16_DESCARGA') ||
    logicals.has('VOLCABLE') ||
    logicals.has('LIQUIDO')
  )
}

export function journeyHasBalansaCompleta(j: ReconstructedRealJourney): boolean {
  const logicals = logicalSet(j)
  return logicals.has('BALANZA_INGRESO') && logicals.has('BALANZA_EGRESO')
}

export function journeyHasStrongConfidenceBonus(j: ReconstructedRealJourney): boolean {
  if (journeyHasStrongDefiningPoint(j)) return true
  const logicals = logicalSet(j)
  return logicals.has('BALANZA_INGRESO') && logicals.has('BALANZA_EGRESO')
}

function expectedCircuitTemplateLength(j: ReconstructedRealJourney): number {
  const code = j.preliminaryCircuitCode
  const variant = j.preliminaryCircuitVariant ?? ''
  if (variant === 'TRANSILE_VOLCABLE_BALANZA' || code === 'TRANSILE_VOLCABLE_BALANZA') return 2
  switch (code) {
    case 'CIRCUITO_CELDA16_DESCARGA':
    case 'CIRCUITO_CELDA16_CARGA':
    case 'CIRCUITO_VOLCABLE_1_2':
      return 7
    case 'CIRCUITO_LIQUIDO':
      return 6
    case 'CIRCUITO_SAN_LORENZO':
      return 4
    case 'DESPACHO_SIN_PUNTO_INSTRUMENTADO':
      return 6
    default:
      return 0
  }
}

function labelEs(code: string): string {
  return LOGICAL_LABEL_ES[code] ?? code.toLowerCase().replace(/_/g, ' ')
}

export function buildReliabilityExplanation(
  expected: number,
  matched: number,
  missing: string[],
  preliminaryCode: string
): string {
  if (expected <= 0) {
    return preliminaryCode === 'REGISTRO_INCOMPLETO' ?
        'Sin plantilla de puntos: registro incompleto.'
      : 'Sin plantilla de puntos esperados para el circuito preliminar.'
  }
  const missLabels = missing.map(labelEs)
  if (missing.length === 0) {
    return `Coinciden ${matched} de ${expected} puntos esperados del circuito.`
  }
  const matchedN = Math.max(0, matched)
  const matchedHint =
    matchedN > 0 ?
      ` Coinciden ${matchedN} de ${expected} puntos esperados.`
    : ` Ningún punto esperado coincide (${expected} esperados).`
  const falta =
    missLabels.length === 1 ?
      `Falta ${missLabels[0]}.`
    : `Faltan ${missLabels.join(', ')}.`
  return `${matchedHint.trim()} ${falta}`.trim()
}

export function computeJourneyReliability(j: ReconstructedRealJourney): {
  expected_points_count: number
  matched_points_count: number
  missing_points_count: number
  reliability_score: number
  reliability_explanation: string
} {
  const expected = expectedCircuitTemplateLength(j)
  const miss = j.missingExpectedPoints ?? []
  const matched = Math.max(0, expected - miss.length)
  const reliability_score =
    expected <= 0 ? 0 : Math.min(100, Math.round((matched / expected) * 1000) / 10)

  return {
    expected_points_count: expected,
    matched_points_count: matched,
    missing_points_count: miss.length,
    reliability_score,
    reliability_explanation: buildReliabilityExplanation(
      expected,
      matched,
      miss,
      j.preliminaryCircuitCode
    ),
  }
}

export function confidenceLevelFromScore(
  score: number,
  strongBonus: boolean
): ConfidenceLevel {
  let level: ConfidenceLevel
  if (score >= 85) level = 'alta'
  else if (score >= 70) level = 'media'
  else if (score >= 50) level = 'baja'
  else level = 'muy_baja'

  if (!strongBonus) return level
  const bump: Record<ConfidenceLevel, ConfidenceLevel> = {
    muy_baja: 'baja',
    baja: 'media',
    media: 'alta',
    alta: 'alta',
  }
  return bump[level]
}

export function journeySequenceCoherent(
  j: ReconstructedRealJourney,
  seqPack: { startsAtValidEntry: boolean; endsAtValidExit: boolean }
): boolean {
  const missN = (j.missingExpectedPoints ?? []).length
  return (
    missN === 0 &&
    seqPack.startsAtValidEntry &&
    seqPack.endsAtValidExit &&
    j.preliminaryCircuitCode !== 'REGISTRO_INCOMPLETO'
  )
}

export function resolveFinalStatus(input: {
  j: ReconstructedRealJourney
  reliabilityScore: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  strong: boolean
  balanzaCompleta: boolean
  suspiciousDuplicate: boolean
  duplicateSeverity: 'none' | 'moderate' | 'severe'
  sequenceCoherent: boolean
  eventCountFront: number
}): FinalCircuitStatus {
  const {
    j,
    reliabilityScore,
    hasOperationalEntry,
    hasOperationalExit,
    strong,
    balanzaCompleta,
    suspiciousDuplicate,
    duplicateSeverity,
    sequenceCoherent,
    eventCountFront,
  } = input
  const rel = reliabilityScore

  if (duplicateSeverity === 'severe' || j.eventCount < 1) return 'descartado'

  /** ≤2 lecturas frontales → incompleto (no anomalía por secuencia). */
  if (eventCountFront <= 2) return 'incompleto_revision'

  /** Eventos suficientes pero secuencia ilógica → revisión (bucket ANOMALO en capa ejecutiva). */
  if (eventCountFront > 2 && !sequenceCoherent && (hasOperationalEntry || hasOperationalExit)) {
    return 'incompleto_revision'
  }

  if (
    hasOperationalEntry &&
    hasOperationalExit &&
    rel >= 70 &&
    sequenceCoherent &&
    !suspiciousDuplicate
  ) {
    return 'circuito_completo'
  }

  if (hasOperationalEntry && !hasOperationalExit && rel >= 50) {
    return 'circuito_probable_sin_egreso'
  }

  if (!hasOperationalEntry && rel >= 50 && (strong || balanzaCompleta)) {
    return 'circuito_probable_sin_ingreso'
  }

  if (rel >= 60 && (strong || sequenceCoherent || hasOperationalEntry)) {
    return 'circuito_probable'
  }

  if (eventCountFront > 2 && rel < 50) return 'incompleto_revision'

  return 'incompleto_revision'
}

/** Bucket ejecutivo para comité — capa sobre `final_status` sin romper CSV legacy. */
export function resolveExecutiveBucket(input: {
  finalStatus: FinalCircuitStatus
  frontEventCount: number
  reliabilityScore: number
  sequenceCoherent: boolean
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  strong: boolean
}): { bucket: ExecutiveBucket; anomalyReason: ExecutiveAnomalyReason } {
  const {
    finalStatus,
    frontEventCount,
    reliabilityScore,
    sequenceCoherent,
    hasOperationalEntry,
    hasOperationalExit,
    strong,
  } = input

  if (finalStatus === 'descartado') {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (frontEventCount <= 2) {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (
    frontEventCount > 2 &&
    !sequenceCoherent &&
    (hasOperationalEntry || hasOperationalExit || reliabilityScore >= 30)
  ) {
    return { bucket: 'ANOMALO', anomalyReason: 'ANOMALIA_NO_RESPETA_SECUENCIA' }
  }

  if (frontEventCount > 2 && reliabilityScore < 50) {
    return { bucket: 'ANOMALO', anomalyReason: 'SCORE_BAJO' }
  }

  if (finalStatus === 'circuito_completo') {
    return { bucket: 'COMPLETO', anomalyReason: null }
  }

  if (
    finalStatus === 'circuito_probable' ||
    finalStatus === 'circuito_probable_sin_ingreso' ||
    finalStatus === 'circuito_probable_sin_egreso'
  ) {
    if (reliabilityScore >= 50 || strong) {
      return { bucket: 'DEDUCIDO', anomalyReason: null }
    }
  }

  if (finalStatus === 'incompleto_revision') {
    return frontEventCount > 2 ?
        { bucket: 'ANOMALO', anomalyReason: 'SCORE_BAJO' }
      : { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  return { bucket: 'INCOMPLETO', anomalyReason: null }
}

export function executiveBucketLabel(bucket: ExecutiveBucket): string {
  switch (bucket) {
    case 'COMPLETO':
      return 'Completo'
    case 'INCOMPLETO':
      return 'Incompleto'
    case 'ANOMALO':
      return 'Anómalo'
    case 'DEDUCIDO':
      return 'Deducido'
  }
}

export function finalStatusLabel(status: FinalCircuitStatus): string {
  switch (status) {
    case 'circuito_completo':
      return 'Completo'
    case 'circuito_probable':
      return 'Probable'
    case 'circuito_probable_sin_ingreso':
      return 'Probable sin ingreso'
    case 'circuito_probable_sin_egreso':
      return 'Probable sin egreso'
    case 'incompleto_revision':
      return 'Incompleto en revisión'
    case 'descartado':
      return 'Descartado'
  }
}

export function journeyDeviceSectorLogical(j: ReconstructedRealJourney) {
  const sorted = [...j.events].sort(compareRealEvents)
  const deviceSequence = sorted.map((e) => e.deviceCode).join('>')
  const sectorSequence = sorted.map((e) => e.sectorCode).join('>')
  const normPoints = sorted.map(normalizeRealEventPoint)
  const logical = collapseConsecutiveEqual(normPoints.map((n) => n.logicalCode)).join('>')
  const collapsedLogical = collapseConsecutiveEqual(normPoints.map((n) => n.logicalCode))
  let frontCt = 0
  let rearCt = 0
  for (const e of sorted) {
    if (isEtlRearCameraDevice(e.deviceCode)) rearCt++
    else frontCt++
  }
  const firstLc = collapsedLogical[0] ?? ''
  const lastLc = collapsedLogical[collapsedLogical.length - 1] ?? ''
  const lastDevice = sorted.length ? normDevice(sorted[sorted.length - 1].deviceCode) : ''
  const startsAtValidEntry = firstLc === 'INGRESO' || firstLc === 'PREINGRESO'
  const endsAtValidExit =
    lastLc === 'EGRESO' || lastLc === 'BALANZA_EGRESO' || lastDevice === RIC_B2_EGRESO_NORM
  return {
    deviceSequence,
    sectorSequence,
    logicalSequence: logical,
    frontEventCount: frontCt,
    rearEventCount: rearCt,
    startsAtValidEntry,
    endsAtValidExit,
  }
}
