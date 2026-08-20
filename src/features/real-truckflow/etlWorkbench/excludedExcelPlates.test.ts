import { describe, expect, it } from 'vitest'
import { EXCLUDED_EXCEL_PLATES, isExcludedExcelPlate } from './excludedExcelPlates'

describe('excludedExcelPlates', () => {
  it('excluye las patentes de la lista fija', () => {
    expect(isExcludedExcelPlate('XXXXXX')).toBe(true)
    expect(isExcludedExcelPlate('PPPPPP')).toBe(true)
    expect(isExcludedExcelPlate('TTTTTT')).toBe(true)
  })

  it('es tolerante a mayúsculas, espacios y guiones', () => {
    expect(isExcludedExcelPlate('  xxxxxx ')).toBe(true)
    expect(isExcludedExcelPlate('X-X-X-X-X-X')).toBe(true)
  })

  it('no excluye patentes fuera de la lista', () => {
    expect(isExcludedExcelPlate('AB123CD')).toBe(false)
    expect(isExcludedExcelPlate('ABC123')).toBe(false)
  })

  it('vacío / nulo no se excluye', () => {
    expect(isExcludedExcelPlate('')).toBe(false)
    expect(isExcludedExcelPlate(null)).toBe(false)
    expect(isExcludedExcelPlate(undefined)).toBe(false)
  })

  it('el set expuesto contiene las 3 patentes normalizadas', () => {
    expect(EXCLUDED_EXCEL_PLATES.size).toBe(3)
    expect(EXCLUDED_EXCEL_PLATES.has('XXXXXX')).toBe(true)
  })
})
