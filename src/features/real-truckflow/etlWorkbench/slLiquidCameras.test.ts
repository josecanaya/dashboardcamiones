import { describe, expect, it } from 'vitest'
import {
  hasRenovaObservation,
  inferAceiteExecutiveCircuitFromExcel,
  inferAceiteExecutiveCircuitFromPlatform,
} from './slLiquidCameras'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import { normalizePlatform, normalizePlant } from './etlExternalNormalization'

/** Convención Excel: “San Lorenzo” = terminal; “Planta San Lorenzo” = Ricardone. */
const EXCEL_TERMINAL = () => normalizePlant('SAN LORENZO').planta_normalized!
const EXCEL_RICARDONE = () => normalizePlant('PLANTA SAN LORENZO').planta_normalized!

describe('convención Excel plantas (aceite)', () => {
  it('San Lorenzo → TERMINAL_EMBARQUE; Planta San Lorenzo → RICARDONE', () => {
    expect(normalizePlant('SAN LORENZO').planta_normalized).toBe('TERMINAL_EMBARQUE')
    expect(normalizePlant('Planta San Lorenzo').planta_normalized).toBe('RICARDONE')
    expect(normalizePlant('TERMINAL DE EMBARQUE').planta_normalized).toBe('TERMINAL_EMBARQUE')
  })
})

describe('hasRenovaObservation', () => {
  it('detecta variantes de texto RENOVA', () => {
    expect(hasRenovaObservation('RENOVA')).toBe(true)
    expect(hasRenovaObservation('Renova / aceite')).toBe(true)
    expect(hasRenovaObservation('OBS RENOVA')).toBe(true)
    expect(hasRenovaObservation('sin marca')).toBe(false)
  })
})

describe('inferAceiteExecutiveCircuitFromPlatform', () => {
  it('plataforma ACEITE devuelve R8', () => {
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITE', 'ACEITE', EXCEL_RICARDONE())).toBe('R8')
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITE', 'ACEITE', EXCEL_TERMINAL())).toBe('R8')
  })

  it('plataformas PTO devuelven SL2', () => {
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITE_PTO', 'ACEITE PTO', EXCEL_TERMINAL())).toBe('SL2')
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITEPTO', 'ACEITEPTO', EXCEL_TERMINAL())).toBe('SL2')
  })

  it('plataformas OSL devuelven SL1', () => {
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITE_OSL', 'ACEITE OSL', EXCEL_RICARDONE())).toBe('SL1')
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITEOSL', 'ACEITEOSL', EXCEL_RICARDONE())).toBe('SL1')
    expect(inferAceiteExecutiveCircuitFromPlatform('ACEITE_OSL', 'ACEITE OSL', EXCEL_TERMINAL())).toBe('SL1')
  })
})

describe('inferAceiteExecutiveCircuitFromExcel', () => {
  it('plataforma vacía + observación RENOVA devuelve SL3 (planta Excel San Lorenzo)', () => {
    expect(
      inferAceiteExecutiveCircuitFromExcel('', '', EXCEL_TERMINAL(), 'Descarga RENOVA sector', '')
    ).toBe('SL3')
    expect(
      inferAceiteExecutiveCircuitFromExcel('', '', EXCEL_TERMINAL(), 'Destino Renova', '')
    ).toBe('SL3')
  })

  it('ACEITE_OSL + observación RENOVA permanece SL1', () => {
    expect(
      inferAceiteExecutiveCircuitFromExcel(
        'ACEITE_OSL',
        'ACEITE OSL',
        EXCEL_TERMINAL(),
        'RENOVA en obs',
        ''
      )
    ).toBe('SL1')
  })

  it('ACEITE_PTO + observación RENOVA permanece SL2', () => {
    expect(
      inferAceiteExecutiveCircuitFromExcel(
        'ACEITE_PTO',
        'ACEITE PTO',
        EXCEL_TERMINAL(),
        'playa RENOVA',
        ''
      )
    ).toBe('SL2')
  })

  it('plataforma vacía sin RENOVA no devuelve SL3', () => {
    expect(inferAceiteExecutiveCircuitFromExcel('', '', EXCEL_TERMINAL(), 'sin marca', '')).toBeNull()
  })

  it('producto aceite con plataforma vacía y sin RENOVA no se fuerza a SL3', () => {
    expect(
      inferAceiteExecutiveCircuitFromExcel('', '', EXCEL_TERMINAL(), 'sin marca', '', 'ACEITE GIRASOL')
    ).toBeNull()
  })

  it('plataforma ACEITE (genérica) devuelve R8 aunque la observación diga RENOVA', () => {
    expect(
      inferAceiteExecutiveCircuitFromExcel('ACEITE', 'ACEITE', EXCEL_TERMINAL(), 'destino RENOVA', '')
    ).toBe('R8')
  })
})

describe('aceite vs soja / R7 sólido', () => {
  it('producto soja no se infiere como aceite por plataforma volcable', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'VOLCABLE_PTO_1',
        plataforma_original: 'VOLCABLE PTO 1',
        planta_normalized: EXCEL_RICARDONE(),
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
        observaciones: '',
        observacion_calidad: '',
      })?.circuit_code
    ).toBe('R7')
  })

  it('R7 sólido se mantiene cuando Excel no indica aceite', () => {
    const norm = normalizePlatform('VOLCABLE 1')
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: norm.platform_normalized!,
        plataforma_original: 'VOLCABLE 1',
        planta_normalized: EXCEL_RICARDONE(),
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
        observaciones: '',
        observacion_calidad: '',
      })?.circuit_code
    ).toBe('R5')
  })
})
