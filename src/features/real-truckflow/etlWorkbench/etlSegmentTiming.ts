import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { eventOperationalInstantForTimeline } from '../../../services/realEventOperationalTime'
import { computeStayTimeStats, type StayTimeStats } from '../../../services/analyticsKpi'
import { recordsToCsv } from './etlCsv'
import {
  PELLET_DESPACHO_UNIFIED_CODE,
  PELLET_TRANSILE_UNIFIED_CODE,
  unifyPelletCircuitCode,
} from '../../../etl-core/reports/transileExternoCiclo'
import { DEFAULT_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_MATRIX, EXECUTIVE_CIRCUIT_ORDER } from './finalCircuitScoring'
import { isEtlRearCameraDevice } from './etlRearDevices'
import type { CommitteeGroup } from './committeeClassification'

// Reglas y umbrales: ver etlSegmentTimingRules.ts (extraído de este archivo).
import {
  BALANZA_STAY_MIN_MINUTES,
  BALANZA_STAY_ROLLUP_TRANSITION,
  CIRCUITS_WITH_BALANZA_STAY_ROLLUP,
  CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP,
  CIRCUITS_WITH_SL_BALANZA_ROLLUP,
  DISCHARGE_KPI_ROLLUP_BY_CIRCUIT,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  KEPLER_KPI_CHAIN,
  KEPLER_KPI_CIRCUIT_CODES,
  LIQUID_KPI_CHAIN,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  RECEPTION_BALANZA_KPI_CHAIN,
  SL_BALANZA_ROLLUP_TRANSITION,
  SL_INGRESO_BALANZA_ROLLUP_TRANSITION,
  SL_OPERATIONAL_KPI_CHAIN,
  TRANSILE_BRIDGE_KPI_TRANSITIONS,
  VOLCABLE_BALANZA_EGRESO_MAX_MINUTES,
  VOLCABLE_RECEIPT_BALANZA_STAY_MIN_MINUTES,
  VOLCABLE_RECEIPT_KPI_MAX_MINUTES,
  VOLCABLE_RECEIPT_KPI_UNION_CODE,
  demoraThresholdForTransition,
  getDischargeKpiRollupRules,
  isDemoraLegDuration,
  isShortOperationalTransition,
  isVolcableReceiptCircuit,
  isWithinKpiSegmentDisplayMax,
  maxAllowedMinutesForTransition,
  normalizeExecutiveCircuitForKpi,
  usesFullOperationalSegmentTimeline,
  type DischargeKpiRollupRule,
  type SlExcelTimelineAnchors,
} from './etlSegmentTimingRules'

