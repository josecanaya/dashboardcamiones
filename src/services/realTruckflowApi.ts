import type { ApiRealJourneyEventRow, RealJourneyEventDto } from './realJourneyEvents.types'
import { annotateRealJourneyEventsWithPlateFieldsChunked } from './realJourneyEventPlate'
import { yieldToBrowser } from '../utils/yieldToBrowser'

export const REAL_TRUCKFLOW_BASE_URL = 'http://138.36.237.33:8090'

/** Aborta `fetch` si la API no responde — evita “tildados” indefinidos. Subir desde env sólo si hace falta. */
export const DEFAULT_TRUCKFLOW_FETCH_TIMEOUT_MS = 90_000

const EVENT_PARSE_ROWS_PER_SLICE = 4_000

export type RealTruckflowQueryParams = {
  startDate?: string
  endDate?: string
  plate?: string
  device?: string
  sector?: string
  site?: string
  journeyUuid?: string
}

export type RealAlertDto = {
  id?: number | string
  journeyUid?: string
  journeyUuid?: string
  plate?: string
  truckPlate?: string
  sectorCode?: string
  sector?: string
  deviceCode?: string
  device?: string
  site?: string
  alertType?: string
  type?: string
  reason?: string
  message?: string
  occurredAt?: string
  createdAt?: string
  recordedAt?: string
  alertLevel?: number
  [key: string]: unknown
}

/** Base URL efectiva (proxy `/journey-api` en dev, env o host público en prod). */
export function resolveRealTruckflowApiOrigin(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_REAL_JOURNEY_API_ORIGIN : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/journey-api'
  return REAL_TRUCKFLOW_BASE_URL
}

function buildQuery(params: RealTruckflowQueryParams = {}): string {
  const query = new URLSearchParams()
  const entries = Object.entries(params) as [keyof RealTruckflowQueryParams, string | undefined][]
  for (const [key, value] of entries) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (trimmed) query.set(key, trimmed)
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.value)) return obj.value
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.events)) return obj.events
    if (Array.isArray(obj.alerts)) return obj.alerts
    if (Array.isArray(obj.items)) return obj.items
  }
  return []
}

async function fetchTruckflowJson(url: string, label: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController()
  let timerId: ReturnType<typeof setTimeout> | undefined
  if (typeof globalThis.setTimeout === 'function') {
    timerId = globalThis.setTimeout(() => ctl.abort(), timeoutMs)
  }
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    if (!response.ok) throw new Error(`Error consultando ${label} (${response.status}) — ${url}`)
    return await response.json()
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'AbortError') {
      throw new Error(
        `Tiempo máximo (${Math.round(timeoutMs / 1000)} s) esperando ${label}. Acotá fechas u horarios, revisá red/VPN, ` +
          `servidor activo y proxy «/journey-api» en desarrollo. URL: ${url}`
      )
    }
    throw err
  } finally {
    if (timerId !== undefined && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(timerId)
  }
}

function mapRawToApiJourneyRow(raw: unknown, index: number): ApiRealJourneyEventRow | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const journeyUid = toString(obj.journeyUid ?? obj.journeyUuid).trim()
  if (!journeyUid) return null
  const occurredAt =
    toString(obj.occurredAt) ||
    toString(obj.recordedAt) ||
    toString(obj.createdAt) ||
    toString(obj.modifiedAt)
  const recordedAt = toString(obj.recordedAt) || occurredAt
  return {
    id: toNumber(obj.id, 1_000_000 + index),
    createdAt: toString(obj.createdAt),
    modifiedAt: toString(obj.modifiedAt),
    journeyUid,
    sequenceNumber: toNumber(obj.sequenceNumber, 0),
    eventCategory: toString(obj.eventCategory),
    eventType: toString(obj.eventType),
    occurredAt,
    recordedAt,
    truckPlate: toString(obj.truckPlate),
    sectorCode: toString(obj.sectorCode),
    deviceCode: toString(obj.deviceCode),
    alertLevel: toNumber(obj.alertLevel, 0),
  }
}

export async function fetchJourneyEvents(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string; timeoutMs?: number }
): Promise<RealJourneyEventDto[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TRUCKFLOW_FETCH_TIMEOUT_MS
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/journey-event/list${buildQuery(params)}`
  const payload: unknown = await fetchTruckflowJson(url, 'eventos', timeoutMs)
  const rows = extractArray(payload)
  const parsed: ApiRealJourneyEventRow[] = []
  for (let chunkStart = 0; chunkStart < rows.length; chunkStart += EVENT_PARSE_ROWS_PER_SLICE) {
    const chunkEnd = Math.min(chunkStart + EVENT_PARSE_ROWS_PER_SLICE, rows.length)
    for (let idx = chunkStart; idx < chunkEnd; idx++) {
      const row = mapRawToApiJourneyRow(rows[idx], idx)
      if (row) parsed.push(row)
    }
    if (chunkEnd < rows.length) await yieldToBrowser()
  }
  return annotateRealJourneyEventsWithPlateFieldsChunked(parsed)
}

export async function fetchAlerts(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string; timeoutMs?: number }
): Promise<RealAlertDto[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TRUCKFLOW_FETCH_TIMEOUT_MS
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/alert/list${buildQuery(params)}`
  const payload: unknown = await fetchTruckflowJson(url, 'alertas', timeoutMs)
  const rows = extractArray(payload)
  const out = rows.filter((row): row is RealAlertDto => Boolean(row) && typeof row === 'object')
  if (out.length > EVENT_PARSE_ROWS_PER_SLICE * 5) await yieldToBrowser()
  return out
}
