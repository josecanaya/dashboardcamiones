/**
 * Layout estable de corridas ETL: una carpeta por ventana de datos, pisada al reprocesar.
 * runId canónico = `<from>_<to>` (ej. 2026-07-13_2026-07-20) bajo runs/windows/.
 */

/** Tablas siempre materializadas en tables/ (UI + agente). */
export const ETL_RUN_CORE_TABLES = [
  'transform_summary',
  'final_circuits',
  'debug_matrix_classification',
  'excel_operations_with_truckflow',
  'external_movimientos_contrato_normalized',
  'merged_truckflow_movimientos',
  'clean_journeys_for_analysis',
  'plate_registry_excluded',
  'segment_timing_kpi',
  'segment_timing_legs',
  'circuit_timing_summary',
  'circuit_timing_journeys',
  'segment_scatter_by_day',
  'segment_scatter_analysis',
  'sector_occupancy_30min',
  'sector_occupancy_events',
  'liquid_movements_summary',
  'liquid_movements_riccalliq_cohort',
  'liquid_movements_sl1_sl5_s10',
  'liquid_movements_aceite_truckflow_excel',
  'transile_externo_operaciones',
  'transile_externo_summary',
  'transile_externo_ciclos',
  'transile_externo_reclasificacion',
  'transile_interno_volcable_sessions',
  'transile_interno_volcable_summary',
  'movimientos_reconciliation',
  'movimientos_without_truckflow_match',
  'truckflow_without_movimiento_match',
] as const

export type EtlRunCoreTable = (typeof ETL_RUN_CORE_TABLES)[number]

const CORE_SET = new Set<string>(ETL_RUN_CORE_TABLES)

export function isEtlRunCoreTable(name: string): boolean {
  return CORE_SET.has(name)
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** runId estable de ventana o legacy timestamp. */
const STABLE_WINDOW_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/
const LEGACY_TIMESTAMP_RE = /^\d{8}-\d{6}-[0-9a-f]{6}$/i

export function isStableWindowRunId(runId: string): boolean {
  return STABLE_WINDOW_RE.test(String(runId ?? '').trim())
}

export function isLegacyTimestampRunId(runId: string): boolean {
  return LEGACY_TIMESTAMP_RE.test(String(runId ?? '').trim())
}

/** Id estable de ventana: 2026-07-13_2026-07-20 */
export function stableWindowRunId(fromDay: string, toDay: string): string {
  const from = String(fromDay ?? '').trim()
  const to = String(toDay ?? '').trim()
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    throw new Error(`stableWindowRunId: from/to inválidos (${from}, ${to})`)
  }
  return `${from}_${to}`
}

export function windowKeyFromDays(fromDay: string, toDay: string): string {
  return `${String(fromDay).trim()}..${String(toDay).trim()}`
}

export function daysFromStableWindowRunId(runId: string): { fromDay: string; toDay: string } | null {
  const id = String(runId ?? '').trim()
  if (!STABLE_WINDOW_RE.test(id)) return null
  const [fromDay, toDay] = id.split('_')
  return { fromDay: fromDay!, toDay: toDay! }
}

/** Ruta relativa canónica bajo runs/: windows/<from>_<to> */
export function relativeWindowRunDir(runId: string): string {
  return `windows/${String(runId).trim()}`
}
