import { isValidArgentinaPlate, normalizePlate } from './argentinaPlate'
import type { ApiRealJourneyEventRow, RealJourneyEventDto } from './realJourneyEvents.types'
import { yieldToBrowser } from '../utils/yieldToBrowser'

export function annotateRealJourneyEventsWithPlateFields(events: ApiRealJourneyEventRow[]): RealJourneyEventDto[] {
  return events.map((e) => {
    const rawTruckPlate = String(e.truckPlate ?? '').trim()
    const normalizedPlate = normalizePlate(rawTruckPlate)
    const isValidPlate = isValidArgentinaPlate(rawTruckPlate)
    return {
      ...e,
      truckPlate: e.truckPlate,
      rawTruckPlate,
      normalizedPlate,
      isValidPlate,
    }
  })
}

/** Patentes sobre muchísimas filas sin bloquear la UI (export / API grandes). */
export async function annotateRealJourneyEventsWithPlateFieldsChunked(
  events: ApiRealJourneyEventRow[],
  chunkSize = 4000
): Promise<RealJourneyEventDto[]> {
  if (events.length <= chunkSize) return annotateRealJourneyEventsWithPlateFields(events)
  const out: RealJourneyEventDto[] = []
  for (let i = 0; i < events.length; i += chunkSize) {
    out.push(...annotateRealJourneyEventsWithPlateFields(events.slice(i, i + chunkSize)))
    if (i + chunkSize < events.length) await yieldToBrowser()
  }
  return out
}
