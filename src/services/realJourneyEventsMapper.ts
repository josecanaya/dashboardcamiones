/**
 * Capa: reconstrucción — agrupa eventos en journeys; aplica preliminar al armar.
 * Núcleo Transform; cambios aquí impactan casi todo el downstream.
 */
import type {
  RealJourneyEventDto,
  ReconstructedRealJourney,
  ReconstructedRealJourneyCore,
  ReconstructedRealSiteId,
} from './realJourneyEvents.types'
import { lookupRealSectorCode, UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER } from '../data/realSectorCodeMap'

import { analyzeRealJourneyQuality, occurredAtLocalDayKey } from './realJourneyQuality'
import { normalizeRealEventPoint } from './realEventNormalization'
import { classifyOperationalPreliminaryCircuit } from './realPreliminaryCircuit'

/** Quita lecturas del puerto San Lorenzo por prefijo. Preferir {@link filterRicardoneSiteEventsOnly}. */
export function excludePuertoSanLorenzoSectorEvents(events: RealJourneyEventDto[]): RealJourneyEventDto[] {
  return events.filter((e) => {
    const code = (e.sectorCode ?? '').trim().toUpperCase()
    return !code.startsWith('PUERTO_SAN_LORENZO_')
  })
}

/** Secuencias alineadas 1:1 con rawSectorSequence; "?" donde no hay mapeo en REAL_SECTOR_CODE_MAP. */
function buildLogicalSequences(rawSectorSequence: string[]): {
  logicalSectorSequence: string[]
  unmappedSectorCodes: string[]
} {
  const logicalSectorSequence: string[] = []
  const unmappedSeen = new Set<string>()
  const unmappedSectorCodes: string[] = []

  for (const raw of rawSectorSequence) {
    const trimmed = raw.trim()
    const entry = lookupRealSectorCode(trimmed)
    if (entry) {
      logicalSectorSequence.push(entry.logicalSector)
    } else {
      logicalSectorSequence.push(UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER)
      if (trimmed && !unmappedSeen.has(trimmed)) {
        unmappedSeen.add(trimmed)
        unmappedSectorCodes.push(trimmed)
      }
    }
  }

  return { logicalSectorSequence, unmappedSectorCodes }
}

/** Orden dentro de un mismo journey: occurredAt asc, fallback sequenceNumber asc. */
export function compareRealEvents(a: RealJourneyEventDto, b: RealJourneyEventDto): number {
  const ta = new Date(a.occurredAt).getTime()
  const tb = new Date(b.occurredAt).getTime()
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
  const sq = a.sequenceNumber - b.sequenceNumber
  if (sq !== 0) return sq
  return a.id - b.id
}

export function inferSiteIdFromSectorCode(sectorCode: string): ReconstructedRealSiteId {
  const s = (sectorCode ?? '').trim()
  const upper = s.toUpperCase()
  if (upper.startsWith('RICARDONE_')) return 'ricardone'
  if (upper.startsWith('PUERTO_SAN_LORENZO_')) return 'san_lorenzo'
  if (upper.includes('AVELLANEDA')) return 'avellaneda'
  return 'unknown'
}

/** Solo eventos Ricardone por `sectorCode` (`RICARDONE_*`): excluye San Lorenzo y el resto de sitios/no clasificados. */
export function filterRicardoneSiteEventsOnly(events: RealJourneyEventDto[]): RealJourneyEventDto[] {
  return events.filter((e) => inferSiteIdFromSectorCode(e.sectorCode) === 'ricardone')
}

function inferJourneySiteId(sortedEvents: RealJourneyEventDto[]): ReconstructedRealSiteId {
  for (const e of sortedEvents) {
    const sid = inferSiteIdFromSectorCode(e.sectorCode)
    if (sid !== 'unknown') return sid
  }
  return 'unknown'
}

/** Solo eventos con formato de patente Argentina válido (post-OCR normalizado). */
export function filterValidPlateRealEvents(events: RealJourneyEventDto[]): RealJourneyEventDto[] {
  return events.filter((e) => e.isValidPlate === true)
}

