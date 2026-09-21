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
