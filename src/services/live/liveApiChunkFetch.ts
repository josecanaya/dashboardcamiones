import type { RealAlertDto, RealTruckflowQueryParams } from '../realTruckflowApi'
import { fetchAlerts, fetchJourneyEvents } from '../realTruckflowApi'
import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import { toIsoLocal } from './liveEventTime'

/** Por encima de este volumen la API suele truncar sin avisar. */
export const TRUCKFLOW_LIST_SOFT_ROW_CAP = 990

/** Tramos horarios para días completos (~5000 evt/día → ~400 evt por tramo de 2 h). */
export const LIVE_DAY_CHUNK_HOURS = 2

const MS_HOUR = 60 * 60 * 1000

export type LiveTimeChunk = { start: Date; end: Date }

export type LiveChunkFetchStats = {
  chunks: number
  eventsRaw: number
  alertsRaw: number
  eventsMerged: number
  alertsMerged: number
  usedChunkedFetch: boolean
}

export function buildFixedHourChunks(
  rangeStart: Date,
  rangeEnd: Date,
  hoursPerChunk = LIVE_DAY_CHUNK_HOURS
): LiveTimeChunk[] {
  if (rangeEnd.getTime() < rangeStart.getTime()) return []
  const out: LiveTimeChunk[] = []
  let cursor = rangeStart.getTime()
  const endMs = rangeEnd.getTime()
  const stepMs = hoursPerChunk * MS_HOUR

  while (cursor <= endMs) {
    const chunkEndMs = Math.min(cursor + stepMs - 1, endMs)
    out.push({ start: new Date(cursor), end: new Date(chunkEndMs) })
    cursor += stepMs
  }
  return out
}

function mergeEventRows(chunks: RealJourneyEventDto[][]): RealJourneyEventDto[] {
  const map = new Map<string, RealJourneyEventDto>()
  for (const list of chunks) {
    for (const e of list) {
      map.set(`${e.id}-${e.sequenceNumber}`, e)
    }
  }
  return [...map.values()]
}

function mergeAlertRows(chunks: RealAlertDto[][]): RealAlertDto[] {
  const map = new Map<string, RealAlertDto>()
  for (const list of chunks) {
    for (const a of list) {
      const key = String(a.id ?? `${a.deviceCode}-${a.createdAt}-${a.alertCode}`)
      map.set(key, a)
    }
  }
  return [...map.values()]
}

function spanNeedsChunking(start: Date, end: Date): boolean {
  return end.getTime() - start.getTime() > 55 * 60 * 1000
}

