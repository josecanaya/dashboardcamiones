import { describe, expect, it } from 'vitest'
import { CIRCUIT_CATALOG, toExecutiveCircuitConfig } from './circuitCatalog'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../../features/real-truckflow/etlWorkbench/finalCircuitScoring'

function seqEqual(
  a: readonly (readonly string[])[] | readonly string[] | undefined,
  b: readonly (readonly string[])[] | readonly string[] | undefined
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Divergencias EXPLICITAMENTE aprobadas (usuario 2026-07-13):
 * - R26/R27 redefinidos a producto (soja/girasol); aliases C16↔SL consolidan en R26.
 * - Altas R28 / R30 / R31 / R32 (no existían en la matriz ejecutiva previa a 3.2).
 */
const APPROVED_CATALOG_ONLY_CODES = new Set(['R28', 'R30', 'R31', 'R32'])

describe('circuitCatalog paridad vs EXECUTIVE_CIRCUIT_MATRIX', () => {
  it('códigos de matriz están en catálogo; altas R28/R30-32 solo en catálogo+matriz post-3.2', () => {
    for (const code of Object.keys(EXECUTIVE_CIRCUIT_MATRIX)) {
      expect(CIRCUIT_CATALOG[code], `falta ${code} en CIRCUIT_CATALOG`).toBeDefined()
    }
    for (const code of APPROVED_CATALOG_ONLY_CODES) {
      expect(CIRCUIT_CATALOG[code]).toBeDefined()
      expect(EXECUTIVE_CIRCUIT_MATRIX[code]).toBeDefined()
    }
  })

  it('mantiene coveragePercent, hasStrongPoint, enabled, aliases y secuencias (post-3.2 alineados)', () => {
    for (const code of Object.keys(EXECUTIVE_CIRCUIT_MATRIX)) {
      const matrix = EXECUTIVE_CIRCUIT_MATRIX[code]!
      const catalog = CIRCUIT_CATALOG[code]!
      const projected = toExecutiveCircuitConfig(catalog)
      expect(projected.code).toBe(matrix.code)
      expect(projected.label).toBe(matrix.label)
      expect(projected.coveragePercent).toBe(matrix.coveragePercent)
      expect(projected.hasStrongPoint).toBe(matrix.hasStrongPoint)
      expect(projected.enabledForClassification).toBe(matrix.enabledForClassification)
      expect([...(projected.aliases ?? [])].sort()).toEqual([...(matrix.aliases ?? [])].sort())
      expect(seqEqual(projected.baseSequence, matrix.baseSequence), `${code} baseSequence`).toBe(true)
      expect(seqEqual(projected.allowedSequences, matrix.allowedSequences), `${code} allowedSequences`).toBe(
        true
      )
    }
  })

  it('R26=soja Celda16; R30-32=pellet; R27/R28=girasol', () => {
    expect(CIRCUIT_CATALOG.R26?.product).toBe('SOJA')
    expect(CIRCUIT_CATALOG.R27?.product).toBe('GIRASOL')
    expect(CIRCUIT_CATALOG.R28?.product).toBe('GIRASOL')
    expect(CIRCUIT_CATALOG.R30?.product).toBe('PELLET')
    expect(CIRCUIT_CATALOG.R31?.product).toBe('PELLET')
    expect(CIRCUIT_CATALOG.R32?.product).toBe('PELLET')
  })
})
