/**
 * Helpers para indicadores derivados de la forma de la curva de distribución.
 * Todos los indicadores se expresan en CANTIDAD DE CAMIONES o porcentaje de camiones.
 * El eje Y del gráfico representa cantidad de camiones.
 */

export type RangoCentralTipo = 'media_std' | 'iqr'

export type ColaDerechaTipo = 'media_std' | 'p90' | 'manual'

export interface IndicadoresForma {
  /** Altura máxima de la curva gaussiana = cantidad de camiones en el intervalo más frecuente */
  picoFrecuencia: number
  picoFrecuenciaPct: number
  /** Camiones dentro del rango central (media ± 1σ o Q1–Q3) */
  camionesEnRangoCentral: number
  camionesEnRangoCentralPct: number
  /** Camiones en cola derecha (por encima del umbral) */
  camionesEnColaDerecha: number
  camionesEnColaDerechaPct: number
  rangoCentralTipo: RangoCentralTipo
  rangoCentralMin: number
  rangoCentralMax: number
  colaDerechaTipo: ColaDerechaTipo
  colaDerechaUmbral: number
}

/**
 * Calcula el rango central según el tipo seleccionado.
 */
export function getRangoCentral(
  mean: number,
  std: number,
  q1: number,
  q3: number,
  tipo: RangoCentralTipo
): { min: number; max: number } {
  if (tipo === 'media_std') {
    return {
      min: Math.max(0, mean - std),
      max: mean + std,
    }
  }
  return { min: q1, max: q3 }
}

/**
 * Calcula el umbral de cola derecha según el tipo.
 */
export function getColaDerechaUmbral(
  mean: number,
  std: number,
  p90: number,
  tipo: ColaDerechaTipo,
  umbralManual?: number
): number {
  if (tipo === 'manual' && umbralManual != null) return umbralManual
  if (tipo === 'p90') return p90
  return mean + std
}

/**
 * Cantidad de camiones dentro del rango [min, max].
 */
export function calcCamionesEnRango(
  durations: number[],
  rangoMin: number,
  rangoMax: number
): { count: number; pct: number } {
  if (durations.length === 0) return { count: 0, pct: 0 }
  const dentro = durations.filter((d) => d >= rangoMin && d <= rangoMax).length
  return {
    count: dentro,
    pct: (dentro / durations.length) * 100,
  }
}

/**
 * Cantidad de camiones por encima del umbral (cola derecha).
 */
export function calcCamionesEnColaDerecha(
  durations: number[],
  umbral: number
): { count: number; pct: number } {
  if (durations.length === 0) return { count: 0, pct: 0 }
  const encima = durations.filter((d) => d > umbral).length
  return {
    count: encima,
    pct: (encima / durations.length) * 100,
  }
}

/**
 * Pico de frecuencia = altura máxima de la curva gaussiana.
 * La curva está escalada al histograma (maxCount * exp(-0.5*z²)),
 * por tanto el pico = maxCount = cantidad de camiones en el bin modal.
 */
export function calcPicoFrecuencia(
  maxCount: number,
  totalCount: number
): { pico: number; pct: number } {
  if (totalCount === 0) return { pico: 0, pct: 0 }
  return {
    pico: maxCount,
    pct: (maxCount / totalCount) * 100,
  }
}

/**
 * Construye los 3 indicadores de forma expresados en camiones.
 */
export function buildIndicadoresForma(
  mean: number,
  std: number,
  q1: number,
  q3: number,
  p90: number,
  durations: number[],
  maxCount: number,
  rangoTipo: RangoCentralTipo = 'media_std',
  colaTipo: ColaDerechaTipo = 'media_std',
  umbralManual?: number
): IndicadoresForma {
  const totalCount = durations.length
  const rango = getRangoCentral(mean, std, q1, q3, rangoTipo)
  const colaUmbral = getColaDerechaUmbral(mean, std, p90, colaTipo, umbralManual)

  const { count: camionesRango, pct: pctRango } = calcCamionesEnRango(
    durations,
    rango.min,
    rango.max
  )
  const { count: camionesCola, pct: pctCola } = calcCamionesEnColaDerecha(
    durations,
    colaUmbral
  )
  const { pico, pct: pctPico } = calcPicoFrecuencia(maxCount, totalCount)

  return {
    picoFrecuencia: pico,
    picoFrecuenciaPct: pctPico,
    camionesEnRangoCentral: camionesRango,
    camionesEnRangoCentralPct: pctRango,
    camionesEnColaDerecha: camionesCola,
    camionesEnColaDerechaPct: pctCola,
    rangoCentralTipo: rangoTipo,
    rangoCentralMin: rango.min,
    rangoCentralMax: rango.max,
    colaDerechaTipo: colaTipo,
    colaDerechaUmbral: colaUmbral,
  }
}
