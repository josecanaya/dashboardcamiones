/**
 * Planilla TiemposEntrePasos: horarios de balanza SL (Balanza Entrada / Balanza Salida).
 */

import * as XLSX from 'xlsx'
import {
  combineDateTime,
  formatIsoLocal,
  inferSourceDateFromFileName,
  normalizePlate,
  normalizePlant,
} from './etlExternalNormalization'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import type { MovimientosContratoFileInput } from './etlExternalMovimientosContrato'

export const TIEMPOS_ENTRE_PASOS_OVERRIDE_FROM = '2026-06-17'
export const TIEMPOS_ENTRE_PASOS_OVERRIDE_TO = '2026-06-21'

export type TiemposEntrePasosMatchKind = '' | 'INGRESO_ID' | 'PLATE_WINDOW'

export type TiemposEntrePasosNormalized = {
  nro_ingreso: string
  plate_normalized: string
  planta_original: string
  planta_normalized: string
  operacion: string
  contrato: string
  balanza_entrada_at: string
  balanza_salida_at: string
  source_file: string
  source_date: string
  normalization_warnings: string
}

export type TiemposEntrePasosFileInput = MovimientosContratoFileInput

function normalizeHeaderKey(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const TEP_HEADER_MARKERS = ['nroingreso', 'balanzaentrada', 'patente']

export function sheetHeadersLookLikeTiemposEntrePasos(headers: string[]): boolean {
  const keys = new Set(headers.map((h) => normalizeHeaderKey(h)))
  return keys.has('nroingreso') && keys.has('balanzaentrada')
}

export function sheetHeadersLookLikeMovimientosContrato(headers: string[]): boolean {
  const keys = new Set(headers.map((h) => normalizeHeaderKey(h)))
  const hasPatente = keys.has('patente')
  const hasMov = keys.has('mov') || keys.has('movimiento')
  const hasCtgOrComprob = keys.has('ctg') || keys.has('comprob')
  return hasPatente && hasMov && hasCtgOrComprob
}

export type ContratoXlsxKind = 'movimientos_contrato' | 'tiempos_entre_pasos' | 'unknown'

export function classifyContratoXlsxFromHeaders(headers: string[]): ContratoXlsxKind {
  if (sheetHeadersLookLikeTiemposEntrePasos(headers)) return 'tiempos_entre_pasos'
  if (sheetHeadersLookLikeMovimientosContrato(headers)) return 'movimientos_contrato'
  return 'unknown'
}

export function peekContratoXlsxKind(arrayBuffer: ArrayBuffer): ContratoXlsxKind {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    const headerRow = rows.find(
      (r) => Array.isArray(r) && sheetHeadersLookLikeTiemposEntrePasos(r.map(String))
    ) as string[] | undefined
    if (headerRow) return 'tiempos_entre_pasos'
    const movHeader = rows.find(
      (r) => Array.isArray(r) && sheetHeadersLookLikeMovimientosContrato(r.map(String))
    )
    if (movHeader) return 'movimientos_contrato'
  }
  return 'unknown'
}

/** Solo acepta celdas fecha/hora; ignora enteros (minutos de estadía). */
export function parseTiemposEntrePasosDateTimeCell(
  value: unknown,
  sourceDate?: string
): { at: string; warning?: string } {
  if (value == null || value === '') return { at: '' }
  if (typeof value === 'number') return { at: '' }
  const s = String(value).trim()
  if (!s) return { at: '' }
  if (/^\d+$/.test(s)) return { at: '' }
  if (!/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(s)) return { at: '', warning: 'NOT_DATETIME' }
  const { at, warning } = combineDateTime(s, null, sourceDate)
  return { at: formatIsoLocal(at), warning }
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function findTepHeaderRow(sheet: XLSX.WorkSheet): number {
  const ref = sheet['!ref']
  if (!ref) return 0
  const range = XLSX.utils.decode_range(ref)
  const maxScan = Math.min(range.e.r, range.s.r + 15)
  for (let r = range.s.r; r <= maxScan; r++) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      row.push(String(cell?.v ?? ''))
    }
    if (sheetHeadersLookLikeTiemposEntrePasos(row)) return r
  }
  return 0
}

function headerFieldMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const h of headers) {
    const k = normalizeHeaderKey(h)
    if (k === 'nroingreso') map.set(h, 'nro_ingreso')
    else if (k === 'patente') map.set(h, 'patente')
    else if (k === 'planta') map.set(h, 'planta')
    else if (k === 'operacion') map.set(h, 'operacion')
    else if (k === 'contrato') map.set(h, 'contrato')
    else if (k === 'balanzaentrada') map.set(h, 'balanza_entrada')
    else if (k === 'balanzasalida') map.set(h, 'balanza_salida')
    else if (k === 'ingreso') map.set(h, 'ingreso')
  }
  return map
}

export function normalizeTiemposEntrePasosRow(
  row: Record<string, unknown>,
  sourceFile: string,
  sourceDate: string
): TiemposEntrePasosNormalized {
  const warnings: string[] = []
  const plant = normalizePlant(cellStr(row.planta))
  const plate = normalizePlate(cellStr(row.patente))
  const nroIngreso = cellStr(row.nro_ingreso ?? row.NroIngreso ?? row.ingreso)

  const be = parseTiemposEntrePasosDateTimeCell(row.balanza_entrada ?? row['Balanza Entrada'], sourceDate)
  const bs = parseTiemposEntrePasosDateTimeCell(row.balanza_salida ?? row['Balanza Salida'], sourceDate)
  if (be.warning) warnings.push(`entrada:${be.warning}`)
  if (bs.warning) warnings.push(`salida:${bs.warning}`)

  return {
    nro_ingreso: nroIngreso,
    plate_normalized: plate ?? '',
    planta_original: plant.planta_original,
    planta_normalized: plant.planta_normalized ?? '',
    operacion: cellStr(row.operacion),
    contrato: cellStr(row.contrato),
    balanza_entrada_at: be.at,
    balanza_salida_at: bs.at,
    source_file: sourceFile,
    source_date: sourceDate,
    normalization_warnings: warnings.join('|'),
  }
}

export function readTiemposEntrePasosXlsx(
  arrayBuffer: ArrayBuffer,
  sourceFile: string
): TiemposEntrePasosNormalized[] {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  const sourceDate = inferSourceDateFromFileName(sourceFile)
  const out: TiemposEntrePasosNormalized[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const headerRow = findTepHeaderRow(sheet)
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
      range: headerRow,
    })
    if (!rawRows.length) continue
    const headers = Object.keys(rawRows[0]!)
    const fieldMap = headerFieldMap(headers)

    for (const raw of rawRows) {
      const mapped: Record<string, unknown> = {}
      for (const [header, value] of Object.entries(raw)) {
        const field = fieldMap.get(header)
        if (field) mapped[field] = value
      }
      const norm = normalizeTiemposEntrePasosRow(mapped, sourceFile, sourceDate)
      if (!norm.nro_ingreso && !norm.plate_normalized) continue
      out.push(norm)
    }
  }
  return out
}

