import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  classifyJourneyAgainstCircuitMatrix,
  DEFAULT_CIRCUIT_MATRIX,
  buildReliabilityExplanation,
  confidenceLevelFromScore,
  computeJourneyReliability,
  isExecutiveSequenceConfigured,
  isLiquidDispatchJourney,
  isLiquidReceptionJourney,
  journeyHasLiquidStrongPoint,
  resolveExecutiveBucket,
  resolveExecutiveCircuitConfig,
  resolveExecutiveCircuitConfigForJourney,
  resolveExecutiveCircuitDecision,
  resolveProbableSolidExecutiveDecision,
  isSolidReceptionPattern,
  isSolidDispatchPattern,
  resolveFinalStatus,
  resolveOperationalEntry,
  resolveOperationalExit,
} from './finalCircuitScoring'

function journey(partial: Partial<ReconstructedRealJourney>): ReconstructedRealJourney {
  return {
    journeyUid: 'j1',
    plate: 'ABC123',
    normalizedPlate: 'ABC123',
    startedAt: '2026-05-12T08:00:00',
    endedAt: '2026-05-12T10:00:00',
    durationMinutes: 120,
    eventCount: 5,
    events: [],
    logicalCodeSequence: [],
    preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    preliminaryCircuitName: 'Volcable',
    preliminaryCircuitConfidence: '0.8',
    isDiscardedOperational: false,
    ...partial,
  }
}

