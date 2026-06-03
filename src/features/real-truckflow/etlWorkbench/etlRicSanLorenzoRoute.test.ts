import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  journeyHasSlIngresoEvidence,
  journeyIsRicSanLorenzoRouteEvidence,
  journeyIsSlOnlyInternal,
  journeyIsTransileC16ToSl,
  journeyIsTransileSlToC16,
  resolveTechnicalCircuitCodeForExecutive,
} from './etlRicSanLorenzoRoute'
import {
  classifyJourneyAgainstCircuitMatrix,
  DEFAULT_CIRCUIT_MATRIX,
  isExecutiveSequenceConfigured,
  resolveExecutiveCircuitConfigForJourney,
} from './finalCircuitScoring'
import { resolveCommitteeClassification } from './committeeClassification'

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

function ev(deviceCode: string, logicalCode: string, at: string, sector = 'S0') {
  return { deviceCode, sectorCode: sector, occurredAt: at, logicalCode } as never
}

describe('etlRicSanLorenzoRoute resolvers', () => {
  it('1. R7 básico: Ric + SL_INGRESO', () => {
    const j = journey({
      logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', 'SL_INGRESO'],
      events: [
        ev('RicIngCamFrente', 'INGRESO', '2026-05-12T08:00:00', 'S0'),
        ev('RicPreCam', 'PREINGRESO', '2026-05-12T08:10:00', 'S1'),
        ev('RicCal01', 'CALADA', '2026-05-12T09:00:00', 'S2'),
        ev('RicEgrCam', 'EGRESO', '2026-05-12T10:00:00', 'S3'),
        ev('SLZIngCamFrente', 'SL_INGRESO', '2026-05-12T11:00:00', 'S0'),
      ],
      eventCount: 5,
    })
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(true)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('R7')
  })

  it('2. R7 extendido con cadena SL interna sigue siendo R7', () => {
    const j = journey({
      logicalCodeSequence: [
        'INGRESO',
        'PREINGRESO',
        'CALADA',
        'EGRESO',
        'SL_INGRESO',
        'SL_BALANZA_INGRESO',
        'SL_DESCARGA',
        'SL_EGRESO',
      ],
      eventCount: 8,
    })
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(true)
    expect(journeyIsSlOnlyInternal(j)).toBe(false)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('R7')
    expect(resolveTechnicalCircuitCodeForExecutive(j, 'R7')).toBe('CIRCUITO_R7_MIXTO')
  })

  it('3. R26: Celda16 Ric + egreso + San Lorenzo (no R7)', () => {
    const j = journey({
      logicalCodeSequence: [
        'INGRESO',
        'PREINGRESO',
        'CALADA',
        'BALANZA_INGRESO',
        'CELDA16_CARGA',
        'BALANZA_EGRESO',
        'EGRESO',
        'SL_INGRESO',
      ],
      eventCount: 8,
    })
    expect(journeyIsTransileC16ToSl(j)).toBe(true)
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(false)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('R26')
    expect(isExecutiveSequenceConfigured(resolveExecutiveCircuitConfigForJourney(j))).toBe(true)
  })

  it('4. R27: San Lorenzo + Ric + Celda16', () => {
    const j = journey({
      logicalCodeSequence: [
        'SL_INGRESO',
        'SL_BALANZA_INGRESO',
        'SL_EGRESO',
        'INGRESO',
        'PREINGRESO',
        'CALADA',
        'BALANZA_INGRESO',
        'CELDA16_DESCARGA',
        'BALANZA_EGRESO',
        'EGRESO',
      ],
      eventCount: 10,
    })
    expect(journeyIsTransileSlToC16(j)).toBe(true)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('R27')
  })

  it('5. SL1: solo San Lorenzo', () => {
    const j = journey({
      logicalCodeSequence: [
        'SL_INGRESO',
        'SL_BALANZA_INGRESO',
        'SL_CALADA',
        'SL_ENLACE',
        'SL_DESCARGA',
        'SL_BALANZA_SALIDA',
        'SL_EGRESO',
      ],
      events: [
        ev('SLZIngCamFrente', 'SL_INGRESO', '2026-05-12T08:00:00', 'S0'),
        ev('SLZBalIngFte', 'SL_BALANZA_INGRESO', '2026-05-12T08:20:00', 'S1'),
        ev('SLZCalCam', 'SL_CALADA', '2026-05-12T08:40:00', 'S2'),
        ev('SLZEnlace31Cam', 'SL_ENLACE', '2026-05-12T09:00:00', 'S3'),
        ev('SLZDescCam', 'SL_DESCARGA', '2026-05-12T09:30:00', 'S4'),
        ev('SLZBalSC1Fte', 'SL_BALANZA_SALIDA', '2026-05-12T10:00:00', 'S5'),
        ev('SLZSalidaC1Fte', 'SL_EGRESO', '2026-05-12T10:30:00', 'S7'),
      ],
      eventCount: 7,
      preliminaryCircuitCode: 'CIRCUITO_SL_RECEPCION',
    })
    expect(journeyIsSlOnlyInternal(j)).toBe(true)
    expect(resolveExecutiveCircuitConfigForJourney(j)?.code).toBe('SL1')
  })

  it('6. SL1 con recalado S0 S2 S1 S3 S4 S5 S7 => variación válida', () => {
    const cfg = resolveExecutiveCircuitConfigForJourney(
      journey({
        logicalCodeSequence: ['SL_INGRESO', 'SL_CALADA', 'SL_DESCARGA', 'SL_EGRESO'],
        eventCount: 4,
        preliminaryCircuitCode: 'CIRCUITO_SL_RECEPCION',
      })
    )
    const r = resolveCommitteeClassification({
      journey: journey({ eventCount: 7 }),
      executiveCircuitConfig: cfg,
      executiveCircuitCode: 'SL1',
      technicalCircuitCode: 'CIRCUITO_SL_RECEPCION',
      matrixFinalStatus: 'COMPLETO',
      matrixReason: '',
      executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      sequenceConfigured: true,
      hasStrongPoint: true,
      frontEventCount: 7,
      hasOperationalEntry: true,
      hasOperationalExit: true,
      observedSectorSequence: ['S0', 'S2', 'S1', 'S3', 'S4', 'S5', 'S7'],
    })
    expect(['COMPLETOS', 'VARIACIONES_OPERATIVAS']).toContain(r.committee_group)
    expect(r.executive_status).not.toBe('ANOMALO')
  })

  it('7. Incompleto con <=2 eventos útiles', () => {
    const j = journey({
      eventCount: 2,
      logicalCodeSequence: ['INGRESO', 'EGRESO'],
      preliminaryCircuitCode: 'CIRCUITO_SAN_LORENZO',
    })
    const r = classifyJourneyAgainstCircuitMatrix(j, DEFAULT_CIRCUIT_MATRIX)
    expect(r.finalStatus).toBe('INCOMPLETO')
  })

  it('8. Anómalo por secuencia con 3+ eventos', () => {
    const j = journey({
      eventCount: 6,
      logicalCodeSequence: [
        'INGRESO',
        'BALANZA_EGRESO',
        'PREINGRESO',
        'INGRESO',
        'BALANZA_EGRESO',
        'EGRESO',
      ],
      preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    })
    const r = classifyJourneyAgainstCircuitMatrix(j, DEFAULT_CIRCUIT_MATRIX)
    expect(r.finalStatus).toBe('ANOMALO')
    expect(r.reason).toBe('NO_RESPETA_SECUENCIA')
  })

  it('9. R7 falla en pata SL => anomaly SAN_LORENZO', () => {
    const j = journey({
      logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO', 'SL_INGRESO', 'SL_EGRESO'],
      eventCount: 6,
    })
    const r = resolveCommitteeClassification({
      journey: j,
      executiveCircuitConfig: resolveExecutiveCircuitConfigForJourney(j),
      executiveCircuitCode: 'R7',
      technicalCircuitCode: 'CIRCUITO_R7_MIXTO',
      matrixFinalStatus: 'ANOMALO',
      matrixReason: 'NO_RESPETA_SECUENCIA',
      executive: { executiveStatus: 'ANOMALO', executiveReason: 'NO_RESPETA_SECUENCIA', validDetail: '' },
      sequenceConfigured: true,
      hasStrongPoint: true,
      frontEventCount: 6,
      hasOperationalEntry: true,
      hasOperationalExit: true,
    })
    expect(r.anomaly_origin_plant).toBe('SAN_LORENZO')
    expect(r.anomaly_leg).toBe('SL')
  })

  it('10. no promueve Ric→SL si hay balanza de despacho', () => {
    const j = journey({
      logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'SL_INGRESO'],
    })
    expect(journeyIsRicSanLorenzoRouteEvidence(j)).toBe(false)
    expect(journeyHasSlIngresoEvidence(j)).toBe(true)
  })
})
