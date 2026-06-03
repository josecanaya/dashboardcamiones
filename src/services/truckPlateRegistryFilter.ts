import type { TruckPlateRegistryEntry } from '../domain/truckPlateRegistry'
import { buildRegistryLookup, normalizeRegistryPlate } from '../domain/truckPlateRegistry'
import type { TruckPlateRegistryDocument } from '../domain/truckPlateRegistry'
import type { RealAlertDto } from './realTruckflowApi'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { ReconstructedRealJourney } from './realJourneyEvents.types'

export type PlateExclusionHit = {
  plate: string
  category: TruckPlateRegistryEntry['category']
  entryId: string
  label?: string
}

function plateFromEvent(e: RealJourneyEventDto): string {
  return normalizeRegistryPlate(String(e.normalizedPlate ?? e.truckPlate ?? ''))
}

function plateFromJourney(j: ReconstructedRealJourney): string {
  return normalizeRegistryPlate(String(j.normalizedPlate ?? j.plate ?? ''))
}

export function lookupPlateExclusion(
  plateRaw: string,
  lookup: Map<string, TruckPlateRegistryEntry>
): PlateExclusionHit | null {
  const plate = normalizeRegistryPlate(plateRaw)
  if (!plate) return null
  const entry = lookup.get(plate)
  if (!entry) return null
  return {
    plate,
    category: entry.category,
    entryId: entry.id,
    label: entry.label,
  }
}

export function filterEventsByPlateRegistry(
  events: RealJourneyEventDto[],
  doc: TruckPlateRegistryDocument | null | undefined
): { kept: RealJourneyEventDto[]; excluded: RealJourneyEventDto[]; byPlate: Map<string, number> } {
  const lookup = buildRegistryLookup(doc)
  if (lookup.size === 0) {
    return { kept: events, excluded: [], byPlate: new Map() }
  }
  const kept: RealJourneyEventDto[] = []
  const excluded: RealJourneyEventDto[] = []
  const byPlate = new Map<string, number>()
  for (const e of events) {
    const p = plateFromEvent(e)
    if (p && lookup.has(p)) {
      excluded.push(e)
      byPlate.set(p, (byPlate.get(p) ?? 0) + 1)
    } else {
      kept.push(e)
    }
  }
  return { kept, excluded, byPlate }
}

export function filterJourneysByPlateRegistry(
  journeys: ReconstructedRealJourney[],
  doc: TruckPlateRegistryDocument | null | undefined
): { kept: ReconstructedRealJourney[]; excluded: ReconstructedRealJourney[] } {
  const lookup = buildRegistryLookup(doc)
  if (lookup.size === 0) {
    return { kept: journeys, excluded: [] }
  }
  const kept: ReconstructedRealJourney[] = []
  const excluded: ReconstructedRealJourney[] = []
  for (const j of journeys) {
    const p = plateFromJourney(j)
    if (p && lookup.has(p)) excluded.push(j)
    else kept.push(j)
  }
  return { kept, excluded }
}

function plateFromAlert(a: RealAlertDto): string {
  const payload = a.payload && typeof a.payload === 'object' ? (a.payload as Record<string, unknown>) : {}
  const raw =
    a.truckPlate ??
    (payload.normalizedPlate as string | undefined) ??
    (payload.normalized_plate as string | undefined) ??
    (payload.plate as string | undefined) ??
    (payload.truckPlate as string | undefined) ??
    ''
  return normalizeRegistryPlate(String(raw))
}

export function filterAlertsByPlateRegistry(
  alerts: RealAlertDto[],
  doc: TruckPlateRegistryDocument | null | undefined
): { kept: RealAlertDto[]; excluded: RealAlertDto[] } {
  const lookup = buildRegistryLookup(doc)
  if (lookup.size === 0) {
    return { kept: alerts, excluded: [] }
  }
  const kept: RealAlertDto[] = []
  const excluded: RealAlertDto[] = []
  for (const a of alerts) {
    const p = plateFromAlert(a)
    if (p && lookup.has(p)) excluded.push(a)
    else kept.push(a)
  }
  return { kept, excluded }
}
