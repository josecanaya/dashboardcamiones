/**
 * Contract-first / Excel-first — expectativa Movimientos por Contrato + evidencia Truckflow.
 *
 * Implementación física: src/features/real-truckflow/etlWorkbench/* (Etapa Contract-first = capa de entrada).
 * No confundir con truckPlateRegistryFilter (exclusiones manuales de patente).
 *
 * Orden pipeline global (sin cambiar en esta etapa):
 *   Truckflow → clasificación Workbench → merge Contract-first → KPI/scatter.
 */
export * from './contractFirst.types'
export * from './contractFieldNormalizer'
export * from './contractExcelParser'
export * from './contractTruckflowMerge'
export * from './contractExcelFirstEvidence'
export * from './contractFirstAudit'
export * from './contractIntegrationRun'
export * from './contractFirstCliAdapter'
