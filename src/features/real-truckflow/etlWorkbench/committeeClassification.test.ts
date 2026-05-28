import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  detectOperationalVariation,
  resolveCommitteeClassification,
  SL_PENDING_KEY_CAMERAS,
} from './committeeClassification'
import { applySanLorenzoExecutiveSupport, ETL_SL_EXECUTIVE_SUPPORT_ENABLED, ETL_SL_INTERNAL_CLASSIFICATION_ENABLED } from './etlSanLorenzoSupport'
import { EXECUTIVE_CIRCUIT_MATRIX } from './finalCircuitScoring'

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
    preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    preliminaryCircuitName: 'Volcable',
    preliminaryCircuitConfidence: 'media',
    isDiscardedOperational: false,
    siteId: 'ricardone',
    ...partial,
  }
}

function baseInput(
  partial: Partial<Parameters<typeof resolveCommitteeClassification>[0]>
): Parameters<typeof resolveCommitteeClassification>[0] {
  return {
    journey: journey({}),
    executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R5!,
    executiveCircuitCode: 'R5',
    technicalCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    matrixFinalStatus: 'INCOMPLETO',
    matrixReason: 'EVENTOS_INSUFICIENTES',
    executive: { executiveStatus: 'INCOMPLETO', executiveReason: 'EVENTOS_INSUFICIENTES', validDetail: '' },
    sequenceConfigured: true,
    hasStrongPoint: true,
    frontEventCount: 6,
    hasOperationalEntry: true,
    hasOperationalExit: true,
    observedSectorSequence: ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    ...partial,
  }
}

