/**
 * @deprecated Para imports nuevos usar `contractIntegrationRun` en truckflowTransform/contractFirst.
 * Orden actual: clasificación Workbench → esta integración (no Excel-first global aún).
 */
import { recordsToCsv } from './etlCsv'
import type { ClassifiedJourneyForTiming, SegmentTimingIndex } from './etlSegmentTiming'
import { buildSegmentTimingIndexFromExcelFirstSegments } from './etlSegmentTiming'
import { extractSegmentLegsWithTimes } from './etlSegmentTiming'
import {
  externalMovimientosNormalizedCsv,
  loadMovimientosContratoFiles,
  normalizeMovimientosContratoBatch,
  summarizeMovimientosContratoLoad,
  type MovimientosContratoFileInput,
} from './etlExternalMovimientosContrato'
import { mergeTruckflowWithMovimientos } from './etlTruckflowMovimientosMerge'
import {
  excelFirstByProductPlatformCsv,
  excelFirstMergeSummaryCsv,
  excelFirstReviewSampleCsv,
  excelNoTruckflowEvidenceDiagnosticsCsv,
  excelOperationSegmentsForScatterCsv,
  excelOperationsWithTruckflowCsv,
  mergeExcelOperationsWithTruckflowEvidence,
} from './etlExcelFirstMerge'
import {
  buildCleanJourneysForAnalysis,
  buildSegmentScatterAnalysis,
  buildTruckflowJourneysForMerge,
  buildTruckflowSegmentsForMerge,
  cleanJourneysForAnalysisCsv,
  mergedTruckflowMovimientosCsv,
  segmentScatterAnalysisCsv,
  truckflowJourneysForMergeCsv,
  truckflowSegmentsForMergeCsv,
} from './etlOperationalAnalysis'
import {
  createOperationalSample,
  operationalSampleByCircuitProductCsv,
  operationalSampleCsv,
  operationalSampleSummaryCsv,
  segmentScatterSampleCsv,
} from './etlOperationalSampling'
import {
  buildSegmentScatterByDayRows,
  normalizeExcelSegmentForScatterByDay,
  normalizeTruckflowScatterRowForByDay,
  segmentScatterByDayCsv,
} from './etlSegmentScatterByDay'

import type { KpiTiemposMovimientosSnapshot } from './etlKpiTiemposBuild'

export type MovimientosContratoIntegrationInput = {
  finalCsvRows: Record<string, unknown>[]
  journeyTimesByUid: Map<string, { start: string; end: string }>
  classifiedJourneys: ClassifiedJourneyForTiming[]
  movimientosFiles: MovimientosContratoFileInput[]
  /** Si true, no arma scatter/KPI tiempos (tramo 4 en pestaña KPI Tiempos). */
  skipKpiTiemposArtifacts?: boolean
}

export type MovimientosContratoIntegrationOutput = {
  csv: Record<string, string>
  logs: string[]
  segmentTimingFromExcelFirst: SegmentTimingIndex | null
  kpiTiemposSnapshot: KpiTiemposMovimientosSnapshot | null
  stats: {
    movimientos: ReturnType<typeof summarizeMovimientosContratoLoad>
    merge: Record<string, unknown>
    excelFirst: Record<string, unknown>
    analysisReadyCount: number
    segmentScatterRows: number
    excelFirstScatterRows: number
    operationalSampleSelected: number
    products: string[]
    platforms: string[]
  }
}

