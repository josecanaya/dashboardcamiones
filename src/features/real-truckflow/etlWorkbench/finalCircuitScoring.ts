import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { isEtlRearCameraDevice } from './etlRearDevices'
import {
  DEFAULT_CIRCUIT_MATRIX_EXTENSIONS,
  getCollapsedLogicalCodes,
  journeyIsRicSanLorenzoRouteEvidence,
  journeyIsSlOnlyInternal,
  journeyBlocksSl1ExecutiveClassification,
  journeyIsTransileC16ToSl,
  journeyIsTransileSlToC16,
  resolveTechnicalCircuitCodeForExecutive,
} from './etlRicSanLorenzoRoute'
import { ETL_SL_INTERNAL_CLASSIFICATION_ENABLED } from './etlSanLorenzoSupport'
import { R7_RIC_ALLOWED_S_SEQUENCES, SL1_ALLOWED_S_SEQUENCES } from './validCircuitMatrix'
import { lookupSanLorenzoCameraByDevice } from '../../../data/sanLorenzoCameraCatalog'

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
export type ExecutiveCircuitStatus = 'VALIDO' | 'PROBABLE' | 'INCOMPLETO' | 'ANOMALO' | 'NO_EVALUABLE' | 'NO_DIFERENCIABLE'
export type ExecutiveCircuitReason =
  | 'CIRCUITO_COMPLETO'
  | 'CIRCUITO_DEDUCIDO_VALIDO'
  | 'CONFIG_ERROR_MISSING_SEQUENCE'
  | 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA'
  | string

export type ExecutiveCircuitCoverageInfo = {
  coveragePercent: number
  hasStrongPoint: boolean
}

export type ExecutiveCircuitSequenceConfig = {
  enabledForClassification: boolean
  sequenceConfigured: boolean
}

export type ExecutiveCircuitDecision = {
  executiveStatus: ExecutiveCircuitStatus
  executiveReason: ExecutiveCircuitReason
  validDetail: '' | 'COMPLETO' | 'DEDUCIDO'
}

export type JourneyCircuitMatrix = Record<string, readonly string[]>

export type ExecutiveCircuitConfig = {
  code: string
  label: string
  coveragePercent: number
  hasStrongPoint: boolean
  enabledForClassification: boolean
  baseSequence?: readonly string[]
  allowedSequences?: readonly (readonly string[])[]
  aliases?: readonly string[]
}

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
  CIRCUITO_LIQUIDO: ['INGRESO', 'PREINGRESO', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO'],
  CIRCUITO_SAN_LORENZO: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
  ...DEFAULT_CIRCUIT_MATRIX_EXTENSIONS,
  DESPACHO_SIN_PUNTO_INSTRUMENTADO: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
  TRANSILE_VOLCABLE_BALANZA: ['VOLCABLE', 'BALANZA_EGRESO'],
  /** Silos Kepler (R3/R4): sin cámara en silo; calada/balanza vía Truckflow o Excel. */
  CIRCUITO_KEPLER_SILOS: [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'EGRESO',
  ],
}

const R5_ALLOWED_SEQUENCES = [
  ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'ESPERA', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'ESPERA', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'ESPERA', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S6', 'S7', 'S9', 'S4', 'S10'],
] as const

const R19_ALLOWED_SEQUENCES = [
  ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
] as const

/** Provisorio: mismas cámaras R3 y R4 hasta instalar puntos de descarga en silo. */
const KEPLER_ALLOWED_S_SEQUENCES = [['S0', 'S1', 'S2', 'S4', 'S4']] as const

/**
 * Matriz ejecutiva habilitada para lectura de comité.
 * Las secuencias S* se conservan como contrato de negocio; la clasificación técnica actual sigue usando
 * `DEFAULT_CIRCUIT_MATRIX` con puntos lógicos Truckflow.
 */
