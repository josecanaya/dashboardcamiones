import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { computeStayTimeStats, type StayTimeStats } from '../../../services/analyticsKpi'
import { recordsToCsv } from './etlCsv'
import { DEFAULT_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_ORDER } from './finalCircuitScoring'
import { isEtlRearCameraDevice } from './etlRearDevices'
import type { CommitteeGroup } from './committeeClassification'

/** Bins del histograma de tramos largos (minutos). */
export const SEGMENT_TIMING_HISTOGRAM_BIN_MIN = 5

/** Umbral máximo razonable por tramo (8 h). */
export const MAX_SEGMENT_DURATION_MINUTES = 8 * 60

/** Tramos cortos: tope operativo 1 h (outliers excluidos del cálculo). */
export const SHORT_SEGMENT_MAX_MINUTES: Record<string, number> = {
  'INGRESO→PREINGRESO': 60,
  'CALADA→EGRESO': 60,
}

/**
 * Tramo rollup San Lorenzo: balanza ingreso → balanza salida (operación interna completa).
 * Mientras S2/S3/S4 no tengan datos productivos, medimos este salto no consecutivo.
 */
export const SL_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_INGRESO',
  to: 'SL_BALANZA_SALIDA',
} as const

/** Rollup balanza salida → egreso SL (puede haber puntos intermedios S2–S4). */
export const SL_SALIDA_EGRESO_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_SALIDA',
  to: 'SL_EGRESO',
} as const

/** Rollup ingreso SL → balanza ingreso SL (falta cámara S2 u otras intermedias). */
export const SL_INGRESO_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_INGRESO',
  to: 'SL_BALANZA_INGRESO',
} as const

/**
 * Fin de estadía interna SL tras balanza ingreso.
 * Muchos camiones no pasan cámara S5 (balanza salida) pero sí egreso o descarga.
 */
const SL_INTERNAL_STAY_END_CODES = ['SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'] as const

/** Pata SL en KPI tiempos: solo cámaras con datos operativos hoy. */
export const SL_OPERATIONAL_KPI_CHAIN = [
  'SL_INGRESO',
  'SL_BALANZA_INGRESO',
  'SL_BALANZA_SALIDA',
  'SL_EGRESO',
] as const

const CIRCUITS_WITH_SL_BALANZA_ROLLUP = new Set(['R7', 'SL1', 'R26', 'R27'])

/** Puente Ricardone ↔ San Lorenzo en transiles externos (sin cámaras en ruta). */
export const TRANSILE_BRIDGE_KPI_TRANSITIONS = {
  R26: { fromCode: 'BALANZA_EGRESO', toCode: 'SL_INGRESO' },
  R27: { fromCode: 'SL_EGRESO', toCode: 'INGRESO' },
} as const

const CIRCUITS_WITH_TRANSILE_BRIDGE_ROLLUP = new Set(Object.keys(TRANSILE_BRIDGE_KPI_TRANSITIONS))

/** Brecha máxima entre hitos del mismo recorrido operativo (mismo viaje). */
export const OPERATIONAL_TRIP_GAP_MAX_MINUTES = 6 * 60

/** Rollups deducidos / Excel-first: no estimar tramos > 6 h (mezcla de viajes distintos). */
export const INFERRED_KPI_ROLLUP_MAX_MINUTES = 6 * 60

/** Duración máxima del rollup balanza SL (estadía en puerto). */
const SL_BALANZA_ROLLUP_MAX_MINUTES = INFERRED_KPI_ROLLUP_MAX_MINUTES

/** Rollup KPI descarga/carga Ricardone cuando faltan cámaras en Celda 16 / Volcable. */
export type DischargeKpiRollupRule = {
  fromCode: string
  toCode: string
  /** Puntos Truckflow que cierran el tramo (salto no consecutivo). */
  endCodes: readonly string[]
}

const DISCHARGE_KPI_ROLLUP_MAX_MINUTES = INFERRED_KPI_ROLLUP_MAX_MINUTES

