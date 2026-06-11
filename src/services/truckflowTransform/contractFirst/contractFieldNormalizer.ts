/**
 * Normalización de campos contractuales (patente, planta, producto, plataforma, fechas).
 * Fuente de verdad física: etlExternalNormalization.ts (Workbench).
 */
export {
  normalizePlate,
  normalizePlant,
  normalizeMovementType,
  normalizeProduct,
  normalizePlatform,
  tryMonthDaySwapCorrection,
  combineDateTime,
  formatIsoLocal,
  stableExternalHash,
  inferSourceDateFromFileName,
} from '../../../features/real-truckflow/etlWorkbench/etlExternalNormalization'

export type { PlantNormalized } from '../../../features/real-truckflow/etlWorkbench/etlExternalNormalization'