export const EXECUTIVE_CIRCUIT_MATRIX: Record<string, ExecutiveCircuitConfig> = {
  R1: {
    code: 'R1',
    label: 'Recepción Celda 16',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_CELDA16_DESCARGA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
    allowedSequences: [
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'S4', 'ESPERA', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'S4', 'S5', 'ESPERA', 'S6', 'S7', 'S4', 'S10'],
    ],
  },
  R5: {
    code: 'R5',
    label: 'Recepción Volcable 1',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R5_ALLOWED_SEQUENCES,
  },
  R6: {
    code: 'R6',
    label: 'Recepción Volcable 2',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R5_ALLOWED_SEQUENCES,
  },
  R7: {
    code: 'R7',
    label: 'Ricardone → San Lorenzo',
    coveragePercent: 80,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SAN_LORENZO', 'CIRCUITO_R7_MIXTO'],
    baseSequence: ['S0', 'S1', 'S2', 'S3'],
    allowedSequences: [
      ...R7_RIC_ALLOWED_S_SEQUENCES,
      ['S0', 'S1', 'S3'],
      ['S0', 'S1', 'ESPERA', 'S5', 'S7'],
      ['S0', 'S2', 'S1', 'S5', 'S7'],
      ['S0', 'S1', 'S2', 'S3', 'S0', 'S1', 'S3', 'S4', 'S5', 'S7'],
    ],
  },
  SL1: {
    code: 'SL1',
    label: 'Recepción interna San Lorenzo',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SL_RECEPCION'],
    baseSequence: SL1_ALLOWED_S_SEQUENCES[0]!,
    allowedSequences: SL1_ALLOWED_S_SEQUENCES.slice(1),
  },
  R8: {
    code: 'R8',
    label: 'Recepción Mercadería Líquida',
    coveragePercent: 63,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_LIQUIDO'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4', 'S3'],
    allowedSequences: [['S0', 'S1', 'ESPERA', 'S1', 'S2', 'S4', 'S4', 'S3']],
  },
  R9: {
    code: 'R9',
    label: 'Despacho Celda 16',
    coveragePercent: 78,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_CELDA16_CARGA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'S2', 'S3'],
    allowedSequences: [
      ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S5', 'S6', 'S7', 'S1', 'S2', 'S3'],
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'ESPERA', 'S2', 'S3'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'S2', 'S3'],
    ],
  },
  R16: {
    code: 'R16',
    label: 'Despacho Mercadería Líquida',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4', 'S1', 'S2', 'S3'],
    allowedSequences: [['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S4', 'S1', 'ESPERA', 'S2', 'S3']],
  },
  R19: {
    code: 'R19',
    label: 'Transile C16 Volcable 1',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R19_ALLOWED_SEQUENCES,
  },
  R20: {
    code: 'R20',
    label: 'Transile C16 Volcable 2',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R19_ALLOWED_SEQUENCES,
  },
  R3: {
    code: 'R3',
    label: 'Recepción Silos Kepler 1',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_1'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4'],
    allowedSequences: KEPLER_ALLOWED_S_SEQUENCES,
  },
  R4: {
    code: 'R4',
    label: 'Recepción Silos Kepler 2',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4'],
    allowedSequences: KEPLER_ALLOWED_S_SEQUENCES,
  },
  R26: {
    code: 'R26',
    label: 'Transile Celda 16 → San Lorenzo',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_C16_A_SL', 'TRANSILE_C16_A_SL_DESCARGA'],
    baseSequence: [
      'S0',
      'S1',
      'S2',
      'S4',
      'S5',
      'S6',
      'S7',
      'S4',
      'S10',
      'S0',
      'S1',
      'S3',
      'S4',
      'S5',
      'S7',
    ],
    allowedSequences: [],
  },
  R27: {
    code: 'R27',
    label: 'Transile San Lorenzo → Celda 16',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_SL_A_C16', 'TRANSILE_SL_A_C16_DESCARGA'],
    baseSequence: [
      'S0',
      'S1',
      'S3',
      'S4',
      'S5',
      'S7',
      'S0',
      'S1',
      'S2',
      'S4',
      'S5',
      'S6',
      'S7',
      'S4',
      'S10',
    ],
    allowedSequences: [],
  },
  R34: {
    code: 'R34',
    label: 'Transile externo Líquidos SLZ 2',
    coveragePercent: 64,
    hasStrongPoint: true,
    enabledForClassification: true,
  },
  /** Silos / celdas sin cámara destino — recepción sólida inferida por secuencia calada→balanza ingreso. */
  RS_REC: {
    code: 'RS_REC',
    label: 'Recepción sólida inferida (sin cámara destino)',
    coveragePercent: 50,
    hasStrongPoint: false,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6'],
  },
  /** Silos / celdas 09-11 — despacho sólido inferido por secuencia balanzas→calada. */
  RS_DESP: {
    code: 'RS_DESP',
    label: 'Despacho sólido inferido (sin cámara destino)',
    coveragePercent: 50,
    hasStrongPoint: false,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S4', 'S6', 'S2'],
  },
  /** Patrón insuficiente para inferir recepción/despacho sólido. */
  SIN_PUNTO: {
    code: 'SIN_PUNTO',
    label: 'Sin punto instrumentado (sólidos)',
    coveragePercent: 0,
    hasStrongPoint: false,
    enabledForClassification: false,
  },
}

