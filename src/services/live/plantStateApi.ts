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
  /**
   * El punto de entrada de la zona no tiene ni una lectura en el buffer, asi que
   * `backlog` no es un cero medido sino la ausencia de medicion. La pantalla debe
   * mostrar "sin dato", nunca 0.
   */
  entryBlind?: boolean
  /**
   * `backlog` no se conto: se dedujo. Pasa en Playa OSL mientras la camara de
   * ingreso del puerto este caida — las llegadas se infieren del egreso de
   * Ricardone + 15 min. Es un orden de magnitud, no un conteo: mostrarlo
   * siempre como estimacion.
   */
  backlogInferred?: boolean
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
  /** Frescura de la fuente de cámaras (no del navegador). Ausente en servidores viejos. */
  source?: { lastEventAt: string | null; lastRefreshAt: string | null; lastError: string | null }
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
  zoneId: string | null
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

/** Todos los camiones abiertos de la planta, con su sector actual (capa de flujo del monitoreo). */
export async function getPlantTrucks(site: string): Promise<TrucksList> {
  const res = await fetchLocalTruckflow(`/live/trucks?${new URLSearchParams({ site, order: 'dwell' })}`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as Partial<TrucksList> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as TrucksList
}

export type PredecessorCandidate = {
  journeyKey: string
  journeyUid: string | null
  readPlate: string
  /** Viaje anterior con la misma patente (recorrido partido en dos por la nube). */
  samePlate?: boolean
  validFormat: boolean
  otherSite: boolean
  similarity: number
  circuit: string
  circuitProbability: number
  gapMin: number
  score: number
  reads: { at: string; node: string; nodeLabel: string; device: string }[]
}
export type PredecessorsResponse = {
  site: string
  plate: string
  firstAt: string | null
  firstNode: string | null
  firstNodeLabel: string | null
  startsAtEntry: boolean
  targetJourneyUid?: string | null
  windowMs: number
  candidates: PredecessorCandidate[]
  /** Viajes anteriores de la misma patente (otra vuelta): contexto, no se vinculan. */
  previousTrips?: { journeyKey: string; startAt: string; endAt: string; gapMin: number; reads: { at: string; node: string; nodeLabel: string; device: string }[] }[]
  /** Recorrido de la misma patente en la otra planta (Ricardone ↔ San Lorenzo). */
  otherPlantTrips?: { journeyKey: string; startAt: string; endAt: string; gapMin: number; reads: { at: string; node: string; nodeLabel: string; device: string }[] }[]
  linked: { journeyKey: string; plate: string; journeyUid: string | null }[]
}

/** Lecturas anteriores candidatas de un camión que arranca a mitad de circuito. */
export async function getTruckPredecessors(site: string, plate: string, hours = 6): Promise<PredecessorsResponse> {
  const res = await fetchLocalTruckflow(`/live/trucks/${encodeURIComponent(plate)}/predecessors?${new URLSearchParams({ site, hours: String(hours) })}`, { headers: { Accept: 'application/json' } })
  const body = (await res.json().catch(() => ({}))) as Partial<PredecessorsResponse> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as PredecessorsResponse
}

/** Vincula (o desvincula) un viaje mal leído al camión. */
export async function linkTruckJourney(site: string, plate: string, body: { journeyKey: string; journeyUid?: string | null; readPlate?: string; operator?: string | null; unlink?: boolean; dismiss?: boolean; sourceSite?: string }): Promise<void> {
  const res = await fetchLocalTruckflow(`/live/trucks/${encodeURIComponent(plate)}/link?site=${encodeURIComponent(site)}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, opId: newOpId() }),
  })
  const r = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(r.error ?? `HTTP ${res.status}`)
}

export async function getZoneTrucks(site: string, zoneId: string): Promise<TrucksList> {
  const q = new URLSearchParams({ site, zone: zoneId, order: 'dwell' })
  const res = await fetchLocalTruckflow(`/live/trucks?${q}`, { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as Partial<TrucksList> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as TrucksList
}

export async function correctTruckLocation(
  site: string,
  plate: string,
  correction: { action: 'remove'; reason?: string; operator?: string | null } | { action: 'move'; zoneId: string }
): Promise<void> {
  const res = await fetchLocalTruckflow(`/live/trucks/${encodeURIComponent(plate)}/location?site=${encodeURIComponent(site)}`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(correction),
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
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

/* ---------- Identificación de patentes en vivo ---------- */

export type IdentificationLevel = 'confirmado' | 'casi_seguro' | 'provisorio' | 'pendiente' | 'rechazado'

export interface IdentificationCandidate {
  plate: string
  journeyKey: string
  journeyUid: string | null
  similarity: number
  nodeProbability: number
  nextProbability: number
  expectedNext: string | null
  circuit: string | null
  circuitProbability: number
  lastNode: string | null
  lastNodeLabel?: string | null
  lastSeenAt?: string
  sameNode?: boolean
  /** Lectura buena del candidato para ver su foto (cámara + hora del feed). */
  photoDevice?: string
  photoAt?: string
  /** en_planta = visto antes en esta planta · leido_despues = su primera lectura buena llegó después · otra_planta */
  where?: 'en_planta' | 'leido_despues' | 'otra_planta'
  seenAfter?: boolean
  reads?: number
  /** Circuito que venía haciendo antes de esta lectura (el `circuit` ya incluye el nodo de la lectura). */
  circuitBefore?: string | null
  /** Últimas lecturas del candidato, de la más nueva a la más vieja. */
  recentReads?: { at: string; node: string; nodeLabel: string; device: string; otherSite?: boolean }[]
  score: number
}

export interface IdentificationItem {
  fragmentKey: string
  readPlate: string
  validFormat: boolean
  node: string
  nodeLabel: string
  sectorCode: string
  deviceCode: string
  at: string
  events: number
  level: IdentificationLevel
  reason: string
  assignedPlate: string | null
  assignedJourneyUid: string | null
  candidates: IdentificationCandidate[]
  decision: {
    action: string
    plate?: string
    reason?: string
    operator?: string | null
    attempts?: number
    sameAs?: string
    attrFlags?: string[]
    notes?: { text: string; operator: string | null; at: string }[]
    updatedAt?: string
  } | null
  /** Puesto que tiene el caso abierto ahora (reserva blanda, 2 min). */
  claim?: { by: string; label: string | null; at: string }
}

/** Reserva blanda: avisa a otros puestos que este caso está en revisión. */
export async function claimIdentification(site: string, fragmentKey: string, by: string, label: string | null, release = false): Promise<{ ok: boolean; claim: IdentificationItem['claim'] | null }> {
  const res = await fetchLocalTruckflow(`/live/identifications/${encodeURIComponent(fragmentKey)}/claim?site=${encodeURIComponent(site)}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ by, label, release }),
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; claim?: IdentificationItem['claim'] | null; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { ok: Boolean(body.ok), claim: body.claim ?? null }
}

