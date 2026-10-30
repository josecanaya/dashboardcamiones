import { describe, expect, it } from 'vitest'
import { layerOf, summarizeLayers } from './algorithmLayers.mjs'

describe('capas del reconocedor', () => {
  const now = Date.parse('2026-10-29T14:00:00Z')
  const at = (min) => new Date(now - min * 60_000).toISOString()

  it('cada regla cae en su capa; operaciones manda; por confirmar es «sin resolver»', () => {
    expect(layerOf({ rule: 'cuenta', level: 'casi_seguro' })).toBe('lote')
    expect(layerOf({ rule: 'carta_porte', level: 'casi_seguro' })).toBe('capa2')
    expect(layerOf({ rule: 'acoplado_balanza', level: 'casi_seguro' })).toBe('balanza')
    expect(layerOf({ rule: 'ia_imagen', level: 'casi_seguro' })).toBe('ia')
    expect(layerOf({ rule: 'cuenta', level: 'confirmado', decision: { action: 'confirm' } })).toBe('operador')
    expect(layerOf({ rule: 'universo', level: 'provisorio' })).toBe('sin_resolver')
    expect(layerOf({ rule: 'fuera_sistema', level: 'fuera_sistema' })).toBeNull()
  })

  it('cuenta decisiones de 24 h, propuestas por confirmar, rechazos de operaciones y la última hora', () => {
    const rows = summarizeLayers([
      { at: at(5), rule: 'cuenta', level: 'casi_seguro' },
      { at: at(90), rule: 'cuenta', level: 'casi_seguro' },
      { at: at(30), rule: 'ia_imagen', level: 'provisorio' },
      { at: at(10), rule: 'balanza_unica', level: 'rechazado', decision: { action: 'reject' } },
      { at: at(26 * 60), rule: 'cuenta', level: 'casi_seguro' },
    ], now)
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.lote).toMatchObject({ decided: 2, lastAt: at(5) })
    expect(by.ia).toMatchObject({ decided: 0, proposed: 1 })
    expect(by.balanza).toMatchObject({ decided: 0, rejectedByOps: 1 })
    expect(by.operador.decided).toBe(1)
    expect(by.sin_resolver.decided).toBe(1)
  })
})
