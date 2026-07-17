import { describe, expect, it } from 'vitest'
import {
  combineDateTime,
  formatIsoLocal,
  inferSourceDateFromFileName,
  normalizePlatform,
  normalizePlant,
  tryMonthDaySwapCorrection,
} from './externalNormalization'
import { normalizeMovimientoContrato } from '../../features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato'
import {
  COMMITTEE_CONCILIATION_CSV_KEYS,
  EXCEL_FIRST_PANEL_CSV_KEYS,
  buildExcelPeriodContext,
} from '../../features/real-truckflow/etlWorkbench/etlExcelFirstMerge'

describe('combineDateTime Argentina dd/mm/yyyy', () => {
  it('"01/06/2026" + "00:04" -> junio 1, no enero 6', () => {
    const { at, warning } = combineDateTime('01/06/2026', '00:04')
    expect(at).not.toBeNull()
    expect(formatIsoLocal(at)).toBe('2026-06-01T00:04:00')
    expect(warning).toBeUndefined()
  })

  it('"02/06/2026" + "10:15" -> junio 2, no febrero 6', () => {
    const { at } = combineDateTime('02/06/2026', '10:15')
    expect(formatIsoLocal(at)).toBe('2026-06-02T10:15:00')
  })

  it('"29/05/2026" + "18:43" -> mayo 29', () => {
    const { at } = combineDateTime('29/05/2026', '18:43')
    expect(formatIsoLocal(at)).toBe('2026-05-29T18:43:00')
  })

  it('"31/05/2026" + "23:56" -> mayo 31', () => {
    const { at } = combineDateTime('31/05/2026', '23:56')
    expect(formatIsoLocal(at)).toBe('2026-05-31T23:56:00')
  })

  it('formato dd-mm-yyyy', () => {
    const { at } = combineDateTime('01-06-2026', '07:30')
    expect(formatIsoLocal(at)).toBe('2026-06-01T07:30:00')
  })

  it('ISO yyyy-mm-dd', () => {
    const { at } = combineDateTime('2026-06-01', '12:00')
    expect(formatIsoLocal(at)).toBe('2026-06-01T12:00:00')
  })

  it('hora decimal Excel', () => {
    const serialTime = (4 * 60 + 30) / (24 * 60) // 04:30
    const { at } = combineDateTime('01/06/2026', serialTime)
    expect(formatIsoLocal(at)).toBe('2026-06-01T04:30:00')
  })

  it('hora HH:mm:ss', () => {
    const { at } = combineDateTime('02/06/2026', '07:30:15')
    expect(formatIsoLocal(at)).toBe('2026-06-02T07:30:15')
  })

  it('con source_date 2026-06-01 alinea ingreso de 01/06/2026', () => {
    const { at, warning } = combineDateTime('01/06/2026', '00:04', '2026-06-01')
    expect(formatIsoLocal(at)).toBe('2026-06-01T00:04:00')
    expect(warning).not.toBe('DATE_SOURCE_MISMATCH')
  })

  it('con source_date 2026-06-02 alinea ingreso de 02/06/2026', () => {
    const { at, warning } = combineDateTime('02/06/2026', '10:15', '2026-06-02')
    expect(formatIsoLocal(at)).toBe('2026-06-02T10:15:00')
    expect(warning).not.toBe('DATE_SOURCE_MISMATCH')
  })

  it('Date object nativo', () => {
    const d = new Date(2026, 5, 1, 0, 0, 0)
    const { at } = combineDateTime(d, '08:00')
    expect(formatIsoLocal(at)).toBe('2026-06-01T08:00:00')
  })

  it('Fecha Sal = "01/06/2026" + "00:00" -> 2026-06-01T00:00:00', () => {
    const { at } = combineDateTime('01/06/2026', '00:00')
    expect(formatIsoLocal(at)).toBe('2026-06-01T00:00:00')
  })

  it('Fecha Sal = "02/06/2026" + "00:00" -> 2026-06-02T00:00:00', () => {
    const { at } = combineDateTime('02/06/2026', '00:00')
    expect(formatIsoLocal(at)).toBe('2026-06-02T00:00:00')
  })

  it('ISO mal leído 2026-01-06 + source_date 2026-06-01 se corrige', () => {
    const { at, warning } = combineDateTime('2026-01-06', '00:00', '2026-06-01')
    expect(formatIsoLocal(at)).toBe('2026-06-01T00:00:00')
    expect(warning).toBe('DATE_DAY_FIRST_CORRECTED')
  })

  it('ISO mal leído 2026-02-06 + source_date 2026-06-02 se corrige', () => {
    const { at, warning } = combineDateTime('2026-02-06', '00:00', '2026-06-02')
    expect(formatIsoLocal(at)).toBe('2026-06-02T00:00:00')
    expect(warning).toBe('DATE_DAY_FIRST_CORRECTED')
  })

  it('Date mm/dd invertido + source_date 2026-06-01 no devuelve enero', () => {
    const wrong = new Date(2026, 0, 6, 0, 0, 0)
    const { at, warning } = combineDateTime(wrong, '00:00', '2026-06-01')
    expect(formatIsoLocal(at)).toBe('2026-06-01T00:00:00')
    expect(warning).toBe('DATE_DAY_FIRST_CORRECTED')
  })
})

