import { normalizePlateStrict } from '../../../services/circuitPlateOcr'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { normalizePlate } from './etlExternalNormalization'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'
import type { RawJourneyEventLike } from './auditSlCameraExcelCoverage'

/** Patentes normalizadas exactas presentes en el Excel (sin longitudes ni fuzzy). */
export function excelPlateKeysFromMovimientos(
  movimientos: ExternalMovimientoContratoNormalized[]
): Set<string> {
  const plates = new Set<string>()
  for (const m of movimientos) {
    const p =
      normalizePlateStrict(m.plate_normalized || m.patente_original) ||
      normalizePlate(m.patente_original) ||
      ''
    if (p) plates.add(p)
  }
  return plates
}

/** Solo journeys cuya patente normalizada coincide exactamente con alguna patente del Excel. */
export function filterJourneysForExcelSearch(
  journeys: TruckflowJourneyForMerge[],
  movimientos: ExternalMovimientoContratoNormalized[]
): TruckflowJourneyForMerge[] {
  const plates = excelPlateKeysFromMovimientos(movimientos)
  if (!plates.size) return journeys
  return journeys.filter((j) => {
    const p = normalizePlateStrict(j.plate_normalized) || ''
    return p ? plates.has(p) : false
  })
}

export function filterFinalCsvRowsByJourneyUids(
  rows: Record<string, unknown>[],
  journeyUids: Set<string>
): Record<string, unknown>[] {
  if (!journeyUids.size) return rows
  return rows.filter((r) => journeyUids.has(String(r.journey_uid ?? '').trim()))
}

export function filterRawTruckflowEventsForExcel(
  events: RawJourneyEventLike[],
  movimientos: ExternalMovimientoContratoNormalized[],
  journeyUids?: Set<string>
): RawJourneyEventLike[] {
  const plates = excelPlateKeysFromMovimientos(movimientos)
  if (!plates.size && !journeyUids?.size) return events

  return events.filter((e) => {
    const uid = String(e.journeyUid ?? '').trim()
    if (journeyUids?.size && uid && journeyUids.has(uid)) return true
    const p =
      normalizePlateStrict(String(e.normalizedPlate ?? e.truckPlate ?? '')) ||
      normalizePlate(String(e.truckPlate ?? '')) ||
      ''
    return p ? plates.has(p) : false
  })
}