// Superficie pública original preservada.
export {
  BALANZA_STAY_MIN_MINUTES,
  BALANZA_STAY_ROLLUP_TRANSITION,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  KEPLER_KPI_CHAIN,
  KPI_SEGMENT_DISPLAY_MAX_MINUTES,
  LEGACY_KEPLER_EXECUTIVE_ALIASES,
  MAX_SEGMENT_DURATION_MINUTES,
  MIN_SEGMENT_DURATION_MINUTES,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  RECEPTION_BALANZA_KPI_CHAIN,
  SEGMENT_TIMING_HISTOGRAM_BIN_MIN,
  SHORT_SEGMENT_MAX_MINUTES,
  SL_BALANZA_ROLLUP_TRANSITION,
  SL_BALANZA_STAY_MAX_MINUTES,
  SL_EXIT_TRANSIT_DEFAULT_MINUTES,
  SL_INGRESO_BALANZA_ROLLUP_TRANSITION,
  SL_INGRESO_TO_BALANZA_MAX_MINUTES,
  SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES,
  SL_KPI_SEGMENT_MAX_MINUTES,
  SL_OPERATIONAL_KPI_CHAIN,
  SEGMENT_DEMORA_THRESHOLD_MINUTES,
  SL_SALIDA_EGRESO_MAX_MINUTES,
  SL_SALIDA_EGRESO_ROLLUP_TRANSITION,
  TRANSILE_BRIDGE_KPI_TRANSITIONS,
  VOLCABLE_BALANZA_EGRESO_MAX_MINUTES,
  VOLCABLE_RECEIPT_CIRCUIT_CODES,
  VOLCABLE_RECEIPT_KPI_MAX_MINUTES,
  VOLCABLE_RECEIPT_KPI_UNION_CODE,
  demoraThresholdForTransition,
  getDischargeKpiRollupRules,
  histogramBinMinutesForTransition,
  isDemoraLegDuration,
  isShortOperationalTransition,
  isVolcableReceiptCircuit,
  isWithinKpiSegmentDisplayMax,
  kpiCircuitCodesForScatterFilter,
  maxAllowedMinutesForTransition,
  normalizeExecutiveCircuitForKpi,
  shouldUseExcelCaladoAsSlDescarga,
  transitionKey,
} from './etlSegmentTimingRules'
export type {
  DischargeKpiRollupRule,
  SlExcelTimelineAnchors,
} from './etlSegmentTimingRules'
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
  // —— Grupo nuevo S6/S7/S8 (Ricardone) ——
  PLAYA: 'playa 3',
  DESCARGA_S7: 'descarga S7',
  CARGA_S7: 'carga S7',
  CARGA_S8: 'carga S8',
  SL_INGRESO: 'san lorenzo ingreso',
  SL_PREINGRESO: 'preingreso san lorenzo',
  SL_CALADA: 'calada san lorenzo',
  SL_ENLACE: 'enlace san lorenzo',
  SL_BALANZA_INGRESO: 'balanza de entrada',
  SL_BALANZA_SALIDA: 'balanza egreso SL',
  SL_BALANZA_EGRESO: 'balanza egreso SL',
  // Descarga en el volcable del PUERTO San Lorenzo (cámara SLZVolcableC{N}). Distinto del
  // VOLCABLE de Ricardone; por eso su propio código lógico, con la misma etiqueta «volcable».
  SL_VOLCABLE: 'volcable',
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
  'PLAYA',
  'BALANZA_EGRESO',
  'BALANZA',
  'VOLCABLE',
  'CELDA16_CARGA',
  'CELDA16_DESCARGA',
  'DESCARGA_S7',
  'CARGA_S7',
  'CARGA_S8',
  'SL_INGRESO',
  'SL_PREINGRESO',
  'SL_PLAYA',
  'SL_CALADA',
  'SL_ENLACE',
  'SL_BALANZA_INGRESO',
  'SL_BALANZA_SALIDA',
  'SL_BALANZA_EGRESO',
  'SL_DESCARGA',
  'SL_VOLCABLE',
  'SL_TRAMO',
  'SL_ENLACE_FINAL',
  'SL_EGRESO',
  'EGRESO',
]


export type SegmentLegWithTimes = SegmentLeg & {
  segment_start_time: string
  segment_end_time: string
}

