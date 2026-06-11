/**
 * Adaptador mínimo CLI: JSON local Truckflow → filas tipo Workbench para Contract-first.
 * No ejecuta matriz/comité Workbench; usa reconstrucción + preliminar en mapper.
 */
import {
  extractTruckflowPayloadArray,
  journeyDtoListFromRawExtractedRowsChunked,
} from '../../realTruckflowApi'
import {
  filterRicardoneSiteEventsOnly,
  reconstructRealJourneysIncludingInvalidPlates,
} from '../../realJourneyEventsMapper'
import type { ReconstructedRealJourney } from '../../realJourneyEvents.types'

export type LocalTruckflowDayLoadResult = {
  day: string
  eventCount: number
}

export async function readEventRecordsFromLocalJsonFile(jsonText: string): Promise<unknown[]> {
  const payload = JSON.parse(jsonText) as unknown
  return extractTruckflowPayloadArray(payload)
}

export async function loadTruckflowEventsFromLocalJsonFiles(
  files: { day: string; jsonText: string }[]
): Promise<{ events: Awaited<ReturnType<typeof journeyDtoListFromRawExtractedRowsChunked>>; perDay: LocalTruckflowDayLoadResult[] }> {
  const perDay: LocalTruckflowDayLoadResult[] = []
  const allRows: unknown[] = []
  for (const f of files) {
    const records = await readEventRecordsFromLocalJsonFile(f.jsonText)
    perDay.push({ day: f.day, eventCount: records.length })
    allRows.push(...records)
  }
  const events = await journeyDtoListFromRawExtractedRowsChunked(allRows)
  return { events, perDay }
}

export function buildCliWorkbenchInputsFromJourneys(journeys: ReconstructedRealJourney[]): {
  finalCsvRows: Record<string, unknown>[]
  journeyTimesByUid: Map<string, { start: string; end: string }>
} {
  const finalCsvRows: Record<string, unknown>[] = []
  const journeyTimesByUid = new Map<string, { start: string; end: string }>()

  for (const j of journeys) {
    journeyTimesByUid.set(j.journeyUid, { start: j.startedAt, end: j.endedAt })
    finalCsvRows.push({
      journey_uid: j.journeyUid,
      truck_plate: j.plate,
      normalized_plate: j.normalizedPlate,
      first_event_at: j.startedAt,
      last_event_at: j.endedAt,
      executive_status: 'NO_EVALUABLE',
      matrix_final_status: '',
      executive_circuit_code: j.preliminaryCircuitCode ?? '',
      executive_circuit_label: j.preliminaryCircuitName ?? '',
      valid_detail: j.preliminaryCircuitGroup ?? j.preliminaryCircuitCode ?? '',
      logical_sequence_front: j.logicalCodeSequence.join('|'),
      matched_sequence_name: '',
      matched_variation_name: '',
      coverage_percent: 0,
      has_strong_point: false,
      useful_events_count: j.eventCount,
      event_count_front: j.eventCount,
      analysis_scope: j.siteId,
      committee_reason: '',
      anomaly_origin_plant: '',
      anomaly_leg: '',
      cli_reconstruction: 'contract_first_cli_v1',
    })
  }

  return { finalCsvRows, journeyTimesByUid }
}

/** Ricardone + reconstrucción por journeyUid (incluye patentes inválidas si hay UID). */
export async function buildCliFinalCsvRowsFromLocalEventJson(
  files: { day: string; jsonText: string }[]
): Promise<{
  finalCsvRows: Record<string, unknown>[]
  journeyTimesByUid: Map<string, { start: string; end: string }>
  perDay: LocalTruckflowDayLoadResult[]
  eventCount: number
  journeyCount: number
}> {
  const { events, perDay } = await loadTruckflowEventsFromLocalJsonFiles(files)
  const ric = filterRicardoneSiteEventsOnly(events)
  const journeys = reconstructRealJourneysIncludingInvalidPlates(ric)
  const { finalCsvRows, journeyTimesByUid } = buildCliWorkbenchInputsFromJourneys(journeys)
  return {
    finalCsvRows,
    journeyTimesByUid,
    perDay,
    eventCount: ric.length,
    journeyCount: journeys.length,
  }
}