describe('committeeClassification v10', () => {
  it('1. DEDUCIDO => COMPLETOS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'DEDUCIDO',
        matchedPoints: 4,
        expectedPoints: 5,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO', validDetail: 'DEDUCIDO' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('CIRCUITO_DEDUCIDO_CON_EVIDENCIA')
    expect(r.executive_status).toBe('VALIDO')
  })

  it('2. COMPLETO => COMPLETOS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'COMPLETO',
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
  })

  it('3. recalado configurado => VARIACIONES_OPERATIVAS', () => {
    const cfg = EXECUTIVE_CIRCUIT_MATRIX.R5!
    const observed = ['S0', 'S1', 'S2', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10']
    const v = detectOperationalVariation(cfg, observed)
    expect(v?.type).toBe('RECALADO')
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'INCOMPLETO',
        observedSectorSequence: observed,
      })
    )
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
  })

  it('4. ajuste de peso (doble S4) => VARIACIONES_OPERATIVAS', () => {
    const observed = ['S0', 'S1', 'S2', 'S4', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10']
    const r = resolveCommitteeClassification(baseInput({ matrixFinalStatus: 'INCOMPLETO', observedSectorSequence: observed }))
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
    expect(r.operational_variation_type).toBe('DOBLE_PASO_BALANZA')
  })

  it('5. loop interno => VARIACIONES_OPERATIVAS', () => {
    const observed = ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S6', 'S7', 'S9', 'S4', 'S10']
    const r = resolveCommitteeClassification(baseInput({ matrixFinalStatus: 'INCOMPLETO', observedSectorSequence: observed }))
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
    expect(r.operational_variation_type).toBe('LOOP_INTERNO_PERMITIDO')
  })

  it('6. doble paso balanza => VARIACIONES_OPERATIVAS', () => {
    const observed = ['S0', 'S1', 'S2', 'S4', 'S4', 'S10']
    const r = resolveCommitteeClassification(baseInput({ matrixFinalStatus: 'INCOMPLETO', observedSectorSequence: observed }))
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
  })

  it('7. NO_EVALUABLE no sube a PROBABLE por corroboración SL (apoyo desactivado)', () => {
    expect(ETL_SL_EXECUTIVE_SUPPORT_ENABLED).toBe(false)
    const j = journey({
      events: [
        { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T09:00:00' } as never,
        { deviceCode: 'SLZBalIngFte', sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', occurredAt: '2026-05-12T09:05:00' } as never,
      ],
    })
    const r = applySanLorenzoExecutiveSupport({
      journey: j,
      executiveCircuitCode: 'SIN_PUNTO',
      technicalCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
      executive: { executiveStatus: 'NO_EVALUABLE', executiveReason: 'CIRCUITO_SIN_PUNTO_INSTRUMENTADO', validDetail: '' },
      frontEventCount: 5,
      hasOperationalEntry: true,
      hasOperationalExit: false,
    })
    expect(r.executiveStatus).toBe('NO_EVALUABLE')
  })

  it('8. R7 ruta Ric→SL (SL interno desactivado) no usa bloque cámaras pendientes', () => {
    expect(ETL_SL_INTERNAL_CLASSIFICATION_ENABLED).toBe(false)
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R7',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R7!,
        technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
        matrixFinalStatus: 'DEDUCIDO',
        matchedPoints: 3,
        expectedPoints: 4,
        frontEventCount: 6,
        hasOperationalEntry: true,
        hasOperationalExit: true,
        hasStrongPoint: true,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO', validDetail: 'DEDUCIDO' },
      })
    )
    expect(r.committee_reason).not.toBe('CAMARAS_SLZ_S1_S5_S7_PENDIENTES')
    expect(r.analysis_scope).toBe('MIXTO')
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('RUTA_RIC_SAN_LORENZO_DEDUCIDA')
  })

  it('R7 ruta con matriz COMPLETA => COMPLETOS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R7',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R7!,
        technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
        matrixFinalStatus: 'COMPLETO',
        matchedPoints: 4,
        expectedPoints: 4,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('RUTA_RIC_SAN_LORENZO_COMPLETA')
    expect(r.show_as_exact_circuit).toBe(false)
  })

  it('9. NO_DIFERENCIABLE => ANOMALIAS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'RS_REC',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.RS_REC!,
        hasStrongPoint: false,
        frontEventCount: 2,
        hasOperationalEntry: false,
        executive: { executiveStatus: 'NO_EVALUABLE', executiveReason: 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.executive_status).toBe('NO_DIFERENCIABLE')
  })

  it('10. misma secuencia sin punto fuerte no asigna circuito exacto', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'RS_DESP',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.RS_DESP!,
        hasStrongPoint: false,
        frontEventCount: 3,
        executive: { executiveStatus: 'PROBABLE', executiveReason: 'CIRCUITO_PROBABLE_INFERIDO', validDetail: '' },
      })
    )
    expect(r.show_as_exact_circuit).toBe(false)
    expect(r.committee_group).toBe('ANOMALIAS')
  })

  it('11. transile externo con evidencia Ricardone => COMPLETOS deducido', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R26',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R26!,
        matrixFinalStatus: 'DEDUCIDO',
        journey: journey({
          events: [
            { deviceCode: 'RicVolcable1', sectorCode: 'RICARDONE_VOLCABLE', occurredAt: '2026-05-12T09:00:00' } as never,
          ],
        }),
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO', validDetail: 'DEDUCIDO' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('TRANSILE_EXTERNO_DEDUCIDO_CON_EVIDENCIA')
  })

  it('12. transile externo sin punto fuerte => ANOMALIAS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R34',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R34!,
        hasStrongPoint: false,
        matrixFinalStatus: 'INCOMPLETO',
        executive: { executiveStatus: 'NO_EVALUABLE', executiveReason: 'CIRCUITO_NO_EVALUABLE_POR_COBERTURA', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.executive_status).toBe('NO_DIFERENCIABLE')
  })

  it('13. no respeta secuencia => ANOMALIAS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'ANOMALO',
        matrixReason: 'NO_RESPETA_SECUENCIA',
        executive: { executiveStatus: 'ANOMALO', executiveReason: 'NO_RESPETA_SECUENCIA', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.committee_reason).toBe('NO_RESPETA_SECUENCIA')
  })

  it('SIN_PUNTO con ingreso+egreso+4 eventos => ANOMALIAS (no deducible)', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'SIN_PUNTO',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.SIN_PUNTO!,
        sequenceConfigured: false,
        frontEventCount: 5,
        hasOperationalEntry: true,
        hasOperationalExit: true,
        matrixFinalStatus: 'INCOMPLETO',
        executive: { executiveStatus: 'NO_EVALUABLE', executiveReason: 'CIRCUITO_SIN_PUNTO_INSTRUMENTADO', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.committee_reason).toBe('NO_DIFERENCIABLE_SIN_PUNTO_FUERTE')
  })

  it('R7 sin calada pero ingreso+egreso+SL ingreso => COMPLETOS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R7',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R7!,
        technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
        matrixFinalStatus: 'DEDUCIDO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'EGRESO', 'SL_INGRESO'],
        journey: journey({
          logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'EGRESO', 'SL_INGRESO'],
          events: [
            { deviceCode: 'RicIngCamFte', sectorCode: 'RICARDONE_INGRESO_CAMIONES', occurredAt: '2026-05-12T08:00:00' } as never,
            { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T10:00:00' } as never,
          ],
        }),
        hasOperationalEntry: true,
        hasOperationalExit: false,
        frontEventCount: 4,
        executive: { executiveStatus: 'INCOMPLETO', executiveReason: 'EVENTOS_INSUFICIENTES', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('RUTA_RIC_SAN_LORENZO_COMPLETA')
  })

  it('R7 calada + SL ingreso sin egreso Ric => COMPLETOS (evidencia Ric→SL)', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'SIN_PUNTO',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.SIN_PUNTO!,
        technicalCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
        sequenceConfigured: false,
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'SL_INGRESO'],
        journey: journey({
          logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'SL_INGRESO'],
          events: [
            { deviceCode: 'RicIngCamFte', sectorCode: 'RICARDONE_INGRESO_CAMIONES', occurredAt: '2026-05-12T08:00:00' } as never,
            { deviceCode: 'RicPreIng', sectorCode: 'RICARDONE_PREINGRESO', occurredAt: '2026-05-12T08:30:00' } as never,
            { deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA', occurredAt: '2026-05-12T09:00:00' } as never,
            { deviceCode: 'SLZIngCamFrente', sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', occurredAt: '2026-05-12T11:00:00' } as never,
          ],
        }),
        hasOperationalEntry: true,
        hasOperationalExit: false,
        frontEventCount: 4,
        matrixFinalStatus: 'INCOMPLETO',
        executive: { executiveStatus: 'NO_EVALUABLE', executiveReason: 'CIRCUITO_SIN_PUNTO_INSTRUMENTADO', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('RUTA_RIC_SAN_LORENZO_COMPLETA')
    expect(r.executive_reason).toBe('CIERRE_POR_INGRESO_SLZ')
  })

  it('R7 demora post-calada sin San Lorenzo => POSIBLE_RECHAZO', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R7',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R7!,
        technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
        matrixFinalStatus: 'COMPLETO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
        journey: journey({
          durationMinutes: 300,
          logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
          events: [
            { deviceCode: 'RicIngCamFte', sectorCode: 'RICARDONE_INGRESO_CAMIONES', occurredAt: '2026-05-12T07:00:00' } as never,
            { deviceCode: 'RicPreIng', sectorCode: 'RICARDONE_PREINGRESO', occurredAt: '2026-05-12T07:30:00' } as never,
            { deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA', occurredAt: '2026-05-12T08:00:00' } as never,
            { deviceCode: 'RicEgrCamFrente', sectorCode: 'RICARDONE_EGRESO_CAMIONES', occurredAt: '2026-05-12T13:00:00' } as never,
          ],
        }),
        hasOperationalEntry: true,
        hasOperationalExit: true,
        frontEventCount: 4,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      })
    )
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
    expect(r.operational_variation_type).toBe('POSIBLE_RECHAZO')
    expect(r.committee_reason).toBe('POSIBLE_RECHAZO_CONTEMPLADO')
  })

  it('R7 demora pre-calada sin San Lorenzo => ESPERA_EN_CALADA', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'R7',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.R7!,
        technicalCircuitCode: 'CIRCUITO_SAN_LORENZO',
        matrixFinalStatus: 'COMPLETO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
        journey: journey({
          durationMinutes: 300,
          logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'],
          events: [
            { deviceCode: 'RicIngCamFte', sectorCode: 'RICARDONE_INGRESO_CAMIONES', occurredAt: '2026-05-12T07:00:00' } as never,
            { deviceCode: 'RicPreIng', sectorCode: 'RICARDONE_PREINGRESO', occurredAt: '2026-05-12T07:30:00' } as never,
            { deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA', occurredAt: '2026-05-12T13:00:00' } as never,
            { deviceCode: 'RicEgrCamFrente', sectorCode: 'RICARDONE_EGRESO_CAMIONES', occurredAt: '2026-05-12T13:30:00' } as never,
          ],
        }),
        hasOperationalEntry: true,
        hasOperationalExit: true,
        frontEventCount: 4,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      })
    )
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
    expect(r.operational_variation_type).toBe('ESPERA_EN_CALADA')
    expect(r.committee_reason).toBe('ESPERA_EN_CALADA_CONTEMPLADA')
  })

  it('RS_REC deducido con calada+egreso => COMPLETOS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        executiveCircuitCode: 'RS_REC',
        executiveCircuitConfig: EXECUTIVE_CIRCUIT_MATRIX.RS_REC!,
        technicalCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
        matrixFinalStatus: 'DEDUCIDO',
        matchedPoints: 3,
        expectedPoints: 4,
        hasStrongPoint: false,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_DEDUCIDO_VALIDO', validDetail: 'DEDUCIDO' },
      })
    )
    expect(r.committee_group).toBe('COMPLETOS')
    expect(r.committee_reason).toBe('CIRCUITO_DEDUCIDO_CON_EVIDENCIA')
  })

  it('recalado con matriz COMPLETA => VARIACIONES (prioridad sobre completos)', () => {
    const observed = ['S0', 'S1', 'S2', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10']
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'COMPLETO',
        observedSectorSequence: observed,
        executive: { executiveStatus: 'VALIDO', executiveReason: 'CIRCUITO_COMPLETO', validDetail: 'COMPLETO' },
      })
    )
    expect(r.committee_group).toBe('VARIACIONES_OPERATIVAS')
    expect(r.operational_variation_type).toBe('RECALADO')
  })

  it('fragmento <=2 evt sin egreso operativo => ANOMALIAS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        frontEventCount: 2,
        hasOperationalEntry: true,
        hasOperationalExit: false,
        executive: { executiveStatus: 'INCOMPLETO', executiveReason: 'EVENTOS_INSUFICIENTES', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.committee_reason).toBe('FRAGMENTO_SIN_CIERRE_OPERATIVO')
  })

  it('14. journey incompleto => ANOMALIAS', () => {
    const r = resolveCommitteeClassification(
      baseInput({
        matrixFinalStatus: 'INCOMPLETO',
        matrixReason: 'EVENTOS_INSUFICIENTES',
        observedSectorSequence: ['S0'],
        executive: { executiveStatus: 'INCOMPLETO', executiveReason: 'EVENTOS_INSUFICIENTES', validDetail: '' },
      })
    )
    expect(r.committee_group).toBe('ANOMALIAS')
    expect(r.committee_reason).toBe('JOURNEY_INCOMPLETO')
  })
})
