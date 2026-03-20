/**
 * Umbrales para el radar de forma de la distribución (Pico, Rango central, Cola derecha).
 * Scores 0–100 (100 = mejor).
 * - Pico % y Rango central %: más es mejor
 * - Cola derecha %: menos es mejor
 */

export interface FormaRadarThreshold {
  minRef: number
  maxRef: number
  /** true = más es mejor, false = menos es mejor */
  masEsMejor: boolean
  unit: string
}

export const ESTADIA_FORMA_RADAR_THRESHOLDS: Record<string, FormaRadarThreshold> = {
  picoFrecuenciaPct: { minRef: 0.5, maxRef: 15, masEsMejor: true, unit: '%' },
  camionesEnRangoCentralPct: { minRef: 40, maxRef: 90, masEsMejor: true, unit: '%' },
  camionesEnColaDerechaPct: { minRef: 0, maxRef: 35, masEsMejor: false, unit: '%' },
}

export type FormaRadarMetricKey = keyof typeof ESTADIA_FORMA_RADAR_THRESHOLDS
