/**
 * Instantánea operativa Truckflow para ETL, KPI y reconstrucción de tramos.
 * Regla de producto: **createdAt** cuando existe y es parseable; si no,
 * modifiedAt → recordedAt → occurredAt.
 */
import type { RealJourneyEventDto } from './realJourneyEvents.types'

export function parseOperationalMillis(iso: string): number {
  const t = new Date(String(iso ?? '').trim()).getTime()
  return Number.isFinite(t) ? t : Number.NaN
}

/** ISO del instante operativo del evento (prioridad createdAt). */
export function getEventOperationalInstantIso(e: RealJourneyEventDto): string {
  const chain = [
    String(e.createdAt ?? '').trim(),
    String(e.modifiedAt ?? '').trim(),
    String(e.recordedAt ?? '').trim(),
    String(e.occurredAt ?? '').trim(),
  ]
  for (const iso of chain) {
    if (iso && Number.isFinite(parseOperationalMillis(iso))) return iso
  }
  return ''
}

export function getEventOperationalInstantMs(e: RealJourneyEventDto): number {
  const ms = parseOperationalMillis(getEventOperationalInstantIso(e))
  return Number.isFinite(ms) ? ms : Number.NaN
}

/** Alias para puntos lógicos / segmentos (campo `occurredAt` histórico en timelines). */
export function eventOperationalInstantForTimeline(e: RealJourneyEventDto): string {
  return getEventOperationalInstantIso(e) || String(e.occurredAt ?? '').trim()
}
