/**
 * Capa de ingesta Truckflow: fetch HTTP, extracción de arrays y normalización inicial a DTO.
 * La reconstrucción/validación de circuitos vive en otra capa (p. ej. circuitAnalyzer.ts).
 */
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
  version?: number | string
  journeyUid?: string
  journeyUuid?: string
  plate?: string
  truckPlate?: string
  trailerPlate?: string
  sectorCode?: string
  sector?: string
  deviceCode?: string
  device?: string
  site?: string
  /** Código canónico en API `/alert/list` (p. ej. LPR_MALFUNCTION). */
  alertCode?: string
  alertType?: string
  type?: string
  severity?: string | number
  status?: string
  description?: string
  reason?: string
  message?: string
  occurredAt?: string
  createdAt?: string
  modifiedAt?: string
  recordedAt?: string
  alertLevel?: number
  payload?: unknown
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

/** Respuesta Truckflow (`value`, `data`, array raíz, etc.) — útil para JSON guardado en disco. */
export function extractTruckflowPayloadArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.value)) return obj.value
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.events)) return obj.events
    if (Array.isArray(obj.alerts)) return obj.alerts
    if (Array.isArray(obj.items)) return obj.items
    if (Array.isArray(obj.records)) return obj.records
  }
  return []
}

async function fetchTruckflowJson(
  url: string,
  label: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<unknown> {
  const timeoutCtl = new AbortController()
  let timerId: ReturnType<typeof setTimeout> | undefined
  if (typeof globalThis.setTimeout === 'function') {
    timerId = globalThis.setTimeout(() => timeoutCtl.abort(), timeoutMs)
  }

  const merged = new AbortController()
  const abortMerged = () => {
    try {
      merged.abort()
    } catch {
      /* noop */
    }
  }
  timeoutCtl.signal.addEventListener('abort', abortMerged)
  const onExternalAbort = () => abortMerged()
  if (externalSignal) {
    if (externalSignal.aborted) abortMerged()
    else externalSignal.addEventListener('abort', onExternalAbort)
  }

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: merged.signal,
    })
    if (!response.ok) throw new Error(`Error consultando ${label} (${response.status}) — ${url}`)
    return await response.json()
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw new Error(`Carga cancelada o tiempo total agotado mientras se consultaba ${label}. URL: ${url}`)
      }
      throw new Error(
        `Tiempo máximo (${Math.round(timeoutMs / 1000)} s) esperando ${label}. Acotá fechas u horarios, revisá red/VPN, ` +
          `servidor activo y proxy «/journey-api» en desarrollo. URL: ${url}`
      )
    }
    throw err
  } finally {
    if (timerId !== undefined && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(timerId)
    timeoutCtl.signal.removeEventListener('abort', abortMerged)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

/** Mapea una fila cruda de `/journey-event/list` (o JSON local) al DTO interno previo a patentes. */
export function mapRawToApiJourneyRow(raw: unknown, index: number): ApiRealJourneyEventRow | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const occurredAt =
    toString(obj.occurredAt) ||
    toString(obj.recordedAt) ||
    toString(obj.createdAt) ||
    toString(obj.modifiedAt)
  const recordedAt = toString(obj.recordedAt) || occurredAt
  const truckPlate = toString(obj.truckPlate)
  // Sin journeyUid en origen: conservar el evento con ID técnico (reconstrucción por patente + ventana en otra capa).
  const journeyUid =
    toString(obj.journeyUid ?? obj.journeyUuid).trim() ||
    `NO_JOURNEY_${truckPlate || 'SIN_PATENTE'}_${occurredAt || index}`
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
    truckPlate,
    sectorCode: toString(obj.sectorCode),
    deviceCode: toString(obj.deviceCode),
    alertLevel: toNumber(obj.alertLevel, 0),
  }
}

/** GET `/journey-event/list` → extracción de array → mapeo por bloques → enriquecimiento de patentes. */
export async function fetchJourneyEvents(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<RealJourneyEventDto[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TRUCKFLOW_FETCH_TIMEOUT_MS
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/journey-event/list${buildQuery(params)}`
  const payload: unknown = await fetchTruckflowJson(url, 'eventos', timeoutMs, opts?.signal)
  const rows = extractTruckflowPayloadArray(payload)
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

/** Normaliza filas crudas (p. ej. JSON local) al mismo DTO que devuelve la API, sin bloquear la UI. */
export async function journeyDtoListFromRawExtractedRowsChunked(rows: unknown[]): Promise<RealJourneyEventDto[]> {
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

export function alertDtoListFromRawExtractedRows(rows: unknown[]): RealAlertDto[] {
  return rows.filter((row): row is RealAlertDto => Boolean(row) && typeof row === 'object')
}

/** GET `/alert/list` → extracción de array → DTO de alertas (sin mezclar con eventos ni circuitos). */
export async function fetchAlerts(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<RealAlertDto[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TRUCKFLOW_FETCH_TIMEOUT_MS
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/alert/list${buildQuery(params)}`
  const payload: unknown = await fetchTruckflowJson(url, 'alertas', timeoutMs, opts?.signal)
  const rows = extractTruckflowPayloadArray(payload)
  const out = alertDtoListFromRawExtractedRows(rows)
  if (out.length > EVENT_PARSE_ROWS_PER_SLICE * 5) await yieldToBrowser()
  return out
}
