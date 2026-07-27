import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { DEFAULT_CIRCUIT_MATRIX, expectedCircuitTemplateLength } from './finalCircuitScoring'

/**
 * Candado de la deduplicación B1: `expectedCircuitTemplateLength` pasó de un switch con
 * longitudes escritas a mano a derivarlas de `DEFAULT_CIRCUIT_MATRIX`.
 *
 * La tabla de abajo es el switch ORIGINAL, verbatim. Si algo acá se rompe, la derivación
 * cambió el comportamiento del scoring.
 */
const SWITCH_ORIGINAL: Record<string, number> = {
  CIRCUITO_CELDA16_DESCARGA: 7,
  CIRCUITO_CELDA16_CARGA: 7,
  CIRCUITO_VOLCABLE_1_2: 7,
  CIRCUITO_LIQUIDO: 6,
  CIRCUITO_SAN_LORENZO: 4,
  DESPACHO_SIN_PUNTO_INSTRUMENTADO: 6,
  TRANSILE_VOLCABLE_BALANZA: 2,
}

const journey = (code: string, variant = ''): ReconstructedRealJourney =>
  ({ preliminaryCircuitCode: code, preliminaryCircuitVariant: variant }) as unknown as ReconstructedRealJourney

describe('expectedCircuitTemplateLength (derivado de DEFAULT_CIRCUIT_MATRIX)', () => {
  for (const [code, expected] of Object.entries(SWITCH_ORIGINAL)) {
    it(`${code} → ${expected} (igual que el switch original)`, () => {
      expect(expectedCircuitTemplateLength(journey(code))).toBe(expected)
    })
  }

  it('la variante TRANSILE_VOLCABLE_BALANZA gana sobre el código', () => {
    expect(expectedCircuitTemplateLength(journey('CIRCUITO_VOLCABLE_1_2', 'TRANSILE_VOLCABLE_BALANZA'))).toBe(2)
  })

  it('código desconocido → 0', () => {
    expect(expectedCircuitTemplateLength(journey('NO_EXISTE'))).toBe(0)
    expect(expectedCircuitTemplateLength(journey(''))).toBe(0)
  })

  it('códigos con fila en la matriz pero fuera del scoring siguen dando 0', () => {
    // Extensiones RIC↔SL y Kepler: tienen plantilla, pero el switch original nunca las puntuó.
    for (const code of ['CIRCUITO_R7_MIXTO', 'CIRCUITO_SL_RECEPCION', 'CIRCUITO_KEPLER_SILOS']) {
      expect(DEFAULT_CIRCUIT_MATRIX[code]?.length ?? 0).toBeGreaterThan(0)
      expect(expectedCircuitTemplateLength(journey(code))).toBe(0)
    }
  })

  it('TODAS las longitudes salen de la matriz: ya no hay overrides', () => {
    for (const [code, expected] of Object.entries(SWITCH_ORIGINAL)) {
      expect(DEFAULT_CIRCUIT_MATRIX[code], code).toHaveLength(expected)
    }
  })

  it('CIRCUITO_LIQUIDO cierra en EGRESO (6 puntos, unificado con R8 del catálogo)', () => {
    expect(DEFAULT_CIRCUIT_MATRIX.CIRCUITO_LIQUIDO).toEqual([
      'INGRESO',
      'PREINGRESO',
      'LIQUIDO',
      'BALANZA_INGRESO',
      'BALANZA_EGRESO',
      'EGRESO',
    ])
    expect(expectedCircuitTemplateLength(journey('CIRCUITO_LIQUIDO'))).toBe(6)
  })
})
