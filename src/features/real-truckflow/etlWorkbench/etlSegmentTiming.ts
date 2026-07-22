import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { eventOperationalInstantForTimeline } from '../../../services/realEventOperationalTime'
import { computeStayTimeStats, type StayTimeStats } from '../../../services/analyticsKpi'
import { recordsToCsv } from './etlCsv'
import { DEFAULT_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_ORDER } from './finalCircuitScoring'
import { isEtlRearCameraDevice } from './etlRearDevices'
import type { CommitteeGroup } from './committeeClassification'
import { shouldApplyTiemposEntrePasosBalanzaOverride } from './etlTiemposEntrePasos'

/** Bins del histograma de tramos largos (minutos). */
export const SEGMENT_TIMING_HISTOGRAM_BIN_MIN = 5

/** Umbral máximo razonable por tramo (8 h). */
export const MAX_SEGMENT_DURATION_MINUTES = 8 * 60

/** Tramos SL ≤ 3 min se descartan (ruido OCR / fragmentación en puerto). */
export const MIN_SEGMENT_DURATION_MINUTES = 3

/**
 * Tramo rollup San Lorenzo: balanza ingreso → egreso real (S1→S7).
 * Unifica estadía en balanza + tránsito a salida del puerto en un solo KPI.
 */
export const SL_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_INGRESO',
  to: 'SL_EGRESO',
} as const

/**
 * Recepción Ricardone (Celda 16 / Volcable 1-2): estadía completa balanza ingreso → balanza egreso.
 * La plataforma de descarga viene del Excel (circuito R1/R5/R6); no se fragmenta por cámara de descarga.
 */
export const BALANZA_STAY_ROLLUP_TRANSITION = {
  from: 'BALANZA_INGRESO',
  to: 'BALANZA_EGRESO',
} as const

const CIRCUITS_WITH_BALANZA_STAY_ROLLUP = new Set(['R1', 'R5', 'R6', 'R3', 'R4'])

/** Mínimo estadía balanza con paso por Volcable (subtramos cortos son tránsito, no B1/B2). */
const VOLCABLE_RECEIPT_BALANZA_STAY_MIN_MINUTES = 3

/** Balanza ingreso→egreso Ricardone: < 10 min = lecturas B1/B2 casi simultáneas (error cámara/OCR). */
export const BALANZA_STAY_MIN_MINUTES = 10

/** Template KPI recepción Ricardone sin punto intermedio de plataforma. */
export const RECEPTION_BALANZA_KPI_CHAIN = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
] as const

/** KPI Silos Kepler (R3/R4): ingreso → calada → balanza ingreso → balanza egreso. */
export const KEPLER_KPI_CHAIN = [
  'INGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
] as const

/** Códigos ejecutivos legacy antes de renombrar a R3/R4. */
export const LEGACY_KEPLER_EXECUTIVE_ALIASES: Record<string, string> = {
  RK1: 'R3',
  RK2: 'R4',
}

export function normalizeExecutiveCircuitForKpi(circuitCode: string): string {
  return LEGACY_KEPLER_EXECUTIVE_ALIASES[circuitCode] ?? circuitCode
}

/** Volcable 1 / Volcable 2: misma cadena KPI recepción; vista unificada en pestaña tiempos. */
export const VOLCABLE_RECEIPT_KPI_UNION_CODE = 'R5+R6'

export const VOLCABLE_RECEIPT_CIRCUIT_CODES = ['R5', 'R6'] as const

/** Tope KPI recepción Volcable 1/2 (esperas en calada, estadía). */
export const VOLCABLE_RECEIPT_KPI_MAX_MINUTES = 8 * 60

export function isVolcableReceiptCircuit(circuitCode: string): boolean {
  const c = normalizeExecutiveCircuitForKpi(String(circuitCode ?? '').trim())
  return c === 'R5' || c === 'R6'
}

export function kpiCircuitCodesForScatterFilter(circuitFilter: string): string[] {
  if (circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE) return [...VOLCABLE_RECEIPT_CIRCUIT_CODES]
  const code = String(circuitFilter ?? '').trim()
  return code ? [code] : []
}

const KEPLER_KPI_CIRCUIT_CODES = new Set(['R3', 'R4'])

/** @deprecated Unificado en SL_BALANZA_ROLLUP_TRANSITION (S1→S7). */
export const SL_SALIDA_EGRESO_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_SALIDA',
  to: 'SL_EGRESO',
} as const

/**
 * Tránsito físico balanza salida SL → egreso (~200–300 m). No es estadía en puerto.
 * El calado Excel NO aplica acá (eso es otra fase operativa).
 */
export const SL_SALIDA_EGRESO_MAX_MINUTES = 30

/** Si falta cámara S5 y solo hay salida Excel, balanza salida se infiere pocos min antes. */
export const SL_EXIT_TRANSIT_DEFAULT_MINUTES = 5

/** Tránsito ingreso SL → balanza ingreso (cámaras S0→S1/S2); no inferir si el hueco es mayor. */
export const SL_INGRESO_TO_BALANZA_MAX_MINUTES = 60

/** Anclas Excel por operación (match patente + external_operation_id). */
export type SlExcelTimelineAnchors = {
  externalIngresoAt?: string
  externalCaladoAt?: string
  externalSalidaAt?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
  plantaNormalized?: string
  executiveCircuitCode?: string
}

export function shouldUseExcelCaladoAsSlDescarga(
  executiveCircuitCode?: string,
  plantaNormalized?: string
): boolean {
  // Importante: en SL no se debe usar `external_calado_at` como proxy de `SL_DESCARGA`.
  // `SL_DESCARGA` debe provenir de cámara/traza de descarga (o el proxy correcto para el caso, si existiera),
  // pero no fijarse con la hora de calado del contrato.
  return false
}

/** Tránsito físico Volcable → balanza egreso (~200 m): solo cámaras Truckflow o salida Excel cercana. */
export const VOLCABLE_BALANZA_EGRESO_MAX_MINUTES = 30

/** Tope gráfico KPI / dispersión (6 h) — tabla y scatter usan el mismo filtro. */
export const KPI_SEGMENT_DISPLAY_MAX_MINUTES = 360

export function isWithinKpiSegmentDisplayMax(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes > 0 && minutes <= KPI_SEGMENT_DISPLAY_MAX_MINUTES
}

/** Tramos cortos: solo tránsitos físicos (~200 m). Resto: tope operativo 6 h (360 min). */
export const SHORT_SEGMENT_MAX_MINUTES: Record<string, number> = {
  'SL_BALANZA_SALIDA→SL_EGRESO': SL_SALIDA_EGRESO_MAX_MINUTES,
  'VOLCABLE→BALANZA_EGRESO': VOLCABLE_BALANZA_EGRESO_MAX_MINUTES,
}

/** Rollup ingreso SL → balanza ingreso SL (falta cámara S2 u otras intermedias). */
export const SL_INGRESO_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_INGRESO',
  to: 'SL_BALANZA_INGRESO',
} as const

/** Tránsito típico ingreso puerto (S0) → balanza ingreso (S1) cuando falta cámara S1. */
export const SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES = 15

/** Fin del tramo KPI balanza ingreso → egreso SL (S7 real o salida Excel). */
const SL_BALANZA_ROLLUP_END_CODES = ['SL_EGRESO'] as const

/** Brecha máxima entre hitos del mismo recorrido operativo (mismo viaje). */
export const OPERATIONAL_TRIP_GAP_MAX_MINUTES = 6 * 60

/** Rollups deducidos Ric/Volcable: tope para no mezclar viajes distintos. */
export const INFERRED_KPI_ROLLUP_MAX_MINUTES = 6 * 60

/** Tramos KPI San Lorenzo (S0→S1, etc.): sin tope 6 h — estadías reales pueden superarlo. */
export const SL_KPI_SEGMENT_MAX_MINUTES = 72 * 60

/** Estadía máxima balanza entrada → egreso SL (comité scatter/CSV): 3 h operativas. */
export const SL_BALANZA_STAY_MAX_MINUTES = 180

/** Pata SL en KPI: ingreso puerto → balanza entrada → egreso. */
export const SL_OPERATIONAL_KPI_CHAIN = [
  'SL_INGRESO',
  'SL_BALANZA_INGRESO',
  'SL_EGRESO',
] as const

const CIRCUITS_WITH_SL_BALANZA_ROLLUP = new Set(['R7', 'SL1', 'R26', 'R27'])

/** Puente Ricardone ↔ San Lorenzo en transiles externos (sin cámaras en ruta). */
export const TRANSILE_BRIDGE_KPI_TRANSITIONS = {
  R7: { fromCode: 'EGRESO', toCode: 'SL_INGRESO' },
  R26: { fromCode: 'BALANZA_EGRESO', toCode: 'SL_INGRESO' },
  R27: { fromCode: 'SL_EGRESO', toCode: 'INGRESO' },
} as const

const CIRCUITS_WITH_TRANSILE_BRIDGE_ROLLUP = new Set(Object.keys(TRANSILE_BRIDGE_KPI_TRANSITIONS))

function usesFullOperationalSegmentTimeline(executiveCircuitCode: string): boolean {
  const code = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  return (
    CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(code) || CIRCUITS_WITH_TRANSILE_BRIDGE_ROLLUP.has(code)
  )
}

/** Duración máxima del rollup balanza SL → egreso (S1→S7). */
const SL_BALANZA_ROLLUP_MAX_MINUTES = SL_BALANZA_STAY_MAX_MINUTES

/** Rollup KPI descarga/carga Ricardone cuando faltan cámaras en Celda 16 / Volcable. */
export type DischargeKpiRollupRule = {
  fromCode: string
  toCode: string
  /** Puntos Truckflow que cierran el tramo (salto no consecutivo). */
  endCodes: readonly string[]
}

const DISCHARGE_KPI_ROLLUP_MAX_MINUTES = INFERRED_KPI_ROLLUP_MAX_MINUTES

const BALANZA_STAY_KPI_ROLLUP_RULE: DischargeKpiRollupRule = {
  fromCode: BALANZA_STAY_ROLLUP_TRANSITION.from,
  toCode: BALANZA_STAY_ROLLUP_TRANSITION.to,
  endCodes: ['BALANZA_EGRESO', 'EGRESO'],
}

const DISCHARGE_KPI_ROLLUP_BY_CIRCUIT: Record<string, DischargeKpiRollupRule[]> = {
  R1: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R5: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R6: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R3: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R4: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R9: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R19: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R20: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R7: [
    {
      fromCode: 'EGRESO',
      toCode: 'SL_INGRESO',
      endCodes: ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_EGRESO'],
    },
  ],
  R26: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'BALANZA_EGRESO',
      toCode: 'SL_INGRESO',
      endCodes: ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_EGRESO'],
    },
  ],
  R27: [
    {
      fromCode: 'SL_EGRESO',
      toCode: 'INGRESO',
      endCodes: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO'],
    },
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_DESCARGA',
      endCodes: ['CELDA16_DESCARGA', 'CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_DESCARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R34: [
    {
      fromCode: 'LIQUIDO',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
}

const CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP = new Set(Object.keys(DISCHARGE_KPI_ROLLUP_BY_CIRCUIT))

export function getDischargeKpiRollupRules(circuitCode: string): DischargeKpiRollupRule[] {
  const code = normalizeExecutiveCircuitForKpi(circuitCode)
  return DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[code] ?? []
}

export function transitionKey(fromCode: string, toCode: string): string {
  return `${fromCode}→${toCode}`
}

export function maxAllowedMinutesForTransition(fromCode: string, toCode: string): number {
  const key = transitionKey(fromCode, toCode)
  if (key === transitionKey(SL_BALANZA_ROLLUP_TRANSITION.from, SL_BALANZA_ROLLUP_TRANSITION.to)) {
    return SL_BALANZA_ROLLUP_MAX_MINUTES
  }
  if (key === transitionKey(SL_SALIDA_EGRESO_ROLLUP_TRANSITION.from, SL_SALIDA_EGRESO_ROLLUP_TRANSITION.to)) {
    return SL_SALIDA_EGRESO_MAX_MINUTES
  }
  if (key === transitionKey(SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from, SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to)) {
    return SL_KPI_SEGMENT_MAX_MINUTES
  }
  if (key === transitionKey('VOLCABLE', 'BALANZA_EGRESO')) {
    return VOLCABLE_BALANZA_EGRESO_MAX_MINUTES
  }
  for (const rules of Object.values(DISCHARGE_KPI_ROLLUP_BY_CIRCUIT)) {
    for (const rule of rules) {
      if (key === transitionKey(rule.fromCode, rule.toCode)) {
        return DISCHARGE_KPI_ROLLUP_MAX_MINUTES
      }
    }
  }
  if (fromCode.startsWith('SL_') || toCode.startsWith('SL_')) {
    return SL_KPI_SEGMENT_MAX_MINUTES
  }
  return SHORT_SEGMENT_MAX_MINUTES[key] ?? INFERRED_KPI_ROLLUP_MAX_MINUTES
}

export function histogramBinMinutesForTransition(_fromCode?: string, _toCode?: string): number {
  return SEGMENT_TIMING_HISTOGRAM_BIN_MIN
}

export function isShortOperationalTransition(fromCode: string, toCode: string): boolean {
  return transitionKey(fromCode, toCode) in SHORT_SEGMENT_MAX_MINUTES
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
  SL_PREINGRESO: 'preingreso san lorenzo',
  SL_CALADA: 'calada san lorenzo',
  SL_ENLACE: 'enlace san lorenzo',
  SL_BALANZA_INGRESO: 'balanza de entrada',
  SL_BALANZA_SALIDA: 'balanza egreso SL',
  SL_BALANZA_EGRESO: 'balanza egreso SL',
  SL_DESCARGA: 'descarga san lorenzo',
  SL_TRAMO: 'tramo san lorenzo',
  SL_ENLACE_FINAL: 'enlace final SL',
  SL_PLAYA: 'playa san lorenzo',
  SL_EGRESO: 'egreso san lorenzo',
}

/** Orden operativo esperado para ordenar filas de tramos en tablas. */
export const LOGICAL_TRANSITION_ORDER: readonly string[] = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'LIQUIDO',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'BALANZA',
  'VOLCABLE',
  'CELDA16_CARGA',
  'CELDA16_DESCARGA',
  'SL_INGRESO',
  'SL_PREINGRESO',
  'SL_PLAYA',
  'SL_CALADA',
  'SL_ENLACE',
  'SL_BALANZA_INGRESO',
  'SL_BALANZA_SALIDA',
  'SL_BALANZA_EGRESO',
  'SL_DESCARGA',
  'SL_TRAMO',
  'SL_ENLACE_FINAL',
  'SL_EGRESO',
  'EGRESO',
]

export type SegmentLeg = {
  journeyId: string
  plate: string
  executiveCircuitCode: string
  fromCode: string
  toCode: string
  durationMinutes: number
}

export type SegmentLegWithTimes = SegmentLeg & {
  segment_start_time: string
  segment_end_time: string
}

export type SegmentTimingAggregate = {
  circuitCode: string
  fromCode: string
  toCode: string
  label: string
  transitionKey: string
  stats: StayTimeStats
  durationsMinutes: number[]
  minPlate: string
  maxPlate: string
  minJourneyId: string
  maxJourneyId: string
}

export type SegmentTimingIndex = {
  legs: SegmentLeg[]
  aggregates: SegmentTimingAggregate[]
  aggregatesByCircuit: Record<string, SegmentTimingAggregate[]>
  circuitCodes: string[]
  journeyCount: number
  /** Journeys/operaciones excluidas del KPI por no tener ingreso ni preingreso. */
  excludedNoEntryAnchor?: number
}

export type ClassifiedJourneyForTiming = {
  journey: ReconstructedRealJourney
  executiveCircuitCode: string
  committeeGroup: CommitteeGroup
  executiveStatus?: string
  validDetail?: string
  circuitName?: string
}

/** Puntos lógicos del recorrido operativo por circuito R* (sin EGRESO final). */
function templateWithoutEgreso(points: readonly string[]): string[] {
  const last = points[points.length - 1]
  if (last === 'EGRESO') return points.slice(0, -1)
  return [...points]
}

function buildExecutiveCircuitSegmentTemplate(): Record<string, readonly string[]> {
  const map: Record<string, readonly string[]> = {}
  for (const [rCode, cfg] of Object.entries(EXECUTIVE_CIRCUIT_MATRIX)) {
    const alias = cfg.aliases?.[0]
    if (!alias) continue
    const seq = DEFAULT_CIRCUIT_MATRIX[alias as keyof typeof DEFAULT_CIRCUIT_MATRIX]
    if (seq?.length) map[rCode] = templateWithoutEgreso(seq)
  }
  map.R16 = ['INGRESO', 'PREINGRESO', 'CALADA', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO']
  map.R1 = RECEPTION_BALANZA_KPI_CHAIN
  map.R5 = RECEPTION_BALANZA_KPI_CHAIN
  map.R6 = RECEPTION_BALANZA_KPI_CHAIN
  map.R7 = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', ...SL_OPERATIONAL_KPI_CHAIN]
  map.R8 = ['INGRESO', 'PREINGRESO', 'CALADA', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO']
  map.R26 = [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'CELDA16_CARGA',
    'BALANZA_EGRESO',
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    'SL_EGRESO',
  ]
  map.R27 = [
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    'SL_EGRESO',
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'CELDA16_DESCARGA',
    'BALANZA_EGRESO',
  ]
  map.SL1 = [...SL_OPERATIONAL_KPI_CHAIN]
  map.R19 = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO']
  map.R20 = map.R19
  map.R3 = KEPLER_KPI_CHAIN
  map.R4 = KEPLER_KPI_CHAIN
  map.RS_REC = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO']
  map.RS_DESP = ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'CALADA', 'BALANZA_EGRESO']
  map.R34 = ['LIQUIDO', 'BALANZA_EGRESO']
  return map
}

export const EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE = buildExecutiveCircuitSegmentTemplate()

export function getCircuitSegmentTemplate(circuitCode: string): readonly string[] {
  const raw = String(circuitCode ?? '').trim()
  if (raw === VOLCABLE_RECEIPT_KPI_UNION_CODE) {
    return EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE.R5 ?? RECEPTION_BALANZA_KPI_CHAIN
  }
  const code = normalizeExecutiveCircuitForKpi(raw)
  return EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE[code] ?? []
}

/** Máx. puntos template omitidos en un rollup (p. ej. ingreso→balanza sin preingreso/calada). */
const TEMPLATE_SKIP_ROLLUP_MAX_INDEX_GAP = 3

/** Salto hacia adelante en el template (p. ej. preingreso→balanza si falta calada). */
export function isTemplateForwardTransition(
  circuitCode: string,
  fromCode: string,
  toCode: string
): boolean {
  const template = getCircuitSegmentTemplate(circuitCode)
  const fi = template.indexOf(fromCode)
  const ti = template.indexOf(toCode)
  if (fi < 0 || ti <= fi) return false
  const gap = ti - fi
  return gap >= 1 && gap <= TEMPLATE_SKIP_ROLLUP_MAX_INDEX_GAP
}

export function isExpectedCircuitTransition(
  circuitCode: string,
  fromCode: string,
  toCode: string
): boolean {
  if (
    CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(circuitCode) &&
    fromCode === SL_BALANZA_ROLLUP_TRANSITION.from &&
    toCode === SL_BALANZA_ROLLUP_TRANSITION.to
  ) {
    return true
  }
  if (
    CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(circuitCode) &&
    fromCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
    toCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to
  ) {
    return true
  }
  if (
    CIRCUITS_WITH_BALANZA_STAY_ROLLUP.has(circuitCode) &&
    fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
    toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  ) {
    return true
  }
  const bridge = TRANSILE_BRIDGE_KPI_TRANSITIONS[circuitCode as keyof typeof TRANSILE_BRIDGE_KPI_TRANSITIONS]
  if (bridge && fromCode === bridge.fromCode && toCode === bridge.toCode) {
    return true
  }
  if (isTemplateForwardTransition(circuitCode, fromCode, toCode)) return true
  const template = getCircuitSegmentTemplate(circuitCode)
  if (template.length < 2) return false
  for (let i = 0; i < template.length - 1; i++) {
    if (template[i] === fromCode && template[i + 1] === toCode) return true
  }
  return false
}

export function listCircuitSegmentAggregates(
  index: SegmentTimingIndex,
  circuitCode: string
): SegmentTimingAggregate[] {
  const template = getCircuitSegmentTemplate(circuitCode)
  const byKey = new Map(
    (index.aggregatesByCircuit[circuitCode] ?? []).map((a) => [a.transitionKey, a])
  )
  const empty = (from: string, to: string): SegmentTimingAggregate => ({
    circuitCode,
    fromCode: from,
    toCode: to,
    label: formatTransitionLabel(from, to),
    transitionKey: `${from}→${to}`,
    stats: computeStayTimeStats([]),
    durationsMinutes: [],
    minPlate: '',
    maxPlate: '',
    minJourneyId: '',
    maxJourneyId: '',
  })
  if (template.length < 2) return sortAggregates(index.aggregatesByCircuit[circuitCode] ?? [])
  const rows: SegmentTimingAggregate[] = []
  for (let i = 0; i < template.length - 1; i++) {
    const from = template[i]!
    const to = template[i + 1]!
    rows.push(byKey.get(`${from}→${to}`) ?? empty(from, to))
  }
  return rows
}

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

function journeyFrontEventsSorted(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode)).sort(compareRealEvents)
}

/** Balanza egreso Ric suele ser cámara trasera; se incluye solo para rollups de descarga KPI. */
const DISCHARGE_ROLLUP_ALLOWED_REAR_DEVICES = new Set([
  'ricb1egreso',
  'ricb2egreso',
  'ricb3egreso',
])

function journeyEventsForDischargeRollup(j: ReconstructedRealJourney) {
  return j.events
    .filter((e) => {
      if (!isEtlRearCameraDevice(e.deviceCode)) return true
      return DISCHARGE_ROLLUP_ALLOWED_REAR_DEVICES.has(String(e.deviceCode ?? '').trim().toLowerCase())
    })
    .sort(compareRealEvents)
}

function collapsedLogicalPointsForDischargeRollup(j: ReconstructedRealJourney): CollapsedLogicalPoint[] {
  const events = journeyEventsForDischargeRollup(j)
  const out: CollapsedLogicalPoint[] = []
  for (const e of events) {
    const code = normalizeRealEventPoint(e).logicalCode
    if (isExcludedLogicalCode(code)) continue
    const last = out[out.length - 1]
    if (last?.code === code) continue
    out.push({ code, occurredAt: eventOperationalInstantForTimeline(e) })
  }
  return out
}