const DISCHARGE_KPI_ROLLUP_BY_CIRCUIT: Record<string, DischargeKpiRollupRule[]> = {
  R1: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_DESCARGA',
      endCodes: ['CELDA16_DESCARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_DESCARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R5: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R6: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
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
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
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
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  RK1: [
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
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  RK2: [
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
    {
      fromCode: 'VOLCABLE',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
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
      endCodes: ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'],
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
  return DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[circuitCode] ?? []
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
    return SL_BALANZA_ROLLUP_MAX_MINUTES
  }
  if (key === transitionKey(SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from, SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to)) {
    return SL_BALANZA_ROLLUP_MAX_MINUTES
  }
  for (const rules of Object.values(DISCHARGE_KPI_ROLLUP_BY_CIRCUIT)) {
    for (const rule of rules) {
      if (key === transitionKey(rule.fromCode, rule.toCode)) {
        return DISCHARGE_KPI_ROLLUP_MAX_MINUTES
      }
    }
  }
  return SHORT_SEGMENT_MAX_MINUTES[key] ?? MAX_SEGMENT_DURATION_MINUTES
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
  SL_BALANZA_INGRESO: 'balanza ingreso SL',
  SL_BALANZA_SALIDA: 'balanza salida SL',
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
  map.R7 = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', ...SL_OPERATIONAL_KPI_CHAIN]
  map.R26 = [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'BALANZA_INGRESO',
    'CELDA16_CARGA',
    'BALANZA_EGRESO',
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    'SL_BALANZA_SALIDA',
    'SL_EGRESO',
  ]
  map.R27 = [
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    'SL_BALANZA_SALIDA',
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
  map.RK1 = map.R19
  map.RK2 = map.R19
  map.RS_REC = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO']
  map.RS_DESP = ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'CALADA', 'BALANZA_EGRESO']
  map.R34 = ['LIQUIDO', 'BALANZA_EGRESO']
  return map
}

export const EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE = buildExecutiveCircuitSegmentTemplate()

export function getCircuitSegmentTemplate(circuitCode: string): readonly string[] {
  return EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE[circuitCode] ?? []
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
    fromCode === SL_SALIDA_EGRESO_ROLLUP_TRANSITION.from &&
    toCode === SL_SALIDA_EGRESO_ROLLUP_TRANSITION.to
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
  const bridge = TRANSILE_BRIDGE_KPI_TRANSITIONS[circuitCode as keyof typeof TRANSILE_BRIDGE_KPI_TRANSITIONS]
  if (bridge && fromCode === bridge.fromCode && toCode === bridge.toCode) {
    return true
  }
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
    out.push({ code, occurredAt: String(e.occurredAt ?? '') })
  }
  return out
}

function minutesBetweenIso(isoA: string, isoB: string): number {
  const a = Date.parse(isoA)
  const b = Date.parse(isoB)
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
  return `${logicalPointLabel(fromCode)} → ${logicalPointLabel(toCode)}`
}

export function transitionSortKey(fromCode: string, toCode: string): number {
  const fromIdx = LOGICAL_TRANSITION_ORDER.indexOf(fromCode)
  const toIdx = LOGICAL_TRANSITION_ORDER.indexOf(toCode)
  const fi = fromIdx >= 0 ? fromIdx : 999
  const ti = toIdx >= 0 ? toIdx : 999
  return fi * 1000 + ti
}

export function isValidSegmentDuration(
  minutes: number,
  fromCode?: string,
  toCode?: string
): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false
  const max =
    fromCode && toCode ?
      maxAllowedMinutesForTransition(fromCode, toCode)
    : MAX_SEGMENT_DURATION_MINUTES
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

function isoLocalFromMs(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
  const startMs = Date.parse(String(seg.segment_start_time ?? ''))
  const endMs = Date.parse(String(seg.segment_end_time ?? ''))
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
  const ingMs = Date.parse(String(externalIngresoAt ?? ''))
  const salMs = Date.parse(String(externalSalidaAt ?? ''))
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

  const ingMs = Date.parse(String(externalIngresoAt ?? ''))
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
    if (from && start && Number.isFinite(Date.parse(start))) {
      const prev = pointTimes.get(from)
      if (!prev || Date.parse(start) < Date.parse(prev)) pointTimes.set(from, start)
    }
    if (to && end && Number.isFinite(Date.parse(end))) {
      const prev = pointTimes.get(to)
      if (!prev || Date.parse(end) > Date.parse(prev)) pointTimes.set(to, end)
    }
  }
  return collapseTimedPoints(
    [...pointTimes.entries()]
      .map(([code, occurredAt]) => ({ code, occurredAt }))
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  )
}

/** Quita egresos SL de journeys fragmentados anteriores a balanza salida/ingreso. */
function sanitizeMisplacedSlEgreso(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  const salidaMs = points
    .filter((p) => p.code === 'SL_BALANZA_SALIDA')
    .map((p) => Date.parse(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const balInMs = points
    .filter((p) => p.code === 'SL_BALANZA_INGRESO')
    .map((p) => Date.parse(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const cutoffMs =
    Number.isFinite(salidaMs) ? salidaMs : Number.isFinite(balInMs) ? balInMs : Number.NaN
  if (!Number.isFinite(cutoffMs)) return points

  return points.filter((p) => {
    if (p.code !== 'SL_EGRESO') return true
    const ms = Date.parse(p.occurredAt)
    return Number.isFinite(ms) && ms > cutoffMs
  })
}

function latestSlPointMs(points: TimedLogicalPoint[], codes: readonly string[]): number {
  let max = Number.NaN
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = Date.parse(p.occurredAt)
    if (Number.isFinite(ms) && (!Number.isFinite(max) || ms > max)) max = ms
  }
  return max
}

function earliestSlPointMsAfter(points: TimedLogicalPoint[], codes: readonly string[], afterMs: number): number {
  let min = Number.POSITIVE_INFINITY
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = Date.parse(p.occurredAt)
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
  if (!salida || !Number.isFinite(Date.parse(salida))) return points
  if (resolveSlSalidaEgresoEndpoints(points)) return points

  const salidaMs = Date.parse(salida)
  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_SALIDA', 'SL_BALANZA_INGRESO', 'SL_INGRESO'])
  if (Number.isFinite(anchorMs) && salidaMs <= anchorMs) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_EGRESO', occurredAt: salida }].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    )
  )
}

/** Excel-first: calado del contrato ancla balanza salida SL si falta S5. */
function enrichSlCaladoAsBalanzaSalida(
  points: TimedLogicalPoint[],
  externalCaladoAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_SALIDA')) return points
  const calado = String(externalCaladoAt ?? '').trim()
  const calMs = Date.parse(calado)
  if (!Number.isFinite(calMs)) return points

  const afterMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO', 'SL_INGRESO'])
  if (!Number.isFinite(afterMs) || calMs <= afterMs) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_SALIDA', occurredAt: calado }].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    )
  )
}

/** Infiere balanza ingreso SL entre ingreso SL y el siguiente hito (Truckflow o Excel). */
function inferSlBalanzaIngresoFromTransit(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_INGRESO')) return points
  const ingresoPt = points.find((p) => p.code === 'SL_INGRESO')
  if (!ingresoPt) return points
  const ingresoMs = Date.parse(ingresoPt.occurredAt)
  if (!Number.isFinite(ingresoMs)) return points

  const nextMs = earliestSlPointMsAfter(points, ['SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'], ingresoMs)
  if (!Number.isFinite(nextMs)) return points

  const proxyAt = inferMidpointBetweenMs(ingresoMs, nextMs)
  if (!proxyAt) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_INGRESO', occurredAt: proxyAt }].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    )
  )
}

/** Timeline SL enriquecido: Truckflow + anclas Excel (calado/salida) + tránsitos inferidos. */
export function enrichSlTimelineWithExcelAnchors(
  points: TimedLogicalPoint[],
  externalCaladoAt?: string,
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  let enriched = sanitizeMisplacedSlEgreso(points)
  enriched = inferSlBalanzaIngresoFromTransit(enriched)
  enriched = enrichSlCaladoAsBalanzaSalida(enriched, externalCaladoAt)
  enriched = enrichSlTimelineWithExcelSalida(enriched, externalSalidaAt)
  return enriched
}

function resolveSlSalidaEgresoEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_SALIDA_EGRESO_ROLLUP_TRANSITION
  const salidaPoints = points.filter((p) => p.code === fromCode)
  if (!salidaPoints.length) return null

  const salidaPt = salidaPoints.reduce((latest, p) =>
    Date.parse(p.occurredAt) >= Date.parse(latest.occurredAt) ? p : latest
  )
  const salidaMs = Date.parse(salidaPt.occurredAt)
  if (!Number.isFinite(salidaMs)) return null

  const egresoCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = Date.parse(p.occurredAt)
    return Number.isFinite(ms) && ms > salidaMs
  })
  if (!egresoCandidates.length) return null

  const egresoPt = egresoCandidates.reduce((latest, p) =>
    Date.parse(p.occurredAt) >= Date.parse(latest.occurredAt) ? p : latest
  )
  return { from: salidaPt, to: egresoPt }
}

function resolveSlIngresoBalancaEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_INGRESO_BALANZA_ROLLUP_TRANSITION
  const ingresoPt = points.find((p) => p.code === fromCode)
  if (!ingresoPt) return null
  const ingresoMs = Date.parse(ingresoPt.occurredAt)
  if (!Number.isFinite(ingresoMs)) return null

  const balInCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = Date.parse(p.occurredAt)
    return Number.isFinite(ms) && ms > ingresoMs
  })
  if (balInCandidates.length) {
    const toPt = balInCandidates.reduce((earliest, p) =>
      Date.parse(p.occurredAt) < Date.parse(earliest.occurredAt) ? p : earliest
    )
    return { from: ingresoPt, to: toPt }
  }

  const nextMs = earliestSlPointMsAfter(
    points,
    ['SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'],
    ingresoMs
  )
  if (!Number.isFinite(nextMs)) return null
  const proxyAt = inferMidpointBetweenMs(ingresoMs, nextMs)
  if (!proxyAt) return null
  return { from: ingresoPt, to: { code: toCode, occurredAt: proxyAt } }
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

function findSlBalancaRollupEndIdx(points: TimedLogicalPoint[], fromIdx: number): number {
  for (const endCode of SL_INTERNAL_STAY_END_CODES) {
    const idx = points.findIndex((p, i) => i > fromIdx && p.code === endCode)
    if (idx >= 0) return idx
  }
  return -1
}

