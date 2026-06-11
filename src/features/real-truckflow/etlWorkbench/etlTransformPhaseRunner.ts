import type { EtlTransformInput, EtlTransformOutput } from './etlTransformPipeline'
import { runEtlTransform } from './etlTransformPipeline'
import { createPhaseStore, type EtlTransformPhaseStore } from './etlTransformPhaseStore'
import { runMovimientosContratoTramo3 } from './etlTransformTramo3'

export type TransformTramoId = 1 | 2 | 3

export type TransformTramoStatus = 'idle' | 'running' | 'done' | 'error'

export function createTransformPhaseSession(): EtlTransformPhaseStore {
  return createPhaseStore()
}

export async function runEtlTransformTramo(
  tramo: TransformTramoId,
  inp: EtlTransformInput,
  phaseStore: EtlTransformPhaseStore
): Promise<EtlTransformOutput> {
  if (tramo === 1) {
    phaseStore.tramo1 = null
    phaseStore.tramo2Prep = null
    phaseStore.tramo2Output = null
    phaseStore.tramoCompleted = 0
    return runEtlTransform(inp, { onlyTramo: 1, phaseStore })
  }
  if (tramo === 2) {
    if (!phaseStore.tramo1) {
      throw new Error('Completá el tramo 1 (Journeys y calidad) antes del tramo 2.')
    }
    const out = await runEtlTransform(inp, { onlyTramo: 2, phaseStore })
    phaseStore.tramo2Output = out
    phaseStore.tramoCompleted = 2
    return out
  }
  if (!phaseStore.tramo2Output || !phaseStore.tramo2Prep) {
    throw new Error('Completá el tramo 2 (Circuitos y comité) antes del tramo 3.')
  }
  const out = await runMovimientosContratoTramo3(inp, phaseStore.tramo2Prep, phaseStore.tramo2Output)
  phaseStore.tramoCompleted = 3
  return out
}

export async function runEtlTransformAllTramos(
  inp: EtlTransformInput,
  phaseStore: EtlTransformPhaseStore
): Promise<EtlTransformOutput> {
  phaseStore.tramo1 = null
  phaseStore.tramo2Prep = null
  phaseStore.tramo2Output = null
  phaseStore.tramoCompleted = 0
  await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
  const o2 = await runEtlTransform(inp, { onlyTramo: 2, phaseStore })
  phaseStore.tramo2Output = o2
  if (inp.movimientosContratoFiles?.length) {
    const o3 = await runMovimientosContratoTramo3(inp, phaseStore.tramo2Prep!, o2)
    phaseStore.tramoCompleted = 3
    return o3
  }
  phaseStore.tramoCompleted = 2
  return o2
}
