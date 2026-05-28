import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { lookupRealSectorCode } from '../../../data/realSectorCodeMap'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { isEtlRearCameraDevice } from './etlRearDevices'
import {
  EXECUTIVE_CIRCUIT_MATRIX,
  type ExecutiveCircuitConfig,
  type ExecutiveCircuitDecision,
  type ExecutiveCircuitStatus,
  type JourneyMatrixFinalStatus,
  journeyHasLiquidStrongPoint,
  journeyMeetsDeducedEvidenceThreshold,
  journeyHasDeducedStrongEvidence,
  isRicSanLorenzoRouteCircuit,
} from './finalCircuitScoring'
import { ETL_SL_INTERNAL_CLASSIFICATION_ENABLED, snapshotSanLorenzoSupport } from './etlSanLorenzoSupport'
import { journeyHasSlIngresoEvidence, journeyIsRicSanLorenzoRouteEvidence } from './etlRicSanLorenzoRoute'

export const SL_PENDING_KEY_CAMERAS = [
  'SLZBalIngFte',
  'SLZBalSC1Fte',
  'SLZBalSC2Fte',
  'SLZSalidaC1Fte',
  'SLZSalidaC2Fte',
] as const

export type CommitteeGroup = 'COMPLETOS' | 'VARIACIONES_OPERATIVAS' | 'ANOMALIAS'

export type OperationalVariationType =
  | 'RECALADO'
  | 'ESPERA_EN_PLAYA'
  | 'ESPERA_EN_CALADA'
  | 'AJUSTE_DE_PESO'
  | 'DOBLE_PASO_BALANZA'
  | 'DOBLE_PREINGRESO'
  | 'LOOP_INTERNO_PERMITIDO'
  | 'POSIBLE_RECHAZO'
  | 'RECHAZO_OPERATIVO'
  | 'VUELTA_A_INGRESO_PERMITIDA'
  | 'DESCARGA_O_CARGA_CORRECTIVA'
  | ''

/** Espera en calada Ricardone (alineado con ventana merge 4 h). */
export const R7_CALADA_ESPERA_MINUTES = 240
/** Repeticiones PREINGRESO < 5 min → ruido Truckflow, no variación. */
export const R7_PREINGRESO_DUPLICATE_ERROR_MINUTES = 5

export type AnalysisScope = 'RICARDONE' | 'SAN_LORENZO_INTERNO' | 'TRANSILE_EXTERNO' | 'MIXTO' | 'UNKNOWN'

export type CommitteeClassification = {
  committee_group: CommitteeGroup
  committee_reason: string
  operational_variation_type: OperationalVariationType
  analysis_scope: AnalysisScope
  strong_point_source: '' | 'RICARDONE' | 'SAN_LORENZO' | 'LIQUIDO'
  show_in_committee: boolean
  show_as_exact_circuit: boolean
  candidate_circuits: string
  missing_key_cameras: string
  /** Override opcional del estado técnico interno para CSV. */
  executive_status: ExecutiveCircuitStatus
  executive_reason: string
}

const SL_INTERNAL_CODES = new Set(['R7', 'CIRCUITO_SAN_LORENZO'])
const TRANSILE_EXTERNAL_CODES = new Set(['R26', 'R34'])
const AMBIGUOUS_INFERRED_CODES = new Set(['RS_REC', 'RS_DESP', 'SIN_PUNTO'])

const SHARED_CIRCUIT_CANDIDATES: Record<string, readonly string[]> = {
  R5: ['R5', 'R6'],
  R6: ['R5', 'R6'],
  R19: ['R19', 'R20'],
  R20: ['R19', 'R20'],
}

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

export function journeyExecutiveSectorSequence(j: ReconstructedRealJourney): string[] {
  const sorted = j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode)).sort(compareRealEvents)
  const sectors: string[] = []
  for (const e of sorted) {
    const mapped = lookupRealSectorCode(String(e.sectorCode ?? '').trim())
    const fromMap = mapped?.logicalSector?.trim()
    if (fromMap && /^S\d+$/i.test(fromMap)) {
      sectors.push(fromMap.toUpperCase())
      continue
    }
    const pt = normalizeRealEventPoint(e)
    const ls = String(pt.logicalSector ?? '').trim()
    if (ls && /^S\d+$/i.test(ls)) sectors.push(ls.toUpperCase())
  }
  return collapseConsecutiveEqual(sectors)
}

function sectorSeqMatchesPattern(observed: string[], pattern: readonly string[]): boolean {
  let i = 0
  for (const token of pattern) {
    if (token === 'ESPERA') continue
    while (i < observed.length && observed[i] !== token) i++
    if (i >= observed.length) return false
    i++
  }
  return true
}

function patternsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function hasRecaladoCycle(observed: string[]): boolean {
  for (let i = 0; i < observed.length - 3; i++) {
    if (observed[i] === 'S1' && observed[i + 1] === 'S2' && observed[i + 2] === 'S1' && observed[i + 3] === 'S2') {
      return true
    }
  }
  return false
}

function hasInternalLoop(observed: string[]): boolean {
  return observed.filter((s) => s === 'S6').length >= 2 && observed.filter((s) => s === 'S7').length >= 2
}

function inferVariationType(observed: string[], matchedPattern: readonly string[]): OperationalVariationType {
  if (hasRecaladoCycle(observed)) return 'RECALADO'
  if (hasInternalLoop(observed)) return 'LOOP_INTERNO_PERMITIDO'
  const s4 = observed.filter((s) => s === 'S4').length
  if (s4 >= 2) return 'DOBLE_PASO_BALANZA'
  if (matchedPattern.filter((s) => s === 'S5').length >= 2) return 'DESCARGA_O_CARGA_CORRECTIVA'
  const s1 = observed.filter((s) => s === 'S1').length
  if (s1 >= 2) return 'VUELTA_A_INGRESO_PERMITIDA'
  if (matchedPattern.includes('ESPERA')) return 'ESPERA_EN_PLAYA'
  return 'AJUSTE_DE_PESO'
}

function variationReason(type: OperationalVariationType): string {
  switch (type) {
    case 'RECALADO':
      return 'RECALADO_CONTEMPLADO'
    case 'ESPERA_EN_PLAYA':
      return 'ESPERA_CONTEMPLADA'
    case 'ESPERA_EN_CALADA':
      return 'ESPERA_EN_CALADA_CONTEMPLADA'
    case 'DOBLE_PREINGRESO':
      return 'DOBLE_PREINGRESO_CONTEMPLADO'
    case 'POSIBLE_RECHAZO':
      return 'POSIBLE_RECHAZO_CONTEMPLADO'
    case 'AJUSTE_DE_PESO':
      return 'AJUSTE_DE_PESO_CONTEMPLADO'
    case 'DOBLE_PASO_BALANZA':
      return 'DOBLE_PASO_BALANZA_CONTEMPLADO'
    case 'LOOP_INTERNO_PERMITIDO':
      return 'LOOP_INTERNO_CONTEMPLADO'
    case 'RECHAZO_OPERATIVO':
      return 'RECHAZO_OPERATIVO_CONTEMPLADO'
    case 'VUELTA_A_INGRESO_PERMITIDA':
      return 'VUELTA_A_INGRESO_CONTEMPLADA'
    case 'DESCARGA_O_CARGA_CORRECTIVA':
      return 'DESCARGA_CARGA_CORRECTIVA_CONTEMPLADA'
    default:
      return 'VARIACION_OPERATIVA_CONTEMPLADA'
  }
}

export function detectOperationalVariation(
  config: ExecutiveCircuitConfig | null,
  observedSectors: string[]
): { type: OperationalVariationType; reason: string; matchedPattern: readonly string[] } | null {
  if (!config?.allowedSequences?.length || !config.baseSequence?.length) return null
  if (patternsEqual(observedSectors, [...config.baseSequence])) return null

  for (const pattern of config.allowedSequences) {
    if (patternsEqual(observedSectors, [...pattern])) {
      const type = inferVariationType(observedSectors, pattern)
      return { type, reason: variationReason(type), matchedPattern: pattern }
    }
    if (sectorSeqMatchesPattern(observedSectors, pattern) && !patternsEqual(pattern, config.baseSequence)) {
      const type = inferVariationType(observedSectors, pattern)
      return { type, reason: variationReason(type), matchedPattern: pattern }
    }
  }
  return null
}

function isSanLorenzoInternalCircuit(executiveCode: string, technicalCode: string): boolean {
  const a = executiveCode.trim()
  const b = technicalCode.trim()
  return SL_INTERNAL_CODES.has(a) || SL_INTERNAL_CODES.has(b)
}

function resolveStrongPointSource(
  j: ReconstructedRealJourney,
  hasStrongPoint: boolean
): CommitteeClassification['strong_point_source'] {
  if (!hasStrongPoint) return ''
  if (journeyHasLiquidStrongPoint(j)) return 'LIQUIDO'
  const hasSlStrong = j.events.some((e) => {
    if (isEtlRearCameraDevice(e.deviceCode)) return false
    return String(e.deviceCode ?? '').trim().toUpperCase().startsWith('SLZ')
  })
  if (hasSlStrong) return 'SAN_LORENZO'
  return 'RICARDONE'
}

