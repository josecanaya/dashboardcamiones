import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  applySanLorenzoExecutiveSupport,
  ETL_SL_EXECUTIVE_SUPPORT_ENABLED,
  journeyHasSanLorenzoStrongPoint,
  snapshotSanLorenzoSupport,
} from './etlSanLorenzoSupport'

function journey(partial: Partial<ReconstructedRealJourney>): ReconstructedRealJourney {
  return {
    journeyUid: 'j1',
    plate: 'ABC123',
    normalizedPlate: 'ABC123',
    isValidPlate: true,
    startedAt: '2026-05-12T08:00:00',
    endedAt: '2026-05-12T10:00:00',
    durationMinutes: 120,
    eventCount: 5,
    events: [],
    logicalCodeSequence: [],
    preliminaryCircuitCode: 'CIRCUITO_SAN_LORENZO',
    preliminaryCircuitName: 'SL',
    preliminaryCircuitConfidence: 'media',
    isDiscardedOperational: false,
    ...partial,
  }
}

describe('etlSanLorenzoSupport', () => {
  it('detecta corroboración SL con ingreso + balanza ingreso', () => {
    const j = journey({
      events: [
        { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZBalIngFte', sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', occurredAt: '2026-05-12T09:10:00' } as never,
      ],
    })
    const snap = snapshotSanLorenzoSupport(j)
    expect(snap.hasSlIngreso).toBe(true)
    expect(snap.hasSlCorroboration).toBe(true)
    expect(journeyHasSanLorenzoStrongPoint(j)).toBe(true)
  })

  it('ignora cámaras no instaladas (calada)', () => {
    const j = journey({
      events: [
        { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZCalCam', sectorCode: 'PUERTO_SAN_LORENZO_CALADA', occurredAt: '2026-05-12T09:10:00' } as never,
      ],
    })
    const snap = snapshotSanLorenzoSupport(j)
    expect(snap.slPointCount).toBe(1)
    expect(snap.slLogicalCodes).toEqual(['SL_INGRESO'])
    expect(snap.hasSlCorroboration).toBe(true)
  })

  it('detecta balanza completa SL ingreso + salida', () => {
    const j = journey({
      events: [
        { deviceCode: 'SLZBalIngFte', sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZBalSC1Fte', sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA', occurredAt: '2026-05-12T09:20:00' } as never,
      ],
    })
    expect(snapshotSanLorenzoSupport(j).hasSlBalancaCompleta).toBe(true)
  })

  it('sube R7 incompleto a PROBABLE con corroboración SL solo si apoyo activo', () => {
    const j = journey({
      events: [
        { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZBalIngfte', sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', occurredAt: '2026-05-12T09:05:00' } as never,
      ],
    })
    const r = applySanLorenzoExecutiveSupport({
      journey: j,
      executiveCircuitCode: 'R7',
      technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
      executive: { executiveStatus: 'INCOMPLETO', executiveReason: 'EVENTOS_INSUFICIENTES', validDetail: '' },
      frontEventCount: 4,
      hasOperationalEntry: true,
      hasOperationalExit: false,
    })
    if (ETL_SL_EXECUTIVE_SUPPORT_ENABLED) {
      expect(r.executiveStatus).toBe('PROBABLE')
    } else {
      expect(r.executiveStatus).toBe('INCOMPLETO')
    }
  })
})