/** Orden de lectura ejecutiva en gráficos y tablas. */
export const EXECUTIVE_CIRCUIT_ORDER = [
  'R1',
  'R5',
  'R6',
  'R7',
  'R8',
  'R9',
  'R16',
  'R19',
  'R20',
  'R3',
  'R4',
  'R26',
  'R27',
  'SL1',
  'SL5',
  'R34',
  'RS_REC',
  'RS_DESP',
  'SIN_PUNTO',
] as const

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
  SL_PREINGRESO: 'preingreso san lorenzo',
  SL_CALADA: 'calada san lorenzo',
  SL_ENLACE: 'enlace san lorenzo',
  SL_BALANZA_INGRESO: 'balanza ingreso SL',
  SL_BALANZA_SALIDA: 'balanza salida SL',
  SL_BALANZA_EGRESO: 'balanza egreso SL',
  SL_DESCARGA: 'descarga san lorenzo',
  SL_TRAMO: 'tramo san lorenzo',
  SL_ENLACE_FINAL: 'enlace final SL',
  SL_PLAYA: 'playa san lorenzo',
  SL_EGRESO: 'egreso san lorenzo',
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

/** Preliminares Ricardone con descarga instrumentada (Volcable / Celda 16). */
const FLEX_DISCHARGE_PRELIMINARY_CODES = new Set([
  'CIRCUITO_VOLCABLE_1_2',
  'CIRCUITO_CELDA16_DESCARGA',
  'CIRCUITO_CELDA16_CARGA',
])

export function isFlexibleDischargePreliminaryCode(code: string | null | undefined): boolean {
  return FLEX_DISCHARGE_PRELIMINARY_CODES.has(String(code ?? '').trim())
}

function journeyLogicalSetFromEvents(j: ReconstructedRealJourney): Set<string> {
  return new Set(getCollapsedLogicalCodes(j))
}

/** Volcable 1/2 o Celda 16 (carga/descarga) por lógica o deviceCode. */
export function journeyHasInstrumentedDischargeEvidence(j: ReconstructedRealJourney): boolean {
  const logical = journeyLogicalSetFromEvents(j)
  if (logical.has('VOLCABLE') || logical.has('CELDA16_DESCARGA') || logical.has('CELDA16_CARGA')) {
    return true
  }
  return (
    journeyHasDevicePattern(j, /RicVolcable[12]/i) ||
    journeyHasDevicePattern(j, /RicC16Descarga/i) ||
    journeyHasDevicePattern(j, /RicC16Carga/i)
  )
}

export function journeyHasCaladaOrBalanzaEvidence(j: ReconstructedRealJourney): boolean {
  const logical = journeyLogicalSetFromEvents(j)
  return (
    logical.has('CALADA') ||
    logical.has('BALANZA_INGRESO') ||
    logical.has('BALANZA_EGRESO') ||
    logical.has('BALANZA')
  )
}

/** Código técnico matriz cuando hay evidencia clara de descarga instrumentada. */
export function resolveFlexibleDischargePreliminaryCode(j: ReconstructedRealJourney): string {
  const logical = journeyLogicalSetFromEvents(j)
  if (logical.has('CELDA16_DESCARGA') || journeyHasDevicePattern(j, /RicC16Descarga/i)) {
    return 'CIRCUITO_CELDA16_DESCARGA'
  }
  if (logical.has('CELDA16_CARGA') || journeyHasDevicePattern(j, /RicC16Carga/i)) {
    return 'CIRCUITO_CELDA16_CARGA'
  }
  return 'CIRCUITO_VOLCABLE_1_2'
}

export function resolveFlexibleDischargeExecutiveCircuit(
  j: ReconstructedRealJourney
): ExecutiveCircuitConfig {
  const prelim = resolveFlexibleDischargePreliminaryCode(j)
  if (prelim === 'CIRCUITO_CELDA16_DESCARGA') return EXECUTIVE_CIRCUIT_MATRIX.R1!
  if (prelim === 'CIRCUITO_CELDA16_CARGA') return EXECUTIVE_CIRCUIT_MATRIX.R9!
  return resolveVolcableReceptionExecutiveCircuit(j)
}

/**
 * Regla operativa flexible: calada y/o balanza + punto de descarga/carga instrumentado
 * (Volcable 1, Volcable 2, Celda 16) → circuito válido aunque falte egreso Ric o la secuencia S* no cierre.
 */
