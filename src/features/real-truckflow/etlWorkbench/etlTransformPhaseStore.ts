import type { Tramo2PrepForMovimientos } from './etlTransformTramo3'

/** Snapshots en memoria entre tramos del Transform (pestaña Análisis local). */
export type EtlTransformPhaseStore = {
  tramoCompleted: 0 | 1 | 2 | 3
  tramo1: unknown | null
  /** Datos para cruce Excel (tramo 3). */
  tramo2Prep: Tramo2PrepForMovimientos | null
  /** Resultado Truckflow tras tramo 2 (sin merge Excel). */
  tramo2Output: import('./etlTransformPipeline').EtlTransformOutput | null
}

export function createPhaseStore(): EtlTransformPhaseStore {
  return { tramoCompleted: 0, tramo1: null, tramo2Prep: null, tramo2Output: null }
}

export type EtlTransformRunOptions = {
  /** Si se omite, ejecuta tramos 1→2→3 en una sola pasada. */
  onlyTramo?: 1 | 2 | 3
  phaseStore?: EtlTransformPhaseStore
}
