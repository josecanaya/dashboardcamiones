/**
 * Orquestación Contract-first dentro del Transform Workbench.
 * Hoy se invoca después de clasificación Truckflow (finalCsvRows) — el orden global no cambia en esta etapa.
 * Fuente de verdad física: etlMovimientosContratoIntegration.ts
 */
export {
  runMovimientosContratoIntegration,
} from '../../../features/real-truckflow/etlWorkbench/etlMovimientosContratoIntegration'

export type {
  MovimientosContratoIntegrationInput,
  MovimientosContratoIntegrationOutput,
} from '../../../features/real-truckflow/etlWorkbench/etlMovimientosContratoIntegration'

/** Nombres estables de artefactos CSV emitidos por la integración (referencia CLI/docs). */
export const CONTRACT_FIRST_INTEGRATION_CSV_KEYS = [
  'external_movimientos_contrato_normalized',
  'truckflow_journeys_for_merge',
  'truckflow_segments_for_merge',
  'merged_truckflow_movimientos',
  'truckflow_without_movimiento_match',
  'movimientos_without_truckflow_match',
  'merge_ambiguous_cases',
  'merge_summary',
  'clean_journeys_for_analysis',
  'journeys_enriched_sin_punto_descarga',
  'excel_operations_with_truckflow',
  'excel_operation_segments_for_scatter',
  'excel_first_merge_summary',
  'excel_first_by_product_platform',
  'excel_no_truckflow_evidence_diagnostics',
  'excel_first_candidate_diagnostics',
  'excel_first_review_sample',
] as const

export type ContractFirstIntegrationCsvKey = (typeof CONTRACT_FIRST_INTEGRATION_CSV_KEYS)[number]
