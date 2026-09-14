import { describe, expect, it } from 'vitest'
import { buildDeclaredPlatformMovementsByPlate } from './etlDeclaredPlatformIndex'

const base = {
  plate_normalized: 'ABC123',
  platform_normalized: 'VOLCABLE_PTO_3',
  external_ingreso_at: '2026-09-01T10:00:00',
  external_salida_at: '2026-09-01T14:00:00',
}

describe('buildDeclaredPlatformMovementsByPlate', () => {
  it('indexa el movimiento con su ventana', () => {
    const idx = buildDeclaredPlatformMovementsByPlate([base])
    expect(idx.get('ABC123')).toEqual([
      {
        platform: 'VOLCABLE_PTO_3',
        fromMs: Date.parse('2026-09-01T10:00:00-03:00'),
        toMs: Date.parse('2026-09-01T14:00:00-03:00'),
      },
    ])
  })

  it('excluye los movimientos de la vuelta', () => {
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, es_de_vuelta: true }]).size).toBe(0)
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, es_de_vuelta: 'SI' }]).size).toBe(0)
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, es_de_vuelta: 'true' }]).size).toBe(0)
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, es_de_vuelta: false }]).size).toBe(1)
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, es_de_vuelta: '' }]).size).toBe(1)
  })

  it('ignora plataformas sin cámara por calle y movimientos sin hora de ingreso', () => {
    expect(
      buildDeclaredPlatformMovementsByPlate([{ ...base, platform_normalized: 'KEPPLER_1' }]).size
    ).toBe(0)
    expect(buildDeclaredPlatformMovementsByPlate([{ ...base, external_ingreso_at: '' }]).size).toBe(0)
  })

  it('sin hora de salida usa la de ingreso como cierre de ventana', () => {
    const [mov] = buildDeclaredPlatformMovementsByPlate([{ ...base, external_salida_at: '' }]).get('ABC123')!
    expect(mov.toMs).toBe(mov.fromMs)
  })
})
