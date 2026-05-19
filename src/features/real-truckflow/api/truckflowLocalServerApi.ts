/** Cliente HTTP del servidor local `npm run server:truckflow` (proxy `/api/truckflow` en Vite). */

export type TruckflowExportDayResult = {
  day: string
  eventsDownloaded: number
  alertsDownloaded: number
  status: 'ok' | 'error'
  error?: string
}

export type TruckflowExportPeriodResponse = {
  dataRoot: string
  baseUrl: string
  startDate: string
  endDate: string
  site: string
  /** Días exportados en paralelo en el servidor (TRUCKFLOW_EXPORT_CONCURRENCY). */
  concurrency?: number
  days: TruckflowExportDayResult[]
}

export type TruckflowLoadLocalPeriodResponse = {
  dataRoot: string
  startDate: string
  endDate: string
  daysLoaded: number
  perDay: { day: string; eventFile: boolean; alertFile: boolean; events: number; alerts: number }[]
  events: unknown[]
  alerts: unknown[]
}

export type TruckflowListDaysResponse = {
  days: string[]
  dataRoot: string
}

export type TruckflowSiteParam = 'ricardone' | 'san_lorenzo' | 'all'

function localApiPrefix(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/truckflow'
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TRUCKFLOW_LOCAL_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  return '/api/truckflow'
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Respuesta no JSON (${res.status})`)
  }
  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : text
    throw new Error(err || `Error HTTP ${res.status}`)
  }
  return body as T
}

export async function getTruckflowHealth(): Promise<{ ok: boolean; dataRoot: string }> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/health`, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  if (!res.ok) {
    let detail = text
    try {
      const j = JSON.parse(text) as { error?: string }
      if (j?.error) detail = j.error
    } catch {
      /* usar texto crudo */
    }
    throw new Error(detail.trim() || `HTTP ${res.status}`)
  }
  return JSON.parse(text) as { ok: boolean; dataRoot: string }
}

export async function postTruckflowExportPeriod(body: {
  startDate: string
  endDate: string
  site?: TruckflowSiteParam
  baseUrl?: string
}): Promise<TruckflowExportPeriodResponse> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/export-period`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export type TruckflowExportOneDayResponse = {
  dataRoot: string
  baseUrl: string
  site: string
  day: string
  eventsDownloaded: number
  alertsDownloaded: number
  status: 'ok' | 'error'
  error?: string
}

export async function postTruckflowExportOneDay(body: {
  day: string
  site?: TruckflowSiteParam
  baseUrl?: string
}): Promise<TruckflowExportOneDayResponse> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/export-one-day`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export type TruckflowExportWindowResponse = {
  dataRoot: string
  baseUrl: string
  site: string
  partitionDay: string
  startDatetime: string
  endDatetime: string
  eventsDownloaded: number
  alertsDownloaded: number
  status: 'ok' | 'error'
  error?: string
}

/** Ventana dentro de un solo día civil (partitionDay); escribe JSON en data/truckflow/partitionDay/. */
export async function postTruckflowExportWindow(body: {
  partitionDay: string
  startDatetime: string
  endDatetime: string
  site?: TruckflowSiteParam
  baseUrl?: string
}): Promise<TruckflowExportWindowResponse> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/export-window`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function postTruckflowLoadLocalPeriod(body: {
  startDate: string
  endDate: string
}): Promise<TruckflowLoadLocalPeriodResponse> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/load-local-period`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function getTruckflowListDays(): Promise<TruckflowListDaysResponse> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/list-days`, { headers: { Accept: 'application/json' } })
  return parseJson(res)
}
