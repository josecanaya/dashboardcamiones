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

export function transitionKey(fromCode: string, toCode: string): string {
  return `${fromCode}→${toCode}`
}

export function maxAllowedMinutesForTransition(fromCode: string, toCode: string): number {
  return SHORT_SEGMENT_MAX_MINUTES[transitionKey(fromCode, toCode)] ?? MAX_SEGMENT_DURATION_MINUTES
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
  map.R7 = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', 'SL_INGRESO']
  map.R19 = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO']
  map.R20 = map.R19
  map.RS_REC = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO']
  map.RS_DESP = ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'CALADA', 'BALANZA_EGRESO']
  map.R26 = ['CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO']
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

export function buildSegmentTimingIndex(
  journeys: ClassifiedJourneyForTiming[],
  options?: { committeeGroups?: CommitteeGroup[] }
): SegmentTimingIndex {
  const allowedGroups = new Set(options?.committeeGroups ?? ['COMPLETOS'])
  const legs: SegmentLeg[] = []
  const bucketLegs = new Map<string, SegmentLeg[]>()
  const journeyIds = new Set<string>()

  for (const row of journeys) {
    if (!allowedGroups.has(row.committeeGroup)) continue
    const circuitCode = String(row.executiveCircuitCode ?? '').trim()
    if (!circuitCode) continue
    journeyIds.add(row.journey.journeyUid)
    for (const leg of extractSegmentLegs(row.journey, circuitCode)) {
      if (!isExpectedCircuitTransition(circuitCode, leg.fromCode, leg.toCode)) continue
      legs.push(leg)
      const key = `${circuitCode}|${leg.fromCode}|${leg.toCode}`
      const arr = bucketLegs.get(key) ?? []
      arr.push(leg)
      bucketLegs.set(key, arr)
    }
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
