/**
 * @deprecated Para imports nuevos usar `contractIntegrationRun` en truckflowTransform/contractFirst.
 * Orden actual: clasificación Workbench → esta integración (no Excel-first global aún).
 */
import { recordsToCsv } from './etlCsv'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
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
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import {
  filterFinalCsvRowsByJourneyUids,
  filterJourneysForExcelSearch,
  filterRawTruckflowEventsForExcel,
} from './etlExcelDrivenTruckflow'
import { mergeTruckflowWithMovimientos } from './etlTruckflowMovimientosMerge'
import {
  excelFirstByProductPlatformCsv,
  excelFirstCandidateDiagnosticsCsv,
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
  buildTruckflowJourneysForExcelMerge,
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
  buildExcelScatterByDaySources,
  normalizeTruckflowScatterRowForByDay,
  segmentScatterByDayCsv,
} from './etlSegmentScatterByDay'
import {
  buildLiquidMovementsReport,
  formatLiquidMovementsLog,
  liquidMovementsRicCalLiqCsv,
  liquidMovementsAceiteTruckflowExcelCsv,
  liquidMovementsSlS10Csv,
  liquidMovementsSummaryCsv,
  type LiquidMovementsSummary,
} from './liquidMovementsWorkbench'
import {
  buildTransileInternoVolcableReport,
  formatTransileInternoVolcableLog,
  transileInternoVolcableSessionsCsv,
  transileInternoVolcableSummaryCsv,
  type TransileInternoVolcableSummary,
} from './transileInternoVolcable'
import {
  buildTransileExternoReport,
  formatTransileExternoLog,
  transileExternoOperationsCsv,
  transileExternoSessionsCsv,
  transileExternoSummaryCsv,
  type TransileExternoSummary,
} from './transileExternoCiclo'

import type { KpiTiemposMovimientosSnapshot } from './etlKpiTiemposBuild'
import {
  enrichMovimientosWithTiemposEntrePasos,
  loadTiemposEntrePasosFiles,
} from './etlTiemposEntrePasos'
import { createPlateMatchCache, plateMatchCacheSize } from './etlPlateMatchCache'
import {
  countUniqueNormalizedPlates,
  emitContractFirstProgress,
  runContractFirstStage,
  type ContractFirstProgressCallback,
  type ContractFirstStageTiming,
} from './etlContractFirstProgress'
import type { EtlProfiler } from './etlProfile'

export type MovimientosContratoIntegrationInput = {
  finalCsvRows: Record<string, unknown>[]
  journeyTimesByUid: Map<string, { start: string; end: string }>
  classifiedJourneys: ClassifiedJourneyForTiming[]
  rawTruckflowEvents?: import('./auditSlCameraExcelCoverage').RawJourneyEventLike[]
  movimientosFiles: MovimientosContratoFileInput[]
  /** Si viene del paso 1 UI, no se vuelve a leer el XLSX. */
  preNormalizedMovimientos?: ExternalMovimientoContratoNormalized[]
  /** Acota journeys/eventos Truckflow a patentes del Excel (default true). */
  excelDrivenTruckflowFilter?: boolean
  tiemposEntrePasosFiles?: import('./etlTiemposEntrePasos').TiemposEntrePasosFileInput[]
  /** Si true, no arma scatter/KPI tiempos (tramo 4 en pestaña KPI Tiempos). */
  skipKpiTiemposArtifacts?: boolean
  /** Telemetría opcional Paso 3 (UI / consola). */
  onProgress?: ContractFirstProgressCallback
  profiler?: EtlProfiler
}

export type MovimientosContratoIntegrationOutput = {
  csv: Record<string, string>
  logs: string[]
  stageTimings: ContractFirstStageTiming[]
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
    liquidMovements?: LiquidMovementsSummary
    transileInternoVolcable?: TransileInternoVolcableSummary
    transileExterno?: TransileExternoSummary
  }
}

