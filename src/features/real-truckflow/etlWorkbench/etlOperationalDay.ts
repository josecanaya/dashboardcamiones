/**
 * Día operativo (arranque 22:00) y mapa journey → día operativo.
 *
 * Extraído de `KpiTiemposTab` para que el exportador del informe de logística recorte los
 * legs al **período exacto** con la misma regla que muestra el dashboard. Es necesario
 * porque `segment_timing_legs` NO tiene columna de fecha: al componer semanas
 * lunes→domingo para un informe jueves→miércoles, sin este mapa los legs de días fuera
 * del período entran igual (ver `etlComposeRuns.filterRowsByDay`, que devuelve la tabla
 * entera cuando no encuentra columna de día).
 */
import { parseCsvToRecords } from '../../../etl-core/csvParse'

/**
 * Día operativo (YYYY-MM-DD) de un ISO: un inicio ≥ 22:00 pertenece al día siguiente
 * (arranque de Q1 22–04). Devuelve '' si no parsea.
 */
export function operationalDayOfIso(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/)
  if (!m) return ''
  const hour = Number(m[4])
  if (hour >= 22) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
    return d.toISOString().slice(0, 10)
  }
  return `${m[1]}-${m[2]}-${m[3]}`
}

export type JourneyDayMapInput = {
  /** `circuit_timing_journeys` (journey_id + start_time). */
  circuitTimingJourneysCsv?: string
  /** `excel_operations_with_truckflow` (operaciones Excel-first sin cámara). */
  excelOperationsCsv?: string
}

/**
 * Mapa id → día operativo. Cubre las dos formas en que un leg se identifica:
 * 1) `journey_id` de Truckflow, con el día del `start_time`.
 * 2) Operaciones Excel-first (pellet/tolvas sin cámara, R3/R4…), que se identifican por
 *    `external_operation_id` o por los `matched_journey_uids`; el día sale del ingreso Excel.
 */
export function buildJourneyOperationalDayMap(input: JourneyDayMapInput): Map<string, string> {
  const map = new Map<string, string>()
  const ctjCsv = input.circuitTimingJourneysCsv
  if (ctjCsv?.trim()) {
    const { rows } = parseCsvToRecords(ctjCsv)
    for (const r of rows) {
      const id = String(r.journey_id ?? '').trim()
      if (!id) continue
      const day = operationalDayOfIso(String(r.start_time ?? ''))
      if (day) map.set(id, day)
    }
  }
  const exCsv = input.excelOperationsCsv
  if (exCsv?.trim()) {
    const { rows } = parseCsvToRecords(exCsv)
    for (const r of rows) {
      const day =
        operationalDayOfIso(String(r.external_ingreso_at ?? '')) ||
        String(r.source_date ?? '').trim()
      if (!day) continue
      const opId = String(r.external_operation_id ?? '').trim()
      if (opId && !map.has(opId)) map.set(opId, day)
      for (const uid of String(r.matched_journey_uids ?? '')
        .split(/[|,]/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (!map.has(uid)) map.set(uid, day)
      }
    }
  }
  return map
}

/** ¿El día (YYYY-MM-DD) cae dentro del rango inclusivo? */
export function isDayInRange(day: string, from: string, to: string): boolean {
  return Boolean(day) && day >= from && day <= to
}

/** Días del rango inclusivo, en orden. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = []
  if (!from || !to || from > to) return out
  const cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export type PeriodCoverage = {
  /** Días del período que tienen al menos un journey ubicado. */
  daysWithData: string[]
  /** Días del período sin ningún journey ubicado. */
  daysWithoutData: string[]
  /** Ids que no se pudieron ubicar en un día (no joinean contra ninguna fuente). */
  unmappedIds: number
}

/**
 * Cobertura del período: qué días del rango tienen datos y cuántos ids quedaron sin día.
 * Un día sin datos NO es lo mismo que un día sin actividad; el informe lo debe declarar.
 */
export function computePeriodCoverage(
  ids: Iterable<string>,
  dayById: Map<string, string>,
  from: string,
  to: string
): PeriodCoverage {
  const seen = new Set<string>()
  let unmapped = 0
  for (const id of ids) {
    const day = dayById.get(id)
    if (!day) {
      unmapped += 1
      continue
    }
    if (isDayInRange(day, from, to)) seen.add(day)
  }
  const all = enumerateDays(from, to)
  return {
    daysWithData: all.filter((d) => seen.has(d)),
    daysWithoutData: all.filter((d) => !seen.has(d)),
    unmappedIds: unmapped,
  }
}
