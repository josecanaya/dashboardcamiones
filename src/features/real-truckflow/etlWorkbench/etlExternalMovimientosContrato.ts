import * as XLSX from 'xlsx'
import { recordsToCsv } from './etlCsv'
import {
  combineDateTime,
  formatIsoLocal,
  inferSourceDateFromFileName,
  normalizeMovementType,
  normalizePlant,
  normalizePlatform,
  normalizePlate,
  normalizeProduct,
  stableExternalHash,
} from './etlExternalNormalization'

export { normalizePlate }

export type ExternalMovimientoContratoRaw = Record<string, unknown> & {
  source_file: string
  source_date: string
}

export type ExternalMovimientoContratoNormalized = {
  external_operation_id: string
  source_file: string
  source_date: string
  planta_original: string
  planta_normalized: string
  mov_original: string
  mov: string
  movement_type: string
  movement_type_detail: string
  patente_original: string
  plate_normalized: string
  contrato: string
  cliente_contrato: string
  ingreso_id: string
  comprob: string
  cp_remito: string
  ctg: string
  cupo: string
  entregado_por_a: string
  localidad_proc_dest: string
  fecha_ing_original: string
  hora_ing_original: string
  fecha_calado_original: string
  hora_calado_original: string
  fecha_sal_original: string
  hora_sal_original: string
  external_ingreso_at: string
  external_calado_at: string
  external_salida_at: string
  cod_prod: string
  producto_original: string
  product_normalized: string
  plataforma_original: string
  platform_normalized: string
  plataforma_manual: string
  kgs_bruto: string
  kgs_tara: string
  kgs_neto: string
  kgs_neto_neto: string
  humedad: string
  observaciones: string
  observacion_calidad: string
  normalization_warnings: string
}

export type MovimientosContratoFileInput = {
  sourceFile: string
  arrayBuffer: ArrayBuffer
}

const COLUMN_ALIASES: Record<string, string[]> = {
  planta: ['planta'],
  mov: ['mov', 'movimiento'],
  contrato: ['contrato'],
  cliente_contrato: ['clientecontrato', 'cliente contrato'],
  patente: ['patente'],
  tipo_transp: ['tipotransp', 'tipo transp', 'tipotransporte'],
  ingreso: ['ingreso', 'ingresoid'],
  comprob: ['comprob', 'comprobante'],
  cp_remito: ['cpremito', 'cp/remito', 'cp remito'],
  ctg: ['ctg'],
  cupo: ['cupo'],
  entregado_por_a: ['entregadopora', 'entregado por/entregado a', 'entregado por'],
  localidad_proc_dest: ['localidadprocdest', 'localidad proc/dest'],
  fecha_ing: ['fechaing', 'fecha ing'],
  hora_ing: ['horaing', 'hora ing'],
  fecha_calado: ['fechacalado', 'fecha calado'],
  hora_calado: ['horacalado', 'hora calado'],
  fecha_sal: ['fechasal', 'fecha sal', 'fechasal:'],
  hora_sal: ['horasal', 'hora sal'],
  kgs_bruto: ['kgsbruto', 'kgs.bruto', 'kgs bruto'],
  kgs_tara: ['kgstara', 'kgs.tara'],
  kgs_neto: ['kgsneto', 'kgs.neto'],
  kgs_neto_neto: ['kgsnetoneto', 'kgs.neto neto', 'kgs.neto neto'],
  observaciones: ['observaciones'],
  cod_prod: ['codprod', 'cod prod'],
  producto: ['producto'],
  plataforma: ['plataforma'],
  plataforma_manual: ['plataformamanual', 'plataforma manual'],
  humedad: ['humedad'],
  observacion_calidad: ['observacioncalidad', 'observacion calidad'],
}

function normalizeHeaderKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function buildHeaderMap(headers: string[]): Map<string, string> {
  const aliasToField = new Map<string, string>()
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const a of aliases) {
      aliasToField.set(normalizeHeaderKey(a), field)
    }
    aliasToField.set(normalizeHeaderKey(field), field)
  }
  const map = new Map<string, string>()
  for (const h of headers) {
    const field = aliasToField.get(normalizeHeaderKey(h))
    if (field) map.set(h, field)
  }
  return map
}

