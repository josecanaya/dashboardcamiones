import { describe, expect, it } from 'vitest'
import {
  buildExcelMovimientosUniverse,
  isR7TerminalPortVolcableMovimiento,
  isR5Volcable1RicardoneMovimiento,
  isR6Volcable2RicardoneMovimiento,
  isR1Celda16Movimiento,
  isPostTransformScatterCsvHeader,
  computeExcelPeriodTotals,
  classifyRawAuditCircuit,
} from './auditExcelMovimientosSource'

describe('auditExcelMovimientosSource', () => {
  it('R7 solo volcables PTO 1-5', () => {
    expect(
      isR7TerminalPortVolcableMovimiento({
        platform_normalized: 'VOLCABLE_PTO_3',
        plataforma_original: 'Volcable PTO 3',
        planta_normalized: 'TERMINAL_EMBARQUE',
      })
    ).toBe(true)
    expect(
      isR5Volcable1RicardoneMovimiento({
        platform_normalized: 'VOLCABLE_1',
        plataforma_original: 'Volcable 1',
        planta_normalized: 'SAN_LORENZO',
        planta_original: 'Planta San Lorenzo',
      })
    ).toBe(true)
    expect(
      isR7TerminalPortVolcableMovimiento({
        platform_normalized: 'VOLCABLE_1',
        plataforma_original: 'Volcable 1',
        planta_normalized: 'RICARDONE',
      })
    ).toBe(false)
  })

  it('R1 Celda 16 con planta San Lorenzo mal rotulada', () => {
    expect(
      isR1Celda16Movimiento({
        platform_normalized: 'CELDA_16',
        plataforma_original: 'Celda 16',
        planta_normalized: 'SAN_LORENZO',
        planta_original: 'San Lorenzo',
      })
    ).toBe(true)
  })

  it('R6 volcable 2 Ricardone', () => {
    expect(
      classifyRawAuditCircuit({
        platform_normalized: 'VOLCABLE_2',
        plataforma_original: 'Volcable 2',
        planta_normalized: 'SAN_LORENZO',
        planta_original: 'San Lorenzo',
      })
    ).toBe('R6')
    expect(
      isR6Volcable2RicardoneMovimiento({
        platform_normalized: 'VOLCABLE_2',
        plataforma_original: 'Volcable 2',
        planta_normalized: 'SAN_LORENZO',
      })
    ).toBe(true)
  })

  it('detecta scatter post-transform', () => {
    expect(
      isPostTransformScatterCsvHeader(['external_operation_id', 'segment_from', 'resolved_executive_circuit_code'])
    ).toBe(true)
  })

  it('share totals en período', () => {
    const totals = computeExcelPeriodTotals(
      [
        {
          external_operation_id: 'CTG_1',
          ctg: '1',
          plate_normalized: 'AA111BB',
          platform_normalized: 'VOLCABLE_PTO_1',
          external_salida_at: '2026-06-12T14:00:00',
        },
        {
          external_operation_id: 'CTG_2',
          ctg: '2',
          plate_normalized: 'BB222CC',
          platform_normalized: 'VOLCABLE_1',
          external_salida_at: '2026-06-12T15:00:00',
        },
      ],
      '2026-06-12',
      '2026-06-18'
    )
    expect(totals.totalRowsInRange).toBe(2)
    expect(totals.uniqueCtgsByCircuit.R7).toBe(1)
    expect(totals.uniqueCtgsByCircuit.R5).toBe(1)
  })

  it('deduplica por CTG en universo R7', () => {
    const universe = buildExcelMovimientosUniverse(
      [
        {
          external_operation_id: 'CTG_100',
          ctg: '100',
          plate_normalized: 'AA111BB',
          platform_normalized: 'VOLCABLE_PTO_1',
          external_ingreso_at: '2026-06-12T08:00:00',
          external_salida_at: '2026-06-12T14:00:00',
        },
        {
          external_operation_id: 'CTG_100',
          ctg: '100',
          plate_normalized: 'AA111BB',
          platform_normalized: 'VOLCABLE_PTO_1',
          external_ingreso_at: '2026-06-12T08:00:00',
          external_salida_at: '2026-06-12T14:00:00',
        },
      ],
      'R7',
      { fromDay: '2026-06-12', toDay: '2026-06-18' }
    )
    expect(universe).toHaveLength(1)
  })
})
