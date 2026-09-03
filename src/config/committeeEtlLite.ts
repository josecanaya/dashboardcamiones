/**
 * Modo único de la app: datos reales Truckflow + consola en vivo + pipeline ETL.
 * No hay toggle de mock/simulador: siempre activo.
 */
export const REAL_DATA_APP_MODE = true as const

/** Alias histórico — siempre true (no leer env). */
export const COMMITTEE_ETL_LITE_MODE = true as const

/** Pestañas productivas del batch ETL (evidencia ejecutiva). En vivo queda fijo arriba. */
export const ETL_PRODUCT_TAB_IDS = [
  'extraccion_datos',
  'analisis_local',
  'transform_etl',
  'kpi_tiempos',
] as const

/** Pestañas de diagnóstico técnico — solo visibles en modo DEV. */
export const ETL_DEV_TAB_IDS = [
  'kpi_comite',
  'resumen',
  'depuracion',
  'incompletos',
  'eventos',
  'alertas',
  'circuitos',
  'camara_por_camara',
  'buscar',
] as const

/** @deprecated Usar ETL_PRODUCT_TAB_IDS + ETL_DEV_TAB_IDS */
export const ETL_MAIN_TAB_IDS = [...ETL_PRODUCT_TAB_IDS, ...ETL_DEV_TAB_IDS] as const

/** @deprecated Usar ETL_PRODUCT_TAB_IDS */
export const COMMITTEE_ETL_LITE_MAIN_TAB_IDS = ETL_MAIN_TAB_IDS

/**
 * Modo diagnóstico DEV: pestañas legacy, CSVs intermedios y exports técnicos.
 * En build de producción queda desactivado salvo VITE_ETL_DEV=true.
 */
export const ETL_DEV_MODE =
  (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)) ||
  String((typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ETL_DEV : undefined) ?? '')
    .toLowerCase() === 'true'

/** Archivos finales para comité / Power BI — única salida productiva esperada. */
export const POWER_BI_PRODUCT_FILES = [
  'pb_committee_summary.csv',
  'pb_final_circuits.csv',
  'pb_circuit_summary.csv',
  'pb_anomalies.csv',
  'pb_camera_committee_status.csv',
  'pb_camera_lpr_analysis.csv',
  'pb_alerts_operational.csv',
  'pb_load_manifest.json',
] as const

/** Manifiesto técnico consolidado (opcional, no para comité). */
export const ETL_OPTIONAL_MANIFEST = 'etl_result.json' as const
