/**
 * Event stream: leer datos crudos (1 fila = 1 evento), agrupar por visita,
 * ordenar, construir path + relato + validación.
 */

import type { SiteId } from '../domain/sites'
import type { NormalizedEvent, ReconstructedVisit, ReconstructedVisitStatus, NormalizedCargoForm, VisitMetrics } from '../domain/events'
import { validateTrip } from '../validation/tripValidator'
import type { TripValidationStatus, TripValidationFlag } from '../validation'

/** Fila cruda de CSV (columnas fijas + opcionales). */
export interface RawEventRow {
  siteId: string
  visitId?: string
  plate?: string
  docNumber?: string
  cargoForm?: string
  product?: string
  occurredAt: string
  eventType: string
  locationKey?: string
  weightKg?: number
  sampleId?: string
  moisture?: number
  impurities?: number
  labResult?: string
  unloadPoint?: string
  unloadQty?: number
  notes?: string
}

export interface TripResult {
  visitKey: string
  visitId?: string
  plate?: string
  docNumber?: string
  /** true si la clave se armó con fallback (plate+docNumber+2h) por no tener visitId. */
  visitKeyFallbackUsed?: boolean
  timeline: NormalizedEvent[]
  path: string
  pathDisplay: string
  story: string
  status: TripValidationStatus
  flags: TripValidationFlag[]
  explanation: string
}

const TIME_BUCKET_MS = 12 * 60 * 60 * 1000
const FALLBACK_BUCKET_MS = 2 * 60 * 60 * 1000 // 2h para fallback sin visitId

function toNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function toStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** Mapea eventType crudo a interno (UNLOAD_* -> DISCHARGE_*, WAIT -> YARD_WAIT, GATE_CHECKOUT -> EXIT). */
function normalizeEventTypeFromRaw(eventType: string): NormalizedEvent['eventType'] {
  const u = eventType.toUpperCase().replace(/\s+/g, '_')
  if (u === 'UNLOAD_START') return 'DISCHARGE_START'
  if (u === 'UNLOAD_END') return 'DISCHARGE_END'
  if (u === 'GATE_CHECKOUT') return 'EXIT'
  if (u === 'SAMPLE_RESULT') return 'LAB_RESULT_READY'
  if (u === 'WAIT' || u === 'QUEUE_WAIT') return 'YARD_WAIT'
  if (['GATE_CHECKIN', 'SCALE_IN', 'SAMPLE_SOLID_TAKEN', 'SAMPLE_LIQUID_TAKEN', 'LAB_RESULT_READY',
    'DISCHARGE_ASSIGNED', 'DISCHARGE_START', 'DISCHARGE_END', 'SCALE_OUT', 'EXIT', 'YARD_WAIT', 'QUEUE_OUTSIDE'].includes(u)) {
    return u as NormalizedEvent['eventType']
  }
  return 'UNKNOWN'
}

/** Parsea una fila genérica a RawEventRow (columnas fijas). */
export function parseRawEventRow(row: Record<string, unknown>): RawEventRow | null {
  const occurredAt = toStr(row.occurredAt ?? row.timestamp)
  const eventType = toStr(row.eventType ?? row.event)
  if (!occurredAt || !eventType) return null
  return {
    siteId: toStr(row.siteId) || 'default',
    visitId: toStr(row.visitId) || undefined,
    plate: toStr(row.plate) || undefined,
    docNumber: toStr(row.docNumber) || undefined,
    cargoForm: toStr(row.cargoForm) || undefined,
    product: toStr(row.product) || undefined,
    occurredAt,
    eventType,
    locationKey: toStr(row.locationKey ?? row.location) || undefined,
    weightKg: toNum(row.weightKg ?? row.pesoBruto ?? row.pesoNeto),
    sampleId: toStr(row.sampleId) || undefined,
    moisture: toNum(row.moisture ?? row.humedad),
    impurities: toNum(row.impurities),
    labResult: toStr(row.labResult ?? row.resultado ?? row.status) || undefined,
    unloadPoint: toStr(row.unloadPoint ?? row.pit ?? row.bay) || undefined,
    unloadQty: toNum(row.unloadQty ?? row.unloadQty ?? row.measuredQty),
    notes: toStr(row.notes) || undefined,
  }
}

function getDateBucket(iso: string, bucketMs: number): string {
  const t = new Date(iso).getTime()
  const bucket = Math.floor(t / bucketMs) * bucketMs
  return new Date(bucket).toISOString().slice(0, 13)
}

export interface VisitKeyResult {
  key: string
  fallbackUsed: boolean
}

/**
 * Clave de visita: con visitId usa día+12h; sin visitId usa plate+docNumber+siteId+day+bloque 2h (evitar mezclar viajes).
 */
