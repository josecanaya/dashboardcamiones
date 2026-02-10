import type { ParsedFile, RawRow, ColumnMapping } from './types'
import { parseTimestamp } from '../normalize'

/** Encabezados que NO son fecha/hora: si Fecha/hora se asigna a uno de estos, mostrar warning y bloquear. */
const NON_DATE_LIKE_HEADERS = new Set(
  [
    'siteId', 'visitId', 'eventType', 'plate', 'docNumber', 'product', 'cargoForm',
    'locationKey', 'location', 'event', 'planta', 'patente', 'documento', 'producto',
    'evento', 'ubicacion', 'sector', 'id visita', 'nro documento', 'tipo carga',
  ].map((s) => s.toLowerCase())
)

function isDateLikeColumn(headerName: string): boolean {
  const lower = (headerName || '').trim().toLowerCase()
  if (!lower) return false
  return !NON_DATE_LIKE_HEADERS.has(lower)
}

export interface PreviewRow {
  occurredAt: string
  eventType: string
  visitId: string
  plate: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  previewRows: PreviewRow[]
}

/**
 * Valida el mapeo antes de procesar y genera preview de 5 filas.
 * - occurredAt debe parsear como fecha
 * - eventType debe tener valores no vacíos
 * - Si Fecha/hora está asignada a una columna no-fecha (p.ej. siteId, visitId), error.
 */
export function validateMapping(parsed: ParsedFile, mapping: ColumnMapping): ValidationResult {
  const errors: string[] = []
  const previewRows: PreviewRow[] = []
  const rows = parsed.rows ?? []

  const tsCol = mapping.timestamp
  const eventCol = mapping.event
  const visitCol = mapping.visitId

  if (!tsCol || !eventCol) {
    errors.push('Completá al menos Fecha/hora y Evento/Estado en el mapeo.')
    return { valid: false, errors, previewRows }
  }

  if (!isDateLikeColumn(tsCol)) {
    errors.push(
      'Fecha/hora está asignada a una columna que no parece ser fecha (ej: siteId, visitId, eventType). ' +
      'Elegí la columna que contiene fecha y hora del evento.'
    )
  }

  const plateCol = mapping.plate
  const sampleSize = Math.min(10, rows.length)
  let dateOk = false
  let eventOk = false

  for (let i = 0; i < sampleSize; i++) {
    const row: RawRow = rows[i] ?? {}
    const tsRaw = row[tsCol]
    const parsedTs = parseTimestamp(tsRaw)
    const eventVal = eventCol ? String(row[eventCol] ?? '').trim() : ''
    const visitVal = visitCol ? String(row[visitCol] ?? '').trim() : ''
    const plateVal = plateCol ? String(row[plateCol] ?? '').trim() : ''

    if (parsedTs) dateOk = true
    if (eventVal) eventOk = true

    previewRows.push({
      occurredAt: parsedTs || (tsRaw != null ? String(tsRaw) : '—'),
      eventType: eventVal || '—',
      visitId: visitVal || '—',
      plate: plateVal || '—',
    })
  }

  if (sampleSize > 0 && !dateOk) {
    errors.push('La columna de Fecha/hora no se pudo interpretar como fecha en las primeras filas. Revisá el mapeo o el formato (ej: ISO, dd/mm/yyyy hh:mm).')
  }
  if (sampleSize > 0 && !eventOk) {
    errors.push('La columna de Evento/Estado tiene valores vacíos en las primeras filas.')
  }

  return {
    valid: errors.length === 0,
    errors,
    previewRows,
  }
}
