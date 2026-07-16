/**
 * Partición por día de movimientos de contrato (función pura, etl-core/ingest).
 *
 * Espeja el modelo de Truckflow (`data/truckflow/<día>/`): un Excel que abarca
 * meses se normaliza una vez y se reparte por la fecha de cada fila, para poder
 * leer el histórico por rango como backup consultable. Ver docs/movimientos-backup.md.
 */
import { dedupeMovimientosByOperationId } from './dedupeMovimientos'

/** Campos mínimos que la partición necesita (subconjunto de ExternalMovimientoContratoNormalized). */
export type DatedMovimiento = {
  external_operation_id: string
  /** ISO local del ingreso (fuente primaria de fecha). */
  external_ingreso_at?: string
  /** Fecha del archivo de origen (fallback). */
  source_date?: string
}

const DAY_RE = /(\d{4}-\d{2}-\d{2})/

/** Día YYYY-MM-DD de un movimiento: external_ingreso_at → source_date → ''. */
export function dayIsoFromMovimiento(row: DatedMovimiento): string {
  const ing = String(row.external_ingreso_at ?? '').trim()
  const m1 = ing.match(DAY_RE)
  if (m1) return m1[1]!
  const src = String(row.source_date ?? '').trim()
  const m2 = src.match(DAY_RE)
  if (m2) return m2[1]!
  return ''
}

export type PartitionResult<T> = {
  /** día YYYY-MM-DD → filas de ese día. */
  byDay: Map<string, T[]>
  /** Filas sin fecha resoluble (no se pierden: van acá para revisar). */
  undated: T[]
}

/** Agrupa filas por día de ingreso. Preserva el orden dentro de cada día. */
export function partitionMovimientosByDay<T extends DatedMovimiento>(rows: T[]): PartitionResult<T> {
  const byDay = new Map<string, T[]>()
  const undated: T[] = []
  for (const row of rows) {
    const day = dayIsoFromMovimiento(row)
    if (!day) {
      undated.push(row)
      continue
    }
    const arr = byDay.get(day)
    if (arr) arr.push(row)
    else byDay.set(day, [row])
  }
  return { byDay, undated }
}

/**
 * Mergea filas nuevas con las ya guardadas de un día y deduplica por
 * external_operation_id (conserva la más completa). Idempotente: re-cargar el
 * mismo archivo no infla la partición.
 */
export function mergeMovimientosDedup<T extends { external_operation_id: string }>(
  existing: T[],
  incoming: T[]
): { merged: T[]; added: number; duplicatesRemoved: number } {
  const before = existing.length
  const { deduped, duplicatesRemoved } = dedupeMovimientosByOperationId([...existing, ...incoming])
  return {
    merged: deduped,
    added: deduped.length - before,
    duplicatesRemoved,
  }
}