function reconstructRealJourneysInner(operational: RealJourneyEventDto[]): ReconstructedRealJourney[] {
  const byJourney = new Map<string, RealJourneyEventDto[]>()
  for (const ev of operational) {
    const key = ev.journeyUid
    if (!key) continue
    if (!byJourney.has(key)) byJourney.set(key, [])
    byJourney.get(key)!.push(ev)
  }

  const result: ReconstructedRealJourney[] = []
  for (const [, group] of byJourney) {
    const sorted = [...group].sort(compareRealEvents)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const startedAt = first.occurredAt
    const endedAt = last.occurredAt
    const t0 = new Date(startedAt).getTime()
    const t1 = new Date(endedAt).getTime()
    const durationMinutes =
      Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, Math.round((t1 - t0) / 60000)) : 0

    const rawSectorSequence = sorted.map((e) => e.sectorCode)
    const rawDeviceSequence = sorted.map((e) => e.deviceCode)
    const { logicalSectorSequence, unmappedSectorCodes } =
      buildLogicalSequences(rawSectorSequence)
    const plate = first.normalizedPlate
    const normalizedPlate = first.normalizedPlate
    const isValidPlate = first.isValidPlate

    const day = occurredAtLocalDayKey(startedAt)

    const normPoints = sorted.map(normalizeRealEventPoint)

    const core: ReconstructedRealJourneyCore = {
      journeyUid: first.journeyUid,
      plate,
      normalizedPlate,
      isValidPlate,
      startedAt,
      endedAt,
      durationMinutes,
      eventCount: sorted.length,
      siteId: inferJourneySiteId(sorted),
      day,
      rawSectorSequence,
      logicalSectorSequence,
      unmappedSectorCodes,
      rawDeviceSequence,
      deviceCodeSequence: rawDeviceSequence,
      normalizedPointSequence: normPoints.map((n) => n.pointType),
      logicalCodeSequence: normPoints.map((n) => n.logicalCode),
      events: sorted,
    }

    const qual = analyzeRealJourneyQuality(core)
    const cls = classifyOperationalPreliminaryCircuit(qual)

    result.push({
      ...qual,
      preliminaryCircuitCode: cls.preliminaryCircuitCode,
      preliminaryCircuitName: cls.preliminaryCircuitName,
      preliminaryCircuitConfidence: cls.preliminaryCircuitConfidence,
      preliminaryCircuitReason: cls.preliminaryCircuitReason,
      preliminaryCircuitGroup: cls.preliminaryCircuitGroup,
      preliminaryCircuitVariant: cls.preliminaryCircuitVariant,
      missingExpectedPoints: cls.missingExpectedPoints,
      excludedRearCameraEventsCount: cls.excludedRearCameraEventsCount,
      classificationReason: cls.classificationReason,
      isDiscardedOperational: cls.isDiscardedOperational,
      feedsOperationalAnalytics: !cls.isDiscardedOperational,
    })
  }

  result.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  return result
}

export function reconstructRealJourneys(events: RealJourneyEventDto[]): ReconstructedRealJourney[] {
  return reconstructRealJourneysInner(filterValidPlateRealEvents(events))
}

/** Reconstrucción ETL: incluye patentes inválidas si el journey tiene `journeyUid`. */
export function reconstructRealJourneysIncludingInvalidPlates(events: RealJourneyEventDto[]): ReconstructedRealJourney[] {
  return reconstructRealJourneysInner(events.filter((e) => String(e.journeyUid ?? '').trim()))
}

export function getUniqueRealSectorCodes(events: RealJourneyEventDto[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    if (e.sectorCode) set.add(e.sectorCode.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function getUniqueRealDeviceCodes(events: RealJourneyEventDto[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    if (e.deviceCode) set.add(e.deviceCode.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function sectorCodeEventCounts(events: RealJourneyEventDto[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) {
    const k = e.sectorCode.trim()
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export function deviceCodeEventCounts(events: RealJourneyEventDto[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) {
    const k = e.deviceCode.trim()
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}
