import type { PlantPoint, PlantTramo } from './plantZones.types'

export const plantTramoId = (a: string, b: string) => [a, b].sort().join('::')

export function tramoPath(from: PlantPoint, to: PlantPoint, tramos: PlantTramo[]) {
  const tramo = tramos.find((item) => item.id === plantTramoId(from.id, to.id))
  const via = tramo
    ? (tramo.fromPointId === from.id ? tramo.viaPercent : [...tramo.viaPercent].reverse())
    : []
  return [{ xPercent: from.xPercent, yPercent: from.yPercent }, ...via,
    { xPercent: to.xPercent, yPercent: to.yPercent }]
}

/**
 * Punto a una fracción (0–1) del largo de un recorrido. El largo se mide en píxeles de la imagen
 * base (`width`×`height`) para que la velocidad no dependa de la orientación del tramo.
 */
export function pointAlongPath(path: { xPercent: number; yPercent: number }[], fraction: number, width: number, height: number) {
  if (path.length < 2) return path[0] ?? { xPercent: 0, yPercent: 0 }
  const px = path.map((p) => [(p.xPercent / 100) * width, (p.yPercent / 100) * height] as const)
  const seg = px.slice(1).map((p, i) => Math.hypot(p[0] - px[i][0], p[1] - px[i][1]))
  const total = seg.reduce((a, b) => a + b, 0) || 1
  let left = Math.min(1, Math.max(0, fraction)) * total
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, left / seg[i]) : 0
      return {
        xPercent: path[i].xPercent + (path[i + 1].xPercent - path[i].xPercent) * f,
        yPercent: path[i].yPercent + (path[i + 1].yPercent - path[i].yPercent) * f,
      }
    }
    left -= seg[i]
  }
  return path[path.length - 1]
}

/** Largo de un recorrido en % del ancho de la imagen (para estimar minutos de viaje). */
export function pathLengthPercent(path: { xPercent: number; yPercent: number }[], width: number, height: number) {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(((path[i].xPercent - path[i - 1].xPercent) / 100) * width, ((path[i].yPercent - path[i - 1].yPercent) / 100) * height)
  }
  return (total / width) * 100
}