export function loadTiemposEntrePasosFiles(files: TiemposEntrePasosFileInput[]): {
  rows: TiemposEntrePasosNormalized[]
  warnings: string[]
} {
  const warnings: string[] = []
  const rows: TiemposEntrePasosNormalized[] = []
  for (const f of files) {
    try {
      const part = readTiemposEntrePasosXlsx(f.arrayBuffer, f.sourceFile)
      rows.push(...part)
      if (!part.length) warnings.push(`TEP_EMPTY:${f.sourceFile}`)
    } catch (e) {
      warnings.push(`TEP_READ_ERROR:${f.sourceFile}:${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { rows, warnings }
}

export function isInTiemposEntrePasosOverrideWindow(isoOrYmd: string): boolean {
  const key = String(isoOrYmd ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return key >= TIEMPOS_ENTRE_PASOS_OVERRIDE_FROM && key <= TIEMPOS_ENTRE_PASOS_OVERRIDE_TO
}

function parseMs(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NaN
}

export function buildTiemposEntrePasosIndex(rows: TiemposEntrePasosNormalized[]): {
  byIngresoId: Map<string, TiemposEntrePasosNormalized>
  byPlate: Map<string, TiemposEntrePasosNormalized[]>
} {
  const byIngresoId = new Map<string, TiemposEntrePasosNormalized>()
  const byPlate = new Map<string, TiemposEntrePasosNormalized[]>()
  for (const r of rows) {
    const id = String(r.nro_ingreso ?? '').trim()
    if (id) byIngresoId.set(id, r)
    const plate = String(r.plate_normalized ?? '').trim()
    if (plate) {
      const list = byPlate.get(plate) ?? []
      list.push(r)
      byPlate.set(plate, list)
    }
  }
  return { byIngresoId, byPlate }
}

const PLATE_WINDOW_MS = 24 * 3600_000

export function matchTiemposEntrePasosToMovimiento(
  mov: ExternalMovimientoContratoNormalized,
  index: ReturnType<typeof buildTiemposEntrePasosIndex>
): { row: TiemposEntrePasosNormalized | null; match: TiemposEntrePasosMatchKind } {
  const ingresoId = String(mov.ingreso_id ?? '').trim()
  if (ingresoId) {
    const hit = index.byIngresoId.get(ingresoId)
    if (hit) return { row: hit, match: 'INGRESO_ID' }
  }
  const plate = String(mov.plate_normalized ?? '').trim()
  const ingMs = parseMs(mov.external_ingreso_at)
  if (plate && Number.isFinite(ingMs)) {
    const candidates = index.byPlate.get(plate) ?? []
    let best: TiemposEntrePasosNormalized | null = null
    let bestDelta = Number.POSITIVE_INFINITY
    for (const c of candidates) {
      const ref = parseMs(c.balanza_entrada_at) || parseMs(`${c.source_date}T12:00:00`)
      if (!Number.isFinite(ref)) continue
      const delta = Math.abs(ref - ingMs)
      if (delta <= PLATE_WINDOW_MS && delta < bestDelta) {
        bestDelta = delta
        best = c
      }
    }
    if (best) return { row: best, match: 'PLATE_WINDOW' }
  }
  return { row: null, match: '' }
}

export type MovimientoWithTepFields = ExternalMovimientoContratoNormalized & {
  external_sl_balanza_entrada_at: string
  external_sl_balanza_salida_at: string
  tiempos_entre_pasos_source_file: string
  tiempos_entre_pasos_match: TiemposEntrePasosMatchKind
}

export function enrichMovimientosWithTiemposEntrePasos(
  normalized: ExternalMovimientoContratoNormalized[],
  tepRows: TiemposEntrePasosNormalized[]
): MovimientoWithTepFields[] {
  const index = buildTiemposEntrePasosIndex(tepRows)
  return normalized.map((mov) => {
    const { row, match } = matchTiemposEntrePasosToMovimiento(mov, index)
    return {
      ...mov,
      external_sl_balanza_entrada_at: row?.balanza_entrada_at ?? '',
      external_sl_balanza_salida_at: row?.balanza_salida_at ?? '',
      tiempos_entre_pasos_source_file: row?.source_file ?? '',
      tiempos_entre_pasos_match: match,
    }
  })
}

export function shouldApplyTiemposEntrePasosBalanzaOverride(mov: {
  external_sl_balanza_entrada_at?: string
  tiempos_entre_pasos_match?: string
  platform_normalized?: string
  planta_normalized?: string
  truckflow_circuit_codes?: string
}): boolean {
  const entrada = String(mov.external_sl_balanza_entrada_at ?? '').trim()
  if (!entrada || !mov.tiempos_entre_pasos_match) return false
  if (!isInTiemposEntrePasosOverrideWindow(entrada)) return false
  const circuits = String(mov.truckflow_circuit_codes ?? '')
  if (circuits.includes('R7')) return true
  const plat = String(mov.platform_normalized ?? '')
  const plant = String(mov.planta_normalized ?? '')
  if (plant === 'SAN_LORENZO' && /^VOLCABLE_PTO_/i.test(plat)) return true
  return false
}

export function splitContratoXlsxFileInputs(files: MovimientosContratoFileInput[]): {
  movimientos: MovimientosContratoFileInput[]
  tiemposEntrePasos: TiemposEntrePasosFileInput[]
  unknown: MovimientosContratoFileInput[]
} {
  const movimientos: MovimientosContratoFileInput[] = []
  const tiemposEntrePasos: TiemposEntrePasosFileInput[] = []
  const unknown: MovimientosContratoFileInput[] = []
  for (const f of files) {
    const kind = peekContratoXlsxKind(f.arrayBuffer)
    if (kind === 'tiempos_entre_pasos') tiemposEntrePasos.push(f)
    else if (kind === 'movimientos_contrato') movimientos.push(f)
    else unknown.push(f)
  }
  return { movimientos, tiemposEntrePasos, unknown }
}
