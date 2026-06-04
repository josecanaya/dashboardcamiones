import { describe, expect, it } from 'vitest'
import {
  applyExternalCircuitToJourney,
  inferCircuitFromExternalMovimiento,
} from './etlPlatformCircuitInference'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'

function j(partial: Partial<TruckflowJourneyForMerge>): TruckflowJourneyForMerge {
  return {
    journey_uid: 'j1',
    plate_original: 'EQV925',
    plate_normalized: 'EQV925',
    start_time: '2026-05-29T10:00:00',
    end_time: '2026-05-29T11:00:00',
    duration_min: 60,
    plant_scope: 'RICARDONE',
    circuit_code: '',
    circuit_label: '',
    executive_status: 'ANOMALO',
    valid_detail: '',
    observed_sequence: 'INGRESO>PREINGRESO',
    expected_sequence: '',
    matched_sequence_name: '',
    matched_variation_name: '',
    coverage_percent: 0,
    has_strong_point: false,
    useful_events_count: 4,
    anomaly_real: true,
    anomaly_type: 'ANOMALO',
    anomaly_origin_plant: '',
    anomaly_leg: '',
    committee_reason: 'NO_RESPETA_SECUENCIA',
    ...partial,
  }
}

describe('etlPlatformCircuitInference', () => {
  it('VOLCABLE_1 → R5', () => {
    expect(inferCircuitFromExternalMovimiento({ platform_normalized: 'VOLCABLE_1', planta_normalized: 'RICARDONE', movement_type: 'INGRESO', movement_type_detail: 'I', mov: 'I' })?.circuit_code).toBe('R5')
  })

  it('CELDA_16 ingreso → R1', () => {
    expect(inferCircuitFromExternalMovimiento({ platform_normalized: 'CELDA_16', planta_normalized: 'RICARDONE', movement_type: 'INGRESO', movement_type_detail: 'I', mov: 'I' })?.circuit_code).toBe('R1')
  })

  it('asigna circuito a anomalía desde Excel', () => {
    const out = applyExternalCircuitToJourney(j(), {
      platform_normalized: 'VOLCABLE_1',
      plataforma_original: 'VOLCABLE PTO 1',
      planta_normalized: 'RICARDONE',
      movement_type: 'INGRESO',
      movement_type_detail: 'I',
      mov: 'I',
    } as never)
    expect(out.circuit_code).toBe('R5')
    expect(out.circuit_from_excel).toBe(true)
    expect(out.truckflow_circuit_code).toBe('')
  })
})
