/** Cliente del snapshot de Plant State del server local (:8787). */
import { fetchLocalTruckflow } from '../../features/real-truckflow/api/truckflowLocalFetch'
import { localApiPrefix } from '../../features/real-truckflow/api/truckflowLocalServerApi'

export type SectorType =
  | 'gate'
  | 'queue'
  | 'process'
  | 'buffer'
  | 'scale'
  | 'discharge'
  | 'load'
  | 'exit'

export type SectorStatus = 'normal' | 'attention' | 'critical' | 'no_data'

export type EdgeStatus = 'online' | 'degraded' | 'offline'

export type SectorState = {
  sectorCode: string
  label: string
  type: SectorType
  present: number
  capacity: number | null
  in60: number
  out60: number
  rate60: number
  delta40: number
  dwellAvgMin: number | null
  dwellP90Min: number | null
  status: SectorStatus
  edgeId: string
}

export type EdgeState = {
  id: string
  label: string
  status: EdgeStatus
  camerasOk: number
  camerasExpected: number
  lastEventAgeS: number | null
  detections60: number
  ocrQuality: number | null
}

export type DrainPoint = {
  id: string
  label: string
  sectorCode: string | null
  ratePerHour: number | null
}

/**
 * Una zona es el espacio ENTRE puntos: ahí es donde el camión espera. El backlog se
 * vacía por el punto siguiente, así que `backlog / drainRatePerHour` da el tiempo de
 * espera — el número que el operador realmente necesita.
 */
export type ZoneState = {
  id: string
  label: string
  from: string | null
  fromLabel: string | null
  to: string[]
  drainPoints: DrainPoint[]
  backlog: number
  /** Cuántos entran (densidad). */
  capacityPhysical: number | null
  /** Cuántos puede haber sin romper la operación. Contra esta se evalúa el estado. */
  capacityOperational: number | null
  in60: number
  out60: number
  delta40: number
  dwellAvgMin: number | null
  dwellP90Min: number | null
  /** Suma de las tasas de los puntos que están recibiendo AHORA. */
  drainRatePerHour: number | null
  drainRateNominalPerHour: number | null
  drainMinutes: number | null
  activePoints: string[]
  idlePoints: string[]
  status: SectorStatus
  note: string | null
  pending: string | null
}

export type Bottleneck = {
  zoneId: string
  label: string
  drainMinutes: number
  backlog: number
}

export type PlantSnapshot = {
  site: string
  at: string
  plant: {
    trucksInPlant: number
    inflow60: number
    outflow60: number
    balance60: number
    dwellAvgMin: number | null
    dwellP90Min: number | null
    bottleneck: Bottleneck | null
  }
  sectors: SectorState[]
  zones: ZoneState[]
  edges: EdgeState[]
  trucksOpen: number
  generatedInMs: number
}

/** "2 h 48" · "9 min" · null si no hay tasa relevada. */
export function formatDrainMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export type SectorCameraHealth = {
  deviceCode: string
  health: 'ok' | 'stale' | 'offline'
  detections60: number
  lastEventAgeS: number | null
}

export type SectorBaseline = {
  quarter: string | null
  rate60: number | null
  dwellP90Min: number | null
  samples: number | null
}

export type SectorDetail = {
  site: string
  at: string
  sector: SectorState
  presenceSeries: { at: string; present: number }[]
  cameras: SectorCameraHealth[]
  edge: EdgeState | null
  baseline: SectorBaseline | null
}

export type TruckRow = {
  plate: string
  circuit: string | null
  circuitLabel: string | null
  provisional: boolean
  sectorCode: string
  dwellSectorMin: number | null
  dwellPlantMin: number | null
  nextExpectedPoint: string | null
  nextExpectedLabel: string | null
  status: 'normal' | 'attention' | 'critical'
  lastDevice: string | null
  minutesSinceLastDetection: number | null
}

export type TrucksList = {
  site: string
  at: string
  sector: string | null
  order: string
  count: number
  trucks: TruckRow[]
}

export type TruckTimelineRow = {
  at: string
  sectorCode: string
  logicalSector: string | null
  label: string
  deviceCode: string | null
  edgeId: string | null
  legFromPreviousMin: number | null
}

export type TruckJourney = {
  site: string
  at: string
  plate: string
  journeyUid: string
  open: boolean
  sectorCode: string
  sectorLabel: string
  circuit: string | null
  circuitLabel: string | null
  provisional: boolean
  nextExpectedPoint: string | null
  nextExpectedLabel: string | null
  dwellSectorMin: number | null
  dwellPlantMin: number | null
  minutesSinceLastDetection: number | null
  segmentCapMin: number | null
  lastDevice: string | null
  status: string
  anomaly: {
    code: string
    rule: string
    minutesSinceLastDetection: number | null
    segmentCapMin: number | null
    since: string
  } | null
  timeline: TruckTimelineRow[]
  note: string
}

export async function getPlantState(site: string): Promise<PlantSnapshot> {
  const res = await fetchLocalTruckflow(`/live/plant-state?site=${encodeURIComponent(site)}`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as Partial<PlantSnapshot> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as PlantSnapshot
}

export async function getSectorDetail(site: string, sectorCode: string): Promise<SectorDetail> {
  const res = await fetchLocalTruckflow(
    `/live/sectors/${encodeURIComponent(sectorCode)}?site=${encodeURIComponent(site)}`,
    { headers: { Accept: 'application/json' } }
  )
  const body = (await res.json()) as Partial<SectorDetail> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as SectorDetail
}

export async function getSectorTrucks(
  site: string,
  sectorCode: string,
  order: 'dwell' | 'plate' = 'dwell'
): Promise<TrucksList> {
  const q = new URLSearchParams({
    site,
    sector: sectorCode,
    order,
  })
  const res = await fetchLocalTruckflow(`/live/trucks?${q}`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as Partial<TrucksList> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as TrucksList
}

export async function getTruckJourney(site: string, plate: string): Promise<TruckJourney> {
  const res = await fetchLocalTruckflow(
    `/live/trucks/${encodeURIComponent(plate)}?site=${encodeURIComponent(site)}`,
    { headers: { Accept: 'application/json' } }
  )
  const body = (await res.json()) as Partial<TruckJourney> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as TruckJourney
}

/** Abre el stream SSE de plant-state. Devuelve `close` para cortar. */
export function openPlantStateStream(
  site: string,
  onSnapshot: (snapshot: PlantSnapshot) => void
): { close: () => void; es: EventSource } {
  const url = `${localApiPrefix()}/live/stream?site=${encodeURIComponent(site)}`
  const es = new EventSource(url)
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as PlantSnapshot
      if (data && typeof data === 'object' && data.plant) onSnapshot(data)
    } catch {
      /* mensaje no JSON o heartbeat — ignorar */
    }
  }
  return {
    es,
    close: () => {
      es.onmessage = null
      es.onerror = null
      es.close()
    },
  }
}
