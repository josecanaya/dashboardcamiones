import { describe, expect, it } from 'vitest'
import {
  auditExcelOperationsAgainstSlCameraSlots,
  buildSlKpiCameraAuditSlots,
  isRawEventForSlot,
  operationalInstantIso,
  summarizeSlCameraAuditBySlot,
} from './auditSlCameraExcelCoverage'

describe('auditSlCameraExcelCoverage', () => {
  const slots = buildSlKpiCameraAuditSlots()

  it('incluye S0 y S1 en catálogo KPI', () => {
    expect(slots.some((s) => s.slotId === 'S0' && s.logicalCode === 'SL_INGRESO')).toBe(true)
    expect(slots.some((s) => s.slotId === 'S1' && s.logicalCode === 'SL_BALANZA_INGRESO')).toBe(true)
    expect(slots.some((s) => s.slotId === 'S7' && s.logicalCode === 'SL_EGRESO')).toBe(true)
  })

  it('detecta S1 y S0 por deviceCode y usa createdAt', () => {
    const s1 = slots.find((s) => s.slotId === 'S1')!
    const ev = {
      truckPlate: 'ABC123',
      deviceCode: 'SLZBalIngFte',
      sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
      occurredAt: '2026-06-05T18:00:00-03:00',
      createdAt: '2026-06-05T22:16:00-03:00',
    }
    expect(isRawEventForSlot(ev, s1)).toBe(true)
    expect(operationalInstantIso(ev)).toContain('22:16')
    const s0 = slots.find((s) => s.slotId === 'S0')!
    expect(
      isRawEventForSlot(
        { truckPlate: 'ABC123', deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES' },
        s0
      )
    ).toBe(true)
  })

  it('marca raw_no_pipeline por slot cuando hay crudo y no hay punto merge', () => {
    const rows = auditExcelOperationsAgainstSlCameraSlots(
      [
        {
          operationId: 'op1',
          plate: 'ABC123',
          executiveCircuitCode: 'R7',
          externalIngresoAt: '2026-06-05T20:00:00',
          externalSalidaAt: '2026-06-06T02:00:00',
          analysisReadyForScatter: true,
          segments: [{ segment_from: 'EGRESO', segment_to: 'SL_INGRESO', segment_start_time: 'a', segment_end_time: 'b' }],
        },
      ],
      [
        {
          truckPlate: 'ABC123',
          deviceCode: 'SLZBalIngFte',
          sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
          createdAt: '2026-06-05T22:16:00-03:00',
        },
      ],
      slots.filter((s) => s.slotId === 'S1')
    )
    expect(rows[0]!.gapClass).toBe('raw_no_pipeline')
    const sum = summarizeSlCameraAuditBySlot(rows)
    expect(sum[0]!.rawYesPipelineNo).toBe(1)
  })
})