export function journeyMeetsFlexibleInstrumentedDischargeRule(j: ReconstructedRealJourney): boolean {
  const logical = journeyLogicalSetFromEvents(j)
  // Transile C16→Volcable (sin ingreso Ricardone): sigue R19/R20, no regla recepción flexible.
  if (
    logical.has('VOLCABLE') &&
    logical.has('CELDA16_CARGA') &&
    !logical.has('INGRESO') &&
    !logical.has('PREINGRESO')
  ) {
    return false
  }
  return journeyHasInstrumentedDischargeEvidence(j) && journeyHasCaladaOrBalanzaEvidence(j)
}

function normDevice(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, '_') : ''
}

export function journeyHasSanLorenzoInstrumentedStrongPoint(j: ReconstructedRealJourney): boolean {
  return j.events.some((e) => {
    if (isEtlRearCameraDevice(e.deviceCode)) return false
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    return dev?.installed !== false && dev?.strongPoint === true
  })
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
  circuitMatrix: JourneyCircuitMatrix,
  options?: { preliminaryCodeOverride?: string }
): JourneyAgainstMatrixResult {
  const usefulEvents = journey.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode))
  const usefulEventsCount = usefulEvents.length > 0 ? usefulEvents.length : Math.max(0, journey.eventCount)
  const observedSeq =
    usefulEvents.length > 0 ?
      collapseConsecutiveEqual(
        [...usefulEvents].sort(compareRealEvents).map((e) => normalizeRealEventPoint(e).logicalCode)
      )
    : collapseConsecutiveEqual(journey.logicalCodeSequence.map((x) => String(x)))
  let preliminaryCode = String(options?.preliminaryCodeOverride ?? journey.preliminaryCircuitCode ?? '').trim()
  if (journeyMeetsFlexibleInstrumentedDischargeRule(journey)) {
    preliminaryCode = resolveFlexibleDischargePreliminaryCode(journey)
  }
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

  if (journeyMeetsFlexibleInstrumentedDischargeRule(journey)) {
    const flexMissing = missingPoints
    const flexMatched = expectedSeq.length - flexMissing.length
    const flexConfidence =
      expectedSeq.length > 0 ? clampRoundPct((flexMatched / expectedSeq.length) * 100) : 85
    if (flexMissing.length === 0 && sequenceRespected) {
      return {
        finalStatus: 'COMPLETO',
        reason: 'DESCARGA_INSTRUMENTADA_FLEX',
        sequenceRespected: true,
        missingPoints: [],
        matchedCircuitCode,
        confidence: flexConfidence,
      }
    }
    return {
      finalStatus: 'DEDUCIDO',
      reason: 'DESCARGA_INSTRUMENTADA_FLEX',
      sequenceRespected,
      missingPoints: flexMissing,
      matchedCircuitCode,
      confidence: flexConfidence,
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

function journeyHasDevicePattern(j: ReconstructedRealJourney, pattern: RegExp): boolean {
  return j.events.some((e) => pattern.test(String(e.deviceCode ?? '').trim()))
}

function firstLogicalIndex(seq: readonly string[], code: string): number {
  const i = seq.indexOf(code)
  return i >= 0 ? i : Number.POSITIVE_INFINITY
}

/** Calada sólida (RicCal01–06) o calada líquida (RicCalLiq → LIQUIDO) — mismo rol operativo S2. */
function firstCaladaOrLiquidIndex(seq: readonly string[]): number {
  return Math.min(firstLogicalIndex(seq, 'CALADA'), firstLogicalIndex(seq, 'LIQUIDO'))
}

function caladaOrLiquidBeforeBalIngreso(j: ReconstructedRealJourney): boolean {
  const seq = collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x)))
  const markerIdx = firstCaladaOrLiquidIndex(seq)
  const balIngIdx = firstLogicalIndex(seq, 'BALANZA_INGRESO')
  if (!Number.isFinite(markerIdx) || !Number.isFinite(balIngIdx)) return false
  return markerIdx < balIngIdx
}

function balanzasBeforeCaladaOrLiquid(j: ReconstructedRealJourney): boolean {
  const seq = collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x)))
  const markerIdx = firstCaladaOrLiquidIndex(seq)
  const balIngIdx = firstLogicalIndex(seq, 'BALANZA_INGRESO')
  const balEgrIdx = firstLogicalIndex(seq, 'BALANZA_EGRESO')
  if (!Number.isFinite(markerIdx) || !Number.isFinite(balIngIdx) || !Number.isFinite(balEgrIdx)) {
    return false
  }
  return balIngIdx < markerIdx && balEgrIdx < markerIdx
}