function isRicSanLorenzoRoute(executiveCode: string, technicalCode: string, journey?: ReconstructedRealJourney): boolean {
  if (isRicSanLorenzoRouteCircuit(executiveCode) || isRicSanLorenzoRouteCircuit(technicalCode)) return true
  return journey ? journeyIsRicSanLorenzoRouteEvidence(journey) : false
}

function resolveAnalysisScope(executiveCode: string, technicalCode: string): AnalysisScope {
  if (!ETL_SL_INTERNAL_CLASSIFICATION_ENABLED && isRicSanLorenzoRoute(executiveCode, technicalCode)) {
    return 'MIXTO'
  }
  if (
    ETL_SL_INTERNAL_CLASSIFICATION_ENABLED &&
    isSanLorenzoInternalCircuit(executiveCode, technicalCode)
  ) {
    return 'SAN_LORENZO_INTERNO'
  }
  if (TRANSILE_EXTERNAL_CODES.has(executiveCode)) return 'TRANSILE_EXTERNO'
  if (executiveCode.startsWith('R') || technicalCode.startsWith('CIRCUITO_')) return 'RICARDONE'
  return 'UNKNOWN'
}

function isNonDifferentiable(input: {
  executiveCode: string
  hasStrongPoint: boolean
  showAsExact: boolean
}): boolean {
  if (AMBIGUOUS_INFERRED_CODES.has(input.executiveCode) && !input.hasStrongPoint) return true
  if (SHARED_CIRCUIT_CANDIDATES[input.executiveCode] && !input.showAsExact) return true
  return false
}

function hasTransileRicardoneEvidence(j: ReconstructedRealJourney, hasStrongPoint: boolean): boolean {
  if (!hasStrongPoint) return false
  if (journeyHasLiquidStrongPoint(j)) return true
  return j.events.some((e) => {
    if (isEtlRearCameraDevice(e.deviceCode)) return false
    const dev = String(e.deviceCode ?? '').trim()
    return /^Ric/i.test(dev) && !dev.toUpperCase().startsWith('SLZ')
  })
}

function solidInferredWithEvidence(input: {
  executiveCircuitCode: string
  frontEventCount: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
}): boolean {
  const code = input.executiveCircuitCode.trim()
  if (code === 'SIN_PUNTO') return false
  if (!AMBIGUOUS_INFERRED_CODES.has(code)) return false
  return input.frontEventCount >= 4 && input.hasOperationalEntry && input.hasOperationalExit
}

function journeyFrontEventsSorted(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode)).sort(compareRealEvents)
}

function minutesBetweenIso(isoA: string, isoB: string): number {
  const a = Date.parse(isoA)
  const b = Date.parse(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.abs(b - a) / 60000
}

function collapsedLogicalCodes(j: ReconstructedRealJourney): string[] {
  return collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x)))
}

function firstCaladaEventIndex(events: ReturnType<typeof journeyFrontEventsSorted>): number {
  for (let i = 0; i < events.length; i++) {
    if (normalizeRealEventPoint(events[i]!).logicalCode === 'CALADA') return i
  }
  return -1
}

/** Demora ≥ umbral entre ingreso/preingreso y la primera calada (espera para calarse). */
export function detectEsperaAntesCalada(
  j: ReconstructedRealJourney,
  minMinutes = R7_CALADA_ESPERA_MINUTES
): boolean {
  const events = journeyFrontEventsSorted(j)
  const caladaIdx = firstCaladaEventIndex(events)
  if (caladaIdx <= 0) return false

  const caladaAt = events[caladaIdx]!.occurredAt
  let anchorAt: string | null = null
  for (let i = caladaIdx - 1; i >= 0; i--) {
    const code = normalizeRealEventPoint(events[i]!).logicalCode
    if (code === 'INGRESO' || code === 'PREINGRESO') {
      anchorAt = events[i]!.occurredAt
      break
    }
  }
  if (!anchorAt) anchorAt = events[caladaIdx - 1]!.occurredAt
  if (anchorAt && minutesBetweenIso(anchorAt, caladaAt) >= minMinutes) return true

  const logical = collapsedLogicalCodes(j)
  const logicalCaladaIdx = logical.indexOf('CALADA')
  if (logicalCaladaIdx <= 0) return false
  const hasEntryBefore = logical
    .slice(0, logicalCaladaIdx)
    .some((c) => c === 'INGRESO' || c === 'PREINGRESO')
  if (!hasEntryBefore) return false
  return !detectEsperaDespuesCalada(j, minMinutes) && (j.durationMinutes ?? 0) >= minMinutes
}

