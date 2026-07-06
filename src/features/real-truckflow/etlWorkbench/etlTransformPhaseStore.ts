import type { Tramo2PrepForMovimientos } from './etlTransformTramo3'
import type { MovimientosContratoIntegrationOutput } from './etlMovimientosContratoIntegration'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import type { ExcelMovimientosStepResult } from './etlExcelMovimientosStep'

/** Snapshots en memoria entre tramos del Transform (pestaña Análisis local). */
export type EtlTransformPhaseStore = {
  tramoCompleted: 0 | 1 | 2 | 3
  tramo1: unknown | null
  /** Excel normalizado (Paso UI 1, sin Truckflow). */
  excelStep: ExcelMovimientosStepResult | null
  tramo2Prep: Tramo2PrepForMovimientos | null
  /** Merge Excel ↔ Truckflow (Paso UI 2). */
  contractIntegration: MovimientosContratoIntegrationOutput | null
  tramo2Output: import('./etlTransformPipeline').EtlTransformOutput | null
}

export function createPhaseStore(): EtlTransformPhaseStore {
  return {
    tramoCompleted: 0,
    tramo1: null,
    excelStep: null,
    tramo2Prep: null,
    contractIntegration: null,
    tramo2Output: null,
  }
}

export type EtlTransformRunOptions = {
  /** Si se omite, ejecuta tramos 1→2→3 en una sola pasada. */
  onlyTramo?: 1 | 2 | 3
  phaseStore?: EtlTransformPhaseStore
  /** Medición por etapa (ETL_PROFILE / VITE_ETL_PROFILE). */
  profiler?: import('./etlProfile').EtlProfiler
  /** Si false, omite CSV debug de pasos 1–2 salvo ETL_DEV_MODE. */
  emitDebugCsv?: boolean
}
