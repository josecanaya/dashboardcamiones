import { isValidArgentinaPlate, normalizePlate } from './argentinaPlate'
import type { ApiRealJourneyEventRow, RealJourneyEventDto } from './realJourneyEvents.types'

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
