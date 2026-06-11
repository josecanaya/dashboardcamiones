/**
 * Lectura y normalización por fila de Movimientos por Contrato (Excel).
 * Fuente de verdad física: etlExternalMovimientosContrato.ts (Workbench).
 * @see contractFieldNormalizer.ts para normalizadores de campos compartidos.
 */
export {
  normalizeMovimientoContrato,
  readMovimientosContratoXlsx,
  loadMovimientosContratoFiles,
  normalizeMovimientosContratoBatch,
  EXTERNAL_MOVIMIENTOS_NORMALIZED_HEADERS,
  externalMovimientosNormalizedCsv,
  summarizeMovimientosContratoLoad,
} from '../../../features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato'

export type {
  ExternalMovimientoContratoRaw,
  ExternalMovimientoContratoNormalized,
  MovimientosContratoFileInput,
  MovimientosContratoReadMeta,
  MovimientosContratoLoadStats,
} from '../../../features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato'
