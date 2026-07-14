/**
 * Deduplicación de movimientos de contrato por `external_operation_id`
 * (función pura, etl-core/ingest).
 *
 * Motivación (2026-07-14): al cargar varios Excel semanales/planta que se
 * solapan, la misma operación física entra varias veces. Los movimientos SIN
 * CTG (típicamente aceite/líquido) no tienen carta de porte que los colapse, y
 * hasta ahora ningún paso deduplicaba, así que el conteo se inflaba (p. ej. 930
 * filas de aceite para 266 operaciones reales).
 *
 * `external_operation_id` ya es una clave estable de negocio: se construye desde
 * CTG / comprobante / remito / (patente+ingreso+fecha+hora) SIN índice de fila ni
 * archivo de origen (salvo el hash de último recurso). Por eso la misma operación
 * en dos archivos recibe el mismo id y podemos colapsarla de forma segura.
 */

export type DedupeMovimientosResult<T> = {
  deduped: T[]
  /** Filas eliminadas por ser duplicado de otra con el mismo id. */
  duplicatesRemoved: number
  /** Cantidad de ids que tenían más de una fila. */
  collapsedGroups: number
}

/** Campos cuya presencia hace a una fila "más completa" (se conserva la más rica). */
const RICHNESS_FIELDS = [
  'external_ingreso_at',
  'external_calado_at',
  'external_salida_at',
  'external_sl_balanza_entrada_at',
  'external_sl_balanza_salida_at',
  'kgs_neto',
  'kgs_neto_neto',
  'comprob',
  'ctg',
  'cp_remito',
] as const

/** Cuenta campos de negocio no vacíos: a mayor puntaje, fila más completa. */
function defaultRichness(row: Record<string, unknown>): number {
  let score = 0
  for (const f of RICHNESS_FIELDS) {
    const v = row[f]
    if (v != null && String(v).trim() !== '') score++
  }
  return score
}

/**
 * Colapsa filas con el mismo `external_operation_id`, conservando la más completa
 * (por `richness`; ante empate, la primera vista). Preserva el orden de primera
 * aparición. Las filas con id vacío se pasan tal cual (no se deduplican).
 */
export function dedupeMovimientosByOperationId<T extends { external_operation_id: string }>(
  rows: T[],
  richness: (row: T) => number = (r) => defaultRichness(r as unknown as Record<string, unknown>)
): DedupeMovimientosResult<T> {
  const deduped: T[] = []
  const slot = new Map<string, number>() // id → índice en `deduped` (primera aparición)
  const meta = new Map<string, { score: number; count: number }>()

  for (const row of rows) {
    const id = String(row.external_operation_id ?? '').trim()
    if (!id) {
      // Sin id estable: no se puede deduplicar sin riesgo; se conserva en su lugar.
      deduped.push(row)
      continue
    }
    const score = richness(row)
    const idx = slot.get(id)
    if (idx === undefined) {
      slot.set(id, deduped.length)
      deduped.push(row)
      meta.set(id, { score, count: 1 })
    } else {
      const m = meta.get(id)!
      m.count++
      // Ante duplicado, conserva la fila más completa en la posición original.
      if (score > m.score) {
        deduped[idx] = row
        m.score = score
      }
    }
  }

  let duplicatesRemoved = 0
  let collapsedGroups = 0
  for (const { count } of meta.values()) {
    if (count > 1) {
      collapsedGroups++
      duplicatesRemoved += count - 1
    }
  }

  return { deduped, duplicatesRemoved, collapsedGroups }
}
