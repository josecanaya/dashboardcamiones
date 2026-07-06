import { normalizePlateStrict } from '../../../services/circuitPlateOcr'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { normalizePlate } from './etlExternalNormalization'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'
import type { RawJourneyEventLike } from './auditSlCameraExcelCoverage'

export function excelPlateKeysFromMovimientos(movimientos: ExternalMovimientoContratoNormalized[]): {
  plates: Set<string>
  plateLengths: Set<number>
} {
  const plates = new Set<string>()
  const plateLengths = new Set<number>()
  for (const m of movimientos) {
    const p =
      normalizePlateStrict(m.plate_normalized || m.patente_original) ||
      normalizePlate(m.patente_original) ||
      ''
    if (!p) continue
    plates.add(p)
    plateLengths.add(p.length)
  }
  return { plates, plateLengths }
}

/** Solo journeys que pueden cruzar con filas Excel (patente exacta o bucket OCR por longitud). */
export function filterJourneysForExcelSearch(
  journeys: TruckflowJourneyForMerge[],
  movimientos: ExternalMovimientoContratoNormalized[]
): TruckflowJourneyForMerge[] {
  const { plates, plateLengths } = excelPlateKeysFromMovimientos(movimientos)
  if (!plates.size) return journeys

  const filtered = journeys.filter((j) => {
    const p = normalizePlateStrict(j.plate_normalized) || ''
    if (!p) return false
    return plates.has(p) || plateLengths.has(p.length)
  })
  return filtered.length > 0 ? filtered : journeys
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
  const { plates } = excelPlateKeysFromMovimientos(movimientos)
  if (!plates.size && !journeyUids?.size) return events

  return events.filter((e) => {
    const uid = String(e.journeyUid ?? '').trim()
    if (journeyUids?.size && uid && journeyUids.has(uid)) return true
    const p =
      normalizePlateStrict(String(e.normalizedPlate ?? e.truckPlate ?? '')) ||
      normalizePlate(String(e.truckPlate ?? '')) ||
      ''
    return p && plates.has(p)
  })
}