export function extractSlBalancaRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: templateToCode } = SL_BALANZA_ROLLUP_TRANSITION
  const fromIdx = points.findIndex((p) => p.code === fromCode)
  if (fromIdx < 0) return null
  const endIdx = findSlBalancaRollupEndIdx(points, fromIdx)
  if (endIdx < 0) return null

  const durationMinutes = minutesBetweenIso(points[fromIdx]!.occurredAt, points[endIdx]!.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, fromCode, templateToCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode: templateToCode,
    durationMinutes,
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
}): SegmentLegWithTimes[] {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(input.executiveCircuitCode)) return []
  if (!input.operationId) return []

  const coherentSegments = selectCoherentSegmentGroup(
    input.segments,
    input.externalIngresoAt,
    input.externalSalidaAt
  )
  let points = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  points = enrichSlTimelineWithExcelAnchors(points, input.externalCaladoAt, input.externalSalidaAt)
  const out: SegmentLegWithTimes[] = []

  const ingresoBalIn = extractSlIngresoBalancaRollupFromTimeline(
    points,
    input.executiveCircuitCode,
    input.operationId,
    input.plate
  )
  if (ingresoBalIn) {
    const ingresoEndpoints = resolveSlIngresoBalancaEndpoints(points)
    if (ingresoEndpoints) {
      out.push({
        ...ingresoBalIn,
        segment_start_time: ingresoEndpoints.from.occurredAt,
        segment_end_time: ingresoEndpoints.to.occurredAt,
      })
    }
  }

  const rollup = extractSlBalancaRollupFromTimeline(
    points,
    input.executiveCircuitCode,
    input.operationId,
    input.plate
  )
  if (rollup) {
    const fromIdx = points.findIndex((p) => p.code === SL_BALANZA_ROLLUP_TRANSITION.from)
    const endIdx = findSlBalancaRollupEndIdx(points, fromIdx)
    if (fromIdx >= 0 && endIdx >= 0) {
      out.push({
        ...rollup,
        segment_start_time: points[fromIdx]!.occurredAt,
        segment_end_time: points[endIdx]!.occurredAt,
      })
    }
  }
  const salidaEgreso = extractSlSalidaEgresoRollupFromTimeline(
    points,
    input.executiveCircuitCode,
    input.operationId,
    input.plate
  )
  if (salidaEgreso) {
    const endpoints = resolveSlSalidaEgresoEndpoints(points)
    if (endpoints) {
      out.push({
        ...salidaEgreso,
        segment_start_time: endpoints.from.occurredAt,
        segment_end_time: endpoints.to.occurredAt,
      })
    }
  }
  return out
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

