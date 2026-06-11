import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import type { ExcelOperationSegmentScatterRow } from './etlExcelFirstMerge'
import { excelOperationSegmentsForScatterCsv } from './etlExcelFirstMerge'
import {
  buildCircuitTimingIndex,
  circuitTimingJourneysCsv,
  circuitTimingSummaryCsv,
  type CircuitTimingIndex,
} from './etlCircuitTiming'
import {
  buildSegmentScatterAnalysis,
  segmentScatterAnalysisCsv,
  type CleanJourneyForAnalysis,
  type TruckflowSegmentForMerge,
} from './etlOperationalAnalysis'
import type { MergedTruckflowMovimientoRow } from './etlTruckflowMovimientosMerge'
import { segmentScatterSampleCsv } from './etlOperationalSampling'
import {
  buildSegmentScatterByDayRows,
  normalizeExcelSegmentForScatterByDay,
  normalizeTruckflowScatterRowForByDay,
  segmentScatterByDayCsv,
} from './etlSegmentScatterByDay'
import {
  buildAllSectorOccupancy30MinRows,
  sectorOccupancy30MinCsv,
  sectorOccupancyEventsCsv,
} from './etlSectorOccupancy30min'
import {
  buildSegmentTimingIndex,
  buildSegmentTimingIndexFromExcelFirstSegments,
  segmentTimingKpiCsv,
  segmentTimingLegsCsv,
  type ClassifiedJourneyForTiming,
  type SegmentTimingIndex,
} from './etlSegmentTiming'

export type KpiTiemposMovimientosSnapshot = {
  excelSegmentRows: ExcelOperationSegmentScatterRow[]
  segments: TruckflowSegmentForMerge[]
  mergedRows: MergedTruckflowMovimientoRow[]
  cleanRows: CleanJourneyForAnalysis[]
  /** UIDs de muestra operativa (para CSV sample). */
  operationalSampleUids: string[]
}

export type KpiTiemposBuildInput = {
  classifiedJourneys: ClassifiedJourneyForTiming[]
  movimientosSnapshot: KpiTiemposMovimientosSnapshot | null
}

export type KpiTiemposBuildOutput = {
  segmentTiming: SegmentTimingIndex
  circuitTiming: CircuitTimingIndex
  csv: {
    segment_timing_kpi: string
    segment_timing_legs: string
    segment_scatter_analysis: string
    segment_scatter_by_day: string
    segment_scatter_sample: string
    circuit_timing_summary: string
    circuit_timing_journeys: string
    sector_occupancy_30min: string
    sector_occupancy_events: string
  }
  logs: string[]
}

export async function buildKpiTiemposArtifacts(input: KpiTiemposBuildInput): Promise<KpiTiemposBuildOutput> {
  const logs: string[] = []
  await yieldToBrowser()

  let segmentTiming = buildSegmentTimingIndex(input.classifiedJourneys, {
    committeeGroups: ['COMPLETOS'],
  })
  logs.push(
    `Truckflow COMPLETOS: ${segmentTiming.legs.length} tramos, ${segmentTiming.journeyCount} journeys`
  )

  const snap = input.movimientosSnapshot
  const excelScatterReady = snap?.excelSegmentRows.filter((r) => r.analysis_ready_for_scatter) ?? []

  if (excelScatterReady.length) {
    await yieldToBrowser()
    const fromExcel = buildSegmentTimingIndexFromExcelFirstSegments(excelScatterReady)
    segmentTiming = fromExcel
    logs.push(
      `Excel-first: ${fromExcel.legs.length} tramos, ${fromExcel.journeyCount} operaciones (ready_for_scatter)`
    )
  }

  await yieldToBrowser()
  const circuitTiming = buildCircuitTimingIndex(input.classifiedJourneys, {
    committeeGroups: ['COMPLETOS'],
  })

  let scatter: Record<string, unknown>[] = []
  if (excelScatterReady.length) {
    scatter = excelScatterReady.map((r) => ({ ...r }) as Record<string, unknown>)
  } else if (snap) {
    const mergedByUid = new Map(snap.mergedRows.map((r) => [r.journey_uid, r]))
    const cleanByUid = new Map(snap.cleanRows.map((r) => [r.journey_uid, r]))
    scatter = buildSegmentScatterAnalysis(snap.segments, mergedByUid, cleanByUid)
  }
  logs.push(`segment_scatter_analysis: ${scatter.length} filas`)

  await yieldToBrowser()
  const scatterByDaySources =
    excelScatterReady.length ?
      excelScatterReady
        .map((r) => normalizeExcelSegmentForScatterByDay(r))
        .filter((s): s is NonNullable<typeof s> => s !== null)
    : scatter
        .map((r) => normalizeTruckflowScatterRowForByDay(r as never))
        .filter((s): s is NonNullable<typeof s> => s !== null)
  const scatterByDay = buildSegmentScatterByDayRows(scatterByDaySources)
  logs.push(`segment_scatter_by_day: ${scatterByDay.length} filas`)

  const sampleUids = new Set(snap?.operationalSampleUids ?? [])
  const segment_scatter_analysis =
    excelScatterReady.length ?
      excelOperationSegmentsForScatterCsv(excelScatterReady)
    : segmentScatterAnalysisCsv(scatter)

  await yieldToBrowser()
  const occupancy = buildAllSectorOccupancy30MinRows(scatterByDay)
  logs.push(
    `sector_occupancy_30min: ${occupancy.series.length} intervalos · events: ${occupancy.events.length}`
  )

  return {
    segmentTiming,
    circuitTiming,
    csv: {
      segment_timing_kpi: segmentTimingKpiCsv(segmentTiming),
      segment_timing_legs: segmentTimingLegsCsv(segmentTiming),
      segment_scatter_analysis,
      segment_scatter_by_day: segmentScatterByDayCsv(scatterByDay),
      segment_scatter_sample: segmentScatterSampleCsv(scatter, sampleUids),
      circuit_timing_summary: circuitTimingSummaryCsv(circuitTiming),
      circuit_timing_journeys: circuitTimingJourneysCsv(circuitTiming),
      sector_occupancy_30min: sectorOccupancy30MinCsv(occupancy.series),
      sector_occupancy_events: sectorOccupancyEventsCsv(occupancy.events),
    },
    logs,
  }
}