/** Demora ≥ umbral entre calada y egreso Ricardone (post-calada). */
export function detectEsperaDespuesCalada(
  j: ReconstructedRealJourney,
  minMinutes = R7_CALADA_ESPERA_MINUTES
): boolean {
  const events = journeyFrontEventsSorted(j)
  const caladaIdx = firstCaladaEventIndex(events)
  if (caladaIdx < 0) return false

  const caladaAt = events[caladaIdx]!.occurredAt
  for (let i = caladaIdx + 1; i < events.length; i++) {
    const code = normalizeRealEventPoint(events[i]!).logicalCode
    if (code === 'EGRESO' || code === 'BALANZA_EGRESO') {
      return minutesBetweenIso(caladaAt, events[i]!.occurredAt) >= minMinutes
    }
  }

  const logical = collapsedLogicalCodes(j)
  const logicalCaladaIdx = logical.indexOf('CALADA')
  const egrIdx = logical.indexOf('EGRESO')
  return logicalCaladaIdx >= 0 && egrIdx > logicalCaladaIdx && (j.durationMinutes ?? 0) >= minMinutes
}

/** @deprecated Preferir detectEsperaAntesCalada / detectEsperaDespuesCalada. */
export function detectEsperaEnCalada(
  j: ReconstructedRealJourney,
  minMinutes = R7_CALADA_ESPERA_MINUTES
): boolean {
  return detectEsperaAntesCalada(j, minMinutes) || detectEsperaDespuesCalada(j, minMinutes)
}

/** Espera post-calada Ricardone sin presencia en San Lorenzo. */
export function detectPosibleRechazo(
  j: ReconstructedRealJourney,
  slPointCount: number,
  minMinutes = R7_CALADA_ESPERA_MINUTES
): boolean {
  return detectEsperaDespuesCalada(j, minMinutes) && slPointCount === 0
}

/** Espera pre-calada Ricardone sin presencia en San Lorenzo. */
export function detectEsperaEnCaladaVariation(
  j: ReconstructedRealJourney,
  slPointCount: number,
  minMinutes = R7_CALADA_ESPERA_MINUTES
): boolean {
  return detectEsperaAntesCalada(j, minMinutes) && slPointCount === 0
}

export function detectDoblePreingresoVariation(j: ReconstructedRealJourney): boolean {
  const events = journeyFrontEventsSorted(j)
  const preIndices: number[] = []
  for (let i = 0; i < events.length; i++) {
    if (normalizeRealEventPoint(events[i]!).logicalCode === 'PREINGRESO') preIndices.push(i)
  }
  if (preIndices.length < 2) return false
  for (let k = 1; k < preIndices.length; k++) {
    const gap = minutesBetweenIso(
      events[preIndices[k - 1]!]!.occurredAt,
      events[preIndices[k]!]!.occurredAt
    )
    if (gap >= R7_PREINGRESO_DUPLICATE_ERROR_MINUTES && preIndices[k]! < events.length - 1) {
      return true
    }
  }
  return false
}

function hasRicRouteEntry(logical: string[]): boolean {
  return logical.includes('INGRESO') || logical.includes('PREINGRESO')
}

function isCaladaOmittedR7Completo(logical: string[], hasRicEgreso: boolean, slIngreso: boolean): boolean {
  if (logical.includes('CALADA')) return false
  return hasRicRouteEntry(logical) && (hasRicEgreso || slIngreso)
}

function tryCommitteeOperationalVariation(
  input: {
    executiveCircuitConfig: ExecutiveCircuitConfig | null
    hasOperationalEntry: boolean
    hasOperationalExit: boolean
    executive: ExecutiveCircuitDecision
  },
  base: Omit<CommitteeClassification, 'committee_group' | 'committee_reason' | 'operational_variation_type'>,
  observedSectors: string[]
): CommitteeClassification | null {
  if (!input.hasOperationalEntry || !input.hasOperationalExit) return null
  const variation = detectOperationalVariation(input.executiveCircuitConfig, observedSectors)
  if (!variation) return null
  return {
    ...base,
    committee_group: 'VARIACIONES_OPERATIVAS',
    committee_reason: variation.reason,
    operational_variation_type: variation.type,
    show_as_exact_circuit: false,
    executive_status: input.executive.executiveStatus === 'ANOMALO' ? 'INCOMPLETO' : input.executive.executiveStatus,
    executive_reason: variation.reason,
  }
}

