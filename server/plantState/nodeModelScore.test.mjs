import { describe, it, expect } from 'vitest'
import { readLikelihood, scoreWithNodeModel, pInicioTable, franjaOf } from './nodeModelScore.mjs'

// 08/10 11:07 hora argentina = 14:07 UTC (de día).
const day = '2026-10-08T14:07:45.094Z'
const cfk006 = { plate: 'CFK006', nextProbability: 1, nodeProbability: 1, onTime: true, attrLr: 0.728 * 0.759 }

describe('modelo por nodos: «nunca visto» depende del nodo', () => {
  it('la tabla tiene Ingreso como punto de partida y Calada con pocos camiones nuevos de día', () => {
    const t = pInicioTable()
    expect(t.nodes.S0.pInicio.dia).toBeGreaterThan(0.5)
    expect(t.nodes.S2.pInicio.dia).toBeLessThan(0.15)
    // Egreso SL: autos y camionetas entran por ahí, «nunca visto» pesa más que en Calada.
    expect(t.nodes.SL_S7.pInicio.dia).toBeGreaterThan(t.nodes.S2.pInicio.dia)
    expect(franjaOf(Date.parse(day))).toBe('dia')
  })
  it('una letra cualquiera cambiada es mucho menos probable que una confusión típica', () => {
    expect(readLikelihood('CFK008', 'CFK006', 0.79)).toBeCloseTo(0.05 / 102, 6)
    expect(readLikelihood('OJ0501', 'OJO501')).toBeGreaterThan(readLikelihood('CFK008', 'CFK006') * 10)
    expect(readLikelihood('CFK006', 'CFK006', 0.79)).toBe(0.79)
    expect(readLikelihood('CF0', 'CFK006')).toBe(0)
  })
  it('CFK008 en Calada con CFK006 esperado: supera el 90 % aun con color y tipo en contra', () => {
    const r = scoreWithNodeModel({ readPlate: 'CFK008', validFormat: true, node: 'S2', at: day, expectedAtNode: 5 }, [cfk006])
    expect(r.candidates[0].probability).toBeGreaterThan(0.9)
    expect(r.neverSeen.probability).toBeLessThan(0.1)
  })
  it('la misma lectura válida en Ingreso no alcanza: ahí puede entrar un camión nuevo', () => {
    const r = scoreWithNodeModel({ readPlate: 'CFK008', validFormat: true, node: 'S0', at: day, expectedAtNode: 5 }, [{ ...cfk006, sameNode: false }])
    expect(r.candidates[0].probability).toBeLessThan(0.5)
  })
  it('EIY16 en Salida 2 con EIY162 esperado: una letra de menos se resuelve', () => {
    const r = scoreWithNodeModel({ readPlate: 'EIY16', validFormat: false, node: 'S3', at: day, expectedAtNode: 8 }, [{ plate: 'EIY162', nextProbability: 0.8, nodeProbability: 0.8, onTime: true }])
    expect(r.candidates[0].probability).toBeGreaterThan(0.95)
  })
  it('una referencia posterior no cuenta en vivo', () => {
    const r = scoreWithNodeModel({ readPlate: 'EIY16', validFormat: false, node: 'S3', at: day }, [{ plate: 'EIY162', seenAfter: true }])
    expect(r.candidates[0].probability).toBe(0)
  })
})
