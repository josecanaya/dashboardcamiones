import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents, reconstructRealJourneysIncludingInvalidPlates } from '../../../services/realJourneyEventsMapper'

/** Ventana máxima entre fragmentos (espera en calada/playa puede superar 30 min). */
export const EXECUTIVE_MERGE_AUTO_GAP_MINUTES = 240
/** Misma ventana para detectar candidatos en debug CSV. */
export const EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES = EXECUTIVE_MERGE_AUTO_GAP_MINUTES
/** Similitud OCR mínima para auto-merge con secuencias complementarias. */
export const EXECUTIVE_MERGE_OCR_AUTO_SIM = 0.92

export type JourneyMergeCandidate = {
  a: ReconstructedRealJourney
  b: ReconstructedRealJourney
  match_type: 'exact_plate' | 'similar_plate' | 'sequence_and_plate'
  gapMinutes: number
  should_review: boolean
  priority: 'alta' | 'media' | 'baja'
  plateSimilarity: number
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

/** Candidato apto para merge automático antes de clasificación ejecutiva. */
export function isExecutiveMergeAutoCandidate(c: JourneyMergeCandidate): boolean {
  if (c.gapMinutes > EXECUTIVE_MERGE_AUTO_GAP_MINUTES) return false
  if (c.should_review) return false
  if (c.priority !== 'alta') return false

  if (c.match_type === 'exact_plate') return true

  if (c.match_type === 'sequence_and_plate') {
    return c.plateSimilarity >= EXECUTIVE_MERGE_OCR_AUTO_SIM
  }

  return false
}

/** Aplica merges de alta confianza (exacto u OCR+secuencia) antes de clasificación ejecutiva. */
export function applyExecutiveJourneyMerges(
  journeys: ReconstructedRealJourney[],
  candidates: JourneyMergeCandidate[]
): ExecutiveJourneyMergeResult {
  const used = new Set<string>()
  const merged: ReconstructedRealJourney[] = []
  const mergedUidBySource = new Map<string, string>()

  for (const c of candidates) {
    if (!isExecutiveMergeAutoCandidate(c)) continue
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