/** Leg excluido del KPI de un tramo por superar el umbral de demora (se lista como DEMORADO). */
export type SegmentDemoraLeg = {
  plate: string
  journeyId: string
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
  /** Umbral de demora (min) del tramo; presente solo en tramos con regla (ej. CALADA→EGRESO). */
  demoraThresholdMinutes?: number
  /** Legs excluidos del KPI por superar el umbral, ordenados desc, para listarlos como DEMORADOS. */
  demorados?: SegmentDemoraLeg[]
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
  map.R16 = [...LIQUID_KPI_CHAIN]
  // —— Circuitos Ricardone con destino instrumentado (cámaras nuevas S6/S7/S8) ——
  // Fuente única: estas cadenas alimentan el KPI de tramos Y las anomalías (misma
  // secuencia esperada). Entrada = INGRESO→PREINGRESO→CALADA→BALANZA_INGRESO; el
  // tramo de descarga real va en el medio (no más rollup balanza→balanza).
  const RIC = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO'] as const
  map.R1 = [...RIC, 'CELDA16_DESCARGA', 'PLAYA', 'BALANZA_EGRESO']
  map.R9 = [...RIC, 'CELDA16_CARGA', 'PLAYA', 'BALANZA_EGRESO']
  // Silos Kepler (R3/R4): entrada estándar Ricardone (ingreso→preingreso→calada→balanza) + playa 3
  // y descarga S7 en el medio (cámaras nuevas). El primer tramo operativo es PREINGRESO→CALADA
  // (cola de espera), no INGRESO→CALADA. El tramo de descarga sale de cámara; si falta, queda vacío.
  map.R3 = [...RIC, 'PLAYA', 'DESCARGA_S7', 'BALANZA_EGRESO']
  map.R4 = map.R3
  map.R11 = [...RIC, 'PLAYA', 'DESCARGA_S7', 'BALANZA_EGRESO']
  // Volcable 1/2 (R5/R6): playa 3 + volcable (descarga) en el medio. El rollup
  // Excel-first balanza→balanza sigue calculándose (subsistema Volcable) pero la
  // tabla muestra los tramos finos; si falta la cámara de descarga, queda vacío.
  map.R5 = [...RIC, 'PLAYA', 'VOLCABLE', 'BALANZA_EGRESO']
  map.R6 = map.R5
  map.R12 = [...RIC, 'PLAYA', 'CARGA_S8', 'BALANZA_EGRESO']
  // Transile (R21/R22/R23/R24): descarga en dos etapas. La 2ª playa de la vuelta
  // no se modela (el template es lineal, índice único); se mide hasta la descarga.
  map.R21 = [...RIC, 'PLAYA', 'CARGA_S8', 'CELDA16_DESCARGA', 'BALANZA_EGRESO']
  map.R22 = [...RIC, 'PLAYA', 'CARGA_S8', 'VOLCABLE', 'BALANZA_EGRESO']
  map.R23 = [...RIC, 'PLAYA', 'CARGA_S7', 'CELDA16_DESCARGA', 'BALANZA_EGRESO']
  map.R24 = [...RIC, 'PLAYA', 'CARGA_S7', 'VOLCABLE', 'BALANZA_EGRESO']
  map.R7 = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', ...SL_OPERATIONAL_KPI_CHAIN]
  map.R8 = [...LIQUID_KPI_CHAIN]
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
  map.RS_REC = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO']
  map.RS_DESP = ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'CALADA', 'BALANZA_EGRESO']
  map.R34 = ['LIQUIDO', 'BALANZA_EGRESO']

  // —— Pellet (tolvas 09/10/11 sin cámara; el recorrido pasa por la calada de líquidos) ——
  // Carga pasa por PLAYA 3 entre las balanzas. Despacho (carga y NO va a San Lorenzo): R13/R14/R15.
  const PELLET_DESPACHO_CHAIN = [
    'INGRESO',
    'PREINGRESO',
    'LIQUIDO',
    'BALANZA_INGRESO',
    'PLAYA',
    'BALANZA_EGRESO',
  ] as const
  map.R13 = [...PELLET_DESPACHO_CHAIN]
  map.R14 = [...PELLET_DESPACHO_CHAIN]
  map.R15 = [...PELLET_DESPACHO_CHAIN]
  // Código unificado (los tres subcódigos por celda se miden como uno solo).
  map[PELLET_DESPACHO_UNIFIED_CODE] = [...PELLET_DESPACHO_CHAIN]
  // Transile externo (la carga va a San Lorenzo y descarga allá): R30/R31/R32. Son 9 tramos:
  // ingreso→preingreso, preingreso→calada, calada→balanza(tara), balanza→playa3, playa3→balanza(carga),
  // balanza egreso→SL ingreso (interplanta Ric→SL), SL ingreso→balanza SL, balanza SL→volcable
  // (descarga), volcable→SL egreso (salida/portería).
  const PELLET_TRANSILE_CHAIN = [
    'INGRESO',
    'PREINGRESO',
    'LIQUIDO',
    'BALANZA_INGRESO',
    'PLAYA',
    'BALANZA_EGRESO',
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    // Volcable del PUERTO: la cámara SLZVolcableC{N} emite SL_VOLCABLE (no el VOLCABLE de
    // Ricardone). Con este código, la hora real de la cámara llena el tramo; sin él quedaba vacío.
    'SL_VOLCABLE',
    'SL_EGRESO',
  ] as const
  map.R30 = [...PELLET_TRANSILE_CHAIN]
  map.R31 = [...PELLET_TRANSILE_CHAIN]
  map.R32 = [...PELLET_TRANSILE_CHAIN]
  map[PELLET_TRANSILE_UNIFIED_CODE] = [...PELLET_TRANSILE_CHAIN]
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

import {
  formatArgentinaIsoFromMs,
  normalizeTimestampForExport,
  parseTimestampMs,
} from './etlTimestampNormalize'
// Primitivas de timeline: ver etlTimelinePrimitives.ts (extraído de este archivo).
import {
  buildTimedLogicalTimelineFromSegments,
  collapseTimedPoints,
  inferMidpointBetweenMs,
  isBalanzaStayKpiTransition,
  isValidSegmentDuration,
  minutesBetweenIso,
  selectCoherentSegmentGroup,
  type CollapsedLogicalPoint,
  type SegmentLeg,
  type TimedLogicalPoint,
  type TimedSegmentInput,
} from './etlTimelinePrimitives'

