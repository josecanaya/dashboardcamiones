/**
 * Genera lectura ejecutiva tipo comité para la sección de métricas de estadía.
 * Enfoque operativo, no académico.
 */

export interface IndicadoresFormaInput {
  mode: number
  picoFrecuencia: number
  picoFrecuenciaPct: number
  camionesEnRangoCentral: number
  camionesEnRangoCentralPct: number
  camionesEnColaDerecha: number
  camionesEnColaDerechaPct: number
}

export interface EstadiaInsightInput {
  count: number
  mean: number
  median: number
  mode: number
  std: number
  p90: number
  min: number
  max: number
  q1?: number
  q3?: number
  iqr: number
  distanciaModaMediana: number
  /** Indicadores de forma de la curva para lectura ejecutiva */
  indicadoresForma?: IndicadoresFormaInput | null
}

export function generateEstadiaInsight(stats: EstadiaInsightInput): string[] {
  const lines: string[] = []
  if (stats.count === 0) {
    lines.push('No hay datos suficientes para generar conclusiones.')
    return lines
  }

  if (stats.indicadoresForma) {
    lines.push(
      `La mayor concentración de camiones se ubica alrededor de ${stats.indicadoresForma.mode.toFixed(1)} h, con un pico estimado de ${stats.indicadoresForma.picoFrecuencia.toLocaleString('es-AR')} camiones.`
    )
    lines.push(
      `El ${stats.indicadoresForma.camionesEnRangoCentralPct.toFixed(0)}% de los camiones se encuentra dentro del rango central esperado.`
    )
    lines.push(
      `El ${stats.indicadoresForma.camionesEnColaDerechaPct.toFixed(0)}% de los camiones se ubica en la cola derecha de la distribución.`
    )
  } else {
    lines.push(
      `La mayor concentración de camiones se ubica alrededor de ${stats.mode.toFixed(1)} horas.`
    )
  }

  lines.push(
    `El 90% de los camiones egresa antes de ${stats.p90.toFixed(1)} horas.`
  )

  if (stats.q1 !== undefined && stats.q3 !== undefined) {
    lines.push(
      `El 50% central de la operación se mueve dentro de un rango de ${stats.iqr.toFixed(1)} horas (${stats.q1.toFixed(1)}–${stats.q3.toFixed(1)} h).`
    )
  }

  if (stats.distanciaModaMediana < 0.5) {
    lines.push(
      'La distancia entre moda y mediana sugiere una distribución estable y coherente.'
    )
  } else if (stats.distanciaModaMediana < 1.5) {
    lines.push(
      'La distancia entre moda y mediana indica una ligera asimetría en la distribución.'
    )
  } else {
    lines.push(
      'La distancia entre moda y mediana sugiere una distribución sesgada o mezcla de comportamientos.'
    )
  }

  return lines
}
