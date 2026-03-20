/**
 * Límites operativos realistas para tiempo de estadía de camiones.
 * Se usan para filtrar datos irreales en gráficos y KPIs.
 */

export const MIN_DURATION_MINUTES = 30   // 30 minutos mínimo
export const MAX_DURATION_MINUTES = 1440  // 24 horas máximo

/** Clamp duración a rango realista (minutos). */
export function clampDurationMinutes(minutes: number): number {
  return Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, minutes))
}

/** Clamp duración en horas. */
export function clampDurationHours(hours: number): number {
  return Math.max(MIN_DURATION_MINUTES / 60, Math.min(MAX_DURATION_MINUTES / 60, hours))
}

/** Multiplicador de desvío estándar para umbral "fuera de rango". Camiones fuera de media + UMBRAL_FUERA_RANGO_STD * std. */
export const UMBRAL_FUERA_RANGO_STD = 2
