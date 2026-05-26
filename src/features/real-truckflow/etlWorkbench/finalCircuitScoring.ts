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

export type ExecutiveAnomalyReason =
  | 'ANOMALIA_NO_RESPETA_SECUENCIA'
  | 'NO_RESPETA_SECUENCIA'
  /** Legacy; ya no usado como regla única ejecutiva pero se conserva en el tipo CSV. */
  | 'SCORE_BAJO'
  | 'INVALID_ROUTE_ALERT'
  | 'INVALID_JOURNEY_START_ALERT'
  | null

/** Ajuste de secuencia frente al circuito esperado antes del bucket ejecutivo. */
export type SequenceFit = 'EXACT' | 'VARIANT' | 'DEDUCED' | 'PARTIAL' | 'BROKEN'

export type JourneyMatrixFinalStatus = 'COMPLETO' | 'INCOMPLETO' | 'DEDUCIDO' | 'ANOMALO'

export type JourneyCircuitMatrix = Record<string, readonly string[]>

export type JourneyAgainstMatrixResult = {
  finalStatus: JourneyMatrixFinalStatus
  reason: string
  sequenceRespected: boolean
  missingPoints: string[]
  matchedCircuitCode: string | null
  confidence: number
}

export type ResolveExecutiveBucketInput = {
  finalStatus: FinalCircuitStatus
  frontEventCount: number
  reliabilityScore: number
  sequenceCoherent: boolean
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  strong: boolean
  missingTemplatePointsCount: number
  expectedTemplatePoints: number
  j: ReconstructedRealJourney
  seqPack: { startsAtValidEntry: boolean; endsAtValidExit: boolean }
  hasInvalidRouteOperationalAlert: boolean
  hasInvalidJourneyStartOperationalAlert: boolean
}

const RIC_B2_EGRESO_NORM = 'ricb2egreso'