/** Líquido solo si pasó por cámara Calado Líquido (RicCalLiq). Sin esa cámara → sólido. */
export function journeyHasLiquidStrongPoint(j: ReconstructedRealJourney): boolean {
  return journeyHasDevicePattern(j, /RicCalLiq/i)
}

function caladaBeforeBalIngreso(j: ReconstructedRealJourney): boolean {
  const seq = collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x)))
  const caladaIdx = firstLogicalIndex(seq, 'CALADA')
  const balIngIdx = firstLogicalIndex(seq, 'BALANZA_INGRESO')
  if (!Number.isFinite(caladaIdx) || !Number.isFinite(balIngIdx)) return false
  return caladaIdx < balIngIdx
}

/** Segunda calada después de balanza egreso en el mismo ciclo — patrón despacho sólido: …calada→balanzas→calada→egreso. */
function caladaAfterBalanzasBeforeEgreso(j: ReconstructedRealJourney): boolean {
  const seq = collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x)))
  const balEgrIdx = firstLogicalIndex(seq, 'BALANZA_EGRESO')
  if (!Number.isFinite(balEgrIdx)) return false
  for (let i = balEgrIdx + 1; i < seq.length; i++) {
    const code = seq[i]
    // Nuevo ingreso/preingreso tras la primera salida de balanza = otro recorrido (recepción), no despacho.
    if (code === 'INGRESO' || code === 'PREINGRESO') return false
    if (code === 'CALADA') return true
  }
  return false
}

/** Segunda calada después de balanza egreso en el mismo ciclo — patrón despacho sólido: …calada→balanzas→calada→egreso. */
export function isLiquidReceptionJourney(j: ReconstructedRealJourney): boolean {
  if (!journeyHasLiquidStrongPoint(j)) return false
  return caladaOrLiquidBeforeBalIngreso(j)
}

/** Despacho líquido (R16): balanza ingreso y egreso antes de calada/líquido — sale cargado. */
export function isLiquidDispatchJourney(j: ReconstructedRealJourney): boolean {
  if (!journeyHasLiquidStrongPoint(j)) return false
  return balanzasBeforeCaladaOrLiquid(j)
}

function resolveLiquidExecutiveCircuit(journey: ReconstructedRealJourney): ExecutiveCircuitConfig | null {
  if (!journeyHasLiquidStrongPoint(journey)) return null
  if (isLiquidDispatchJourney(journey)) return EXECUTIVE_CIRCUIT_MATRIX.R16!
  if (isLiquidReceptionJourney(journey)) return EXECUTIVE_CIRCUIT_MATRIX.R8!
  // RicCalLiq sin patrón claro de orden → recepción líquida por defecto (no SIN_PUNTO).
  return EXECUTIVE_CIRCUIT_MATRIX.R8!
}

/** Inferencia sólida sin cámara en silos/celdas. */
export function inferSolidExecutiveCircuit(journey: ReconstructedRealJourney): ExecutiveCircuitConfig {
  if (isSolidDispatchPattern(journey)) return EXECUTIVE_CIRCUIT_MATRIX.RS_DESP!
  if (isSolidReceptionPattern(journey)) return EXECUTIVE_CIRCUIT_MATRIX.RS_REC!
  return EXECUTIVE_CIRCUIT_MATRIX.SIN_PUNTO!
}

/** Recepción sólida: calada → balanzas (sin segunda calada tras balanza egreso). */
export function isSolidReceptionPattern(j: ReconstructedRealJourney): boolean {
  if (journeyHasLiquidStrongPoint(j)) return false
  if (isSolidDispatchPattern(j)) return false
  return caladaBeforeBalIngreso(j)
}

/** Despacho sólido: calada → balanzas → calada (segunda calada en el mismo ciclo, sin reingreso). */
export function isSolidDispatchPattern(j: ReconstructedRealJourney): boolean {
  if (journeyHasLiquidStrongPoint(j)) return false
  return caladaBeforeBalIngreso(j) && caladaAfterBalanzasBeforeEgreso(j)
}

/**
 * Transile C16→Volcable (R19/R20): carga en Celda 16 + descarga en Volcable, sin recepción Ricardone formal.
 * No confundir con recepción a Volcable (R5/R6) que puede tener calada/balanza sin pasar por C16.
 */
export function journeyIsTransileC16Volcable(j: ReconstructedRealJourney): boolean {
  const logical = logicalSet(j)
  if (!logical.has('VOLCABLE') || !logical.has('CELDA16_CARGA')) return false
  if (logical.has('INGRESO') || logical.has('PREINGRESO')) return false
  return true
}

