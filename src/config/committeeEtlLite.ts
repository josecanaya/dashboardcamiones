/**
 * Modo comité / ETL: solo datos reales Truckflow, sin simulador/IFC ni carga JSON mock pesada.
 * Restaurar el dashboard completo: en `.env` o `.env.local` → `VITE_COMMITTEE_ETL_LITE=false`
 */
export const COMMITTEE_ETL_LITE_MODE =
  typeof import.meta !== 'undefined' &&
  String(import.meta.env?.VITE_COMMITTEE_ETL_LITE ?? 'true').toLowerCase() !== 'false'

/** Pestañas visibles dentro de Datos reales en modo lite. */
export const COMMITTEE_ETL_LITE_MAIN_TAB_IDS = [
  'eventos',
  'alertas',
  'envivo',
  'circuitos',
  'dss_truckflow',
  'camaras',
  'etl',
] as const
