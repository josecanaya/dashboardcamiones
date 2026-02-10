/**
 * Import en modo event-stream: CSV con occurredAt, eventType, locationKey.
 * Convierte filas del archivo a RawEventRow para buildTripsFromEventStream.
 * Preserva columnas opcionales (weightKg, sampleId, labResult, unloadPoint, unloadQty, notes, etc.).
 */

import type { SiteId } from '../domain/sites'
import type { ColumnMapping, RawRow } from './types'
import type { RawEventRow } from '../engine/eventStream'
import { parseRawEventRow } from '../engine/eventStream'

/** Normalizar nombre de columna para matchear opcionales. */
function normCol(h: string): string {
  return String(h ?? '').toLowerCase().trim().replace(/\s+/g, '').replace(/_/g, '')
}

/** Nombres normalizados de columna -> clave canónica para parseRawEventRow. */
const OPTIONAL_CANONICAL: Record<string, string> = {
  weightkg: 'weightKg',
  sampleid: 'sampleId',
  moisture: 'moisture',
  impurities: 'impurities',
  labresult: 'labResult',
  resultado: 'labResult',
  unloadpoint: 'unloadPoint',
  unloadqty: 'unloadQty',
  unloadqtykg: 'unloadQty',
  notes: 'notes',
  notas: 'notes',
}

/** True si el mapeo tiene Fecha/hora, Evento y Ubicación (modo event-stream). */
export function isEventStreamFile(mapping: ColumnMapping): boolean {
  return Boolean(mapping.timestamp && mapping.event && mapping.location)
}

/**
 * Convierte una fila del archivo (con headers del CSV) a un objeto con claves estándar
 * que parseRawEventRow espera (occurredAt, eventType, siteId, etc.) y opcionales (weightKg, labResult, ...).
 */
export function fileRowToCanonicalRow(
  fileRow: RawRow,
  mapping: ColumnMapping,
  defaultSiteId: SiteId
): Record<string, unknown> {
  const siteVal = mapping.site && fileRow[mapping.site] != null ? String(fileRow[mapping.site]).trim() : ''
  const result: Record<string, unknown> = {
    occurredAt: mapping.timestamp ? fileRow[mapping.timestamp] : undefined,
    eventType: mapping.event ? fileRow[mapping.event] : undefined,
    locationKey: mapping.location ? fileRow[mapping.location] : undefined,
    visitId: mapping.visitId ? fileRow[mapping.visitId] : undefined,
    plate: mapping.plate ? fileRow[mapping.plate] : undefined,
    docNumber: mapping.docNumber ? fileRow[mapping.docNumber] : undefined,
    siteId: siteVal || defaultSiteId,
    product: mapping.product ? fileRow[mapping.product] : undefined,
    cargoForm: mapping.cargoForm ? fileRow[mapping.cargoForm] : undefined,
  }
  for (const [colName, value] of Object.entries(fileRow)) {
    if (value == null) continue
    const key = normCol(colName)
    const canonical = OPTIONAL_CANONICAL[key]
    if (canonical) {
      if (canonical === 'weightKg' || canonical === 'moisture' || canonical === 'impurities' || canonical === 'unloadQty') {
        const n = Number(value)
        result[canonical] = isNaN(n) ? value : n
      } else {
        result[canonical] = typeof value === 'string' ? value.trim() : value
      }
    }
  }
  return result
}

/**
 * Convierte filas del archivo a RawEventRow[] usando el mapping.
 * Filtra filas que no tienen occurredAt+eventType válidos.
 */
export function buildRawEventRowsFromFile(
  rows: RawRow[],
  mapping: ColumnMapping,
  siteId: SiteId
): RawEventRow[] {
  const out: RawEventRow[] = []
  for (const row of rows) {
    const canonical = fileRowToCanonicalRow(row, mapping, siteId)
    const raw = parseRawEventRow(canonical)
    if (raw) out.push(raw)
  }
  return out
}
