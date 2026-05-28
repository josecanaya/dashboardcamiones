import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  journeyHasSlIngresoEvidence,
  journeyIsRicSanLorenzoRouteEvidence,
} from './etlRicSanLorenzoRoute'
import { resolveExecutiveCircuitConfigForJourney } from './finalCircuitScoring'

function journey(partial: Partial<ReconstructedRealJourney>): ReconstructedRealJourney {
  return {
    journeyUid: 'j1',
    normalizedPlate: 'AB346JD',
    logicalCodeSequence: [],
    deviceCodeSequence: [],
    events: [],
    eventCount: 0,
    durationMinutes: 120,
    preliminaryCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
    ...partial,
  } as ReconstructedRealJourney
}

describe('etlRicSanLorenzoRoute', () => {
  it('detecta Ric→SL con calada + SL_INGRESO sin egreso Ricardone', () => {
    const j = journey({
      logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'SL_INGRESO'],
      events: [
        { deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T11:00:00' } as never,
      ],
    })
    expect(journeyHasSlIngresoEvidence(j)).toBe(true)
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(true)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('R7')
  })

  it('no promueve a Ric→SL si hay balanza de despacho', () => {
    const j = journey({
      logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'SL_INGRESO'],
    })
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(false)
  })
})