describe('normalizeMovimientoContrato fechas', () => {
  it('normaliza ingreso junio con source_date del archivo', () => {
    const row = normalizeMovimientoContrato(
      {
        patente: 'AA123BB',
        producto: 'SOJA',
        fecha_ing: '01/06/2026',
        hora_ing: '00:04',
        fecha_sal: '01/06/2026',
        hora_sal: '01:00',
      },
      'MovimientosPorContrato_20260601.xlsx',
      '2026-06-01'
    )
    expect(row.external_ingreso_at).toBe('2026-06-01T00:04:00')
    expect(row.external_salida_at).toBe('2026-06-01T01:00:00')
    expect(row.normalization_warnings).not.toContain('ingreso:DATE_SOURCE_MISMATCH')
  })

  it('source_date 2026-06-01 + fecha original 01/06/2026 no devuelve 2026-01-06 en salida', () => {
    const row = normalizeMovimientoContrato(
      {
        patente: 'AA123BB',
        producto: 'SOJA',
        fecha_ing: '01/06/2026',
        hora_ing: '08:00',
        fecha_sal: '01/06/2026',
        hora_sal: '00:00',
      },
      'MovimientosPorContrato_20260601.xlsx',
      '2026-06-01'
    )
    expect(row.external_salida_at).toBe('2026-06-01T00:00:00')
    expect(row.external_salida_at).not.toBe('2026-01-06T00:00:00')
  })

  it('corrige ISO invertido en fecha_sal cuando XLSX entrega yyyy-mm-dd mal', () => {
    const row = normalizeMovimientoContrato(
      {
        patente: 'AA123BB',
        producto: 'SOJA',
        fecha_ing: '2026-06-01',
        hora_ing: '08:00',
        fecha_sal: '2026-01-06',
        hora_sal: '00:00',
      },
      'MovimientosPorContrato_20260601.xlsx',
      '2026-06-01'
    )
    expect(row.external_salida_at).toBe('2026-06-01T00:00:00')
    expect(row.normalization_warnings).toContain('salida:DATE_DAY_FIRST_CORRECTED')
  })
})

