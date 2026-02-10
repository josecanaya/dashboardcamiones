/**
 * Normalización: parseo de timestamp e inferencia de cargoForm.
 */

import type { NormalizedCargoForm } from '../domain/events'
import { normalizeEventType, normalizeLocation } from './dictionaries'

export { normalizeEventType, normalizeLocation } from './dictionaries'
export { EVENT_SYNONYMS, LOCATION_SYNONYMS } from './dictionaries'

/** Intenta parsear fecha/hora a ISO. Acepta números (Excel serial o segundos epoch), ISO string, dd/mm/yyyy hh:mm, etc. */
export function parseTimestamp(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    // Números grandes = segundos (o ms) desde epoch; típico Excel serial para 2024 está en 45xxx
    if (value > 100000) {
      const ms = value < 1e12 ? value * 1000 : value
      const d = new Date(ms)
      return isNaN(d.getTime()) ? '' : d.toISOString()
    }
    const epoch = new Date(1899, 11, 30)
    const d = new Date(epoch.getTime() + value * 86400000)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const s = String(value).trim()
  if (!s) return ''
  // Ya ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  // dd/mm/yyyy hh:mm o dd-mm-yyyy
  const parts = s.split(/[\sT\-/.:]+/)
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const year = parseInt(parts[2], 10)
    const y = year < 100 ? 2000 + year : year
    let hour = 0
    let min = 0
    let sec = 0
    if (parts.length >= 4) hour = parseInt(parts[3], 10)
    if (parts.length >= 5) min = parseInt(parts[4], 10)
    if (parts.length >= 6) sec = parseInt(parts[5], 10)
    const d = new Date(y, month, day, hour, min, sec)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Inferir SOLID/LIQUID/UNKNOWN por producto o texto de la fila. */
export function inferCargoForm(product?: string, rawRow?: Record<string, unknown>): NormalizedCargoForm {
  const text = [product, rawRow?.product, rawRow?.producto, rawRow?.cargoForm, rawRow?.tipo]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .toLowerCase()
  if (!text) return 'UNKNOWN'
  if (/\b(aceite|oil|líquido|liquido|liquid)\b/.test(text)) return 'LIQUID'
  if (/\b(soja|girasol|grano|sólido|solido|solid)\b/.test(text)) return 'SOLID'
  return 'UNKNOWN'
}

export function normalizeEventTypeFromDict(raw: string): ReturnType<typeof normalizeEventType> {
  return normalizeEventType(raw)
}

export function normalizeLocationFromDict(raw: string): ReturnType<typeof normalizeLocation> {
  return normalizeLocation(raw)
}
