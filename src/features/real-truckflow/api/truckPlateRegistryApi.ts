import type {
  TruckPlateRegistryDocument,
  TruckPlateRegistryEntry,
  TruckPlateRegistryCategory,
} from '../../../domain/truckPlateRegistry'
import { localApiPrefix } from './truckflowLocalServerApi'

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

export async function getTruckPlateRegistry(): Promise<TruckPlateRegistryDocument> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/plate-registry`, { headers: { Accept: 'application/json' } })
  const doc = await parseJson<TruckPlateRegistryDocument & { registryRoot?: string }>(res)
  return {
    version: 1,
    updatedAt: doc.updatedAt,
    entries: doc.entries ?? [],
  }
}

export async function lookupTruckPlateRegistry(plate: string): Promise<{
  plate: string
  found: boolean
  entry: TruckPlateRegistryEntry | null
}> {
  const prefix = localApiPrefix()
  const q = encodeURIComponent(plate)
  const res = await fetch(`${prefix}/plate-registry/lookup?plate=${q}`, {
    headers: { Accept: 'application/json' },
  })
  return parseJson(res)
}

export async function createTruckPlateRegistryEntry(body: {
  plate: string
  category: TruckPlateRegistryCategory
  notes?: string
  label?: string
  active?: boolean
  excludeFromAnalytics?: boolean
  createdBy?: string
}): Promise<{ entry: TruckPlateRegistryEntry; updatedAt: string }> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/plate-registry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function updateTruckPlateRegistryEntry(
  id: string,
  body: Partial<{
    plate: string
    category: TruckPlateRegistryCategory
    notes: string
    label: string
    active: boolean
    excludeFromAnalytics: boolean
  }>
): Promise<{ entry: TruckPlateRegistryEntry; updatedAt: string }> {
  const prefix = localApiPrefix()
  const res = await fetch(`${prefix}/plate-registry/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

export async function deleteTruckPlateRegistryEntry(
  id: string,
  opts?: { hard?: boolean }
): Promise<{ ok: boolean; id: string }> {
  const prefix = localApiPrefix()
  const hard = opts?.hard ? '?hard=1' : ''
  const res = await fetch(`${prefix}/plate-registry/${encodeURIComponent(id)}${hard}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  return parseJson(res)
}