export function resolveVolcableReceptionExecutiveCircuit(journey: ReconstructedRealJourney): ExecutiveCircuitConfig {
  return journeyHasDevicePattern(journey, /RicVolcable2/i) ?
      EXECUTIVE_CIRCUIT_MATRIX.R6!
    : EXECUTIVE_CIRCUIT_MATRIX.R5!
}

export function resolveProbableSolidExecutiveDecision(input: {
  matrixFinalStatus: JourneyMatrixFinalStatus
  matrixReason: string
  frontEventCount: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
}): ExecutiveCircuitDecision {
  const evaluable =
    input.frontEventCount >= 4 && input.hasOperationalEntry && input.hasOperationalExit
  if (evaluable && (input.matrixFinalStatus === 'DEDUCIDO' || input.matrixFinalStatus === 'COMPLETO')) {
    return {
      executiveStatus: 'VALIDO',
      executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO',
      validDetail: input.matrixFinalStatus === 'COMPLETO' ? 'COMPLETO' : 'DEDUCIDO',
    }
  }
  if (evaluable) {
    return {
      executiveStatus: 'PROBABLE',
      executiveReason: 'CIRCUITO_PROBABLE_INFERIDO',
      validDetail: '',
    }
  }
  return {
    executiveStatus: 'INCOMPLETO',
    executiveReason: input.matrixReason || 'EVENTOS_INSUFICIENTES',
    validDetail: '',
  }
}

/** Resuelve circuito ejecutivo R* a partir del código técnico Truckflow y eventos del journey. */
export function resolveExecutiveCircuitConfigForJourney(
  journey: ReconstructedRealJourney,
  technicalCode?: string | null
): ExecutiveCircuitConfig | null {
  const code = String(technicalCode ?? journey.preliminaryCircuitCode ?? '').trim()
  if (!code) return null

  const liquidCircuit = resolveLiquidExecutiveCircuit(journey)
  if (liquidCircuit) return liquidCircuit

  if (journeyIsTransileC16ToSl(journey)) {
    return EXECUTIVE_CIRCUIT_MATRIX.R26!
  }

  if (journeyIsTransileSlToC16(journey)) {
    return EXECUTIVE_CIRCUIT_MATRIX.R27!
  }

  if (journeyMeetsFlexibleInstrumentedDischargeRule(journey)) {
    return resolveFlexibleDischargeExecutiveCircuit(journey)
  }

  if (journeyIsRicSanLorenzoRouteEvidence(journey)) {
    return EXECUTIVE_CIRCUIT_MATRIX.R7!
  }

  if (ETL_SL_INTERNAL_CLASSIFICATION_ENABLED && journeyIsSlOnlyInternal(journey)) {
    return EXECUTIVE_CIRCUIT_MATRIX.SL1!
  }

  if (code === 'DESPACHO_SIN_PUNTO_INSTRUMENTADO') {
    if (journeyMeetsFlexibleInstrumentedDischargeRule(journey)) {
      return resolveFlexibleDischargeExecutiveCircuit(journey)
    }
    return inferSolidExecutiveCircuit(journey)
  }

  if (code === 'CIRCUITO_LIQUIDO') {
    return resolveLiquidExecutiveCircuit(journey) ?? EXECUTIVE_CIRCUIT_MATRIX.R8!
  }

  const direct = EXECUTIVE_CIRCUIT_MATRIX[code]
  if (direct) return redirectSl1IfRicardoneMisclassified(journey, direct)

  if (code === 'CIRCUITO_VOLCABLE_1_2') {
    return journeyHasDevicePattern(journey, /RicVolcable2/i) ?
        EXECUTIVE_CIRCUIT_MATRIX.R6!
      : EXECUTIVE_CIRCUIT_MATRIX.R5!
  }

  if (code === 'TRANSILE_VOLCABLE_BALANZA') {
    if (!journeyIsTransileC16Volcable(journey)) {
      return resolveVolcableReceptionExecutiveCircuit(journey)
    }
    return journeyHasDevicePattern(journey, /RicVolcable2/i) ?
        EXECUTIVE_CIRCUIT_MATRIX.R20!
      : EXECUTIVE_CIRCUIT_MATRIX.R19!
  }

  const matches = Object.values(EXECUTIVE_CIRCUIT_MATRIX).filter((cfg) =>
    (cfg.aliases ?? []).some((alias) => alias === code)
  )
  if (matches.length === 1) return redirectSl1IfRicardoneMisclassified(journey, matches[0]!)
  return matches[0] ? redirectSl1IfRicardoneMisclassified(journey, matches[0]!) : null
}