async function fetchEventsOneChunk(
  chunk: LiveTimeChunk,
  baseParams: RealTruckflowQueryParams,
  opts?: { baseOrigin?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<RealJourneyEventDto[]> {
  return fetchJourneyEvents(
    {
      ...baseParams,
      startDate: toIsoLocal(chunk.start),
      endDate: toIsoLocal(chunk.end),
    },
    opts
  )
}

async function fetchAlertsOneChunk(
  chunk: LiveTimeChunk,
  baseParams: RealTruckflowQueryParams,
  opts?: { baseOrigin?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<RealAlertDto[]> {
  return fetchAlerts(
    {
      ...baseParams,
      startDate: toIsoLocal(chunk.start),
      endDate: toIsoLocal(chunk.end),
    },
    opts
  )
}

async function fetchEventsAdaptive(
  chunk: LiveTimeChunk,
  baseParams: RealTruckflowQueryParams,
  opts?: { baseOrigin?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<{ rows: RealJourneyEventDto[]; subChunks: number }> {
  const rows = await fetchEventsOneChunk(chunk, baseParams, opts)
  if (rows.length < TRUCKFLOW_LIST_SOFT_ROW_CAP) {
    return { rows, subChunks: 1 }
  }
  const spanMs = chunk.end.getTime() - chunk.start.getTime()
  if (spanMs <= MS_HOUR) return { rows, subChunks: 1 }

  const mid = chunk.start.getTime() + Math.floor(spanMs / 2)
  const left: LiveTimeChunk = { start: chunk.start, end: new Date(mid) }
  const right: LiveTimeChunk = { start: new Date(mid + 1), end: chunk.end }
  const [a, b] = await Promise.all([
    fetchEventsAdaptive(left, baseParams, opts),
    fetchEventsAdaptive(right, baseParams, opts),
  ])
  return {
    rows: mergeEventRows([a.rows, b.rows]),
    subChunks: a.subChunks + b.subChunks,
  }
}

async function fetchAlertsAdaptive(
  chunk: LiveTimeChunk,
  baseParams: RealTruckflowQueryParams,
  opts?: { baseOrigin?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<{ rows: RealAlertDto[]; subChunks: number }> {
  const rows = await fetchAlertsOneChunk(chunk, baseParams, opts)
  if (rows.length < TRUCKFLOW_LIST_SOFT_ROW_CAP) {
    return { rows, subChunks: 1 }
  }
  const spanMs = chunk.end.getTime() - chunk.start.getTime()
  if (spanMs <= MS_HOUR) return { rows, subChunks: 1 }

  const mid = chunk.start.getTime() + Math.floor(spanMs / 2)
  const left: LiveTimeChunk = { start: chunk.start, end: new Date(mid) }
  const right: LiveTimeChunk = { start: new Date(mid + 1), end: chunk.end }
  const [a, b] = await Promise.all([
    fetchAlertsAdaptive(left, baseParams, opts),
    fetchAlertsAdaptive(right, baseParams, opts),
  ])
  return {
    rows: mergeAlertRows([a.rows, b.rows]),
    subChunks: a.subChunks + b.subChunks,
  }
}

export async function fetchLiveRangeMerged(
  queryStart: Date,
  queryEnd: Date,
  baseParams: Omit<RealTruckflowQueryParams, 'startDate' | 'endDate'>,
  opts?: { baseOrigin?: string; signal?: AbortSignal; timeoutMs?: number; hoursPerChunk?: number }
): Promise<{ events: RealJourneyEventDto[]; alerts: RealAlertDto[]; stats: LiveChunkFetchStats }> {
  const fetchOpts = opts?.baseOrigin || opts?.signal || opts?.timeoutMs
    ? { baseOrigin: opts?.baseOrigin, signal: opts?.signal, timeoutMs: opts?.timeoutMs }
    : undefined

  if (!spanNeedsChunking(queryStart, queryEnd)) {
    const params: RealTruckflowQueryParams = {
      ...baseParams,
      startDate: toIsoLocal(queryStart),
      endDate: toIsoLocal(queryEnd),
    }
    const [events, alerts] = await Promise.all([
      fetchJourneyEvents(params, fetchOpts),
      fetchAlerts(params, fetchOpts),
    ])
    return {
      events,
      alerts,
      stats: {
        chunks: 1,
        eventsRaw: events.length,
        alertsRaw: alerts.length,
        eventsMerged: events.length,
        alertsMerged: alerts.length,
        usedChunkedFetch: false,
      },
    }
  }

  const hoursPerChunk = opts?.hoursPerChunk ?? LIVE_DAY_CHUNK_HOURS
  const chunks = buildFixedHourChunks(queryStart, queryEnd, hoursPerChunk)
  const eventParts: RealJourneyEventDto[][] = []
  const alertParts: RealAlertDto[][] = []
  let subChunks = 0

  const batchSize = 4
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const [ev, al] = await Promise.all([
          fetchEventsAdaptive(chunk, baseParams, fetchOpts),
          fetchAlertsAdaptive(chunk, baseParams, fetchOpts),
        ])
        subChunks += ev.subChunks + al.subChunks
        return { ev: ev.rows, al: al.rows }
      })
    )
    for (const r of results) {
      eventParts.push(r.ev)
      alertParts.push(r.al)
    }
  }

  const events = mergeEventRows(eventParts)
  const alerts = mergeAlertRows(alertParts)
  const eventsRaw = eventParts.reduce((n, p) => n + p.length, 0)
  const alertsRaw = alertParts.reduce((n, p) => n + p.length, 0)

  return {
    events,
    alerts,
    stats: {
      chunks: subChunks,
      eventsRaw,
      alertsRaw,
      eventsMerged: events.length,
      alertsMerged: alerts.length,
      usedChunkedFetch: true,
    },
  }
}
