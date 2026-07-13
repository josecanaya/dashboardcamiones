/**
 * Capa: extract — orígenes API/archivo y URLs de listado.
 * No clasifica circuitos. import.meta + yieldToBrowser en parseo largo.
 */
import type { ApiRealJourneyEventRow, RealJourneyEventDto } from './realJourneyEvents.types'
import { annotateRealJourneyEventsWithPlateFields, annotateRealJourneyEventsWithPlateFieldsChunked } from './realJourneyEventPlate'
import { fetchJourneyEvents } from './realTruckflowApi'
import { yieldToBrowser } from '../utils/yieldToBrowser'

/** Origen público del servicio journey-event */
export const JOURNEY_EVENT_API_PUBLIC_ORIGIN = 'http://138.36.237.33:8090'

export const RECOMMENDED_JOURNEY_EXPORT_START_DATE = '2026-04-29'
export const RECOMMENDED_JOURNEY_EXPORT_END_DATE = '2026-05-05'

/** Fallback si la API falla y preferís cargar desde public/. */
export const DEFAULT_REAL_JOURNEY_EVENTS_FILE =
  '/mock-data/realdata/journey-events_2026-04-29_2026-05-05.json'

/**
 * Base URL para listar events.
 * En dev (Vite) usa proxy `/journey-api` → servidor real (evita CORS).
 * En build: mismo host que el servidor o variable `VITE_REAL_JOURNEY_API_ORIGIN`.
 */
export function resolveJourneyEventApiOrigin(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_REAL_JOURNEY_API_ORIGIN : undefined
  if (env && String(env).trim()) return String(env).trim().replace(/\/$/, '')
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/journey-api'
  return JOURNEY_EVENT_API_PUBLIC_ORIGIN
}

export function buildJourneyEventListUrl(startDate: string, endDate: string, plate?: string): string {
  const origin = resolveJourneyEventApiOrigin()
  const q = new URLSearchParams()
  const s = startDate.trim()
  const e = endDate.trim()
  if (s) q.set('startDate', s)
  if (e) q.set('endDate', e)
  const p = plate?.trim()
  if (p) q.set('plate', p)
  const qs = q.toString()
  return qs ? `${origin}/journey-event/list?${qs}` : `${origin}/journey-event/list`
}

/** URL visible (host 138…) para copiar fuera del proxy de desarrollo. */
export function buildJourneyEventListPublicDisplayUrl(startDate: string, endDate: string, plate?: string): string {
  const q = new URLSearchParams()
  const s = startDate.trim()
  const e = endDate.trim()
  if (s) q.set('startDate', s)
  if (e) q.set('endDate', e)
  const p = plate?.trim()
  if (p) q.set('plate', p)
  const qs = q.toString()
  return qs
    ? `${JOURNEY_EVENT_API_PUBLIC_ORIGIN}/journey-event/list?${qs}`
    : `${JOURNEY_EVENT_API_PUBLIC_ORIGIN}/journey-event/list`
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}

function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function extractEventsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload !== null && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const v = obj.value
    if (Array.isArray(v)) return v
    const d = obj.data
    if (Array.isArray(d)) return d
    const events = obj.events
    if (Array.isArray(events)) return events
    // Export local server: data/truckflow/<day>/event-list.json
    const records = obj.records
    if (Array.isArray(records)) return records
    const items = obj.items
    if (Array.isArray(items)) return items
  }
  return []
}

/**
 * Interpreta cada elemento del JSON como un evento; ignora campos extra (version, createdAt, …).
 */
function parseRow(raw: unknown, fallbackIndex: number): ApiRealJourneyEventRow | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = coerceNumber(o.id, fallbackIndex)
  const sequenceNumber = coerceNumber(o.sequenceNumber, 0)
  const journeyUid = coerceString(o.journeyUid ?? o.journeyUuid).trim()
  if (!journeyUid) return null

  const occurredAt =
    coerceString(o.occurredAt, '') ||
    coerceString(o.recordedAt, '') ||
    coerceString(o.createdAt, '') ||
    coerceString(o.modifiedAt, '')
  const recordedAt = coerceString(o.recordedAt, '') || occurredAt

  return {
    id,
    createdAt: coerceString(o.createdAt, ''),
    modifiedAt: coerceString(o.modifiedAt, ''),
    journeyUid,
    sequenceNumber,
    eventCategory: coerceString(o.eventCategory, ''),
    eventType: coerceString(o.eventType, ''),
    occurredAt,
    recordedAt,
    truckPlate: coerceString(o.truckPlate, ''),
    sectorCode: coerceString(o.sectorCode, ''),
    deviceCode: coerceString(o.deviceCode, ''),
    alertLevel: coerceNumber(o.alertLevel, 0),
  }
}

const FILE_PARSE_YIELD_EVERY = 5_000

export async function parsePayloadToJourneyEvents(payload: unknown): Promise<RealJourneyEventDto[]> {
  const arr = extractEventsArray(payload)
  const out: ApiRealJourneyEventRow[] = []
  for (let idx = 0; idx < arr.length; idx++) {
    const ev = parseRow(arr[idx], 1_000_000 + idx)
    if (ev) out.push(ev)
    if (idx > 0 && (idx + 1) % FILE_PARSE_YIELD_EVERY === 0) await yieldToBrowser()
  }
  if (out.length <= FILE_PARSE_YIELD_EVERY) return annotateRealJourneyEventsWithPlateFields(out)
  return annotateRealJourneyEventsWithPlateFieldsChunked(out)
}
/**
 * GET journey-event/list con rango [startDate, endDate] (YYYY-MM-DD).
 * Misma implementación que export Power BI: timeout, mismos parámetros y parseo por cortes.
 */
export async function loadRealJourneyEventsFromApi(
  startDate: string,
  endDate: string,
  options?: { plate?: string }
): Promise<RealJourneyEventDto[]> {
  return fetchJourneyEvents({
    startDate: startDate.trim(),
    endDate: endDate.trim(),
    plate: options?.plate?.trim(),
  })
}

/**
 * Carga desde JSON en `public/` (sin API).
 */
export async function loadRealJourneyEventsFromFile(
  filePath: string = DEFAULT_REAL_JOURNEY_EVENTS_FILE
): Promise<RealJourneyEventDto[]> {
  const res = await fetch(filePath, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`No se pudo cargar datos reales: ${filePath} (${res.status})`)
  }
  const payload: unknown = await res.json()
  return await parsePayloadToJourneyEvents(payload)
}
