import { describe, expect, it } from 'vitest'
import {
  buildLiquidMovementsReport,
  classifyRicCalLiqCohort,
  executiveCircuitForExcelOperation,
} from './liquidMovementsWorkbench'
import { isPermittedAceiteLiquidDischargePlatform, isSlLiquidCircuit } from './slLiquidCameras'
import type { ExcelOperationWithTruckflowRow } from './etlExcelFirstMerge'

function op(partial: Partial<ExcelOperationWithTruckflowRow>): ExcelOperationWithTruckflowRow {
  return partial as ExcelOperationWithTruckflowRow
}

describe('isPermittedAceiteLiquidDischargePlatform', () => {
  it('acepta ACEITE OSL, PTO y ACEITE', () => {
    expect(isPermittedAceiteLiquidDischargePlatform('ACEITE_OSL', 'ACEITE OSL')).toBe(true)
    expect(isPermittedAceiteLiquidDischargePlatform('ACEITE_PTO', 'ACEITE PTO')).toBe(true)
    expect(isPermittedAceiteLiquidDischargePlatform('ACEITE', 'ACEITE')).toBe(true)
    expect(isPermittedAceiteLiquidDischargePlatform('VOLCABLE_1', 'VOLCABLE 1')).toBe(false)
  })
})

describe('classifyRicCalLiqCohort', () => {
  it('SL1 va a cohorte san lorenzo', () => {
    expect(
      classifyRicCalLiqCohort({
        executiveCircuit: 'SL1',
        product: 'ACEITE',
        platform: 'ACEITE_OSL',
        devices: new Set(['RenDescFte']),
      })
    ).toBe('sl_liquido_san_lorenzo')
  })

  it('R8 recepción líquido', () => {
    expect(
      classifyRicCalLiqCohort({
        executiveCircuit: 'R8',
        product: 'SOJA',
        platform: 'X',
        devices: new Set(['RicCalLiq']),
      })
    ).toBe('liquido_recepcion_ric')
  })
})

describe('executiveCircuitForExcelOperation', () => {
  it('prioriza R8 Excel aunque Truckflow diga SL1', () => {
    expect(
      executiveCircuitForExcelOperation(
        op({
          platform_normalized: 'ACEITE_OSL',
          plataforma_original: 'ACEITE OSL',
          planta_normalized: 'RICARDONE',
          movement_type: 'INGRESO',
          mov: 'I',
          movement_type_detail: 'I',
          resolved_executive_circuit_code: 'R8',
          truckflow_circuit_codes: 'SL1',
        })
      )
    ).toBe('R8')
  })
})

describe('buildLiquidMovementsReport excel-first audit', () => {
  it('Ricardone: detecta RicCalLiq en ventana Excel por source_date', () => {
    const report = buildLiquidMovementsReport({
      operations: [
        op({
          external_operation_id: 'op-ric',
          plate_normalized: 'AAA111',
          platform_normalized: 'ACEITE_OSL',
          plataforma_original: 'ACEITE OSL',
          planta_normalized: 'RICARDONE',
          source_date: '2026-05-10',
          resolved_executive_circuit_code: 'R8',
          match_quality: 'EXTERNAL_MATCH_EXACT',
          matched_journey_uids: 'j1',
          matched_journey_count: 1,
        }),
      ],
      segmentRows: [],
      classifiedJourneys: [],
      rawEvents: [
        {
          normalizedPlate: 'AAA111',
          deviceCode: 'RicCalLiq',
          occurredAt: '2026-05-10T14:00:00-03:00',
          createdAt: '2026-05-10T14:00:00-03:00',
        },
      ],
    })
    const row = report.slLiquidRows.find((r) => r.external_operation_id === 'op-ric')
    expect(row?.audit_site).toBe('ricardone_calada')
    expect(row?.riccalliq_captured).toBe(true)
    expect(row?.excel_in_truckflow_window).toBe(true)
  })

  it('San Lorenzo SL1: descarga S10 en ventana Excel', () => {
    const report = buildLiquidMovementsReport({
      operations: [
        op({
          external_operation_id: 'op-sl1',
          plate_normalized: 'BBB222',
          platform_normalized: 'ACEITE',
          planta_normalized: 'TERMINAL_EMBARQUE',
          source_date: '2026-05-11',
          resolved_executive_circuit_code: 'SL1',
          match_quality: 'EXTERNAL_MATCH_EXACT',
          matched_journey_uids: 'j2',
          matched_journey_count: 1,
        }),
      ],
      segmentRows: [],
      classifiedJourneys: [],
      rawEvents: [
        {
          normalizedPlate: 'BBB222',
          deviceCode: 'RenDescFte',
          occurredAt: '2026-05-11T10:00:00-03:00',
          createdAt: '2026-05-11T10:00:00-03:00',
        },
      ],
    })
    const row = report.slLiquidRows.find((r) => r.external_operation_id === 'op-sl1')
    expect(row?.audit_site).toBe('san_lorenzo_s10')
    expect(row?.s10_captured).toBe(true)
  })
})

describe('slLiquidCameras', () => {
  it('reconoce SL1 y SL5', () => {
    expect(isSlLiquidCircuit('SL1')).toBe(true)
    expect(isSlLiquidCircuit('sl5')).toBe(true)
    expect(isSlLiquidCircuit('R7')).toBe(false)
  })
})