describe('finalCircuitScoring', () => {
  it('classifyJourneyAgainstCircuitMatrix marca INCOMPLETO con <=2 eventos útiles', () => {
    const j = journey({
      eventCount: 2,
      logicalCodeSequence: ['INGRESO', 'EGRESO'],
      preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    })
    const r = classifyJourneyAgainstCircuitMatrix(j, DEFAULT_CIRCUIT_MATRIX)
    expect(r.finalStatus).toBe('INCOMPLETO')
    expect(r.reason).toBe('EVENTOS_INSUFICIENTES')
  })

  it('classifyJourneyAgainstCircuitMatrix marca ANOMALO solo con contradicción fuerte de secuencia', () => {
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
    expect(r.sequenceRespected).toBe(false)
  })

  it('classifyJourneyAgainstCircuitMatrix no marca ANOMALO por desorden leve', () => {
    const j = journey({
      eventCount: 4,
      logicalCodeSequence: ['EGRESO', 'INGRESO', 'BALANZA_EGRESO'],
      preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    })
    const r = classifyJourneyAgainstCircuitMatrix(j, DEFAULT_CIRCUIT_MATRIX)
    expect(r.finalStatus).not.toBe('ANOMALO')
  })

  it('ingreso operativo con PREINGRESO sin RicIngCamFrente', () => {
    const entry = resolveOperationalEntry(new Set(['PREINGRESO', 'VOLCABLE', 'EGRESO']))
    expect(entry.has_operational_entry).toBe(true)
    expect(entry.entry_source).toBe('preingreso')
  })

  it('egreso operativo con BALANZA_EGRESO', () => {
    const exit = resolveOperationalExit(new Set(['INGRESO', 'BALANZA_EGRESO']), false)
    expect(exit.has_operational_exit).toBe(true)
    expect(exit.exit_source).toBe('balanza_egreso')
  })

  it('circuito completo con ingreso operativo PREINGRESO y egreso', () => {
    const j = journey({
      logicalCodeSequence: ['PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
      missingExpectedPoints: [],
    })
    const status = resolveFinalStatus({
      j,
      reliabilityScore: 85,
      hasOperationalEntry: true,
      hasOperationalExit: true,
      strong: true,
      balanzaCompleta: true,
      suspiciousDuplicate: false,
      duplicateSeverity: 'none',
      sequenceCoherent: true,
      eventCountFront: 6,
    })
    expect(status).toBe('circuito_completo')
  })

  it('probable sin ingreso con balanza completa', () => {
    const status = resolveFinalStatus({
      j: journey({ logicalCodeSequence: ['BALANZA_INGRESO', 'BALANZA_EGRESO'] }),
      reliabilityScore: 55,
      hasOperationalEntry: false,
      hasOperationalExit: true,
      strong: false,
      balanzaCompleta: true,
      suspiciousDuplicate: false,
      duplicateSeverity: 'none',
      sequenceCoherent: true,
      eventCountFront: 3,
    })
    expect(status).toBe('circuito_probable_sin_ingreso')
  })

  it('reliability_score = matched/expected*100', () => {
    const j = journey({
      preliminaryCircuitCode: 'CIRCUITO_SAN_LORENZO',
      missingExpectedPoints: ['EGRESO'],
    })
    const rel = computeJourneyReliability(j)
    expect(rel.expected_points_count).toBe(4)
    expect(rel.matched_points_count).toBe(3)
    expect(rel.reliability_score).toBe(75)
    expect(rel.reliability_explanation).toContain('Falta egreso')
  })

  it('confidence bonus sube un nivel sin cambiar score', () => {
    expect(confidenceLevelFromScore(65, false)).toBe('baja')
    expect(confidenceLevelFromScore(65, true)).toBe('media')
  })

  it('explicación legible con puntos faltantes', () => {
    const txt = buildReliabilityExplanation(5, 4, ['BALANZA_EGRESO'], 'CIRCUITO_VOLCABLE_1_2')
    expect(txt).toContain('Falta balanza egreso')
  })

  describe('resolveExecutiveCircuitDecision', () => {
    it('COMPLETO con cobertura y punto fuerte => VALIDO / COMPLETO', () => {
      const r = resolveExecutiveCircuitDecision({
        matrixFinalStatus: 'COMPLETO',
        matrixReason: 'SECUENCIA_COMPLETA',
        coverageInfo: { coveragePercent: 67, hasStrongPoint: true },
        sequenceConfig: { enabledForClassification: true, sequenceConfigured: true },
      })
      expect(r.executiveStatus).toBe('VALIDO')
      expect(r.executiveReason).toBe('CIRCUITO_COMPLETO')
      expect(r.validDetail).toBe('COMPLETO')
    })

    it('DEDUCIDO con cobertura y punto fuerte => VALIDO / DEDUCIDO', () => {
      const r = resolveExecutiveCircuitDecision({
        matrixFinalStatus: 'DEDUCIDO',
        matrixReason: 'SECUENCIA_RESPETADA_CON_HUECOS',
        coverageInfo: { coveragePercent: 67, hasStrongPoint: true },
        sequenceConfig: { enabledForClassification: true, sequenceConfigured: true },
      })
      expect(r.executiveStatus).toBe('VALIDO')
      expect(r.executiveReason).toBe('CIRCUITO_DEDUCIDO_VALIDO')
      expect(r.validDetail).toBe('DEDUCIDO')
    })

    it('ANOMALO con cobertura y punto fuerte => ANOMALO', () => {
      const r = resolveExecutiveCircuitDecision({
        matrixFinalStatus: 'ANOMALO',
        matrixReason: 'NO_RESPETA_SECUENCIA',
        coverageInfo: { coveragePercent: 67, hasStrongPoint: true },
        sequenceConfig: { enabledForClassification: true, sequenceConfigured: true },
      })
      expect(r.executiveStatus).toBe('ANOMALO')
      expect(r.executiveReason).toBe('NO_RESPETA_SECUENCIA')
    })

    it('ANOMALO sin punto fuerte => NO_EVALUABLE, no ANOMALO productivo', () => {
      const r = resolveExecutiveCircuitDecision({
        matrixFinalStatus: 'ANOMALO',
        matrixReason: 'NO_RESPETA_SECUENCIA',
        coverageInfo: { coveragePercent: 67, hasStrongPoint: false },
        sequenceConfig: { enabledForClassification: true, sequenceConfigured: true },
      })
      expect(r.executiveStatus).toBe('NO_EVALUABLE')
      expect(r.executiveReason).toBe('CIRCUITO_NO_EVALUABLE_POR_COBERTURA')
    })

    it('R26/R34 sin secuencia configurada => NO_EVALUABLE / CONFIG_ERROR_MISSING_SEQUENCE', () => {
      for (const code of ['R26', 'R34']) {
        const cfg = resolveExecutiveCircuitConfig(code)
        expect(cfg).toBeTruthy()
        const r = resolveExecutiveCircuitDecision({
          matrixFinalStatus: 'ANOMALO',
          matrixReason: 'NO_RESPETA_SECUENCIA',
          coverageInfo: {
            coveragePercent: cfg!.coveragePercent,
            hasStrongPoint: cfg!.hasStrongPoint,
          },
          sequenceConfig: {
            enabledForClassification: cfg!.enabledForClassification,
            sequenceConfigured: isExecutiveSequenceConfigured(cfg),
          },
        })
        expect(r.executiveStatus).toBe('NO_EVALUABLE')
        expect(r.executiveReason).toBe('CONFIG_ERROR_MISSING_SEQUENCE')
      }
    })

    it('códigos técnicos se ubican en matriz ejecutiva R*', () => {
      const jDespacho = journey({
        preliminaryCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'EGRESO'],
      })
      expect(resolveExecutiveCircuitConfigForJourney(jDespacho)?.code).toBe('RS_REC')
      expect(isSolidReceptionPattern(jDespacho)).toBe(true)

      const jSl = journey({ preliminaryCircuitCode: 'CIRCUITO_SAN_LORENZO' })
      expect(resolveExecutiveCircuitConfigForJourney(jSl)?.code).toBe('R7')

      const jLiqRecep = journey({
        preliminaryCircuitCode: 'CIRCUITO_LIQUIDO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO'],
        events: [{ deviceCode: 'RicCalLiq', sectorCode: 'X', occurredAt: '2026-05-12T09:00:00' } as never],
      })
      expect(resolveExecutiveCircuitConfigForJourney(jLiqRecep)?.code).toBe('R8')
      expect(isLiquidReceptionJourney(jLiqRecep)).toBe(true)
      expect(isLiquidDispatchJourney(jLiqRecep)).toBe(false)

      const jLiqDesp = journey({
        preliminaryCircuitCode: 'CIRCUITO_LIQUIDO',
        logicalCodeSequence: [
          'INGRESO',
          'PREINGRESO',
          'BALANZA_INGRESO',
          'BALANZA_EGRESO',
          'CALADA',
          'LIQUIDO',
          'EGRESO',
        ],
        events: [{ deviceCode: 'RicCalLiq', sectorCode: 'X', occurredAt: '2026-05-12T09:00:00' } as never],
      })
      expect(resolveExecutiveCircuitConfigForJourney(jLiqDesp)?.code).toBe('R16')
      expect(isLiquidDispatchJourney(jLiqDesp)).toBe(true)
      expect(isLiquidReceptionJourney(jLiqDesp)).toBe(false)

      const jSolidoSinCamara = journey({
        preliminaryCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'EGRESO'],
      })
      expect(journeyHasLiquidStrongPoint(jSolidoSinCamara)).toBe(false)
      expect(resolveExecutiveCircuitConfigForJourney(jSolidoSinCamara)?.code).toBe('RS_REC')

      const jSolidoDespacho = journey({
        preliminaryCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
        logicalCodeSequence: ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'CALADA', 'EGRESO'],
      })
      expect(resolveExecutiveCircuitConfigForJourney(jSolidoDespacho)?.code).toBe('RS_DESP')
      expect(isSolidDispatchPattern(jSolidoDespacho)).toBe(true)

      const jSolidoProbable = resolveProbableSolidExecutiveDecision({
        matrixFinalStatus: 'INCOMPLETO',
        matrixReason: 'EVENTOS_INSUFICIENTES',
        frontEventCount: 6,
        hasOperationalEntry: true,
        hasOperationalExit: true,
      })
      expect(jSolidoProbable.executiveStatus).toBe('PROBABLE')
      expect(jSolidoProbable.executiveReason).toBe('CIRCUITO_PROBABLE_INFERIDO')

      const jVolc2 = journey({
        preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
        events: [{ deviceCode: 'RicVolcable2', sectorCode: 'X', occurredAt: '2026-05-12T09:00:00' } as never],
      })
      expect(resolveExecutiveCircuitConfigForJourney(jVolc2)?.code).toBe('R6')
    })
  })

  describe('resolveExecutiveBucket (tolerancia operativa ejecutiva)', () => {
    it('INVALID_ROUTE fuerza ANOMALO antes de tolerancias de secuencia', () => {
      const mj = journey({
        preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
        missingExpectedPoints: [],
      })

      const r = resolveExecutiveBucket({
        finalStatus: 'circuito_probable',
        frontEventCount: 6,
        reliabilityScore: 85,
        sequenceCoherent: true,
        hasOperationalEntry: true,
        hasOperationalExit: true,
        strong: true,
        missingTemplatePointsCount: 0,
        expectedTemplatePoints: 7,
        j: mj,
        seqPack: { startsAtValidEntry: true, endsAtValidExit: true },
        hasInvalidRouteOperationalAlert: true,
        hasInvalidJourneyStartOperationalAlert: false,
      })
      expect(r.bucket).toBe('ANOMALO')
      expect(r.anomalyReason).toBe('INVALID_ROUTE_ALERT')
    })

    it('hueco modesto en plantilla con cierre ingreso/egreso → DEDUCIDO', () => {
      const j = journey({
        preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
        missingExpectedPoints: ['CALADA'],
      })
      const relPack = computeJourneyReliability(j)
      const r = resolveExecutiveBucket({
        finalStatus: 'incompleto_revision',
        frontEventCount: 6,
        reliabilityScore: relPack.reliability_score,
        sequenceCoherent: false,
        hasOperationalEntry: true,
        hasOperationalExit: true,
        strong: true,
        missingTemplatePointsCount: 1,
        expectedTemplatePoints: relPack.expected_points_count,
        j,
        seqPack: { startsAtValidEntry: true, endsAtValidExit: true },
        hasInvalidRouteOperationalAlert: false,
        hasInvalidJourneyStartOperationalAlert: false,
      })
      expect(r.bucket).toBe('DEDUCIDO')
      expect(r.anomalyReason).toBeNull()
    })

    it('score bajo y muchos huecos → INCOMPLETO (no ANOMALO automático)', () => {
      const j = journey({
        preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
        missingExpectedPoints: ['INGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO'],
      })
      const relPack = computeJourneyReliability(j)
      expect(relPack.reliability_score).toBeLessThan(50)
      const r = resolveExecutiveBucket({
        finalStatus: 'incompleto_revision',
        frontEventCount: 5,
        reliabilityScore: relPack.reliability_score,
        sequenceCoherent: false,
        hasOperationalEntry: true,
        hasOperationalExit: false,
        strong: false,
        missingTemplatePointsCount: 4,
        expectedTemplatePoints: relPack.expected_points_count,
        j,
        seqPack: { startsAtValidEntry: false, endsAtValidExit: false },
        hasInvalidRouteOperationalAlert: false,
        hasInvalidJourneyStartOperationalAlert: false,
      })
      expect(r.bucket).not.toBe('ANOMALO')
      expect(r.bucket).toBe('INCOMPLETO')
    })
  })
})
