import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import {
  applyExecutiveJourneyMerges,
  EXECUTIVE_MERGE_OCR_AUTO_SIM,
  isExecutiveMergeAutoCandidate,
  type JourneyMergeCandidate,
} from './etlJourneyMerge'

function journey(uid: string, plate: string, logical: string[]): ReconstructedRealJourney {
  return {
    journeyUid: uid,
    normalizedPlate: plate,
    plate,
    logicalCodeSequence: logical,
    events: logical.map((_, i) => ({
      journeyUid: uid,
      normalizedPlate: plate,
      occurredAt: `2026-05-20T10:0${i}:00`,
      deviceCode: 'RicIngCamFte',
      sectorCode: 'RICARDONE_INGRESO',
      sequenceNumber: i + 1,
    })) as never,
    eventCount: logical.length,
    startedAt: '2026-05-20T10:00:00',
    endedAt: '2026-05-20T10:05:00',
  } as ReconstructedRealJourney
}

function cand(partial: Partial<JourneyMergeCandidate> & Pick<JourneyMergeCandidate, 'a' | 'b'>): JourneyMergeCandidate {
  return {
    match_type: 'exact_plate',
    gapMinutes: 10,
    should_review: false,
    priority: 'alta',
    plateSimilarity: 1,
    ...partial,
  }
}

describe('etlJourneyMerge', () => {
  it('aplica merge exact_plate en ventana corta', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO'])
    const jb = journey('j2', 'AA702TR', ['EGRESO'])
    const r = applyExecutiveJourneyMerges([ja, jb], [
      cand({ a: ja, b: jb, match_type: 'exact_plate' }),
    ])
    expect(r.mergeAppliedCount).toBe(1)
    expect(r.journeys).toHaveLength(1)
    expect(r.suppressedSourceUids).toEqual(['j1', 'j2'])
  })

  it('aplica merge OCR + secuencia complementaria', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO', 'PREINGRESO'])
    const jb = journey('j2', 'AA7O2TR', ['CALADA', 'EGRESO'])
    const c = cand({
      a: ja,
      b: jb,
      match_type: 'sequence_and_plate',
      plateSimilarity: EXECUTIVE_MERGE_OCR_AUTO_SIM,
    })
    expect(isExecutiveMergeAutoCandidate(c)).toBe(true)
    const r = applyExecutiveJourneyMerges([ja, jb], [c])
    expect(r.mergeAppliedCount).toBe(1)
    expect(r.journeys[0]?.eventCount).toBe(4)
  })

  it('no aplica similar_plate sin secuencia complementaria', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO'])
    const jb = journey('j2', 'AA7O2TR', ['INGRESO'])
    const c = cand({
      a: ja,
      b: jb,
      match_type: 'similar_plate',
      plateSimilarity: 0.95,
    })
    expect(isExecutiveMergeAutoCandidate(c)).toBe(false)
  })

  it('no aplica OCR si similitud baja', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO'])
    const jb = journey('j2', 'AA7O2TR', ['EGRESO'])
    const c = cand({
      a: ja,
      b: jb,
      match_type: 'sequence_and_plate',
      plateSimilarity: 0.85,
    })
    expect(isExecutiveMergeAutoCandidate(c)).toBe(false)
  })

  it('aplica merge OCR con gap hasta 4 h', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO', 'PREINGRESO'])
    const jb = journey('j2', 'AA7O2TR', ['CALADA', 'EGRESO'])
    const c = cand({
      a: ja,
      b: jb,
      match_type: 'sequence_and_plate',
      gapMinutes: 180,
      plateSimilarity: EXECUTIVE_MERGE_OCR_AUTO_SIM,
    })
    expect(isExecutiveMergeAutoCandidate(c)).toBe(true)
  })

  it('rechaza merge si gap supera 4 h', () => {
    const ja = journey('j1', 'AA702TR', ['INGRESO'])
    const jb = journey('j2', 'AA702TR', ['EGRESO'])
    const c = cand({ a: ja, b: jb, match_type: 'exact_plate', gapMinutes: 241 })
    expect(isExecutiveMergeAutoCandidate(c)).toBe(false)
  })
})