export const DEFAULT_CIRCUIT_MATRIX: JourneyCircuitMatrix = {
  CIRCUITO_CELDA16_DESCARGA: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'CELDA16_DESCARGA',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
  CIRCUITO_CELDA16_CARGA: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'CELDA16_CARGA',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
  CIRCUITO_VOLCABLE_1_2: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'VOLCABLE',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
  CIRCUITO_LIQUIDO: ['INGRESO', 'PREINGRESO', 'CALADA', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO'],
  CIRCUITO_SAN_LORENZO: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
  DESPACHO_SIN_PUNTO_INSTRUMENTADO: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
  TRANSILE_VOLCABLE_BALANZA: ['VOLCABLE', 'BALANZA_EGRESO'],
}

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

function isOrderedSubsequence(seq: string[], pattern: readonly string[]): boolean {
  if (!pattern.length) return false
  let j = 0
  for (let i = 0; i < seq.length && j < pattern.length; i++) {
    if (seq[i] === pattern[j]) j++
  }
  return j === pattern.length
}

function clampRoundPct(v: number): number {
  const c = Math.max(0, Math.min(100, v))
  return Math.round(c * 10) / 10
}

function sequenceOrderEvidence(
  observedSeq: readonly string[],
  expectedSeq: readonly string[]
): { comparablePoints: number; regressions: number; orderedPrefixMatches: number } {
  const pos = new Map<string, number>()
  for (let i = 0; i < expectedSeq.length; i++) {
    const code = String(expectedSeq[i] ?? '')
    if (!code || pos.has(code)) continue
    pos.set(code, i)
  }

  let comparablePoints = 0
  let regressions = 0
  let prevPos = -1
  for (const raw of observedSeq) {
    const code = String(raw ?? '')
    const p = pos.get(code)
    if (p == null) continue
    comparablePoints++
    if (prevPos >= 0 && p < prevPos) regressions++
    else prevPos = p
  }

  let j = 0
  for (const raw of observedSeq) {
    const code = String(raw ?? '')
    if (j < expectedSeq.length && code === expectedSeq[j]) j++
  }

  return { comparablePoints, regressions, orderedPrefixMatches: j }
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

export function classifyJourneyAgainstCircuitMatrix(
  journey: ReconstructedRealJourney,
  circuitMatrix: JourneyCircuitMatrix
): JourneyAgainstMatrixResult {
  const usefulEvents = journey.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode))
  const usefulEventsCount = usefulEvents.length > 0 ? usefulEvents.length : Math.max(0, journey.eventCount)
  const observedSeq =
    usefulEvents.length > 0 ?
      collapseConsecutiveEqual(
        [...usefulEvents].sort(compareRealEvents).map((e) => normalizeRealEventPoint(e).logicalCode)
      )
    : collapseConsecutiveEqual(journey.logicalCodeSequence.map((x) => String(x)))
  const preliminaryCode = String(journey.preliminaryCircuitCode ?? '').trim()
  const expectedSeq = preliminaryCode ? (circuitMatrix[preliminaryCode] ?? []) : []
  const matchedCircuitCode = expectedSeq.length > 0 ? preliminaryCode : null
  const hasSequenceEvidence = expectedSeq.length > 0 && observedSeq.length > 0
  const sequenceRespected = hasSequenceEvidence ? isOrderedSubsequence(observedSeq, expectedSeq) : true
  const missingPoints =
    matchedCircuitCode && hasSequenceEvidence ?
      expectedSeq.filter((p) => !new Set(observedSeq).has(String(p)))
    : matchedCircuitCode ?
      [...(journey.missingExpectedPoints ?? [])]
    : []

  const matchedPoints = matchedCircuitCode ? expectedSeq.length - missingPoints.length : 0
  const confidence =
    matchedCircuitCode && expectedSeq.length > 0 ?
      clampRoundPct((matchedPoints / expectedSeq.length) * 100)
    : 0
  const evidence = sequenceOrderEvidence(observedSeq, expectedSeq)

  if (usefulEventsCount <= 2) {
    return {
      finalStatus: 'INCOMPLETO',
      reason: 'EVENTOS_INSUFICIENTES',
      sequenceRespected,
      missingPoints,
      matchedCircuitCode,
      confidence,
    }
  }

  if (!matchedCircuitCode) {
    return {
      finalStatus: 'INCOMPLETO',
      reason: 'SIN_MATRIZ_COINCIDENTE',
      sequenceRespected: false,
      missingPoints: [],
      matchedCircuitCode: null,
      confidence: 0,
    }
  }

  if (!sequenceRespected) {
    const strongContradiction =
      usefulEventsCount >= 6 &&
      evidence.comparablePoints >= 5 &&
      evidence.regressions >= 2 &&
      missingPoints.length >= 2 &&
      confidence <= 60

    if (strongContradiction) {
      return {
        finalStatus: 'ANOMALO',
        reason: 'NO_RESPETA_SECUENCIA',
        sequenceRespected: false,
        missingPoints,
        matchedCircuitCode,
        confidence,
      }
    }

    if (missingPoints.length <= 2) {
      return {
        finalStatus: 'DEDUCIDO',
        reason: 'SECUENCIA_PARCIAL_CON_HUECOS',
        sequenceRespected: false,
        missingPoints,
        matchedCircuitCode,
        confidence,
      }
    }

    return {
      finalStatus: 'INCOMPLETO',
      reason: 'SECUENCIA_NO_CONCLUYENTE',
      sequenceRespected: false,
      missingPoints,
      matchedCircuitCode,
      confidence,
    }
  }

  if (!hasSequenceEvidence && missingPoints.length > 2) {
    return {
      finalStatus: 'INCOMPLETO',
      reason: 'FALTAN_PUNTOS_CLAVE',
      sequenceRespected,
      missingPoints,
      matchedCircuitCode,
      confidence,
    }
  }

  if (missingPoints.length === 0) {
    return {
      finalStatus: 'COMPLETO',
      reason: 'SECUENCIA_COMPLETA',
      sequenceRespected: true,
      missingPoints: [],
      matchedCircuitCode,
      confidence,
    }
  }

  return {
    finalStatus: 'DEDUCIDO',
    reason: 'SECUENCIA_RESPETADA_CON_HUECOS',
    sequenceRespected: true,
    missingPoints,
    matchedCircuitCode,
    confidence,
  }
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

/** Coherencia estricta: sin huecos vs plantilla, ingreso/salida lógicos y circuito clasificable. */
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

  /** Eventos suficientes pero secuencia no estrictamente coherente → revisión técnica (`final_status`; el bucket ejecutivo aplica tolerancias aparte). */
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

/**
 * Punto medio entre matriz esperada vs recorrido observado antes del bucket ejecutivo.
 * Tolerancia operativa típica: huecos (puntos intermedios/cámara) con cierre operativo fuerte + score alto → VARIANT;
 * patrón apoyado con puntos fuertes pero sin plantilla cabal → DEDUCED.
 * Solo se marca BROKEN sin alertas Truckflow cuando la plantilla aparece cerrada pero no hay soporte ingreso/salida
 * compatible con una secuencia lógica mínima.
 */
export function classifyOperationalSequenceFit(opts: {
  j: ReconstructedRealJourney
  sequenceCoherent: boolean
  missingTemplatePointsCount: number
  expectedTemplatePoints: number
  reliabilityScore: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  strong: boolean
  seqPack: { startsAtValidEntry: boolean; endsAtValidExit: boolean }
}): SequenceFit {
  const missN = Math.max(0, opts.missingTemplatePointsCount)
  const expectedPts = opts.expectedTemplatePoints
  const rel = opts.reliabilityScore

  const code = opts.j.preliminaryCircuitCode
  if (code === 'REGISTRO_INCOMPLETO' || expectedPts <= 0) {
    return 'PARTIAL'
  }

  if (opts.sequenceCoherent) return 'EXACT'

  const entryExitClosed = opts.hasOperationalEntry && opts.hasOperationalExit

  const structuralPathBreak =
    missN === 0 &&
    expectedPts >= 4 &&
    rel >= 78 &&
    !entryExitClosed &&
    (!opts.seqPack.startsAtValidEntry || !opts.seqPack.endsAtValidExit)

  if (structuralPathBreak) return 'BROKEN'

  const maxMissVariant = Math.max(2, Math.ceil(expectedPts * 0.38))
  const maxMissDeduced = Math.max(2, Math.ceil(expectedPts * 0.62))

  const variantCandidate =
    rel >= 64 &&
    missN >= 1 &&
    missN <= maxMissVariant &&
    (entryExitClosed || opts.strong || rel >= 88)

  if (variantCandidate) return 'VARIANT'

  const deducedCandidate = rel >= 50 && opts.strong && missN <= maxMissDeduced

  if (deducedCandidate) return 'DEDUCED'

  return 'PARTIAL'
}

/** Bucket ejecutivo para comité — capa sobre `final_status` sin romper CSV legacy. */
export function resolveExecutiveBucket(
  input: ResolveExecutiveBucketInput
): { bucket: ExecutiveBucket; anomalyReason: ExecutiveAnomalyReason } {
  const {
    finalStatus,
    frontEventCount,
    reliabilityScore: rel,
    sequenceCoherent,
    hasOperationalEntry,
    hasOperationalExit,
    strong,
    missingTemplatePointsCount,
    expectedTemplatePoints,
    j,
    seqPack,
    hasInvalidRouteOperationalAlert,
    hasInvalidJourneyStartOperationalAlert,
  } = input
  const matrixResult = classifyJourneyAgainstCircuitMatrix(j, DEFAULT_CIRCUIT_MATRIX)

  if (finalStatus === 'descartado') {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (matrixResult.finalStatus === 'INCOMPLETO') {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (hasInvalidRouteOperationalAlert) {
    return { bucket: 'ANOMALO', anomalyReason: 'INVALID_ROUTE_ALERT' }
  }

  if (hasInvalidJourneyStartOperationalAlert) {
    return { bucket: 'ANOMALO', anomalyReason: 'INVALID_JOURNEY_START_ALERT' }
  }

  if (matrixResult.finalStatus === 'ANOMALO') {
    return { bucket: 'ANOMALO', anomalyReason: 'NO_RESPETA_SECUENCIA' }
  }

  if (matrixResult.finalStatus === 'COMPLETO') {
    return { bucket: 'COMPLETO', anomalyReason: null }
  }

  if (matrixResult.finalStatus === 'DEDUCIDO') {
    return { bucket: 'DEDUCIDO', anomalyReason: null }
  }

  if (frontEventCount <= 2) {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (finalStatus === 'circuito_completo') {
    return { bucket: 'COMPLETO', anomalyReason: null }
  }

  const fit = classifyOperationalSequenceFit({
    j,
    sequenceCoherent,
    missingTemplatePointsCount,
    expectedTemplatePoints,
    reliabilityScore: rel,
    hasOperationalEntry,
    hasOperationalExit,
    strong,
    seqPack,
  })

  if (fit === 'EXACT' || fit === 'VARIANT') {
    return { bucket: 'COMPLETO', anomalyReason: null }
  }

  if (fit === 'DEDUCED' && rel >= 50) {
    return { bucket: 'DEDUCIDO', anomalyReason: null }
  }

  if (fit === 'PARTIAL') {
    return { bucket: 'INCOMPLETO', anomalyReason: null }
  }

  if (fit === 'BROKEN') {
    return { bucket: 'ANOMALO', anomalyReason: 'ANOMALIA_NO_RESPETA_SECUENCIA' }
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