export function getVisitKey(row: RawEventRow): string {
  return getVisitKeyWithMeta(row).key
}

export function getVisitKeyWithMeta(row: RawEventRow): VisitKeyResult {
  const hasVisitId = Boolean(row.visitId?.trim())
  if (hasVisitId) {
    return {
      key: `${row.siteId}|${row.visitId!.trim()}|${getDateBucket(row.occurredAt, TIME_BUCKET_MS)}`,
      fallbackUsed: false,
    }
  }
  const plate = (row.plate ?? '').trim() || 'NONE'
  const doc = (row.docNumber ?? '').trim() || 'NONE'
  const dayAndBlock = getDateBucket(row.occurredAt, FALLBACK_BUCKET_MS)
  return {
    key: `${row.siteId}|${plate}|${doc}|${dayAndBlock}`,
    fallbackUsed: true,
  }
}

/** Convierte fila cruda a NormalizedEvent (para validación y buildVisits). */
export function rawEventToNormalizedEvent(row: RawEventRow, siteId: SiteId): NormalizedEvent {
  const eventType = normalizeEventTypeFromRaw(row.eventType)
  const raw: Record<string, unknown> = {
    ...row,
    status: row.labResult,
    resultado: row.labResult,
    labResult: row.labResult,
    weightKg: row.weightKg,
    moisture: row.moisture,
    impurities: row.impurities,
    unloadPoint: row.unloadPoint,
    unloadQty: row.unloadQty,
  }
  let cargoForm: NormalizedEvent['cargoForm'] = 'UNKNOWN'
  const cf = (row.cargoForm ?? '').toUpperCase()
  if (cf === 'SOLID' || cf === 'LIQUID') cargoForm = cf
  return {
    siteId: siteId as SiteId,
    visitId: row.visitId,
    plate: row.plate,
    docNumber: row.docNumber,
    cargoForm,
    product: row.product,
    eventType,
    locationKey: (row.locationKey as NormalizedEvent['locationKey']) ?? undefined,
    occurredAt: row.occurredAt,
    raw,
  }
}

/** Ordenar eventos: por occurredAt asc, luego por eventType. */
function sortEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.slice().sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime()
    const tb = new Date(b.occurredAt).getTime()
    if (ta !== tb) return ta - tb
    return (a.eventType || '').localeCompare(b.eventType || '')
  })
}