export async function runMovimientosContratoIntegration(
  input: MovimientosContratoIntegrationInput
): Promise<MovimientosContratoIntegrationOutput> {
  const logs: string[] = []

  const { raw, warnings: loadWarnings, readMeta } = loadMovimientosContratoFiles(input.movimientosFiles)
  if (readMeta.length) {
    for (const m of readMeta) {
      logs.push(
        `Lectura ${m.sheetName || '?'}: ${m.rowCount} filas, cabecera fila ${m.headerRow}, cols=${m.headers.slice(0, 6).join(', ')}`
      )
    }
  }
  const normalized = normalizeMovimientosContratoBatch(raw)
  const movStats = summarizeMovimientosContratoLoad(input.movimientosFiles, normalized, loadWarnings)

  logs.push(`Archivos Movimientos por Contrato leídos: ${movStats.filesRead}`)
  logs.push(`Movimientos externos crudos/normalizados: ${movStats.rawCount}`)
  logs.push(`Con patente válida: ${movStats.withPlate}`)
  logs.push(`Con producto: ${movStats.withProduct}`)
  logs.push(`Con plataforma: ${movStats.withPlatform}`)
  logs.push(`Con timestamp ingreso: ${movStats.withIngresoTimestamp}`)
  logs.push(`Con timestamp salida: ${movStats.withSalidaTimestamp}`)

  const truckflowJourneys = buildTruckflowJourneysForMerge(input.finalCsvRows, input.journeyTimesByUid)
  logs.push(`Journeys Truckflow para merge: ${truckflowJourneys.length}`)
  logs.push(`Journeys Truckflow con patente: ${truckflowJourneys.filter((j) => j.plate_normalized).length}`)

  const journeyMeta = new Map<
    string,
    { circuit_label: string; executive_status: string; valid_detail: string; plant_scope: string }
  >()
  const segmentLegInputs: Parameters<typeof buildTruckflowSegmentsForMerge>[0] = []

  for (const cj of input.classifiedJourneys) {
    const uid = cj.journey.journeyUid
    journeyMeta.set(uid, {
      circuit_label: cj.circuitName ?? cj.executiveCircuitCode,
      executive_status: cj.executiveStatus ?? '',
      valid_detail: cj.validDetail ?? '',
      plant_scope: '',
    })
    const legs = extractSegmentLegsWithTimes(cj.journey, cj.executiveCircuitCode)
    for (const leg of legs) {
      segmentLegInputs.push({
        journeyId: leg.journeyId,
        plate: leg.plate,
        executiveCircuitCode: leg.executiveCircuitCode,
        fromCode: leg.fromCode,
        toCode: leg.toCode,
        durationMinutes: leg.durationMinutes,
        occurredAtStart: leg.segment_start_time,
        occurredAtEnd: leg.segment_end_time,
      })
    }
  }

  for (const row of input.finalCsvRows) {
    const uid = String(row.journey_uid ?? '')
    const meta = journeyMeta.get(uid)
    if (meta) {
      meta.plant_scope = String(row.analysis_scope ?? '')
      journeyMeta.set(uid, meta)
    }
  }

  const segments = buildTruckflowSegmentsForMerge(segmentLegInputs, journeyMeta)

  const mergeResult = mergeTruckflowWithMovimientos(truckflowJourneys, normalized)
  logs.push(`Matches Excel ancla: ${mergeResult.summary.match_excel_anchor}`)
  logs.push(`Circuito asignado desde Excel: ${mergeResult.merged.filter((r) => r.circuit_from_excel).length}`)
  logs.push(`Matches probables: ${mergeResult.summary.match_probable}`)
  logs.push(`Matches múltiples resueltos: ${mergeResult.summary.match_multiple_resolved}`)
  logs.push(`Ambiguos: ${mergeResult.summary.match_ambiguous}`)
  logs.push(`Truckflow sin movimiento: ${mergeResult.summary.no_external_match}`)
  logs.push(`Movimientos sin Truckflow (diagnóstico): ${mergeResult.summary.no_truckflow_match}`)

  const excelFirstResult = await mergeExcelOperationsWithTruckflowEvidence(
    normalized,
    truckflowJourneys,
    segments
  )
  logs.push(`Excel-first: operaciones totales ${excelFirstResult.summary.total_excel_operations}`)
  logs.push(
    `Excel-first: con evidencia Truckflow ${excelFirstResult.summary.total_with_truckflow_evidence}`
  )
  logs.push(
    `Excel-first: sin evidencia Truckflow ${excelFirstResult.summary.total_without_truckflow_evidence}`
  )
  logs.push(`Excel-first: fragmentadas ${excelFirstResult.summary.external_match_fragmented}`)
  logs.push(`Excel-first: wide window ${excelFirstResult.summary.external_match_wide_window}`)
  logs.push(`Excel-first: low confidence ${excelFirstResult.summary.external_match_low_confidence}`)
  logs.push(`Excel-first: listas scatter ${excelFirstResult.summary.ready_for_scatter}`)
  logs.push(`Excel-first: listas KPI ruta completa ${excelFirstResult.summary.ready_for_full_route_kpi}`)
  if (excelFirstResult.period.period_mismatch) {
    logs.push(`ALERTA ${excelFirstResult.period.period_alert}: Truckflow no cubre rango Excel`)
  }
  logs.push(
    `Excel-first sin evidencia: no_placa=${excelFirstResult.summary.no_evidence_no_plate_in_truckflow}, fuera_ventana=${excelFirstResult.summary.no_evidence_plate_out_of_window}, fuera_periodo=${excelFirstResult.summary.no_evidence_outside_period}`
  )

  const clean = buildCleanJourneysForAnalysis(mergeResult.merged)
  const analysisReadyCount = clean.filter((r) => r.analysis_ready).length
  const operationalEnrichmentCount = clean.filter((r) => r.operational_enrichment_ready).length
  logs.push(`Journeys analysis_ready: ${analysisReadyCount}`)
  logs.push(`Journeys enriquecidos operativos (producto/plataforma): ${operationalEnrichmentCount}`)
  logs.push(
    `Sin descarga en cámara pero con dato externo: ${Number(mergeResult.summary.enriched_sin_descarga_camara ?? 0)}`
  )

  const enrichedSinDescargaRows = clean
    .filter((r) => r.operational_enrichment_ready && r.missing_camera_discharge)
    .map((r) => ({ ...r }) as Record<string, unknown>)

  const samplePack = createOperationalSample(clean)
  logs.push(`Seleccionados en muestra operativa: ${samplePack.sample.length}`)
  const sampleUids = new Set(samplePack.sample.map((s) => s.journey_uid))
  const skipKpi = input.skipKpiTiemposArtifacts === true

  const kpiTiemposSnapshot: KpiTiemposMovimientosSnapshot | null = {
    excelSegmentRows: excelFirstResult.segmentRows,
    segments,
    mergedRows: mergeResult.merged,
    cleanRows: clean,
    operationalSampleUids: [...sampleUids],
  }

  let segmentTimingFromExcelFirst: SegmentTimingIndex | null = null
  let scatter: Record<string, unknown>[] = []
  let scatterByDayCsvOut = 'circuito,tramo_operativo,fecha\n'

  if (!skipKpi) {
    const mergedByUid = new Map(mergeResult.merged.map((r) => [r.journey_uid, r]))
    const cleanByUid = new Map(clean.map((r) => [r.journey_uid, r]))
    const excelScatterReady = excelFirstResult.segmentRows.filter((r) => r.analysis_ready_for_scatter)
    segmentTimingFromExcelFirst =
      excelScatterReady.length ?
        buildSegmentTimingIndexFromExcelFirstSegments(excelScatterReady)
      : null
    if (segmentTimingFromExcelFirst) {
      logs.push(
        `KPI tiempos (Excel-first): ${segmentTimingFromExcelFirst.legs.length} tramos, ${segmentTimingFromExcelFirst.journeyCount} operaciones Excel`
      )
    }

    scatter =
      excelScatterReady.length ?
        excelScatterReady.map((r) => ({ ...r }) as Record<string, unknown>)
      : buildSegmentScatterAnalysis(segments, mergedByUid, cleanByUid)
    logs.push(
      `Filas segment_scatter_analysis: ${scatter.length}${excelScatterReady.length ? ' (Excel-first)' : ''}`
    )

    const scatterByDaySources =
      excelScatterReady.length ?
        excelScatterReady
          .map((r) => normalizeExcelSegmentForScatterByDay(r))
          .filter((s): s is NonNullable<typeof s> => s !== null)
      : scatter
          .map((r) => normalizeTruckflowScatterRowForByDay(r as never))
          .filter((s): s is NonNullable<typeof s> => s !== null)
    const scatterByDay = buildSegmentScatterByDayRows(scatterByDaySources)
    logs.push(`Filas segment_scatter_by_day: ${scatterByDay.length}`)
    scatterByDayCsvOut = segmentScatterByDayCsv(scatterByDay)
  } else {
    logs.push('KPI tiempos / dispersión: diferido (procesar en pestaña KPI Tiempos)')
  }

  const products = [...new Set(normalized.map((m) => m.product_normalized).filter(Boolean))].sort()
  const platforms = [...new Set(normalized.map((m) => m.platform_normalized).filter(Boolean))].sort()

  const csv: Record<string, string> = {
    external_movimientos_contrato_normalized: externalMovimientosNormalizedCsv(normalized),
    truckflow_journeys_for_merge: truckflowJourneysForMergeCsv(truckflowJourneys),
    truckflow_segments_for_merge: truckflowSegmentsForMergeCsv(segments),
    merged_truckflow_movimientos: mergedTruckflowMovimientosCsv(mergeResult.merged),
    truckflow_without_movimiento_match: recordsToCsv(
      mergeResult.truckflowWithoutMatch.length ?
        Object.keys(mergeResult.truckflowWithoutMatch[0]!)
      : ['journey_uid', 'reason'],
      mergeResult.truckflowWithoutMatch
    ),
    movimientos_without_truckflow_match: recordsToCsv(
      mergeResult.movimientosWithoutMatch.length ?
        Object.keys(mergeResult.movimientosWithoutMatch[0]!)
      : ['external_operation_id', 'reason'],
      mergeResult.movimientosWithoutMatch
    ),
    merge_ambiguous_cases: recordsToCsv(
      mergeResult.ambiguousCases.length ?
        Object.keys(mergeResult.ambiguousCases[0]!)
      : ['journey_uid', 'reason'],
      mergeResult.ambiguousCases
    ),
    merge_summary: recordsToCsv(Object.keys(mergeResult.summary), [mergeResult.summary]),
    clean_journeys_for_analysis: cleanJourneysForAnalysisCsv(clean),
    journeys_enriched_sin_punto_descarga: recordsToCsv(
      enrichedSinDescargaRows.length ?
        Object.keys(enrichedSinDescargaRows[0]!)
      : [
          'journey_uid',
          'plate_normalized',
          'product_normalized',
          'platform_normalized',
          'merge_status',
          'operational_enrichment_ready',
        ],
      enrichedSinDescargaRows
    ),
    ...(skipKpi ?
      {}
    : {
        segment_scatter_analysis:
          excelFirstResult.segmentRows.some((r) => r.analysis_ready_for_scatter) ?
            excelOperationSegmentsForScatterCsv(
              excelFirstResult.segmentRows.filter((r) => r.analysis_ready_for_scatter)
            )
          : segmentScatterAnalysisCsv(scatter),
      }),
    operational_sample: operationalSampleCsv(samplePack.sample),
    operational_sample_summary: operationalSampleSummaryCsv(samplePack.summary),
    operational_sample_by_circuit_product: operationalSampleByCircuitProductCsv(
      samplePack.byCircuitProduct
    ),
    ...(skipKpi ? {} : { segment_scatter_sample: segmentScatterSampleCsv(scatter, sampleUids) }),
    excel_operations_with_truckflow: excelOperationsWithTruckflowCsv(excelFirstResult.operations),
    excel_operation_segments_for_scatter: excelOperationSegmentsForScatterCsv(
      excelFirstResult.segmentRows
    ),
    excel_first_merge_summary: excelFirstMergeSummaryCsv(excelFirstResult.summary),
    excel_first_by_product_platform: excelFirstByProductPlatformCsv(excelFirstResult.byProductPlatform),
    excel_no_truckflow_evidence_diagnostics: excelNoTruckflowEvidenceDiagnosticsCsv(
      excelFirstResult.noEvidenceDiagnostics
    ),
    excel_first_review_sample: excelFirstReviewSampleCsv(excelFirstResult.reviewSample),
    ...(skipKpi ? {} : { segment_scatter_by_day: scatterByDayCsvOut }),
  }

  return {
    csv,
    logs,
    segmentTimingFromExcelFirst,
    kpiTiemposSnapshot,
    stats: {
      movimientos: movStats,
      merge: mergeResult.summary,
      excelFirst: excelFirstResult.summary,
      analysisReadyCount,
      segmentScatterRows: skipKpi ? 0 : scatter.length,
      excelFirstScatterRows: excelFirstResult.segmentRows.length,
      operationalSampleSelected: samplePack.sample.length,
      products,
      platforms,
    },
  }
}
