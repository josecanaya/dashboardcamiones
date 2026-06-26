import type {
  FleetPlateLookupResult,
  PlantVisitUpsertInput,
  CamionProfile,
} from '../../../domain/truckFleet'
import { fetchLocalTruckflow, pingLocalTruckflowServer } from './truckflowLocalFetch'

const FETCH_TIMEOUT_MS = 180_000

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Respuesta no JSON (${res.status})`)
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body ?
        String((body as { error?: unknown }).error)
      : text
    throw new Error(err || `Error HTTP ${res.status}`)
  }
  return body as T
}

async function fetchWithTimeout(path: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetchLocalTruckflow(path, { ...init, signal: ctl.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        'Tiempo de espera agotado guardando un lote (3 min). Revisá la consola del servidor truckflow.'
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

export async function lookupFleetByPlate(plate: string): Promise<FleetPlateLookupResult> {
  const q = encodeURIComponent(plate)
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 30_000)
  try {
    const res = await fetchLocalTruckflow(`/fleet/lookup?plate=${q}`, {
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    return parseJson(res)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al buscar visitas (30 s). ¿Está corriendo server:truckflow?')
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

export async function updateCamionProfile(
  plate: string,
  body: Partial<{
    transportista: string
    tipoVinculo: string
    marca: string
    color: string
    tipoVehiculo: string
    notas: string
    plateDisplay: string
  }>
): Promise<{ camion: CamionProfile }> {
  const p = encodeURIComponent(plate)
  const res = await fetchLocalTruckflow(`/fleet/camion/${p}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export const FLEET_SYNC_BATCH_SIZE = 250

export type FleetStorageStatus = {
  storage: string
  ready: boolean
  supabaseHost?: string | null
  counts?: { camion: number; visitaPlanta: number } | null
  countsError?: string | null
  error?: string
  hint?: string
}

export async function fetchFleetStorageStatus(): Promise<FleetStorageStatus> {
  const res = await fetchLocalTruckflow('/fleet/status', { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as FleetStorageStatus & { error?: string }
  if (!res.ok) {
    return {
      storage: body.storage ?? 'supabase',
      ready: false,
      error: body.error ?? `HTTP ${res.status}`,
      hint: body.hint,
      supabaseHost: body.supabaseHost,
    }
  }
  return { ...body, ready: body.ready !== false }
}

async function syncPlantVisitsBatch(
  visitas: PlantVisitUpsertInput[]
): Promise<{
  ok: boolean
  storage: string
  inserted: number
  updated: number
  skipped: number
  plates: number
  supabaseHost?: string | null
  warning?: string | null
  dbCounts?: { camion: number; visitaPlanta: number; error?: string | null }
}> {
  const res = await fetchWithTimeout('/fleet/visitas/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ visitas }),
  })
  return parseJson(res)
}

export type FleetSyncProgress = { batch: number; totalBatches: number; rowsDone: number; rowsTotal: number }

/** Envía visitas en lotes para no superar el límite JSON del servidor. */
export async function syncPlantVisits(
  visitas: PlantVisitUpsertInput[],
  opts?: { onProgress?: (p: FleetSyncProgress) => void }
): Promise<{
  ok: boolean
  storage: string
  inserted: number
  updated: number
  skipped: number
  plates: number
  batches: number
  supabaseHost?: string | null
  dbCounts?: { camion: number; visitaPlanta: number }
  syncWarning?: string | null
}> {
  if (!visitas.length) {
    return { ok: true, storage: '', inserted: 0, updated: 0, skipped: 0, plates: 0, batches: 0 }
  }

  const ping = await pingLocalTruckflowServer()
  if (!ping.ok) {
    throw new Error(ping.error ?? 'Servidor local no disponible')
  }

  let inserted = 0
  let updated = 0
  let skipped = 0
  let storage = ''
  let batches = 0
  let supabaseHost: string | null | undefined
  let dbCounts: { camion: number; visitaPlanta: number } | undefined
  let syncWarning: string | null | undefined
  const totalBatches = Math.ceil(visitas.length / FLEET_SYNC_BATCH_SIZE)

  for (let i = 0; i < visitas.length; i += FLEET_SYNC_BATCH_SIZE) {
    const batch = batches + 1
    opts?.onProgress?.({
      batch,
      totalBatches,
      rowsDone: i,
      rowsTotal: visitas.length,
    })
    const chunk = visitas.slice(i, i + FLEET_SYNC_BATCH_SIZE)
    const res = await syncPlantVisitsBatch(chunk)
    storage = res.storage || storage
    inserted += res.inserted
    updated += res.updated
    skipped += res.skipped
    supabaseHost = res.supabaseHost ?? supabaseHost
    if (res.warning) syncWarning = res.warning
    if (res.dbCounts && !res.dbCounts.error) {
      dbCounts = { camion: res.dbCounts.camion, visitaPlanta: res.dbCounts.visitaPlanta }
    }
    batches++
  }

  const uniquePlates = new Set(visitas.map((v) => v.plateNormalized).filter(Boolean))

  return {
    ok: true,
    storage,
    inserted,
    updated,
    skipped,
    plates: uniquePlates.size,
    batches,
    supabaseHost,
    dbCounts,
    syncWarning,
  }
}