function minutesBetweenIso(isoA: string, isoB: string): number {
  const a = parseTimestampMs(isoA)
  const b = parseTimestampMs(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN
  return (b - a) / 60000
}

function isExcludedLogicalCode(code: string): boolean {
  if (!code) return true
  if (code.includes('TRASERA')) return true
  return false
}

export function logicalPointLabel(code: string): string {
  return LOGICAL_LABEL_ES[code] ?? code.toLowerCase().replace(/_/g, ' ')
}

export function formatTransitionLabel(fromCode: string, toCode: string): string {
  if (
    fromCode === SL_BALANZA_ROLLUP_TRANSITION.from &&
    toCode === SL_BALANZA_ROLLUP_TRANSITION.to
  ) {
    return 'balanza de entrada → egreso'
  }
  return `${logicalPointLabel(fromCode)} → ${logicalPointLabel(toCode)}`
}

export function transitionSortKey(fromCode: string, toCode: string): number {
  const fromIdx = LOGICAL_TRANSITION_ORDER.indexOf(fromCode)
  const toIdx = LOGICAL_TRANSITION_ORDER.indexOf(toCode)
  const fi = fromIdx >= 0 ? fromIdx : 999
  const ti = toIdx >= 0 ? toIdx : 999
  return fi * 1000 + ti
}

function isSlKpiTransition(fromCode?: string, toCode?: string): boolean {
  return Boolean(
    fromCode?.startsWith('SL_') || toCode?.startsWith('SL_')
  )
}

function isBalanzaStayKpiTransition(fromCode?: string, toCode?: string): boolean {
  return (
    fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
    toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
}

export function isValidSegmentDuration(
  minutes: number,
  fromCode?: string,
  toCode?: string
): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false
  if (
    fromCode &&
    toCode &&
    isBalanzaStayKpiTransition(fromCode, toCode) &&
    minutes < BALANZA_STAY_MIN_MINUTES
  ) {
    return false
  }
  if (
    fromCode &&
    toCode &&
    isSlKpiTransition(fromCode, toCode) &&
    minutes <= MIN_SEGMENT_DURATION_MINUTES
  ) {
    return false
  }
  const max =
    fromCode && toCode ?
      maxAllowedMinutesForTransition(fromCode, toCode)
    : INFERRED_KPI_ROLLUP_MAX_MINUTES
  return minutes <= max
}

/** Validación KPI por circuito (Volcable 1/2 más permisivo). */
export function isValidKpiLegDuration(
  minutes: number,
  executiveCircuitCode: string,
  fromCode: string,
  toCode: string
): boolean {
  if (!isVolcableReceiptCircuit(executiveCircuitCode)) {
    return isValidSegmentDuration(minutes, fromCode, toCode)
  }
  if (!Number.isFinite(minutes) || minutes < 1) return false
  if (isBalanzaStayKpiTransition(fromCode, toCode)) {
    if (minutes > INFERRED_KPI_ROLLUP_MAX_MINUTES) return false
    return minutes >= VOLCABLE_RECEIPT_BALANZA_STAY_MIN_MINUTES
  }
  const shortMax = maxAllowedMinutesForTransition(fromCode, toCode)
  const max =
    shortMax <= VOLCABLE_BALANZA_EGRESO_MAX_MINUTES + 1 ?
      shortMax
    : VOLCABLE_RECEIPT_KPI_MAX_MINUTES
  return minutes <= max
}

type CollapsedLogicalPoint = { code: string; occurredAt: string }

export type TimedLogicalPoint = CollapsedLogicalPoint

function collapseTimedPoints(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  const out: TimedLogicalPoint[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last?.code === p.code) continue
    out.push(p)
  }
  return out
}

import {
  ensureArgentinaOffsetIso,
  formatArgentinaIsoFromMs,
  normalizeTimestampForExport,
  parseTimestampMs,
} from './etlTimestampNormalize'

function isoLocalFromMs(ms: number): string {
  return formatArgentinaIsoFromMs(ms)
}

function inferMidpointBetweenMs(fromMs: number, toMs: number, minOffsetMs = 60_000, maxOffsetMs = 30 * 60_000): string {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return ''
  const span = toMs - fromMs
  const offsetMs = Math.min(Math.max(Math.floor(span / 2), minOffsetMs), maxOffsetMs)
  return isoLocalFromMs(fromMs + offsetMs)
}

export type TimedSegmentInput = {
  segment_from: string
  segment_to: string
  segment_start_time: string
  segment_end_time: string
}

function segmentTimeBounds(seg: TimedSegmentInput): { startMs: number; endMs: number } | null {
  const startMs = parseTimestampMs(String(seg.segment_start_time ?? ''))
  const endMs = parseTimestampMs(String(seg.segment_end_time ?? ''))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { startMs, endMs: Math.max(startMs, endMs) }
}

function scoreOperationalTimeSpan(
  minMs: number,
  maxMs: number,
  externalIngresoAt?: string,
  externalSalidaAt?: string
): number {
  const spanMin = (maxMs - minMs) / 60000
  let score = 0
  if (spanMin > INFERRED_KPI_ROLLUP_MAX_MINUTES) score -= 10_000
  const ingMs = parseTimestampMs(String(externalIngresoAt ?? ''))
  const salMs = parseTimestampMs(String(externalSalidaAt ?? ''))
  if (Number.isFinite(ingMs) && Number.isFinite(salMs)) {
    if (maxMs >= ingMs && minMs <= salMs) score += 1000
    score -= Math.abs((minMs + maxMs) / 2 - (ingMs + salMs) / 2) / 60000
  } else if (Number.isFinite(salMs)) {
    score -= Math.abs(maxMs - salMs) / 60000
  } else if (Number.isFinite(ingMs)) {
    score -= Math.abs(minMs - ingMs) / 60000
  }
  return score
}

/**
 * Separa tramos de viajes distintos (misma patente, >6 h de brecha) y conserva el cluster
 * que mejor coincide con ingreso/salida Excel.
 */
export function selectCoherentSegmentGroup(
  segments: TimedSegmentInput[],
  externalIngresoAt?: string,
  externalSalidaAt?: string,
  gapMaxMinutes = OPERATIONAL_TRIP_GAP_MAX_MINUTES
): TimedSegmentInput[] {
  if (segments.length <= 1) return segments

  const ingMs = parseTimestampMs(String(externalIngresoAt ?? ''))
  let scoped = segments
  if (Number.isFinite(ingMs)) {
    const cutoffMs = ingMs - 30 * 60_000
    const afterIngreso = segments.filter((seg) => {
      const bounds = segmentTimeBounds(seg)
      if (!bounds) return true
      return bounds.endMs >= cutoffMs
    })
    if (afterIngreso.length) scoped = afterIngreso
  }

  const withBounds = scoped
    .map((seg) => ({ seg, bounds: segmentTimeBounds(seg) }))
    .filter(
      (x): x is { seg: TimedSegmentInput; bounds: { startMs: number; endMs: number } } =>
        x.bounds !== null
    )
    .sort((a, b) => a.bounds.startMs - b.bounds.startMs)

  if (!withBounds.length) return segments

  const gapMs = gapMaxMinutes * 60000
  const clusters: Array<typeof withBounds> = [[withBounds[0]!]]
  for (let i = 1; i < withBounds.length; i++) {
    const item = withBounds[i]!
    const cluster = clusters[clusters.length - 1]!
    const prev = cluster[cluster.length - 1]!
    if (item.bounds.startMs - prev.bounds.endMs > gapMs) {
      clusters.push([item])
    } else {
      cluster.push(item)
    }
  }

  if (clusters.length === 1) return clusters[0]!.map((x) => x.seg)

  let bestCluster = clusters[0]!
  let bestScore = -Infinity
  for (const cluster of clusters) {
    const minS = Math.min(...cluster.map((x) => x.bounds.startMs))
    const maxE = Math.max(...cluster.map((x) => x.bounds.endMs))
    const score = scoreOperationalTimeSpan(minS, maxE, externalIngresoAt, externalSalidaAt)
    if (score > bestScore) {
      bestScore = score
      bestCluster = cluster
    }
  }
  return bestCluster.map((x) => x.seg)
}

/** Timeline lógico desde tramos con timestamps (merge Excel-first / fragmentado). */
export function buildTimedLogicalTimelineFromSegments(
  segments: TimedSegmentInput[],
  opts?: { externalIngresoAt?: string; externalSalidaAt?: string }
): TimedLogicalPoint[] {
  const coherent = selectCoherentSegmentGroup(
    segments,
    opts?.externalIngresoAt,
    opts?.externalSalidaAt
  )
  const pointTimes = new Map<string, string>()
  for (const seg of coherent) {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    const start = String(seg.segment_start_time ?? '').trim()
    const end = String(seg.segment_end_time ?? '').trim()
    if (from && start && Number.isFinite(parseTimestampMs(start))) {
      const prev = pointTimes.get(from)
      const startMs = parseTimestampMs(start)
      const prevMs = prev ? parseTimestampMs(prev) : Number.NaN
      if (!prev || (Number.isFinite(prevMs) && startMs < prevMs)) pointTimes.set(from, start)
    }
    if (to && end && Number.isFinite(parseTimestampMs(end))) {
      const prev = pointTimes.get(to)
      const endMs = parseTimestampMs(end)
      const prevMs = prev ? parseTimestampMs(prev) : Number.NaN
      if (!prev || (Number.isFinite(prevMs) && endMs > prevMs)) pointTimes.set(to, end)
    }
  }
  return collapseTimedPoints(
    [...pointTimes.entries()]
      .map(([code, occurredAt]) => ({ code, occurredAt }))
      .sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

/** Quita egresos SL de journeys fragmentados anteriores a balanza salida/ingreso. */
function sanitizeMisplacedSlEgreso(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  const salidaMs = points
    .filter((p) => p.code === 'SL_BALANZA_SALIDA')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const balInMs = points
    .filter((p) => p.code === 'SL_BALANZA_INGRESO')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const cutoffMs =
    Number.isFinite(salidaMs) ? salidaMs : Number.isFinite(balInMs) ? balInMs : Number.NaN
  if (!Number.isFinite(cutoffMs)) return points

  return points.filter((p) => {
    if (p.code !== 'SL_EGRESO') return true
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms >= cutoffMs
  })
}

function latestSlPointMs(points: TimedLogicalPoint[], codes: readonly string[]): number {
  let max = Number.NaN
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = parseTimestampMs(p.occurredAt)
    if (Number.isFinite(ms) && (!Number.isFinite(max) || ms > max)) max = ms
  }
  return max
}

function earliestSlPointMsAfter(points: TimedLogicalPoint[], codes: readonly string[], afterMs: number): number {
  let min = Number.POSITIVE_INFINITY
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = parseTimestampMs(p.occurredAt)
    if (Number.isFinite(ms) && ms > afterMs && ms < min) min = ms
  }
  return Number.isFinite(min) ? min : Number.NaN
}

/** Excel-first: salida = egreso SL cuando falta cámara S7 o el egreso fragmentado es inválido. */
export function enrichSlTimelineWithExcelSalida(
  points: TimedLogicalPoint[],
  externalSalidaAt: string | undefined
): TimedLogicalPoint[] {
  const salida = String(externalSalidaAt ?? '').trim()
  if (!salida || !Number.isFinite(parseTimestampMs(salida))) return points
  if (resolveSlSalidaEgresoEndpoints(points)) return points

  const salidaMs = parseTimestampMs(salida)
  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_SALIDA', 'SL_BALANZA_INGRESO', 'SL_INGRESO'])
  const hasEgresoAfterAnchor = points.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && Number.isFinite(anchorMs) && ms > anchorMs
  })
  if (Number.isFinite(anchorMs) && salidaMs <= anchorMs && hasEgresoAfterAnchor) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_EGRESO', occurredAt: salida }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

function normalizeSlExcelAnchors(anchors?: string | SlExcelTimelineAnchors): SlExcelTimelineAnchors {
  if (typeof anchors === 'string') return { externalSalidaAt: anchors }
  return anchors ?? {}
}

function injectSlIngresoFromExcel(
  points: TimedLogicalPoint[],
  externalIngresoAt?: string,
  executiveCircuitCode?: string,
  plantaNormalized?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_INGRESO')) return points
  if (!shouldUseExcelCaladoAsSlDescarga(executiveCircuitCode, plantaNormalized)) return points
  const ingreso = String(externalIngresoAt ?? '').trim()
  if (!ingreso || !Number.isFinite(parseTimestampMs(ingreso))) return points
  const hasSlContext = points.some((p) => p.code.startsWith('SL_'))
  if (!hasSlContext) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_INGRESO', occurredAt: ingreso }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** @deprecated No usar ingreso Excel como hora de balanza S1 (causa tiempos > 3 h). */
function injectSlBalanzaIngresoFromExcel(
  points: TimedLogicalPoint[],
  externalIngresoAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_INGRESO')) return points
  const ingreso = String(externalIngresoAt ?? '').trim()
  if (!ingreso || !Number.isFinite(parseTimestampMs(ingreso))) return points
  const ingresoMs = latestSlPointMs(points, ['SL_INGRESO'])
  const atMs = parseTimestampMs(ingreso)
  if (Number.isFinite(ingresoMs) && atMs < ingresoMs) return points
  const hasSlContext =
    points.some((p) => p.code.startsWith('SL_')) || Number.isFinite(ingresoMs)
  if (!hasSlContext) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_INGRESO', occurredAt: ingreso }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Excel calado en SL1 / San Lorenzo: hora de descarga (zona sin cámara). */
function injectSlDescargaFromExcel(
  points: TimedLogicalPoint[],
  externalCaladoAt?: string,
  useAsDescarga?: boolean
): TimedLogicalPoint[] {
  if (!useAsDescarga) return points
  if (points.some((p) => p.code === 'SL_DESCARGA')) return points
  const calado = String(externalCaladoAt ?? '').trim()
  if (!calado || !Number.isFinite(parseTimestampMs(calado))) return points
  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO', 'SL_INGRESO'])
  const calMs = parseTimestampMs(calado)
  if (Number.isFinite(anchorMs) && calMs <= anchorMs) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_DESCARGA', occurredAt: calado }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/**
 * Timeline SL: cámaras Truckflow + anclas Excel (salida → egreso).
 * El inicio del tramo balanza usa solo cámara S1 o tránsito corto desde S0 Truckflow.
 */
export function injectSlBalanzaFromTiemposEntrePasos(
  points: TimedLogicalPoint[],
  entradaAt?: string,
  salidaAt?: string,
  opts?: { replaceCamera?: boolean }
): TimedLogicalPoint[] {
  const entrada = String(entradaAt ?? '').trim()
  const salida = String(salidaAt ?? '').trim()
  if (!opts?.replaceCamera || (!entrada && !salida)) return points
  let filtered = points.filter(
    (p) => p.code !== 'SL_BALANZA_INGRESO' && p.code !== 'SL_BALANZA_SALIDA'
  )
  const additions: TimedLogicalPoint[] = []
  if (entrada && Number.isFinite(parseTimestampMs(entrada))) {
    additions.push({
      code: 'SL_BALANZA_INGRESO',
      occurredAt: ensureArgentinaOffsetIso(entrada),
    })
  }
  if (salida && Number.isFinite(parseTimestampMs(salida))) {
    additions.push({
      code: 'SL_BALANZA_SALIDA',
      occurredAt: ensureArgentinaOffsetIso(salida),
    })
  }
  if (!additions.length) return points
  return collapseTimedPoints(
    [...filtered, ...additions].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

export function buildSlBalanzaComiteOptionsFromTiemposEntrePasos(input: {
  executiveCircuitCode: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosMatch?: string
  truckflowCircuitCodes?: string
  platformNormalized?: string
  plantaNormalized?: string
}): SlBalanzaComiteOptions | undefined {
  const circuit = normalizeExecutiveCircuitForKpi(String(input.executiveCircuitCode ?? '').trim())
  if (circuit !== 'R7') return undefined
  const apply = shouldApplyTiemposEntrePasosBalanzaOverride({
    external_sl_balanza_entrada_at: input.externalSlBalanzaEntradaAt,
    tiempos_entre_pasos_match: input.tiemposEntrePasosMatch,
    truckflow_circuit_codes: input.truckflowCircuitCodes,
    platform_normalized: input.platformNormalized,
    planta_normalized: input.plantaNormalized,
  })
  if (!apply) return undefined
  const entrada = String(input.externalSlBalanzaEntradaAt ?? '').trim()
  if (!entrada) return undefined
  return {
    ...SL_BALANZA_COMITE_PRODUCT_OPTIONS,
    useTiemposEntrePasosBalanza: true,
    tiemposEntrePasosEntradaAt: entrada,
    tiemposEntrePasosSalidaAt: String(input.externalSlBalanzaSalidaAt ?? '').trim() || undefined,
  }
}

/**
 * Timeline SL: cámaras Truckflow + anclas Excel (salida → egreso).
 * El inicio del tramo balanza usa solo cámara S1 o tránsito corto desde S0 Truckflow.
 */
export function enrichSlTimelineWithExcelAnchors(
  points: TimedLogicalPoint[],
  anchors?: string | SlExcelTimelineAnchors
): TimedLogicalPoint[] {
  const opts = normalizeSlExcelAnchors(anchors)

  let enriched = sanitizeMisplacedSlEgreso(points)
  if (
    opts.tiemposEntrePasosOverride &&
    normalizeExecutiveCircuitForKpi(String(opts.executiveCircuitCode ?? '')) === 'R7'
  ) {
    enriched = injectSlBalanzaFromTiemposEntrePasos(
      enriched,
      opts.externalSlBalanzaEntradaAt,
      opts.externalSlBalanzaSalidaAt,
      { replaceCamera: true }
    )
  }
  enriched = injectSlIngresoFromExcel(
    enriched,
    opts.externalIngresoAt,
    opts.executiveCircuitCode,
    opts.plantaNormalized
  )
  enriched = injectSlDescargaFromExcel(
    enriched,
    opts.externalCaladoAt,
    shouldUseExcelCaladoAsSlDescarga(opts.executiveCircuitCode, opts.plantaNormalized)
  )
  enriched = inferSlDescargaFromTransit(enriched)
  enriched = inferSlBalanzaSalidaFromTransit(enriched, opts.externalSalidaAt)
  enriched = enrichSlTimelineWithExcelSalida(enriched, opts.externalSalidaAt)
  return enriched
}

/** Descarga SL sin cámara: punto intermedio entre balanza ingreso y balanza salida (o egreso). */
function inferSlDescargaFromTransit(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_DESCARGA')) return points
  const balInMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO'])
  if (!Number.isFinite(balInMs)) return points

  const salidaMs = earliestSlPointMsAfter(points, ['SL_BALANZA_SALIDA', 'SL_EGRESO'], balInMs)
  if (!Number.isFinite(salidaMs)) return points

  const descargaAt = inferMidpointBetweenMs(balInMs, salidaMs)
  if (!descargaAt) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_DESCARGA', occurredAt: descargaAt }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Balanza salida SL sin cámara S5: pocos min antes de egreso Excel; cámara S5 tiene prioridad. */
function inferSlBalanzaSalidaFromTransit(
  points: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_SALIDA')) return points

  const salida = String(externalSalidaAt ?? '').trim()
  if (salida && Number.isFinite(parseTimestampMs(salida))) {
    const withExcelProxy = inferSlBalanzaSalidaBeforeExcelSalida(points, externalSalidaAt)
    if (withExcelProxy.some((p) => p.code === 'SL_BALANZA_SALIDA')) return withExcelProxy
  }

  const descargaMs = latestSlPointMs(points, ['SL_DESCARGA'])
  const egresoMs = earliestSlPointMsAfter(points, ['SL_EGRESO'], descargaMs)
  if (Number.isFinite(descargaMs) && Number.isFinite(egresoMs) && egresoMs > descargaMs) {
    const proxyAt =
      inferMidpointBetweenMs(descargaMs, egresoMs, 60_000, SL_SALIDA_EGRESO_MAX_MINUTES * 60_000) ||
      isoLocalFromMs(egresoMs - SL_EXIT_TRANSIT_DEFAULT_MINUTES * 60_000)
    if (proxyAt && parseTimestampMs(proxyAt) > descargaMs) {
      return collapseTimedPoints(
        [...points, { code: 'SL_BALANZA_SALIDA', occurredAt: proxyAt }].sort(
          (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
        )
      )
    }
  }

  return points
}


/** @deprecated S1 se resuelve en resolveSlBalanzaIngresoStartPoint (solo Truckflow). */
function inferSlBalanzaIngresoFromTransit(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  return points
}

/**
 * Solo para rollup balanza salida → egreso SL (~200–300 m).
 * Usa S5 de Truckflow o tránsito corto antes de salida Excel; nunca calado Ricardone.
 */
export function enrichSlTimelineForSalidaEgresoRollup(
  points: TimedLogicalPoint[],
  anchors?: string | SlExcelTimelineAnchors
): TimedLogicalPoint[] {
  return enrichSlTimelineWithExcelAnchors(points, anchors)
}

/** Si falta S5 en Truckflow: balanza salida pocos minutos antes de salida Excel (tránsito corto). */
function inferSlBalanzaSalidaBeforeExcelSalida(
  points: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_SALIDA')) return points
  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (!Number.isFinite(salMs)) return points

  const hasSlAnchor = points.some((p) =>
    ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_DESCARGA'].includes(p.code)
  )
  if (!hasSlAnchor) return points

  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO', 'SL_INGRESO', 'SL_DESCARGA'])
  const proxyMs = salMs - SL_EXIT_TRANSIT_DEFAULT_MINUTES * 60_000
  if (Number.isFinite(anchorMs) && proxyMs <= anchorMs) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_SALIDA', occurredAt: isoLocalFromMs(proxyMs) }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

function resolveSlSalidaEgresoEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_SALIDA_EGRESO_ROLLUP_TRANSITION
  const salidaPoints = points.filter((p) => p.code === fromCode)
  if (!salidaPoints.length) return null

  const salidaPt = salidaPoints.reduce((latest, p) =>
    parseTimestampMs(p.occurredAt) >= parseTimestampMs(latest.occurredAt) ? p : latest
  )
  const salidaMs = parseTimestampMs(salidaPt.occurredAt)
  if (!Number.isFinite(salidaMs)) return null

  const egresoCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms > salidaMs
  })
  if (!egresoCandidates.length) return null

  const egresoPt = egresoCandidates.reduce((latest, p) =>
    parseTimestampMs(p.occurredAt) >= parseTimestampMs(latest.occurredAt) ? p : latest
  )
  return { from: salidaPt, to: egresoPt }
}

function resolveSlIngresoBalancaEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_INGRESO_BALANZA_ROLLUP_TRANSITION
  const ingresoPt = points.find((p) => p.code === fromCode)
  if (!ingresoPt) return null
  const ingresoMs = parseTimestampMs(ingresoPt.occurredAt)
  if (!Number.isFinite(ingresoMs)) return null

  const balInCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms > ingresoMs
  })
  if (balInCandidates.length) {
    const toPt = balInCandidates.reduce((earliest, p) =>
      parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
    )
    return { from: ingresoPt, to: toPt }
  }

  return null
}

export function extractSlIngresoBalancaRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: toCode } = SL_INGRESO_BALANZA_ROLLUP_TRANSITION
  const endpoints = resolveSlIngresoBalancaEndpoints(points)
  if (!endpoints) return null
  const durationMinutes = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, fromCode, toCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode,
    durationMinutes,
  }
}

