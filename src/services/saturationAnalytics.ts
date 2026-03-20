/**
 * Análisis de saturación por sector: episodios, heatmap, contexto operativo.
 * Ocupación simultánea estimada vía tripToSectorIntervals + solape temporal.
 */

import type { HistoricalTrip, OperationalAlert } from '../domain/logistics'
import type { SiteId } from '../domain/sites'
import { getSectorCapacityByPlant } from '../config/sectorCapacityByPlant'
import { tripToSectorIntervals } from './analyticsKpi'

export type SaturationGranularity = 'hour' | '30min' | 'day'

export interface TimeBucket {
  index: number
  startMs: number
  endMs: number
  /** Etiqueta general (export/compat). */
  label: string
  /** Día UTC YYYY-MM-DD para agrupar cabecera "lunes / martes…". */
  dayKeyUtc: string
  /** Nombre del día en español (lunes, martes…) según inicio UTC del bucket. */
  weekdayLong: string
  /**
   * Marca cada 6 h (00, 06, 12, 18 UTC): "lunes 06h".
   * Vacío en franjas intermedias para deducir el tiempo entre marcas.
   */
  tickLabel6h: string
}

/** Orden visual S0, S1, … S10 (número tras S). */
export function compareSectorIdAsc(a: string, b: string): number {
  const ma = /^S(\d+)$/i.exec(a.trim())
  const mb = /^S(\d+)$/i.exec(b.trim())
  if (ma && mb) return Number(ma[1]) - Number(mb[1])
  if (ma) return -1
  if (mb) return 1
  return a.localeCompare(b)
}

export type HeatmapBand = 'normal' | 'high' | 'saturated' | 'severe'

export interface HeatmapCellModel {
  sectorId: string
  bucketIndex: number
  occupancy: number
  capacity: number | null
  utilization: number | null
  band: HeatmapBand
}

export interface SaturationEpisode {
  id: string
  sectorId: string
  startMs: number
  endMs: number
  durationMinutes: number
  maxOccupancy: number
  capacity: number
  maxExcess: number
  maxUtilizationPct: number
  /** severo si utilización máxima ≥ 120% */
  severity: 'severe' | 'moderate'
}

export interface SectorSaturationSummary {
  sectorId: string
  episodeCount: number
  totalSaturatedMinutes: number
  longestEpisodeMinutes: number
  criticalBandLabel: string
  maxExcess: number
  status: 'critico' | 'alto' | 'moderado' | 'sin_saturacion'
  episodes: SaturationEpisode[]
  /** Suma de duración de buckets donde la celda estuvo saturada/severe (referencia visual heatmap). */
  totalSaturatedBucketMinutes: number
}

export interface FlowBucketPoint {
  bucketIndex: number
  label: string
  startMs: number
  endMs: number
  ingresos: number
  egresos: number
  saldo: number
  acumulado: number
}

export interface OperationalMarker {
  id: string
  atMs: number
  category: string
  type: string
  plate?: string
  circuito?: string
  sectorId?: string
}

export interface DetailWindowPoint {
  bucketIndex: number
  label: string
  startMs: number
  endMs: number
  occupancy: number
  capacity: number | null
  ingresos: number
  egresos: number
  saldo: number
  acumulado: number
}

function maxConcurrentInWindow(
  intervals: Array<{ start: number; end: number }>,
  winStart: number,
  winEnd: number
): number {
  const clipped: Array<{ start: number; end: number }> = []
  for (const iv of intervals) {
    const s = Math.max(iv.start, winStart)
    const e = Math.min(iv.end, winEnd)
    if (e > s) clipped.push({ start: s, end: e })
  }
  if (clipped.length === 0) return 0
  type Ev = [number, number]
  const ev: Ev[] = []
  for (const iv of clipped) {
    ev.push([iv.start, 1], [iv.end, -1])
  }
  ev.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  let cur = 0
  let max = 0
  for (const [, d] of ev) {
    cur += d
    if (cur > max) max = cur
  }
  return max
}

