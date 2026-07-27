import type { EtlTransformInput, EtlTransformOutput } from './etlTransformContracts'
import { runEtlTransform } from './etlTransformPipeline'
import { createPhaseStore, type EtlTransformPhaseStore } from './etlTransformPhaseStore'
import {
  attachContractIntegrationToOutput,
  buildContractPrepFromTramo1Serialized,
  runContractFirstIntegration,
} from './etlTransformContractFirst'
import {
  buildOutputAfterExcelOnlyStep,
  runExcelMovimientosNormalizeStep,
} from './etlExcelMovimientosStep'
import { resetGlobalEtlProfiler } from './etlProfile'

export type TransformTramoId = 1 | 2 | 3
export type TransformTramoStatus = 'idle' | 'running' | 'done' | 'error'

function hasMovimientosSource(inp: EtlTransformInput): boolean {
  return Boolean(inp.movimientosContratoFiles?.length || inp.preNormalizedMovimientos?.length)
}

export function createTransformPhaseSession(): EtlTransformPhaseStore {
  return createPhaseStore()
}

async function ensureJourneyPrep(inp: EtlTransformInput, phaseStore: EtlTransformPhaseStore): Promise<void> {
  if (phaseStore.tramo1) return
  await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
}

/**
 * UI: 1 = movimientos (backup), 2 = cruce Truckflow, 3 = circuitos.
 */
export async function runEtlTransformTramo(
  tramo: TransformTramoId,
  inp: EtlTransformInput,
  phaseStore: EtlTransformPhaseStore
): Promise<EtlTransformOutput> {
  if (tramo === 1) {
    phaseStore.tramo1 = null
    phaseStore.excelStep = null
    phaseStore.tramo2Prep = null
    phaseStore.contractIntegration = null
    phaseStore.tramo2Output = null
    phaseStore.tramoCompleted = 0
    const excel = await runExcelMovimientosNormalizeStep(inp)
    phaseStore.excelStep = excel
    phaseStore.tramoCompleted = 1
    return buildOutputAfterExcelOnlyStep(excel)
  }

  if (tramo === 2) {
    if (!phaseStore.excelStep) {
      phaseStore.excelStep = await runExcelMovimientosNormalizeStep(inp)
      phaseStore.tramoCompleted = Math.max(phaseStore.tramoCompleted, 1) as 0 | 1 | 2 | 3
    }
    if (!inp.events.length && !inp.alerts.length) {
      throw new Error('Cargá JSON de eventos Truckflow para el paso 2.')
    }
    await ensureJourneyPrep(inp, phaseStore)
    const prep = buildContractPrepFromTramo1Serialized(
      phaseStore.tramo1 as import('./etlTransformContractFirst').Tramo1SerializedLike
    )
    phaseStore.tramo2Prep = prep

    const normalized = phaseStore.excelStep.normalized
    if (normalized.length) {
      const mc = await runContractFirstIntegration(inp, prep, normalized)
      phaseStore.contractIntegration = mc
      let out = await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
      out = attachContractIntegrationToOutput(out, mc, prep)
      phaseStore.tramoCompleted = 2
      return out
    }

    // Sin movimientos: solo prep Truckflow.
    const out = await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
    phaseStore.tramoCompleted = 2
    return out
  }

  if (!phaseStore.tramo1) {
    throw new Error('Completá el paso 2 (cruce Truckflow) antes de circuitos.')
  }
  if (hasMovimientosSource(inp) && phaseStore.excelStep?.normalized.length && !phaseStore.contractIntegration) {
    throw new Error('Completá el paso 2 (movimientos × Truckflow) antes de circuitos.')
  }
  let out = await runEtlTransform(inp, { onlyTramo: 2, phaseStore })
  // Regenerar integración con journeys clasificados (KPI por tiempo con segmentos).
  if (
    phaseStore.excelStep?.normalized.length &&
    phaseStore.tramo2Prep?.classifiedForSegmentTiming.length
  ) {
    const prep = phaseStore.tramo2Prep
    const mc = await runContractFirstIntegration(inp, prep, phaseStore.excelStep.normalized)
    phaseStore.contractIntegration = mc
    out = attachContractIntegrationToOutput(out, mc, prep)
  }
  phaseStore.tramo2Output = out
  phaseStore.tramoCompleted = 3
  return out
}

export async function runEtlTransformAllTramos(
  inp: EtlTransformInput,
  phaseStore: EtlTransformPhaseStore
): Promise<EtlTransformOutput> {
  const profiler = resetGlobalEtlProfiler()
  const runOpts = { phaseStore, profiler }
  phaseStore.tramo1 = null
  phaseStore.excelStep = null
  phaseStore.tramo2Prep = null
  phaseStore.contractIntegration = null
  phaseStore.tramo2Output = null
  phaseStore.tramoCompleted = 0

  if (hasMovimientosSource(inp)) {
    phaseStore.excelStep = await runExcelMovimientosNormalizeStep(inp)
    phaseStore.tramoCompleted = 1
  }

  await ensureJourneyPrep(inp, phaseStore)

  // Clasificamos circuitos primero (una sola pasada) para tener las journeys reales;
  // recién después cruzamos el Excel-first, así el snapshot de KPI por tiempo trae
  // segmentos/tramos y no hace falta repetir el cruce.
  const oCircuits = await runEtlTransform(inp, { ...runOpts, onlyTramo: 2 })

  if (phaseStore.excelStep?.normalized.length && phaseStore.tramo2Prep) {
    const prep = phaseStore.tramo2Prep
    const mc = await runContractFirstIntegration(inp, prep, phaseStore.excelStep.normalized)
    phaseStore.contractIntegration = mc
    const out = attachContractIntegrationToOutput(oCircuits, mc, prep)
    phaseStore.tramo2Output = out
    phaseStore.tramoCompleted = 3
    return out
  }

  phaseStore.tramo2Output = oCircuits
  phaseStore.tramoCompleted = 3
  return oCircuits
}
