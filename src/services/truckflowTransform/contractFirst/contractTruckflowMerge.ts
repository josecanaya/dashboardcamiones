/**
 * Merge journey Truckflow (ya clasificado en Workbench) ↔ operación Excel.
 * Incluye ancla Excel-first pass, fuzzy OCR y estados NO_EXTERNAL_MATCH / NO_TRUCKFLOW_MATCH.
 * Fuente de verdad física: etlTruckflowMovimientosMerge.ts
 */
export {
  MERGE_STATUSES_WITH_PRODUCT,
  isPlatformCompatibleWithCircuit,
  journeyMissingInstrumentedDischarge,
  journeyNeedsOperationalEnrichment,
  externalDischargeReferenceMs,
  mergeTruckflowWithMovimientos,
} from '../../../features/real-truckflow/etlWorkbench/etlTruckflowMovimientosMerge'

export type {
  TruckflowJourneyForMerge,
  MergeStatus,
  MergeTruckflowMovimientosOptions,
  MergeCandidateScore,
  MergedTruckflowMovimientoRow,
  MergeResult,
} from '../../../features/real-truckflow/etlWorkbench/etlTruckflowMovimientosMerge'

/** Inferencia circuito desde movimiento Excel (dependencia del merge). */
export {
  applyExternalCircuitToJourney,
  excelAnchorJourneyPriority,
  inferCircuitFromExternalMovimiento,
  journeyNeedsCircuitFromExcel,
} from '../../../features/real-truckflow/etlWorkbench/etlPlatformCircuitInference'
