import type { RealJourneyEventDto } from './realJourneyEvents.types'
import { compareRealEvents } from './realJourneyEventsMapper'
import { normalizeRealEventPoint } from './realEventNormalization'

const MS_MIN = 60_000
const MS_HOUR = 60 * MS_MIN

/** Hueco mínimo tras cierre (balanza/egreso) antes de contar nuevo ingreso. */
export const JOURNEY_CYCLE_MIN_GAP_AFTER_EGRESS_MS = 15 * MS_MIN
/** Hueco entre lecturas → nuevo viaje (aunque Truckflow conserve el mismo journeyUid). */
export const JOURNEY_CYCLE_MAX_GAP_MS = 6 * MS_HOUR

const ENTRY_LIKE = new Set(['INGRESO', 'PREINGRESO'])
const EGRESS_LIKE = new Set(['EGRESO', 'BALANZA_EGRESO', 'SL_INGRESO', 'EGRESO_TRASERA_EXCLUIDA'])

function eventTs(e: RealJourneyEventDto): number {
  const t = new Date(e.occurredAt).getTime()
  return Number.isFinite(t) ? t : NaN
}

/**
 * ¿Nuevo viaje entre dos eventos consecutivos del mismo journeyUid API?
 *
 * Parte si:
 * - BALANZA_EGRESO / EGRESO y luego INGRESO / PREINGRESO (≥ 15 min), o
 * - Hueco ≥ 6 h entre lecturas (incluye días distintos con espera real).
 *
 * No parte si el camión solo cruzó medianoche (menos de 6 h entre eventos).
 */
export function shouldSplitJourneyAtBoundary(
  prev: RealJourneyEventDto,
  next: RealJourneyEventDto
): boolean {
  const dt = eventTs(next) - eventTs(prev)
  if (!Number.isFinite(dt) || dt < 0) return false

  const prevL = normalizeRealEventPoint(prev).logicalCode
  const nextL = normalizeRealEventPoint(next).logicalCode

  if (EGRESS_LIKE.has(prevL) && ENTRY_LIKE.has(nextL) && dt >= JOURNEY_CYCLE_MIN_GAP_AFTER_EGRESS_MS) {
    return true
  }

  if (dt >= JOURNEY_CYCLE_MAX_GAP_MS) {
    return true
  }

  return false
}

/** Parte eventos de un mismo journeyUid en segmentos temporales/ciclo. */
export function splitJourneyEventsIntoSegments(events: RealJourneyEventDto[]): RealJourneyEventDto[][] {
  const sorted = [...events].sort(compareRealEvents)
  if (sorted.length <= 1) return sorted.length ? [sorted] : []

  const segments: RealJourneyEventDto[][] = []
  let cur: RealJourneyEventDto[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    if (shouldSplitJourneyAtBoundary(prev, next)) {
      segments.push(cur)
      cur = [next]
    } else {
      cur.push(next)
    }
  }
  if (cur.length) segments.push(cur)
  return segments
}

export type JourneyCycleSplitResult = {
  events: RealJourneyEventDto[]
  sourceJourneyCount: number
  outputJourneyCount: number
  splitsApplied: number
}

/**
 * Truckflow a veces deja un solo journeyUid para varios días/ciclos.
 * Asigna UIDs sintéticos por segmento antes de reconstruir viajes en el ETL.
 */
export function applyJourneyCycleSplitsToEvents(
  events: RealJourneyEventDto[]
): JourneyCycleSplitResult {
  const byUid = new Map<string, RealJourneyEventDto[]>()
  const noUid: RealJourneyEventDto[] = []

  for (const e of events) {
    const uid = String(e.journeyUid ?? '').trim()
    if (!uid) {
      noUid.push(e)
      continue
    }
    if (!byUid.has(uid)) byUid.set(uid, [])
    byUid.get(uid)!.push(e)
  }

  const out: RealJourneyEventDto[] = [...noUid]
  let splitsApplied = 0
  let outputJourneyCount = 0

  for (const [uid, group] of byUid) {
    const segments = splitJourneyEventsIntoSegments(group)
    outputJourneyCount += segments.length
    if (segments.length <= 1) {
      out.push(...(segments[0] ?? group))
      continue
    }
    splitsApplied += segments.length - 1
    segments.forEach((seg, idx) => {
      const splitUid = `${uid}__cycle_${idx + 1}`
      seg.forEach((e, seq) => {
        out.push({
          ...e,
          journeyUid: splitUid,
          sequenceNumber: seq + 1,
        })
      })
    })
  }

  return {
    events: out,
    sourceJourneyCount: byUid.size,
    outputJourneyCount,
    splitsApplied,
  }
}
