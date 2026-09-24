/**
 * Sección de tiempos del informe (KPI por tramo), recortada al período exacto.
 *
 * Reusa los cálculos del dashboard:
 * - Volumen por cuarto de turno y tiempo medio puerta a puerta → `buildQuarterCircuitSummary`
 *   (el mismo que alimenta la ficha de circuito y las bandas Q1–Q4).
 * - Tiempos por planta → **suma de los tiempos medios de los tramos** del template canónico
 *   del circuito (`getCircuitSegmentTemplate`), separando Ricardone de San Lorenzo por el
 *   **tránsito interplanta**. Es la definición del usuario (P18), no la duración por journey.
 *
 * El día es SIEMPRE el día operativo con arranque 22:00, igual que KPI tiempos en pantalla.
 *
 * ## Cómo se fecha un tramo
 *
 * `segment_timing_legs` no tiene columna de fecha, y `etlComposeRuns` devuelve la tabla
 * entera cuando no encuentra una: al componer semanas lunes→domingo para un informe
 * jueves→miércoles, los legs traen días de fuera del período. Cada leg se fecha por el día
 * operativo de su journey (`buildJourneyOperationalDayMap`) y recién ahí se recorta.
 */
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import {
  buildQuarterCircuitSummary,
  FRANJA_HORARIA_ORDER,
  type FranjaHoraria,
  type QuarterCircuitOpInput,
  type QuarterCircuitSummary,
} from '../etlWorkbench/etlSegmentScatterByDay'
import {
  buildJourneyOperationalDayMap,
  operationalDayOfIso,
} from '../etlWorkbench/etlOperationalDay'
import { getCircuitSegmentTemplate } from '../etlWorkbench/etlSegmentTiming'
import {
  isDemoraLegDuration,
  isWithinKpiSegmentDisplayMax,
} from '../etlWorkbench/etlSegmentTimingRules'
import type { ReportPeriod } from './logisticsReportPeriod'

