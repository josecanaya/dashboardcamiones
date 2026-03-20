import type { HeatmapBand } from '../../services/saturationAnalytics'

/**
 * Paleta pastel para heatmap (interactivo arriba).
 */
export const SATURATION_BAND_BG: Record<HeatmapBand, string> = {
  normal: 'bg-emerald-100',
  high: 'bg-amber-100',
  saturated: 'bg-rose-200',
  severe: 'bg-rose-300',
}

export const SATURATION_BAND_LEGEND: Record<HeatmapBand, string> = {
  normal: 'bg-emerald-100 ring-1 ring-emerald-200/90',
  high: 'bg-amber-100 ring-1 ring-amber-200/90',
  saturated: 'bg-rose-200 ring-1 ring-rose-200/90',
  severe: 'bg-rose-300 ring-1 ring-rose-300/90',
}
