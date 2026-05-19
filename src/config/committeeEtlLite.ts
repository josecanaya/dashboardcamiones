/**
 * Modo comité / ETL: solo datos reales Truckflow, sin simulador/IFC ni carga JSON mock pesada.
 * Restaurar el dashboard completo: en `.env` o `.env.local` → `VITE_COMMITTEE_ETL_LITE=false`
 */
export const COMMITTEE_ETL_LITE_MODE =
  typeof import.meta !== 'undefined' &&
  String(import.meta.env?.VITE_COMMITTEE_ETL_LITE ?? 'true').toLowerCase() !== 'false'

/** Pestañas visibles en Datos reales (flujo Extract → Analyze → Transform → En vivo → Load). */
export const COMMITTEE_ETL_LITE_MAIN_TAB_IDS = [
  'extraccion_datos',
  'analisis_local',
  'transform_etl',
  'envivo',
  'load_export',
] as const
