import { describe, expect, it } from 'vitest'
import {
  auditExcelOperationsAgainstRawS1,
  isRawS1Event,
  operationalInstantIso,
  summarizeSlS1Audit,
} from './auditSlS1ExcelCoverage'

describe('auditSlS1ExcelCoverage', () => {
  it('detecta S1 por device SLZBalIngFte y usa createdAt', () => {
    const ev = {
      truckPlate: 'GJW684',
      deviceCode: 'SLZBalIngFte',
      sectorCode: '1-S1',
      occurredAt: '2026-06-05T18:53:00.133-03:00',
      createdAt: '2026-06-05T22:16:29.085-03:00',
    }
    expect(isRawS1Event(ev)).toBe(true)
    expect(operationalInstantIso(ev)).toContain('22:16')
  })

  it('marca raw_s1_no_pipeline cuando hay crudo y no hay segmento', () => {
    const rows = auditExcelOperationsAgainstRawS1(
      [
        {
          operationId: 'op1',
          plate: 'GJW684',
          executiveCircuitCode: 'R7',
          externalIngresoAt: '2026-06-05T20:00:00',
          externalSalidaAt: '2026-06-06T02:00:00',
          analysisReadyForScatter: true,
          segments: [{ segment_from: 'EGRESO', segment_to: 'SL_INGRESO', segment_start_time: 'x', segment_end_time: 'y' }],
        },
      ],
      [
        {
          truckPlate: 'GJW684',
          deviceCode: 'SLZBalIngFte',
          sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
          occurredAt: '2026-06-05T18:53:00-03:00',
          createdAt: '2026-06-05T22:16:00-03:00',
        },
      ]
    )
    expect(rows[0]!.rawS1InExcelWindow).toBe(true)
    expect(rows[0]!.pipelineHasS1Segment).toBe(false)
    expect(rows[0]!.gapClass).toBe('raw_s1_no_pipeline')
    const sum = summarizeSlS1Audit(rows)
    expect(sum.rawYesPipelineNo).toBe(1)
  })
})
