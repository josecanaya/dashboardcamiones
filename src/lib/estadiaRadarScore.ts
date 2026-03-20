/**
 * Helpers para el radar de desempeño operativo (KPI 1).
 * - Cálculo de score normalizado 0–100 (menos es mejor)
 * - Construcción del dataset del radar
 * - Formateo de tooltip
 */

import { ESTADIA_RADAR_THRESHOLDS, type RadarMetricKey } from '../config/estadiaRadarThresholds'

export interface RadarDataPoint {
  subject: string
  score: number
  fullMark: number
  valorReal: number
  unidad: string
  metricKey: RadarMetricKey
}

export interface StayStatsForRadar {
  mode: number
  median: number
  p90: number
  iqr: number
  std: number
}

/**
 * Calcula score normalizado 0–100 donde 100 = mejor.
 * Lógica: menos es mejor → score = 100 * (max_ref - valor) / (max_ref - min_ref)
 * - valor <= min_ref → 100
 * - valor >= max_ref → 0
 */
export function computeNormalizedScore(
  valorActual: number,
  minRef: number,
  maxRef: number
): number {
  if (valorActual <= minRef) return 100
  if (valorActual >= maxRef) return 0
  const range = maxRef - minRef
  if (range <= 0) return 100
  const score = 100 * (maxRef - valorActual) / range
  return Math.max(0, Math.min(100, score))
}

/**
 * Construye el dataset del radar a partir de stayStats.
 */
export function buildRadarDataset(stats: StayStatsForRadar): RadarDataPoint[] {
  const metrics: { key: RadarMetricKey; label: string; value: number }[] = [
    { key: 'moda', label: 'Moda', value: stats.mode },
    { key: 'mediana', label: 'Mediana', value: stats.median },
    { key: 'p90', label: 'P90', value: stats.p90 },
    { key: 'iqr', label: 'IQR', value: stats.iqr },
    { key: 'std', label: 'Desv. estándar', value: stats.std },
  ]

  return metrics.map(({ key, label, value }) => {
    const th = ESTADIA_RADAR_THRESHOLDS[key]
    const score = computeNormalizedScore(value, th.minRef, th.maxRef)
    return {
      subject: label,
      score: Math.round(score * 10) / 10,
      fullMark: 100,
      valorReal: value,
      unidad: th.unit,
      metricKey: key,
    }
  })
}

/**
 * Formatea el tooltip: nombre, valor real, score.
 */
export function formatRadarTooltip(point: RadarDataPoint): string {
  const valorStr = point.unidad === '%'
    ? `${point.valorReal.toFixed(1)}%`
    : `${point.valorReal.toFixed(1)} ${point.unidad}`
  return `${point.subject}: ${valorStr} (score: ${point.score.toFixed(0)})`
}

export interface MergedRadarDataPoint extends RadarDataPoint {
  scoreCompare?: number
}

/**
 * Construye dataset para comparación (actual vs referencia).
 */
export function buildMergedRadarDataset(
  stats: StayStatsForRadar,
  compareStats: StayStatsForRadar
): MergedRadarDataPoint[] {
  const main = buildRadarDataset(stats)
  const compare = buildRadarDataset(compareStats)
  return main.map((m, i) => ({
    ...m,
    scoreCompare: compare[i]?.score,
  }))
}
