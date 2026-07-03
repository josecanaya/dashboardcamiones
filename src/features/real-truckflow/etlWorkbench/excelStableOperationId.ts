import { stableExternalHash } from './etlExternalNormalization'

/** CTG utilizable como identificador (excluye 0, vacío, guiones). */
export function isValidExcelCtg(ctg: string | null | undefined): boolean {
  const s = String(ctg ?? '').trim()
  if (!s || s === '-' || s === '—') return false
  const lower = s.toLowerCase()
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return false
  if (/^[0]+$/.test(s.replace(/\s/g, ''))) return false
  if (/^0+([.,]0+)?$/.test(s)) return false
  return true
}

export function isPlaceholderExcelOperationId(opId: string | null | undefined): boolean {
  const id = String(opId ?? '').trim()
  if (!id) return true
  if (/^CTG_0+$/i.test(id)) return true
  return false
}

function sanitizeIdToken(raw: string, maxLen = 32): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, maxLen)
}

function dayFromIso(iso: string): string {
  const s = String(iso ?? '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? ''
}

function timeFromIso(iso: string): string {
  const s = String(iso ?? '').trim()
  const m = s.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}${m[2]}` : ''
}

export type StableExcelOperationIdInput = {
  external_operation_id?: string
  ctg?: string
  ingreso_id?: string
  comprob?: string
  cp_remito?: string
  plate_normalized?: string
  source_date?: string
  external_ingreso_at?: string
  fecha_ing_original?: string
  hora_ing_original?: string
  platform_normalized?: string
  resolved_platform?: string
  plataforma_original?: string
  product_normalized?: string
  resolved_product?: string
  source_file?: string
  row_index?: number
}

/**
 * ID estable por operación Excel (comité `excel:…`).
 * Evita colapsar filas distintas en `CTG_0` cuando el CTG no es válido.
 */
export function buildStableExcelOperationId(input: StableExcelOperationIdInput): string {
  const ctg = String(input.ctg ?? '').trim()
  if (isValidExcelCtg(ctg)) return `CTG_${ctg}`

  const existing = String(input.external_operation_id ?? '').trim()
  if (existing && !isPlaceholderExcelOperationId(existing)) return existing

  const comprob = String(input.comprob ?? '').trim()
  if (comprob) return `COMPROB_${sanitizeIdToken(comprob)}`

  const remito = String(input.cp_remito ?? '').trim()
  if (remito) return `REMITO_${sanitizeIdToken(remito)}`

  const platform =
    sanitizeIdToken(
      input.platform_normalized || input.resolved_platform || input.plataforma_original || 'ACEITE',
      24
    ) || 'ACEITE'
  const ingreso = sanitizeIdToken(input.ingreso_id ?? '')
  const comprobTok = sanitizeIdToken(input.comprob ?? '')
  const remitoTok = sanitizeIdToken(input.cp_remito ?? '')
  const plate = sanitizeIdToken(input.plate_normalized ?? '')
  const fecha = sanitizeIdToken(
    input.fecha_ing_original ?? input.source_date ?? dayFromIso(input.external_ingreso_at ?? '')
  )
  const hora = sanitizeIdToken(input.hora_ing_original ?? timeFromIso(input.external_ingreso_at ?? ''))
  const rowIdx = input.row_index != null && input.row_index >= 0 ? String(input.row_index) : ''

  const compound = [platform, ingreso, comprobTok, remitoTok, plate, fecha, hora, rowIdx].filter(Boolean)
  if (compound.length >= 2) {
    return `${platform}:${compound.slice(1).join(':')}`.slice(0, 160)
  }

  const hashInput = [
    input.source_file ?? '',
    plate,
    input.external_ingreso_at ?? '',
    input.product_normalized ?? input.resolved_product ?? '',
    platform,
    rowIdx,
  ].join('|')
  return stableExternalHash(hashInput)
}

/** Lee fila CSV de excel_operations_with_truckflow → ID para journey `excel:…`. */
export function resolveCommitteeExcelOperationId(
  r: Record<string, string>,
  rowIndex?: number
): string {
  return buildStableExcelOperationId({
    external_operation_id: r.external_operation_id,
    ctg: r.ctg,
    ingreso_id: r.ingreso_id,
    comprob: r.comprob,
    cp_remito: r.cp_remito,
    plate_normalized: r.plate_normalized,
    source_date: r.source_date,
    external_ingreso_at: r.external_ingreso_at,
    platform_normalized: r.platform_normalized,
    resolved_platform: r.resolved_platform,
    plataforma_original: r.plataforma_original,
    product_normalized: r.product_normalized,
    resolved_product: r.resolved_product,
    source_file: r.source_file,
    row_index: rowIndex,
  })
}
