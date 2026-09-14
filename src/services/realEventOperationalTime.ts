/**
 * Instantánea operativa Truckflow para ETL, KPI y reconstrucción de tramos.
 *
 * Regla de producto: el instante operativo (reloj de PARED, el que ve la operación / el Excel)
 * se toma de **occurredAt** (o `recordedAt`), la hora física del sensor, corrigiendo su **skew
 * fijo de +206 min**. NO de `createdAt`.
 *
 * Por qué NO createdAt: `createdAt` es la hora de **subida a la nube**. En días normales viene
 * ~206 min después de `occurredAt` y ≈ el reloj de pared, así que "funcionaba". Pero cuando hay
 * un **backlog de subida** (p. ej. el corte del 01→03/09/2026), decenas de eventos ocurridos en
 * horas y días distintos se suben juntos y comparten la misma `createdAt` → se amontonan en la
 * hora del lote, inflando los paneles de actividad (picos imposibles) y corrompiendo los tramos
 * del KPI. `occurredAt` es inmune: su desfase con el reloj real es constante.
 *
 * Validado contra el Excel (hora de calado) el 03/09/2026: `occurredAt + 206 min` coincide al
 * minuto con `external_calado_at` tanto en eventos normales como en los del backlog, mientras
 * que `createdAt` caía horas tarde. El skew medido es durísimo (p10=p50=p90 ≈ 206.4 min).
 * Ver memoria [[occurredat-vs-createdat-offset]].
 */
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import { formatArgentinaIsoFromMs, parseTimestampMs } from '../etl-core/domain/timestamps'

/**
 * Skew constante del reloj del sensor Truckflow: `occurredAt`/`recordedAt` vienen ~206 min ANTES
 * del reloj de pared real. Se suma para alinear al reloj operativo/Excel.
 */
export const SENSOR_CLOCK_SKEW_MINUTES = 206

export function parseOperationalMillis(iso: string): number {
  return parseTimestampMs(String(iso ?? '').trim())
}

/** ISO del instante operativo (reloj de pared) del evento. Prioriza la hora física del sensor. */
export function getEventOperationalInstantIso(e: RealJourneyEventDto): string {
  // Hora física del sensor (occurredAt/recordedAt) + skew fijo → reloj de pared. A prueba de
  // backlogs de subida (a diferencia de createdAt).
  for (const iso of [e.occurredAt, e.recordedAt]) {
    const ms = parseOperationalMillis(String(iso ?? '').trim())
    if (Number.isFinite(ms)) return formatArgentinaIsoFromMs(ms + SENSOR_CLOCK_SKEW_MINUTES * 60_000)
  }
  // Sin hora física: caer a la de subida (createdAt/modifiedAt ≈ pared) como último recurso.
  for (const iso of [e.createdAt, e.modifiedAt]) {
    const ms = parseOperationalMillis(String(iso ?? '').trim())
    if (Number.isFinite(ms)) return formatArgentinaIsoFromMs(ms)
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
