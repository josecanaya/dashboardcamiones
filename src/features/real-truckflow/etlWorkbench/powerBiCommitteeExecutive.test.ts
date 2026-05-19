import { describe, expect, it } from 'vitest'
import {
  buildCommitteeExecutiveCsvPack,
  buildDssVsTruckflowRows,
  projectFinalCircuitsForCommittee,
} from './powerBiCommitteeExecutive'

describe('powerBiCommitteeExecutive', () => {
  it('proyecta columnas ejecutivas en final_circuits', () => {
    const { headers, rows } = projectFinalCircuitsForCommittee([
      {
        journey_uid: 'j1',
        final_status: 'circuito_completo',
        has_operational_entry: 'true',
        entry_source: 'preingreso',
        confidence_level: 'alta',
        reliability_explanation: 'OK',
      },
    ])
    expect(headers[0]).toBe('journey_uid')
    expect(headers.includes('final_status_label')).toBe(true)
    expect(headers.includes('confidence_level')).toBe(true)
    expect(rows[0].final_status_label).toBe('Completo')
    expect(rows[0].entry_source).toBe('preingreso')
  })

  it('genera pack ejecutivo con committee_summary y dss', () => {
    const pack = buildCommitteeExecutiveCsvPack({
      periodStart: '2026-05-12',
      periodEnd: '2026-05-18',
      loadGeneratedAt: '2026-05-19T12:00:00Z',
      rulesVersion: 'etl_v4',
      totalSummary: {
        ingreso_frontal_event_count: '100',
        ingresos_operativos_count: '95',
        journeys_after_rear_filter: '120',
        final_circuits_count: '80',
        final_circuitos_completos: '40',
        final_circuitos_probables: '25',
        front_events_count: '5000',
        rear_events_count: '200',
        front_alerts_count: '30',
        rear_alerts_count: '5',
        circuitos_con_ingreso_y_egreso_operativo: '35',
      },
      finalCircuits: [
        {
          journey_uid: 'j1',
          final_status: 'circuito_completo',
          logical_sequence_front: 'PREINGRESO>INGRESO>EGRESO',
          preliminary_code: 'CIRCUITO_VOLCABLE_1_2',
        },
      ],
      cameraSummaryCsv:
        'deviceCode,sectorCode,camera_type,event_count,alert_lpr_count,status,recommended_action\n' +
        'Cam1,SEC,front,100,5,Bajo,Mantener',
      daysInPeriod: 7,
      dssReference: { ingreso_frontal: 98, journeys: 110 },
    })
    expect(pack.csv.committee_summary).toContain('executive_week')
    expect(pack.csv.committee_summary).toContain('100')
    expect(pack.csv.camera_committee_status).toContain('estado_camara')
    expect(pack.csv.circuit_coverage).toContain('punto_operativo')
    expect(pack.csv.dss_vs_truckflow).toContain('truckflow_count')
    const dss = buildDssVsTruckflowRows(
      { ingreso_frontal_event_count: '100', journeys_after_rear_filter: '120' },
      { ingreso_frontal: 90 }
    )
    expect(dss[0].diferencia).toBe('10')
  })
})