export {
  buildTimedLogicalTimelineFromSegments,
  isValidSegmentDuration,
  selectCoherentSegmentGroup,
} from './etlTimelinePrimitives'
export type {
  SegmentLeg,
  TimedLogicalPoint,
  TimedSegmentInput,
} from './etlTimelinePrimitives'
// Enriquecimiento San Lorenzo: ver etlSegmentTimingSanLorenzo.ts (extraído de este archivo).
import {
  SL_BALANZA_COMITE_PRODUCT_OPTIONS,
  type SlBalanzaComiteEvaluation,
  type SlBalanzaComiteOptions,
  type SlBalanzaRollupKpiEndpoints,
  buildSlBalanzaEgresoComiteScatterPayload,
  buildSlComiteTruckflowContext,
  correctSlBalanzaDescargaStayTiming,
  enrichSlTimelineWithExcelAnchors,
  evaluateSlBalanzaComitePayload,
  extractSlBalancaRollupFromTimeline,
  extractSlSalidaEgresoRollupFromTimeline,
  hasDedicatedSlBalanzaIngresoCameraSegment,
  isTrustedSlBalanzaIngresoCamera,
  latestSlEgresoCameraAfterMs,
  resolveSlBalancaRollupEndpoints,
  resolveSlBalanzaDescargaPlantOffsetMinutes,
  resolveSlBalanzaIngresoCameraStart,
  resolveSlBalanzaIngresoStartPoint,
  resolveSlBalanzaRollupEndpointsForKpi,
  resolveTrustedSlBalanzaIngresoFromSegments,
  segmentsForSlTruckflowTimeline,
} from './etlSegmentTimingSanLorenzo'

export {
  SL_BALANZA_COMITE_MAX_MINUTES,
  SL_BALANZA_COMITE_PRODUCT_OPTIONS,
  SL_BALANZA_TIME_CORRECTION_MINUTES,
  SL_DESCARGA_PLANT_OFFSET_RAW_MINUTES,
  SL_DESCARGA_TIME_CORRECTION_MINUTES,
  buildSlBalanzaComiteOptionsFromTiemposEntrePasos,
  buildSlBalanzaEgresoComiteScatterPayload,
  buildSlComiteTruckflowContext,
  compositeSlScatterHorarioFuente,
  correctSlBalanzaDescargaStayTiming,
  enrichSlTimelineForSalidaEgresoRollup,
  enrichSlTimelineWithExcelAnchors,
  enrichSlTimelineWithExcelSalida,
  evaluateSlBalanzaComitePayload,
  extractSlBalancaRollupFromTimeline,
  extractSlIngresoBalancaRollupFromTimeline,
  extractSlSalidaEgresoRollupFromTimeline,
  hasDedicatedSlBalanzaIngresoCameraSegment,
  injectSlBalanzaFromTiemposEntrePasos,
  isSlBalanzaIngresoAnchoredOnExcelIngreso,
  isTrustedSlBalanzaIngresoCamera,
  repairSlBalanzaScatterSegment,
  resolveSlBalancaRollupEndpoints,
  resolveSlBalanzaDescargaPlantOffsetMinutes,
  resolveSlBalanzaEgresoEndForKpi,
  resolveSlBalanzaEgresoHorarioForKpi,
  resolveSlBalanzaIngresoCameraStart,
  resolveSlBalanzaIngresoStartPoint,
  resolveSlBalanzaRollupEndpointsForKpi,
  segmentsForSlBalanzaKpiHorarios,
  segmentsForSlTruckflowTimeline,
  shouldRejectSlBalanzaScatterForExcelIngreso,
} from './etlSegmentTimingSanLorenzo'
export type {
  SlBalanzaComiteEvaluation,
  SlBalanzaComiteOptions,
  SlBalanzaComiteRejectReason,
  SlBalanzaEgresoComiteScatterPayload,
  SlBalanzaRollupKpiEndpoints,
  SlScatterHorarioFinFuente,
  SlScatterHorarioFuente,
  SlScatterHorarioInicioFuente,
} from './etlSegmentTimingSanLorenzo'

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
  /** Descarga en volcable del puerto (pata I de la vuelta): ancla el hito VOLCABLE del pellet. */
  externalSlVolcableAt?: string
  /** Salida/portería del puerto (pata I de la vuelta): ancla el hito SL_EGRESO del pellet. */
  externalSlEgresoAt?: string
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

  // Pellet de la vuelta: los tiempos del puerto salen de las cámaras (SLZBalIngFte / SLZVolcableC{N}
  // = SL_VOLCABLE / SLZSalidaC1Fte = SL_EGRESO). Solo si un camión NO pasó la cámara del volcable o
  // de la portería, se completa con la pata I del Excel (llegada/salida) — menos preciso. La cámara
  // SIEMPRE tiene prioridad (solo se inyecta el hito que falte).
  const timelineForLegs = injectPelletVolcableExcelAnchors(
    truckflowPoints,
    template,
    input.externalSlVolcableAt,
    input.externalSlEgresoAt
  )

  return extractTemplateChainLegsFromTimeline({
    truckflowPoints: timelineForLegs,
    enrichedPoints,
    executiveCircuitCode: input.executiveCircuitCode,
    journeyId: input.operationId,
    plate: input.plate,
    externalSalidaAt: input.externalSalidaAt,
  })
}