function resolveTrustedSlBalanzaIngresoFromSegments(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  let bestMs = Number.POSITIVE_INFINITY
  let bestIso = ''
  for (const seg of truckflowSegments) {
    const hitIso = slBalanzaIngresoHitIsoFromSegment(seg)
    if (!hitIso) continue
    const hitMs = parseTimestampMs(hitIso)
    if (Number.isFinite(hitMs) && hitMs < bestMs) {
      bestMs = hitMs
      bestIso = hitIso
    }
  }
  if (bestIso) {
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(bestIso) }
  }
  if (!truckflowSegments.length) {
    const cam = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
    if (!cam) return null
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(cam.occurredAt) }
  }
  return null
}

function earliestSlIngresoMsForComite(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): number | null {
  let minMs = Number.POSITIVE_INFINITY
  for (const seg of truckflowSegments) {
    const from = String(seg.segment_from ?? '').trim()
    if (from !== 'SL_INGRESO') continue
    const start = String(seg.segment_start_time ?? '').trim()
    const ms = parseTimestampMs(start)
    if (Number.isFinite(ms) && ms < minMs) minMs = ms
  }
  if (Number.isFinite(minMs) && minMs < Number.POSITIVE_INFINITY) return minMs
  const pt = earliestSlPoint(truckflowPoints, 'SL_INGRESO')
  if (!pt) return null
  const ms = parseTimestampMs(pt.occurredAt)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Inicio del tramo balanza ingreso → egreso (R7): la cámara SLZBalIngFte (SL_BALANZA_INGRESO)
 * es la fuente de verdad. Nunca se inyecta desde Excel, así que se confía siempre que exista
 * en el timeline. El guarda anti-Excel (shouldRejectSlBalanzaScatterForExcelIngreso) sigue
 * rechazando inicios anclados al ingreso Excel de Ricardone.
 */
function resolveTrustedSlBalanzaIngresoForComite(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  _enrichedTimeline?: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const cam = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
  if (cam) {
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(cam.occurredAt) }
  }
  return resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
}

export function buildSlComiteTruckflowContext(input: {
  segments: TimedSegmentInput[]
  externalIngresoAt?: string
  externalSalidaAt?: string
  externalCaladoAt?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
  plantaNormalized?: string
  executiveCircuitCode: string
}): {
  opSegments: TimedSegmentInput[]
  truckflowPoints: TimedLogicalPoint[]
  enrichedPoints: TimedLogicalPoint[]
} {
  const circuit = normalizeExecutiveCircuitForKpi(String(input.executiveCircuitCode ?? '').trim())
  const useAllSlSegments = CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(circuit)
  const coherent = useAllSlSegments
    ? input.segments
    : selectCoherentSegmentGroup(
        input.segments,
        input.externalIngresoAt,
        input.externalSalidaAt
      )
  const opSegments = segmentsForSlBalanzaKpiHorarios(coherent)
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(opSegments)
  const enrichedPoints = enrichSlTimelineWithExcelAnchors(truckflowPoints, {
    externalIngresoAt: input.externalIngresoAt,
    externalCaladoAt: input.externalCaladoAt,
    externalSalidaAt: input.externalSalidaAt,
    externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
    externalSlBalanzaSalidaAt: input.externalSlBalanzaSalidaAt,
    tiemposEntrePasosOverride: input.tiemposEntrePasosOverride,
    plantaNormalized: input.plantaNormalized,
    executiveCircuitCode: input.executiveCircuitCode,
  })
  return { opSegments, truckflowPoints, enrichedPoints }
}

function truckflowPointsWithoutUntrustedBalanzaIngreso(
  truckflowPoints: TimedLogicalPoint[],
  truckflowSegments: TimedSegmentInput[]
): TimedLogicalPoint[] {
  if (!truckflowSegments.length) return truckflowPoints
  const trusted = resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
  if (trusted) return truckflowPoints
  return truckflowPoints.filter((p) => p.code !== 'SL_BALANZA_INGRESO')
}

/** Inicio S1 para rollup: cámara confiable en segmento dedicado; nunca rollup/unified ni ingreso+15 min fijo. */
function resolveSlBalanzaIngresoForRollup(
  truckflowPoints: TimedLogicalPoint[],
  truckflowSegments: TimedSegmentInput[],
  _enrichedPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  return resolveSlBalanzaIngresoCameraStart(truckflowSegments, truckflowPoints)
}

/** Inicio S1 solo con evidencia Truckflow (segmento o punto); sin proxy desde S0/Excel. */
export function resolveSlBalanzaIngresoCameraStart(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const fromSegments = resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
  if (fromSegments) return fromSegments

  if (truckflowSegments.length === 1) {
    const seg = truckflowSegments[0]
    if (!seg) return null
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') {
      const start = String(seg.segment_start_time ?? '').trim()
      if (Number.isFinite(parseTimestampMs(start))) {
        return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(start) }
      }
    }
  }

  if (!truckflowPoints.some((p) => p.code === 'SL_BALANZA_INGRESO')) return null
  return resolveTrustedSlBalanzaIngresoForComite(truckflowSegments, truckflowPoints)
}

function slBalanzaIngresoHitIsoFromSegment(seg: TimedSegmentInput): string | null {
  const from = String(seg.segment_from ?? '').trim()
  const to = String(seg.segment_to ?? '').trim()
  // Rollup unificado: el inicio suele venir de Excel/inferencia, no de cámara S1.
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_EGRESO') return null
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_INGRESO') return null
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') {
    const start = String(seg.segment_start_time ?? '').trim()
    return start && Number.isFinite(parseTimestampMs(start)) ? start : null
  }
  if (to !== 'SL_BALANZA_INGRESO') return null
  const end = String(seg.segment_end_time ?? '').trim()
  if (end && Number.isFinite(parseTimestampMs(end))) return end
  const start = String(seg.segment_start_time ?? '').trim()
  return start && Number.isFinite(parseTimestampMs(start)) ? start : null
}

function slBalanzaIngresoHitMsFromSegment(seg: TimedSegmentInput): number | null {
  const iso = slBalanzaIngresoHitIsoFromSegment(seg)
  if (!iso) return null
  const ms = parseTimestampMs(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Cámara S1 confiable: segmento dedicado (S0→S1 o S1→S5), no rollup unificado ni self-loop. */
export function isTrustedSlBalanzaIngresoCamera(
  segments: TimedSegmentInput[],
  candidate: TimedLogicalPoint | null
): boolean {
  if (!candidate || candidate.code !== 'SL_BALANZA_INGRESO') return false
  const candidateMs = parseTimestampMs(candidate.occurredAt)
  if (!Number.isFinite(candidateMs)) return false
  for (const seg of segments) {
    const hitMs = slBalanzaIngresoHitMsFromSegment(seg)
    if (hitMs !== null && Math.abs(hitMs - candidateMs) <= 120_000) return true
  }
  return false
}

export function segmentsForSlTruckflowTimeline(
  segments: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
) {
  const hasOtherEvidence = segments.some((s) => {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    return !(
      from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to
    )
  })
  if (!hasOtherEvidence) return segments
  return segments.filter((s) => {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    return !(
      from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to
    )
  })
}

/**
 * Segmentos permitidos para fijar horarios KPI balanza ingreso → egreso (solo Truckflow).
 * Excluye rollups que anclan SL_EGRESO a salida Excel (p. ej. SL_INGRESO→SL_EGRESO).
 */
export function segmentsForSlBalanzaKpiHorarios(segments: TimedSegmentInput[]): TimedSegmentInput[] {
  const base = segmentsForSlTruckflowTimeline(segments)
  return base.filter((seg) => {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to) {
      return false
    }
    if (from === 'SL_INGRESO' && to === 'SL_EGRESO') return false
    return true
  })
}

function isTrustedSlEgresoCameraSegment(from: string, to: string): boolean {
  if (to !== 'SL_EGRESO') return false
  if (from === 'SL_BALANZA_INGRESO' || from === 'SL_INGRESO') return false
  return true
}

/**
 * Fin tramo balanza→egreso: última hora SL_EGRESO en segmento cámara Truckflow;
 * si no hay lectura, `external_salida_at` (Excel).
 */
export function resolveSlBalanzaEgresoHorarioForKpi(
  segments: TimedSegmentInput[],
  afterMs: number,
  externalSalidaAt: string,
  truckflowPointsFallback?: TimedLogicalPoint[]
): { endIso: string; fin_fuente: SlScatterHorarioFinFuente } | null {
  const horarioSegments = segmentsForSlBalanzaKpiHorarios(segments)
  let bestMs = Number.NaN
  let bestIso = ''
  for (const seg of horarioSegments) {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (!isTrustedSlEgresoCameraSegment(from, to)) continue
    const end = String(seg.segment_end_time ?? '').trim()
    const ms = parseTimestampMs(end)
    if (!Number.isFinite(ms) || ms <= afterMs) continue
    if (!Number.isFinite(bestMs) || ms > bestMs) {
      bestMs = ms
      bestIso = end
    }
  }
  if (bestIso) {
    return { endIso: normalizeTimestampForExport(bestIso), fin_fuente: 'truckflow' }
  }

  const points =
    horarioSegments.length > 0 ?
      buildTimedLogicalTimelineFromSegments(horarioSegments)
    : (truckflowPointsFallback ?? [])
  const camera = latestSlEgresoCameraAfterMs(points, afterMs)
  if (camera) {
    const camMs = parseTimestampMs(camera.occurredAt)
    if (Number.isFinite(camMs) && camMs > afterMs) {
      return {
        endIso: normalizeTimestampForExport(camera.occurredAt),
        fin_fuente: 'truckflow',
      }
    }
  }

  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (Number.isFinite(salMs) && salMs > afterMs) {
    return { endIso: normalizeTimestampForExport(salida), fin_fuente: 'excel_salida' }
  }
  return null
}

function earliestSlPoint(
  points: TimedLogicalPoint[],
  code: string
): TimedLogicalPoint | null {
  const candidates = points.filter((p) => p.code === code)
  if (!candidates.length) return null
  return candidates.reduce((earliest, p) =>
    parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
  )
}

/** Inicio S1: cámara Truckflow; nunca ingreso Excel Ricardone ni hora de ingreso puerto como balanza. */
export function resolveSlBalanzaIngresoStartPoint(
  truckflowPoints: TimedLogicalPoint[],
  enrichedPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const fromCamera = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
  if (fromCamera) return fromCamera

  const slIngresoCam = earliestSlPoint(truckflowPoints, 'SL_INGRESO')
  if (!slIngresoCam) return null

  const ingresoMs = parseTimestampMs(slIngresoCam.occurredAt)
  if (!Number.isFinite(ingresoMs)) return null

  const nextMs = earliestSlPointMsAfter(
    enrichedPoints,
    ['SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'],
    ingresoMs
  )
  if (!Number.isFinite(nextMs)) return null

  const gapMin = (nextMs - ingresoMs) / 60_000
  if (gapMin <= 0) return null

  let proxyMs: number
  if (gapMin <= SL_INGRESO_TO_BALANZA_MAX_MINUTES) {
    const mid = inferMidpointBetweenMs(ingresoMs, nextMs)
    proxyMs = mid ? parseTimestampMs(mid) : ingresoMs + SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES * 60_000
  } else {
    proxyMs = ingresoMs + Math.floor((nextMs - ingresoMs) / 2)
    if (proxyMs <= ingresoMs || proxyMs >= nextMs) return null
  }

  return { code: 'SL_BALANZA_INGRESO', occurredAt: formatArgentinaIsoFromMs(proxyMs) }
}

function finalizeSlBalanzaToEgresoEndpoints(
  from: TimedLogicalPoint,
  to: TimedLogicalPoint,
  minFromMs?: number
): { from: TimedLogicalPoint; to: TimedLogicalPoint } {
  let fromMs = parseTimestampMs(from.occurredAt)
  const toMs = parseTimestampMs(to.occurredAt)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return { from, to }
  }
  if (Number.isFinite(minFromMs)) fromMs = Math.max(fromMs, minFromMs!)
  if (fromMs >= toMs) return { from, to }
  return {
    from: { ...from, occurredAt: formatArgentinaIsoFromMs(fromMs) },
    to,
  }
}

export type SlScatterHorarioInicioFuente = 'truckflow' | 'balanza_ingreso_inferido' | 'tiempos_entre_pasos'
export type SlScatterHorarioFinFuente = 'truckflow' | 'excel_salida' | 'tiempos_entre_pasos'
export type SlScatterHorarioFuente =
  | 'truckflow'
  | 'excel_salida'
  | 'balanza_ingreso_inferido'
  | 'mixto'
  | 'excel_inferido'
  | 'tiempos_entre_pasos'

export function compositeSlScatterHorarioFuente(
  inicio: SlScatterHorarioInicioFuente,
  fin: SlScatterHorarioFinFuente
): SlScatterHorarioFuente {
  if (inicio === 'truckflow' && fin === 'truckflow') return 'truckflow'
  if (inicio === 'tiempos_entre_pasos' && fin === 'tiempos_entre_pasos') return 'tiempos_entre_pasos'
  if (inicio === 'balanza_ingreso_inferido' && fin === 'excel_salida') return 'mixto'
  if (inicio === 'truckflow' && fin === 'excel_salida') return 'excel_salida'
  if (inicio === 'balanza_ingreso_inferido' && fin === 'truckflow') return 'balanza_ingreso_inferido'
  return 'mixto'
}

/** Inicio S1 tomado del ingreso Excel Ric (no cámara S1); no usar como hora de balanza. */
export function isSlBalanzaIngresoAnchoredOnExcelIngreso(
  balanzaIngresoAt: string,
  externalIngresoAt?: string
): boolean {
  const ing = String(externalIngresoAt ?? '').trim()
  const at = String(balanzaIngresoAt ?? '').trim()
  if (!ing || !at) return false
  const a = parseTimestampMs(at)
  const b = parseTimestampMs(ing)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 60_000
}

/** Scatter/CSV comité: nunca ingreso Excel Ric como hora de balanza S1. */
export function shouldRejectSlBalanzaScatterForExcelIngreso(
  _durationMin: number,
  balanzaIngresoAt: string,
  externalIngresoAt?: string
): boolean {
  return isSlBalanzaIngresoAnchoredOnExcelIngreso(balanzaIngresoAt, externalIngresoAt)
}

/** Cámara S1 en tramo dedicado balanza ingreso → balanza salida (no rollup unificado). */
export function hasDedicatedSlBalanzaIngresoCameraSegment(segments: TimedSegmentInput[]): boolean {
  return segments.some((seg) => {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from !== 'SL_BALANZA_INGRESO' || to !== 'SL_BALANZA_SALIDA') return false
    return Number.isFinite(parseTimestampMs(String(seg.segment_start_time ?? '')))
  })
}

export type SlBalanzaEgresoComiteScatterPayload = {
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  horario_fuente: SlScatterHorarioFuente
  horario_fuente_inicio: SlScatterHorarioInicioFuente
  horario_fuente_fin: SlScatterHorarioFinFuente
}

export type SlBalanzaComiteRejectReason =
  | 'ok'
  | 'sin_salida_excel'
  | 'sin_inicio_balanza'
  | 'inicio_anchored_excel_ric'
  | 'inicio_antes_ingreso_sl'
  | 'fin_no_posterior'
  | 'duracion_corta'
  | 'duracion_excede_180'

export type SlBalanzaComiteEvaluation = {
  payload: SlBalanzaEgresoComiteScatterPayload | null
  reason: SlBalanzaComiteRejectReason
  durationMin?: number
}

/**
 * Corrección legacy descarga SL (−120 min a la duración si bruta ≥ 150 min).
 * No altera `segment_start_time`: S1 balanza ingreso = cámara Truckflow.
 */
export const SL_DESCARGA_TIME_CORRECTION_MINUTES = 120

/** Duración bruta mínima para aplicar corrección de planta (evita restar 2 h en estadías cortas reales). */
export const SL_DESCARGA_PLANT_OFFSET_RAW_MINUTES = 150

export function resolveSlBalanzaDescargaPlantOffsetMinutes(rawDurationMinutes: number): number {
  if (
    !Number.isFinite(rawDurationMinutes) ||
    rawDurationMinutes < SL_DESCARGA_PLANT_OFFSET_RAW_MINUTES
  ) {
    return 0
  }
  return SL_DESCARGA_TIME_CORRECTION_MINUTES
}

/** Alias histórico (comité / producto). */
export const SL_BALANZA_TIME_CORRECTION_MINUTES = SL_DESCARGA_TIME_CORRECTION_MINUTES

export function correctSlBalanzaDescargaStayTiming(
  startIso: string,
  endIso: string,
  options?: { extraCorrectionMinutes?: number; applyPlantOffset?: boolean }
): {
  segment_start_time: string
  segment_end_time: string
  durationMinutes: number
} | null {
  const extraCorrection = Math.max(0, options?.extraCorrectionMinutes ?? 0)
  const applyPlantOffset = options?.applyPlantOffset ?? false
  const rawDur = minutesBetweenIso(startIso, endIso)
  if (!Number.isFinite(rawDur) || rawDur <= 0) return null
  const plantOffset = applyPlantOffset ? resolveSlBalanzaDescargaPlantOffsetMinutes(rawDur) : 0
  const totalCorrection = plantOffset + extraCorrection
  const dur = rawDur - totalCorrection
  if (dur <= 0) return null
  return {
    segment_start_time: normalizeTimestampForExport(startIso),
    segment_end_time: normalizeTimestampForExport(endIso),
    durationMinutes: Math.round(dur * 10) / 10,
  }
}

/** Tope de estadía corregida balanza ingreso → egreso en KPI/scatter Excel-first. */
export const SL_BALANZA_COMITE_MAX_MINUTES = 240

export type SlBalanzaComiteOptions = {
  /** Minutos a restar a la duración (cámaras corridas). Default 0 = sin corrección. */
  correctionMinutes?: number
  /** Si false, no se aplica el tope legacy de 180 min ni el mínimo de tramo. Default true. */
  enforceStayLimit?: boolean
  /** Tope explícito (p. ej. 240 en producto); se evalúa sobre la duración ya corregida. */
  maxStayMinutes?: number
  /** Si true, acepta inicio inferido (rollup/timeline) cuando no hay cámara confiable. Default false. */
  lenientStart?: boolean
  /** Si true, resta corrección legacy de planta (−120 min) a la duración cuando bruta ≥ 150 min.
   * No mueve el inicio S1: el horario de balanza ingreso es siempre cámara Truckflow.
   */
  applyPlantTimeCorrection?: boolean
  /** Horarios balanza SL desde planilla TiemposEntrePasos (override cámara en ventana acordada). */
  useTiemposEntrePasosBalanza?: boolean
  tiemposEntrePasosEntradaAt?: string
  tiemposEntrePasosSalidaAt?: string
}

/** Opciones de producto: inicio S1 solo cámara; duración reloj cámara→fin; tope 240 min. */
export const SL_BALANZA_COMITE_PRODUCT_OPTIONS: SlBalanzaComiteOptions = {
  correctionMinutes: 0,
  maxStayMinutes: SL_BALANZA_COMITE_MAX_MINUTES,
  enforceStayLimit: false,
  lenientStart: false,
  applyPlantTimeCorrection: false,
}

/** Evalúa contrato comité con motivo explícito (embudo / diagnóstico). */
export function evaluateSlBalanzaComitePayload(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt: string,
  externalIngresoAt?: string,
  enrichedTimeline?: TimedLogicalPoint[],
  opts?: SlBalanzaComiteOptions
): SlBalanzaComiteEvaluation {
  const correction = Math.max(0, opts?.correctionMinutes ?? 0)
  const enforceLimit = opts?.enforceStayLimit ?? true

  const salida = String(externalSalidaAt ?? '').trim()
  if (!salida || !Number.isFinite(parseTimestampMs(salida))) {
    return { payload: null, reason: 'sin_salida_excel' }
  }

  const tepEntrada = String(opts?.tiemposEntrePasosEntradaAt ?? '').trim()
  const tepSalida = String(opts?.tiemposEntrePasosSalidaAt ?? '').trim()
  if (opts?.useTiemposEntrePasosBalanza && tepEntrada && Number.isFinite(parseTimestampMs(tepEntrada))) {
    const inicioRaw = normalizeTimestampForExport(tepEntrada)
    const s1Ms = parseTimestampMs(inicioRaw)
    let fin = tepSalida && Number.isFinite(parseTimestampMs(tepSalida)) ? normalizeTimestampForExport(tepSalida) : ''
    let finFuente: SlScatterHorarioFinFuente =
      fin ? 'tiempos_entre_pasos' : 'excel_salida'
    if (!fin) {
      const horarioSegments = segmentsForSlBalanzaKpiHorarios(truckflowSegments)
      const horarioPoints =
        horarioSegments === truckflowSegments ?
          truckflowPoints
        : buildTimedLogicalTimelineFromSegments(horarioSegments)
      const endResolved = resolveSlBalanzaEgresoHorarioForKpi(horarioSegments, s1Ms, salida, horarioPoints)
      if (!endResolved) return { payload: null, reason: 'fin_no_posterior' }
      fin = endResolved.endIso
      finFuente = endResolved.fin_fuente
    }
    const salMs = parseTimestampMs(fin)
    if (!Number.isFinite(salMs) || salMs <= s1Ms) {
      return { payload: null, reason: 'fin_no_posterior' }
    }
    const dur = minutesBetweenIso(inicioRaw, fin)
    const maxStay = opts?.maxStayMinutes
    if (maxStay != null && Number.isFinite(maxStay) && dur > maxStay) {
      return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
    }
    if (dur <= 0) return { payload: null, reason: 'duracion_corta', durationMin: dur }
    return {
      payload: {
        segment_start_time: inicioRaw,
        segment_end_time: fin,
        segment_duration_min: Math.round(dur * 10) / 10,
        horario_fuente_inicio: 'tiempos_entre_pasos',
        horario_fuente_fin: finFuente,
        horario_fuente: compositeSlScatterHorarioFuente('tiempos_entre_pasos', finFuente),
      },
      reason: 'ok',
      durationMin: dur,
    }
  }

  const horarioSegments = segmentsForSlBalanzaKpiHorarios(truckflowSegments)
  const horarioPoints =
    horarioSegments === truckflowSegments ?
      truckflowPoints
    : buildTimedLogicalTimelineFromSegments(horarioSegments)

  const cameraStart = resolveSlBalanzaIngresoCameraStart(horarioSegments, horarioPoints)
  const startIso = cameraStart?.occurredAt ?? null
  if (!startIso) return { payload: null, reason: 'sin_inicio_balanza' }

  if (shouldRejectSlBalanzaScatterForExcelIngreso(0, startIso, externalIngresoAt)) {
    return { payload: null, reason: 'inicio_anchored_excel_ric' }
  }

  const inicioRaw = normalizeTimestampForExport(startIso)
  const s1Ms = parseTimestampMs(inicioRaw)
  if (!Number.isFinite(s1Ms)) {
    return { payload: null, reason: 'fin_no_posterior' }
  }

  const endResolved = resolveSlBalanzaEgresoHorarioForKpi(horarioSegments, s1Ms, salida, horarioPoints)
  if (!endResolved) {
    return { payload: null, reason: 'fin_no_posterior' }
  }
  const fin = endResolved.endIso
  const finFuente = endResolved.fin_fuente
  const salMs = parseTimestampMs(fin)
  if (!Number.isFinite(salMs) || salMs <= s1Ms) {
    return { payload: null, reason: 'fin_no_posterior' }
  }

  const rawDur = minutesBetweenIso(inicioRaw, fin)
  const plantOffset =
    opts?.applyPlantTimeCorrection === true ?
      resolveSlBalanzaDescargaPlantOffsetMinutes(rawDur)
    : 0
  const dur = rawDur - plantOffset - correction
  const fromCode = SL_BALANZA_ROLLUP_TRANSITION.from
  const toCode = SL_BALANZA_ROLLUP_TRANSITION.to

  if (dur <= 0) {
    return { payload: null, reason: 'duracion_corta', durationMin: dur }
  }
  const maxStay = opts?.maxStayMinutes
  if (maxStay != null && Number.isFinite(maxStay) && dur > maxStay) {
    return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
  }
  if (enforceLimit) {
    if (dur > SL_BALANZA_STAY_MAX_MINUTES) {
      return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
    }
    if (!isValidSegmentDuration(dur, fromCode, toCode)) {
      return { payload: null, reason: 'duracion_corta', durationMin: dur }
    }
  }

  const inicioOut = inicioRaw
  const inicioFuente: SlScatterHorarioInicioFuente = 'truckflow'

  return {
    payload: {
      segment_start_time: inicioOut,
      segment_end_time: fin,
      segment_duration_min: Math.round(dur * 10) / 10,
      horario_fuente_inicio: inicioFuente,
      horario_fuente_fin: finFuente,
      horario_fuente: compositeSlScatterHorarioFuente(inicioFuente, finFuente),
    },
    reason: 'ok',
    durationMin: dur,
  }
}

