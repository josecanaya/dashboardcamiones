import { recordsToCsv } from './etlCsv'
import { percentile } from '../../../utils/stats'
import { getSectorOccupancyThreshold } from './sectorOccupancyThresholds'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'

export const OCCUPANCY_INTERVAL_MINUTES = 30
export const STOCK_INITIAL_WINDOW_HOURS = 2

const INTERVAL_MS = OCCUPANCY_INTERVAL_MINUTES * 60 * 1000
const STOCK_WINDOW_MS = STOCK_INITIAL_WINDOW_HOURS * 60 * 60 * 1000

export type FranjaOperativaOccupancy = 'Mañana' | 'Tarde' | 'Noche'

export function franjaOperativaFromHour(h: number): FranjaOperativaOccupancy {
  if (h >= 6 && h < 12) return 'Mañana'
  if (h >= 12 && h < 18) return 'Tarde'
  return 'Noche'
}

import { inferPlantaFromSegment } from './etlPlantaFromSegment'

export { inferPlantaFromSegment }

export const STOCK_INITIAL_MOTIVO = 'egreso_en_ventana_2h_sin_ingreso_en_ventana' as const

export type SectorOccupancyEvent = {
  journey_id: string
  patente: string
  producto: string
  circuito: string
  tramo_operativo: string
  sector: string
  planta: string
  timestamp_inicio: string
  timestamp_fin: string
  duracion_minutos: number
  estado_ejecutivo: string
  es_stock_inicial: boolean
  motivo_stock_inicial: string
  fecha_inicio: string
  hora_inicio: string
  fecha_fin: string
  hora_fin: string
}

export type SectorOccupancy30MinRow = {
  planta: string
  producto: string
  circuito: string
  tramo_operativo: string
  sector: string
  intervalo_inicio: string
  intervalo_fin: string
  stock_inicial: number
  ocupacion_inicial: number
  ingresos_intervalo: number
  egresos_intervalo: number
  ingresos_acumulados: number
  egresos_acumulados: number
  ocupacion_estimada: number
  umbral_operativo: number | ''
  sobre_umbral: boolean
  fecha: string
  franja_horaria: FranjaOperativaOccupancy
  label: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoLocalFromMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
}

function fechaFromMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function horaFromMs(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseMs(iso: string): number | null {
  const ts = Date.parse(String(iso ?? '').trim())
  return Number.isFinite(ts) ? ts : null
}

export function scatterRowToOccupancyInput(row: SegmentScatterByDayRow & {
  planta?: string
  sector?: string
  segment_from?: string
}): SectorOccupancyEvent | null {
  const inMs = parseMs(row.timestamp_inicio)
  const outMs = parseMs(row.timestamp_fin)
  if (inMs == null) return null
  const sector = String(row.sector ?? row.tramo_operativo ?? '').trim()
  const planta =
    String(row.planta ?? '').trim() ||
    inferPlantaFromSegment(row.circuito, String(row.segment_from ?? ''))
  return {
    journey_id: row.journey_id,
    patente: row.patente,
    producto: row.producto,
    circuito: row.circuito,
    tramo_operativo: row.tramo_operativo,
    sector,
    planta,
    timestamp_inicio: row.timestamp_inicio,
    timestamp_fin: row.timestamp_fin,
    duracion_minutos: row.duracion_minutos,
    estado_ejecutivo: row.estado_ejecutivo,
    es_stock_inicial: false,
    motivo_stock_inicial: '',
    fecha_inicio: row.fecha_tramo,
    hora_inicio: row.hora_inicio,
    fecha_fin: outMs != null ? fechaFromMs(outMs) : '',
    hora_fin: outMs != null ? horaFromMs(outMs) : '',
  }
}

function journeyIngressInStockWindow(
  events: SectorOccupancyEvent[],
  periodStartMs: number,
  windowEndMs: number
): Set<string> {
  const withIngress = new Set<string>()
  for (const e of events) {
    const inMs = parseMs(e.timestamp_inicio)
    if (inMs != null && inMs >= periodStartMs && inMs <= windowEndMs) {
      withIngress.add(e.journey_id)
    }
  }
  return withIngress
}

export function markStockInitialEvents(
  events: SectorOccupancyEvent[],
  periodStartMs: number
): SectorOccupancyEvent[] {
  const windowEnd = periodStartMs + STOCK_WINDOW_MS
  const ingressJourneys = journeyIngressInStockWindow(events, periodStartMs, windowEnd)
  return events.map((e) => {
    const outMs = parseMs(e.timestamp_fin)
    const egressInWindow =
      outMs != null && outMs >= periodStartMs && outMs <= windowEnd
    const es_stock_inicial = Boolean(egressInWindow && !ingressJourneys.has(e.journey_id))
    return {
      ...e,
      es_stock_inicial,
      motivo_stock_inicial: es_stock_inicial ? STOCK_INITIAL_MOTIVO : '',
    }
  })
}

export function countStockInitialJourneys(events: SectorOccupancyEvent[]): number {
  const ids = new Set<string>()
  for (const e of events) {
    if (e.es_stock_inicial) ids.add(e.journey_id)
  }
  return ids.size
}

export function resolveOccupancyPeriodBounds(
  events: SectorOccupancyEvent[],
  fechasHint: string[] = []
): { startMs: number; endMs: number } | null {
  let minMs = Number.POSITIVE_INFINITY
  let maxMs = Number.NEGATIVE_INFINITY
  for (const e of events) {
    const a = parseMs(e.timestamp_inicio)
    const b = parseMs(e.timestamp_fin)
    if (a != null) {
      minMs = Math.min(minMs, a)
      maxMs = Math.max(maxMs, a)
    }
    if (b != null) {
      maxMs = Math.max(maxMs, b)
    }
  }
  if (fechasHint.length) {
    const sorted = [...fechasHint].sort()
    const first = sorted[0]!
    const last = sorted[sorted.length - 1]!
    const startMs = Date.parse(`${first}T00:00:00`)
    let endMs = Date.parse(`${last}T23:59:59.999`)
    if (Number.isFinite(maxMs)) {
      const endDay = fechaFromMs(maxMs)
      const fromEventsEnd = Date.parse(`${endDay}T23:59:59.999`)
      if (Number.isFinite(fromEventsEnd) && fromEventsEnd > endMs) endMs = fromEventsEnd
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
    return { startMs, endMs }
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null
  const startDay = fechaFromMs(minMs)
  const startMs = Date.parse(`${startDay}T00:00:00`)
  const endDay = fechaFromMs(maxMs)
  const endMs = Date.parse(`${endDay}T23:59:59.999`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { startMs, endMs }
}

export function buildSectorOccupancy30MinSeries(input: {
  events: SectorOccupancyEvent[]
  periodStartMs: number
  periodEndMs: number
  umbralOperativo?: number | null
  producto?: string
}): SectorOccupancy30MinRow[] {
  const events = markStockInitialEvents(input.events, input.periodStartMs)
  const stockInicial = countStockInitialJourneys(events)
  const ocupacionInicial = stockInicial
  const stockJourneyIds = new Set(events.filter((e) => e.es_stock_inicial).map((e) => e.journey_id))

  const meta = events[0]
  const planta = meta?.planta ?? ''
  const producto = input.producto ?? meta?.producto ?? ''
  const circuito = meta?.circuito ?? ''
  const tramo = meta?.tramo_operativo ?? ''
  const sector = meta?.sector ?? tramo
  const umbral =
    input.umbralOperativo != null ?
      input.umbralOperativo
    : getSectorOccupancyThreshold(circuito, sector)

  const rows: SectorOccupancy30MinRow[] = []
  let ingAcum = 0
  let egrAcum = 0

  for (let t = input.periodStartMs; t < input.periodEndMs; t += INTERVAL_MS) {
    const intervalEnd = Math.min(t + INTERVAL_MS, input.periodEndMs)
    let ingInterval = 0
    let egrInterval = 0

    for (const e of events) {
      const inMs = parseMs(e.timestamp_inicio)
      const outMs = parseMs(e.timestamp_fin)
      const skipIngressAsStock = stockJourneyIds.has(e.journey_id)
      if (
        inMs != null &&
        inMs >= input.periodStartMs &&
        inMs >= t &&
        inMs < intervalEnd &&
        !skipIngressAsStock
      ) {
        ingInterval++
      }
      if (outMs != null && outMs >= t && outMs < intervalEnd) egrInterval++
    }

    ingAcum += ingInterval
    egrAcum += egrInterval
    const ocupacion = stockInicial + ingAcum - egrAcum
    const fecha = fechaFromMs(t)
    const hour = new Date(t).getHours()
    const franja = franjaOperativaFromHour(hour)
    const dd = fecha.slice(8, 10)
    const mm = fecha.slice(5, 7)
    const label = `${dd}/${mm} ${pad2(hour)}:${pad2(new Date(t).getMinutes())}`

    rows.push({
      planta,
      producto,
      circuito,
      tramo_operativo: tramo,
      sector,
      intervalo_inicio: isoLocalFromMs(t),
      intervalo_fin: isoLocalFromMs(intervalEnd),
      stock_inicial: stockInicial,
      ocupacion_inicial: ocupacionInicial,
      ingresos_intervalo: ingInterval,
      egresos_intervalo: egrInterval,
      ingresos_acumulados: ingAcum,
      egresos_acumulados: egrAcum,
      ocupacion_estimada: Math.max(0, ocupacion),
      umbral_operativo: umbral ?? '',
      sobre_umbral: umbral != null && umbral > 0 ? ocupacion > umbral : false,
      fecha,
      franja_horaria: franja,
      label,
    })
  }

  return rows
}

/** Incluye tramos que cruzan medianoche (fecha_tramo ≠ día analizado) para stock inicial y egresos tempranos. */
export function filterScatterRowsForOccupancyDay(
  rows: SegmentScatterByDayRow[],
  day: string
): SegmentScatterByDayRow[] {
  const dayStart = Date.parse(`${day}T00:00:00`)
  const dayEnd = Date.parse(`${day}T23:59:59.999`)
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) {
    return rows.filter((r) => r.fecha_tramo === day)
  }
  return rows.filter((r) => {
    const a = parseMs(r.timestamp_inicio)
    const b = parseMs(r.timestamp_fin || r.timestamp_inicio)
    if (a == null) return r.fecha_tramo === day
    return a <= dayEnd && (b ?? a) >= dayStart
  })
}

export function computeSectorOccupancyFromScatter(
  scatterRows: SegmentScatterByDayRow[],
  fechasHint: string[] = [],
  umbralOverride?: number | null
): { series: SectorOccupancy30MinRow[]; events: SectorOccupancyEvent[] } {
  const events = scatterRows
    .map((r) => scatterRowToOccupancyInput(r))
    .filter((e): e is SectorOccupancyEvent => e !== null)
  const bounds = resolveOccupancyPeriodBounds(events, fechasHint)
  if (!bounds || !events.length) return { series: [], events: [] }
  const marked = markStockInitialEvents(events, bounds.startMs)
  const series = buildSectorOccupancy30MinSeries({
    events: marked,
    periodStartMs: bounds.startMs,
    periodEndMs: bounds.endMs + 1,
    umbralOperativo: umbralOverride,
  })
  return { series, events: marked }
}

export type SectorOccupancyMetrics = {
  picoOcupacion: number
  fechaHoraPico: string
  ocupacionPromedio: number
  ocupacionP90: number
  totalIngresos: number
  totalEgresos: number
  horasSobreUmbral: number
  pctTiempoSobreUmbral: number
  ocupacionInicial: number
}

export function sectorOccupancyMetrics(series: SectorOccupancy30MinRow[]): SectorOccupancyMetrics {
  if (!series.length) {
    return {
      picoOcupacion: 0,
      fechaHoraPico: '—',
      ocupacionPromedio: 0,
      ocupacionP90: 0,
      totalIngresos: 0,
      totalEgresos: 0,
      horasSobreUmbral: 0,
      pctTiempoSobreUmbral: 0,
      ocupacionInicial: 0,
    }
  }
  const occs = series.map((s) => s.ocupacion_estimada)
  let pico = 0
  let picoIdx = 0
  for (let i = 0; i < series.length; i++) {
    if (series[i]!.ocupacion_estimada >= pico) {
      pico = series[i]!.ocupacion_estimada
      picoIdx = i
    }
  }
  const peak = series[picoIdx]!
  const umbral = typeof peak.umbral_operativo === 'number' ? peak.umbral_operativo : null
  const sobre = series.filter((s) => s.sobre_umbral)
  const slotsSobre = sobre.length
  const pct = (slotsSobre / series.length) * 100
  const horasSobre = (slotsSobre * OCCUPANCY_INTERVAL_MINUTES) / 60

  const totalIngresos = series.reduce((a, s) => a + s.ingresos_intervalo, 0)
  const totalEgresos = series.reduce((a, s) => a + s.egresos_intervalo, 0)

  return {
    picoOcupacion: pico,
    fechaHoraPico: peak.intervalo_inicio,
    ocupacionPromedio: occs.reduce((a, b) => a + b, 0) / occs.length,
    ocupacionP90: percentile(occs, 90),
    totalIngresos,
    totalEgresos,
    horasSobreUmbral: Math.round(horasSobre * 10) / 10,
    pctTiempoSobreUmbral: Math.round(pct * 10) / 10,
    ocupacionInicial: series[0]?.ocupacion_inicial ?? series[0]?.stock_inicial ?? 0,
  }
}

export const SECTOR_OCCUPANCY_30MIN_HEADERS = [
  'planta',
  'producto',
  'circuito',
  'tramo_operativo',
  'sector',
  'intervalo_inicio',
  'intervalo_fin',
  'stock_inicial',
  'ocupacion_inicial',
  'ingresos_intervalo',
  'egresos_intervalo',
  'ingresos_acumulados',
  'egresos_acumulados',
  'ocupacion_estimada',
  'umbral_operativo',
  'sobre_umbral',
  'fecha',
  'franja_horaria',
] as const

export function sectorOccupancy30MinCsv(rows: SectorOccupancy30MinRow[]): string {
  const out = rows.map((r) => ({
    ...r,
    umbral_operativo: r.umbral_operativo === '' ? '' : r.umbral_operativo,
    sobre_umbral: r.sobre_umbral ? 'true' : 'false',
  }))
  return recordsToCsv([...SECTOR_OCCUPANCY_30MIN_HEADERS], out as unknown as Record<string, unknown>[])
}

export const SECTOR_OCCUPANCY_EVENTS_HEADERS = [
  'journey_id',
  'patente',
  'producto',
  'circuito',
  'tramo_operativo',
  'sector',
  'timestamp_inicio',
  'timestamp_fin',
  'duracion_minutos',
  'es_stock_inicial',
  'motivo_stock_inicial',
  'fecha_inicio',
  'hora_inicio',
  'fecha_fin',
  'hora_fin',
  'estado_ejecutivo',
  'planta',
] as const

export function sectorOccupancyEventsCsv(events: SectorOccupancyEvent[]): string {
  const out = events.map((e) => ({
    ...e,
    es_stock_inicial: e.es_stock_inicial ? 'true' : 'false',
  }))
  return recordsToCsv([...SECTOR_OCCUPANCY_EVENTS_HEADERS], out as unknown as Record<string, unknown>[])
}

/** Power BI: todas las series por grupo producto+circuito+tramo. */
export function buildAllSectorOccupancy30MinRows(
  scatterRows: SegmentScatterByDayRow[],
  fechasHint: string[] = []
): { series: SectorOccupancy30MinRow[]; events: SectorOccupancyEvent[] } {
  const groups = new Map<string, SegmentScatterByDayRow[]>()
  for (const r of scatterRows) {
    const k = `${r.producto}|${r.circuito}|${r.tramo_operativo}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  const allSeries: SectorOccupancy30MinRow[] = []
  const allEvents: SectorOccupancyEvent[] = []
  for (const rows of groups.values()) {
    const { series, events } = computeSectorOccupancyFromScatter(rows, fechasHint)
    allSeries.push(...series)
    allEvents.push(...events)
  }
  return { series: allSeries, events: allEvents }
}
