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
  /** ISO local de la salida (fuente primaria: día del Excel = horario de salida). */
  external_salida_at?: string
  /** ISO local del ingreso (fallback). */
  external_ingreso_at?: string
  /** Fecha del archivo de origen (fallback). */
  source_date?: string
}

const DAY_RE = /(\d{4}-\d{2}-\d{2})/

/**
 * Día YYYY-MM-DD de un movimiento para partición/backup.
 * Regla Excel: el día del archivo es el de **salida** (ingreso D / salida D+1 → día D+1).
 * Prioridad: `external_salida_at` → `source_date` → `external_ingreso_at`.
 */
export function dayIsoFromMovimiento(row: DatedMovimiento): string {
  const sal = String(row.external_salida_at ?? '').trim()
  const mSal = sal.match(DAY_RE)
  if (mSal) return mSal[1]!
  const src = String(row.source_date ?? '').trim()
  const mSrc = src.match(DAY_RE)
  if (mSrc) return mSrc[1]!
  const ing = String(row.external_ingreso_at ?? '').trim()
  const mIng = ing.match(DAY_RE)
  if (mIng) return mIng[1]!
  return ''
}

export type PartitionResult<T> = {
  /** día YYYY-MM-DD → filas de ese día. */
  byDay: Map<string, T[]>
  /** Filas sin fecha resoluble (no se pierden: van acá para revisar). */
  undated: T[]
}

/** Agrupa filas por día de salida (día operativo Excel). Preserva el orden dentro de cada día. */
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