/**
 * Contrato comité balanza ingreso → egreso (gráfica, CSV lentos, KPI fila):
 * S1 cámara/inicio Truckflow, salida Excel. Con opciones de producto incluye a
 * todos, sin tope de 180 y restando la corrección de cámaras.
 */
export function buildSlBalanzaEgresoComiteScatterPayload(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt: string,
  externalIngresoAt?: string,
  enrichedTimeline?: TimedLogicalPoint[],
  opts?: SlBalanzaComiteOptions
): SlBalanzaEgresoComiteScatterPayload | null {
  return evaluateSlBalanzaComitePayload(
    truckflowSegments,
    truckflowPoints,
    externalSalidaAt,
    externalIngresoAt,
    enrichedTimeline,
    opts
  ).payload
}

/** Solo para inferir S1: ancla fin con salida Excel literal (sin proxies de balanza salida/descarga). */
function minimalTimelineForSlBalanzaIngresoInference(
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  let pts = sanitizeMisplacedSlEgreso(truckflowPoints)
  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (!Number.isFinite(salMs)) return pts

  const ingresoMs = earliestSlPointMsAfter(pts, ['SL_INGRESO'], Number.NEGATIVE_INFINITY)
  const hasCameraEgresoAfterIngreso = pts.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && Number.isFinite(ingresoMs) && ms > ingresoMs
  })
  if (hasCameraEgresoAfterIngreso) return pts

  const hasSalidaAnchor = pts.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    return Math.abs(parseTimestampMs(p.occurredAt) - salMs) <= 1000
  })
  if (hasSalidaAnchor) return pts

  return collapseTimedPoints(
    [...pts, { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(salida) }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Última cámara S7 después del inicio S1 (post balanza salida si existe). */
function latestSlEgresoCameraAfterMs(
  points: TimedLogicalPoint[],
  afterMs: number
): TimedLogicalPoint | null {
  const timeline = sanitizeMisplacedSlEgreso(points)
  let best: TimedLogicalPoint | null = null
  let bestMs = Number.NaN
  for (const p of timeline) {
    if (p.code !== 'SL_EGRESO') continue
    const ms = parseTimestampMs(p.occurredAt)
    if (!Number.isFinite(ms) || ms <= afterMs) continue
    if (!Number.isFinite(bestMs) || ms > bestMs) {
      bestMs = ms
      best = p
    }
  }
  return best
}

/**
 * Fin KPI balanza→egreso: cámara S7 si hay lectura después de S1; si no, salida Excel.
 * Evita estadías cortas cuando Excel marca salida antes que el egreso real (p. ej. LHT051).
 */
export function resolveSlBalanzaEgresoEndForKpi(
  points: TimedLogicalPoint[],
  externalSalidaAt: string | undefined,
  afterMs: number
): { point: TimedLogicalPoint; fin_fuente: SlScatterHorarioFinFuente } | null {
  // Regla R7: el fin es el egreso por cámara (SL_EGRESO) siempre que exista una lectura
  // posterior al inicio. Solo si no hay cámara de egreso se usa la salida Excel. La balanza
  // de salida (S5) no participa de este muestreo.
  const camera = latestSlEgresoCameraAfterMs(points, afterMs)
  const camMs = camera ? parseTimestampMs(camera.occurredAt) : Number.NaN
  if (Number.isFinite(camMs) && camMs > afterMs) {
    return {
      point: { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(camera!.occurredAt) },
      fin_fuente: 'truckflow',
    }
  }

  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (Number.isFinite(salMs) && salMs > afterMs) {
    return {
      point: { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(salida) },
      fin_fuente: 'excel_salida',
    }
  }
  return null
}

export type SlBalanzaRollupKpiEndpoints = {
  from: TimedLogicalPoint
  to: TimedLogicalPoint
  inicio_fuente: SlScatterHorarioInicioFuente
  fin_fuente: SlScatterHorarioFinFuente
}

/** KPI balanza ingreso→egreso: S1 cámara o inferido Truckflow; fin cámara S7 o salida Excel. */
export function resolveSlBalanzaRollupEndpointsForKpi(
  points: TimedLogicalPoint[],
  opts?: {
    externalSalidaAt?: string
    externalIngresoAt?: string
    truckflowPoints?: TimedLogicalPoint[]
    truckflowSegments?: TimedSegmentInput[]
  }
): SlBalanzaRollupKpiEndpoints | null {
  const truckflow = opts?.truckflowPoints ?? points
  const rawSegments = opts?.truckflowSegments ?? []
  const horarioSegments =
    rawSegments.length > 0 ? segmentsForSlBalanzaKpiHorarios(rawSegments) : []
  const horarioPoints =
    horarioSegments.length > 0 ?
      buildTimedLogicalTimelineFromSegments(horarioSegments)
    : truckflow
  const salida = String(opts?.externalSalidaAt ?? '').trim()

  const resolvedFrom = resolveSlBalanzaIngresoCameraStart(
    horarioSegments.length > 0 ? horarioSegments : rawSegments,
    horarioPoints
  )
  if (!resolvedFrom) return null

  const fromMsSeed = parseTimestampMs(resolvedFrom.occurredAt)
  if (!Number.isFinite(fromMsSeed)) return null

  const externalIngresoAt = String(opts?.externalIngresoAt ?? '').trim()
  if (isSlBalanzaIngresoAnchoredOnExcelIngreso(resolvedFrom.occurredAt, externalIngresoAt)) {
    return null
  }

  const inicio_fuente: SlScatterHorarioInicioFuente = 'truckflow'

  const endResolved = resolveSlBalanzaEgresoHorarioForKpi(
    horarioSegments.length > 0 ? horarioSegments : rawSegments,
    fromMsSeed,
    salida,
    horarioPoints
  )
  if (!endResolved) return null
  const toPt: TimedLogicalPoint = {
    code: 'SL_EGRESO',
    occurredAt: endResolved.endIso,
  }
  const fin_fuente = endResolved.fin_fuente

  const cameraPt = earliestSlPoint(truckflow, 'SL_BALANZA_INGRESO')
  const cameraBalMs = parseTimestampMs(cameraPt?.occurredAt ?? resolvedFrom.occurredAt)
  const minFromMs = Number.isFinite(cameraBalMs) ? cameraBalMs : fromMsSeed

  const endpoints = finalizeSlBalanzaToEgresoEndpoints(resolvedFrom, toPt, minFromMs)
  const durationMin = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (shouldRejectSlBalanzaScatterForExcelIngreso(durationMin, endpoints.from.occurredAt, externalIngresoAt)) {
    return null
  }

  return {
    from: {
      ...endpoints.from,
      occurredAt: normalizeTimestampForExport(endpoints.from.occurredAt),
    },
    to: {
      ...endpoints.to,
      occurredAt: normalizeTimestampForExport(endpoints.to.occurredAt),
    },
    inicio_fuente,
    fin_fuente,
  }
}

/** Puntos S1→S7 para rollup balanza SL; inicio = cámara balanza (nunca ingreso Excel Ric). */
export function resolveSlBalancaRollupEndpoints(
  points: TimedLogicalPoint[],
  opts?: {
    externalSalidaAt?: string
    truckflowPoints?: TimedLogicalPoint[]
    truckflowSegments?: TimedSegmentInput[]
  }
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const kpi = resolveSlBalanzaRollupEndpointsForKpi(points, opts)
  if (!kpi) return null
  return { from: kpi.from, to: kpi.to }
}

type SlBalanzaScatterRepairOpts = {
  external_salida_at?: string
  external_ingreso_at?: string
  planta_normalized?: string
  executive_circuit_code?: string
  operationSegments?: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
}

/** Corrige timestamps de scatter Excel-first para tramo balanza SL (KPI S1→S7 / salida Excel). */
export function repairSlBalanzaScatterSegment(
  row: {
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
    segment_duration_min: number
  },
  opts?: SlBalanzaScatterRepairOpts
): {
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  horario_fuente: SlScatterHorarioFuente
  horario_fuente_inicio: SlScatterHorarioInicioFuente
  horario_fuente_fin: SlScatterHorarioFinFuente
} | null {
  const from = String(row.segment_from ?? '').trim()
  const to = String(row.segment_to ?? '').trim()
  if (from !== SL_BALANZA_ROLLUP_TRANSITION.from || to !== SL_BALANZA_ROLLUP_TRANSITION.to) {
    return null
  }
  const start = String(row.segment_start_time ?? '').trim()
  const endRaw = String(row.segment_end_time ?? '').trim()
  if (!start || !endRaw) return null

  const salida = String(opts?.external_salida_at ?? '').trim()
  if (!salida) return null

  const operationSegments =
    opts?.operationSegments?.length ?
      opts.operationSegments
    : [
        {
          segment_from: from,
          segment_to: to,
          segment_start_time: start,
          segment_end_time: endRaw,
        },
      ]

  const truckflowSegments = segmentsForSlTruckflowTimeline(operationSegments)
  const { truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
    segments: operationSegments,
    externalIngresoAt: opts?.external_ingreso_at,
    externalSalidaAt: salida,
    plantaNormalized: opts?.planta_normalized,
    executiveCircuitCode: String(opts?.executive_circuit_code ?? '').trim() || 'SL1',
  })

  const payload = buildSlBalanzaEgresoComiteScatterPayload(
    truckflowSegments,
    truckflowPoints,
    salida,
    opts?.external_ingreso_at,
    enrichedPoints
  )
  if (!payload) return null
  return {
    segment_start_time: payload.segment_start_time,
    segment_end_time: payload.segment_end_time,
    segment_duration_min: payload.segment_duration_min,
    horario_fuente: payload.horario_fuente,
    horario_fuente_inicio: payload.horario_fuente_inicio,
    horario_fuente_fin: payload.horario_fuente_fin,
  }
}

export function extractSlBalancaRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: templateToCode } = SL_BALANZA_ROLLUP_TRANSITION
  const endpoints = resolveSlBalancaRollupEndpoints(points)
  if (!endpoints) return null

  const corrected = correctSlBalanzaDescargaStayTiming(
    endpoints.from.occurredAt,
    endpoints.to.occurredAt
  )
  if (!corrected) return null
  if (!isValidSegmentDuration(corrected.durationMinutes, fromCode, templateToCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode: templateToCode,
    durationMinutes: corrected.durationMinutes,
    segment_start_time: corrected.segment_start_time,
    segment_end_time: corrected.segment_end_time,
  }
}

export function extractSlSalidaEgresoRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: toCode } = SL_SALIDA_EGRESO_ROLLUP_TRANSITION
  const endpoints = resolveSlSalidaEgresoEndpoints(points)
  if (!endpoints) return null
  const durationMinutes = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, fromCode, toCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode,
    durationMinutes,
  }
}

function resolveChainEndpointAfter(
  points: TimedLogicalPoint[],
  code: string,
  afterMs: number
): TimedLogicalPoint | null {
  const candidates = points.filter((p) => {
    if (p.code !== code) return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms >= afterMs
  })
  if (!candidates.length) return null
  return candidates.reduce((earliest, p) =>
    parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
  )
}

function resolveSlChainEndpointAfter(
  points: TimedLogicalPoint[],
  code: string,
  afterMs: number
): TimedLogicalPoint | null {
  return resolveChainEndpointAfter(points, code, afterMs)
}

/** Tramos consecutivos de la cadena operativa SL (KPI template). */
export function extractSlOperationalChainLegsFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLegWithTimes[] {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return []
  const legs: SegmentLegWithTimes[] = []
  let startIdx = 0
  for (let i = 0; i < SL_OPERATIONAL_KPI_CHAIN.length; i++) {
    if (points.some((p) => p.code === SL_OPERATIONAL_KPI_CHAIN[i])) {
      startIdx = i
      break
    }
  }
  let afterMs = Number.NEGATIVE_INFINITY

  for (let i = startIdx; i < SL_OPERATIONAL_KPI_CHAIN.length - 1; i++) {
    const fromCode = SL_OPERATIONAL_KPI_CHAIN[i]!
    const toCode = SL_OPERATIONAL_KPI_CHAIN[i + 1]!
    if (
      fromCode === SL_BALANZA_ROLLUP_TRANSITION.from &&
      toCode === SL_BALANZA_ROLLUP_TRANSITION.to
    ) {
      continue
    }
    const fromPt = resolveSlChainEndpointAfter(points, fromCode, afterMs)
    if (!fromPt) break
    const fromMs = parseTimestampMs(fromPt.occurredAt)
    const toPt = resolveSlChainEndpointAfter(points, toCode, fromMs)
    if (!toPt) break
    const durationMinutes = minutesBetweenIso(fromPt.occurredAt, toPt.occurredAt)
    if (!isValidSegmentDuration(durationMinutes, fromCode, toCode)) break
    legs.push({
      journeyId,
      plate,
      executiveCircuitCode,
      fromCode,
      toCode,
      durationMinutes,
      segment_start_time: fromPt.occurredAt,
      segment_end_time: toPt.occurredAt,
    })
    afterMs = parseTimestampMs(toPt.occurredAt)
  }
  return legs
}