export async function runMovimientosContratoIntegration(
  input: MovimientosContratoIntegrationInput
): Promise<MovimientosContratoIntegrationOutput> {
  const logs: string[] = []
  const stageTimings: ContractFirstStageTiming[] = []
  const runStartedAt = performance.now()
  const onProgress = input.onProgress
  const profiler = input.profiler
  const plateMatchCache = createPlateMatchCache()

  let profileAt = performance.now()
  let normalized: ExternalMovimientoContratoNormalized[]
  let loadWarnings: string[] = []
  let readMeta: { sheetName?: string; rowCount: number; headerRow: number; headers: string[] }[] = []

  if (input.preNormalizedMovimientos?.length) {
    normalized = input.preNormalizedMovimientos
    if (profiler?.enabled) profiler.mark('normalizeRows', 0)
  } else {
    const loaded = loadMovimientosContratoFiles(input.movimientosFiles)
    const { raw } = loaded
    loadWarnings = loaded.warnings
    readMeta = loaded.readMeta
    if (profiler?.enabled) profiler.mark('readExcel', performance.now() - profileAt)
    profileAt = performance.now()
    if (readMeta.length) {
      for (const m of readMeta) {
        logs.push(
          `Lectura ${m.sheetName || '?'}: ${m.rowCount} filas, cabecera fila ${m.headerRow}, cols=${m.headers.slice(0, 6).join(', ')}`
        )
      }
    }
    const normalizedBase = normalizeMovimientosContratoBatch(raw)
    const tepLoad =
      input.tiemposEntrePasosFiles?.length ?
        loadTiemposEntrePasosFiles(input.tiemposEntrePasosFiles)
      : { rows: [], warnings: [] as string[] }
    for (const w of tepLoad.warnings) logs.push(w)
    if (tepLoad.rows.length) {
      logs.push(`TiemposEntrePasos filas: ${tepLoad.rows.length}`)
    }
    normalized = enrichMovimientosWithTiemposEntrePasos(normalizedBase, tepLoad.rows)
    if (profiler?.enabled) profiler.mark('normalizeRows', performance.now() - profileAt)
    profileAt = performance.now()
  }

  const movStats = summarizeMovimientosContratoLoad(
    input.movimientosFiles,
    normalized,
    loadWarnings
  )
  const excelUniquePlates = countUniqueNormalizedPlates(normalized.map((m) => m.plate_normalized))
  console.info('[CONTRACT_FIRST_MERGE] inicio', {
    excelRows: normalized.length,
    excelUniquePlates,
    truckflowFinalRows: input.finalCsvRows.length,
    classifiedJourneys: input.classifiedJourneys.length,
    skipKpi: input.skipKpiTiemposArtifacts === true,
  })

  logs.push(`Archivos Movimientos por Contrato leídos: ${movStats.filesRead}`)
  logs.push(`Movimientos externos crudos/normalizados: ${movStats.rawCount}`)
  logs.push(`Con patente válida: ${movStats.withPlate}`)
  logs.push(`Con producto: ${movStats.withProduct}`)
  logs.push(`Con plataforma: ${movStats.withPlatform}`)
  logs.push(`Con timestamp ingreso: ${movStats.withIngresoTimestamp}`)
  logs.push(`Con timestamp salida: ${movStats.withSalidaTimestamp}`)

  const truckflowJourneysStage = await runContractFirstStage(
    'build_truckflow_journeys',
    'Armar journeys Truckflow para merge Excel',
    runStartedAt,
    onProgress,
    () => buildTruckflowJourneysForExcelMerge(input.classifiedJourneys, input.finalCsvRows, input.journeyTimesByUid),
    { classifiedJourneys: input.classifiedJourneys.length, finalRows: input.finalCsvRows.length }
  )
  stageTimings.push(truckflowJourneysStage.timing)
  let truckflowJourneys = truckflowJourneysStage.result
  const excelFilter = input.excelDrivenTruckflowFilter !== false
  let finalCsvRowsForMerge = input.finalCsvRows
  let rawEventsForMerge = input.rawTruckflowEvents

  if (excelFilter) {
    const beforeJ = truckflowJourneys.length
    truckflowJourneys = filterJourneysForExcelSearch(truckflowJourneys, normalized)
    const journeyUids = new Set(truckflowJourneys.map((j) => j.journey_uid))
    finalCsvRowsForMerge = filterFinalCsvRowsByJourneyUids(input.finalCsvRows, journeyUids)
    if (rawEventsForMerge?.length) {
      rawEventsForMerge = filterRawTruckflowEventsForExcel(rawEventsForMerge, normalized, journeyUids)
    }
    logs.push(
      `Búsqueda acotada a Excel: ${truckflowJourneys.length} journeys Truckflow (antes ${beforeJ}), ${finalCsvRowsForMerge.length} filas prep`
    )
  }

  const truckflowUniquePlates = countUniqueNormalizedPlates(truckflowJourneys.map((j) => j.plate_normalized))
  logs.push(`Journeys Truckflow para merge: ${truckflowJourneys.length} (CSV final: ${input.finalCsvRows.length})`)
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

  const segmentsStage = await runContractFirstStage(
    'build_segments',
    'Armar segmentos Truckflow',
    runStartedAt,
    onProgress,
    () => buildTruckflowSegmentsForMerge(segmentLegInputs, journeyMeta),
    { segmentLegInputs: segmentLegInputs.length, classifiedJourneys: input.classifiedJourneys.length }
  )
  stageTimings.push(segmentsStage.timing)
  const segments = segmentsStage.result

  const mergeStage = await runContractFirstStage(
    'merge_truckflow_movimientos',
    'Merge journey ↔ Excel (patente exacta)',
    runStartedAt,
    onProgress,
    async () =>
      mergeTruckflowWithMovimientos(truckflowJourneys, normalized, {
        plateMatchCache,
      }),
    {
      excelRows: normalized.length,
      journeys: truckflowJourneys.length,
      complexity: 'O(mov+journey) cruce exacto por patente (Map.get)',
    }
  )
  stageTimings.push(mergeStage.timing)
  const mergeResult = mergeStage.result
  logs.push(`Matches Excel ancla: ${mergeResult.summary.match_excel_anchor}`)
  logs.push(`Circuito asignado desde Excel: ${mergeResult.merged.filter((r) => r.circuit_from_excel).length}`)
  logs.push(`Matches probables: ${mergeResult.summary.match_probable}`)
  logs.push(`Matches múltiples resueltos: ${mergeResult.summary.match_multiple_resolved}`)
  logs.push(`Ambiguos: ${mergeResult.summary.match_ambiguous}`)
  logs.push(`Truckflow sin movimiento: ${mergeResult.summary.no_external_match}`)
  logs.push(`Movimientos sin Truckflow (diagnóstico): ${mergeResult.summary.no_truckflow_match}`)

  const excelFirstStage = await runContractFirstStage(
    'merge_excel_first_evidence',
    'Excel-first por operación contractual',
    runStartedAt,
    onProgress,
    () =>
      mergeExcelOperationsWithTruckflowEvidence(normalized, truckflowJourneys, segments, {
        plateMatchCache,
        onExcelOperationProgress: (current, total, discardPartial) => {
          emitContractFirstProgress(onProgress, runStartedAt, {
            step: 'merge_excel_first_evidence',
            label: 'Excel-first por operación',
            current,
            total,
            details: discardPartial ? { ...discardPartial } : undefined,
          })
        },
      }),
    {
      excelRows: normalized.length,
      journeys: truckflowJourneys.length,
      segments: segments.length,
      complexity: 'O(mov+journey) cruce exacto por patente (sin fuzzy OCR)',
    }
  )
  const excelFirstResult = excelFirstStage.result
  stageTimings.push({
    ...excelFirstStage.timing,
    details: {
      ...excelFirstStage.timing.details,
      ...excelFirstResult.discardCounters,
    },
  })
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
  const dc = excelFirstResult.discardCounters
  logs.push(
    `Excel-first descartes: ventana=${dc.rejected_by_time_window}, OCR bajo=${dc.rejected_by_low_ocr_similarity}, fuzzy ambiguo=${dc.rejected_by_ambiguous_fuzzy}, planta(info)=${dc.rejected_by_site_or_plant}, prefilter pool=${dc.candidates_after_prefilter}`
  )

  emitContractFirstProgress(onProgress, runStartedAt, {
    step: 'merge_summary',
    label: 'Resumen merge',
    current: 1,
    total: 1,
    details: {
      excelUniquePlates,
      truckflowUniquePlates,
      match_exact: mergeResult.summary.match_exact,
      match_probable: mergeResult.summary.match_probable,
      match_fuzzy_plate: mergeResult.summary.match_fuzzy_plate,
      match_ambiguous: mergeResult.summary.match_ambiguous,
      no_external_match: mergeResult.summary.no_external_match,
      no_truckflow_match: mergeResult.summary.no_truckflow_match,
      excel_with_evidence: excelFirstResult.summary.total_with_truckflow_evidence,
      excel_without_evidence: excelFirstResult.summary.total_without_truckflow_evidence,
      ocrCacheEntries: plateMatchCacheSize(plateMatchCache),
      ...excelFirstResult.discardCounters,
    },
  })

  const cleanStage = await runContractFirstStage(
    'clean_journeys',
    'Clean journeys for analysis',
    runStartedAt,
    onProgress,
    () => buildCleanJourneysForAnalysis(mergeResult.merged)
  )
  stageTimings.push(cleanStage.timing)
  const clean = cleanStage.result
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

  const sampleStage = await runContractFirstStage(
    'operational_sample',
    'Muestra operativa',
    runStartedAt,
    onProgress,
    () => createOperationalSample(clean)
  )
  stageTimings.push(sampleStage.timing)
  const samplePack = sampleStage.result
  logs.push(`Seleccionados en muestra operativa: ${samplePack.sample.length}`)
  const sampleUids = new Set(samplePack.sample.map((s) => s.journey_uid))
  const skipKpi = input.skipKpiTiemposArtifacts === true

  const liquidReport = buildLiquidMovementsReport({
    operations: excelFirstResult.operations,
    segmentRows: excelFirstResult.segmentRows,
    classifiedJourneys: input.classifiedJourneys,
    rawEvents: rawEventsForMerge,
  })
  logs.push(formatLiquidMovementsLog(liquidReport.summary))

  const transileVolcableReport = buildTransileInternoVolcableReport({
    classifiedJourneys: input.classifiedJourneys,
    operations: excelFirstResult.operations,
  })
  logs.push(formatTransileInternoVolcableLog(transileVolcableReport.summary))

  const detectedExcelHeaders = [...new Set(readMeta.flatMap((m) => m.headers ?? []))]
  const transileExternoReport = buildTransileExternoReport({
    movimientos: normalized,
    detectedHeaders: detectedExcelHeaders,
  })
  logs.push(formatTransileExternoLog(transileExternoReport.summary))
  if (transileExternoReport.summary.movimientos_de_vuelta === 0) {
    logs.push(
      `Transile externo: columna "es de vuelta" ${
        transileExternoReport.summary.columna_detectada ?
          `detectada como "${transileExternoReport.summary.columna_detectada}" pero sin valores SI`
        : 'NO detectada'
      }. Headers Excel: ${detectedExcelHeaders.join(' | ') || '(sin headers)'}`
    )
  }

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
        buildExcelScatterByDaySources(excelScatterReady)
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

  const csvStage = await runContractFirstStage(
    'export_csv',
    'Generar CSV de conciliación',
    runStartedAt,
    onProgress,
    async () => {
      await yieldToBrowser()
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
    excel_first_candidate_diagnostics: excelFirstCandidateDiagnosticsCsv(
      excelFirstResult.candidateDiagnostics
    ),
    excel_first_review_sample: excelFirstReviewSampleCsv(excelFirstResult.reviewSample),
    liquid_movements_riccalliq_cohort: liquidMovementsRicCalLiqCsv(liquidReport.ricCalLiqRows),
    liquid_movements_sl1_sl5_s10: liquidMovementsSlS10Csv(liquidReport.slLiquidRows),
    liquid_movements_aceite_truckflow_excel: liquidMovementsAceiteTruckflowExcelCsv(
      liquidReport.aceiteTruckflowExcelRows
    ),
    liquid_movements_summary: liquidMovementsSummaryCsv(liquidReport.summary),
    transile_interno_volcable_sessions: transileInternoVolcableSessionsCsv(
      transileVolcableReport.sessions
    ),
    transile_interno_volcable_summary: transileInternoVolcableSummaryCsv(
      transileVolcableReport.summary
    ),
    transile_externo_operaciones: transileExternoOperationsCsv(transileExternoReport.operations),
    transile_externo_sessions: transileExternoSessionsCsv(transileExternoReport.sessions),
    transile_externo_summary: transileExternoSummaryCsv(transileExternoReport.summary),
    ...(skipKpi ? {} : { segment_scatter_by_day: scatterByDayCsvOut }),
      }
      return csv
    },
    { csvKeys: 20 }
  )
  stageTimings.push(csvStage.timing)
  const csv = csvStage.result

  const totalMs = Math.round(performance.now() - runStartedAt)
  console.info('[CONTRACT_FIRST_MERGE] fin', { totalMs, stageTimings })
  logs.push(`Duración total Paso 3 (ms): ${totalMs}`)
  for (const t of stageTimings) {
    logs.push(`  etapa ${t.step}: ${t.durationMs}ms`)
    if (!profiler?.enabled) continue
    const profileKey =
      t.step === 'merge_truckflow_movimientos' ? 'mergeTruckflow'
      : t.step === 'merge_excel_first_evidence' ? 'mergeExcelFirst'
      : t.step === 'export_csv' ? 'exportCsv'
      : t.step === 'build_truckflow_journeys' || t.step === 'build_segments' ? 'buildIndexes'
      : t.step
    profiler.mark(profileKey, t.durationMs)
  }

  return {
    csv,
    logs,
    stageTimings,
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
      liquidMovements: liquidReport.summary,
      transileInternoVolcable: transileVolcableReport.summary,
      transileExterno: transileExternoReport.summary,
    },
  }
}