describe('excel_first_merge_summary fechas', () => {
  it('excel_min_ingreso_at queda en rango source_date tras normalizar dd/mm', () => {
    const rows = [
      normalizeMovimientoContrato(
        { patente: 'A', producto: 'SOJA', fecha_ing: '29/05/2026', hora_ing: '10:00', fecha_sal: '29/05/2026', hora_sal: '11:00' },
        'MovimientosPorContrato_20260529.xlsx',
        '2026-05-29'
      ),
      normalizeMovimientoContrato(
        { patente: 'B', producto: 'SOJA', fecha_ing: '01/06/2026', hora_ing: '10:00', fecha_sal: '01/06/2026', hora_sal: '11:00' },
        'MovimientosPorContrato_20260601.xlsx',
        '2026-06-01'
      ),
    ]
    const period = buildExcelPeriodContext(rows, [])
    expect(period.excel_min_ingreso_at.slice(0, 10)).not.toMatch(/^2026-01-/)
    expect(period.excel_min_ingreso_at.slice(0, 10)).not.toMatch(/^2026-02-/)
    expect(period.excel_min_ingreso_at.slice(0, 10) >= '2026-05-29').toBe(true)
    expect(period.excel_max_salida_at.slice(0, 10) <= '2026-06-02').toBe(true)
  })
})

describe('datasets Excel-first vs comité', () => {
  it('panel Excel-first no usa CSV de conciliación comité', () => {
    for (const k of EXCEL_FIRST_PANEL_CSV_KEYS) {
      expect(COMMITTEE_CONCILIATION_CSV_KEYS).not.toContain(k)
    }
    expect(EXCEL_FIRST_PANEL_CSV_KEYS).toContain('excel_operations_with_truckflow')
    expect(EXCEL_FIRST_PANEL_CSV_KEYS).toContain('excel_operation_segments_for_scatter')
  })
})

describe('tryMonthDaySwapCorrection', () => {
  it('intercambia 2026-01-06 a 2026-06-01 con source_date', () => {
    const at = new Date(2026, 0, 6, 0, 0, 0)
    const r = tryMonthDaySwapCorrection(at, '2026-06-01')
    expect(r?.corrected).toBe(true)
    expect(formatIsoLocal(r!.at)).toBe('2026-06-01T00:00:00')
  })
})

describe('inferSourceDateFromFileName', () => {
  it('extrae yyyy-mm-dd del nombre', () => {
    expect(inferSourceDateFromFileName('MovimientosPorContrato_20260602.xlsx')).toBe('2026-06-02')
  })
})

describe('normalizePlatform aceite', () => {
  it('normaliza variantes OSL y PTO', () => {
    expect(normalizePlatform('ACEITE OSL').platform_normalized).toBe('ACEITE_OSL')
    expect(normalizePlatform('ACEITEOSL').platform_normalized).toBe('ACEITE_OSL')
    expect(normalizePlatform('ACEITE PTO').platform_normalized).toBe('ACEITE_PTO')
    expect(normalizePlatform('ACEITEPTO').platform_normalized).toBe('ACEITE_PTO')
    expect(normalizePlatform('ACEITE').platform_normalized).toBe('ACEITE')
  })
})

describe('normalizePlant convención Excel', () => {
  it('San Lorenzo = terminal de embarque; Planta San Lorenzo = Ricardone', () => {
    expect(normalizePlant('SAN LORENZO').planta_normalized).toBe('TERMINAL_EMBARQUE')
    expect(normalizePlant('San Lorenzo').planta_normalized).toBe('TERMINAL_EMBARQUE')
    expect(normalizePlant('TERMINAL DE EMBARQUE').planta_normalized).toBe('TERMINAL_EMBARQUE')
    expect(normalizePlant('PLANTA SAN LORENZO').planta_normalized).toBe('RICARDONE')
    expect(normalizePlant('Planta San Lorenzo').planta_normalized).toBe('RICARDONE')
    expect(normalizePlant('RICARDONE').planta_normalized).toBe('RICARDONE')
  })

  it('Planta Avellaneda y Renopack se normalizan (fuera de análisis aceite)', () => {
    expect(normalizePlant('Planta AVELLANEDA').planta_normalized).toBe('AVELLANEDA')
    expect(normalizePlant('AVELLANEDA').planta_normalized).toBe('AVELLANEDA')
    expect(normalizePlant('RENOPACK').planta_normalized).toBe('RENOPACK')
    expect(normalizePlant('PLANTA RENOPACK').planta_normalized).toBe('RENOPACK')
  })
})
