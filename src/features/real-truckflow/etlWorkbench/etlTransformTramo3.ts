import type { EtlTransformOutput } from './etlTransformContracts'
import type { EtlTransformInput } from './etlTransformContracts'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import type { KpiTiemposBuildInput } from './etlKpiTiemposBuild'
import { runMovimientosContratoIntegration } from './etlMovimientosContratoIntegration'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import type { RawJourneyEventLike } from './auditSlCameraExcelCoverage'

export type Tramo2PrepForMovimientos = {
  finalCsvRows: Record<string, unknown>[]
  classifiedForSegmentTiming: ClassifiedJourneyForTiming[]
  journeyTimesByUid: [string, { start: string; end: string }][]
  /** Eventos frontales operativos (mismo subconjunto que merge en tramo 2). Evita O(ops×eventos) en paso 3. */
  rawTruckflowEvents: RawJourneyEventLike[]
}

export async function runMovimientosContratoTramo3(
  inp: EtlTransformInput,
  prep: Tramo2PrepForMovimientos,
  base: EtlTransformOutput
): Promise<EtlTransformOutput> {
  if (!inp.movimientosContratoFiles?.length && !inp.preNormalizedMovimientos?.length) {
    throw new Error('No hay movimientos del backup para el rango (ni XLSX legacy) antes del tramo 3.')
  }
  await yieldToBrowser()
  const journeyTimesByUid = new Map(prep.journeyTimesByUid)
  const mc = await runMovimientosContratoIntegration({
    finalCsvRows: prep.finalCsvRows,
    journeyTimesByUid,
    classifiedJourneys: prep.classifiedForSegmentTiming,
    rawTruckflowEvents: prep.rawTruckflowEvents,
    movimientosFiles: inp.movimientosContratoFiles ?? [],
    preNormalizedMovimientos: inp.preNormalizedMovimientos,
    tiemposEntrePasosFiles: inp.tiemposEntrePasosFiles,
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