function pickExcelTimestampAfter(
  afterMs: number,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  preferCalado = true
): string {
  const calado = String(externalCaladoAt ?? '').trim()
  const salida = String(externalSalidaAt ?? '').trim()
  const calMs = Date.parse(calado)
  const salMs = Date.parse(salida)
  if (preferCalado && Number.isFinite(calMs) && calMs > afterMs) return calado
  if (Number.isFinite(salMs) && salMs > afterMs) return salida
  if (!preferCalado && Number.isFinite(calMs) && calMs > afterMs) return calado
  return ''
}

function resolveDefaultC16LogicalCode(circuitCode: string): 'CELDA16_CARGA' | 'CELDA16_DESCARGA' {
  if (circuitCode === 'R1' || circuitCode === 'R27') return 'CELDA16_DESCARGA'
  return 'CELDA16_CARGA'
}

function isKeplerFamilyPlatform(platformNormalized?: string): boolean {
  return /KEPPLER|KEPLER/i.test(String(platformNormalized ?? ''))
}

/** RK1/RK2 o plataforma Kepler: calado Excel = descarga en silo (Volcable), no paso por C16. */
function isKeplerSiloDischargeCircuit(circuitCode: string, platformNormalized?: string): boolean {
  return ['RK1', 'RK2'].includes(circuitCode) || isKeplerFamilyPlatform(platformNormalized)
}

/** Tránsito C16 antes del calado Kepler (Excel-first: calado reservado para silo). */
function inferC16TransitBeforeKeplerCalado(balanzaIngresoMs: number, caladoMs: number): string {
  return inferMidpointBetweenMs(balanzaIngresoMs, caladoMs)
}

/**
 * Excel-first Kepler: external_calado_at = hora de descarga en silo (VOLCABLE).
 * Truckflow aporta balanza/egreso; C16 solo si hay cámara o tránsito inferido antes del calado.
 */
function enrichKeplerSiloAnchorsFromExcel(
  points: TimedLogicalPoint[],
  externalCaladoAt?: string,
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  const enriched = [...points]
  const calado = String(externalCaladoAt ?? '').trim()
  const calMs = Date.parse(calado)
  if (!Number.isFinite(calMs)) return enriched

  if (!enriched.some((p) => p.code === 'VOLCABLE')) {
    enriched.push({ code: 'VOLCABLE', occurredAt: calado })
  }

  const hasC16 = enriched.some(
    (p) => p.code === 'CELDA16_CARGA' || p.code === 'CELDA16_DESCARGA'
  )
  if (!hasC16) {
    const balanzaIdx = enriched.findIndex((p) => p.code === 'BALANZA_INGRESO')
    if (balanzaIdx >= 0) {
      const balMs = Date.parse(enriched[balanzaIdx]!.occurredAt)
      const c16At = inferC16TransitBeforeKeplerCalado(balMs, calMs)
      if (c16At) enriched.push({ code: 'CELDA16_CARGA', occurredAt: c16At })
    } else {
      const c16At = inferC16TransitBeforeKeplerCalado(calMs - 60_000, calMs)
      if (c16At) enriched.push({ code: 'CELDA16_CARGA', occurredAt: c16At })
    }
  }

  return enriched
}