/** Construye el relato del camión: Ingreso HH:mm -> Pesaje entrada HH:mm (kg) -> Calada (sampleId) -> Lab (OK/NO/OBS) -> Inicio/Fin descarga -> Pesaje salida -> Egreso. */
export function buildStory(events: NormalizedEvent[]): string {
  if (events.length === 0) return 'Sin eventos.'
  const sorted = sortEvents(events)
  const parts: string[] = []
  let lastDischargeStartMs: number | undefined
  for (const ev of sorted) {
    const t = formatTime(ev.occurredAt)
    const loc = ev.locationKey ?? ev.raw?.locationKey ?? '—'
    const point = ev.raw?.unloadPoint ?? ev.raw?.pit ?? ev.raw?.bay ?? loc
    switch (ev.eventType) {
      case 'GATE_CHECKIN':
        parts.push(`Ingreso ${t}`)
        break
      case 'SCALE_IN':
        parts.push(`Pesaje entrada ${t} (${ev.raw?.weightKg ?? ev.raw?.pesoBruto ?? '—'} kg)`)
        break
      case 'SAMPLE_SOLID_TAKEN':
      case 'SAMPLE_LIQUID_TAKEN': {
        const sampleId = ev.raw?.sampleId ?? ev.raw?.muestra ?? '—'
        parts.push(`Calada ${t} (${sampleId})`)
        break
      }
      case 'LAB_RESULT_READY': {
        const res = String(ev.raw?.labResult ?? ev.raw?.resultado ?? ev.raw?.status ?? '—').toUpperCase()
        parts.push(`Lab ${t} (${res || '—'})`)
        break
      }
      case 'DISCHARGE_START':
        lastDischargeStartMs = new Date(ev.occurredAt).getTime()
        parts.push(`Inicio descarga ${t} (${point})`)
        break
      case 'DISCHARGE_END': {
        const qty = ev.raw?.unloadQty ?? ev.raw?.unloadQtyKg ?? ev.raw?.measuredQty ?? '—'
        let duration = ''
        if (lastDischargeStartMs != null) {
          const durMin = Math.round((new Date(ev.occurredAt).getTime() - lastDischargeStartMs) / 60000)
          duration = ` Duración ${durMin} min`
        }
        parts.push(`Fin descarga ${t} (${qty})${duration}`)
        lastDischargeStartMs = undefined
        break
      }
      case 'SCALE_OUT':
        parts.push(`Pesaje salida ${t} (${ev.raw?.pesoTara ?? ev.raw?.weightKg ?? '—'} kg)`)
        break
      case 'EXIT':
        parts.push(`Egreso ${t}`)
        break
      case 'YARD_WAIT': {
        const notes = ev.raw?.notes ?? ev.raw?.notas ?? ''
        parts.push(`Espera ${t}${notes ? ` (${notes})` : ''}`)
        break
      }
      default:
        parts.push(`${ev.eventType} ${t}`)
    }
  }
  return parts.join(' -> ')
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

/**
 * Construye un viaje desde filas crudas (ya agrupadas por visita).
 * Ordena por occurredAt + eventType, convierte a eventos, obtiene path/story/validación.
 */
export function buildTripFromEvents(rows: RawEventRow[], siteId: SiteId): TripResult {
  if (rows.length === 0) {
    return {
      visitKey: 'empty',
      timeline: [],
      path: '',
      pathDisplay: '',
      story: 'Sin eventos.',
      status: 'INVALID',
      flags: ['MISSING_EVENT'],
      explanation: 'Sin eventos.',
    }
  }
  const events = rows.map((r) => rawEventToNormalizedEvent(r, siteId))
  const sorted = sortEvents(events)
  const { key: visitKey, fallbackUsed } = getVisitKeyWithMeta(rows[0])
  const validation = validateTrip(sorted)
  const story = buildStory(sorted)
  const flags = [...validation.flags]
  if (fallbackUsed) flags.push('VISIT_KEY_FALLBACK_USED')
  return {
    visitKey,
    visitId: rows[0].visitId,
    plate: rows[0].plate,
    docNumber: rows[0].docNumber,
    visitKeyFallbackUsed: fallbackUsed,
    timeline: sorted,
    path: validation.path,
    pathDisplay: validation.pathDisplay,
    story,
    status: validation.status,
    flags,
    explanation: validation.explanation,
  }
}

/**
 * Agrupa filas crudas por visita y construye un TripResult por cada una.
 */
export function buildTripsFromEventStream(
  rows: RawEventRow[],
  siteId: SiteId
): TripResult[] {
  const byKey = new Map<string, RawEventRow[]>()
  for (const row of rows) {
    const key = getVisitKey(row)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(row)
  }
  const results: TripResult[] = []
  for (const group of byKey.values()) {
    results.push(buildTripFromEvents(group, siteId))
  }
  return results
}

/** Desde eventos ya normalizados (ej. visit.events): path + relato + validación. */
export function buildTripSummaryFromEvents(events: NormalizedEvent[]): Omit<TripResult, 'visitKey' | 'visitId' | 'plate' | 'docNumber' | 'timeline'> {
  const sorted = sortEvents(events)
  const validation = validateTrip(sorted)
  return {
    path: validation.path,
    pathDisplay: validation.pathDisplay,
    story: buildStory(sorted),
    status: validation.status,
    flags: validation.flags,
    explanation: validation.explanation,
  }
}

function tripToVisitMetrics(timeline: NormalizedEvent[]): VisitMetrics {
  const metrics: VisitMetrics = {}
  if (timeline.length < 2) return metrics
  const start = new Date(timeline[0].occurredAt).getTime()
  const end = new Date(timeline[timeline.length - 1].occurredAt).getTime()
  let cycleMin = Math.round((end - start) / 60000)
  const hasExit = timeline.some((e) => e.eventType === 'EXIT')
  if (hasExit && cycleMin < 1) cycleMin = 1
  metrics.cycleTimeMinutes = cycleMin
  return metrics
}

/** Convierte TripResult[] a ReconstructedVisit[] para la UI (timeline completo, pathDisplay, story, status). */
export function tripResultsToReconstructedVisits(trips: TripResult[], siteId: SiteId): ReconstructedVisit[] {
  return trips.map((t) => {
    const timeline = t.timeline
    const first = timeline[0]
    const last = timeline[timeline.length - 1]
    const visitId = t.visitId?.trim() || t.visitKey
    const status: ReconstructedVisitStatus = t.status === 'INVALID' ? 'REJECTED' : 'CLOSED'
    let cargoForm: NormalizedCargoForm = 'UNKNOWN'
    if (first?.cargoForm === 'SOLID' || first?.cargoForm === 'LIQUID') cargoForm = first.cargoForm
    return {
      visitId,
      siteId,
      plate: t.plate,
      docNumber: t.docNumber,
      cargoForm,
      product: first?.product,
      events: timeline,
      startAt: first?.occurredAt ?? '',
      endAt: last?.occurredAt,
      status,
      metrics: tripToVisitMetrics(timeline),
    }
  })
}