/** Episodios continuos con ocupación > capacidad (línea de tiempo exacta). */
export function findSaturationEpisodes(
  intervals: Array<{ start: number; end: number }>,
  capacity: number,
  sectorId: string
): SaturationEpisode[] {
  if (capacity <= 0 || intervals.length === 0) return []
  type Ev = { t: number; d: number }
  const ev: Ev[] = []
  for (const iv of intervals) {
    if (iv.end <= iv.start) continue
    ev.push({ t: iv.start, d: 1 }, { t: iv.end, d: -1 })
  }
  if (ev.length === 0) return []
  ev.sort((a, b) => (a.t === b.t ? a.d - b.d : a.t - b.t))

  let cur = 0
  let epStart: number | null = null
  let maxOcc = 0
  const out: SaturationEpisode[] = []

  for (const { t, d } of ev) {
    const before = cur
    const after = cur + d

    if (before <= capacity && after > capacity) {
      epStart = t
      maxOcc = after
    } else if (before > capacity && after > capacity) {
      maxOcc = Math.max(maxOcc, after)
    } else if (before > capacity && after <= capacity) {
      if (epStart != null) {
        const durMin = (t - epStart) / 60_000
        const maxExcess = Math.max(0, maxOcc - capacity)
        const maxUtil = (maxOcc / capacity) * 100
        out.push({
          id: `${sectorId}-${epStart}-${t}`,
          sectorId,
          startMs: epStart,
          endMs: t,
          durationMinutes: durMin,
          maxOccupancy: maxOcc,
          capacity,
          maxExcess,
          maxUtilizationPct: maxUtil,
          severity: maxUtil >= 120 ? 'severe' : 'moderate',
        })
      }
      epStart = null
      maxOcc = 0
    }
    cur = after
  }

  return out
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function weekdayLongEsUtc(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' })
}

export function buildTimeBuckets(rangeStartMs: number, rangeEndMs: number, g: SaturationGranularity): TimeBucket[] {
  const buckets: TimeBucket[] = []
  let stepMs: number
  switch (g) {
    case '30min':
      stepMs = 30 * 60_000
      break
    case 'day':
      stepMs = 24 * 60 * 60_000
      break
    default:
      stepMs = 60 * 60_000
  }

  let t = rangeStartMs
  let idx = 0
  while (t < rangeEndMs) {
    const end = Math.min(t + stepMs, rangeEndMs)
    const d0 = new Date(t)
    const dayKeyUtc = utcDayKey(d0)
    const weekdayLong = weekdayLongEsUtc(t)
    const h = d0.getUTCHours()
    const min = d0.getUTCMinutes()

    let tickLabel6h = ''
    let label: string

    if (g === 'day') {
      tickLabel6h = weekdayLong.charAt(0).toUpperCase() + weekdayLong.slice(1)
      label = tickLabel6h
    } else {
      const onSixHourGrid = min === 0 && h % 6 === 0
      if (onSixHourGrid) {
        const wd = new Date(t).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' })
        const cap = wd.charAt(0).toUpperCase() + wd.slice(1)
        tickLabel6h = `${cap} ${String(h).padStart(2, '0')}h`
      }
      label = tickLabel6h || '\u00a0'
    }

    buckets.push({
      index: idx,
      startMs: t,
      endMs: end,
      label,
      dayKeyUtc,
      weekdayLong,
      tickLabel6h,
    })
    idx++
    t = end
  }
  return buckets
}

function bandFromUtil(u: number | null, capacity: number | null): HeatmapBand {
  if (capacity == null || capacity <= 0 || u == null) return 'normal'
  if (u > 1) return u >= 1.2 ? 'severe' : 'saturated'
  if (u >= 0.8) return 'high'
  return 'normal'
}

function sectorStatus(s: {
  episodeCount: number
  totalSaturatedMinutes: number
  maxExcess: number
}): SectorSaturationSummary['status'] {
  if (s.episodeCount === 0) return 'sin_saturacion'
  if (s.totalSaturatedMinutes >= 240 || s.episodeCount >= 8 || s.maxExcess >= 10) return 'critico'
  if (s.totalSaturatedMinutes >= 60 || s.episodeCount >= 3 || s.maxExcess >= 4) return 'alto'
  return 'moderado'
}

function criticalHourFromEpisodes(episodes: SaturationEpisode[]): string {
  if (episodes.length === 0) return '—'
  const w = new Map<number, number>()
  for (const ep of episodes) {
    const h = new Date(ep.startMs).getUTCHours()
    w.set(h, (w.get(h) ?? 0) + ep.durationMinutes)
  }
  let bestH = 0
  let best = -1
  for (const [h, m] of w) {
    if (m > best) {
      best = m
      bestH = h
    }
  }
  const next = (bestH + 1) % 24
  return `${String(bestH).padStart(2, '0')}:00–${String(next).padStart(2, '0')}:00`
}

/** Rango UTC [start, end) alineado a días calendario según período (ref = último día del rango). */
export function getSaturationRangeMs(
  refFecha: string,
  period: 'last_day' | 'last_week' | 'last_month'
): { rangeStartMs: number; rangeEndMs: number } {
  const parts = refFecha.split('-').map(Number)
  const y = parts[0] ?? 2026
  const mo = parts[1] ?? 1
  const d = parts[2] ?? 1
  const endDay = Date.UTC(y, mo - 1, d + 1, 0, 0, 0, 0)
  let startDay: number
  if (period === 'last_day') {
    startDay = Date.UTC(y, mo - 1, d, 0, 0, 0, 0)
  } else if (period === 'last_week') {
    startDay = Date.UTC(y, mo - 1, d - 6, 0, 0, 0, 0)
  } else {
    startDay = Date.UTC(y, mo - 1, d - 29, 0, 0, 0, 0)
  }
  return { rangeStartMs: startDay, rangeEndMs: endDay }
}

export interface SaturationAnalysisInput {
  trips: HistoricalTrip[]
  siteId: SiteId
  rangeStartMs: number
  rangeEndMs: number
  granularity: SaturationGranularity
}

export interface SaturationAnalysisResult {
  buckets: TimeBucket[]
  sectorsOrdered: string[]
  heatmapCells: HeatmapCellModel[]
  /** Intervalos por sector ya recortados al rango analizado (para panel detalle). */
  intervalsBySector: Map<string, Array<{ start: number; end: number }>>
  episodesBySector: Map<string, SaturationEpisode[]>
  allEpisodes: SaturationEpisode[]
  summaries: SectorSaturationSummary[]
  executive: {
    sectorsWithSaturation: number
    totalEpisodes: number
    totalSaturatedMinutes: number
    topSector: { sectorId: string; episodes: number; hoursSaturated: number } | null
  }
  flowSeries: FlowBucketPoint[]
  capacityMap: Record<string, number> | null
  rangeStartMs: number
  rangeEndMs: number
}

function clipIntervalsToRange(
  intervals: Array<{ start: number; end: number }>,
  rangeStart: number,
  rangeEnd: number
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (const iv of intervals) {
    const s = Math.max(iv.start, rangeStart)
    const e = Math.min(iv.end, rangeEnd)
    if (e > s) out.push({ start: s, end: e })
  }
  return out
}

export function runSaturationAnalysis(input: SaturationAnalysisInput): SaturationAnalysisResult | null {
  const { trips, siteId, rangeStartMs, rangeEndMs, granularity } = input
  const capacityMap = getSectorCapacityByPlant(siteId)
  if (!capacityMap || rangeEndMs <= rangeStartMs) return null

  const filteredTrips = trips.filter((t) => {
    if (t.siteId !== siteId) return false
    const t0 = new Date(t.ingresoAt).getTime()
    const t1 = new Date(t.egresoAt).getTime()
    return t1 > rangeStartMs && t0 < rangeEndMs
  })

  const intervalsBySector = new Map<string, Array<{ start: number; end: number }>>()
  for (const trip of filteredTrips) {
    const raw = tripToSectorIntervals(trip)
    for (const iv of raw) {
      const s = Math.max(iv.start, rangeStartMs)
      const e = Math.min(iv.end, rangeEndMs)
      if (e <= s) continue
      const list = intervalsBySector.get(iv.sector) ?? []
      list.push({ start: s, end: e })
      intervalsBySector.set(iv.sector, list)
    }
  }

  const sectorsWithData = [...intervalsBySector.keys()].filter((s) => s !== 'N/A')
  const buckets = buildTimeBuckets(rangeStartMs, rangeEndMs, granularity)

  const heatmapCells: HeatmapCellModel[] = []
  const bandBySectorBucket = new Map<string, HeatmapBand>()
  const episodesBySector = new Map<string, SaturationEpisode[]>()
  const allEpisodes: SaturationEpisode[] = []

  for (const sectorId of sectorsWithData) {
    const cap = capacityMap[sectorId]
    const ivs = intervalsBySector.get(sectorId) ?? []
    if (cap != null && cap > 0) {
      const eps = findSaturationEpisodes(ivs, cap, sectorId)
      episodesBySector.set(sectorId, eps)
      allEpisodes.push(...eps)
    } else {
      episodesBySector.set(sectorId, [])
    }

    for (const b of buckets) {
      const occ = maxConcurrentInWindow(ivs, b.startMs, b.endMs)
      const utilization = cap != null && cap > 0 ? occ / cap : null
      const band = bandFromUtil(utilization, cap ?? null)
      heatmapCells.push({
        sectorId,
        bucketIndex: b.index,
        occupancy: occ,
        capacity: cap ?? null,
        utilization,
        band,
      })
      bandBySectorBucket.set(`${sectorId}|${b.index}`, band)
    }
  }

  const summariesUnsorted: SectorSaturationSummary[] = []
  for (const sectorId of sectorsWithData) {
    const eps = episodesBySector.get(sectorId) ?? []
    const totalSatMin = eps.reduce((a, e) => a + e.durationMinutes, 0)
    const longest = eps.length ? Math.max(...eps.map((e) => e.durationMinutes)) : 0
    const maxExcess = eps.length ? Math.max(...eps.map((e) => e.maxExcess)) : 0
    let totalBucketSat = 0
    for (const b of buckets) {
      const band = bandBySectorBucket.get(`${sectorId}|${b.index}`)
      if (band === 'saturated' || band === 'severe') {
        totalBucketSat += (b.endMs - b.startMs) / 60_000
      }
    }
    const base = {
      sectorId,
      episodeCount: eps.length,
      totalSaturatedMinutes: totalSatMin,
      longestEpisodeMinutes: longest,
      maxExcess,
      episodes: eps,
      totalSaturatedBucketMinutes: totalBucketSat,
    }
    summariesUnsorted.push({
      ...base,
      criticalBandLabel: criticalHourFromEpisodes(eps),
      status: sectorStatus(base),
    })
  }

  summariesUnsorted.sort((a, b) => {
    const d = b.totalSaturatedMinutes - a.totalSaturatedMinutes
    if (Math.abs(d) > 1e-6) return d
    const e = b.episodeCount - a.episodeCount
    if (e !== 0) return e
    return b.maxExcess - a.maxExcess
  })

  /** Filas del heatmap y gráficos: orden S0 → S10, no por criticidad. */
  const sectorsOrdered = [...sectorsWithData].sort(compareSectorIdAsc)

  const sectorsWithSaturation = summariesUnsorted.filter((s) => s.episodeCount > 0).length
  const totalEpisodes = allEpisodes.length
  const totalSaturatedMinutes = allEpisodes.reduce((a, e) => a + e.durationMinutes, 0)
  const top = summariesUnsorted.find((s) => s.episodeCount > 0) ?? null
  const executive = {
    sectorsWithSaturation,
    totalEpisodes,
    totalSaturatedMinutes,
    topSector: top
      ? {
          sectorId: top.sectorId,
          episodes: top.episodeCount,
          hoursSaturated: top.totalSaturatedMinutes / 60,
        }
      : null,
  }

  const flowSeries: FlowBucketPoint[] = []
  let acum = 0
  for (const b of buckets) {
    let ing = 0
    let egr = 0
    for (const t of filteredTrips) {
      const tin = new Date(t.ingresoAt).getTime()
      const tout = new Date(t.egresoAt).getTime()
      if (tin >= b.startMs && tin < b.endMs) ing++
      if (tout >= b.startMs && tout < b.endMs) egr++
    }
    const saldo = ing - egr
    acum += saldo
    flowSeries.push({
      bucketIndex: b.index,
      label: b.label,
      startMs: b.startMs,
      endMs: b.endMs,
      ingresos: ing,
      egresos: egr,
      saldo,
      acumulado: acum,
    })
  }

  return {
    buckets,
    sectorsOrdered,
    heatmapCells,
    intervalsBySector,
    episodesBySector,
    allEpisodes,
    summaries: summariesUnsorted,
    executive,
    flowSeries,
    capacityMap,
    rangeStartMs,
    rangeEndMs,
  }
}

export function buildDetailWindowSeries(
  _sectorId: string,
  intervals: Array<{ start: number; end: number }>,
  capacity: number | null,
  windowStartMs: number,
  windowEndMs: number,
  granularity: SaturationGranularity,
  tripsInSite: HistoricalTrip[]
): { points: DetailWindowPoint[]; markers: OperationalMarker[] } {
  const buckets = buildTimeBuckets(windowStartMs, windowEndMs, granularity)
  const clipped = clipIntervalsToRange(intervals, windowStartMs, windowEndMs)
  const points: DetailWindowPoint[] = []
  let acum = 0
  for (const b of buckets) {
    const occ = maxConcurrentInWindow(clipped, b.startMs, b.endMs)
    let ing = 0
    let egr = 0
    for (const t of tripsInSite) {
      const tin = new Date(t.ingresoAt).getTime()
      const tout = new Date(t.egresoAt).getTime()
      if (tin >= b.startMs && tin < b.endMs) ing++
      if (tout >= b.startMs && tout < b.endMs) egr++
    }
    const saldo = ing - egr
    acum += saldo
    points.push({
      bucketIndex: b.index,
      label: b.label,
      startMs: b.startMs,
      endMs: b.endMs,
      occupancy: occ,
      capacity,
      ingresos: ing,
      egresos: egr,
      saldo,
      acumulado: acum,
    })
  }
  return { points, markers: [] }
}

const ALERT_CATEGORY: Array<{ match: (t: string) => boolean; label: string }> = [
  { match: (t) => /ESPERA|WAIT/i.test(t), label: 'Espera' },
  { match: (t) => /RECAL|RECAD/i.test(t), label: 'Recalado' },
  { match: (t) => /RECHAZ/i.test(t), label: 'Rechazo' },
  { match: (t) => /CALIDAD|OBSERVAC/i.test(t), label: 'Observación de calidad' },
  { match: (t) => /RECIRCUL/i.test(t), label: 'Recirculación' },
  { match: (t) => /VUELTA|INGRESO/i.test(t), label: 'Vuelta a ingreso' },
  { match: (t) => /DOBLE|DOBLE_PASO/i.test(t), label: 'Doble paso' },
  { match: (t) => /DESVIO|DESVÍO|FUERA_CIRCUITO/i.test(t), label: 'Desvío operativo' },
]

export function mapAlertToOperationalCategory(type: string): string {
  for (const { match, label } of ALERT_CATEGORY) {
    if (match(type)) return label
  }
  return 'Evento operativo'
}

export function buildOperationalMarkers(
  alerts: OperationalAlert[],
  siteId: SiteId,
  windowStartMs: number,
  windowEndMs: number,
  sectorId?: string | null
): OperationalMarker[] {
  const out: OperationalMarker[] = []
  for (const a of alerts) {
    if (a.siteId !== siteId) continue
    if (sectorId && a.sectorId && a.sectorId !== sectorId) continue
    const at = new Date(a.createdAt).getTime()
    if (at < windowStartMs || at >= windowEndMs) continue
    out.push({
      id: a.alertId,
      atMs: at,
      category: mapAlertToOperationalCategory(String(a.type)),
      type: String(a.type),
      plate: a.plate,
      circuito: a.circuitoEsperado ?? a.circuitoObservado,
      sectorId: a.sectorId,
    })
  }
  return out.sort((x, y) => x.atMs - y.atMs)
}

export function buildSaturationNarrative(
  result: SaturationAnalysisResult,
  opts: {
    selectedEpisode?: SaturationEpisode | null
    detailFlowSeries: FlowBucketPoint[]
    alertsInRange: OperationalAlert[]
  }
): string[] {
  const lines: string[] = []
  const { executive, summaries, allEpisodes } = result
  const top = executive.topSector

  if (top) {
    lines.push(
      `${top.sectorId} fue el sector más comprometido: ${top.episodes} episodio(s) y ${top.hoursSaturated.toFixed(1)} h con ocupación por encima de la capacidad.`
    )
  } else if (summaries.length) {
    lines.push('No se detectaron episodios de saturación (ocupación simultánea por encima de capacidad) en el período analizado.')
  }

  if (allEpisodes.length > 0) {
    const byHour = new Map<number, number>()
    for (const e of allEpisodes) {
      const h = new Date(e.startMs).getUTCHours()
      byHour.set(h, (byHour.get(h) ?? 0) + e.durationMinutes)
    }
    let bh = 0
    let bm = -1
    for (const [h, m] of byHour) {
      if (m > bm) {
        bm = m
        bh = h
      }
    }
    if (bm > 0) {
      lines.push(
        `La mayor concentración de minutos saturados se observa alrededor de las ${String(bh).padStart(2, '0')}:00 (según inicio de episodios).`
      )
    }
  }

  const ep = opts.selectedEpisode
  if (ep) {
    const win = opts.detailFlowSeries.filter((p) => p.startMs >= ep.startMs && p.startMs < ep.endMs)
    const pos = win.filter((p) => p.saldo > 0).length
    if (pos >= 2) {
      lines.push(
        'En el episodio seleccionado, en varias franjas consecutivas los ingresos superan a los egresos; se observa junto con el tramo saturado.'
      )
    }
  }

  const cats = new Set(opts.alertsInRange.map((a) => mapAlertToOperationalCategory(String(a.type))))
  const interesting = ['Espera', 'Recalado', 'Desvío operativo', 'Doble paso'].filter((c) => cats.has(c))
  if (interesting.length > 0 && allEpisodes.length > 0) {
    lines.push(
      `En el período analizado coinciden alertas de tipo: ${interesting.join(', ')}; no implica causalidad directa con la saturación.`
    )
  }

  const simultaneous = detectSimultaneousEpisodes(allEpisodes)
  if (simultaneous.length > 0 && simultaneous[0]!.count >= 1) {
    lines.push(
      `Se observa solapamiento temporal de episodios de saturación entre ${simultaneous[0]!.pair[0]} y ${simultaneous[0]!.pair[1]}.`
    )
  }

  while (lines.length > 5) lines.pop()
  if (lines.length === 0) lines.push('No hay datos suficientes para generar lectura automática en este período.')
  return lines
}

/** Pares de sectores con episodios que se solapan en el tiempo. */
function detectSimultaneousEpisodes(episodes: SaturationEpisode[]): Array<{ pair: [string, string]; count: number }> {
  const pairs = new Map<string, number>()
  const list = [...episodes].sort((a, b) => a.startMs - b.startMs)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!
      const b = list[j]!
      if (a.sectorId === b.sectorId) continue
      if (b.startMs >= a.endMs) break
      if (b.startMs < a.endMs && b.endMs > a.startMs) {
        const key = [a.sectorId, b.sectorId].sort().join('|')
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  return [...pairs.entries()]
    .map(([k, count]) => ({ pair: k.split('|') as [string, string], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 1)
}