/**
 * Inyecta los hitos VOLCABLE y SL_EGRESO del pellet de la vuelta desde las horas de la pata I del
 * Excel, solo si el template los incluye y la cámara no los trajo (no pisa la cámara). El extractor
 * de tramos lee estos códigos desde la traza Truckflow, así que se agregan ahí.
 */
function injectPelletVolcableExcelAnchors(
  truckflowPoints: TimedLogicalPoint[],
  template: readonly string[],
  externalSlVolcableAt?: string,
  externalSlEgresoAt?: string
): TimedLogicalPoint[] {
  const volcableAt = String(externalSlVolcableAt ?? '').trim()
  const egresoAt = String(externalSlEgresoAt ?? '').trim()
  if (!volcableAt && !egresoAt) return truckflowPoints
  const out = [...truckflowPoints]
  // SL_VOLCABLE (descarga en el volcable del puerto): SOLO si la cámara SLZVolcableC{N} no lo trajo.
  if (
    volcableAt &&
    template.includes('SL_VOLCABLE') &&
    Number.isFinite(parseTimestampMs(volcableAt)) &&
    !out.some((p) => p.code === 'SL_VOLCABLE')
  ) {
    out.push({ code: 'SL_VOLCABLE', occurredAt: volcableAt })
  }
  // SL_EGRESO (salida/portería del puerto): SOLO si la cámara SLZSalidaC1Fte no lo trajo.
  if (
    egresoAt &&
    template.includes('SL_EGRESO') &&
    Number.isFinite(parseTimestampMs(egresoAt)) &&
    !out.some((p) => p.code === 'SL_EGRESO')
  ) {
    out.push({ code: 'SL_EGRESO', occurredAt: egresoAt })
  }
  return collapseTimedPoints(
    out.sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
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
  externalSlVolcableAt?: string
  externalSlEgresoAt?: string
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
      externalSlVolcableAt: input.externalSlVolcableAt,
      externalSlEgresoAt: input.externalSlEgresoAt,
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
  // Tramos con regla de demora (ej. CALADA→EGRESO): los legs por encima del umbral se
  // sacan del KPI (media/histograma/extremos) y se listan aparte como DEMORADOS.
  const demoraThreshold = demoraThresholdForTransition(fromCode, toCode)
  let kpiLegs = legs
  let demorados: SegmentDemoraLeg[] | undefined
  if (demoraThreshold != null) {
    const kept: SegmentLeg[] = []
    const slow: SegmentDemoraLeg[] = []
    for (const l of legs) {
      if (isDemoraLegDuration(l.durationMinutes, fromCode, toCode)) {
        slow.push({ plate: l.plate, journeyId: l.journeyId, durationMinutes: l.durationMinutes })
      } else {
        kept.push(l)
      }
    }
    kpiLegs = kept
    demorados = slow.sort((a, b) => b.durationMinutes - a.durationMinutes)
  }

  const durationsMinutes = kpiLegs
    .map((l) => l.durationMinutes)
    .filter((d) => isWithinKpiSegmentDisplayMax(d))
  const legsForExtremes =
    durationsMinutes.length ?
      kpiLegs.filter((l) => isWithinKpiSegmentDisplayMax(l.durationMinutes))
    : kpiLegs
  return {
    circuitCode,
    fromCode,
    toCode,
    label: formatTransitionLabel(fromCode, toCode),
    transitionKey: `${fromCode}→${toCode}`,
    stats: computeStayTimeStats(durationsMinutes),
    durationsMinutes,
    ...(demoraThreshold != null ? { demoraThresholdMinutes: demoraThreshold, demorados } : {}),
    ...resolveExtremeLegs(legsForExtremes),
  }
}

export function rebuildSegmentTimingIndexFromLegs(legs: SegmentLeg[]): SegmentTimingIndex {
  const bucketLegs = new Map<string, SegmentLeg[]>()
  const journeyIds = new Set<string>()

  for (const leg of legs) {
    journeyIds.add(leg.journeyId)
    // Pellet unificado: R13/14/15 y R30/31/32 se miden como un solo circuito en el KPI.
    const circuitCode = unifyPelletCircuitCode(leg.executiveCircuitCode)
    const key = `${circuitCode}|${leg.fromCode}|${leg.toCode}`
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

/**
 * Une el KPI por tramo medido con cámaras y el medido con el Excel.
 *
 * Por qué existe: el Excel de Movimientos solo trae ingreso, calado y salida — los pasos
 * intermedios venían del libro «Tiempos entre pasos», que quedó viejo y ya no se usa. Así
 * que del lado Excel solo se pueden medir tramos que arranquen en INGRESO, y las cadenas
 * completas (preingreso → calada → egreso → ingreso SL) solo existen en las cámaras.
 *
 * Antes el índice Excel-first **reemplazaba** al de cámaras, y bastaba una sola fila Excel
 * para que el KPI se quedara sin R7, R1, R5, R6 y R8. Acá se unen por recorrido + tramo:
 * el mismo tramo del mismo recorrido no se cuenta dos veces, y cuando los dos relojes lo
 * miden gana el del Excel (marca administrativa, más confiable que la cámara para
 * ingreso/salida).
 */
export function mergeSegmentTimingIndexes(
  cameraIndex: SegmentTimingIndex,
  excelIndex: SegmentTimingIndex,
  opts?: {
    /**
     * `external_operation_id` → `journey_uid`. Necesario para deduplicar: los tramos del
     * Excel se identifican por operación y los de cámara por journey, así que sin este
     * mapa el mismo viaje medido por los dos lados entraría dos veces al promedio.
     */
    journeyUidByOperationId?: Map<string, string> | null
  }
): SegmentTimingIndex {
  const alias = opts?.journeyUidByOperationId
  const legKey = (l: SegmentLeg) => {
    const journey = alias?.get(l.journeyId) || l.journeyId
    return `${journey}|${l.executiveCircuitCode}|${l.fromCode}|${l.toCode}`
  }
  const merged = new Map<string, SegmentLeg>()
  for (const leg of cameraIndex.legs) merged.set(legKey(leg), leg)
  // El Excel se aplica después: sobrescribe el tramo cuando ya venía de cámara.
  for (const leg of excelIndex.legs) merged.set(legKey(leg), leg)
  return rebuildSegmentTimingIndexFromLegs([...merged.values()])
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
    external_sl_volcable_at?: string
    external_sl_egreso_at?: string
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
      externalSlVolcableAt?: string
      externalSlEgresoAt?: string
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
      external_sl_volcable_at?: string
      external_sl_egreso_at?: string
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
        externalSlVolcableAt: String(row.external_sl_volcable_at ?? '').trim() || undefined,
        externalSlEgresoAt: String(row.external_sl_egreso_at ?? '').trim() || undefined,
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
    if (!bucket.externalSlVolcableAt && row.external_sl_volcable_at) {
      bucket.externalSlVolcableAt = String(row.external_sl_volcable_at).trim() || undefined
    }
    if (!bucket.externalSlEgresoAt && row.external_sl_egreso_at) {
      bucket.externalSlEgresoAt = String(row.external_sl_egreso_at).trim() || undefined
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
          externalSlVolcableAt: bucket.externalSlVolcableAt,
          externalSlEgresoAt: bucket.externalSlEgresoAt,
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