/** Rollup SL deducido cuando faltan cámaras intermedias (S5, etc.). */
export function synthesizeSlRollupLegsFromTimedSegments(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
  externalSalidaAt?: string
  externalCaladoAt?: string
  externalIngresoAt?: string
  plantaNormalized?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
}): SegmentLegWithTimes[] {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(input.executiveCircuitCode)) return []
  if (!input.operationId) return []

  const useAllSlSegments = CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(input.executiveCircuitCode)
  const coherentSegments = useAllSlSegments
    ? input.segments
    : selectCoherentSegmentGroup(
        input.segments,
        input.externalIngresoAt,
        input.externalSalidaAt
      )
  const truckflowSegments = segmentsForSlTruckflowTimeline(coherentSegments)
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(truckflowSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  const slAnchors: SlExcelTimelineAnchors = {
    externalIngresoAt: input.externalIngresoAt,
    externalCaladoAt: input.externalCaladoAt,
    externalSalidaAt: input.externalSalidaAt,
    externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
    externalSlBalanzaSalidaAt: input.externalSlBalanzaSalidaAt,
    tiemposEntrePasosOverride: input.tiemposEntrePasosOverride,
    plantaNormalized: input.plantaNormalized,
    executiveCircuitCode: input.executiveCircuitCode,
  }
  const points = enrichSlTimelineWithExcelAnchors(truckflowPoints, slAnchors)
  const trustedBalIn = resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
  let timelineForLegs = points
  if (trustedBalIn && !points.some((p) => p.code === 'SL_BALANZA_INGRESO')) {
    timelineForLegs = collapseTimedPoints(
      [...points, trustedBalIn].sort(
        (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
      )
    )
  }
  if (!timelineForLegs.some((p) => p.code === 'SL_BALANZA_INGRESO')) {
    const proxyStart = resolveSlBalanzaIngresoStartPoint(truckflowPoints, timelineForLegs)
    if (proxyStart) {
      timelineForLegs = collapseTimedPoints(
        [...timelineForLegs, proxyStart].sort(
          (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
        )
      )
    }
  }
  const legs = extractSlOperationalChainLegsFromTimeline(
    timelineForLegs,
    input.executiveCircuitCode,
    input.operationId,
    input.plate
  )

  const kpiBalanza = resolveSlBalanzaRollupEndpointsForKpi(truckflowPoints, {
    externalSalidaAt: input.externalSalidaAt,
    externalIngresoAt: input.externalIngresoAt,
    truckflowPoints,
    truckflowSegments,
  })
  if (kpiBalanza) {
    const corrected = correctSlBalanzaDescargaStayTiming(
      kpiBalanza.from.occurredAt,
      kpiBalanza.to.occurredAt
    )
    const fromCode = SL_BALANZA_ROLLUP_TRANSITION.from
    const toCode = SL_BALANZA_ROLLUP_TRANSITION.to
    if (
      corrected &&
      isValidSegmentDuration(corrected.durationMinutes, fromCode, toCode)
    ) {
      const key = `${fromCode}|${toCode}`
      if (!legs.some((l) => `${l.fromCode}|${l.toCode}` === key)) {
        legs.push({
          journeyId: input.operationId,
          plate: input.plate,
          executiveCircuitCode: input.executiveCircuitCode,
          fromCode,
          toCode,
          durationMinutes: corrected.durationMinutes,
          segment_start_time: corrected.segment_start_time,
          segment_end_time: corrected.segment_end_time,
        })
      }
    }
  }

  return legs
}

function findRollupEndIdx(
  points: TimedLogicalPoint[],
  fromIdx: number,
  endCodes: readonly string[]
): number {
  for (const endCode of endCodes) {
    const idx = points.findIndex((p, i) => i > fromIdx && p.code === endCode)
    if (idx >= 0) return idx
  }
  return -1
}

/** Cierra estadía balanza (Volcable): último hito válido, no el primero espurio. */
function findRollupEndIdxLatest(
  points: TimedLogicalPoint[],
  fromIdx: number,
  endCodes: readonly string[]
): number {
  let bestIdx = -1
  let bestMs = Number.NEGATIVE_INFINITY
  for (let i = fromIdx + 1; i < points.length; i++) {
    const code = points[i]!.code
    if (!endCodes.includes(code)) continue
    const ms = parseTimestampMs(points[i]!.occurredAt)
    if (!Number.isFinite(ms) || ms <= bestMs) continue
    bestMs = ms
    bestIdx = i
  }
  return bestIdx
}

function timelineHasVolcableBetween(
  points: TimedLogicalPoint[],
  fromIdx: number,
  endIdx: number
): boolean {
  if (fromIdx < 0 || endIdx <= fromIdx) return false
  return points.slice(fromIdx + 1, endIdx).some((p) => p.code === 'VOLCABLE')
}

function pointsHaveVolcableAfter(points: TimedLogicalPoint[], fromIdx: number): boolean {
  return points.slice(fromIdx + 1).some((p) => p.code === 'VOLCABLE')
}

function isValidVolcableReceiptBalanzaStayDuration(
  minutes: number,
  points: TimedLogicalPoint[],
  fromIdx: number,
  endIdx: number
): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false
  if (minutes > INFERRED_KPI_ROLLUP_MAX_MINUTES) return false
  const viaVolcable =
    timelineHasVolcableBetween(points, fromIdx, endIdx) || pointsHaveVolcableAfter(points, fromIdx)
  if (viaVolcable) {
    return minutes >= VOLCABLE_RECEIPT_BALANZA_STAY_MIN_MINUTES
  }
  return minutes >= BALANZA_STAY_MIN_MINUTES
}

function earliestSegmentStartForCode(
  segments: TimedSegmentInput[],
  fromCode: string
): string | null {
  let bestMs = Number.POSITIVE_INFINITY
  let best = ''
  for (const seg of segments) {
    if (String(seg.segment_from ?? '').trim() !== fromCode) continue
    const start = String(seg.segment_start_time ?? '').trim()
    const ms = parseTimestampMs(start)
    if (!Number.isFinite(ms) || ms >= bestMs) continue
    bestMs = ms
    best = start
  }
  return best || null
}

function injectVolcableReceiptTimelineAnchors(
  points: TimedLogicalPoint[],
  segments: TimedSegmentInput[],
  externalSalidaAt?: string,
  externalCaladoAt?: string
): TimedLogicalPoint[] {
  let enriched = [...points]
  const balInSeg = earliestSegmentStartForCode(segments, 'BALANZA_INGRESO')
  if (balInSeg && !enriched.some((p) => p.code === 'BALANZA_INGRESO')) {
    enriched.push({ code: 'BALANZA_INGRESO', occurredAt: balInSeg })
  }
  const volcSeg = earliestSegmentStartForCode(segments, 'VOLCABLE')
  if (volcSeg && !enriched.some((p) => p.code === 'VOLCABLE')) {
    enriched.push({ code: 'VOLCABLE', occurredAt: volcSeg })
  }
  const balanzaIdx = enriched.findIndex((p) => p.code === 'BALANZA_INGRESO')
  if (balanzaIdx >= 0) {
    const fromMs = parseTimestampMs(enriched[balanzaIdx]!.occurredAt)
    const hasBalOut = enriched.some((p, i) => i > balanzaIdx && p.code === 'BALANZA_EGRESO')
    if (!hasBalOut && Number.isFinite(fromMs)) {
      const salida = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
      if (salida) enriched.push({ code: 'BALANZA_EGRESO', occurredAt: salida })
    }
  }
  return collapseTimedPoints(
    enriched.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

function injectVolcableReceiptExcelOperationalTimeline(
  points: TimedLogicalPoint[],
  segments: TimedSegmentInput[],
  externalIngresoAt?: string,
  externalCaladoAt?: string,
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  let enriched = injectVolcableReceiptTimelineAnchors(
    points,
    segments,
    externalSalidaAt,
    externalCaladoAt
  )
  const ingreso = String(externalIngresoAt ?? '').trim()
  const calado = String(externalCaladoAt ?? '').trim()
  const ingMs = parseTimestampMs(ingreso)
  const calMs = parseTimestampMs(calado)

  if (ingreso && Number.isFinite(ingMs) && !enriched.some((p) => p.code === 'INGRESO')) {
    enriched.push({ code: 'INGRESO', occurredAt: normalizeTimestampForExport(ingreso) })
  }
  if (calado && Number.isFinite(calMs) && !enriched.some((p) => p.code === 'CALADA')) {
    enriched.push({ code: 'CALADA', occurredAt: normalizeTimestampForExport(calado) })
  }

  if (!enriched.some((p) => p.code === 'PREINGRESO')) {
    const ingPt = enriched.find((p) => p.code === 'INGRESO')
    const calPt = enriched.find((p) => p.code === 'CALADA')
    if (ingPt && calPt) {
      const iMs = parseTimestampMs(ingPt.occurredAt)
      const cMs = parseTimestampMs(calPt.occurredAt)
      if (Number.isFinite(iMs) && Number.isFinite(cMs) && cMs > iMs) {
        const mid = inferMidpointBetweenMs(iMs, cMs)
        if (mid) enriched.push({ code: 'PREINGRESO', occurredAt: mid })
      }
    } else if (ingPt && Number.isFinite(ingMs)) {
      enriched.push({
        code: 'PREINGRESO',
        occurredAt: formatArgentinaIsoFromMs(ingMs + 5 * 60_000),
      })
    }
  }

  if (!enriched.some((p) => p.code === 'BALANZA_INGRESO')) {
    const balSeg = earliestSegmentStartForCode(segments, 'BALANZA_INGRESO')
    if (balSeg) {
      enriched.push({ code: 'BALANZA_INGRESO', occurredAt: balSeg })
    } else if (Number.isFinite(calMs)) {
      enriched.push({
        code: 'BALANZA_INGRESO',
        occurredAt: formatArgentinaIsoFromMs(calMs + 10 * 60_000),
      })
    }
  }

  enriched = injectVolcableReceiptTimelineAnchors(
    enriched,
    segments,
    externalSalidaAt,
    externalCaladoAt
  )
  return collapseTimedPoints(
    enriched.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

function mergeVolcableReceiptLegsByTransition(
  legs: SegmentLegWithTimes[]
): SegmentLegWithTimes[] {
  const byKey = new Map<string, SegmentLegWithTimes>()
  for (const leg of legs) {
    const key = `${leg.fromCode}|${leg.toCode}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, leg)
      continue
    }
    const balanzaStay = isBalanzaStayKpiTransition(leg.fromCode, leg.toCode)
    if (balanzaStay) {
      if (leg.durationMinutes > prev.durationMinutes) byKey.set(key, leg)
    } else if (leg.durationMinutes < prev.durationMinutes) {
      byKey.set(key, leg)
    }
  }
  return [...byKey.values()]
}

/** KPI R5/R6: Truckflow + anclas Excel (girasol Volcable 1/2). */
export function synthesizeVolcableReceiptKpiLegsForOperation(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: TimedSegmentInput[]
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
  plantaNormalized?: string
}): SegmentLegWithTimes[] {
  if (!isVolcableReceiptCircuit(input.executiveCircuitCode)) {
    return synthesizeInferredRollupLegsFromTimedSegments(input)
  }
  const truckflowLegs = synthesizeInferredRollupLegsFromTimedSegments(input)
  const templateLegs = synthesizeVolcableReceiptTemplateChainLegs(input)
  return mergeVolcableReceiptLegsByTransition([...truckflowLegs, ...templateLegs])
}

function synthesizeVolcableReceiptTemplateChainLegs(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: TimedSegmentInput[]
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
}): SegmentLegWithTimes[] {
  if (!input.operationId || !isVolcableReceiptCircuit(input.executiveCircuitCode)) return []
  const template = getCircuitSegmentTemplate(input.executiveCircuitCode)
  if (template.length < 2) return []

  const coherentSegments = selectCoherentSegmentGroup(
    input.segments,
    input.externalIngresoAt,
    input.externalSalidaAt,
    OPERATIONAL_TRIP_GAP_MAX_MINUTES * 2
  )
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  let enrichedPoints = injectIngresoFromExcel(truckflowPoints, input.externalIngresoAt)
  enrichedPoints = injectCaladaFromExcel(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt
  )
  enrichedPoints = enrichTimelineWithExcelDischarge(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt,
    input.externalSalidaAt,
    input.platformNormalized,
    input.externalIngresoAt
  )
  enrichedPoints = injectVolcableReceiptExcelOperationalTimeline(
    enrichedPoints,
    coherentSegments,
    input.externalIngresoAt,
    input.externalCaladoAt,
    input.externalSalidaAt
  )

  return extractTemplateChainLegsFromTimeline({
    truckflowPoints,
    enrichedPoints,
    executiveCircuitCode: input.executiveCircuitCode,
    journeyId: input.operationId,
    plate: input.plate,
    externalSalidaAt: input.externalSalidaAt,
  })
}

function findRollupFromIdx(
  points: TimedLogicalPoint[],
  fromCode: string,
  preferLatest = false
): number {
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.code === fromCode) indices.push(i)
  }
  if (!indices.length) return -1
  return preferLatest ? indices[indices.length - 1]! : indices[0]!
}

function pickExcelTimestampAfter(
  afterMs: number,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  preferCalado = true
): string {
  const calado = String(externalCaladoAt ?? '').trim()
  const salida = String(externalSalidaAt ?? '').trim()
  const calMs = parseTimestampMs(calado)
  const salMs = parseTimestampMs(salida)
  if (preferCalado && Number.isFinite(calMs) && calMs > afterMs) return calado
  if (Number.isFinite(salMs) && salMs > afterMs) return salida
  if (!preferCalado && Number.isFinite(calMs) && calMs > afterMs) return calado
  return ''
}

function resolveDefaultC16LogicalCode(circuitCode: string): 'CELDA16_CARGA' | 'CELDA16_DESCARGA' {
  if (circuitCode === 'R1' || circuitCode === 'R27') return 'CELDA16_DESCARGA'
  return 'CELDA16_CARGA'
}

/** Tránsito C16 inferido entre dos hitos (solo transile R19/R20, no Kepler). */
function inferC16TransitMidpoint(balanzaIngresoMs: number, caladoMs: number): string {
  return inferMidpointBetweenMs(balanzaIngresoMs, caladoMs)
}

/** Calada Ricardone desde Excel cuando falta cámara S2 (R3/R4). */
function injectCaladaFromExcel(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  externalCaladoAt?: string
): TimedLogicalPoint[] {
  const code = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  if (!KEPLER_KPI_CIRCUIT_CODES.has(code)) return points
  if (points.some((p) => p.code === 'CALADA')) return points
  const calado = String(externalCaladoAt ?? '').trim()
  const calMs = parseTimestampMs(calado)
  if (!calado || !Number.isFinite(calMs)) return points
  const ingreso = points.find((p) => p.code === 'INGRESO')
  if (ingreso) {
    const ingMs = parseTimestampMs(ingreso.occurredAt)
    if (Number.isFinite(ingMs) && calMs <= ingMs) return points
  }
  const preingreso = points.find((p) => p.code === 'PREINGRESO')
  if (preingreso) {
    const preMs = parseTimestampMs(preingreso.occurredAt)
    if (Number.isFinite(preMs) && calMs < preMs) return points
  }
  const balanza = points.find((p) => p.code === 'BALANZA_INGRESO')
  if (balanza) {
    const balMs = parseTimestampMs(balanza.occurredAt)
    if (Number.isFinite(balMs) && calMs >= balMs) return points
  }
  return collapseTimedPoints(
    [...points, { code: 'CALADA', occurredAt: calado }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Anclas C16 / Volcable / puente transile desde Excel cuando falta cámara en silo o ruta. */
function enrichTimelineWithExcelSiloAnchors(
  points: TimedLogicalPoint[],
  circuitCode: string,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  _platformNormalized?: string,
  externalSlBalanzaEntradaAt?: string
): TimedLogicalPoint[] {
  const executiveCode = normalizeExecutiveCircuitForKpi(circuitCode)
  if (KEPLER_KPI_CIRCUIT_CODES.has(executiveCode)) {
    return points
  }

  let enriched = [...points]

  const balanzaIdx = enriched.findIndex((p) => p.code === 'BALANZA_INGRESO')
  if (balanzaIdx >= 0) {
    const fromMs = parseTimestampMs(enriched[balanzaIdx]!.occurredAt)
    const hasC16 = enriched.some(
      (p, i) =>
        i > balanzaIdx && (p.code === 'CELDA16_CARGA' || p.code === 'CELDA16_DESCARGA')
    )
    if (!hasC16 && Number.isFinite(fromMs)) {
      const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
      if (anchor) enriched.push({ code: resolveDefaultC16LogicalCode(executiveCode), occurredAt: anchor })
    }
  }

  const c16Idx = enriched.findIndex(
    (p) => p.code === 'CELDA16_CARGA' || p.code === 'CELDA16_DESCARGA'
  )
  const needsVolcable = ['R19', 'R20'].includes(executiveCode)
  if (needsVolcable && c16Idx >= 0) {
    const fromMs = parseTimestampMs(enriched[c16Idx]!.occurredAt)
    const hasVolcable = enriched.some((p, i) => i > c16Idx && p.code === 'VOLCABLE')
    if (!hasVolcable && Number.isFinite(fromMs)) {
      const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
      if (anchor) enriched.push({ code: 'VOLCABLE', occurredAt: anchor })
    }
  }

  const volcIdx = enriched.findIndex((p) => p.code === 'VOLCABLE')
  if (volcIdx >= 0 && c16Idx < 0 && balanzaIdx < 0 && needsVolcable) {
    const volcMs = parseTimestampMs(enriched[volcIdx]!.occurredAt)
    const calado = String(externalCaladoAt ?? '').trim()
    const calMs = parseTimestampMs(calado)
    if (Number.isFinite(volcMs) && Number.isFinite(calMs) && calMs < volcMs) {
      const c16At = inferC16TransitMidpoint(calMs, volcMs)
      if (c16At) enriched.push({ code: 'CELDA16_CARGA', occurredAt: c16At })
    }
  }

  if (circuitCode === 'R26') {
    const ricOutIdx = enriched.findIndex((p) => p.code === 'BALANZA_EGRESO')
    if (ricOutIdx >= 0) {
      const fromMs = parseTimestampMs(enriched[ricOutIdx]!.occurredAt)
      const hasSl = enriched.some((p, i) => i > ricOutIdx && p.code.startsWith('SL_'))
      if (!hasSl && Number.isFinite(fromMs)) {
        const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
        if (anchor) enriched.push({ code: 'SL_INGRESO', occurredAt: anchor })
      }
    }
  }

  if (circuitCode === 'R7') {
    const ricOutIdx = enriched.findIndex((p) => p.code === 'EGRESO')
    if (ricOutIdx >= 0) {
      const fromMs = parseTimestampMs(enriched[ricOutIdx]!.occurredAt)
      const hasSl = enriched.some((p, i) => i > ricOutIdx && p.code.startsWith('SL_'))
      if (!hasSl && Number.isFinite(fromMs)) {
        const tepSl = String(externalSlBalanzaEntradaAt ?? '').trim()
        const tepMs = parseTimestampMs(tepSl)
        let anchor = ''
        if (tepSl && Number.isFinite(tepMs) && tepMs > fromMs) {
          anchor = tepSl
        } else {
          anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false) ?? ''
        }
        if (anchor) enriched.push({ code: 'SL_INGRESO', occurredAt: anchor })
      }
    }
  }

  if (circuitCode === 'R27') {
    const slOutIdx = enriched.findIndex((p) => p.code === 'SL_EGRESO')
    if (slOutIdx >= 0) {
      const fromMs = parseTimestampMs(enriched[slOutIdx]!.occurredAt)
      const hasRic = enriched.some(
        (p, i) =>
          i > slOutIdx &&
          ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO'].includes(p.code)
      )
      if (!hasRic && Number.isFinite(fromMs)) {
        const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
        if (anchor) enriched.push({ code: 'INGRESO', occurredAt: anchor })
      }
    }
  }

  return collapseTimedPoints(
    enriched.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

/** Ingreso Excel (match patente) cuando Truckflow no tiene ancla de entrada. */
function injectIngresoFromExcel(
  points: TimedLogicalPoint[],
  externalIngresoAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'INGRESO')) return points
  const ingreso = String(externalIngresoAt ?? '').trim()
  const ingMs = parseTimestampMs(ingreso)
  if (!ingreso || !Number.isFinite(ingMs)) return points
  const preingreso = points.find((p) => p.code === 'PREINGRESO')
  if (preingreso) {
    const preMs = parseTimestampMs(preingreso.occurredAt)
    if (Number.isFinite(preMs) && ingMs >= preMs) return points
  }
  return collapseTimedPoints(
    [...points, { code: 'INGRESO', occurredAt: ingreso }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

function isSlTemplateTransition(
  circuitCode: string,
  fromCode: string,
  toCode: string
): boolean {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(circuitCode)) return false
  return fromCode.startsWith('SL_') || toCode.startsWith('SL_')
}

function isBridgeTemplateTransition(
  circuitCode: string,
  fromCode: string,
  toCode: string
): boolean {
  const bridge = TRANSILE_BRIDGE_KPI_TRANSITIONS[circuitCode as keyof typeof TRANSILE_BRIDGE_KPI_TRANSITIONS]
  return Boolean(bridge && fromCode === bridge.fromCode && toCode === bridge.toCode)
}

/** volcable→balanza egreso: solo cámaras Truckflow o salida Excel si está a ≤30 min. */
function resolveVolcableBalanzaEgresoEndpoints(
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt?: string
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const volcCandidates = truckflowPoints.filter((p) => p.code === 'VOLCABLE')
  if (!volcCandidates.length) return null
  const fromPt = volcCandidates.reduce((latest, p) =>
    parseTimestampMs(p.occurredAt) >= parseTimestampMs(latest.occurredAt) ? p : latest
  )
  const volcMs = parseTimestampMs(fromPt.occurredAt)
  if (!Number.isFinite(volcMs)) return null

  const balCandidates = truckflowPoints.filter((p) => {
    if (p.code !== 'BALANZA_EGRESO') return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms > volcMs
  })
  if (balCandidates.length) {
    const toPt = balCandidates.reduce((earliest, p) =>
      parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
    )
    return { from: fromPt, to: toPt }
  }

  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (Number.isFinite(salMs) && salMs > volcMs) {
    const gapMin = (salMs - volcMs) / 60_000
    if (gapMin <= VOLCABLE_BALANZA_EGRESO_MAX_MINUTES) {
      return { from: fromPt, to: { code: 'BALANZA_EGRESO', occurredAt: salida } }
    }
  }
  return null
}

function timelineSourceForTemplatePoint(code: string, executiveCircuitCode: string): 'enriched' | 'truckflow' {
  const circuit = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  if (code === 'INGRESO') return 'enriched'
  if (code === 'CALADA' && KEPLER_KPI_CIRCUIT_CODES.has(circuit)) return 'enriched'
  if (code === 'BALANZA_EGRESO' && CIRCUITS_WITH_BALANZA_STAY_ROLLUP.has(circuit)) {
    return 'enriched'
  }
  return 'truckflow'
}

function pickTimelineForTemplate(
  source: 'enriched' | 'truckflow',
  truckflowPoints: TimedLogicalPoint[],
  enrichedPoints: TimedLogicalPoint[]
): TimedLogicalPoint[] {
  return source === 'enriched' ? enrichedPoints : truckflowPoints
}

/** Tramos consecutivos del template operativo (Truckflow + ingreso Excel). */
export function extractTemplateChainLegsFromTimeline(input: {
  truckflowPoints: TimedLogicalPoint[]
  enrichedPoints: TimedLogicalPoint[]
  executiveCircuitCode: string
  journeyId: string
  plate: string
  externalSalidaAt?: string
}): SegmentLegWithTimes[] {
  const {
    truckflowPoints,
    enrichedPoints,
    executiveCircuitCode,
    journeyId,
    plate,
    externalSalidaAt,
  } = input
  const template = getCircuitSegmentTemplate(executiveCircuitCode)
  if (template.length < 2) return []

  const legs: SegmentLegWithTimes[] = []
  let startIdx = 0
  const ingresoIdx = template.indexOf('INGRESO')
  if (ingresoIdx >= 0 && enrichedPoints.some((p) => p.code === 'INGRESO')) {
    startIdx = ingresoIdx
  } else {
    for (let t = 0; t < template.length; t++) {
      const code = template[t]!
      if (
        enrichedPoints.some((p) => p.code === code) ||
        truckflowPoints.some((p) => p.code === code)
      ) {
        startIdx = t
        break
      }
    }
  }

  let afterMs = Number.NEGATIVE_INFINITY
  let i = startIdx

  while (i < template.length - 1) {
    const fromCode = template[i]!
    if (isSlTemplateTransition(executiveCircuitCode, fromCode, template[i + 1]!)) {
      i++
      continue
    }

    if (fromCode === 'VOLCABLE') {
      const volcIdx = template.indexOf('VOLCABLE')
      const balIdx = template.indexOf('BALANZA_EGRESO')
      if (balIdx > volcIdx) {
        const endpoints = resolveVolcableBalanzaEgresoEndpoints(truckflowPoints, externalSalidaAt)
        if (!endpoints) {
          i = balIdx
          continue
        }
        const durationMinutes = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
        if (isValidSegmentDuration(durationMinutes, 'VOLCABLE', 'BALANZA_EGRESO')) {
          legs.push({
            journeyId,
            plate,
            executiveCircuitCode,
            fromCode: 'VOLCABLE',
            toCode: 'BALANZA_EGRESO',
            durationMinutes,
            segment_start_time: endpoints.from.occurredAt,
            segment_end_time: endpoints.to.occurredAt,
          })
        }
        afterMs = parseTimestampMs(endpoints.to.occurredAt)
        i = balIdx
        continue
      }
    }

    const fromSource = timelineSourceForTemplatePoint(fromCode, executiveCircuitCode)
    const fromTimeline = pickTimelineForTemplate(fromSource, truckflowPoints, enrichedPoints)
    const fromPt = resolveChainEndpointAfter(fromTimeline, fromCode, afterMs)
    if (!fromPt) {
      i++
      continue
    }
    const fromMs = parseTimestampMs(fromPt.occurredAt)

    let toIdx = -1
    let toPt: TimedLogicalPoint | null = null
    for (let j = i + 1; j < template.length; j++) {
      const candidate = template[j]!
      if (isSlTemplateTransition(executiveCircuitCode, fromCode, candidate)) continue
      if (isBridgeTemplateTransition(executiveCircuitCode, fromCode, candidate)) continue
      if (candidate === 'BALANZA_EGRESO' && template[j - 1] === 'VOLCABLE') continue

      const toSource = timelineSourceForTemplatePoint(candidate, executiveCircuitCode)
      const toTimeline = pickTimelineForTemplate(toSource, truckflowPoints, enrichedPoints)
      const pt = resolveChainEndpointAfter(toTimeline, candidate, fromMs)
      if (pt) {
        toIdx = j
        toPt = pt
        break
      }
    }
    if (!toPt || toIdx < 0) {
      i++
      continue
    }

    const toCode = template[toIdx]!
    const durationMinutes = minutesBetweenIso(fromPt.occurredAt, toPt.occurredAt)
    if (isValidKpiLegDuration(durationMinutes, executiveCircuitCode, fromCode, toCode)) {
      legs.push({
        journeyId,
        plate,
        executiveCircuitCode,
        fromCode,
        toCode,
        durationMinutes,
        segment_start_time: fromPt.occurredAt,
        segment_end_time: toPt.occurredAt,
      })
    }
    afterMs = parseTimestampMs(toPt.occurredAt)
    i = toIdx
  }
  return legs
}

/** Template KPI: recorre puntos esperados del circuito con Truckflow + anclas Excel. */
export function synthesizeTemplateChainLegsFromTimedSegments(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: TimedSegmentInput[]
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
  externalSlBalanzaEntradaAt?: string
}): SegmentLegWithTimes[] {
  if (!input.operationId) return []
  const template = getCircuitSegmentTemplate(input.executiveCircuitCode)
  if (template.length < 2) return []

  const coherentSegments = usesFullOperationalSegmentTimeline(input.executiveCircuitCode)
    ? input.segments
    : selectCoherentSegmentGroup(
        input.segments,
        input.externalIngresoAt,
        input.externalSalidaAt
      )
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  let enrichedPoints = injectIngresoFromExcel(truckflowPoints, input.externalIngresoAt)
  enrichedPoints = injectCaladaFromExcel(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt
  )
  enrichedPoints = enrichTimelineWithExcelDischarge(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt,
    input.externalSalidaAt,
    input.platformNormalized,
    input.externalIngresoAt,
    input.externalSlBalanzaEntradaAt
  )
  if (isVolcableReceiptCircuit(input.executiveCircuitCode)) {
    enrichedPoints = injectVolcableReceiptExcelOperationalTimeline(
      enrichedPoints,
      coherentSegments,
      input.externalIngresoAt,
      input.externalCaladoAt,
      input.externalSalidaAt
    )
  }

  return extractTemplateChainLegsFromTimeline({
    truckflowPoints,
    enrichedPoints,
    executiveCircuitCode: input.executiveCircuitCode,
    journeyId: input.operationId,
    plate: input.plate,
    externalSalidaAt: input.externalSalidaAt,
  })
}

/**
 * Excel-first (patente + producto): Truckflow da el recorrido; ingreso/calado/salida Excel
 * rellenan puntos que falten en cámara.
 */
export function enrichTimelineWithExcelDischarge(
  points: TimedLogicalPoint[],
  circuitCode: string,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  platformNormalized?: string,
  externalIngresoAt?: string,
  externalSlBalanzaEntradaAt?: string
): TimedLogicalPoint[] {
  let enriched = injectIngresoFromExcel(points, externalIngresoAt)
  const executiveCode = normalizeExecutiveCircuitForKpi(circuitCode)
  enriched = injectCaladaFromExcel(enriched, executiveCode, externalCaladoAt)
  const rules = DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[executiveCode]
  if (!rules?.length) return enriched

  enriched = enrichTimelineWithExcelSiloAnchors(
    enriched,
    executiveCode,
    externalCaladoAt,
    externalSalidaAt,
    platformNormalized,
    externalSlBalanzaEntradaAt
  )
  for (const rule of rules) {
    const fromIdx = findRollupFromIdx(enriched, rule.fromCode, rule.fromCode === 'VOLCABLE')
    if (fromIdx < 0) continue
    const fromMs = parseTimestampMs(enriched[fromIdx]!.occurredAt)
    if (!Number.isFinite(fromMs)) continue
    const hasEnd = enriched.some((p, i) => i > fromIdx && rule.endCodes.includes(p.code))
    if (hasEnd) continue

    if (rule.toCode === 'BALANZA_EGRESO') {
      const salidaAt = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
      if (salidaAt) enriched.push({ code: 'BALANZA_EGRESO', occurredAt: salidaAt })
      continue
    }

    const dischargeAt = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
    if (dischargeAt) enriched.push({ code: rule.toCode, occurredAt: dischargeAt })
  }

  return collapseTimedPoints(
    enriched.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

export function extractDischargeRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string,
  rule: DischargeKpiRollupRule,
  opts?: { externalSalidaAt?: string }
): SegmentLeg | null {
  if (!CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP.has(executiveCircuitCode)) return null

  const exec = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  const isBalanzaStayRule =
    rule.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
    rule.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  const volcableReceipt = isBalanzaStayRule && isVolcableReceiptCircuit(exec)

  const fromIdx = findRollupFromIdx(
    points,
    rule.fromCode,
    rule.fromCode === 'VOLCABLE' || volcableReceipt
  )
  if (fromIdx < 0) return null

  let durationMinutes: number
  if (volcableReceipt) {
    const fromMs = parseTimestampMs(points[fromIdx]!.occurredAt)
    if (!Number.isFinite(fromMs)) return null
    let endMs = Number.NaN
    const camIdx = findRollupEndIdxLatest(points, fromIdx, rule.endCodes)
    if (camIdx >= 0) endMs = parseTimestampMs(points[camIdx]!.occurredAt)
    const salida = pickExcelTimestampAfter(fromMs, undefined, opts?.externalSalidaAt, false)
    const salMs = parseTimestampMs(salida)
    if (Number.isFinite(salMs) && salMs > fromMs && (!Number.isFinite(endMs) || salMs > endMs)) {
      endMs = salMs
    }
    if (!Number.isFinite(endMs) || endMs <= fromMs) return null
    durationMinutes = (endMs - fromMs) / 60_000
    const volcEndIdx =
      camIdx >= 0 ? Math.max(camIdx, fromIdx + 1) : Math.max(fromIdx + 1, points.length - 1)
    if (!isValidVolcableReceiptBalanzaStayDuration(durationMinutes, points, fromIdx, volcEndIdx)) {
      return null
    }
  } else {
    const endIdx = findRollupEndIdx(points, fromIdx, rule.endCodes)
    if (endIdx < 0) return null
    durationMinutes = minutesBetweenIso(points[fromIdx]!.occurredAt, points[endIdx]!.occurredAt)
    if (!isValidSegmentDuration(durationMinutes, rule.fromCode, rule.toCode)) return null
  }

  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode: rule.fromCode,
    toCode: rule.toCode,
    durationMinutes,
  }
}

/** Rollup Celda16/Volcable deducido (Excel calado/salida + Truckflow no consecutivo). */
export function synthesizeDischargeRollupLegsFromTimedSegments(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
  externalSlBalanzaEntradaAt?: string
}): SegmentLegWithTimes[] {
  const rules = DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[input.executiveCircuitCode]
  if (!rules?.length || !input.operationId) return []

  const coherentSegments = usesFullOperationalSegmentTimeline(input.executiveCircuitCode)
    ? input.segments
    : selectCoherentSegmentGroup(
        input.segments,
        input.externalIngresoAt,
        input.externalSalidaAt
      )
  let points = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  const slIngresoStart = earliestSegmentStartForCode(coherentSegments, 'SL_INGRESO')
  if (
    input.executiveCircuitCode === 'R7' &&
    slIngresoStart &&
    !points.some((p) => p.code === 'SL_INGRESO')
  ) {
    points = collapseTimedPoints(
      [...points, { code: 'SL_INGRESO', occurredAt: slIngresoStart }].sort(
        (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
      )
    )
  }
  const egresoStart = earliestSegmentStartForCode(coherentSegments, 'EGRESO')
  if (
    input.executiveCircuitCode === 'R7' &&
    egresoStart &&
    !points.some((p) => p.code === 'EGRESO')
  ) {
    points = collapseTimedPoints(
      [...points, { code: 'EGRESO', occurredAt: egresoStart }].sort(
        (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
      )
    )
  }
  points = enrichTimelineWithExcelDischarge(
    points,
    input.executiveCircuitCode,
    input.externalCaladoAt,
    input.externalSalidaAt,
    input.platformNormalized,
    input.externalIngresoAt,
    input.externalSlBalanzaEntradaAt
  )
  if (isVolcableReceiptCircuit(input.executiveCircuitCode)) {
    points = injectVolcableReceiptTimelineAnchors(
      points,
      coherentSegments,
      input.externalSalidaAt,
      input.externalCaladoAt
    )
  }

  const out: SegmentLegWithTimes[] = []
  for (const rule of rules) {
    const leg = extractDischargeRollupFromTimeline(
      points,
      input.executiveCircuitCode,
      input.operationId,
      input.plate,
      rule,
      { externalSalidaAt: input.externalSalidaAt }
    )
    if (!leg) continue
    const fromIdx = findRollupFromIdx(
      points,
      rule.fromCode,
      rule.fromCode === 'VOLCABLE' ||
        (isVolcableReceiptCircuit(input.executiveCircuitCode) &&
          rule.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from)
    )
    const isVolcStay =
      isVolcableReceiptCircuit(input.executiveCircuitCode) &&
      rule.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from
    let segment_end_time = ''
    if (fromIdx >= 0) {
      if (isVolcStay) {
        const fromMs = parseTimestampMs(points[fromIdx]!.occurredAt)
        const camIdx = findRollupEndIdxLatest(points, fromIdx, rule.endCodes)
        let endMs = camIdx >= 0 ? parseTimestampMs(points[camIdx]!.occurredAt) : Number.NaN
        const salida = pickExcelTimestampAfter(fromMs, undefined, input.externalSalidaAt, false)
        const salMs = parseTimestampMs(salida)
        if (Number.isFinite(salMs) && salMs > fromMs && (!Number.isFinite(endMs) || salMs > endMs)) {
          endMs = salMs
          segment_end_time = salida
        } else if (camIdx >= 0) {
          segment_end_time = points[camIdx]!.occurredAt
        }
      } else {
        const endIdx = findRollupEndIdx(points, fromIdx, rule.endCodes)
        if (endIdx >= 0) segment_end_time = points[endIdx]!.occurredAt
      }
    }
    if (!segment_end_time) continue
    out.push({
      ...leg,
      segment_start_time: points[fromIdx]!.occurredAt,
      segment_end_time,
    })
  }
  return out
}

/** Rollups SL + Celda16/Volcable para KPI tiempos Excel-first. */
export function synthesizeInferredRollupLegsFromTimedSegments(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
  plantaNormalized?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
}): SegmentLegWithTimes[] {
  return [
    ...synthesizeTemplateChainLegsFromTimedSegments({
      operationId: input.operationId,
      plate: input.plate,
      executiveCircuitCode: input.executiveCircuitCode,
      segments: input.segments,
      externalCaladoAt: input.externalCaladoAt,
      externalSalidaAt: input.externalSalidaAt,
      platformNormalized: input.platformNormalized,
      externalIngresoAt: input.externalIngresoAt,
      externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
    }),
    ...synthesizeSlRollupLegsFromTimedSegments({
      operationId: input.operationId,
      plate: input.plate,
      executiveCircuitCode: input.executiveCircuitCode,
      segments: input.segments,
      externalSalidaAt: input.externalSalidaAt,
      externalCaladoAt: input.externalCaladoAt,
      externalIngresoAt: input.externalIngresoAt,
      plantaNormalized: input.plantaNormalized,
      externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
      externalSlBalanzaSalidaAt: input.externalSlBalanzaSalidaAt,
      tiemposEntrePasosOverride: input.tiemposEntrePasosOverride,
    }),
    ...synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: input.operationId,
      plate: input.plate,
      executiveCircuitCode: input.executiveCircuitCode,
      segments: input.segments,
      externalCaladoAt: input.externalCaladoAt,
      externalSalidaAt: input.externalSalidaAt,
      platformNormalized: input.platformNormalized,
      externalIngresoAt: input.externalIngresoAt,
      externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
    }),
  ]
}

function extractDischargeRollupLegsFromJourney(
  journey: ReconstructedRealJourney,
  executiveCircuitCode: string
): SegmentLeg[] {
  const rules = DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[executiveCircuitCode]
  if (!rules?.length) return []
  const points = collapsedLogicalPointsForDischargeRollup(journey)
  const plate = journey.normalizedPlate || journey.plate
  return rules
    .map((rule) =>
      extractDischargeRollupFromTimeline(points, executiveCircuitCode, journey.journeyUid, plate, rule)
    )
    .filter((leg): leg is SegmentLeg => leg !== null)
}

function collapsedFrontLogicalPoints(j: ReconstructedRealJourney): CollapsedLogicalPoint[] {
  const events = journeyFrontEventsSorted(j)
  const out: CollapsedLogicalPoint[] = []
  for (const e of events) {
    const code = normalizeRealEventPoint(e).logicalCode
    if (isExcludedLogicalCode(code)) continue
    const last = out[out.length - 1]
    if (last?.code === code) continue
    out.push({ code, occurredAt: eventOperationalInstantForTimeline(e) })
  }
  return out
}

function resolveTimedSegmentLeg(
  from: { code: string; occurredAt: string },
  to: { code: string; occurredAt: string },
  applyPlantOffset = false
): { durationMinutes: number; segment_start_time: string; segment_end_time: string } | null {
  if (
    from.code === SL_BALANZA_ROLLUP_TRANSITION.from &&
    to.code === SL_BALANZA_ROLLUP_TRANSITION.to
  ) {
    return correctSlBalanzaDescargaStayTiming(from.occurredAt, to.occurredAt, {
      applyPlantOffset,
    })
  }
  const durationMinutes = minutesBetweenIso(from.occurredAt, to.occurredAt)
  if (!Number.isFinite(durationMinutes)) return null
  return {
    durationMinutes,
    segment_start_time: from.occurredAt,
    segment_end_time: to.occurredAt,
  }
}

export function extractSegmentLegs(
  journey: ReconstructedRealJourney,
  executiveCircuitCode = ''
): SegmentLeg[] {
  const points = collapsedFrontLogicalPoints(journey)
  const legs: SegmentLeg[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!
    const to = points[i + 1]!
    const resolved = resolveTimedSegmentLeg(from, to)
    if (!resolved) continue
    if (!isValidSegmentDuration(resolved.durationMinutes, from.code, to.code)) continue
    legs.push({
      journeyId: journey.journeyUid,
      plate: journey.normalizedPlate || journey.plate,
      executiveCircuitCode,
      fromCode: from.code,
      toCode: to.code,
      durationMinutes: resolved.durationMinutes,
    })
  }
  return legs
}

/** Rollup balanza ingreso → fin estadía SL (salida, descarga o egreso si no hay S5). */
export function extractSlBalancaRollupLeg(
  journey: ReconstructedRealJourney,
  executiveCircuitCode: string
): SegmentLeg | null {
  const points = collapsedFrontLogicalPoints(journey)
  return extractSlBalancaRollupFromTimeline(
    points,
    executiveCircuitCode,
    journey.journeyUid,
    journey.normalizedPlate || journey.plate
  )
}

/** Rollup balanza salida → egreso SL (salto no consecutivo). */
export function extractSlSalidaEgresoRollupLeg(
  journey: ReconstructedRealJourney,
  executiveCircuitCode: string
): SegmentLeg | null {
  const points = collapsedFrontLogicalPoints(journey)
  return extractSlSalidaEgresoRollupFromTimeline(
    points,
    executiveCircuitCode,
    journey.journeyUid,
    journey.normalizedPlate || journey.plate
  )
}

export function extractSegmentLegsWithTimes(
  journey: ReconstructedRealJourney,
  executiveCircuitCode = ''
): SegmentLegWithTimes[] {
  const points = collapsedFrontLogicalPoints(journey)
  const legs: SegmentLegWithTimes[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!
    const to = points[i + 1]!
    if (
      from.code === SL_BALANZA_ROLLUP_TRANSITION.from &&
      to.code === SL_BALANZA_ROLLUP_TRANSITION.to
    ) {
      continue
    }
    const resolved = resolveTimedSegmentLeg(from, to)
    if (!resolved) continue
    if (!isValidSegmentDuration(resolved.durationMinutes, from.code, to.code)) continue
    legs.push({
      journeyId: journey.journeyUid,
      plate: journey.normalizedPlate || journey.plate,
      executiveCircuitCode,
      fromCode: from.code,
      toCode: to.code,
      durationMinutes: resolved.durationMinutes,
      segment_start_time: resolved.segment_start_time,
      segment_end_time: resolved.segment_end_time,
    })
  }
  const rollup = extractSlBalancaRollupLeg(journey, executiveCircuitCode)
  if (rollup) {
    const kpi = resolveSlBalanzaRollupEndpointsForKpi(points)
    const endpoints = kpi ?? resolveSlBalancaRollupEndpoints(points)
    if (endpoints) {
      const corrected = correctSlBalanzaDescargaStayTiming(
        endpoints.from.occurredAt,
        endpoints.to.occurredAt
      )
      if (corrected) {
        legs.push({
          ...rollup,
          durationMinutes: corrected.durationMinutes,
          segment_start_time: corrected.segment_start_time,
          segment_end_time: corrected.segment_end_time,
        })
      }
    }
  }
  for (const leg of extractDischargeRollupLegsFromJourney(journey, executiveCircuitCode)) {
    const dischargePoints = collapsedLogicalPointsForDischargeRollup(journey)
    const fromIdx = dischargePoints.findIndex((p) => p.code === leg.fromCode)
    const endIdx = findRollupEndIdx(
      dischargePoints,
      fromIdx,
      getDischargeKpiRollupRules(executiveCircuitCode).find(
        (r) => r.fromCode === leg.fromCode && r.toCode === leg.toCode
      )?.endCodes ?? []
    )
    if (fromIdx >= 0 && endIdx >= 0) {
      legs.push({
        ...leg,
        segment_start_time: dischargePoints[fromIdx]!.occurredAt,
        segment_end_time: dischargePoints[endIdx]!.occurredAt,
      })
    }
  }
  return legs
}

export function extractAllSegmentLegsForCircuit(
  journey: ReconstructedRealJourney,
  executiveCircuitCode: string
): SegmentLeg[] {
  const seen = new Set<string>()
  const out: SegmentLeg[] = []
  const push = (leg: SegmentLeg) => {
    const key = `${leg.journeyId}|${leg.fromCode}|${leg.toCode}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(leg)
  }
  for (const leg of extractSegmentLegs(journey, executiveCircuitCode)) {
    push(leg)
  }
  const rollup = extractSlBalancaRollupLeg(journey, executiveCircuitCode)
  if (rollup) push(rollup)
  for (const leg of extractDischargeRollupLegsFromJourney(journey, executiveCircuitCode)) {
    push(leg)
  }
  return out
}

function sortAggregates(rows: SegmentTimingAggregate[]): SegmentTimingAggregate[] {
  return [...rows].sort((a, b) => {
    const byTransition = transitionSortKey(a.fromCode, a.toCode) - transitionSortKey(b.fromCode, b.toCode)
    if (byTransition !== 0) return byTransition
    return a.label.localeCompare(b.label, 'es')
  })
}

function sortCircuitCodes(codes: string[]): string[] {
  const order = EXECUTIVE_CIRCUIT_ORDER as readonly string[]
  return [...codes].sort((a, b) => {
    const ia = order.indexOf(a as (typeof order)[number])
    const ib = order.indexOf(b as (typeof order)[number])
    const ai = ia >= 0 ? ia : 999
    const bi = ib >= 0 ? ib : 999
    if (ai !== bi) return ai - bi
    return a.localeCompare(b, 'es')
  })
}

function resolveExtremeLegs(legs: SegmentLeg[]): Pick<
  SegmentTimingAggregate,
  'minPlate' | 'maxPlate' | 'minJourneyId' | 'maxJourneyId'
> {
  if (!legs.length) {
    return { minPlate: '', maxPlate: '', minJourneyId: '', maxJourneyId: '' }
  }
  let minLeg = legs[0]!
  let maxLeg = legs[0]!
  for (const leg of legs) {
    if (leg.durationMinutes < minLeg.durationMinutes) minLeg = leg
    if (leg.durationMinutes > maxLeg.durationMinutes) maxLeg = leg
  }
  return {
    minPlate: minLeg.plate,
    maxPlate: maxLeg.plate,
    minJourneyId: minLeg.journeyId,
    maxJourneyId: maxLeg.journeyId,
  }
}

function aggregateFromLegs(
  circuitCode: string,
  fromCode: string,
  toCode: string,
  legs: SegmentLeg[]
): SegmentTimingAggregate {
  const durationsMinutes = legs
    .map((l) => l.durationMinutes)
    .filter((d) => isWithinKpiSegmentDisplayMax(d))
  const legsForExtremes =
    durationsMinutes.length ?
      legs.filter((l) => isWithinKpiSegmentDisplayMax(l.durationMinutes))
    : legs
  return {
    circuitCode,
    fromCode,
    toCode,
    label: formatTransitionLabel(fromCode, toCode),
    transitionKey: `${fromCode}→${toCode}`,
    stats: computeStayTimeStats(durationsMinutes),
    durationsMinutes,
    ...resolveExtremeLegs(legsForExtremes),
  }
}

function rebuildSegmentTimingIndexFromLegs(legs: SegmentLeg[]): SegmentTimingIndex {
  const bucketLegs = new Map<string, SegmentLeg[]>()
  const journeyIds = new Set<string>()

  for (const leg of legs) {
    journeyIds.add(leg.journeyId)
    const key = `${leg.executiveCircuitCode}|${leg.fromCode}|${leg.toCode}`
    const arr = bucketLegs.get(key) ?? []
    arr.push(leg)
    bucketLegs.set(key, arr)
  }

  const aggregates: SegmentTimingAggregate[] = []
  for (const [key, legRows] of bucketLegs.entries()) {
    const [circuitCode, fromCode, toCode] = key.split('|')
    if (!circuitCode || !fromCode || !toCode) continue
    aggregates.push(aggregateFromLegs(circuitCode, fromCode, toCode, legRows))
  }

  const aggregatesByCircuit: Record<string, SegmentTimingAggregate[]> = {}
  for (const agg of aggregates) {
    const list = aggregatesByCircuit[agg.circuitCode] ?? []
    list.push(agg)
    aggregatesByCircuit[agg.circuitCode] = list
  }
  for (const code of Object.keys(aggregatesByCircuit)) {
    aggregatesByCircuit[code] = listCircuitSegmentAggregates(
      { legs, aggregates, aggregatesByCircuit, circuitCodes: [], journeyCount: journeyIds.size },
      code
    )
  }

  const canonicalAggregates = Object.values(aggregatesByCircuit).flat()

  return {
    legs,
    aggregates: sortAggregates(canonicalAggregates),
    aggregatesByCircuit,
    circuitCodes: sortCircuitCodes(
      Object.keys(aggregatesByCircuit).filter((c) => getCircuitSegmentTemplate(c).length >= 2)
    ),
    journeyCount: journeyIds.size,
  }
}

/** Filtra KPI de tiempos por journeys (p. ej. por producto del merge). */
export function filterSegmentTimingIndex(
  index: SegmentTimingIndex,
  allowedJourneyIds: Set<string> | null
): SegmentTimingIndex {
  if (!allowedJourneyIds) return index
  return rebuildSegmentTimingIndexFromLegs(index.legs.filter((l) => allowedJourneyIds.has(l.journeyId)))
}

/** Une R5 y R6 bajo un solo circuito virtual para tablas y gráficos (misma plantilla KPI). */
export function mergeVolcableReceiptSegmentTiming(index: SegmentTimingIndex): SegmentTimingIndex {
  const legs = index.legs
    .filter((l) => isVolcableReceiptCircuit(l.executiveCircuitCode))
    .map((l) => ({ ...l, executiveCircuitCode: VOLCABLE_RECEIPT_KPI_UNION_CODE }))
  return rebuildSegmentTimingIndexFromLegs(legs)
}

/** Cámaras de entrada a planta Ricardone (ingreso / preingreso). */
export const RICARDONE_ENTRY_CODES = new Set(['INGRESO', 'PREINGRESO'])

/**
 * ¿El circuito entra por Ricardone? (su template arranca en ingreso o preingreso).
 * Los circuitos que arrancan en San Lorenzo (SL1, R27, R34…) no aplican esta regla.
 */
export function circuitRequiresRicardoneEntry(circuitCode: string): boolean {
  const tpl = getCircuitSegmentTemplate(circuitCode)
  return RICARDONE_ENTRY_CODES.has(String(tpl[0] ?? ''))
}

/** ¿El camión pasó por cámara de ingreso o preingreso? (ancla de entrada real). */
export function journeyHasRicardoneEntryAnchor(journey: ReconstructedRealJourney): boolean {
  return collapsedFrontLogicalPoints(journey).some((p) => RICARDONE_ENTRY_CODES.has(p.code))
}

export function buildSegmentTimingIndex(
  journeys: ClassifiedJourneyForTiming[],
  options?: { committeeGroups?: CommitteeGroup[] }
): SegmentTimingIndex {
  const allowedGroups = new Set(options?.committeeGroups ?? ['COMPLETOS'])
  const legs: SegmentLeg[] = []
  let excludedNoEntryAnchor = 0

  for (const row of journeys) {
    if (!allowedGroups.has(row.committeeGroup)) continue
    const circuitCode = String(row.executiveCircuitCode ?? '').trim()
    if (!circuitCode) continue
    // Regla de negocio: en circuitos que entran por Ricardone, un camión sin paso por
    // cámara de ingreso NI preingreso tiene tiempos por tramo falsos → no se cuenta en el KPI.
    if (circuitRequiresRicardoneEntry(circuitCode) && !journeyHasRicardoneEntryAnchor(row.journey)) {
      excludedNoEntryAnchor++
      continue
    }
    for (const leg of extractAllSegmentLegsForCircuit(row.journey, circuitCode)) {
      if (!isExpectedCircuitTransition(circuitCode, leg.fromCode, leg.toCode)) continue
      legs.push(leg)
    }
  }

  return { ...rebuildSegmentTimingIndexFromLegs(legs), excludedNoEntryAnchor }
}

function resolveExcelFirstSegmentCircuitCode(row: {
  resolved_executive_circuit_code?: string
  truckflow_circuit_code?: string
}): string {
  const fromExcel = String(row.resolved_executive_circuit_code ?? '').trim()
  if (fromExcel) return fromExcel
  const fromTruckflow = String(row.truckflow_circuit_code ?? '').trim()
  if (fromTruckflow && getCircuitSegmentTemplate(fromTruckflow).length >= 2) return fromTruckflow
  return ''
}

/** KPI tiempos desde tramos Excel-first (analysis_ready_for_scatter). */
export function buildSegmentTimingIndexFromExcelFirstSegments(
  rows: Array<{
    analysis_ready_for_scatter: boolean
    external_operation_id?: string
    journey_uid: string
    plate_normalized: string
    segment_from: string
    segment_to: string
    segment_start_time?: string
    segment_end_time?: string
    segment_duration_min: number
    truckflow_circuit_code: string
    resolved_executive_circuit_code?: string
    resolved_circuit_family?: string
    external_salida_at?: string
    external_calado_at?: string
    external_ingreso_at?: string
    platform_normalized?: string
    planta_normalized?: string
    external_sl_balanza_entrada_at?: string
    external_sl_balanza_salida_at?: string
  }>,
  comiteOpts?: SlBalanzaComiteOptions
): SegmentTimingIndex {
  const bestByOperationTransition = new Map<string, SegmentLeg>()
  const timedSegmentsByOperation = new Map<
    string,
    {
      plate: string
      circuitCode: string
      segments: Array<{
        segment_from: string
        segment_to: string
        segment_start_time: string
        segment_end_time: string
      }>
      externalSalidaAt?: string
      externalCaladoAt?: string
      externalIngresoAt?: string
      platformNormalized?: string
      plantaNormalized?: string
      externalSlBalanzaEntradaAt?: string
      externalSlBalanzaSalidaAt?: string
    }
  >()

  const rememberTimedSegment = (
    operationId: string,
    plate: string,
    circuitCode: string,
    row: {
      segment_from: string
      segment_to: string
      segment_start_time?: string
      segment_end_time?: string
      external_salida_at?: string
      external_calado_at?: string
      external_ingreso_at?: string
      platform_normalized?: string
      planta_normalized?: string
      external_sl_balanza_entrada_at?: string
      external_sl_balanza_salida_at?: string
    }
  ) => {
    const start = String(row.segment_start_time ?? '').trim()
    const end = String(row.segment_end_time ?? '').trim()
    if (!start || !end) return
    const bucket =
      timedSegmentsByOperation.get(operationId) ??
      {
        plate,
        circuitCode,
        segments: [],
        externalSalidaAt: String(row.external_salida_at ?? '').trim() || undefined,
        externalCaladoAt: String(row.external_calado_at ?? '').trim() || undefined,
        externalIngresoAt: String(row.external_ingreso_at ?? '').trim() || undefined,
        platformNormalized: String(row.platform_normalized ?? '').trim() || undefined,
        plantaNormalized: String(row.planta_normalized ?? '').trim() || undefined,
        externalSlBalanzaEntradaAt:
          String(row.external_sl_balanza_entrada_at ?? '').trim() || undefined,
        externalSlBalanzaSalidaAt:
          String(row.external_sl_balanza_salida_at ?? '').trim() || undefined,
      }
    bucket.segments.push({
      segment_from: row.segment_from,
      segment_to: row.segment_to,
      segment_start_time: start,
      segment_end_time: end,
    })
    if (!bucket.externalSalidaAt && row.external_salida_at) {
      bucket.externalSalidaAt = String(row.external_salida_at).trim() || undefined
    }
    if (!bucket.externalCaladoAt && row.external_calado_at) {
      bucket.externalCaladoAt = String(row.external_calado_at).trim() || undefined
    }
    if (!bucket.externalIngresoAt && row.external_ingreso_at) {
      bucket.externalIngresoAt = String(row.external_ingreso_at).trim() || undefined
    }
    if (!bucket.platformNormalized && row.platform_normalized) {
      bucket.platformNormalized = String(row.platform_normalized).trim() || undefined
    }
    if (!bucket.plantaNormalized && row.planta_normalized) {
      bucket.plantaNormalized = String(row.planta_normalized).trim() || undefined
    }
    if (!bucket.externalSlBalanzaEntradaAt && row.external_sl_balanza_entrada_at) {
      bucket.externalSlBalanzaEntradaAt =
        String(row.external_sl_balanza_entrada_at).trim() || undefined
    }
    if (!bucket.externalSlBalanzaSalidaAt && row.external_sl_balanza_salida_at) {
      bucket.externalSlBalanzaSalidaAt =
        String(row.external_sl_balanza_salida_at).trim() || undefined
    }
    timedSegmentsByOperation.set(operationId, bucket)
  }

  const pushOperationLeg = (leg: SegmentLeg, source: 'measured' | 'synth') => {
    const dedupeKey = `${leg.journeyId}|${leg.executiveCircuitCode}|${leg.fromCode}|${leg.toCode}`
    const prev = bestByOperationTransition.get(dedupeKey)
    if (!prev) {
      bestByOperationTransition.set(dedupeKey, leg)
      return
    }
    const max =
      isVolcableReceiptCircuit(leg.executiveCircuitCode) &&
      !isShortOperationalTransition(leg.fromCode, leg.toCode) ?
        VOLCABLE_RECEIPT_KPI_MAX_MINUTES
      : maxAllowedMinutesForTransition(leg.fromCode, leg.toCode)
    const prevOk =
      isValidKpiLegDuration(prev.durationMinutes, leg.executiveCircuitCode, leg.fromCode, leg.toCode) &&
      prev.durationMinutes <= max
    const legOk =
      isValidKpiLegDuration(leg.durationMinutes, leg.executiveCircuitCode, leg.fromCode, leg.toCode) &&
      leg.durationMinutes <= max
    const balanzaStay = isBalanzaStayKpiTransition(leg.fromCode, leg.toCode)
    if (source === 'measured' && legOk && !balanzaStay) {
      bestByOperationTransition.set(dedupeKey, leg)
      return
    }
    if (!prevOk && legOk) {
      bestByOperationTransition.set(dedupeKey, leg)
      return
    }
    if (prevOk && legOk) {
      if (balanzaStay) {
        if (leg.durationMinutes > prev.durationMinutes) {
          bestByOperationTransition.set(dedupeKey, leg)
        }
        return
      }
      if (leg.durationMinutes < prev.durationMinutes) {
        bestByOperationTransition.set(dedupeKey, leg)
      }
    }
  }

  for (const r of rows) {
    if (!r.analysis_ready_for_scatter) continue
    const circuitCode = resolveExcelFirstSegmentCircuitCode(r)
    const operationId = String(r.external_operation_id ?? r.journey_uid ?? '').trim()
    if (!circuitCode || !operationId) continue
    rememberTimedSegment(operationId, String(r.plate_normalized ?? ''), circuitCode, r)
  }

  for (const [operationId, bucket] of timedSegmentsByOperation) {
    const synthLegs =
      isVolcableReceiptCircuit(bucket.circuitCode) ?
        synthesizeVolcableReceiptKpiLegsForOperation({
          operationId,
          plate: bucket.plate,
          executiveCircuitCode: bucket.circuitCode,
          segments: bucket.segments,
          externalCaladoAt: bucket.externalCaladoAt,
          externalSalidaAt: bucket.externalSalidaAt,
          externalIngresoAt: bucket.externalIngresoAt,
          platformNormalized: bucket.platformNormalized,
          plantaNormalized: bucket.plantaNormalized,
        })
      : synthesizeInferredRollupLegsFromTimedSegments({
          operationId,
          plate: bucket.plate,
          executiveCircuitCode: bucket.circuitCode,
          segments: bucket.segments,
          externalCaladoAt: bucket.externalCaladoAt,
          externalSalidaAt: bucket.externalSalidaAt,
          externalIngresoAt: bucket.externalIngresoAt,
          platformNormalized: bucket.platformNormalized,
          plantaNormalized: bucket.plantaNormalized,
          externalSlBalanzaEntradaAt: bucket.externalSlBalanzaEntradaAt,
          externalSlBalanzaSalidaAt: bucket.externalSlBalanzaSalidaAt,
        })
    for (const leg of synthLegs) {
      if (!isExpectedCircuitTransition(leg.executiveCircuitCode, leg.fromCode, leg.toCode)) continue
      if (
        leg.fromCode === SL_BALANZA_ROLLUP_TRANSITION.from &&
        leg.toCode === SL_BALANZA_ROLLUP_TRANSITION.to
      ) {
        continue
      }
      if (!isValidKpiLegDuration(leg.durationMinutes, leg.executiveCircuitCode, leg.fromCode, leg.toCode)) {
        continue
      }
      pushOperationLeg(leg, 'synth')
    }
  }

  for (const [operationId, bucket] of timedSegmentsByOperation) {
    const salida = String(bucket.externalSalidaAt ?? '').trim()
    if (!salida) continue
    const { opSegments, truckflowPoints: opPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments: bucket.segments,
      externalIngresoAt: bucket.externalIngresoAt,
      externalSalidaAt: bucket.externalSalidaAt,
      externalCaladoAt: bucket.externalCaladoAt,
      plantaNormalized: bucket.plantaNormalized,
      executiveCircuitCode: bucket.circuitCode,
    })
    const payload = buildSlBalanzaEgresoComiteScatterPayload(
      opSegments,
      opPoints,
      salida,
      bucket.externalIngresoAt,
      enrichedPoints,
      comiteOpts
    )
    if (!payload) continue
    pushOperationLeg(
      {
        journeyId: operationId,
        plate: bucket.plate,
        executiveCircuitCode: bucket.circuitCode,
        fromCode: SL_BALANZA_ROLLUP_TRANSITION.from,
        toCode: SL_BALANZA_ROLLUP_TRANSITION.to,
        durationMinutes: payload.segment_duration_min,
      },
      'measured'
    )
  }

  for (const r of rows) {
    if (!r.analysis_ready_for_scatter) continue
    const fromCode = String(r.segment_from ?? '').trim()
    const toCode = String(r.segment_to ?? '').trim()
    const circuitCode = resolveExcelFirstSegmentCircuitCode(r)
    const operationId = String(r.external_operation_id ?? r.journey_uid ?? '').trim()
    const duration = Number(r.segment_duration_min)
    if (!fromCode || !toCode || !circuitCode || !operationId) continue
    if (!Number.isFinite(duration) || duration <= 0) continue

    if (!isExpectedCircuitTransition(circuitCode, fromCode, toCode)) continue

    if (
      fromCode === SL_BALANZA_ROLLUP_TRANSITION.from &&
      toCode === SL_BALANZA_ROLLUP_TRANSITION.to
    ) {
      const bucket = timedSegmentsByOperation.get(operationId)
      const comiteCtx =
        bucket ?
          buildSlComiteTruckflowContext({
            segments: bucket.segments,
            externalIngresoAt: bucket.externalIngresoAt ?? r.external_ingreso_at,
            externalSalidaAt: bucket.externalSalidaAt ?? r.external_salida_at,
            externalCaladoAt: bucket.externalCaladoAt ?? r.external_calado_at,
            plantaNormalized: bucket.plantaNormalized ?? r.planta_normalized,
            executiveCircuitCode: circuitCode,
          })
        : {
            opSegments: [] as TimedSegmentInput[],
            truckflowPoints: [] as TimedLogicalPoint[],
            enrichedPoints: [] as TimedLogicalPoint[],
          }
      const payload = buildSlBalanzaEgresoComiteScatterPayload(
        comiteCtx.opSegments,
        comiteCtx.truckflowPoints,
        String(r.external_salida_at ?? ''),
        r.external_ingreso_at,
        comiteCtx.enrichedPoints,
        comiteOpts
      )
      if (payload) {
        pushOperationLeg(
          {
            journeyId: operationId,
            plate: String(r.plate_normalized ?? ''),
            executiveCircuitCode: circuitCode,
            fromCode,
            toCode,
            durationMinutes: payload.segment_duration_min,
          },
          'measured'
        )
      }
      continue
    }

    if (!isValidKpiLegDuration(duration, circuitCode, fromCode, toCode)) continue
    pushOperationLeg(
      {
        journeyId: operationId,
        plate: String(r.plate_normalized ?? ''),
        executiveCircuitCode: circuitCode,
        fromCode,
        toCode,
        durationMinutes: duration,
      },
      'measured'
    )
  }

  // Regla de entrada (misma que el path Truckflow): en circuitos Ricardone, descartar
  // operaciones cuyo camión no tiene NINGÚN tramo que toque ingreso ni preingreso — son
  // datos falsos que ensucian el KPI por tramo. La señal se toma de los legs finales
  // (medidos o reconstruidos), no de filas crudas: el ingreso Excel-first se sintetiza.
  const allLegs = [...bestByOperationTransition.values()]
  const operationsWithEntry = new Set<string>()
  for (const leg of allLegs) {
    if (RICARDONE_ENTRY_CODES.has(leg.fromCode) || RICARDONE_ENTRY_CODES.has(leg.toCode)) {
      operationsWithEntry.add(leg.journeyId)
    }
  }
  const keptLegs: SegmentLeg[] = []
  const excludedOps = new Set<string>()
  for (const leg of allLegs) {
    if (circuitRequiresRicardoneEntry(leg.executiveCircuitCode) && !operationsWithEntry.has(leg.journeyId)) {
      excludedOps.add(leg.journeyId)
      continue
    }
    keptLegs.push(leg)
  }

  return { ...rebuildSegmentTimingIndexFromLegs(keptLegs), excludedNoEntryAnchor: excludedOps.size }
}

/** Operaciones Excel únicas con al menos un tramo en el circuito (KPI Excel-first). */
export function countUniqueOperationsForCircuit(
  index: SegmentTimingIndex,
  circuitCode: string
): number {
  const ids = new Set<string>()
  for (const leg of index.legs) {
    if (leg.executiveCircuitCode === circuitCode) ids.add(leg.journeyId)
  }
  return ids.size
}

export function segmentTimingKpiCsv(index: SegmentTimingIndex): string {
  const headers = [
    'executive_circuit_code',
    'from_logical',
    'to_logical',
    'transition_label',
    'n',
    'mean_min',
    'min_min',
    'min_plate',
    'max_min',
    'max_plate',
    'std_min',
    'median_min',
    'p90_min',
  ]
  const rows = index.aggregates
    .filter((a) => a.stats.count > 0)
    .map((a) => ({
    executive_circuit_code: a.circuitCode,
    from_logical: a.fromCode,
    to_logical: a.toCode,
    transition_label: a.label,
    n: a.stats.count,
    mean_min: a.stats.mean.toFixed(2),
    min_min: a.stats.min.toFixed(2),
    min_plate: a.minPlate,
    max_min: a.stats.max.toFixed(2),
    max_plate: a.maxPlate,
    std_min: a.stats.std.toFixed(2),
    median_min: a.stats.median.toFixed(2),
    p90_min: a.stats.p90.toFixed(2),
  }))
  return recordsToCsv(headers, rows)
}

export function segmentTimingLegsCsv(index: SegmentTimingIndex): string {
  const headers = [
    'executive_circuit_code',
    'journey_id',
    'plate',
    'from_logical',
    'to_logical',
    'transition_label',
    'duration_min',
  ]
  const rows = index.legs.map((leg) => ({
    executive_circuit_code: leg.executiveCircuitCode,
    journey_id: leg.journeyId,
    plate: leg.plate,
    from_logical: leg.fromCode,
    to_logical: leg.toCode,
    transition_label: formatTransitionLabel(leg.fromCode, leg.toCode),
    duration_min: leg.durationMinutes.toFixed(2),
  }))
  return recordsToCsv(headers, rows)
}

/** Candidato de duración balanza ingreso → egreso (varias rutas del pipeline KPI). */
export type BalanzaStayCandidateDiagnostic = {
  source: string
  durationMinutes: number
  segment_start_time: string
  segment_end_time: string
  kpiValid: boolean
  notes: string[]
}

/** Traza para auditar pérdida o sustitución de tiempos reales en estadía balanza Ricardone. */
export type BalanzaStayTimingDiagnostic = {
  operationId: string
  plate: string
  executiveCircuitCode: string
  externalIngresoAt?: string
  externalCaladoAt?: string
  externalSalidaAt?: string
  truckflowTimeline: TimedLogicalPoint[]
  enrichedTimeline: TimedLogicalPoint[]
  rawBalanzaCameraEvents: Array<{
    deviceCode: string
    sectorCode: string
    occurredAt: string
    logicalCode: string
    rearCamera: boolean
  }>
  /** Primera B1 → última B2 posteriores (solo cámaras / timeline Truckflow). */
  cameraBalanzaStayMinutes: number | null
  candidates: BalanzaStayCandidateDiagnostic[]
  kpiWinnerMinutes: number | null
  kpiWinnerSource: string | null
  flags: string[]
}

export type BalanzaStayTimedSegmentsInput = {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: TimedSegmentInput[]
  externalCaladoAt?: string
  externalSalidaAt?: string
  platformNormalized?: string
  externalIngresoAt?: string
  plantaNormalized?: string
}

function listBalanzaCameraEvents(journey: ReconstructedRealJourney) {
  const out: BalanzaStayTimingDiagnostic['rawBalanzaCameraEvents'] = []
  for (const e of journey.events) {
    const norm = normalizeRealEventPoint(e)
    if (norm.logicalCode !== 'BALANZA_INGRESO' && norm.logicalCode !== 'BALANZA_EGRESO') continue
    out.push({
      deviceCode: String(e.deviceCode ?? ''),
      sectorCode: String(e.sectorCode ?? ''),
      occurredAt: eventOperationalInstantForTimeline(e),
      logicalCode: norm.logicalCode,
      rearCamera: isEtlRearCameraDevice(e.deviceCode),
    })
  }
  return out.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
}

function computeCameraBalanzaStayMinutesFromEvents(
  events: BalanzaStayTimingDiagnostic['rawBalanzaCameraEvents']
): number | null {
  const b1Ms = events
    .filter((e) => e.logicalCode === 'BALANZA_INGRESO')
    .map((e) => parseTimestampMs(e.occurredAt))
    .filter(Number.isFinite)
  const b2Ms = events
    .filter((e) => e.logicalCode === 'BALANZA_EGRESO')
    .map((e) => parseTimestampMs(e.occurredAt))
    .filter(Number.isFinite)
  if (!b1Ms.length || !b2Ms.length) return null
  const start = Math.min(...b1Ms)
  const after = b2Ms.filter((ms) => ms > start)
  if (!after.length) return null
  return (Math.max(...after) - start) / 60_000
}

function computeCameraBalanzaStayMinutesFromTimeline(points: TimedLogicalPoint[]): number | null {
  const b1Ms = points
    .filter((p) => p.code === 'BALANZA_INGRESO')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
  const b2Ms = points
    .filter((p) => p.code === 'BALANZA_EGRESO')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
  if (!b1Ms.length || !b2Ms.length) return null
  const start = Math.min(...b1Ms)
  const after = b2Ms.filter((ms) => ms > start)
  if (!after.length) return null
  return (Math.max(...after) - start) / 60_000
}

function explainDischargeRollupEndpoints(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  rule: DischargeKpiRollupRule,
  externalSalidaAt?: string
): { start: string; end: string; notes: string[] } | null {
  const notes: string[] = []
  const volcableReceipt =
    isVolcableReceiptCircuit(executiveCircuitCode) &&
    rule.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
    rule.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  const fromIdx = findRollupFromIdx(points, rule.fromCode, volcableReceipt)
  if (fromIdx < 0) return null
  notes.push(
    volcableReceipt ?
      'inicio_rollup=último BALANZA_INGRESO (Volcable R5/R6)'
    : 'inicio_rollup=primer BALANZA_INGRESO'
  )
  const fromMs = parseTimestampMs(points[fromIdx]!.occurredAt)
  if (!Number.isFinite(fromMs)) return null

  if (volcableReceipt) {
    let endAt = ''
    const camIdx = findRollupEndIdxLatest(points, fromIdx, rule.endCodes)
    if (camIdx >= 0) {
      endAt = points[camIdx]!.occurredAt
      notes.push(`fin_rollup=cámara (${points[camIdx]!.code}, último hito)`)
    }
    const salida = pickExcelTimestampAfter(fromMs, undefined, externalSalidaAt, false)
    const salMs = parseTimestampMs(salida)
    const endMs = endAt ? parseTimestampMs(endAt) : Number.NaN
    if (Number.isFinite(salMs) && salMs > fromMs && (!Number.isFinite(endMs) || salMs > endMs)) {
      endAt = salida
      notes.push('fin_rollup=external_salida_at (más tarde que cámara)')
    }
    if (!endAt) return null
    return { start: points[fromIdx]!.occurredAt, end: endAt, notes }
  }

  const endIdx = findRollupEndIdx(points, fromIdx, rule.endCodes)
  if (endIdx < 0) return null
  notes.push(`fin_rollup=primer ${points[endIdx]!.code} tras ingreso (no el último B2)`)
  return { start: points[fromIdx]!.occurredAt, end: points[endIdx]!.occurredAt, notes }
}

function buildEnrichedTimelineForBalanzaDiagnosis(
  input: BalanzaStayTimedSegmentsInput
): { truckflowPoints: TimedLogicalPoint[]; enrichedPoints: TimedLogicalPoint[] } {
  const coherentSegments = selectCoherentSegmentGroup(
    input.segments,
    input.externalIngresoAt,
    input.externalSalidaAt
  )
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  let enrichedPoints = injectIngresoFromExcel(truckflowPoints, input.externalIngresoAt)
  enrichedPoints = injectCaladaFromExcel(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt
  )
  enrichedPoints = enrichTimelineWithExcelDischarge(
    enrichedPoints,
    input.executiveCircuitCode,
    input.externalCaladoAt,
    input.externalSalidaAt,
    input.platformNormalized,
    input.externalIngresoAt
  )
  if (isVolcableReceiptCircuit(input.executiveCircuitCode)) {
    enrichedPoints = injectVolcableReceiptExcelOperationalTimeline(
      enrichedPoints,
      coherentSegments,
      input.externalIngresoAt,
      input.externalCaladoAt,
      input.externalSalidaAt
    )
  }
  return { truckflowPoints, enrichedPoints }
}

function pushBalanzaStayCandidate(
  list: BalanzaStayCandidateDiagnostic[],
  source: string,
  start: string,
  end: string,
  executiveCircuitCode: string,
  notes: string[] = []
) {
  const durationMinutes = minutesBetweenIso(start, end)
  if (!Number.isFinite(durationMinutes)) return
  list.push({
    source,
    durationMinutes,
    segment_start_time: start,
    segment_end_time: end,
    kpiValid: isValidKpiLegDuration(
      durationMinutes,
      executiveCircuitCode,
      BALANZA_STAY_ROLLUP_TRANSITION.from,
      BALANZA_STAY_ROLLUP_TRANSITION.to
    ),
    notes,
  })
}

function resolveBalanzaStayKpiWinner(
  candidates: BalanzaStayCandidateDiagnostic[],
  executiveCircuitCode: string
): { minutes: number; source: string } | null {
  const stay = candidates.filter(
    (c) => c.kpiValid && c.durationMinutes > 0 && Number.isFinite(c.durationMinutes)
  )
  if (!stay.length) return null
  const measured = stay.find((c) => c.source === 'scatter_measured')
  const synth = stay.filter((c) => c.source !== 'scatter_measured')
  if (!synth.length) {
    return measured ? { minutes: measured.durationMinutes, source: measured.source } : null
  }
  let best = synth[0]!
  for (const c of synth.slice(1)) {
    if (isVolcableReceiptCircuit(executiveCircuitCode)) {
      if (c.durationMinutes > best.durationMinutes) best = c
    } else if (c.durationMinutes < best.durationMinutes) {
      best = c
    }
  }
  if (measured && measured.durationMinutes > best.durationMinutes) {
    return { minutes: measured.durationMinutes, source: measured.source }
  }
  return { minutes: best.durationMinutes, source: best.source }
}

function buildBalanzaStayFlags(input: {
  executiveCircuitCode: string
  cameraBalanzaStayMinutes: number | null
  candidates: BalanzaStayCandidateDiagnostic[]
  kpiWinnerMinutes: number | null
  enrichedTimeline: TimedLogicalPoint[]
  externalSalidaAt?: string
  rawBalanzaCameraEvents: BalanzaStayTimingDiagnostic['rawBalanzaCameraEvents']
}): string[] {
  const flags: string[] = []
  if (input.enrichedTimeline.filter((p) => p.code === 'BALANZA_INGRESO').length > 1) {
    flags.push('MULTIPLE_BALANZA_INGRESO_EN_TIMELINE')
  }
  if (input.enrichedTimeline.filter((p) => p.code === 'BALANZA_EGRESO').length > 1) {
    flags.push('MULTIPLE_BALANZA_EGRESO_EN_TIMELINE')
  }
  const rearB2 = input.rawBalanzaCameraEvents.some(
    (e) => e.logicalCode === 'BALANZA_EGRESO' && e.rearCamera
  )
  const frontB2 = input.rawBalanzaCameraEvents.some(
    (e) => e.logicalCode === 'BALANZA_EGRESO' && !e.rearCamera
  )
  if (rearB2 && !frontB2) flags.push('EGRESO_BALANZA_SOLO_CAMARA_TRASERA')

  const salMs = parseTimestampMs(input.externalSalidaAt ?? '')
  if (
    Number.isFinite(salMs) &&
    input.enrichedTimeline.some(
      (p) => p.code === 'BALANZA_EGRESO' && parseTimestampMs(p.occurredAt) === salMs
    )
  ) {
    flags.push('EXCEL_SALIDA_USADA_COMO_BALANZA_EGRESO')
  }

  const rollup = input.candidates.find((c) => c.source === 'excel_discharge_rollup')
  const template = input.candidates.find((c) => c.source === 'excel_template_chain')
  if (rollup && template && Math.abs(rollup.durationMinutes - template.durationMinutes) >= 15) {
    flags.push('ROLLUP_VS_TEMPLATE_GAP>=15MIN')
  }
  if (
    input.kpiWinnerMinutes != null &&
    input.cameraBalanzaStayMinutes != null &&
    Math.abs(input.kpiWinnerMinutes - input.cameraBalanzaStayMinutes) >= 15
  ) {
    flags.push('KPI_VS_CAMARA_DELTA>=15MIN')
  }
  const winner = input.candidates.find((c) => c.durationMinutes === input.kpiWinnerMinutes)
  if (
    winner?.source === 'excel_discharge_rollup' &&
    template &&
    winner.durationMinutes > template.durationMinutes
  ) {
    flags.push('KPI_GANO_ROLLUP_EXCEL_LARGO')
  }
  if (
    input.kpiWinnerMinutes != null &&
    input.kpiWinnerMinutes < BALANZA_STAY_MIN_MINUTES &&
    !isVolcableReceiptCircuit(input.executiveCircuitCode)
  ) {
    flags.push('DEBAJO_MINIMO_10MIN_NO_ENTRA_KPI')
  }
  return flags
}

function supportsBalanzaStayKpi(circuitCode: string): boolean {
  return CIRCUITS_WITH_BALANZA_STAY_ROLLUP.has(normalizeExecutiveCircuitForKpi(circuitCode))
}

/** Excel-first: compara cámara, template, rollup y ganador KPI para una operación. */
export function diagnoseBalanzaStayFromTimedSegments(
  input: BalanzaStayTimedSegmentsInput,
  opts?: {
    measuredBalanzaStay?: Pick<
      SegmentLegWithTimes,
      'durationMinutes' | 'segment_start_time' | 'segment_end_time'
    >
  }
): BalanzaStayTimingDiagnostic | null {
  const executiveCircuitCode = normalizeExecutiveCircuitForKpi(input.executiveCircuitCode)
  if (!supportsBalanzaStayKpi(executiveCircuitCode)) return null

  const { truckflowPoints, enrichedPoints } = buildEnrichedTimelineForBalanzaDiagnosis(input)
  const candidates: BalanzaStayCandidateDiagnostic[] = []

  const camMin = computeCameraBalanzaStayMinutesFromTimeline(truckflowPoints)
  if (camMin != null) {
    const b1 = truckflowPoints
      .filter((p) => p.code === 'BALANZA_INGRESO')
      .sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))[0]
    const b2 = truckflowPoints
      .filter((p) => p.code === 'BALANZA_EGRESO')
      .sort((a, b) => parseTimestampMs(b.occurredAt) - parseTimestampMs(a.occurredAt))
      .pop()
    if (b1 && b2) {
      pushBalanzaStayCandidate(candidates, 'truckflow_timeline', b1.occurredAt, b2.occurredAt, executiveCircuitCode, [
        'solo puntos derivados de tramos scatter (sin Excel)',
      ])
    }
  }

  const templateLeg = synthesizeTemplateChainLegsFromTimedSegments(input).find(
    (l) => l.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from && l.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
  if (templateLeg) {
    pushBalanzaStayCandidate(
      candidates,
      'excel_template_chain',
      templateLeg.segment_start_time,
      templateLeg.segment_end_time,
      executiveCircuitCode,
      [
        'cadena template; BALANZA_EGRESO puede venir de timeline enriquecido (Excel)',
        `timelineSource B2=${timelineSourceForTemplatePoint('BALANZA_EGRESO', executiveCircuitCode)}`,
      ]
    )
  }

  const rule = getDischargeKpiRollupRules(executiveCircuitCode).find(
    (r) =>
      r.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
      r.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
  if (rule) {
    const endpoints = explainDischargeRollupEndpoints(
      enrichedPoints,
      executiveCircuitCode,
      rule,
      input.externalSalidaAt
    )
    if (endpoints) {
      pushBalanzaStayCandidate(
        candidates,
        'excel_discharge_rollup',
        endpoints.start,
        endpoints.end,
        executiveCircuitCode,
        endpoints.notes
      )
    }
  }

  if (isVolcableReceiptCircuit(executiveCircuitCode)) {
    const merged = synthesizeVolcableReceiptKpiLegsForOperation(input).find(
      (l) =>
        l.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
        l.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
    )
    if (merged) {
      pushBalanzaStayCandidate(
        candidates,
        'excel_volcable_merged',
        merged.segment_start_time,
        merged.segment_end_time,
        executiveCircuitCode,
        ['merge Volcable: se queda el tramo balanza más largo']
      )
    }
  }

  if (opts?.measuredBalanzaStay) {
    const m = opts.measuredBalanzaStay
    pushBalanzaStayCandidate(
      candidates,
      'scatter_measured',
      m.segment_start_time,
      m.segment_end_time,
      executiveCircuitCode,
      ['tramo B1→B2 medido en filas scatter (si existía consecutivo)']
    )
  }

  const winner = resolveBalanzaStayKpiWinner(candidates, executiveCircuitCode)
  const flags = buildBalanzaStayFlags({
    executiveCircuitCode,
    cameraBalanzaStayMinutes: camMin,
    candidates,
    kpiWinnerMinutes: winner?.minutes ?? null,
    enrichedTimeline: enrichedPoints,
    externalSalidaAt: input.externalSalidaAt,
    rawBalanzaCameraEvents: [],
  })

  return {
    operationId: input.operationId,
    plate: input.plate,
    executiveCircuitCode,
    externalIngresoAt: input.externalIngresoAt,
    externalCaladoAt: input.externalCaladoAt,
    externalSalidaAt: input.externalSalidaAt,
    truckflowTimeline: truckflowPoints,
    enrichedTimeline: enrichedPoints,
    rawBalanzaCameraEvents: [],
    cameraBalanzaStayMinutes: camMin,
    candidates,
    kpiWinnerMinutes: winner?.minutes ?? null,
    kpiWinnerSource: winner?.source ?? null,
    flags,
  }
}

/** Journey Truckflow: eventos B1/B2, rollup descarga y tramos consecutivos (frente). */
export function diagnoseBalanzaStayFromJourney(
  journey: ReconstructedRealJourney,
  executiveCircuitCode: string
): BalanzaStayTimingDiagnostic | null {
  const circuit = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  if (!supportsBalanzaStayKpi(circuit)) return null

  const rawBalanzaCameraEvents = listBalanzaCameraEvents(journey)
  const cameraBalanzaStayMinutes = computeCameraBalanzaStayMinutesFromEvents(rawBalanzaCameraEvents)
  const frontPoints = collapsedFrontLogicalPoints(journey)
  const dischargePoints = collapsedLogicalPointsForDischargeRollup(journey)
  const candidates: BalanzaStayCandidateDiagnostic[] = []

  for (let i = 0; i < frontPoints.length - 1; i++) {
    const from = frontPoints[i]!
    const to = frontPoints[i + 1]!
    if (from.code !== BALANZA_STAY_ROLLUP_TRANSITION.from || to.code !== BALANZA_STAY_ROLLUP_TRANSITION.to) {
      continue
    }
    pushBalanzaStayCandidate(
      candidates,
      'journey_consecutive_front',
      from.occurredAt,
      to.occurredAt,
      circuit,
      ['solo cámaras frente; egreso balanza trasera no aparece aquí']
    )
  }

  const rule = getDischargeKpiRollupRules(circuit).find(
    (r) =>
      r.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
      r.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
  if (rule) {
    const endpoints = explainDischargeRollupEndpoints(dischargePoints, circuit, rule)
    if (endpoints) {
      pushBalanzaStayCandidate(
        candidates,
        'journey_discharge_rollup',
        endpoints.start,
        endpoints.end,
        circuit,
        [...endpoints.notes, 'incluye RicB1/B2/B3 egreso (trasera permitida)']
      )
    }
  }

  const withTimes = extractSegmentLegsWithTimes(journey, circuit).find(
    (l) =>
      l.fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
      l.toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
  if (withTimes?.segment_start_time && withTimes.segment_end_time) {
    pushBalanzaStayCandidate(
      candidates,
      'journey_extract_all',
      withTimes.segment_start_time,
      withTimes.segment_end_time,
      circuit,
      ['extractSegmentLegsWithTimes (rollup + consecutivos)']
    )
  }

  const winner = resolveBalanzaStayKpiWinner(candidates, circuit)
  const flags = buildBalanzaStayFlags({
    executiveCircuitCode: circuit,
    cameraBalanzaStayMinutes,
    candidates,
    kpiWinnerMinutes: winner?.minutes ?? null,
    enrichedTimeline: dischargePoints,
    rawBalanzaCameraEvents,
  })

  return {
    operationId: journey.journeyUid,
    plate: journey.normalizedPlate || journey.plate,
    executiveCircuitCode: circuit,
    truckflowTimeline: frontPoints.filter((p) =>
      ['BALANZA_INGRESO', 'BALANZA_EGRESO', 'VOLCABLE', 'CELDA16_CARGA', 'CELDA16_DESCARGA'].includes(
        p.code
      )
    ),
    enrichedTimeline: dischargePoints.filter((p) =>
      ['BALANZA_INGRESO', 'BALANZA_EGRESO', 'VOLCABLE', 'CELDA16_CARGA', 'CELDA16_DESCARGA'].includes(
        p.code
      )
    ),
    rawBalanzaCameraEvents,
    cameraBalanzaStayMinutes,
    candidates,
    kpiWinnerMinutes: winner?.minutes ?? null,
    kpiWinnerSource: winner?.source ?? null,
    flags,
  }
}

export function balanzaStayDiagnosticsToCsv(rows: BalanzaStayTimingDiagnostic[]): string {
  const headers = [
    'operation_id',
    'plate',
    'executive_circuit_code',
    'camera_stay_min',
    'kpi_winner_min',
    'kpi_winner_source',
    'flags',
    'external_salida_at',
    'external_calado_at',
    'candidates_json',
  ]
  const body = rows.map((r) => ({
    operation_id: r.operationId,
    plate: r.plate,
    executive_circuit_code: r.executiveCircuitCode,
    camera_stay_min:
      r.cameraBalanzaStayMinutes != null ? r.cameraBalanzaStayMinutes.toFixed(2) : '',
    kpi_winner_min: r.kpiWinnerMinutes != null ? r.kpiWinnerMinutes.toFixed(2) : '',
    kpi_winner_source: r.kpiWinnerSource ?? '',
    flags: r.flags.join('|'),
    external_salida_at: r.externalSalidaAt ?? '',
    external_calado_at: r.externalCaladoAt ?? '',
    candidates_json: JSON.stringify(r.candidates),
  }))
  return recordsToCsv(headers, body)
}

/** Diagnóstico R7: balanza ingreso (S1) → salida/egreso (S7 o Excel). */
export type R7SlBalanzaSalidaDiagnostic = {
  operationId: string
  plate: string
  executiveCircuitCode: string
  externalIngresoAt?: string
  externalCaladoAt?: string
  externalSalidaAt?: string
  /** Primera lectura S1 en timeline Truckflow (SLZBalIngFte). */
  slBalanzaIngresoCameraAt: string | null
  /** Última SL_EGRESO en Truckflow después de S1. */
  slEgresoCameraAt: string | null
  trustedS1Camera: boolean
  dedicatedS1Segment: boolean
  kpiEndpoints: SlBalanzaRollupKpiEndpoints | null
  comite: SlBalanzaComiteEvaluation
  rawDurationMinutes: number | null
  correctedDurationMinutes: number | null
  plantOffsetMinutes: number
  flags: string[]
}

function isR7SlBalanzaKpiCircuit(circuitCode: string): boolean {
  const c = String(circuitCode ?? '').trim()
  return c === 'R7' || CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(c)
}

function buildR7SlBalanzaSalidaFlags(input: {
  trustedS1: boolean
  dedicatedS1: boolean
  kpi: SlBalanzaRollupKpiEndpoints | null
  comite: SlBalanzaComiteEvaluation
  rawDurationMinutes: number | null
  plantOffsetMinutes: number
  externalSalidaAt?: string
  slEgresoCameraAt: string | null
  slBalanzaIngresoCameraAt: string | null
  correctedDurationMinutes: number | null
}): string[] {
  const flags: string[] = []
  if (!input.externalSalidaAt?.trim()) flags.push('SIN_SALIDA_EXCEL')
  if (!input.trustedS1 && !input.slBalanzaIngresoCameraAt) flags.push('SIN_INICIO_BALANZA_CAMARA')
  if (input.trustedS1) flags.push('INICIO_CAMARA_S1')
  if (input.dedicatedS1) flags.push('SEGMENTO_DEDICADO_S1_S5')
  if (input.kpi?.fin_fuente === 'excel_salida') flags.push('FIN_SALIDA_EXCEL')
  if (input.kpi?.fin_fuente === 'truckflow') flags.push('FIN_CAMARA_EGRESO_S7')
  if (!input.kpi && input.comite.payload?.horario_fuente_fin === 'excel_salida') {
    flags.push('FIN_SALIDA_EXCEL')
  }
  if (!input.kpi && input.comite.payload?.horario_fuente_fin === 'truckflow') {
    flags.push('FIN_CAMARA_EGRESO_S7')
  }
  if (!input.kpi && input.comite.reason === 'ok') {
    flags.push('KPI_ROLLUP_NULL_COMITE_OK')
  }
  if (input.comite.reason === 'inicio_anchored_excel_ric') {
    flags.push('RECHAZO_INICIO_ANCLADO_INGRESO_RIC')
  }
  if (input.plantOffsetMinutes > 0) flags.push('CORRECCION_PLANTA_MENOS_120MIN')
  if (input.slBalanzaIngresoCameraAt && input.slEgresoCameraAt && input.externalSalidaAt) {
    const camDur = minutesBetweenIso(input.slBalanzaIngresoCameraAt, input.slEgresoCameraAt)
    const salMs = parseTimestampMs(input.externalSalidaAt)
    const s1Ms = parseTimestampMs(input.slBalanzaIngresoCameraAt)
    const s7Ms = parseTimestampMs(input.slEgresoCameraAt)
    if (
      Number.isFinite(salMs) &&
      Number.isFinite(s1Ms) &&
      Number.isFinite(s7Ms) &&
      salMs < s7Ms &&
      salMs > s1Ms
    ) {
      flags.push('EXCEL_SALIDA_ANTES_QUE_EGRESO_CAMARA')
    }
    if (
      input.correctedDurationMinutes != null &&
      Number.isFinite(camDur) &&
      Math.abs(input.correctedDurationMinutes - camDur) >= 15
    ) {
      flags.push('KPI_VS_SOLO_CAMERAS_DELTA>=15MIN')
    }
  }
  if (!input.slEgresoCameraAt && input.externalSalidaAt) {
    flags.push('SIN_EGRESO_CAMARA_USA_EXCEL')
  }
  if (input.comite.reason !== 'ok' && input.comite.reason !== 'sin_salida_excel') {
    flags.push(`COMITE_${input.comite.reason.toUpperCase()}`)
  }
  return flags
}

/**
 * R7 / SL rollup: de dónde sale cada extremo del tramo balanza ingreso → egreso
 * (cámara S1, cámara S7, salida Excel, corrección −2 h).
 */
export function diagnoseR7SlBalanzaIngresoSalida(input: {
  operationId: string
  plate: string
  executiveCircuitCode: string
  segments: TimedSegmentInput[]
  externalSalidaAt?: string
  externalCaladoAt?: string
  externalIngresoAt?: string
  plantaNormalized?: string
  comiteOpts?: SlBalanzaComiteOptions
}): R7SlBalanzaSalidaDiagnostic | null {
  const executiveCircuitCode = String(input.executiveCircuitCode ?? '').trim()
  if (!isR7SlBalanzaKpiCircuit(executiveCircuitCode)) return null

  const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
    segments: input.segments,
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
    externalCaladoAt: input.externalCaladoAt,
    plantaNormalized: input.plantaNormalized,
    executiveCircuitCode,
  })

  const camS1 = resolveSlBalanzaIngresoCameraStart(opSegments, truckflowPoints)

  const trustedS1 = isTrustedSlBalanzaIngresoCamera(opSegments, camS1)
  const s1Ms = camS1 ? parseTimestampMs(camS1.occurredAt) : Number.NaN
  const camS7 =
    Number.isFinite(s1Ms) ? latestSlEgresoCameraAfterMs(truckflowPoints, s1Ms) : null

  const dedicatedS1 = hasDedicatedSlBalanzaIngresoCameraSegment(opSegments)

  const kpi = resolveSlBalanzaRollupEndpointsForKpi(truckflowPoints, {
    externalSalidaAt: input.externalSalidaAt,
    externalIngresoAt: input.externalIngresoAt,
    truckflowPoints,
    truckflowSegments: opSegments,
  })

  let rawDurationMinutes: number | null = null
  let correctedDurationMinutes: number | null = null
  let plantOffsetMinutes = 0
  if (kpi) {
    rawDurationMinutes = minutesBetweenIso(kpi.from.occurredAt, kpi.to.occurredAt)
    plantOffsetMinutes = resolveSlBalanzaDescargaPlantOffsetMinutes(rawDurationMinutes)
    const corrected = correctSlBalanzaDescargaStayTiming(
      kpi.from.occurredAt,
      kpi.to.occurredAt,
      { applyPlantOffset: true }
    )
    correctedDurationMinutes = corrected?.durationMinutes ?? null
  }

  const comite = evaluateSlBalanzaComitePayload(
    opSegments,
    truckflowPoints,
    String(input.externalSalidaAt ?? ''),
    input.externalIngresoAt,
    enrichedPoints,
    input.comiteOpts ?? SL_BALANZA_COMITE_PRODUCT_OPTIONS
  )

  const flags = buildR7SlBalanzaSalidaFlags({
    trustedS1,
    dedicatedS1,
    kpi,
    comite,
    rawDurationMinutes,
    plantOffsetMinutes,
    externalSalidaAt: input.externalSalidaAt,
    slEgresoCameraAt: camS7?.occurredAt ?? null,
    slBalanzaIngresoCameraAt: camS1?.occurredAt ?? null,
    correctedDurationMinutes,
  })

  return {
    operationId: input.operationId,
    plate: input.plate,
    executiveCircuitCode,
    externalIngresoAt: input.externalIngresoAt,
    externalCaladoAt: input.externalCaladoAt,
    externalSalidaAt: input.externalSalidaAt,
    slBalanzaIngresoCameraAt: camS1?.occurredAt ?? null,
    slEgresoCameraAt: camS7?.occurredAt ?? null,
    trustedS1Camera: trustedS1,
    dedicatedS1Segment: dedicatedS1,
    kpiEndpoints: kpi,
    comite,
    rawDurationMinutes,
    correctedDurationMinutes,
    plantOffsetMinutes,
    flags,
  }
}

export function r7SlBalanzaSalidaDiagnosticsToCsv(rows: R7SlBalanzaSalidaDiagnostic[]): string {
  const headers = [
    'operation_id',
    'plate',
    'executive_circuit_code',
    's1_camera_at',
    's7_camera_at',
    'external_salida_at',
    'inicio_fuente',
    'fin_fuente',
    'horario_fuente',
    'raw_duration_min',
    'plant_offset_min',
    'kpi_corrected_min',
    'comite_duration_min',
    'comite_reason',
    'trusted_s1',
    'flags',
  ]
  const body = rows.map((r) => ({
    operation_id: r.operationId,
    plate: r.plate,
    executive_circuit_code: r.executiveCircuitCode,
    s1_camera_at: r.slBalanzaIngresoCameraAt ?? '',
    s7_camera_at: r.slEgresoCameraAt ?? '',
    external_salida_at: r.externalSalidaAt ?? '',
    inicio_fuente: r.kpiEndpoints?.inicio_fuente ?? '',
    fin_fuente: r.kpiEndpoints?.fin_fuente ?? '',
    horario_fuente: r.comite.payload?.horario_fuente ?? '',
    raw_duration_min: r.rawDurationMinutes != null ? r.rawDurationMinutes.toFixed(2) : '',
    plant_offset_min: String(r.plantOffsetMinutes),
    kpi_corrected_min:
      r.correctedDurationMinutes != null ? r.correctedDurationMinutes.toFixed(2) : '',
    comite_duration_min:
      r.comite.payload?.segment_duration_min != null ?
        String(r.comite.payload.segment_duration_min)
      : '',
    comite_reason: r.comite.reason,
    trusted_s1: r.trustedS1Camera ? '1' : '0',
    flags: r.flags.join('|'),
  }))
  return recordsToCsv(headers, body)
}
