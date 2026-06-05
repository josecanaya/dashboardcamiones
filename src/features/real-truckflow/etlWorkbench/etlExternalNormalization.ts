/**
 * Normalización compartida para Movimientos por Contrato y merge Truckflow.
 */

import * as XLSX from 'xlsx'

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
  // San Lorenzo — volcables en puerto (ruta Ric→SL, circuito R7)
  'VOLCABLE PTO 1': 'VOLCABLE_PTO_1',
  'VOLCABLE PTO 2': 'VOLCABLE_PTO_2',
  'VOLCABLE PTO 3': 'VOLCABLE_PTO_3',
  'VOLCABLE PTO 4': 'VOLCABLE_PTO_4',
  'VOLCABLE PTO 5': 'VOLCABLE_PTO_5',
  // Ricardone — volcables en planta
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
  const whole = Math.floor(serial)
  const dc = XLSX.SSF.parse_date_code(whole)
  if (!dc?.y) return null
  return new Date(dc.y, dc.m - 1, dc.d)
}

function timeFromSerialFraction(frac: number): { h: number; m: number; s: number } | null {
  if (!Number.isFinite(frac) || frac <= 0 || frac >= 1) return null
  const totalSec = Math.round(frac * 86400)
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  }
}

/** Corrige mm/dd↔dd/mm cuando source_date indica el día operativo del archivo. */
export function tryMonthDaySwapCorrection(
  at: Date,
  sourceDateYmd: string
): { at: Date; corrected: boolean } | null {
  const parts = sourceDateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return null
  const sy = Number(parts[1])
  const sm = Number(parts[2])
  const sd = Number(parts[3])
  if (sm < 1 || sm > 12 || sd < 1 || sd > 31) return null

  const y = at.getFullYear()
  const m = at.getMonth() + 1
  const d = at.getDate()
  if (y !== sy) return null

  // Patrón clásico: 01/06/2026 leído como 2026-01-06 (mes=día fuente, día=mes fuente)
  if (sd <= 12 && sm <= 12 && m === sd && d === sm && (m !== sm || d !== sd)) {
    return {
      at: new Date(sy, sm - 1, sd, at.getHours(), at.getMinutes(), at.getSeconds()),
      corrected: true,
    }
  }
  return null
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
  if (typeof value === 'number') {
    if (value >= 1 && value < 60000) {
      return excelSerialToDate(value)
    }
    return null
  }
  const s = String(value).trim()
  if (!s) return null

  // dd/mm/yyyy[ HH:mm[:ss]] — Argentina (prioridad sobre ISO)
  const dmyTime = s.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (dmyTime) {
    let y = Number(dmyTime[3])
    if (y < 100) y += 2000
    const day = Number(dmyTime[1])
    const month = Number(dmyTime[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const d = new Date(y, month - 1, day)
    return Number.isNaN(d.getTime()) ? null : d
  }

  // ISO yyyy-mm-dd (opcionalmente con hora) — puede venir mal de XLSX raw:false
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoDate) {
    const y = Number(isoDate[1])
    const mo = Number(isoDate[2])
    const day = Number(isoDate[3])
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
    const d = new Date(y, mo - 1, day)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

function dateOnlyKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function daysFromSourceDate(at: Date, sourceDateYmd: string): number {
  const t = Date.parse(`${sourceDateYmd}T12:00:00`)
  if (!Number.isFinite(t)) return 999
  return Math.abs(at.getTime() - t) / 86400000
}

function isDayFirstDateString(raw: unknown): boolean {
  if (raw instanceof Date) return false
  const s = String(raw ?? '').trim()
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)
}

/** Valida/corrige contra source_date del archivo (yyyy-mm-dd). */
function applySourceDateGuard(
  at: Date,
  rawDateValue: unknown,
  sourceDate?: string | null
): { at: Date; warning?: string } {
  const src = String(sourceDate ?? '').trim()
  if (!src || !/^\d{4}-\d{2}-\d{2}$/.test(src)) return { at }

  const swapped = tryMonthDaySwapCorrection(at, src)
  if (swapped?.corrected) {
    return { at: swapped.at, warning: 'DATE_DAY_FIRST_CORRECTED' }
  }

  const currentKey = dateOnlyKey(at)
  if (currentKey === src) return { at }

  if (isDayFirstDateString(rawDateValue)) {
    const dayFirst = parseDatePart(rawDateValue)
    if (dayFirst) {
      const correctedAt = new Date(
        dayFirst.getFullYear(),
        dayFirst.getMonth(),
        dayFirst.getDate(),
        at.getHours(),
        at.getMinutes(),
        at.getSeconds()
      )
      if (dateOnlyKey(correctedAt) !== currentKey) {
        const distOld = daysFromSourceDate(at, src)
        const distNew = daysFromSourceDate(correctedAt, src)
        if (distNew < distOld && distNew <= 1) {
          return { at: correctedAt, warning: 'DATE_DAY_FIRST_CORRECTED' }
        }
      }
    }
  }

  const srcMonth = Number(src.slice(5, 7))
  const atMonth = at.getMonth() + 1
  if (srcMonth !== atMonth && daysFromSourceDate(at, src) > 20) {
    return { at, warning: 'DATE_SOURCE_MISMATCH' }
  }
  return { at }
}

export function combineDateTime(
  dateValue: unknown,
  timeValue: unknown,
  sourceDate?: string | null
): { at: Date | null; warning?: string } {
  let date = parseDatePart(dateValue)
  let time = parseTimePart(timeValue)

  if (
    typeof dateValue === 'number' &&
    dateValue >= 1 &&
    dateValue < 60000 &&
    !time &&
    date
  ) {
    const frac = dateValue - Math.floor(dateValue)
    time = timeFromSerialFraction(frac) ?? time
  }

  const dmyTime =
    typeof dateValue === 'string' ?
      dateValue.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    : null
  if (dmyTime && !time) {
    time = {
      h: Number(dmyTime[4]),
      m: Number(dmyTime[5]),
      s: dmyTime[6] ? Number(dmyTime[6]) : 0,
    }
  }

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
  let at = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.h,
    time.m,
    time.s
  )
  if (Number.isNaN(at.getTime())) return { at: null, warning: 'INVALID_DATETIME' }

  const guarded = applySourceDateGuard(at, dateValue, sourceDate)
  at = guarded.at
  return guarded.warning ? { at, warning: guarded.warning } : { at }
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
