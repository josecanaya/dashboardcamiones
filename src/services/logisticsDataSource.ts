import type { SiteId } from '../domain/sites'
import type { AlertSeverity, AlertStatus, CameraEventRaw, HistoricalTrip, OperationalAlert, TruckInPlant } from '../domain/logistics'

export type RawCameraEventDebug = {
  eventType?: string
  snapshotTime?: string
  plateNo?: string
  region?: string
  targetPlateSize?: string
  logo?: string
  vehicleType?: string
  imageUrl?: string
}

type ExternalEnrichedEvent = {
  eventId?: string
  snapshotTime?: string
  plateNo?: string
  plant?: string
  cameraId?: string
  sector?: string
  inferredTruckId?: string
  inferredCircuitCode?: string
  imageUrl?: string
  region?: string
  logo?: string
  vehicleType?: string
}

type ExternalTruckInPlant = {
  truckId?: string
  plate?: string
  plant?: string
  circuitCode?: string
  currentSector?: string
  currentCameraId?: string
  lastSeenAt?: string
  visitedSectors?: string[]
}

type ExternalHistoricalTrip = {
  tripId?: string
  truckId?: string
  plate?: string
  plant?: string
  inferredCircuitCode?: string
  startedAt?: string
  endedAt?: string
  /** Fecha de egreso YYYY-MM-DD para filtrado por día/semana/mes */
  fecha?: string
  fechaDia?: number
  fechaMes?: number
  fechaAnio?: number
  visitedSectors?: string[]
  expectedSequence?: string[]
  completed?: boolean
  durationMinutes?: number
  classification?: 'VALIDADO' | 'CON_OBSERVACIONES' | 'ANOMALO'
  /** Enriquecimiento desde microservicio (opcional) */
  catalogCode?: string
  catalogName?: string
  cir?: string
  vue?: string
  descripcion?: string
}

/** Formato esperado del microservicio: las alertas ya vienen procesadas. */
type ExternalAlert = {
  alertId?: string
  type?: string
  severity?: string
  status?: string
  detectedAt?: string
  plant?: string
  truckId?: string
  plate?: string
  message?: string
  cameraCode?: string
  circuitoEsperado?: string
  circuitoObservado?: string
  sectorId?: string
  context?: {
    expectedEnd?: string
    currentSector?: string
    visitedSectors?: string[]
  }
}

interface DataSourceConfig {
  basePath: string
  scenario: string
}

let runtimeConfig: Partial<DataSourceConfig> = {}

/** Escenario por defecto: live. Se guarda en localStorage para que el dashboard cargue desde el simulador en vivo. */
if (typeof window !== 'undefined') {
  const current = localStorage.getItem('logistics.mock.scenario')
  if (!current || current === 'march_full') {
    localStorage.setItem('logistics.mock.scenario', 'live')
  }
}

export interface LogisticsSnapshot {
  rawCameraEvents: RawCameraEventDebug[]
  enrichedCameraEvents: CameraEventRaw[]
  trucksInPlant: TruckInPlant[]
  historicalTrips: HistoricalTrip[]
  operationalAlerts: OperationalAlert[]
  meta: { basePath: string; scenario: string; loadedAt: string; simulatedGeneratedAt?: string }
}

function getConfig(): DataSourceConfig {
  const fromStorageBase = typeof window !== 'undefined' ? localStorage.getItem('logistics.mock.basePath') : null
  const fromStorageScenario = typeof window !== 'undefined' ? localStorage.getItem('logistics.mock.scenario') : null
  return {
    basePath: runtimeConfig.basePath || fromStorageBase || '/mock-data',
    scenario: runtimeConfig.scenario || fromStorageScenario || 'live',
  }
}

export function configureLogisticsDataSource(config: Partial<DataSourceConfig>) {
  runtimeConfig = { ...runtimeConfig, ...config }
}

function toSiteId(value: string | undefined): SiteId {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  if (normalized.includes('san_lorenzo') || normalized.includes('san-lorenzo')) return 'san_lorenzo'
  if (normalized.includes('avellaneda')) return 'avellaneda'
  return 'ricardone'
}

