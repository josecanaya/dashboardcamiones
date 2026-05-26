import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents, reconstructRealJourneysIncludingInvalidPlates } from '../../../services/realJourneyEventsMapper'

export type JourneyMergeCandidate = {
  a: ReconstructedRealJourney
  b: ReconstructedRealJourney
  match_type: 'exact_plate' | 'similar_plate' | 'sequence_and_plate'
  gapMinutes: number
  should_review: boolean
  priority: 'alta' | 'media' | 'baja'
}

export type ExecutiveJourneyMergeResult = {
  journeys: ReconstructedRealJourney[]
  mergeAppliedCount: number
  suppressedSourceUids: string[]
  mergedUidBySource: Map<string, string>
}

function mergeTwoJourneys(a: ReconstructedRealJourney, b: ReconstructedRealJourney): ReconstructedRealJourney {
  const mergedUid = `merged_${a.journeyUid.slice(0, 12)}__${b.journeyUid.slice(0, 12)}`
  const events: RealJourneyEventDto[] = [...a.events, ...b.events]
    .sort(compareRealEvents)
    .map((e, idx) => ({
      ...e,
      journeyUid: mergedUid,
      sequenceNumber: idx + 1,
    }))
  const rebuilt = reconstructRealJourneysIncludingInvalidPlates(events)
  return rebuilt[0] ?? a
}

/** Aplica merges de alta confianza (fragmentos) antes de clasificación ejecutiva. */
export function applyExecutiveJourneyMerges(
  journeys: ReconstructedRealJourney[],
  candidates: JourneyMergeCandidate[]
): ExecutiveJourneyMergeResult {
  const used = new Set<string>()
  const merged: ReconstructedRealJourney[] = []
  const mergedUidBySource = new Map<string, string>()

  for (const c of candidates) {
    if (c.match_type !== 'exact_plate') continue
    if (c.gapMinutes > 30) continue
    if (c.should_review) continue
    if (c.priority !== 'alta') continue
    if (used.has(c.a.journeyUid) || used.has(c.b.journeyUid)) continue

    const combined = mergeTwoJourneys(c.a, c.b)
    merged.push(combined)
    used.add(c.a.journeyUid)
    used.add(c.b.journeyUid)
    mergedUidBySource.set(c.a.journeyUid, combined.journeyUid)
    mergedUidBySource.set(c.b.journeyUid, combined.journeyUid)
  }

  const rest = journeys.filter((j) => !used.has(j.journeyUid))
  return {
    journeys: [...merged, ...rest],
    mergeAppliedCount: merged.length,
    suppressedSourceUids: [...used],
    mergedUidBySource,
  }
}
