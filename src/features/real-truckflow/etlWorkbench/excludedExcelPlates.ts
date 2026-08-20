/**
 * Patentes excluidas del Excel de movimientos (lista fija, exclusión dura).
 *
 * Estos camiones no deben contarse en ninguna métrica ni conteo del Excel:
 * se filtran en la normalización de movimientos, antes de cualquier merge o
 * clasificación de circuito.
 */
import { normalizePlate } from '../../../etl-core/domain/argentinaPlate'

/** Patentes crudas a excluir (se normalizan al mismo formato que el Excel). */
const RAW_EXCLUDED_EXCEL_PLATES = ['XXXXXX', 'PPPPPP', 'TTTTTT'] as const

export const EXCLUDED_EXCEL_PLATES: ReadonlySet<string> = new Set(
  RAW_EXCLUDED_EXCEL_PLATES.map((p) => normalizePlate(p)).filter(Boolean)
)

/** true si la patente está en la lista fija de exclusión del Excel. */
export function isExcludedExcelPlate(plate: string | null | undefined): boolean {
  const p = normalizePlate(String(plate ?? ''))
  return p !== '' && EXCLUDED_EXCEL_PLATES.has(p)
}
