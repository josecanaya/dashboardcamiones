import type { EtlTransformOutput } from './etlTransformPipeline'
import type { EtlTransformInput } from './etlTransformPipeline'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import type { KpiTiemposBuildInput } from './etlKpiTiemposBuild'
import { runMovimientosContratoIntegration } from './etlMovimientosContratoIntegration'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'

export type Tramo2PrepForMovimientos = {
  finalCsvRows: Record<string, unknown>[]
  classifiedForSegmentTiming: ClassifiedJourneyForTiming[]
  journeyTimesByUid: [string, { start: string; end: string }][]
}

export async function runMovimientosContratoTramo3(
  inp: EtlTransformInput,
  prep: Tramo2PrepForMovimientos,
  base: EtlTransformOutput
): Promise<EtlTransformOutput> {
  if (!inp.movimientosContratoFiles?.length) {
    throw new Error('Cargá archivos XLSX de Movimientos por Contrato antes del tramo 3.')
  }
  await yieldToBrowser()
  const journeyTimesByUid = new Map(prep.journeyTimesByUid)
  const mc = await runMovimientosContratoIntegration({
    finalCsvRows: prep.finalCsvRows,
    journeyTimesByUid,
    classifiedJourneys: prep.classifiedForSegmentTiming,
    movimientosFiles: inp.movimientosContratoFiles,
    skipKpiTiemposArtifacts: true,
    onProgress: inp.onContractFirstProgress,
  })
  const kpiTiemposPrepared: KpiTiemposBuildInput = {
    classifiedJourneys: prep.classifiedForSegmentTiming,
    movimientosSnapshot: mc.kpiTiemposSnapshot,
  }
  return {
    ...base,
    csv: { ...base.csv, ...mc.csv },
    stats: {
      ...base.stats,
      movimientosContrato: {
        enabled: true,
        logs: mc.logs,
        warnings: mc.stats.movimientos.warnings,
        filesRead: mc.stats.movimientos.filesRead,
        rawCount: mc.stats.movimientos.rawCount,
        normalizedCount: mc.stats.movimientos.normalizedCount,
        withPlate: mc.stats.movimientos.withPlate,
        withProduct: mc.stats.movimientos.withProduct,
        withPlatform: mc.stats.movimientos.withPlatform,
        truckflowJourneys: prep.finalCsvRows.length,
        analysisReadyCount: mc.stats.analysisReadyCount,
        segmentScatterRows: mc.stats.segmentScatterRows,
        excelFirstScatterRows: mc.stats.excelFirstScatterRows,
        operationalSampleSelected: mc.stats.operationalSampleSelected,
        merge: mc.stats.merge,
        excelFirst: mc.stats.excelFirst,
        products: mc.stats.products,
        platforms: mc.stats.platforms,
      },
    },
    kpiTiemposPrepared,
  }
}
