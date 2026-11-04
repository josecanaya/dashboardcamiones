import { describe, expect, it } from 'vitest'
import { clasificarErroneas, ventanaCamara } from './erroneasConfirmadas.mjs'

const M = 60_000
describe('clasificarErroneas', () => {
  it('ventana larga donde el camión se detiene, corta en cámaras de paso', () => {
    expect(ventanaCamara('SLZBalSC1Fte')).toBe(5 * M)
    expect(ventanaCamara('RicIngCamFrente')).toBe(M)
  })
  it('une a un paso guardado de la misma cámara dentro de su ventana', () => {
    const r = clasificarErroneas(
      [{ key: 'a', device: 'SLZBalSC1Fte', node: 'B1', t: 3 * M }, { key: 'b', device: 'RicIngCamFrente', node: 'S0', t: 3 * M }],
      [{ device: 'SLZBalSC1Fte', node: 'B1', t: 0 }, { device: 'RicIngCamFrente', node: 'S0', t: 0 }],
    )
    expect([...r.confirmadas.keys()]).toEqual(['a'])
    expect(r.alertas).toEqual([{ key: 'b', agrupa: [] }])
  })
  it('la otra cámara del mismo nodo dentro de 60 s también confirma', () => {
    const r = clasificarErroneas([{ key: 'a', device: 'RicIngCamTrasera', node: 'S0', site: 'ricardone', t: 30_000 }], [{ device: 'RicIngCamFrente', node: 'S0', site: 'ricardone', t: 0 }])
    expect(r.confirmadas.has('a')).toBe(true)
  })
  it('las seguidas en la misma cámara son una sola alerta', () => {
    const r = clasificarErroneas([
      { key: 'a', device: 'RicIngCamFrente', node: 'S0', t: 0 },
      { key: 'b', device: 'RicIngCamFrente', node: 'S0', t: 40_000 },
      { key: 'c', device: 'RicIngCamFrente', node: 'S0', t: 10 * M },
    ], [])
    expect(r.alertas).toEqual([{ key: 'a', agrupa: ['b'] }, { key: 'c', agrupa: [] }])
  })
})
