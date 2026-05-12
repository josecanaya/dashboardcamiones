import type { RealJourneyEventDto } from './realJourneyEvents.types'
import { annotateRealJourneyEventsWithPlateFields } from './realJourneyEventPlate'

export const REAL_TRUCKFLOW_BASE_URL = 'http://138.36.237.33:8090'

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

export async function fetchJourneyEvents(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string }
): Promise<RealJourneyEventDto[]> {
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/journey-event/list${buildQuery(params)}`
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Error consultando eventos (${response.status}) en ${url}`)
  const payload: unknown = await response.json()
  const rows = extractArray(payload)
  const parsed = rows
    .map((raw, index) => {
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
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  return annotateRealJourneyEventsWithPlateFields(parsed)
}

export async function fetchAlerts(
  params: RealTruckflowQueryParams = {},
  opts?: { baseOrigin?: string }
): Promise<RealAlertDto[]> {
  const origin = (opts?.baseOrigin?.trim() || resolveRealTruckflowApiOrigin()).replace(/\/$/, '')
  const url = `${origin}/alert/list${buildQuery(params)}`
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Error consultando alertas (${response.status}) en ${url}`)
  const payload: unknown = await response.json()
  const rows = extractArray(payload)
  return rows.filter((row): row is RealAlertDto => Boolean(row) && typeof row === 'object')
}