function resolveDeducedEvidence(input: {
  matrixFinalStatus: JourneyMatrixFinalStatus
  matrixConfidence: number
  matchedPoints: number
  expectedPoints: number
  journey: ReconstructedRealJourney
  hasStrongPoint: boolean
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  frontEventCount: number
}): boolean {
  const strongEvidence = journeyHasDeducedStrongEvidence({
    journey: input.journey,
    hasOperationalEntry: input.hasOperationalEntry,
    hasOperationalExit: input.hasOperationalExit,
    frontEventCount: input.frontEventCount,
    hasInstrumentedStrongPoint: input.hasStrongPoint,
  })
  return journeyMeetsDeducedEvidenceThreshold({
    matrixFinalStatus: input.matrixFinalStatus,
    matchedPoints: input.matchedPoints,
    expectedPoints: input.expectedPoints,
    hasJourneyStrongPoint: strongEvidence,
    matrixConfidence: input.matrixConfidence,
  })
}

function classifyRicSanLorenzoRoute(
  input: {
    journey: ReconstructedRealJourney
    matrixFinalStatus: JourneyMatrixFinalStatus
    matrixReason: string
    executive: ExecutiveCircuitDecision
    hasStrongPoint: boolean
    frontEventCount: number
    hasOperationalEntry: boolean
    hasOperationalExit: boolean
  },
  base: Omit<CommitteeClassification, 'committee_group' | 'committee_reason' | 'operational_variation_type'>,
  deducedEvidenceOk: boolean
): CommitteeClassification {
  const sl = snapshotSanLorenzoSupport(input.journey)
  const slIngreso = journeyHasSlIngresoEvidence(input.journey)
  const logical = collapsedLogicalCodes(input.journey)
  const routeClosed = input.hasOperationalExit || slIngreso
  const routeBase = {
    ...base,
    analysis_scope: 'MIXTO' as const,
    show_as_exact_circuit: false,
    candidate_circuits: 'R7',
    strong_point_source:
      slIngreso ? ('SAN_LORENZO' as const)
      : base.strong_point_source,
  }

  if (!routeClosed) {
    return {
      ...routeBase,
      committee_group: 'ANOMALIAS',
      committee_reason: 'JOURNEY_INCOMPLETO',
      operational_variation_type: '',
      executive_status: 'INCOMPLETO',
      executive_reason: input.matrixReason || 'JOURNEY_INCOMPLETO',
    }
  }

  // Variaciones R7 antes de COMPLETO/DEDUCIDO (si no hay patrón, sigue abajo)
  if (detectPosibleRechazo(input.journey, sl.slPointCount)) {
    return {
      ...routeBase,
      committee_group: 'VARIACIONES_OPERATIVAS',
      committee_reason: 'POSIBLE_RECHAZO_CONTEMPLADO',
      operational_variation_type: 'POSIBLE_RECHAZO',
      executive_status: 'INCOMPLETO',
      executive_reason: 'POSIBLE_RECHAZO_CONTEMPLADO',
    }
  }

  if (detectEsperaEnCaladaVariation(input.journey, sl.slPointCount)) {
    return {
      ...routeBase,
      committee_group: 'VARIACIONES_OPERATIVAS',
      committee_reason: 'ESPERA_EN_CALADA_CONTEMPLADA',
      operational_variation_type: 'ESPERA_EN_CALADA',
      executive_status: 'INCOMPLETO',
      executive_reason: 'ESPERA_EN_CALADA_CONTEMPLADA',
    }
  }

  if (detectDoblePreingresoVariation(input.journey)) {
    return {
      ...routeBase,
      committee_group: 'VARIACIONES_OPERATIVAS',
      committee_reason: 'DOBLE_PREINGRESO_CONTEMPLADO',
      operational_variation_type: 'DOBLE_PREINGRESO',
      executive_status: input.executive.executiveStatus === 'ANOMALO' ? 'INCOMPLETO' : input.executive.executiveStatus,
      executive_reason: 'DOBLE_PREINGRESO_CONTEMPLADO',
    }
  }

  if (input.matrixFinalStatus === 'COMPLETO') {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
    }
  }

  if (input.matrixFinalStatus === 'DEDUCIDO' && deducedEvidenceOk) {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'RUTA_RIC_SAN_LORENZO_DEDUCIDA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'RUTA_RIC_SAN_LORENZO_DEDUCIDA',
    }
  }

  if (isCaladaOmittedR7Completo(logical, input.hasOperationalExit, slIngreso)) {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
    }
  }

  if (slIngreso && hasRicRouteEntry(logical) && !input.hasOperationalExit) {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'CIERRE_POR_INGRESO_SLZ',
    }
  }

  if (
    (detectEsperaDespuesCalada(input.journey) || detectEsperaAntesCalada(input.journey)) &&
    slIngreso
  ) {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'RUTA_RIC_SAN_LORENZO_COMPLETA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'RUTA_RIC_SAN_LORENZO_CON_ESPERA_CALADA',
    }
  }

  if (routeClosed && input.hasOperationalEntry && input.frontEventCount >= 4) {
    return {
      ...routeBase,
      committee_group: 'COMPLETOS',
      committee_reason: 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
    }
  }

  if (input.matrixFinalStatus === 'INCOMPLETO' || input.executive.executiveStatus === 'INCOMPLETO') {
    return {
      ...routeBase,
      committee_group: 'ANOMALIAS',
      committee_reason: 'JOURNEY_INCOMPLETO',
      operational_variation_type: '',
      executive_status: 'INCOMPLETO',
      executive_reason: input.matrixReason || 'JOURNEY_INCOMPLETO',
    }
  }

  if (input.matrixFinalStatus === 'ANOMALO' || input.executive.executiveStatus === 'ANOMALO') {
    return {
      ...routeBase,
      committee_group: 'ANOMALIAS',
      committee_reason: 'NO_RESPETA_SECUENCIA_RUTA',
      operational_variation_type: '',
      executive_status: 'ANOMALO',
      executive_reason: 'NO_RESPETA_SECUENCIA_RUTA',
    }
  }

  return {
    ...routeBase,
    committee_group: 'ANOMALIAS',
    committee_reason: 'FALTA_EVIDENCIA_RUTA_RIC_SLZ',
    operational_variation_type: '',
    executive_status: 'NO_EVALUABLE',
    executive_reason: 'FALTA_EVIDENCIA_RUTA_RIC_SLZ',
  }
}

