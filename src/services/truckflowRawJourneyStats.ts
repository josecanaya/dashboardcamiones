/**
 * Capa: soporte extract — conteos journeyUid en JSON crudo (disco/API).
 * No forma parte del pipeline de clasificación.
 */
import { occurredAtLocalDayKey } from './realJourneyQuality'

/** UID de journey tal como viene en JSON crudo de Truckflow. */
export function rawJourneyUidFromRecord(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const r = row as Record<string, unknown>
  return String(r.journeyUid ?? r.journeyUuid ?? r.journey_uuid ?? '').trim()
}

/** Cantidad de journeyUid distintos en un lote crudo (respuesta API / archivo en disco). */
export function countUniqueRawJourneyUids(records: unknown[]): number {
  const set = new Set<string>()
  for (const row of records) {
    const uid = rawJourneyUidFromRecord(row)
    if (uid) set.add(uid)
  }
  return set.size
}

export type RawJourneyCountByOccurredDay = { day: string; uniqueJourneyUids: number }

/**
 * Agrupa por día civil local de `occurredAt` (no por carpeta de extracción).
 * Útil para ver journeys “activos” ese día aunque el JSON venga de otra partición.
 */
export function countUniqueRawJourneyUidsByOccurredDay(records: unknown[]): RawJourneyCountByOccurredDay[] {
  const byDay = new Map<string, Set<string>>()
  for (const row of records) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const uid = rawJourneyUidFromRecord(row)
    const occurred = String(r.occurredAt ?? r.occurred_at ?? '').trim()
    if (!uid || !occurred) continue
    const day = occurredAtLocalDayKey(occurred)
    if (!day) continue
    let set = byDay.get(day)
    if (!set) {
      set = new Set()
      byDay.set(day, set)
    }
    set.add(uid)
  }
  return [...byDay.entries()]
    .map(([day, set]) => ({ day, uniqueJourneyUids: set.size }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

export type TruckflowApiJourneyDayStat = {
  day: string
  events: number
  alerts: number
  /** journeyUid distintos en el JSON de eventos de esa carpeta/día de extracción. */
  uniqueJourneyUids: number
  /** journeyUid distintos en alert-list del mismo día (si existe). */
  uniqueAlertJourneyUids: number
  eventFile: boolean
  alertFile: boolean
}

/** Si el servidor no mandó uniqueJourneyUids, estima por día civil de occurredAt. */
export function enrichApiJourneyStatsFromRawEvents(
  perDay: (Partial<TruckflowApiJourneyDayStat> & { day: string })[],
  rawEvents: unknown[]
): TruckflowApiJourneyDayStat[] {
  const uidsByOccurredDay = new Map<string, Set<string>>()
  for (const row of rawEvents) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const uid = rawJourneyUidFromRecord(row)
    const occurred = String(r.occurredAt ?? r.occurred_at ?? '').trim()
    if (!uid || !occurred) continue
    const day = occurredAtLocalDayKey(occurred)
    if (!day) continue
    let set = uidsByOccurredDay.get(day)
    if (!set) {
      set = new Set()
      uidsByOccurredDay.set(day, set)
    }
    set.add(uid)
  }

  return perDay.map((d) => {
    const norm = normalizeApiJourneyDayStat(d)
    if (norm.uniqueJourneyUids > 0 || !norm.eventFile) return norm
    const set = uidsByOccurredDay.get(d.day)
    if (!set?.size) return norm
    return { ...norm, uniqueJourneyUids: set.size }
  })
}

/** Normaliza filas del servidor (campos opcionales si el server local es viejo). */
export function normalizeApiJourneyDayStat(row: Partial<TruckflowApiJourneyDayStat> & { day: string }): TruckflowApiJourneyDayStat {
  const events = Number(row.events) || 0
  const alerts = Number(row.alerts) || 0
  const eventFile = Boolean(row.eventFile)
  const alertFile = Boolean(row.alertFile)
  return {
    day: row.day,
    events,
    alerts,
    eventFile,
    alertFile,
    uniqueJourneyUids: Number(row.uniqueJourneyUids) || 0,
    uniqueAlertJourneyUids: Number(row.uniqueAlertJourneyUids) || 0,
  }
}