function redirectSl1IfRicardoneMisclassified(
  journey: ReconstructedRealJourney,
  cfg: ExecutiveCircuitConfig
): ExecutiveCircuitConfig {
  if (cfg.code !== 'SL1' || !journeyBlocksSl1ExecutiveClassification(journey)) return cfg
  const liquid = resolveLiquidExecutiveCircuit(journey)
  if (liquid) return liquid
  if (journeyMeetsFlexibleInstrumentedDischargeRule(journey)) {
    return resolveFlexibleDischargeExecutiveCircuit(journey)
  }
  if (logicalSet(journey).has('LIQUIDO')) return EXECUTIVE_CIRCUIT_MATRIX.R8!
  return inferSolidExecutiveCircuit(journey)
}

export function resolveExecutiveCircuitConfig(circuitCode: string | null | undefined): ExecutiveCircuitConfig | null {
  const code = String(circuitCode ?? '').trim()
  if (!code) return null
  const direct = EXECUTIVE_CIRCUIT_MATRIX[code]
  if (direct) return direct
  return (
    Object.values(EXECUTIVE_CIRCUIT_MATRIX).find((cfg) =>
      (cfg.aliases ?? []).some((alias) => alias === code)
    ) ?? null
  )
}

export function formatExecutiveCircuitLabel(code: string, label?: string): string {
  const c = String(code ?? '').trim()
  const l = String(label ?? '').trim()
  if (c && l) return `${c} · ${l}`
  return c || l || 'Sin asignar'
}

export function isExecutiveSequenceConfigured(config: ExecutiveCircuitConfig | null): boolean {
  if (!config) return false
  return Boolean(config.baseSequence?.length || config.allowedSequences?.some((seq) => seq.length > 0))
}

/** Ruta operativa Ricardone → San Lorenzo (no confundir con circuito interno SL1). */
export function isRicSanLorenzoRouteCircuit(code: string | null | undefined): boolean {
  const c = String(code ?? '').trim()
  return c === 'R7' || c === 'CIRCUITO_SAN_LORENZO' || c === 'CIRCUITO_R7_MIXTO'
}

export { resolveTechnicalCircuitCodeForExecutive }

/** 4/5 o 4/6 puntos observados + evidencia operativa fuerte → deducible como circuito válido. */
export function journeyHasDeducedStrongEvidence(input: {
  journey: ReconstructedRealJourney
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
  frontEventCount: number
  hasInstrumentedStrongPoint: boolean
}): boolean {
  if (input.hasInstrumentedStrongPoint) return true
  if (journeyHasStrongDefiningPoint(input.journey)) return true
  if (journeyHasBalansaCompleta(input.journey)) return true
  return (
    input.hasOperationalEntry &&
    input.hasOperationalExit &&
    input.frontEventCount >= 4
  )
}

export function journeyMeetsDeducedEvidenceThreshold(input: {
  matrixFinalStatus: JourneyMatrixFinalStatus
  matchedPoints: number
  expectedPoints: number
  hasJourneyStrongPoint: boolean
  matrixConfidence?: number
}): boolean {
  if (!input.hasJourneyStrongPoint) return false
  if (input.matrixFinalStatus === 'COMPLETO') return true
  if (input.matrixFinalStatus !== 'DEDUCIDO') return false

  // La matriz ya marcó DEDUCIDO (≤2 huecos en secuencia): confiar si hay evidencia fuerte.
  if (input.expectedPoints <= 0) {
    return (input.matrixConfidence ?? 0) >= 50
  }
  if (input.expectedPoints === 5) return input.matchedPoints >= 4
  if (input.expectedPoints === 6) return input.matchedPoints >= 4
  if (input.expectedPoints >= 7) return input.matchedPoints >= input.expectedPoints - 2
  return input.matchedPoints >= Math.max(1, input.expectedPoints - 1)
}

export function isJourneyProductivelyEvaluable(input: {
  sequenceConfigured: boolean
  coveragePercent: number
  hasStrongPoint: boolean
  matrixFinalStatus: JourneyMatrixFinalStatus
  matchedPoints: number
  expectedPoints: number
  hasJourneyStrongPoint: boolean
}): boolean {
  if (!input.sequenceConfigured) return false
  if (input.coveragePercent >= 60 && input.hasStrongPoint) return true
  return journeyMeetsDeducedEvidenceThreshold({
    matrixFinalStatus: input.matrixFinalStatus,
    matchedPoints: input.matchedPoints,
    expectedPoints: input.expectedPoints,
    hasJourneyStrongPoint: input.hasJourneyStrongPoint,
  })
}

