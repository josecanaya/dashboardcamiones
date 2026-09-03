import { describe, expect, it } from 'vitest'
import {
  buildSolidExcelCircuitByPlate,
  isLiquidExecutiveCircuitCode,
  resolveSolidExcelFirstCircuitCode,
} from './etlSolidExcelGuard'

/**
 * Guarda producto→circuito: una patente de grano puro (sin movimiento líquido en la
 * ventana) corrige un estampado ejecutivo LÍQUIDO al circuito sólido del Excel.
 * Una patente que también hizo aceite NO se toca (podría ser un aceite real).
 */

type Mov = Parameters<typeof buildSolidExcelCircuitByPlate>[0] extends readonly (infer T)[] | null | undefined
  ? T
  : never

function mov(over: Partial<Mov>): Mov {
  return {
    plate_normalized: 'AB123CD',
    patente_original: 'AB123CD',
    platform_normalized: 'VOLCABLE_PTO_2',
    plataforma_original: 'VOLCABLE PTO 2',
    planta_normalized: 'TERMINAL_EMBARQUE',
    movement_type: 'INGRESO',
    mov: 'I',
    movement_type_detail: 'I',
    product_normalized: 'SOJA',
    producto_original: 'SOJA',
    ...over,
  } as Mov
}

describe('isLiquidExecutiveCircuitCode', () => {
  it('reconoce circuitos líquidos y descarta sólidos', () => {
    for (const c of ['SL1', 'SL2', 'SL3', 'SL5', 'R8', 'R16']) {
      expect(isLiquidExecutiveCircuitCode(c)).toBe(true)
    }
    for (const c of ['R7', 'R5', 'R6', 'R1', 'R3', '']) {
      expect(isLiquidExecutiveCircuitCode(c)).toBe(false)
    }
  })
})

describe('buildSolidExcelCircuitByPlate', () => {
  it('mapea SOJA VOLCABLE_PTO → R7 y GIRASOL VOLCABLE 1/2 → R5/R6', () => {
    const map = buildSolidExcelCircuitByPlate([
      mov({ plate_normalized: 'SOJA111', product_normalized: 'SOJA', platform_normalized: 'VOLCABLE_PTO_2' }),
      mov({ plate_normalized: 'GIRA111', product_normalized: 'GIRASOL', platform_normalized: 'VOLCABLE_1', plataforma_original: 'VOLCABLE 1', planta_normalized: 'RICARDONE' }),
      mov({ plate_normalized: 'GIRA222', product_normalized: 'GIRASOL', platform_normalized: 'VOLCABLE_2', plataforma_original: 'VOLCABLE 2', planta_normalized: 'RICARDONE' }),
    ])
    expect(map.get('SOJA111')).toBe('R7')
    expect(map.get('GIRA111')).toBe('R5')
    expect(map.get('GIRA222')).toBe('R6')
  })

  it('NO mapea una patente que también tuvo un movimiento líquido (aceite) en la ventana', () => {
    const map = buildSolidExcelCircuitByPlate([
      mov({ plate_normalized: 'MIX111', product_normalized: 'SOJA', platform_normalized: 'VOLCABLE_PTO_2' }),
      mov({
        plate_normalized: 'MIX111',
        product_normalized: 'ACEITE GIRASOL REFINADO',
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        movement_type: 'EGRESO',
        mov: 'E',
      }),
    ])
    expect(map.has('MIX111')).toBe(false)
  })

  it('ignora pellet (no es grano sólido de descarga a corregir acá)', () => {
    const map = buildSolidExcelCircuitByPlate([
      mov({ plate_normalized: 'PEL111', product_normalized: 'PELLET DE SOJA', platform_normalized: 'CELDA_09' }),
    ])
    expect(map.has('PEL111')).toBe(false)
  })
})

describe('resolveSolidExcelFirstCircuitCode', () => {
  const circuitByPlate = new Map<string, string>([['SOJA111', 'R7']])

  it('corrige un código líquido (SL1) al circuito sólido de la patente de grano puro', () => {
    expect(
      resolveSolidExcelFirstCircuitCode({
        currentExecutiveCode: 'SL1',
        plate: 'SOJA111',
        circuitByPlate,
      })
    ).toBe('R7')
  })

  it('no toca un código que ya es sólido', () => {
    expect(
      resolveSolidExcelFirstCircuitCode({
        currentExecutiveCode: 'R7',
        plate: 'SOJA111',
        circuitByPlate,
      })
    ).toBeNull()
  })

  it('no corrige una patente ausente del mapa (mixta o sin grano puro)', () => {
    expect(
      resolveSolidExcelFirstCircuitCode({
        currentExecutiveCode: 'R8',
        plate: 'MIX111',
        circuitByPlate,
      })
    ).toBeNull()
  })
})
