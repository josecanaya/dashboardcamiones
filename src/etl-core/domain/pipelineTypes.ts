/**
 * Contratos tipados entre etapas del pipeline (Fase 1).
 * Re-exporta desde ubicaciones actuales; la implementación se mueve en Fases 2–3.
 */
export type { ExternalMovimientoContratoNormalized } from './contractMovements.types'
export type { ExcelOperationWithTruckflowRow } from '../../features/real-truckflow/etlWorkbench/etlExcelFirstMerge'
export type { TruckflowJourneyForMerge } from '../../features/real-truckflow/etlWorkbench/etlTruckflowMergeTypes'
export type { ClassifiedJourneyForTiming } from '../../features/real-truckflow/etlWorkbench/etlSegmentTiming'
export type { RawJourneyEventLike } from '../../features/real-truckflow/etlWorkbench/auditSlCameraExcelCoverage'