export interface IdentificationsResponse {
  site: string
  at: string
  counts: Partial<Record<IdentificationLevel, number>>
  recentCounts: Record<string, number>
  items: IdentificationItem[]
}

export async function getIdentifications(site: string): Promise<IdentificationsResponse> {
  const res = await fetchLocalTruckflow(`/live/identifications?site=${encodeURIComponent(site)}`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as Partial<IdentificationsResponse> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as IdentificationsResponse
}

export type IdentificationDecision =
  | { action: 'confirm'; plate: string; journeyUid?: string | null; reason?: string; attrFlags?: string[] }
  | { action: 'note'; text: string }
  | { action: 'reject'; reason: string }
  | { action: 'defer'; reason: string }
  | { action: 'clear'; reason?: string }

export type DecisionOptions = {
  /** Versión de la decisión que vio el operador (updatedAt o null). Si cambió, el servidor responde conflicto. */
  expectedVersion?: string | null
  /** Lecturas gemelas que el operador eligió explícitamente para recibir la misma decisión. */
  applyTo?: string[]
  /** Quién decide (nombre del puesto/operador, sin autenticación). */
  operator?: string | null
  /** EV-40: fotos que el operador vio al decidir (el servidor guarda una copia). */
  photos?: Record<string, { device?: string; at?: string; plate?: string; sceneFile?: string | null; plateFile?: string | null }>
  /** Solo para la pantalla: tras guardar, quedarse en el caso en vez de pasar al siguiente. */
  stay?: boolean
}

export type DecisionResult = { siblings: string[]; version: string | null; replayed?: boolean; logged?: boolean }

/** Error de guardado: conflicto o rechazo (no se aplicó) o resultado desconocido (sin respuesta). */
export class DecisionError extends Error {
  constructor(message: string, readonly kind: 'conflict' | 'rejected' | 'unknown', readonly opId: string) {
    super(message)
  }
}

export function newOpId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Consulta si una operación enviada se aplicó (null = el servidor no la registró). */
export async function getDecisionOp(opId: string): Promise<DecisionResult | null> {
  const res = await fetchLocalTruckflow(`/live/identification-ops/${encodeURIComponent(opId)}`, { headers: { Accept: 'application/json' } })
  if (res.status === 404) return null
  const body = (await res.json()) as { siblings?: string[]; version?: string | null; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { siblings: body.siblings ?? [], version: body.version ?? null }
}

/**
 * Envía una decisión con opId propio: reintentar con el mismo opId no duplica la operación.
 * Sin respuesta, consulta el resultado por opId antes de afirmar que no se guardó.
 */
export async function decideIdentification(
  site: string,
  fragmentKey: string,
  decision: IdentificationDecision,
  options: DecisionOptions = {},
  opId: string = newOpId()
): Promise<DecisionResult> {
  let res: Response
  try {
    res = await fetchLocalTruckflow(`/live/identifications/${encodeURIComponent(fragmentKey)}?site=${encodeURIComponent(site)}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...decision, ...options, opId }),
    })
  } catch (e) {
    const known = await getDecisionOp(opId).catch(() => undefined)
    if (known) return { ...known, replayed: true }
    if (known === null) throw new DecisionError('No se guardó: el servidor no registró la decisión. Podés reintentar.', 'rejected', opId)
    throw new DecisionError(`Resultado por verificar: ${e instanceof Error ? e.message : String(e)}`, 'unknown', opId)
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; siblings?: string[]; version?: string | null; replayed?: boolean; logged?: boolean }
  if (res.status === 409) throw new DecisionError('El caso cambió desde que lo abriste (otro operador o el sistema). Revisá la evidencia actual.', 'conflict', opId)
  if (!res.ok) throw new DecisionError(body.error ?? `HTTP ${res.status}`, res.status >= 500 ? 'unknown' : 'rejected', opId)
  return { siblings: body.siblings ?? [], version: body.version ?? null, replayed: body.replayed, logged: body.logged }
}

export interface LiveCapture {
  at: string
  /** Hora del reloj de la cámara (sin corregir), para ubicarla en DSS. */
  cameraTime: string | null
  /** Timestamp crudo de la cámara (para buscar la foto exportada del DSS). */
  cameraAt: string | null
  deviceCode: string
  node: string | null
  nodeLabel: string
  readPlate: string
  validFormat: boolean
  /** leida = patente válida propia; el resto, nivel de identificación. */
  level: IdentificationLevel | 'leida'
  identifiedPlate: string | null
  fragmentKey: string | null
  candidates: IdentificationCandidate[]
}

export async function getRecentCaptures(site: string, limit = 60): Promise<{ site: string; at: string; captures: LiveCapture[] }> {
  const res = await fetchLocalTruckflow(`/live/captures?site=${encodeURIComponent(site)}&limit=${limit}`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json()) as { site: string; at: string; captures: LiveCapture[]; error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export interface CameraCapture {
  device: string
  plate: string
  confidence: number | null
  vehicleColor: string | null
  vehicleBrand: string | null
  vehicleCategory: string | null
  at: string
  plateFile: string | null
  sceneFile: string | null
  diffMs: number
}

export interface CameraCaptureLookup {
  capture: CameraCapture | null
  /** Hora real buscada (hora del feed − 240 s). */
  realAt: string
  error: string | null
}

/** Lectura registrada por el DSS en esa cámara y hora (foto, confianza, marca, color, tipo). */
export async function findCameraCapture(device: string, at: string, plate?: string): Promise<CameraCaptureLookup> {
  const q = new URLSearchParams({ device, at, ...(plate ? { plate } : {}) })
  const res = await fetchLocalTruckflow(`/camera-captures/find?${q}`, { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as { found?: boolean; capture?: CameraCapture; realAt?: string; error?: string | null }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { capture: body.found && body.capture ? body.capture : null, realAt: body.realAt ?? at, error: body.error ?? null }
}

export function cameraCaptureImageUrl(file: string): string {
  return `${localApiPrefix()}/camera-captures/image?file=${encodeURIComponent(file)}`
}

export interface AttributeComparison {
  kind: 'color' | 'marca' | 'tipo'
  read: string | null
  candidate: string | null
  result: 'coincide' | 'distinto' | 'sin_dato'
  lr: number
}

export interface VehicleAttrs {
  plate?: string
  confidence?: number | null
  vehicleColor: string | null
  vehicleBrand: string | null
  vehicleCategory: string | null
}

export interface CandidateEvidence extends IdentificationCandidate {
  /** Color, marca y tipo de una lectura buena del candidato, según el DSS. */
  attrs: VehicleAttrs | null
  comparisons: AttributeComparison[]
  plateLikelihood: number
  route: number
  attrLr: number
  probability: number
}

export interface IdentificationEvidence {
  fragmentKey: string
  read: { plate: string; validFormat: boolean; attrs: VehicleAttrs | null }
  candidates: CandidateEvidence[]
  /** Probabilidad de que sea otro camión (o que la lectura esté bien, si es una patente válida). */
  otherProbability: number
  dss: boolean
  /** Error al consultar el DSS (los atributos faltantes no son «sin dato»). */
  dssError?: string | null
}

/** Patente, color, marca, tipo y recorrido de cada candidato, con su probabilidad (atributos del DSS). */
export async function getIdentificationEvidence(site: string, fragmentKey: string): Promise<IdentificationEvidence> {
  const res = await fetchLocalTruckflow(
    `/live/identifications/${encodeURIComponent(fragmentKey)}/evidence?site=${encodeURIComponent(site)}`,
    { headers: { Accept: 'application/json' } }
  )
  const body = (await res.json()) as IdentificationEvidence & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}
