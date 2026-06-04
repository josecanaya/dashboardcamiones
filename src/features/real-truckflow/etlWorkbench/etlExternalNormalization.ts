/**
 * Normalización compartida para Movimientos por Contrato y merge Truckflow.
 */

export type PlantNormalized =
  | 'TERMINAL_EMBARQUE'
  | 'SAN_LORENZO'
  | 'AVELLANEDA'
  | 'RICARDONE'
  | string

const PLANT_MAP: Record<string, PlantNormalized> = {
  'TERMINAL DE EMBARQUE': 'TERMINAL_EMBARQUE',
  'TERMINAL_EMBARQUE': 'TERMINAL_EMBARQUE',
  'PLANTA SAN LORENZO': 'SAN_LORENZO',
  'SAN LORENZO': 'SAN_LORENZO',
  'PLANTA AVELLANEDA': 'AVELLANEDA',
  'AVELLANEDA': 'AVELLANEDA',
  RICARDONE: 'RICARDONE',
}

const PLATFORM_MAP: Record<string, string> = {
  'CELDA 16-4': 'CELDA_16',
  'CELDA 16': 'CELDA_16',
  'VOLCABLE PTO 1': 'VOLCABLE_1',
  'VOLCABLE PTO 2': 'VOLCABLE_2',
  'VOLCABLE PTO 3': 'VOLCABLE_3',
  'VOLCABLE PTO 4': 'VOLCABLE_4',
  'VOLCABLE PTO 5': 'VOLCABLE_5',
  'VOLCABLE 1': 'VOLCABLE_1',
  'VOLCABLE 2': 'VOLCABLE_2',
  'VOLCABLE 3': 'VOLCABLE_3',
  'VOLCABLE 4': 'VOLCABLE_4',
  'VOLCABLE 5': 'VOLCABLE_5',
  'KEPPLER 1 P': 'KEPPLER_1',
  'KEPLER 1 P': 'KEPPLER_1',
  'KEPPLER 1': 'KEPPLER_1',
  'KEPLER 1': 'KEPPLER_1',
  'KEPPLER 2': 'KEPPLER_2',
  'KEPLER 2': 'KEPPLER_2',
  'ACEITE OSL': 'ACEITE_OSL',
}

const MOVEMENT_MAP: Record<
  string,
  { movement_type: string; movement_type_detail: string }
> = {
  I: { movement_type: 'INGRESO', movement_type_detail: 'I' },
  E: { movement_type: 'EGRESO', movement_type_detail: 'E' },
  IA: { movement_type: 'INGRESO', movement_type_detail: 'IA' },
  EA: { movement_type: 'EGRESO', movement_type_detail: 'EA' },
  DI: { movement_type: 'DESPACHO', movement_type_detail: 'DI' },
  DE: { movement_type: 'DESPACHO', movement_type_detail: 'DE' },
}

export function normalizePlate(value: string | null | undefined): string | null {
  const s = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')
    .replace(/[^A-Z0-9]/g, '')
  return s.length ? s : null
}

export function normalizePlant(value: string | null | undefined): {
  planta_original: string
  planta_normalized: PlantNormalized | null
} {
  const original = String(value ?? '').trim()
  if (!original) return { planta_original: '', planta_normalized: null }
  const key = original.toUpperCase().replace(/\s+/g, ' ').trim()
  const mapped = PLANT_MAP[key] ?? PLANT_MAP[key.replace(/^PLANTA\s+/i, '')]
  if (mapped) return { planta_original: original, planta_normalized: mapped }
  const fallback = key.replace(/\s+/g, '_') as PlantNormalized
  return { planta_original: original, planta_normalized: fallback }
}

export function normalizeMovementType(mov: string | null | undefined): {
  mov_original: string
  movement_type: string
  movement_type_detail: string
  warning?: string
} {
  const original = String(mov ?? '').trim()
  const code = original.toUpperCase()
  const hit = MOVEMENT_MAP[code]
  if (hit) {
    return {
      mov_original: original,
      movement_type: hit.movement_type,
      movement_type_detail: hit.movement_type_detail,
    }
  }
  return {
    mov_original: original,
    movement_type: original || 'UNKNOWN',
    movement_type_detail: original || 'UNKNOWN',
    warning: original ? 'UNKNOWN_MOVEMENT_TYPE' : 'MISSING_MOVEMENT_TYPE',
  }
}

export function normalizeProduct(value: string | null | undefined): {
  producto_original: string
  product_normalized: string | null
} {
  const original = String(value ?? '').trim()
  if (!original) return { producto_original: '', product_normalized: null }
  const normalized = original
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\sÁÉÍÓÚÜÑ/-]/gi, '')
    .replace(/\s{2,}/g, ' ')
  return {
    producto_original: original,
    product_normalized: normalized || null,
  }
}

export function normalizePlatform(value: string | null | undefined): {
  plataforma_original: string
  platform_normalized: string | null
  warning?: string
} {
  const original = String(value ?? '').trim()
  if (!original) return { plataforma_original: '', platform_normalized: null }
  const key = original.toUpperCase().replace(/\s+/g, ' ').trim()
  const mapped = PLATFORM_MAP[key]
  if (mapped) {
    return { plataforma_original: original, platform_normalized: mapped }
  }
  const fallback = key.replace(/\s+/g, '_')
  return {
    plataforma_original: original,
    platform_normalized: fallback,
    warning: 'UNKNOWN_PLATFORM_MAPPING',
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const utcDays = Math.floor(serial - 25569)
  const ms = utcDays * 86400000
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseTimePart(value: unknown): { h: number; m: number; s: number } | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalSec = Math.round(value * 86400)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return { h, m, s }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { h: value.getHours(), m: value.getMinutes(), s: value.getSeconds() }
  }
  const s = String(value).trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    return {
      h: Number(m[1]),
      m: Number(m[2]),
      s: m[3] ? Number(m[3]) : 0,
    }
  }
  return null
}

function parseDatePart(value: unknown): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  if (typeof value === 'number' && value > 30000 && value < 60000) {
    return excelSerialToDate(value)
  }
  const s = String(value).trim()
  if (!s) return null
  const iso = Date.parse(s)
  if (Number.isFinite(iso)) {
    const d = new Date(iso)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    let y = Number(dmy[3])
    if (y < 100) y += 2000
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export function combineDateTime(
  dateValue: unknown,
  timeValue: unknown
): { at: Date | null; warning?: string } {
  const date = parseDatePart(dateValue)
  const time = parseTimePart(timeValue)
  if (!date) {
    if (dateValue != null && String(dateValue).trim()) {
      return { at: null, warning: 'UNPARSEABLE_DATE' }
    }
    return { at: null }
  }
  if (!time) {
    if (timeValue != null && String(timeValue).trim()) {
      return { at: null, warning: 'UNPARSEABLE_TIME' }
    }
    return { at: null, warning: 'MISSING_TIME' }
  }
  const at = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.h,
    time.m,
    time.s
  )
  return Number.isNaN(at.getTime()) ? { at: null, warning: 'INVALID_DATETIME' } : { at }
}

export function formatIsoLocal(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function stableExternalHash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  return `HASH_${Math.abs(h >>> 0).toString(16).toUpperCase()}`
}

export function inferSourceDateFromFileName(fileName: string): string {
  const m = fileName.match(/(\d{8})/)
  if (!m) return ''
  const d = m[1]!
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
