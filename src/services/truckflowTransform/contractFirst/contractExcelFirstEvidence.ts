/**
 * Excel-first: cada operación contractual busca evidencia Truckflow (patente, ventana, segmentos).
 * Fuente de verdad física: etlExcelFirstMerge.ts
 */
export {
  computeExcelSearchWindow,
  buildExcelPeriodContext,
  resolveOperationalContextFromExcel,
  isPossibleRejectionTruckflowJourney,
  deriveRouteQualityForJourney,
  buildPlateIndex,
  diagnoseNoTruckflowEvidence,
  findTruckflowEvidenceForExcelOperation,
  buildExcelFirstReviewSample,
  mergeExcelOperationsWithTruckflowEvidence,
  excelOperationsWithTruckflowCsv,
  EXCEL_FIRST_PANEL_CSV_KEYS,
  COMMITTEE_CONCILIATION_CSV_KEYS,
  excelOperationSegmentsForScatterCsv,
} from '../../../features/real-truckflow/etlWorkbench/etlExcelFirstMerge'

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
