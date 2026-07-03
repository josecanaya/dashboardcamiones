import { describe, expect, it } from 'vitest'
import {
  buildStableExcelOperationId,
  isPlaceholderExcelOperationId,
  isValidExcelCtg,
  resolveCommitteeExcelOperationId,
} from './excelStableOperationId'

describe('excelStableOperationId', () => {
  it('CTG 0 no es válido', () => {
    expect(isValidExcelCtg('0')).toBe(false)
    expect(isValidExcelCtg('0000')).toBe(false)
    expect(isValidExcelCtg('')).toBe(false)
    expect(isValidExcelCtg('12345')).toBe(true)
  })

  it('detecta placeholder CTG_0', () => {
    expect(isPlaceholderExcelOperationId('CTG_0')).toBe(true)
    expect(isPlaceholderExcelOperationId('CTG_000')).toBe(true)
    expect(isPlaceholderExcelOperationId('CTG_99')).toBe(false)
  })

  it('dos filas ACEITE_OSL con CTG=0 generan IDs distintos', () => {
    const base = {
      ctg: '0',
      platform_normalized: 'ACEITE_OSL',
      product_normalized: 'ACEITE GIRASOL',
      source_date: '2026-06-01',
    }
    const a = buildStableExcelOperationId({
      ...base,
      external_operation_id: 'CTG_0',
      plate_normalized: 'AAA111',
      ingreso_id: '1001',
      comprob: '10',
      row_index: 0,
    })
    const b = buildStableExcelOperationId({
      ...base,
      external_operation_id: 'CTG_0',
      plate_normalized: 'BBB222',
      ingreso_id: '1002',
      comprob: '11',
      row_index: 1,
    })
    expect(a).not.toBe(b)
    expect(a).not.toBe('CTG_0')
    expect(b).not.toBe('CTG_0')
  })

  it('CTG válido sigue usando CTG_', () => {
    expect(
      buildStableExcelOperationId({
        ctg: '10132837785',
        plate_normalized: 'X',
      })
    ).toBe('CTG_10132837785')
  })

  it('resolveCommitteeExcelOperationId desde fila CSV', () => {
    const id = resolveCommitteeExcelOperationId(
      {
        external_operation_id: 'CTG_0',
        ctg: '0',
        platform_normalized: 'ACEITE_OSL',
        plate_normalized: 'GFL685',
        comprob: '77',
        ingreso_id: '555',
        source_date: '2026-06-28',
      },
      3
    )
    expect(id).toBe('COMPROB_77')
  })
})
