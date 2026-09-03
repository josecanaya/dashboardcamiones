/**
 * Espejo JS de src/etl-core/runs/etlRunsLayout.ts para el server .mjs.
 * Mantener allowlist y reglas de path alineadas.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

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
  'calada_camera_events',
  'calada_sl_camera_events',
  'calada_ricardone_liquid_events',
  'san_lorenzo_volcable_events',
  'ricardone_volcable_events',
  'ricardone_silo_events',
  'ricardone_celda16_events',
  'san_lorenzo_aceite_pto_events',
  'san_lorenzo_aceite_osl_events',
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
]

const STABLE_WINDOW_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/
const LEGACY_TIMESTAMP_RE = /^\d{8}-\d{6}-[0-9a-f]{6}$/i
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isStableWindowRunId(runId) {
  return STABLE_WINDOW_RE.test(String(runId ?? '').trim())
}

export function isLegacyTimestampRunId(runId) {
  return LEGACY_TIMESTAMP_RE.test(String(runId ?? '').trim())
}

export function stableWindowRunId(fromDay, toDay) {
  const from = String(fromDay ?? '').trim()
  const to = String(toDay ?? '').trim()
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    throw new Error(`stableWindowRunId: from/to inválidos (${from}, ${to})`)
  }
  return `${from}_${to}`
}

/**
 * Resuelve el directorio absoluto de una corrida.
 * Preferencia: runs/windows/<id>/ → runs/<id>/ (legacy timestamp).
 */
export function resolveRunDir(runsRoot, runId) {
  const id = String(runId ?? '').trim()
  if (!id || id.startsWith('_')) return null
  const stable = path.join(runsRoot, 'windows', id)
  if (existsSync(stable)) return stable
  const legacy = path.join(runsRoot, id)
  if (existsSync(legacy)) return legacy
  // Corrida aún no escrita pero id estable: devolver path canónico.
  if (STABLE_WINDOW_RE.test(id)) return stable
  if (LEGACY_TIMESTAMP_RE.test(id)) return legacy
  return null
}

export function runDirExists(runsRoot, runId) {
  const dir = resolveRunDir(runsRoot, runId)
  if (!dir) return false
  return existsSync(path.join(dir, 'manifest.json')) || existsSync(path.join(dir, 'tables'))
}