/** Media simple de una lista, o null si está vacía. */
function meanOrNull(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function num(v: unknown): number {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : Number.NaN
}

/** Un tramo del template canónico, con su media y su tamaño de muestra. */
export type TramoStat = {
  from: string
  to: string
  key: string
  planta: 'RICARDONE' | 'INTERPLANTA' | 'SAN_LORENZO'
  mediaMin: number | null
  n: number
}

/**
 * Tiempos por planta = **suma de los tiempos medios de los tramos** de cada planta.
 *
 * Es la definición que usa el usuario (P18: «sumo los tramos manualmente») y el corte entre
 * plantas es exactamente el **tránsito interplanta**: los tramos con los dos extremos en
 * Ricardone suman a Ricardone, los que tienen los dos extremos en San Lorenzo (`SL_*`) suman
 * a San Lorenzo, y el salto de uno a otro es el interplanta, que no suma a ninguna.
 *
 * Es una **suma de medias**, no la media del ciclo: cada tramo tiene su propia muestra, así
 * que `n` se conserva por tramo para poder auditarlo (ver el plan, sección «Tiempos»).
 */
export type PlantLegStats = {
  /** Suma de las medias de los tramos de Ricardone (min). */
  ricMediaMin: number | null
  /** Tramos de Ricardone con muestra. */
  ricTramos: number
  /** Muestra mínima entre los tramos sumados (el eslabón más débil). */
  ricN: number
  /** Suma de las medias de los tramos de San Lorenzo (min). */
  slMediaMin: number | null
  slTramos: number
  slN: number
  /** Media del tránsito interplanta (min). */
  bridgeMediaMin: number | null
  bridgeN: number
  /** Detalle tramo por tramo, para auditar la suma. */
  tramos: TramoStat[]
}

export type TiemposDaySlice = {
  day: string
  /** Volumen y tiempo puerta a puerta del día (regla del dashboard). */
  quarters: QuarterCircuitSummary
  /** Patas por planta del día, desde los recorridos de cámara. */
  plants: PlantLegStats
  /** Recorridos de cámara del circuito ubicados en el día. */
  journeys: number
}

export type TiemposCircuitSection = {
  /** Códigos de circuito incluidos (p. ej. `['R7']`, o los de pellet unificados). */
  circuitCodes: string[]
  /** Resumen del período completo. */
  period: { quarters: QuarterCircuitSummary; plants: PlantLegStats; journeys: number }
  byDay: Map<string, TiemposDaySlice>
  /** Operaciones Excel del circuito en el período (denominador declarado). */
  operations: number
  /** `true` si no hay ninguna operación ni recorrido en el período. */
  empty: boolean
}

export type TiemposInput = {
  excelOperationsCsv?: string
  circuitTimingJourneysCsv?: string
  /** `segment_timing_legs`: tramo a tramo, sin fecha propia (se fecha por el journey). */
  segmentTimingLegsCsv?: string
}

/** ¿El punto pertenece a San Lorenzo? Los de San Lorenzo llevan prefijo `SL_`. */
function isSanLorenzoPoint(code: string): boolean {
  return /^SL_/i.test(String(code ?? '').trim())
}

/** Planta de un tramo según sus extremos. El salto Ricardone → SL es el interplanta. */
export function plantOfTramo(from: string, to: string): TramoStat['planta'] {
  const a = isSanLorenzoPoint(from)
  const b = isSanLorenzoPoint(to)
  if (a && b) return 'SAN_LORENZO'
  if (!a && b) return 'INTERPLANTA'
  return 'RICARDONE'
}

const EMPTY_PLANT_STATS: PlantLegStats = {
  ricMediaMin: null,
  ricTramos: 0,
  ricN: 0,
  slMediaMin: null,
  slTramos: 0,
  slN: 0,
  bridgeMediaMin: null,
  bridgeN: 0,
  tramos: [],
}

/**
 * Suma de medias por tramo, por planta, sobre los tramos del **template canónico** del
 * circuito (no sobre toda transición observada: `INGRESO→CALADA` e `INGRESO→PREINGRESO` son
 * caminos alternativos, sumarlos duplicaría el tiempo).
 *
 * Aplica las mismas exclusiones que el KPI del dashboard: fuera los DEMORADOS del tramo y los
 * que superan el tope de display.
 */
function buildPlantStats(
  legsByTransition: Map<string, number[]>,
  template: readonly string[]
): PlantLegStats {
  if (template.length < 2) return { ...EMPTY_PLANT_STATS }
  const tramos: TramoStat[] = []
  for (let i = 0; i < template.length - 1; i++) {
    const from = template[i]!
    const to = template[i + 1]!
    const durations = legsByTransition.get(`${from}→${to}`) ?? []
    tramos.push({
      from,
      to,
      key: `${from}→${to}`,
      planta: plantOfTramo(from, to),
      mediaMin: meanOrNull(durations),
      n: durations.length,
    })
  }
  const sumOf = (planta: TramoStat['planta']) => {
    const con = tramos.filter((t) => t.planta === planta && t.n > 0)
    if (!con.length) return { media: null as number | null, tramos: 0, n: 0 }
    return {
      media: con.reduce((a, t) => a + (t.mediaMin ?? 0), 0),
      tramos: con.length,
      // El eslabón más débil: la suma no es más confiable que su tramo peor medido.
      n: Math.min(...con.map((t) => t.n)),
    }
  }
  const ric = sumOf('RICARDONE')
  const sl = sumOf('SAN_LORENZO')
  const bridgeTramos = tramos.filter((t) => t.planta === 'INTERPLANTA' && t.n > 0)
  return {
    ricMediaMin: ric.media,
    ricTramos: ric.tramos,
    ricN: ric.n,
    slMediaMin: sl.media,
    slTramos: sl.tramos,
    slN: sl.n,
    bridgeMediaMin: bridgeTramos.length
      ? bridgeTramos.reduce((a, t) => a + (t.mediaMin ?? 0), 0)
      : null,
    bridgeN: bridgeTramos.length ? Math.min(...bridgeTramos.map((t) => t.n)) : 0,
    tramos,
  }
}

/**
 * Construye la sección de tiempos de un circuito (o grupo de circuitos) para el período exacto.
 *
 * `circuitCodes` son los códigos ejecutivos tal como los trae el ETL
 * (`resolved_executive_circuit_code` / `executive_circuit_code`).
 */
export function buildTiemposSection(
  circuitCodes: string[],
  input: TiemposInput,
  period: ReportPeriod
): TiemposCircuitSection {
  const codes = new Set(circuitCodes)
  const periodDays = new Set(period.days)
  // Los legs no tienen fecha: el día operativo sale del journey (o de la operación Excel).
  const dayByJourney = buildJourneyOperationalDayMap({
    circuitTimingJourneysCsv: input.circuitTimingJourneysCsv,
    excelOperationsCsv: input.excelOperationsCsv,
  })

  // —— Operaciones del Excel (volumen por cuarto + puerta a puerta) ——
  const opsByDay = new Map<string, QuarterCircuitOpInput[]>()
  const opsAll: QuarterCircuitOpInput[] = []
  let operations = 0
  if (input.excelOperationsCsv?.trim()) {
    const { rows } = parseCsvToRecords(input.excelOperationsCsv)
    const seen = new Set<string>()
    for (const r of rows) {
      if (!codes.has(String(r.resolved_executive_circuit_code ?? '').trim())) continue
      const id = String(r.external_operation_id ?? '').trim()
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      // El día operativo se define por el mismo ingreso que usa `buildQuarterCircuitSummary`:
      // cámara si existe, si no el Excel.
      const ingreso =
        String(r.truckflow_first_seen_at ?? '').trim() || String(r.external_ingreso_at ?? '').trim()
      const day = operationalDayOfIso(ingreso)
      if (!periodDays.has(day)) continue
      const op: QuarterCircuitOpInput = {
        ingresoCameraAt: r.truckflow_first_seen_at,
        ingresoExcelAt: r.external_ingreso_at,
        salidaExcelAt: r.external_salida_at,
      }
      operations += 1
      opsAll.push(op)
      const list = opsByDay.get(day) ?? []
      list.push(op)
      opsByDay.set(day, list)
    }
  }

  // —— Recorridos de cámara (patas por planta) ——
  const journeyRowsByDay = new Map<string, Record<string, string>[]>()
  const journeyRowsAll: Record<string, string>[] = []
  if (input.circuitTimingJourneysCsv?.trim()) {
    const { rows } = parseCsvToRecords(input.circuitTimingJourneysCsv)
    const seen = new Set<string>()
    for (const r of rows) {
      if (!codes.has(String(r.executive_circuit_code ?? '').trim())) continue
      const id = String(r.journey_id ?? '').trim()
      if (id) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      const day = operationalDayOfIso(String(r.start_time ?? ''))
      if (!periodDays.has(day)) continue
      journeyRowsAll.push(r)
      const list = journeyRowsByDay.get(day) ?? []
      list.push(r)
      journeyRowsByDay.set(day, list)
    }
  }

  // —— Tramos (legs) para la suma de medias por planta ——
  // `segment_timing_legs` no trae fecha: se fecha cada leg por el día operativo de su journey.
  const template = circuitCodes
    .map((c) => getCircuitSegmentTemplate(c))
    .find((t) => t && t.length >= 2) ?? []
  const legsAll = new Map<string, number[]>()
  const legsByDay = new Map<string, Map<string, number[]>>()
  for (const day of period.days) legsByDay.set(day, new Map())
  if (input.segmentTimingLegsCsv?.trim()) {
    const { rows } = parseCsvToRecords(input.segmentTimingLegsCsv)
    const seenLeg = new Set<string>()
    for (const r of rows) {
      if (!codes.has(String(r.executive_circuit_code ?? '').trim())) continue
      const journeyId = String(r.journey_id ?? '').trim()
      const from = String(r.from_logical ?? '').trim()
      const to = String(r.to_logical ?? '').trim()
      const dur = num(r.duration_min)
      if (!from || !to || !Number.isFinite(dur) || dur <= 0) continue
      // Mismas exclusiones que el KPI del dashboard.
      if (isDemoraLegDuration(dur, from, to)) continue
      if (!isWithinKpiSegmentDisplayMax(dur)) continue
      // El día del borde llega por dos corridas: deduplicar el leg.
      const legKey = `${journeyId}|${from}|${to}|${r.duration_min}`
      if (seenLeg.has(legKey)) continue
      seenLeg.add(legKey)
      const day = dayByJourney.get(journeyId) ?? ''
      if (!periodDays.has(day)) continue
      const key = `${from}→${to}`
      const all = legsAll.get(key) ?? []
      all.push(dur)
      legsAll.set(key, all)
      const perDay = legsByDay.get(day)!
      const list = perDay.get(key) ?? []
      list.push(dur)
      perDay.set(key, list)
    }
  }

  const byDay = new Map<string, TiemposDaySlice>()
  for (const day of period.days) {
    const dayOps = opsByDay.get(day) ?? []
    const dayJourneys = journeyRowsByDay.get(day) ?? []
    byDay.set(day, {
      day,
      quarters: buildQuarterCircuitSummary(dayOps, { periodStartDay: period.from }),
      plants: buildPlantStats(legsByDay.get(day)!, template),
      journeys: dayJourneys.length,
    })
  }

  return {
    circuitCodes,
    period: {
      quarters: buildQuarterCircuitSummary(opsAll, { periodStartDay: period.from }),
      plants: buildPlantStats(legsAll, template),
      journeys: journeyRowsAll.length,
    },
    byDay,
    operations,
    empty: operations === 0 && journeyRowsAll.length === 0,
  }
}

export { FRANJA_HORARIA_ORDER }
export type { FranjaHoraria }
