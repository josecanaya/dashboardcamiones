import type { ColumnMapping } from './types'

/**
 * Nombres estándar del event stream (CSV/Excel).
 * Si el archivo tiene columnas con estos nombres, se preselecciona el mapeo.
 */
const STANDARD_HEADER_BY_ROLE: Record<keyof ColumnMapping, string> = {
  timestamp: 'occurredAt',
  event: 'eventType',
  location: 'locationKey',
  visitId: 'visitId',
  plate: 'plate',
  docNumber: 'docNumber',
  site: 'siteId',
  product: 'product',
  cargoForm: 'cargoForm',
}

/** Headers mínimos para considerar "event stream" (mapeo auto): fecha, evento, ubicación, visita. */
const EVENT_STREAM_REQUIRED = ['occurredAt', 'eventType', 'locationKey', 'visitId']

function normalizeHeader(h: string): string {
  return (h || '').trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '')
}

/**
 * True si el CSV tiene los headers estándar del event stream (occurredAt, eventType, locationKey, visitId).
 * Permite auto-configurar el mapeo sin paso manual.
 */
export function isStandardEventStreamHeaders(headers: string[]): boolean {
  const normalized = new Set(headers.map(normalizeHeader))
  return EVENT_STREAM_REQUIRED.every((req) => normalized.has(req.toLowerCase()))
}

/**
 * Dado los encabezados del archivo, devuelve un ColumnMapping por defecto
 * cuando las columnas coinciden con los nombres estándar (case-insensitive).
 * Usa el nombre real del encabezado en el archivo para el valor del mapping.
 */
export function getDefaultMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const lowerToOriginal = new Map<string, string>()
  for (const h of headers) {
    const key = (h || '').trim()
    if (key) lowerToOriginal.set(key.toLowerCase(), key)
  }

  for (const [role, standardName] of Object.entries(STANDARD_HEADER_BY_ROLE) as [keyof ColumnMapping, string][]) {
    const original = lowerToOriginal.get(standardName.toLowerCase())
    if (original) mapping[role] = original
  }

  return mapping
}
