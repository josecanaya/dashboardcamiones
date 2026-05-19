import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  buildReliabilityExplanation,
  confidenceLevelFromScore,
  computeJourneyReliability,
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
    preliminaryCircuitConfidence: 0.8,
    isDiscardedOperational: false,
    ...partial,
  }
}

describe('finalCircuitScoring', () => {
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
      sequenceCoherent: false,
      eventCountFront: 2,
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
})
