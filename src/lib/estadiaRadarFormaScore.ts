/**
 * Helpers para el radar de forma de la distribución.
 * Pico de frecuencia %, Camiones en rango central %, Camiones en cola derecha %.
 * Scores 0–100 (100 = mejor).
 */

import {
  ESTADIA_FORMA_RADAR_THRESHOLDS,
  type FormaRadarMetricKey,
} from '../config/estadiaRadarFormaThresholds'
import type { IndicadoresForma } from './distribucionForma'

export interface FormaRadarDataPoint {
  subject: string
  score: number
  fullMark: number
  valorReal: number
  valorCamiones?: number
  unidad: string
  metricKey: FormaRadarMetricKey
}

/**
 * Score normalizado 0–100.
 * masEsMejor: score = 100 * (valor - minRef) / (maxRef - minRef)
 * menosEsMejor: score = 100 * (maxRef - valor) / (maxRef - minRef)
 */
function computeFormaScore(
  valor: number,
  minRef: number,
  maxRef: number,
  masEsMejor: boolean
): number {
  const range = maxRef - minRef
  if (range <= 0) return 100
  let score: number
  if (masEsMejor) {
    if (valor >= maxRef) return 100
    if (valor <= minRef) return 0
    score = 100 * (valor - minRef) / range
  } else {
    if (valor <= minRef) return 100
    if (valor >= maxRef) return 0
    score = 100 * (maxRef - valor) / range
  }
  return Math.max(0, Math.min(100, score))
}

const LABELS: Record<FormaRadarMetricKey, string> = {
  picoFrecuenciaPct: 'Pico de frecuencia',
  camionesEnRangoCentralPct: 'Camiones en rango central',
  camionesEnColaDerechaPct: 'Camiones en cola derecha',
}

export function buildFormaRadarDataset(indicadores: IndicadoresForma): FormaRadarDataPoint[] {
  const metrics: { key: FormaRadarMetricKey; valorReal: number; valorCamiones?: number }[] = [
    { key: 'picoFrecuenciaPct', valorReal: indicadores.picoFrecuenciaPct, valorCamiones: indicadores.picoFrecuencia },
    { key: 'camionesEnRangoCentralPct', valorReal: indicadores.camionesEnRangoCentralPct, valorCamiones: indicadores.camionesEnRangoCentral },
    { key: 'camionesEnColaDerechaPct', valorReal: indicadores.camionesEnColaDerechaPct, valorCamiones: indicadores.camionesEnColaDerecha },
  ]

  return metrics.map(({ key, valorReal, valorCamiones }) => {
    const th = ESTADIA_FORMA_RADAR_THRESHOLDS[key]
    const score = computeFormaScore(valorReal, th.minRef, th.maxRef, th.masEsMejor)
    return {
      subject: LABELS[key],
      score: Math.round(score * 10) / 10,
      fullMark: 100,
      valorReal,
      valorCamiones,
      unidad: th.unit,
      metricKey: key,
    }
  })
}
