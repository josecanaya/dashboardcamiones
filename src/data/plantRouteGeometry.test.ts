import { describe, expect, it } from 'vitest'
import { plantTramoId, tramoPath } from './plantRouteGeometry'

const point = (id: string, xPercent: number) => ({ id, xPercent, yPercent: 10 }) as any
describe('geometría de tramos', () => {
  it('comparte la curva en ambos sentidos e invierte su orientación', () => {
    const tramo = { id: plantTramoId('S0', 'S1'), fromPointId: 'S0', toPointId: 'S1', viaPercent: [{ xPercent: 30, yPercent: 20 }, { xPercent: 60, yPercent: 30 }] }
    expect(tramoPath(point('S0', 0), point('S1', 100), [tramo]).map(p => p.xPercent)).toEqual([0, 30, 60, 100])
    expect(tramoPath(point('S1', 100), point('S0', 0), [tramo]).map(p => p.xPercent)).toEqual([100, 60, 30, 0])
  })
})
