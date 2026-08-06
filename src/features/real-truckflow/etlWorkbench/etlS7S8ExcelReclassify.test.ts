import { describe, expect, it } from 'vitest'
import {
  buildS7S8CircuitByPlate,
  resolveS7S8ExcelFirstCircuitCode,
  S7S8_GATE_POINTS,
  S7S8_TARGET_CIRCUITS,
} from './etlS7S8ExcelReclassify'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'

function mov(partial: Partial<ExternalMovimientoContratoNormalized>): ExternalMovimientoContratoNormalized {
  return {
    external_operation_id: '',
    source_file: '',
    source_date: '',
    external_ingreso_at: '',
    external_calado_at: '',
    external_salida_at: '',
    patente_original: '',
    plate_normalized: '',
    plataforma_original: '',
    platform_normalized: '',
    planta_original: '',
    planta_normalized: '',
    producto_original: '',
    product_normalized: '',
    movement_type: '',
    movement_type_detail: '',
    mov: '',
    ...(partial as ExternalMovimientoContratoNormalized),
  } as ExternalMovimientoContratoNormalized
}

describe('etlS7S8ExcelReclassify', () => {
  it('mapea patente → R3/R4 desde plataforma Kepler (excel-first)', () => {
    const map = buildS7S8CircuitByPlate([
      mov({ plate_normalized: 'AB123CD', platform_normalized: 'KEPLER_1' }),
      mov({ plate_normalized: 'EF456GH', platform_normalized: 'KEPLER_2' }),
    ])
    expect(map.get('AB123CD')).toBe('R3')
    expect(map.get('EF456GH')).toBe('R4')
  })

  it('ignora plataformas fuera del destino S7/S8 (p. ej. Volcable)', () => {
    const map = buildS7S8CircuitByPlate([
      mov({ plate_normalized: 'XX000XX', platform_normalized: 'VOLCABLE_1' }),
    ])
    expect(map.has('XX000XX')).toBe(false)
  })

  it('ante varias plataformas para la misma patente, gana la más frecuente', () => {
    const map = buildS7S8CircuitByPlate([
      mov({ plate_normalized: 'AB123CD', platform_normalized: 'KEPLER_1' }),
      mov({ plate_normalized: 'AB123CD', platform_normalized: 'KEPLER_1' }),
      mov({ plate_normalized: 'AB123CD', platform_normalized: 'KEPLER_2' }),
    ])
    expect(map.get('AB123CD')).toBe('R3')
  })

  it('reconcilia RS_REC que pasó por DESCARGA_S7 al R-code del Excel', () => {
    const map = new Map([['AB123CD', 'R3']])
    const code = resolveS7S8ExcelFirstCircuitCode({
      currentExecutiveCode: 'RS_REC',
      logicalCodes: ['INGRESO', 'CALADA', 'BALANZA_INGRESO', 'DESCARGA_S7', 'BALANZA_EGRESO'],
      plate: 'AB123CD',
      circuitByPlate: map,
    })
    expect(code).toBe('R3')
  })

  it('no toca un recorrido que ya tiene R-code real', () => {
    const map = new Map([['AB123CD', 'R3']])
    const code = resolveS7S8ExcelFirstCircuitCode({
      currentExecutiveCode: 'R9',
      logicalCodes: ['INGRESO', 'DESCARGA_S7'],
      plate: 'AB123CD',
      circuitByPlate: map,
    })
    expect(code).toBeNull()
  })

  it('no reconcilia si no pasó por S7/S8', () => {
    const map = new Map([['AB123CD', 'R3']])
    const code = resolveS7S8ExcelFirstCircuitCode({
      currentExecutiveCode: 'RS_REC',
      logicalCodes: ['INGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO'],
      plate: 'AB123CD',
      circuitByPlate: map,
    })
    expect(code).toBeNull()
  })

  it('sin Excel para la patente, no adivina (queda como estaba)', () => {
    const code = resolveS7S8ExcelFirstCircuitCode({
      currentExecutiveCode: 'RS_REC',
      logicalCodes: ['DESCARGA_S7'],
      plate: 'ZZ999ZZ',
      circuitByPlate: new Map(),
    })
    expect(code).toBeNull()
  })

  it('cubre los puntos S7/S8 y los circuitos destino esperados', () => {
    expect([...S7S8_GATE_POINTS].sort()).toEqual(['CARGA_S7', 'CARGA_S8', 'DESCARGA_S7'])
    expect(S7S8_TARGET_CIRCUITS.has('R3')).toBe(true)
    expect(S7S8_TARGET_CIRCUITS.has('R12')).toBe(true)
    expect(S7S8_TARGET_CIRCUITS.has('R5')).toBe(false)
  })
})