function remapRow(row: Record<string, unknown>, headerMap: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [header, value] of Object.entries(row)) {
    const field = headerMap.get(header)
    if (field) out[field] = value
    else out[header] = value
  }
  return out
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return formatIsoLocal(v)
  return String(v).trim()
}

function buildExternalOperationId(parts: {
  ctg: string
  comprob: string
  cp_remito: string
  source_file: string
  plate_normalized: string | null
  external_ingreso_at: string
  product_normalized: string | null
  platform_normalized: string | null
}): string {
  if (parts.ctg) return `CTG_${parts.ctg}`
  if (parts.comprob) return `COMPROB_${parts.comprob}`
  if (parts.cp_remito) return `REMITO_${parts.cp_remito}`
  const hashInput = [
    parts.source_file,
    parts.plate_normalized ?? '',
    parts.external_ingreso_at,
    parts.product_normalized ?? '',
    parts.platform_normalized ?? '',
  ].join('|')
  return stableExternalHash(hashInput)
}

export function normalizeMovimientoContrato(
  row: Record<string, unknown>,
  sourceFile: string,
  sourceDate: string
): ExternalMovimientoContratoNormalized {
  const warnings: string[] = []

  const plant = normalizePlant(cellStr(row.planta))
  const movPack = normalizeMovementType(cellStr(row.mov))
  if (movPack.warning) warnings.push(movPack.warning)

  const plateNorm = normalizePlate(cellStr(row.patente))
  const product = normalizeProduct(cellStr(row.producto))
  const platform = normalizePlatform(cellStr(row.plataforma))
  if (platform.warning) warnings.push(platform.warning)

  const ing = combineDateTime(row.fecha_ing, row.hora_ing, sourceDate)
  const cal = combineDateTime(row.fecha_calado, row.hora_calado, sourceDate)
  const sal = combineDateTime(row.fecha_sal, row.hora_sal, sourceDate)
  if (ing.warning) warnings.push(`ingreso:${ing.warning}`)
  if (cal.warning) warnings.push(`calado:${cal.warning}`)
  if (sal.warning) warnings.push(`salida:${sal.warning}`)

  const external_ingreso_at = formatIsoLocal(ing.at)
  const external_calado_at = formatIsoLocal(cal.at)
  const external_salida_at = formatIsoLocal(sal.at)

  const ctg = cellStr(row.ctg)
  const comprob = cellStr(row.comprob)
  const cp_remito = cellStr(row.cp_remito)

  const external_operation_id = buildExternalOperationId({
    ctg,
    comprob,
    cp_remito,
    source_file: sourceFile,
    plate_normalized: plateNorm,
    external_ingreso_at,
    product_normalized: product.product_normalized,
    platform_normalized: platform.platform_normalized,
  })

  return {
    external_operation_id,
    source_file: sourceFile,
    source_date: sourceDate,
    planta_original: plant.planta_original,
    planta_normalized: plant.planta_normalized ?? '',
    mov_original: movPack.mov_original,
    mov: movPack.movement_type_detail,
    movement_type: movPack.movement_type,
    movement_type_detail: movPack.movement_type_detail,
    patente_original: cellStr(row.patente),
    plate_normalized: plateNorm ?? '',
    contrato: cellStr(row.contrato),
    cliente_contrato: cellStr(row.cliente_contrato),
    ingreso_id: cellStr(row.ingreso),
    comprob,
    cp_remito,
    ctg,
    cupo: cellStr(row.cupo),
    entregado_por_a: cellStr(row.entregado_por_a),
    localidad_proc_dest: cellStr(row.localidad_proc_dest),
    fecha_ing_original: cellStr(row.fecha_ing),
    hora_ing_original: cellStr(row.hora_ing),
    fecha_calado_original: cellStr(row.fecha_calado),
    hora_calado_original: cellStr(row.hora_calado),
    fecha_sal_original: cellStr(row.fecha_sal),
    hora_sal_original: cellStr(row.hora_sal),
    external_ingreso_at,
    external_calado_at,
    external_salida_at,
    cod_prod: cellStr(row.cod_prod),
    producto_original: product.producto_original,
    product_normalized: product.product_normalized ?? '',
    plataforma_original: platform.plataforma_original,
    platform_normalized: platform.platform_normalized ?? '',
    plataforma_manual: cellStr(row.plataforma_manual),
    kgs_bruto: cellStr(row.kgs_bruto),
    kgs_tara: cellStr(row.kgs_tara),
    kgs_neto: cellStr(row.kgs_neto),
    kgs_neto_neto: cellStr(row.kgs_neto_neto),
    humedad: cellStr(row.humedad),
    observaciones: cellStr(row.observaciones),
    observacion_calidad: cellStr(row.observacion_calidad),
    normalization_warnings: warnings.join('|'),
  }
}

