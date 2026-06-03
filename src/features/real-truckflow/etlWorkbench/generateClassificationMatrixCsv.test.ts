import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CLASSIFICATION_MATRIX_CANONICAL_ORDER,
  classifyLogicalSequence,
  generateAllClassificationMatrixRows,
  writeClassificationMatrixCsv,
} from './generateClassificationMatrixCsv'

describe('generateClassificationMatrixCsv', () => {
  it('R7 calada + SL ingreso sin egreso => COMPLETOS', () => {
    const row = classifyLogicalSequence(['INGRESO', 'PREINGRESO', 'CALADA', 'SL_INGRESO'])
    expect(row.executive_circuit_code).toBe('R7')
    expect(row.committee_group).toBe('COMPLETOS')
    expect(['RUTA_RIC_SAN_LORENZO_COMPLETA', 'RUTA_RIC_SAN_LORENZO_DEDUCIDA']).toContain(row.committee_reason)
  })

  it('genera todas las subsecuencias >=3 eventos', { timeout: 120_000 }, () => {
    const n = CLASSIFICATION_MATRIX_CANONICAL_ORDER.length
    let expected = 0
    for (let k = 3; k <= n; k++) {
      let c = 1
      for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1)
      expected += c
    }
    const rows = generateAllClassificationMatrixRows(3)
    expect(rows.length).toBe(expected)
  })

  it('escribe CSV en raíz del proyecto', { timeout: 120_000 }, () => {
    const out = resolve(process.cwd(), 'ETL_CLASSIFICATION_MATRIX.csv')
    const { path, rowCount } = writeClassificationMatrixCsv(out, 3)
    expect(path).toBe(out)
    expect(rowCount).toBeGreaterThan(1000)
    expect(existsSync(out)).toBe(true)
    const text = readFileSync(out, 'utf8')
    expect(text).toContain('logical_sequence')
    expect(text).toContain('committee_group')
    expect(text).toContain('INGRESO>PREINGRESO>CALADA>SL_INGRESO')
  })
})
