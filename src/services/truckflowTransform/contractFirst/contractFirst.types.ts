/**
 * Tipos Contract-first / Excel-first (Movimientos por Contrato).
 * Implementación física aún en etlWorkbench — reexportación Etapa Contract-first.
 */
export type {
  ExternalMovimientoContratoRaw,
  ExternalMovimientoContratoNormalized,
  MovimientosContratoFileInput,
  MovimientosContratoReadMeta,
  MovimientosContratoLoadStats,
} from '../../../features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato'

export type { PlantNormalized } from '../../../features/real-truckflow/etlWorkbench/etlExternalNormalization'

export type {
  TruckflowJourneyForMerge,
  MergeStatus,
  MergeTruckflowMovimientosOptions,
  MergeCandidateScore,
  MergedTruckflowMovimientoRow,
  MergeResult,
} from '../../../features/real-truckflow/etlWorkbench/etlTruckflowMovimientosMerge'

export type {
  MatchQuality,
  NoTruckflowReason,
  RouteQuality,
  OperationalContextFromExcel,
  SearchWindowSpec,
  MatchSignals,
  TruckflowEvidenceResult,
  ExcelOperationWithTruckflowRow,
  ExcelNoTruckflowDiagnosticRow,
  ExcelOperationSegmentScatterRow,
  ExcelFirstMergeOptions,
  ExcelPeriodContext,
  ExcelFirstMergeResult,
} from '../../../features/real-truckflow/etlWorkbench/etlExcelFirstMerge'

export type {
  MovimientosContratoIntegrationInput,
  MovimientosContratoIntegrationOutput,
} from '../../../features/real-truckflow/etlWorkbench/etlMovimientosContratoIntegration'