/** Anclas C16 / Volcable / puente transile desde Excel cuando falta cámara en silo o ruta. */
function enrichTimelineWithExcelSiloAnchors(
  points: TimedLogicalPoint[],
  circuitCode: string,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  platformNormalized?: string
): TimedLogicalPoint[] {
  if (isKeplerSiloDischargeCircuit(circuitCode, platformNormalized)) {
    return collapseTimedPoints(
      enrichKeplerSiloAnchorsFromExcel(points, externalCaladoAt, externalSalidaAt).sort(
        (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
      )
    )
  }

  let enriched = [...points]

  const balanzaIdx = enriched.findIndex((p) => p.code === 'BALANZA_INGRESO')
  if (balanzaIdx >= 0) {
    const fromMs = Date.parse(enriched[balanzaIdx]!.occurredAt)
    const hasC16 = enriched.some(
      (p, i) =>
        i > balanzaIdx && (p.code === 'CELDA16_CARGA' || p.code === 'CELDA16_DESCARGA')
    )
    if (!hasC16 && Number.isFinite(fromMs)) {
      const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
      if (anchor) enriched.push({ code: resolveDefaultC16LogicalCode(circuitCode), occurredAt: anchor })
    }
  }

  const c16Idx = enriched.findIndex(
    (p) => p.code === 'CELDA16_CARGA' || p.code === 'CELDA16_DESCARGA'
  )
  const needsVolcable = ['R19', 'R20', 'RK1', 'RK2'].includes(circuitCode)
  if (needsVolcable && c16Idx >= 0) {
    const fromMs = Date.parse(enriched[c16Idx]!.occurredAt)
    const hasVolcable = enriched.some((p, i) => i > c16Idx && p.code === 'VOLCABLE')
    if (!hasVolcable && Number.isFinite(fromMs)) {
      const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
      if (anchor) enriched.push({ code: 'VOLCABLE', occurredAt: anchor })
    }
  }

  const volcIdx = enriched.findIndex((p) => p.code === 'VOLCABLE')
  if (volcIdx >= 0 && c16Idx < 0 && balanzaIdx < 0 && needsVolcable) {
    const volcMs = Date.parse(enriched[volcIdx]!.occurredAt)
    const calado = String(externalCaladoAt ?? '').trim()
    const calMs = Date.parse(calado)
    if (Number.isFinite(volcMs) && Number.isFinite(calMs) && calMs < volcMs) {
      const c16At = inferC16TransitBeforeKeplerCalado(calMs, volcMs)
      if (c16At) enriched.push({ code: 'CELDA16_CARGA', occurredAt: c16At })
    }
  }

  if (circuitCode === 'R26') {
    const ricOutIdx = enriched.findIndex((p) => p.code === 'BALANZA_EGRESO')
    if (ricOutIdx >= 0) {
      const fromMs = Date.parse(enriched[ricOutIdx]!.occurredAt)
      const hasSl = enriched.some((p, i) => i > ricOutIdx && p.code.startsWith('SL_'))
      if (!hasSl && Number.isFinite(fromMs)) {
        const anchor = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
        if (anchor) enriched.push({ code: 'SL_INGRESO', occurredAt: anchor })
      }
    }
  }

  if (circuitCode === 'R27') {
    const slOutIdx = enriched.findIndex((p) => p.code === 'SL_EGRESO')
    if (slOutIdx >= 0) {
      const fromMs = Date.parse(enriched[slOutIdx]!.occurredAt)
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
    enriched.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  )
}

/**
 * Inyecta puntos de descarga/carga y balanza egreso desde Excel cuando Truckflow no los registró.
 * Excel-first: calado/salida del contrato anclan descarga; Truckflow aporta lo observado en cámara.
 */
export function enrichTimelineWithExcelDischarge(
  points: TimedLogicalPoint[],
  circuitCode: string,
  externalCaladoAt?: string,
  externalSalidaAt?: string,
  platformNormalized?: string
): TimedLogicalPoint[] {
  const rules = DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[circuitCode]
  if (!rules?.length) return points

  let enriched = enrichTimelineWithExcelSiloAnchors(
    points,
    circuitCode,
    externalCaladoAt,
    externalSalidaAt,
    platformNormalized
  )
  for (const rule of rules) {
    const fromIdx = enriched.findIndex((p) => p.code === rule.fromCode)
    if (fromIdx < 0) continue
    const fromMs = Date.parse(enriched[fromIdx]!.occurredAt)
    if (!Number.isFinite(fromMs)) continue
    const hasEnd = enriched.some((p, i) => i > fromIdx && rule.endCodes.includes(p.code))
    if (hasEnd) continue

    if (rule.toCode === 'BALANZA_EGRESO') {
      const salidaAt = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, false)
      if (salidaAt) enriched.push({ code: 'BALANZA_EGRESO', occurredAt: salidaAt })
      continue
    }

    if (isKeplerSiloDischargeCircuit(circuitCode, platformNormalized)) {
      if (rule.toCode === 'CELDA16_CARGA' || rule.toCode === 'CELDA16_DESCARGA') continue
      if (rule.toCode === 'VOLCABLE') {
        const calado = String(externalCaladoAt ?? '').trim()
        const calMs = Date.parse(calado)
        if (Number.isFinite(calMs) && calMs > fromMs) {
          enriched.push({ code: 'VOLCABLE', occurredAt: calado })
        }
        continue
      }
    }

    const dischargeAt = pickExcelTimestampAfter(fromMs, externalCaladoAt, externalSalidaAt, true)
    if (dischargeAt) enriched.push({ code: rule.toCode, occurredAt: dischargeAt })
  }

  return collapseTimedPoints(
    enriched.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  )
}

export function extractDischargeRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string,
  rule: DischargeKpiRollupRule
): SegmentLeg | null {
  if (!CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP.has(executiveCircuitCode)) return null
  const fromIdx = points.findIndex((p) => p.code === rule.fromCode)
  if (fromIdx < 0) return null
  const endIdx = findRollupEndIdx(points, fromIdx, rule.endCodes)
  if (endIdx < 0) return null

  const durationMinutes = minutesBetweenIso(points[fromIdx]!.occurredAt, points[endIdx]!.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, rule.fromCode, rule.toCode)) return null
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
}): SegmentLegWithTimes[] {
  const rules = DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[input.executiveCircuitCode]
  if (!rules?.length || !input.operationId) return []

  const coherentSegments = selectCoherentSegmentGroup(
    input.segments,
    input.externalIngresoAt,
    input.externalSalidaAt
  )
  let points = buildTimedLogicalTimelineFromSegments(coherentSegments, {
    externalIngresoAt: input.externalIngresoAt,
    externalSalidaAt: input.externalSalidaAt,
  })
  points = enrichTimelineWithExcelDischarge(
    points,
    input.executiveCircuitCode,
    input.externalCaladoAt,
    input.externalSalidaAt,
    input.platformNormalized
  )

  const out: SegmentLegWithTimes[] = []
  for (const rule of rules) {
    const leg = extractDischargeRollupFromTimeline(
      points,
      input.executiveCircuitCode,
      input.operationId,
      input.plate,
      rule
    )
    if (!leg) continue
    const fromIdx = points.findIndex((p) => p.code === rule.fromCode)
    const endIdx = findRollupEndIdx(points, fromIdx, rule.endCodes)
    if (fromIdx < 0 || endIdx < 0) continue
    out.push({
      ...leg,
      segment_start_time: points[fromIdx]!.occurredAt,
      segment_end_time: points[endIdx]!.occurredAt,
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
}): SegmentLegWithTimes[] {
  return [
    ...synthesizeSlRollupLegsFromTimedSegments({
      operationId: input.operationId,
      plate: input.plate,
      executiveCircuitCode: input.executiveCircuitCode,
      segments: input.segments,
      externalSalidaAt: input.externalSalidaAt,
      externalCaladoAt: input.externalCaladoAt,
      externalIngresoAt: input.externalIngresoAt,
    }),
    ...synthesizeDischargeRollupLegsFromTimedSegments(input),
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
    out.push({ code, occurredAt: String(e.occurredAt ?? '') })
  }
  return out
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
    const durationMinutes = minutesBetweenIso(from.occurredAt, to.occurredAt)
    if (!isValidSegmentDuration(durationMinutes, from.code, to.code)) continue
    legs.push({
      journeyId: journey.journeyUid,
      plate: journey.normalizedPlate || journey.plate,
      executiveCircuitCode,
      fromCode: from.code,
      toCode: to.code,
      durationMinutes,
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
    const durationMinutes = minutesBetweenIso(from.occurredAt, to.occurredAt)
    if (!isValidSegmentDuration(durationMinutes, from.code, to.code)) continue
    legs.push({
      journeyId: journey.journeyUid,
      plate: journey.normalizedPlate || journey.plate,
      executiveCircuitCode,
      fromCode: from.code,
      toCode: to.code,
      durationMinutes,
      segment_start_time: from.occurredAt,
      segment_end_time: to.occurredAt,
    })
  }
  const rollup = extractSlBalancaRollupLeg(journey, executiveCircuitCode)
  if (rollup) {
    const fromIdx = points.findIndex((p) => p.code === SL_BALANZA_ROLLUP_TRANSITION.from)
    const endIdx = findSlBalancaRollupEndIdx(points, fromIdx)
    if (fromIdx >= 0 && endIdx >= 0) {
      legs.push({
        ...rollup,
        segment_start_time: points[fromIdx]!.occurredAt,
        segment_end_time: points[endIdx]!.occurredAt,
      })
    }
  }
  const salidaEgreso = extractSlSalidaEgresoRollupLeg(journey, executiveCircuitCode)
  if (salidaEgreso) {
    const endpoints = resolveSlSalidaEgresoEndpoints(points)
    if (endpoints) {
      legs.push({
        ...salidaEgreso,
        segment_start_time: endpoints.from.occurredAt,
        segment_end_time: endpoints.to.occurredAt,
      })
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
  const salidaEgreso = extractSlSalidaEgresoRollupLeg(journey, executiveCircuitCode)
  if (salidaEgreso) push(salidaEgreso)
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
  const durationsMinutes = legs.map((l) => l.durationMinutes)
  return {
    circuitCode,
    fromCode,
    toCode,
    label: formatTransitionLabel(fromCode, toCode),
    transitionKey: `${fromCode}→${toCode}`,
    stats: computeStayTimeStats(durationsMinutes),
    durationsMinutes,
    ...resolveExtremeLegs(legs),
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

export function buildSegmentTimingIndex(
  journeys: ClassifiedJourneyForTiming[],
  options?: { committeeGroups?: CommitteeGroup[] }
): SegmentTimingIndex {
  const allowedGroups = new Set(options?.committeeGroups ?? ['COMPLETOS'])
  const legs: SegmentLeg[] = []

  for (const row of journeys) {
    if (!allowedGroups.has(row.committeeGroup)) continue
    const circuitCode = String(row.executiveCircuitCode ?? '').trim()
    if (!circuitCode) continue
    for (const leg of extractAllSegmentLegsForCircuit(row.journey, circuitCode)) {
      if (!isExpectedCircuitTransition(circuitCode, leg.fromCode, leg.toCode)) continue
      legs.push(leg)
    }
  }

  return rebuildSegmentTimingIndexFromLegs(legs)
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
  }>
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
    timedSegmentsByOperation.set(operationId, bucket)
  }

  const pushLeg = (leg: SegmentLeg) => {
    const dedupeKey = `${leg.journeyId}|${leg.executiveCircuitCode}|${leg.fromCode}|${leg.toCode}`
    const prev = bestByOperationTransition.get(dedupeKey)
    if (!prev || leg.durationMinutes > prev.durationMinutes) {
      bestByOperationTransition.set(dedupeKey, leg)
    }
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

    rememberTimedSegment(operationId, String(r.plate_normalized ?? ''), circuitCode, r)

    if (!isExpectedCircuitTransition(circuitCode, fromCode, toCode)) continue
    pushLeg({
      journeyId: operationId,
      plate: String(r.plate_normalized ?? ''),
      executiveCircuitCode: circuitCode,
      fromCode,
      toCode,
      durationMinutes: duration,
    })
  }

  for (const [operationId, bucket] of timedSegmentsByOperation) {
    const synthLegs = synthesizeInferredRollupLegsFromTimedSegments({
      operationId,
      plate: bucket.plate,
      executiveCircuitCode: bucket.circuitCode,
      segments: bucket.segments,
      externalCaladoAt: bucket.externalCaladoAt,
      externalSalidaAt: bucket.externalSalidaAt,
      externalIngresoAt: bucket.externalIngresoAt,
      platformNormalized: bucket.platformNormalized,
    })
    for (const leg of synthLegs) {
      if (!isExpectedCircuitTransition(leg.executiveCircuitCode, leg.fromCode, leg.toCode)) continue
      pushLeg(leg)
    }
  }

  return rebuildSegmentTimingIndexFromLegs([...bestByOperationTransition.values()])
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
