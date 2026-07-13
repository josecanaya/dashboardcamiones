import { describe, expect, it } from 'vitest'
import { CIRCUIT_CATALOG, toExecutiveCircuitConfig } from './circuitCatalog'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../../features/real-truckflow/etlWorkbench/finalCircuitScoring'

function seqEqual(
  a: readonly (readonly string[])[] | readonly string[] | undefined,
  b: readonly (readonly string[])[] | readonly string[] | undefined
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

describe('circuitCatalog paridad vs EXECUTIVE_CIRCUIT_MATRIX (3.1)', () => {
  it('cubre exactamente los mismos códigos', () => {
    const matrixCodes = Object.keys(EXECUTIVE_CIRCUIT_MATRIX).sort()
    const catalogCodes = Object.keys(CIRCUIT_CATALOG).sort()
    expect(catalogCodes).toEqual(matrixCodes)
  })

  it('mantiene coveragePercent, hasStrongPoint, enabledForClassification, aliases y secuencias', () => {
    for (const code of Object.keys(EXECUTIVE_CIRCUIT_MATRIX)) {
      const matrix = EXECUTIVE_CIRCUIT_MATRIX[code]!
      const catalog = CIRCUIT_CATALOG[code]
      expect(catalog, `falta ${code} en CIRCUIT_CATALOG`).toBeDefined()
      const projected = toExecutiveCircuitConfig(catalog!)
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
})
