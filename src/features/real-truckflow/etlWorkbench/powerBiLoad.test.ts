import { describe, expect, it } from 'vitest'
import { consolidatePowerBiLoad, daysInclusive } from './powerBiLoad'

describe('powerBiLoad', () => {
  it('daysInclusive incluye extremos', () => {
    expect(daysInclusive('2026-05-12', '2026-05-14')).toEqual([
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
    ])
  })

  it('consolida paquete en memoria con sourceDay rango compuesto', () => {
    const summary =
      'ingreso_frontal_event_count,final_circuits_count,journeys_after_rear_filter,date_min,date_max\n' +
      '10,8,12,2026-05-18,2026-05-19\n'
    const out = consolidatePowerBiLoad({
      periodStart: '2026-05-18',
      periodEnd: '2026-05-19',
      loadGroupType: 'week',
      days: [
        {
          sourceDay: '2026-05-18_2026-05-19',
          files: {
            transform_summary: summary,
            final_circuits:
              'journey_uid,final_status,truck_plate\n' + 'a1,circuito_completo,ABC123\n',
          },
        },
      ],
    })
    expect(out.sourceDays).toEqual(['2026-05-18_2026-05-19'])
    expect(out.stats.finalCircuits).toBe(1)
    expect(out.stats.daysConsolidated).toBe(1)
  })

  it('consolida summary con fila day y total', () => {
    const summary =
      'ingreso_frontal_event_count,final_circuits_count,journeys_after_rear_filter,date_min\n' +
      '10,8,12,2026-05-12\n'
    const out = consolidatePowerBiLoad({
      periodStart: '2026-05-12',
      periodEnd: '2026-05-12',
      loadGroupType: 'day',
      days: [
        {
          sourceDay: '2026-05-12',
          files: {
            transform_summary: summary,
            final_circuits:
              'journey_uid,final_status,truck_plate\n' + 'a1,circuito_completo,ABC123\n' + 'a2,incompleto_revision,',
          },
        },
      ],
    })
    expect(out.files.transform_summary).toContain('summary_level')
    expect(out.files.transform_summary).toContain('total')
    expect(out.stats.ingresoFrontal).toBe(10)
    expect(out.stats.finalCircuits).toBe(2)
    expect(out.rowCounts.final_circuits).toBe(2)
    expect(out.files.committee_summary).toContain('executive_week')
    expect(out.files.camera_committee_status).toContain('estado_camara')
    expect(out.files.circuit_coverage).toContain('coverage_type')
    expect(out.files.dss_vs_truckflow).toContain('truckflow_count')
    expect(out.files.final_circuits).toContain('final_status_label')
  })

  it('pb_circuit_summary suma COMPLETO + DEDUCIDO dentro de valid_journeys', () => {
    const out = consolidatePowerBiLoad({
      periodStart: '2026-05-12',
      periodEnd: '2026-05-12',
      loadGroupType: 'day',
      days: [
        {
          sourceDay: '2026-05-12',
          files: {
            transform_summary:
              'ingreso_frontal_event_count,final_circuits_count,journeys_after_rear_filter,date_min\n' +
              '10,4,12,2026-05-12\n',
            final_circuits:
              [
                'journey_uid,final_status,truck_plate,matrix_final_status,executive_status,valid_detail,executive_reason',
                'a1,circuito_completo,ABC123,COMPLETO,VALIDO,COMPLETO,CIRCUITO_COMPLETO',
                'a2,circuito_probable,DEF456,DEDUCIDO,VALIDO,DEDUCIDO,CIRCUITO_DEDUCIDO_VALIDO',
                'a3,incompleto_revision,GHI789,ANOMALO,ANOMALO,,NO_RESPETA_SECUENCIA',
                'a4,incompleto_revision,JKL111,ANOMALO,NO_EVALUABLE,,CONFIG_ERROR_MISSING_SEQUENCE',
              ].join('\n'),
          },
        },
      ],
    })
    expect(out.files.circuit_summary).toContain('valid_journeys')
    expect(out.files.circuit_summary).toContain('probable_journeys')
    expect(out.files.circuit_summary).toContain('committee_completos')
    expect(out.files.circuit_summary).toContain('4,2,0,2,2,0,0,1,1,1,1,0,0,1,1')
  })
})
