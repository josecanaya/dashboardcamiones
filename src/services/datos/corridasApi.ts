/**
 * Corridas semanales del ETL (runs/windows/<lunes>_<domingo>) vistas desde la app.
 * La corrida la hace el runner headless del servidor (POST /api/etl/runs), igual que
 * comite_semana.py: la app solo elige la semana, baja las cámaras que falten y la dispara.
 */
import { fetchLocalTruckflow } from '../../features/real-truckflow/api/truckflowLocalFetch'

export type SavedWindow = {
  from: string
  to: string
  runId: string
  rulesVersion?: string
  createdAt?: string
  stale: boolean
}

export type Coverage = {
  windows: SavedWindow[]
  currentRulesVersion: string
  cameraDays: Set<string>
  movimientosRows: Map<string, number>
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = {}
  try { body = text ? JSON.parse(text) : {} } catch { /* cuerpo no JSON */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return body as T
}

export async function getCoverage(): Promise<Coverage> {
  const [w, d, m] = await Promise.all([
    fetch('/api/etl/windows').then(r => json<{ windows: SavedWindow[]; currentRulesVersion: string }>(r)),
    fetch('/api/etl/data-days').then(r => json<{ days: string[] }>(r)),
    fetch('/api/movimientos/list-days').then(r => json<{ days: { day: string; rows: number }[] }>(r)),
  ])
  return {
    windows: w.windows,
    currentRulesVersion: w.currentRulesVersion,
    cameraDays: new Set(d.days),
    movimientosRows: new Map(m.days.map(x => [x.day, x.rows])),
  }
}

/** Baja de la API de TruckFlow los eventos y alertas de un día a data/truckflow/<día>/. */
export async function downloadCameraDay(day: string): Promise<{ eventsDownloaded?: number; status?: string; error?: string }> {
  return json(await fetchLocalTruckflow('/export-one-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day }),
  }))
}

/** Reprocesa la semana con el runner headless (force: no usa la corrida cacheada). */
export async function runWeek(from: string, to: string): Promise<{ runId: string }> {
  return json(await fetch('/api/etl/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, force: true, skipSupabase: true }),
  }))
}
