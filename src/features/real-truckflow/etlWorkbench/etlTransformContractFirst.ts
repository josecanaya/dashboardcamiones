import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import { buildCliWorkbenchInputsFromJourneys } from '../../../services/truckflowTransform/contractFirst/contractFirstCliAdapter'
import type { EtlTransformInput, EtlTransformOutput } from './etlTransformContracts'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import {
  runMovimientosContratoIntegration,
  type MovimientosContratoIntegrationOutput,
} from './etlMovimientosContratoIntegration'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import type { RawJourneyEventLike } from './auditSlCameraExcelCoverage'
import type { Tramo2PrepForMovimientos } from './etlTransformTramo3'

export type Tramo1SerializedLike = {
  journeys?: ReconstructedRealJourney[]
  operationalFrontEvents?: RealJourneyEventDto[]
}

export function buildContractPrepFromTramo1Serialized(s: Tramo1SerializedLike): Tramo2PrepForMovimientos {
  const journeys = s.journeys ?? []
  const { finalCsvRows, journeyTimesByUid } = buildCliWorkbenchInputsFromJourneys(journeys)
  const operationalFrontEvents =
    s.operationalFrontEvents?.length ?
      s.operationalFrontEvents
    : journeys.flatMap((j) => j.events)

  const rawTruckflowEvents: RawJourneyEventLike[] = operationalFrontEvents.map((e) => ({
    journeyUid: e.journeyUid,
    truckPlate: e.truckPlate,
    normalizedPlate: e.normalizedPlate,
    deviceCode: e.deviceCode,
    sectorCode: e.sectorCode,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
  }))

  return {
    finalCsvRows,
    classifiedForSegmentTiming: [],
    journeyTimesByUid: [...journeyTimesByUid.entries()],
    rawTruckflowEvents,
  }
}

export function movimientosStatsFromIntegration(
  mc: MovimientosContratoIntegrationOutput,
  truckflowJourneyCount: number
): NonNullable<EtlTransformOutput['stats']['movimientosContrato']> {
  return {
    enabled: true,
    logs: mc.logs,
    warnings: mc.stats.movimientos.warnings,
    filesRead: mc.stats.movimientos.filesRead,
    rawCount: mc.stats.movimientos.rawCount,
    normalizedCount: mc.stats.movimientos.normalizedCount,
    withPlate: mc.stats.movimientos.withPlate,
    withProduct: mc.stats.movimientos.withProduct,
    withPlatform: mc.stats.movimientos.withPlatform,
    truckflowJourneys: truckflowJourneyCount,
    analysisReadyCount: mc.stats.analysisReadyCount,
    segmentScatterRows: mc.stats.segmentScatterRows,
    excelFirstScatterRows: mc.stats.excelFirstScatterRows,
    operationalSampleSelected: mc.stats.operationalSampleSelected,
    merge: mc.stats.merge,
    excelFirst: mc.stats.excelFirst,
    products: mc.stats.products,
    platforms: mc.stats.platforms,
    liquidMovements: mc.stats.liquidMovements,
    transileInternoVolcable: mc.stats.transileInternoVolcable,
  }
}

/** Excel + cruce Truckflow (antes de matriz de circuitos). */
export async function runContractFirstIntegration(
  inp: EtlTransformInput,
  prep: Tramo2PrepForMovimientos,
  preNormalizedMovimientos?: ExternalMovimientoContratoNormalized[]
): Promise<MovimientosContratoIntegrationOutput> {
  if (!inp.movimientosContratoFiles?.length && !preNormalizedMovimientos?.length) {
    throw new Error('No hay movimientos del backup para el rango (ni XLSX legacy).')
  }
  await yieldToBrowser()
  const journeyTimesByUid = new Map(prep.journeyTimesByUid)
  return runMovimientosContratoIntegration({
    finalCsvRows: prep.finalCsvRows,
    journeyTimesByUid,
    classifiedJourneys: prep.classifiedForSegmentTiming,
    rawTruckflowEvents: prep.rawTruckflowEvents,
    movimientosFiles: inp.movimientosContratoFiles ?? [],
    preNormalizedMovimientos,
    excelDrivenTruckflowFilter: true,
    tiemposEntrePasosFiles: inp.tiemposEntrePasosFiles,
    skipKpiTiemposArtifacts: true,
    onProgress: inp.onContractFirstProgress,
  })
}

export function attachContractIntegrationToOutput(
  base: EtlTransformOutput,
  mc: MovimientosContratoIntegrationOutput,
  prep: Tramo2PrepForMovimientos
): EtlTransformOutput {
  return {
    ...base,
    csv: { ...base.csv, ...mc.csv },
    tables: { ...base.tables, ...mc.tables },
    stats: {
      ...base.stats,
      movimientosContrato: movimientosStatsFromIntegration(mc, prep.finalCsvRows.length),
    },
    kpiTiemposPrepared: {
      classifiedJourneys: prep.classifiedForSegmentTiming,
      movimientosSnapshot: mc.kpiTiemposSnapshot,
    },
  }
}