const HEADER_MARKERS = ['patente', 'producto', 'planta', 'mov', 'comprob', 'ctg', 'fechaing']

function normalizeHeaderKeyForDetect(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function rowLooksLikeHeader(row: unknown[]): boolean {
  let hits = 0
  for (const cell of row) {
    const k = normalizeHeaderKeyForDetect(String(cell ?? ''))
    if (!k) continue
    if (HEADER_MARKERS.some((m) => k.includes(m))) hits++
  }
  return hits >= 2
}

function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const ref = sheet['!ref']
  if (!ref) return 0
  const range = XLSX.utils.decode_range(ref)
  const maxScan = Math.min(range.e.r, range.s.r + 20)
  for (let r = range.s.r; r <= maxScan; r++) {
    const row: unknown[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      row.push(cell?.v ?? '')
    }
    if (rowLooksLikeHeader(row)) return r
  }
  return 0
}

function readSheetRows(sheet: XLSX.WorkSheet): {
  rows: Record<string, unknown>[]
  headerRow: number
  headers: string[]
} {
  const headerRow = findHeaderRowIndex(sheet)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
    range: headerRow,
  })
  const headers = rows.length ? Object.keys(rows[0]!) : []
  return { rows, headerRow, headers }
}

export type MovimientosContratoReadMeta = {
  sheetName: string
  headerRow: number
  headers: string[]
  rowCount: number
}

export function readMovimientosContratoXlsx(
  arrayBuffer: ArrayBuffer,
  sourceFile: string
): { rows: ExternalMovimientoContratoRaw[]; meta: MovimientosContratoReadMeta } {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
  const sourceDate = inferSourceDateFromFileName(sourceFile)

  let best: {
    rows: Record<string, unknown>[]
    meta: MovimientosContratoReadMeta
    score: number
  } | null = null

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const { rows, headerRow, headers } = readSheetRows(sheet)
    if (!rows.length) continue
    const headerMap = buildHeaderMap(headers)
    const hasPatente = [...headerMap.values()].includes('patente')
    const mappedCount = rows.filter((r) => {
      const m = remapRow(r, headerMap)
      return normalizePlate(cellStr(m.patente)) || cellStr(m.patente)
    }).length
    const candidate = {
      rows,
      meta: { sheetName, headerRow, headers, rowCount: rows.length },
      score: mappedCount + (hasPatente ? 1000 : 0) + rows.length,
    }
    if (!best || candidate.score > best.score) {
      best = candidate
    }
  }

  if (!best) {
    return {
      rows: [],
      meta: { sheetName: '', headerRow: 0, headers: [], rowCount: 0 },
    }
  }

  const headerMap = buildHeaderMap(best.meta.headers)
  const out = best.rows.map((r) => {
    const mapped = remapRow(r, headerMap)
    return {
      ...mapped,
      source_file: sourceFile,
      source_date: sourceDate,
    }
  })

  return { rows: out, meta: best.meta }
}

