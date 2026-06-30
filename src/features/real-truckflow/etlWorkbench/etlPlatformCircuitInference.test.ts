import { describe, expect, it } from 'vitest'
import {
  applyExternalCircuitToJourney,
  inferCircuitFromExternalMovimiento,
} from './etlPlatformCircuitInference'
import { normalizePlatform } from './etlExternalNormalization'
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
  it('VOLCABLE 1 Ricardone → R5', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'VOLCABLE_1',
        plataforma_original: 'VOLCABLE 1',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('R5')
  })

  it('VOLCABLE 2 Ricardone → R6', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'VOLCABLE_2',
        plataforma_original: 'VOLCABLE 2',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('R6')
  })

  it('VOLCABLE PTO 1/2/3/5 San Lorenzo → R7', () => {
    for (const label of ['VOLCABLE PTO 1', 'VOLCABLE PTO 2', 'VOLCABLE PTO 3', 'VOLCABLE PTO 5']) {
      const norm = normalizePlatform(label)
      expect(
        inferCircuitFromExternalMovimiento({
          platform_normalized: norm.platform_normalized!,
          plataforma_original: label,
          planta_normalized: 'RICARDONE',
          movement_type: 'INGRESO',
          movement_type_detail: 'I',
          mov: 'I',
        })?.circuit_code
      ).toBe('R7')
    }
  })

  it('CELDA_16 ingreso → R1', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'CELDA_16',
        plataforma_original: 'CELDA 16',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('R1')
  })

  it('KEPPLER 1 → R3 (descarga silos Kepler, no Transile)', () => {
    const inferred = inferCircuitFromExternalMovimiento({
      platform_normalized: 'KEPPLER_1',
      plataforma_original: 'KEPPLER 1 P',
      planta_normalized: 'RICARDONE',
      movement_type: 'INGRESO',
      movement_type_detail: 'I',
      mov: 'I',
    })
    expect(inferred?.circuit_code).toBe('R3')
    expect(inferred?.circuit_label).toBe('Recepción Silos Kepler 1')
  })

  it('KEPPLER 2 → R4', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'KEPPLER_2',
        plataforma_original: 'KEPPLER 2',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('R4')
  })

  it('ACEITE OSL Ricardone ingreso → R8', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('R8')
  })

  it('ACEITE OSL Ricardone despacho → R8 (recepción líquida Ric)', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        planta_normalized: 'RICARDONE',
        movement_type: 'DESPACHO',
        movement_type_detail: 'DE',
        mov: 'DE',
      })?.circuit_code
    ).toBe('R8')
  })

  it('ACEITE OSL San Lorenzo ingreso → SL1; ACEITE PTO → SL2', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        planta_normalized: 'SAN_LORENZO',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('SL1')
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_PTO',
        plataforma_original: 'ACEITE PTO',
        planta_normalized: 'SAN_LORENZO',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      })?.circuit_code
    ).toBe('SL2')
  })

  it('ACEITE OSL / PTO Terminal de embarque → SL1 OSL y SL2 PTO', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        planta_normalized: 'TERMINAL_EMBARQUE',
        movement_type: 'DESPACHO',
        movement_type_detail: 'DE',
        mov: 'DE',
      })?.circuit_code
    ).toBe('SL1')
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE_PTO',
        plataforma_original: 'ACEITE PTO',
        planta_normalized: 'TERMINAL_EMBARQUE',
        movement_type: 'DESPACHO',
        movement_type_detail: 'DE',
        mov: 'DE',
      })?.circuit_code
    ).toBe('SL2')
  })

  it('plataforma ACEITE en terminal → SL1 descarga', () => {
    expect(
      inferCircuitFromExternalMovimiento({
        platform_normalized: 'ACEITE',
        plataforma_original: 'ACEITE',
        planta_normalized: 'TERMINAL_EMBARQUE',
        movement_type: 'DESPACHO',
        movement_type_detail: 'DE',
        mov: 'DE',
      })?.circuit_code
    ).toBe('SL1')
  })

  it('asigna R7 a anomalía con VOLCABLE PTO en Excel', () => {
    const norm = normalizePlatform('VOLCABLE PTO 1')
    const out = applyExternalCircuitToJourney(j(), {
      platform_normalized: norm.platform_normalized!,
      plataforma_original: 'VOLCABLE PTO 1',
      planta_normalized: 'RICARDONE',
      movement_type: 'INGRESO',
      movement_type_detail: 'I',
      mov: 'I',
    } as never)
    expect(out.circuit_code).toBe('R7')
    expect(out.circuit_from_excel).toBe(true)
  })

  it('corrige SL1 Truckflow cuando Excel es ACEITE OSL Ricardone → R8', () => {
    const out = applyExternalCircuitToJourney(
      j({ circuit_code: 'SL1', executive_status: 'VALIDO', anomaly_real: false }),
      {
        platform_normalized: 'ACEITE_OSL',
        plataforma_original: 'ACEITE OSL',
        planta_normalized: 'RICARDONE',
        movement_type: 'INGRESO',
        movement_type_detail: 'I',
        mov: 'I',
      } as never
    )
    expect(out.circuit_code).toBe('R8')
    expect(out.circuit_from_excel).toBe(true)
  })
})

describe('inferAceiteExecutiveCircuitFromTruckflowEvidence', () => {
  it('RenDescFte / RenCargFte → SL1 (S10)', async () => {
    const { inferAceiteExecutiveCircuitFromTruckflowEvidence } = await import('./slLiquidCameras')
    expect(inferAceiteExecutiveCircuitFromTruckflowEvidence('R7', 'INGRESO>RenDescFte>EGRESO')).toBe('SL1')
    expect(inferAceiteExecutiveCircuitFromTruckflowEvidence('R7', 'RenCargFte')).toBe('SL1')
  })

  it('RicB1Ingreso + RicB2Egreso → R8', async () => {
    const { inferAceiteExecutiveCircuitFromTruckflowEvidence } = await import('./slLiquidCameras')
    expect(
      inferAceiteExecutiveCircuitFromTruckflowEvidence('R7', 'RicB1Ingreso>RicB2Egreso')
    ).toBe('R8')
  })

  it('Ric líquido con balanza Ric (sin SL_) → R8', async () => {
    const { inferAceiteExecutiveCircuitFromTruckflowEvidence } = await import('./slLiquidCameras')
    expect(
      inferAceiteExecutiveCircuitFromTruckflowEvidence(
        'R8',
        'INGRESO>PREINGRESO>LIQUIDO>BALANZA_INGRESO>BALANZA_EGRESO>EGRESO'
      )
    ).toBe('R8')
  })

  it('SL terminal sin Ren* → SL2', async () => {
    const { inferAceiteExecutiveCircuitFromTruckflowEvidence } = await import('./slLiquidCameras')
    expect(
      inferAceiteExecutiveCircuitFromTruckflowEvidence('R7', 'INGRESO>SL_INGRESO>SL_BALANZA_INGRESO>SL_EGRESO')
    ).toBe('SL2')
  })
})
