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

export function nearestInsertionIndex(path: { xPercent: number; yPercent: number }[], point: { xPercent: number; yPercent: number }) {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!, b = path[i + 1]!
    const dx = b.xPercent - a.xPercent, dy = b.yPercent - a.yPercent
    const t = Math.max(0, Math.min(1, ((point.xPercent - a.xPercent) * dx + (point.yPercent - a.yPercent) * dy) / (dx * dx + dy * dy || 1)))
    const x = a.xPercent + t * dx, y = a.yPercent + t * dy
    const distance = (point.xPercent - x) ** 2 + (point.yPercent - y) ** 2
    if (distance < bestDistance) { bestDistance = distance; best = i }
  }
  return best
}