export function resolveCommitteeClassification(input: {
  journey: ReconstructedRealJourney
  executiveCircuitConfig: ExecutiveCircuitConfig | null
  executiveCircuitCode: string
  technicalCircuitCode: string
  matrixFinalStatus: JourneyMatrixFinalStatus
  matrixReason: string
  executive: ExecutiveCircuitDecision
  sequenceConfigured: boolean
  hasStrongPoint: boolean
  frontEventCount: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  observedSectorSequence?: string[]
  matchedPoints?: number
  expectedPoints?: number
  matrixConfidence?: number
}): CommitteeClassification {
  const executiveCode = input.executiveCircuitCode.trim()
  const technicalCode = input.technicalCircuitCode.trim()
  const observedSectors = input.observedSectorSequence ?? journeyExecutiveSectorSequence(input.journey)
  const scope = resolveAnalysisScope(executiveCode, technicalCode)
  const strongSource = resolveStrongPointSource(input.journey, input.hasStrongPoint)

  const base: Omit<CommitteeClassification, 'committee_group' | 'committee_reason' | 'operational_variation_type'> = {
    analysis_scope: scope,
    strong_point_source: strongSource,
    show_in_committee: true,
    show_as_exact_circuit: true,
    candidate_circuits: executiveCode || technicalCode,
    missing_key_cameras: '',
    executive_status: input.executive.executiveStatus,
    executive_reason: String(input.executive.executiveReason ?? ''),
  }

  // Fragmentos mínimos sin cierre operativo (post-merge o no mergeables)
  if (input.frontEventCount <= 2 && !input.hasOperationalExit) {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'FRAGMENTO_SIN_CIERRE_OPERATIVO',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'INCOMPLETO',
      executive_reason: 'FRAGMENTO_SIN_CIERRE_OPERATIVO',
    }
  }

  // 1. San Lorenzo interno — solo si clasificación SL activa (deshabilitada esta semana)
  if (ETL_SL_INTERNAL_CLASSIFICATION_ENABLED && isSanLorenzoInternalCircuit(executiveCode, technicalCode)) {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'CAMARAS_SLZ_S1_S5_S7_PENDIENTES',
      operational_variation_type: '',
      analysis_scope: 'SAN_LORENZO_INTERNO',
      show_as_exact_circuit: false,
      candidate_circuits: executiveCode || 'R7',
      missing_key_cameras: SL_PENDING_KEY_CAMERAS.join('|'),
      executive_status: 'NO_EVALUABLE',
      executive_reason: 'CAMARAS_SLZ_S1_S5_S7_PENDIENTES',
    }
  }

  const deducedEvidenceOk = resolveDeducedEvidence({
    matrixFinalStatus: input.matrixFinalStatus,
    matrixConfidence: input.matrixConfidence ?? 0,
    matchedPoints: input.matchedPoints ?? 0,
    expectedPoints: input.expectedPoints ?? 0,
    journey: input.journey,
    hasStrongPoint: input.hasStrongPoint,
    hasOperationalEntry: input.hasOperationalEntry,
    hasOperationalExit: input.hasOperationalExit,
    frontEventCount: input.frontEventCount,
  })

  // Ruta Ric→SL (R7): matriz lógica ingreso/preingreso/calada/egreso — no secuencia interna S1/S5/S7
  if (!ETL_SL_INTERNAL_CLASSIFICATION_ENABLED && isRicSanLorenzoRoute(executiveCode, technicalCode, input.journey)) {
    return classifyRicSanLorenzoRoute(input, base, deducedEvidenceOk)
  }

  // Sólidos inferidos RS_REC / RS_DESP — ingreso+egreso+4 eventos → COMPLETOS (SIN_PUNTO excluido)
  if (solidInferredWithEvidence(input)) {
    return {
      ...base,
      committee_group: 'COMPLETOS',
      committee_reason:
        input.executive.validDetail === 'DEDUCIDO' || input.matrixFinalStatus === 'DEDUCIDO' ?
          'CIRCUITO_DEDUCIDO_CON_EVIDENCIA'
        : 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      candidate_circuits: executiveCode,
      executive_status: 'VALIDO',
      executive_reason:
        input.matrixFinalStatus === 'DEDUCIDO' ?
          'CIRCUITO_DEDUCIDO_CON_EVIDENCIA'
        : 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
    }
  }

  // SIN_PUNTO: evidencia sin patrón recepción/despacho → anomalía (no completos por evidencia genérica)
  if (executiveCode === 'SIN_PUNTO') {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'NO_DIFERENCIABLE',
      executive_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
    }
  }

  // Variación S* contemplada — prioridad sobre COMPLETO/DEDUCIDO si hay cierre operativo
  const sectorVariation = tryCommitteeOperationalVariation(input, base, observedSectors)
  if (sectorVariation) return sectorVariation

  // 2. Sin secuencia configurada
  if (!input.sequenceConfigured) {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'SIN_SECUENCIA_CONFIGURADA',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'NO_EVALUABLE',
      executive_reason: 'SIN_SECUENCIA_CONFIGURADA',
    }
  }

  // Transiles externos — criterio conservador
  if (TRANSILE_EXTERNAL_CODES.has(executiveCode)) {
    if (
      hasTransileRicardoneEvidence(input.journey, input.hasStrongPoint) &&
      (input.matrixFinalStatus === 'COMPLETO' || input.matrixFinalStatus === 'DEDUCIDO')
    ) {
      return {
        ...base,
        committee_group: 'COMPLETOS',
        committee_reason: 'TRANSILE_EXTERNO_DEDUCIDO_CON_EVIDENCIA',
        operational_variation_type: '',
        analysis_scope: 'TRANSILE_EXTERNO',
        show_as_exact_circuit: false,
        strong_point_source: 'RICARDONE',
        executive_status: 'VALIDO',
        executive_reason: 'TRANSILE_EXTERNO_DEDUCIDO_CON_EVIDENCIA',
      }
    }
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
      operational_variation_type: '',
      analysis_scope: 'TRANSILE_EXTERNO',
      show_as_exact_circuit: false,
      candidate_circuits: executiveCode,
      executive_status: 'NO_DIFERENCIABLE',
      executive_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
    }
  }

  // 3–4. Completos (ideal o deducido con evidencia) — antes de ambigüedad
  if (input.matrixFinalStatus === 'COMPLETO') {
    return {
      ...base,
      committee_group: 'COMPLETOS',
      committee_reason: 'CIRCUITO_COMPLETO',
      operational_variation_type: '',
      executive_status: 'VALIDO',
      executive_reason: 'CIRCUITO_COMPLETO',
    }
  }

  if (input.matrixFinalStatus === 'DEDUCIDO' && deducedEvidenceOk) {
    return {
      ...base,
      committee_group: 'COMPLETOS',
      committee_reason: 'CIRCUITO_DEDUCIDO_CON_EVIDENCIA',
      operational_variation_type: '',
      show_as_exact_circuit: input.hasStrongPoint,
      executive_status: 'VALIDO',
      executive_reason: 'CIRCUITO_DEDUCIDO_CON_EVIDENCIA',
    }
  }

  // 8. Misma secuencia / sin punto fuerte diferenciador
  const nonDiff = isNonDifferentiable({
    executiveCode,
    hasStrongPoint: input.hasStrongPoint,
    showAsExact: input.hasStrongPoint && !AMBIGUOUS_INFERRED_CODES.has(executiveCode),
  })
  if (nonDiff && !solidInferredWithEvidence(input) && !deducedEvidenceOk) {
    const candidates = SHARED_CIRCUIT_CANDIDATES[executiveCode] ?? [executiveCode, technicalCode].filter(Boolean)
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      candidate_circuits: [...new Set(candidates)].join('|'),
      executive_status: 'NO_DIFERENCIABLE',
      executive_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
    }
  }

  if (input.executive.executiveStatus === 'VALIDO') {
    return {
      ...base,
      committee_group: 'COMPLETOS',
      committee_reason:
        input.executive.validDetail === 'DEDUCIDO' ?
          'CIRCUITO_DEDUCIDO_CON_EVIDENCIA'
        : 'CIRCUITO_COMPLETO',
      operational_variation_type: '',
    }
  }

  if (
    input.executive.executiveStatus === 'PROBABLE' &&
    input.executive.executiveReason === 'CIRCUITO_PROBABLE_INFERIDO'
  ) {
    return {
      ...base,
      committee_group: 'COMPLETOS',
      committee_reason: 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'VALIDO',
      executive_reason: 'SECUENCIA_OPERATIVA_RECONSTRUIDA',
    }
  }

  // 5. Variación operativa permitida (residual; la detección principal es antes de COMPLETO/DEDUCIDO)
  const variation = detectOperationalVariation(input.executiveCircuitConfig, observedSectors)
  if (variation && input.hasOperationalEntry && input.hasOperationalExit) {
    return {
      ...base,
      committee_group: 'VARIACIONES_OPERATIVAS',
      committee_reason: variation.reason,
      operational_variation_type: variation.type,
      show_as_exact_circuit: false,
      executive_status: input.executive.executiveStatus === 'ANOMALO' ? 'INCOMPLETO' : input.executive.executiveStatus,
      executive_reason: variation.reason,
    }
  }

  // 6. No respeta secuencia
  if (input.matrixFinalStatus === 'ANOMALO' || input.executive.executiveStatus === 'ANOMALO') {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'NO_RESPETA_SECUENCIA',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'ANOMALO',
      executive_reason: 'NO_RESPETA_SECUENCIA',
    }
  }

  // 7. Incompleto
  if (input.matrixFinalStatus === 'INCOMPLETO' || input.executive.executiveStatus === 'INCOMPLETO') {
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: 'JOURNEY_INCOMPLETO',
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'INCOMPLETO',
      executive_reason: input.matrixReason || 'JOURNEY_INCOMPLETO',
    }
  }

  // NO_EVALUABLE / PROBABLE residual → ANOMALÍAS
  if (input.executive.executiveStatus === 'NO_EVALUABLE') {
    const reason =
      input.executive.executiveReason === 'CONFIG_ERROR_MISSING_SEQUENCE' ?
        'SIN_SECUENCIA_CONFIGURADA'
      : input.executive.executiveReason === 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA' ?
        'NO_EVALUABLE'
      : input.executive.executiveReason === 'CIRCUITO_SIN_PUNTO_INSTRUMENTADO' ?
        'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE'
      : 'NO_EVALUABLE'
    return {
      ...base,
      committee_group: 'ANOMALIAS',
      committee_reason: reason,
      operational_variation_type: '',
      show_as_exact_circuit: false,
      executive_status: 'NO_EVALUABLE',
      executive_reason: reason,
    }
  }

  // 9. Fallback
  return {
    ...base,
    committee_group: 'ANOMALIAS',
    committee_reason: 'FALTA_EVIDENCIA_SUFICIENTE',
    operational_variation_type: '',
    show_as_exact_circuit: false,
    executive_status: input.executive.executiveStatus === 'PROBABLE' ? 'NO_EVALUABLE' : input.executive.executiveStatus,
    executive_reason: 'FALTA_EVIDENCIA_SUFICIENTE',
  }
}

export function committeeGroupLabel(group: CommitteeGroup): string {
  switch (group) {
    case 'COMPLETOS':
      return 'Completos'
    case 'VARIACIONES_OPERATIVAS':
      return 'Variaciones operativas'
    case 'ANOMALIAS':
      return 'Anomalías'
  }
}

/** Pie comité: 3 categorías principales. */
export function committeePieFromGroup(group: CommitteeGroup): { name: string; color: string } {
  switch (group) {
    case 'COMPLETOS':
      return { name: 'COMPLETOS', color: '#059669' }
    case 'VARIACIONES_OPERATIVAS':
      return { name: 'VARIACIONES OPERATIVAS', color: '#0ea5e9' }
    case 'ANOMALIAS':
      return { name: 'ANOMALÍAS', color: '#e11d48' }
  }
}

export function listExecutiveConfigsSharingBaseSequence(code: string): string[] {
  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code]
  if (!cfg?.baseSequence?.length) return [code]
  const base = cfg.baseSequence.join('>')
  return Object.entries(EXECUTIVE_CIRCUIT_MATRIX)
    .filter(([, c]) => c.baseSequence?.join('>') === base)
    .map(([k]) => k)
}
