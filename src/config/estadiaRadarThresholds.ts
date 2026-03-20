/**
 * Umbrales configurables para el radar de desempeño operativo (KPI 1).
 * Usados para normalizar métricas a scores 0–100 (100 = mejor).
 * "Menos es mejor" en todas las métricas.
 */

export interface RadarThreshold {
  minRef: number
  maxRef: number
  /** Unidad para display (ej. 'h', '%') */
  unit: string
}

export const ESTADIA_RADAR_THRESHOLDS: Record<string, RadarThreshold> = {
  moda: { minRef: 4, maxRef: 14, unit: 'h' },
  mediana: { minRef: 4, maxRef: 14, unit: 'h' },
  p90: { minRef: 6, maxRef: 18, unit: 'h' },
  iqr: { minRef: 1, maxRef: 8, unit: 'h' },
  std: { minRef: 0, maxRef: 6, unit: 'h' },
}

export type RadarMetricKey = keyof typeof ESTADIA_RADAR_THRESHOLDS
