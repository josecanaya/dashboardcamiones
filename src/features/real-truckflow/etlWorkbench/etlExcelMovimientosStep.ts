import type { EtlTransformInput, EtlTransformOutput } from './etlTransformPipeline'
import { ETL_TRANSFORM_RULES_VERSION } from './etlTransformPipeline'
import {
  externalMovimientosNormalizedCsv,
  loadMovimientosContratoFiles,
  normalizeMovimientosContratoBatch,
  summarizeMovimientosContratoLoad,
  type ExternalMovimientoContratoNormalized,
} from './etlExternalMovimientosContrato'
import {
  enrichMovimientosWithTiemposEntrePasos,
  loadTiemposEntrePasosFiles,
} from './etlTiemposEntrePasos'
import { countUniqueNormalizedPlates } from './etlContractFirstProgress'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'

export type ExcelMovimientosStepResult = {
  normalized: ExternalMovimientoContratoNormalized[]
  loadWarnings: string[]
  movStats: ReturnType<typeof summarizeMovimientosContratoLoad>
  uniquePlates: number
  csvNormalized: string
  logs: string[]
}

/** Paso UI 1: solo lectura y limpieza de Excel (sin JSON Truckflow). */
export async function runExcelMovimientosNormalizeStep(
  inp: EtlTransformInput
): Promise<ExcelMovimientosStepResult> {
  if (!inp.movimientosContratoFiles?.length) {
    throw new Error('Cargá archivos XLSX de Movimientos por Contrato.')
  }
  await yieldToBrowser()
  const logs: string[] = []
  const { raw, warnings: loadWarnings, readMeta } = loadMovimientosContratoFiles(inp.movimientosContratoFiles)
  if (readMeta.length) {
    for (const m of readMeta) {
      logs.push(
        `Lectura ${m.sheetName || '?'}: ${m.rowCount} filas, cabecera fila ${m.headerRow}, cols=${m.headers.slice(0, 6).join(', ')}`
      )
    }
  }
  const normalizedBase = normalizeMovimientosContratoBatch(raw)
  const tepLoad =
    inp.tiemposEntrePasosFiles?.length ?
      loadTiemposEntrePasosFiles(inp.tiemposEntrePasosFiles)
    : { rows: [], warnings: [] as string[] }
  for (const w of tepLoad.warnings) logs.push(w)
  const normalized = enrichMovimientosWithTiemposEntrePasos(normalizedBase, tepLoad.rows)
  const movStats = summarizeMovimientosContratoLoad(inp.movimientosContratoFiles, normalized, loadWarnings)
  const uniquePlates = countUniqueNormalizedPlates(normalized.map((m) => m.plate_normalized))

  logs.push(`Movimientos normalizados: ${movStats.normalizedCount}`)
  logs.push(`Patentes únicas en Excel: ${uniquePlates}`)
  logs.push(`Con producto: ${movStats.withProduct} · Con plataforma: ${movStats.withPlatform}`)

  return {
    normalized,
    loadWarnings,
    movStats,
    uniquePlates,
    csvNormalized: externalMovimientosNormalizedCsv(normalized),
    logs,
  }
}

export function buildOutputAfterExcelOnlyStep(excel: ExcelMovimientosStepResult): EtlTransformOutput {
  return {
    csv: {
      external_movimientos_contrato_normalized: excel.csvNormalized,
    },
    stats: {
      step1: {
        frontEvents: 0,
        rearEvents: 0,
        frontAlerts: 0,
        rearAlerts: 0,
        pctRearExcluded: 0,
      },
      plateRegistry: {
        activeExclusionEntries: 0,
        eventsExcluded: 0,
        alertsExcluded: 0,
        uniquePlatesExcluded: 0,
      },
      step2: { cameras: [], sectors: [] },
      step3: {
        journeysTotal: 0,
        journeysValidFront: 0,
        rearOnlyExcluded: 0,
        journeysWithRearEventsRemoved: 0,
        single_event_discarded: 0,
        duplicate_suspected: 0,
        incomplete_sequence_count: 0,
        classifiedCircuitsOperational: 0,
        incompleteOperational: 0,
        unclassifiedCount: 0,
        cleanJourneysCount: 0,
      },
      step4: {
        candidates: 0,
        candidatesBeforeCap: 0,
        byExactPlate: 0,
        bySimilarPlate: 0,
        bySequenceAndPlate: 0,
      },
      coherence: {
        ingreso_frontal_event_count: 0,
        ingreso_frontal_unique_plates: 0,
        ingreso_frontal_unique_journeys: 0,
        ingresos_operativos_count: 0,
        total_journeys_raw: 0,
        rear_only_journeys_excluded: 0,
        journeys_cycle_splits_applied: 0,
        journeys_after_rear_filter: 0,
        final_circuits_count: 0,
        final_classified_count: 0,
        final_incomplete_count: 0,
        final_circuitos_completos: 0,
        final_circuitos_probables: 0,
        final_circuitos_sin_ingreso: 0,
        final_circuitos_sin_egreso: 0,
        final_incompletos_revision: 0,
        final_descartados: 0,
        circuitos_con_ingreso_operativo: 0,
        circuitos_con_egreso_operativo: 0,
        circuitos_con_ingreso_y_egreso_operativo: 0,
        journey_vs_ingreso_ratio: null,
        final_circuits_vs_ingreso_ratio: null,
        journeyFragmentationWarn: false,
        circuitsVersusIngresoWarn: false,
        coherenceLabel: 'Excel listo',
        coherenceDetail: 'Ejecutá paso 2 para buscar estas patentes en Truckflow.',
        exclusionMotives: [],
      },
      validation: {
        totalLprMalfunctionAlerts: 0,
        lprMalfunctionByCamera: [],
        cameraWithMostLpr: null,
        circuitosClasificados: 0,
        registrosIncompletosOperativos: 0,
        sinClasificar: 0,
        mergeCandidatesFiltered: 0,
        final_circuits_count: 0,
      },
      executive: undefined,
      movimientosContrato: {
        enabled: true,
        logs: excel.logs,
        warnings: excel.movStats.warnings,
        filesRead: excel.movStats.filesRead,
        rawCount: excel.movStats.rawCount,
        normalizedCount: excel.movStats.normalizedCount,
        withPlate: excel.movStats.withPlate,
        withProduct: excel.movStats.withProduct,
        withPlatform: excel.movStats.withPlatform,
        truckflowJourneys: 0,
        analysisReadyCount: 0,
        segmentScatterRows: 0,
        excelFirstScatterRows: 0,
        operationalSampleSelected: 0,
        merge: {},
        excelFirst: { excel_only_step: true, unique_plates: excel.uniquePlates },
        products: [...new Set(excel.normalized.map((m) => m.product_normalized).filter(Boolean))],
        platforms: [...new Set(excel.normalized.map((m) => m.platform_normalized).filter(Boolean))],
      },
    },
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
  }
}