export function resolveExecutiveCircuitStatus(
  matrixFinalStatus: JourneyMatrixFinalStatus,
  coverageInfo: ExecutiveCircuitCoverageInfo,
  sequenceConfig: ExecutiveCircuitSequenceConfig,
  journeyEvidence?: {
    matchedPoints: number
    expectedPoints: number
    hasJourneyStrongPoint: boolean
  }
): ExecutiveCircuitStatus {
  if (!sequenceConfig.sequenceConfigured) return 'NO_EVALUABLE'

  const evaluable =
    journeyEvidence ?
      isJourneyProductivelyEvaluable({
        sequenceConfigured: true,
        coveragePercent: coverageInfo.coveragePercent,
        hasStrongPoint: coverageInfo.hasStrongPoint,
        matrixFinalStatus,
        matchedPoints: journeyEvidence.matchedPoints,
        expectedPoints: journeyEvidence.expectedPoints,
        hasJourneyStrongPoint: journeyEvidence.hasJourneyStrongPoint,
      })
    : coverageInfo.coveragePercent >= 60 && coverageInfo.hasStrongPoint === true

  if (!evaluable) return 'NO_EVALUABLE'

  switch (matrixFinalStatus) {
    case 'COMPLETO':
    case 'DEDUCIDO':
      return 'VALIDO'
    case 'INCOMPLETO':
      return 'INCOMPLETO'
    case 'ANOMALO':
      return sequenceConfig.enabledForClassification ? 'ANOMALO' : 'NO_EVALUABLE'
  }
}

export function resolveExecutiveCircuitDecision(input: {
  matrixFinalStatus: JourneyMatrixFinalStatus
  matrixReason: string
  coverageInfo: ExecutiveCircuitCoverageInfo
  sequenceConfig: ExecutiveCircuitSequenceConfig
  journeyEvidence?: {
    matchedPoints: number
    expectedPoints: number
    hasJourneyStrongPoint: boolean
  }
}): ExecutiveCircuitDecision {
  const status = resolveExecutiveCircuitStatus(
    input.matrixFinalStatus,
    input.coverageInfo,
    input.sequenceConfig,
    input.journeyEvidence
  )

  if (!input.sequenceConfig.sequenceConfigured) {
    return {
      executiveStatus: 'NO_EVALUABLE',
      executiveReason: 'CONFIG_ERROR_MISSING_SEQUENCE',
      validDetail: '',
    }
  }

  const evaluable =
    input.journeyEvidence ?
      isJourneyProductivelyEvaluable({
        sequenceConfigured: true,
        coveragePercent: input.coverageInfo.coveragePercent,
        hasStrongPoint: input.coverageInfo.hasStrongPoint,
        matrixFinalStatus: input.matrixFinalStatus,
        matchedPoints: input.journeyEvidence.matchedPoints,
        expectedPoints: input.journeyEvidence.expectedPoints,
        hasJourneyStrongPoint: input.journeyEvidence.hasJourneyStrongPoint,
      })
    : input.coverageInfo.coveragePercent >= 60 && input.coverageInfo.hasStrongPoint === true

  if (!evaluable) {
    return {
      executiveStatus: 'NO_EVALUABLE',
      executiveReason: 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA',
      validDetail: '',
    }
  }

  if (input.matrixFinalStatus === 'COMPLETO') {
    return {
      executiveStatus: status,
      executiveReason: 'CIRCUITO_COMPLETO',
      validDetail: status === 'VALIDO' ? 'COMPLETO' : '',
    }
  }

  if (input.matrixFinalStatus === 'DEDUCIDO') {
    return {
      executiveStatus: status,
      executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO',
      validDetail: status === 'VALIDO' ? 'DEDUCIDO' : '',
    }
  }

  if (input.matrixFinalStatus === 'ANOMALO' && status === 'NO_EVALUABLE') {
    return {
      executiveStatus: 'NO_EVALUABLE',
      executiveReason: 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA',
      validDetail: '',
    }
  }

  return {
    executiveStatus: status,
    executiveReason: input.matrixReason || status,
    validDetail: '',
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
    logicals.has('LIQUIDO') ||
    journeyHasSanLorenzoInstrumentedStrongPoint(j)
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
    if (
      journeyMeetsFlexibleInstrumentedDischargeRule(j) &&
      hasOperationalEntry &&
      hasOperationalExit &&
      frontEventCount >= 4
    ) {
      return { bucket: 'DEDUCIDO', anomalyReason: null }
    }
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