/** Normaliza severidad a mayúsculas (el microservicio puede enviar "medium" o "MEDIUM"). */
function normalizeSeverity(value: string | undefined): AlertSeverity {
  const v = (value ?? '').toUpperCase()
  if (v === 'CRITICAL' || v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v as AlertSeverity
  return 'LOW'
}

function normalizeStatus(value: string | undefined): AlertStatus {
  const v = (value ?? '').toUpperCase()
  if (v === 'OPEN' || v === 'ACKNOWLEDGED' || v === 'RESOLVED') return v as AlertStatus
  return 'OPEN'
}

async function fetchJson<T>(url: string, bustCache = false): Promise<T> {
  const finalUrl = bustCache ? `${url}?t=${Date.now()}` : url
  const response = await fetch(finalUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`No se pudo leer ${url}`)
  return (await response.json()) as T
}

const PLANT_SUFFIXES = ['ricardone', 'san_lorenzo', 'avellaneda'] as const

async function fetchByPlant<T>(
  basePath: string,
  scenario: string,
  baseName: string,
  extract: (p: unknown) => T[] | undefined
): Promise<{ items: T[]; generatedAt?: string }> {
  if (scenario !== 'live') {
    const payload = await fetchJson<{ events?: T[]; data?: T[]; generatedAt?: string }>(
      `${basePath}/${scenario}/${baseName}.json`,
      false
    )
    const items = extract(payload) ?? (payload as { events?: T[] }).events ?? (payload as { data?: T[] }).data ?? []
    return { items, generatedAt: (payload as { generatedAt?: string }).generatedAt }
  }
  // En live: datos en carpetas por planta (live/ricardone/camiones_en_planta.json, etc.)
  const results = await Promise.allSettled(
    PLANT_SUFFIXES.map((s) =>
      fetchJson<{ events?: T[]; data?: T[]; generatedAt?: string }>(
        `${basePath}/${scenario}/${s}/${baseName}.json`,
        true
      )
    )
  )
  const items: T[] = []
  let generatedAt: string | undefined
  for (const r of results) {
    if (r.status === 'fulfilled') {
      items.push(...(extract(r.value) ?? r.value.events ?? r.value.data ?? []))
      if (r.value.generatedAt) generatedAt = r.value.generatedAt
    }
  }
  return { items, generatedAt }
}

export async function getRawCameraEvents(): Promise<RawCameraEventDebug[]> {
  const { basePath, scenario } = getConfig()
  const { items } = await fetchByPlant<RawCameraEventDebug>(
    basePath,
    scenario,
    'raw_camera_events',
    (p) => (p as { events?: RawCameraEventDebug[] }).events
  )
  return items
}

export async function getEnrichedCameraEvents(siteId?: SiteId): Promise<CameraEventRaw[]> {
  const { basePath, scenario } = getConfig()
  const { items } = await fetchByPlant<ExternalEnrichedEvent>(
    basePath,
    scenario,
    'camera_events_enriched',
    (p) => (p as { events?: ExternalEnrichedEvent[] }).events
  )
  const now = new Date().toISOString()
  return items
    .map((event, idx) => ({
      eventId: event.eventId ?? `enr-${idx}`,
      timestamp: event.snapshotTime ?? now,
      cameraCode: event.cameraId ?? 'CAM_UNKNOWN',
      sectorId: event.sector ?? 'S?',
      camionId: event.inferredTruckId ?? `truck-${idx}`,
      plate: event.plateNo ?? 'N/A',
      confidence: 0.9,
      imageUrl: event.imageUrl,
      siteId: toSiteId(event.plant),
    }))
    .filter((event) => !siteId || event.siteId === siteId)
}

/** Sectores de egreso por planta: circuito cerrado cuando el camión pasa por aquí */
const EGRESO_SECTORS_BY_SITE: Record<SiteId, Set<string>> = {
  ricardone: new Set(['S3', 'S10']),
  san_lorenzo: new Set(['S3', 'S10']),
  avellaneda: new Set(['S3', 'S10']),
}

/** Sectores para distribuir camiones en el visor (evita S3/S10 egreso Ricardone, S7 egreso San Lorenzo) */
const SECTORES_PARA_DISTRIBUIR = ['S1', 'S2', 'S4', 'S5', 'S6', 'S8', 'S9'] as const

/** Ventana en ms para considerar "activo en planta": solo camiones vistos recientemente */
const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000 // 4 horas

export async function getTrucksInPlant(siteId?: SiteId): Promise<TruckInPlant[]> {
  const { basePath, scenario } = getConfig()
  const [camionesResult, enrichedResult] = await Promise.all([
    fetchByPlant<ExternalTruckInPlant>(basePath, scenario, 'camiones_en_planta', (p) => (p as { data?: ExternalTruckInPlant[] }).data),
    fetchByPlant<ExternalEnrichedEvent>(basePath, scenario, 'camera_events_enriched', (p) => (p as { events?: ExternalEnrichedEvent[] }).events),
  ])
  const payload = { data: camionesResult.items, generatedAt: camionesResult.generatedAt }
  const enriched = { events: enrichedResult.items }

  const enrichedByTruck = new Map<string, ExternalEnrichedEvent[]>()
  for (const event of enriched.events ?? []) {
    const truckId = event.inferredTruckId ?? ''
    if (!truckId) continue
    if (!enrichedByTruck.has(truckId)) enrichedByTruck.set(truckId, [])
    enrichedByTruck.get(truckId)!.push(event)
  }

  // En modo live: camiones_en_planta es la fuente de verdad (simulador actualiza cada tick).
  // No filtrar por tiempo para evitar excluir camiones por desfase reloj simulado vs real.
  const cutoffMs =
    scenario === 'live'
      ? 0
      : (payload.generatedAt ? new Date(payload.generatedAt).getTime() : Date.now()) - ACTIVE_WINDOW_MS

  const rawData = (payload.data ?? []).filter((truck) => {
    if (cutoffMs > 0) {
      const lastSeen = truck.lastSeenAt ? new Date(truck.lastSeenAt).getTime() : 0
      if (lastSeen < cutoffMs) return false
    }
    const lastSector = truck.visitedSectors?.slice(-1)[0] ?? truck.currentSector
    const truckSite = toSiteId(truck.plant)
    const egresoSectors = EGRESO_SECTORS_BY_SITE[truckSite]
    if (lastSector && egresoSectors?.has(lastSector)) return false
    return true
  })

  const mapped = rawData.map((truck, idx) => {
    const truckSite = toSiteId(truck.plant)
    const relatedEvents = [...(enrichedByTruck.get(truck.truckId ?? '') ?? [])].sort((a, b) =>
      new Date(a.snapshotTime ?? 0).getTime() - new Date(b.snapshotTime ?? 0).getTime()
    )
    const firstSeen = relatedEvents[0]?.snapshotTime ?? truck.lastSeenAt ?? new Date().toISOString()
    const lastSeen = relatedEvents[relatedEvents.length - 1]?.snapshotTime ?? truck.lastSeenAt ?? new Date().toISOString()
    const sectorIdx = idx % SECTORES_PARA_DISTRIBUIR.length
    const sectorAsignado = SECTORES_PARA_DISTRIBUIR[sectorIdx]
    const camaraAsignada = truckSite === 'san_lorenzo' ? `CAM_SL_${sectorAsignado}_01` : `CAM_RIC_${sectorAsignado}_01`
    const ultimoEvento = relatedEvents[relatedEvents.length - 1]
    const ultimoEventoCamara = ultimoEvento
      ? {
          hora: ultimoEvento.snapshotTime ?? lastSeen,
          patente: ultimoEvento.plateNo ?? truck.plate ?? 'N/A',
          region: ultimoEvento.region ?? 'N/A',
          logo: ultimoEvento.logo ?? 'N/A',
          vehicleType: ultimoEvento.vehicleType ?? 'N/A',
        }
      : undefined
    return {
      camionId: truck.truckId ?? `truck-${idx}`,
      plate: truck.plate ?? `SIM-${idx + 1}`,
      circuitoEstimado: truck.circuitCode ?? 'N/A',
      circuitoValidado: truck.circuitCode ?? undefined,
      sectorActual: sectorAsignado,
      camaraActual: camaraAsignada,
      ingresoAt: firstSeen,
      ultimoEventoAt: lastSeen,
      secuenciaParcialCamaras: [camaraAsignada],
      secuenciaParcialSectores: [sectorAsignado],
      estadoOperativo: 'EN_CIRCULACION' as const,
      activeAlerts: [],
      siteId: truckSite,
      ultimaFotoUrl: '/ejemplo.png',
      ultimoEventoCamara,
    }
  })

  return mapped.filter((truck) => !siteId || truck.siteId === siteId)
}

export async function getHistoricalTrips(siteId?: SiteId): Promise<HistoricalTrip[]> {
  const { basePath, scenario } = getConfig()
  let { items, generatedAt } = await fetchByPlant<ExternalHistoricalTrip>(
    basePath,
    scenario,
    'historico_recorridos',
    (p) => (p as { data?: ExternalHistoricalTrip[] }).data
  )
  // Fallback: si live está vacío, cargar desde normal (datos pre-generados)
  if (scenario === 'live' && items.length === 0) {
    const fallback = await fetchByPlant<ExternalHistoricalTrip>(
      basePath,
      'normal',
      'historico_recorridos',
      (p) => (p as { data?: ExternalHistoricalTrip[] }).data
    )
    items = fallback.items
    if (fallback.generatedAt) generatedAt = fallback.generatedAt
  }
  const payload = { data: items }
  const mapped = (payload.data ?? []).map((trip, idx) => {
    const egresoAt = trip.endedAt ?? new Date().toISOString()
    const egresoDate = new Date(egresoAt)
    const fecha = trip.fecha ?? `${egresoDate.getUTCFullYear()}-${String(egresoDate.getUTCMonth() + 1).padStart(2, '0')}-${String(egresoDate.getUTCDate()).padStart(2, '0')}`
    const fechaDia = trip.fechaDia ?? egresoDate.getUTCDate()
    const fechaMes = trip.fechaMes ?? egresoDate.getUTCMonth() + 1
    const fechaAnio = trip.fechaAnio ?? egresoDate.getUTCFullYear()
    return {
      tripId: trip.tripId ?? `trip-${idx}`,
      camionId: trip.truckId ?? `truck-${idx}`,
      plate: trip.plate ?? 'N/A',
      circuitoFinal: trip.inferredCircuitCode ?? 'N/A',
      ingresoAt: trip.startedAt ?? new Date().toISOString(),
      egresoAt,
      fecha,
      fechaDia,
      fechaMes,
      fechaAnio,
      durationMinutes: trip.durationMinutes ?? 0,
      secuenciaCamaras: (trip.expectedSequence ?? []).map((sector) => `CAM_${sector}`),
      secuenciaSectores: trip.visitedSectors ?? [],
      alerts: [],
      estadoFinal: (trip.classification ?? (trip.completed ? 'VALIDADO' : 'CON_OBSERVACIONES')) as 'VALIDADO' | 'CON_OBSERVACIONES' | 'ANOMALO',
      siteId: toSiteId(trip.plant),
      catalogCode: trip.catalogCode,
      catalogName: trip.catalogName,
      cir: trip.cir,
      vue: trip.vue,
      descripcion: trip.descripcion,
    }
  })
  return mapped.filter((trip) => !siteId || trip.siteId === siteId)
}

/**
 * Carga alertas operativas. El microservicio envía el JSON ya procesado;
 * solo normalizamos campos (severidad a mayúsculas, siteId, etc.).
 */
export async function getOperationalAlerts(siteId?: SiteId): Promise<OperationalAlert[]> {
  const { basePath, scenario } = getConfig()
  const { items } = await fetchByPlant<ExternalAlert>(
    basePath,
    scenario,
    'alertas_operativas',
    (p) => (p as { data?: ExternalAlert[] }).data
  )
  const payload = { data: items }
  const now = new Date().toISOString()
  const mapped = (payload.data ?? []).map((alert, idx) => {
    const detectedAt = alert.detectedAt ?? now
    return {
      alertId: alert.alertId ?? `alert-${idx}`,
      type: alert.type ?? 'SIN_ACTUALIZACION',
      severity: normalizeSeverity(alert.severity),
      status: normalizeStatus(alert.status),
      createdAt: detectedAt,
      updatedAt: detectedAt,
      camionId: alert.truckId ?? `truck-${idx}`,
      plate: alert.plate ?? 'N/A',
      circuitoEsperado: alert.circuitoEsperado ?? alert.context?.expectedEnd,
      circuitoObservado: alert.circuitoObservado ?? alert.context?.currentSector,
      sectorId: alert.sectorId ?? alert.context?.currentSector,
      cameraCode: alert.cameraCode,
      elapsedMinutes: Math.max(0, Math.floor((Date.now() - new Date(detectedAt).getTime()) / 60000)),
      resolutionNote: alert.message,
      siteId: toSiteId(alert.plant),
    }
  })
  return mapped.filter((alert) => !siteId || alert.siteId === siteId)
}

export async function loadLogisticsSnapshot(siteId?: SiteId): Promise<LogisticsSnapshot> {
  const { basePath, scenario } = getConfig()
  const historicoFetch = (async () => {
    const live = await fetchByPlant<ExternalHistoricalTrip>(
      basePath,
      scenario,
      'historico_recorridos',
      (p) => (p as { data?: ExternalHistoricalTrip[] }).data
    )
    if (scenario === 'live' && live.items.length === 0) {
      const fallback = await fetchByPlant<ExternalHistoricalTrip>(
        basePath,
        'normal',
        'historico_recorridos',
        (p) => (p as { data?: ExternalHistoricalTrip[] }).data
      )
      return { items: fallback.items, generatedAt: fallback.generatedAt }
    }
    return live
  })()

  const mapTrip = (trip: ExternalHistoricalTrip, idx: number) => {
    const egresoAt = trip.endedAt ?? new Date().toISOString()
    const egresoDate = new Date(egresoAt)
    const fecha = trip.fecha ?? `${egresoDate.getUTCFullYear()}-${String(egresoDate.getUTCMonth() + 1).padStart(2, '0')}-${String(egresoDate.getUTCDate()).padStart(2, '0')}`
    return {
      tripId: trip.tripId ?? `trip-${idx}`,
      camionId: trip.truckId ?? `truck-${idx}`,
      plate: trip.plate ?? 'N/A',
      circuitoFinal: trip.inferredCircuitCode ?? 'N/A',
      ingresoAt: trip.startedAt ?? new Date().toISOString(),
      egresoAt,
      fecha,
      fechaDia: trip.fechaDia ?? egresoDate.getUTCDate(),
      fechaMes: trip.fechaMes ?? egresoDate.getUTCMonth() + 1,
      fechaAnio: trip.fechaAnio ?? egresoDate.getUTCFullYear(),
      durationMinutes: trip.durationMinutes ?? 0,
      secuenciaCamaras: (trip.expectedSequence ?? []).map((s) => `CAM_${s}`),
      secuenciaSectores: trip.visitedSectors ?? [],
      alerts: [],
      estadoFinal: (trip.classification ?? (trip.completed ? 'VALIDADO' : 'CON_OBSERVACIONES')) as
        | 'VALIDADO'
        | 'CON_OBSERVACIONES'
        | 'ANOMALO',
      siteId: toSiteId(trip.plant),
      catalogCode: trip.catalogCode,
      catalogName: trip.catalogName,
      cir: trip.cir,
      vue: trip.vue,
      descripcion: trip.descripcion,
    }
  }

  const [rawCameraEvents, enrichedCameraEvents, trucksInPlant, historicoResult, operationalAlerts] = await Promise.all([
    getRawCameraEvents(),
    getEnrichedCameraEvents(siteId),
    getTrucksInPlant(siteId),
    historicoFetch.then((p) => {
      const trips = (p.items ?? []).map((t, i) => mapTrip(t, i))
      return { trips, generatedAt: p.generatedAt }
    }),
    getOperationalAlerts(siteId),
  ])

  const historicalTrips = historicoResult.trips.filter((t) => !siteId || t.siteId === siteId)
  const simulatedGeneratedAt = historicoResult.generatedAt

  return {
    rawCameraEvents,
    enrichedCameraEvents,
    trucksInPlant,
    historicalTrips,
    operationalAlerts,
    meta: {
      basePath,
      scenario,
      loadedAt: new Date().toISOString(),
      simulatedGeneratedAt,
    },
  }
}