export function loadMovimientosContratoFiles(
  files: MovimientosContratoFileInput[]
): {
  raw: ExternalMovimientoContratoRaw[]
  warnings: string[]
  readMeta: MovimientosContratoReadMeta[]
} {
  const warnings: string[] = []
  const raw: ExternalMovimientoContratoRaw[] = []
  const readMeta: MovimientosContratoReadMeta[] = []
  for (const f of files) {
    try {
      const { rows: part, meta } = readMovimientosContratoXlsx(f.arrayBuffer, f.sourceFile)
      raw.push(...part)
      readMeta.push({ ...meta, rowCount: part.length })
      if (!part.length) {
        warnings.push(
          `EMPTY_FILE:${f.sourceFile}:hoja=${meta.sheetName || '?'};fila_cabecera=${meta.headerRow};columnas=${meta.headers.slice(0, 8).join('|') || 'ninguna'}`
        )
      } else if (!meta.headers.some((h) => normalizeHeaderKeyForDetect(h).includes('patente'))) {
        warnings.push(`NO_PATENTE_COLUMN:${f.sourceFile}:${meta.headers.join('|')}`)
      }
    } catch (e) {
      warnings.push(`READ_ERROR:${f.sourceFile}:${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { raw, warnings, readMeta }
}

export function normalizeMovimientosContratoBatch(
  raw: ExternalMovimientoContratoRaw[]
): ExternalMovimientoContratoNormalized[] {
  return raw.map((r) =>
    normalizeMovimientoContrato(r, String(r.source_file ?? ''), String(r.source_date ?? ''))
  )
}

export const EXTERNAL_MOVIMIENTOS_NORMALIZED_HEADERS: (keyof ExternalMovimientoContratoNormalized)[] = [
  'external_operation_id',
  'source_file',
  'source_date',
  'planta_original',
  'planta_normalized',
  'mov_original',
  'mov',
  'movement_type',
  'movement_type_detail',
  'patente_original',
  'plate_normalized',
  'contrato',
  'cliente_contrato',
  'ingreso_id',
  'comprob',
  'cp_remito',
  'ctg',
  'cupo',
  'entregado_por_a',
  'localidad_proc_dest',
  'fecha_ing_original',
  'hora_ing_original',
  'fecha_calado_original',
  'hora_calado_original',
  'fecha_sal_original',
  'hora_sal_original',
  'external_ingreso_at',
  'external_calado_at',
  'external_salida_at',
  'cod_prod',
  'producto_original',
  'product_normalized',
  'plataforma_original',
  'platform_normalized',
  'plataforma_manual',
  'kgs_bruto',
  'kgs_tara',
  'kgs_neto',
  'kgs_neto_neto',
  'humedad',
  'observaciones',
  'observacion_calidad',
  'normalization_warnings',
]

export function externalMovimientosNormalizedCsv(
  rows: ExternalMovimientoContratoNormalized[]
): string {
  return recordsToCsv(
    [...EXTERNAL_MOVIMIENTOS_NORMALIZED_HEADERS],
    rows as unknown as Record<string, unknown>[]
  )
}

export type MovimientosContratoLoadStats = {
  filesRead: number
  rawCount: number
  normalizedCount: number
  withPlate: number
  withProduct: number
  withPlatform: number
  withIngresoTimestamp: number
  withSalidaTimestamp: number
  warnings: string[]
}

export function summarizeMovimientosContratoLoad(
  files: MovimientosContratoFileInput[],
  normalized: ExternalMovimientoContratoNormalized[],
  loadWarnings: string[]
): MovimientosContratoLoadStats {
  return {
    filesRead: files.length,
    rawCount: normalized.length,
    normalizedCount: normalized.length,
    withPlate: normalized.filter((r) => r.plate_normalized).length,
    withProduct: normalized.filter((r) => r.product_normalized).length,
    withPlatform: normalized.filter((r) => r.platform_normalized).length,
    withIngresoTimestamp: normalized.filter((r) => r.external_ingreso_at).length,
    withSalidaTimestamp: normalized.filter((r) => r.external_salida_at).length,
    warnings: loadWarnings,
  }
}
