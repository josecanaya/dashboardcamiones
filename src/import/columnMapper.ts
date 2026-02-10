import type { SiteId } from '../domain/sites'
import type { NormalizedEvent } from '../domain/events'
import type { ColumnMapping, RawRow } from './types'
import { parseTimestamp, inferCargoForm } from '../normalize'
import { normalizeEventType, normalizeLocation, getCaladaResultFromEventType } from '../normalize/dictionaries'

const MAPPING_STORAGE_KEY = 'importColumnMapping'

/** Nombres de columna CSV (lowercase, sin espacios extra) -> clave canónica en raw para el validador. */
const OPTIONAL_RAW_KEYS: Record<string, string> = {
  labresult: 'labResult',
  resultado: 'labResult',
  result: 'labResult',
  status: 'labResult',
  weightkg: 'weightKg',
  pesobruto: 'weightKg',
  peso_bruto: 'weightKg',
  pesoneto: 'pesoNeto',
  peso_neto: 'pesoNeto',
  sampleid: 'sampleId',
  sample_id: 'sampleId',
  muestra: 'sampleId',
  moisture: 'moisture',
  humedad: 'moisture',
  impurities: 'impurities',
  impurezas: 'impurities',
  unloadpoint: 'unloadPoint',
  unload_point: 'unloadPoint',
  pit: 'unloadPoint',
  bay: 'unloadPoint',
  fosa: 'unloadPoint',
  unloadqtykg: 'unloadQtyKg',
  unloadqty: 'unloadQtyKg',
  measuredqty: 'unloadQtyKg',
  cantidad: 'unloadQtyKg',
  qty: 'unloadQtyKg',
  notes: 'notes',
  notas: 'notes',
  observaciones: 'notes',
}

function toOptionalKey(header: string): string {
  return String(header ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
}

/** Copia valores de la fila a raw con claves canónicas para que el validador encuentre labResult, weightKg, etc. */
function overlayRawExtras(row: RawRow, raw: Record<string, unknown>): void {
  for (const [colName, value] of Object.entries(row)) {
    if (value == null) continue
    const key = toOptionalKey(colName)
    const canonical = OPTIONAL_RAW_KEYS[key] ?? OPTIONAL_RAW_KEYS[colName.toLowerCase().replace(/\s+/g, '_')]
    if (canonical) raw[canonical] = value
  }
}

export interface StoredMapping {
  siteId: SiteId
  headerHash: string
  mapping: ColumnMapping
  fileName?: string
}

export function getStoredMapping(siteId: SiteId, headerHash: string): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY)
    if (!raw) return null
    const arr: StoredMapping[] = JSON.parse(raw)
    const found = arr.find((m) => m.siteId === siteId && m.headerHash === headerHash)
    return found?.mapping ?? null
  } catch {
    return null
  }
}

export function setStoredMapping(payload: StoredMapping): void {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY)
    const arr: StoredMapping[] = raw ? JSON.parse(raw) : []
    const idx = arr.findIndex(
      (m) => m.siteId === payload.siteId && m.headerHash === payload.headerHash
    )
    if (idx >= 0) arr[idx] = payload
    else arr.push(payload)
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(arr))
  } catch {
    // ignore
  }
}

/** Convierte filas crudas en eventos normalizados usando el mapping. */
export function mapRowsToNormalizedEvents(
  rows: RawRow[],
  siteId: SiteId,
  mapping: ColumnMapping
): NormalizedEvent[] {
  const events: NormalizedEvent[] = []
  const tsCol = mapping.timestamp
  const eventCol = mapping.event
  if (!tsCol || !eventCol) return events

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const ts = parseTimestamp(row[tsCol])
    if (!ts) continue
    const rawEvent = row[eventCol] != null ? String(row[eventCol]).trim() : ''
    if (!rawEvent) continue

    const vCol = mapping.visitId
    const pCol = mapping.plate
    const dCol = mapping.docNumber
    const prCol = mapping.product
    const cCol = mapping.cargoForm
    const lCol = mapping.location
    const visitId = vCol ? String(row[vCol] ?? '').trim() || undefined : undefined
    const plate = pCol ? String(row[pCol] ?? '').trim() || undefined : undefined
    const docNumber = dCol ? String(row[dCol] ?? '').trim() || undefined : undefined
    const product = prCol ? String(row[prCol] ?? '').trim() || undefined : undefined
    const rawCargo = cCol ? String(row[cCol] ?? '').trim() : undefined
    const locationCol = lCol ? String(row[lCol] ?? '').trim() : ''
    const rawLocation = locationCol || undefined

    const cargoForm = inferCargoForm(product || rawCargo, row)
    let eventType = normalizeEventType(rawEvent)
    const locationKey = rawLocation ? normalizeLocation(rawLocation) : undefined

    const rawCopy: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      rawCopy[k] = v
    }
    overlayRawExtras(row, rawCopy)

    const caladaResult = getCaladaResultFromEventType(rawEvent)
    if (caladaResult) {
      eventType = 'LAB_RESULT_READY'
      rawCopy.labResult = caladaResult
      rawCopy.resultado = caladaResult
    }

    events.push({
      siteId,
      visitId: visitId || undefined,
      plate: plate || undefined,
      docNumber: docNumber || undefined,
      cargoForm,
      product: product || undefined,
      eventType,
      locationKey: locationKey === 'UNKNOWN' ? undefined : locationKey,
      occurredAt: ts,
      raw: rawCopy,
    })
  }
  return events
}
