import type { EtlTransformInput, EtlTransformOutput } from './etlTransformPipeline'
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

export function createTransformPhaseSession(): EtlTransformPhaseStore {
  return createPhaseStore()
}

async function ensureJourneyPrep(inp: EtlTransformInput, phaseStore: EtlTransformPhaseStore): Promise<void> {
  if (phaseStore.tramo1) return
  await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
}

/**
 * UI: 1 = solo Excel, 2 = buscar patentes Excel en Truckflow, 3 = circuitos.
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
    if (!phaseStore.excelStep?.normalized.length) {
      throw new Error('Completá el paso 1 (limpieza Excel) antes de buscar en Truckflow.')
    }
    if (!inp.events.length && !inp.alerts.length) {
      throw new Error('Cargá JSON de eventos Truckflow para el paso 2.')
    }
    await ensureJourneyPrep(inp, phaseStore)
    const prep = buildContractPrepFromTramo1Serialized(
      phaseStore.tramo1 as import('./etlTransformContractFirst').Tramo1SerializedLike
    )
    phaseStore.tramo2Prep = prep
    const mc = await runContractFirstIntegration(inp, prep, phaseStore.excelStep.normalized)
    phaseStore.contractIntegration = mc
    let out = await runEtlTransform(inp, { onlyTramo: 1, phaseStore })
    out = attachContractIntegrationToOutput(out, mc, prep)
    phaseStore.tramoCompleted = 2
    return out
  }

  if (!phaseStore.tramo1) {
    throw new Error('Completá el paso 2 (cruce Truckflow) antes de circuitos.')
  }
  if (inp.movimientosContratoFiles?.length && !phaseStore.contractIntegration) {
    throw new Error('Completá el paso 2 (Excel en Truckflow) antes de circuitos.')
  }
  let out = await runEtlTransform(inp, { onlyTramo: 2, phaseStore })
  // El paso 2 arma la evidencia Excel-first sin circuitos (todavía no existen),
  // por eso el snapshot de KPI por tiempo queda sin segmentos. Ya con los circuitos
  // clasificados en este paso, regeneramos la integración con las journeys reales.
  // El cruce de patentes es exacto (O(mov+journey)) y no se relee el XLSX.
  if (
    inp.movimientosContratoFiles?.length &&
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

  if (inp.movimientosContratoFiles?.length) {
    phaseStore.excelStep = await runExcelMovimientosNormalizeStep(inp)
    phaseStore.tramoCompleted = 1
  }

  await ensureJourneyPrep(inp, phaseStore)

  // Clasificamos circuitos primero (una sola pasada) para tener las journeys reales;
  // recién después cruzamos el Excel-first, así el snapshot de KPI por tiempo trae
  // segmentos/tramos y no hace falta repetir el cruce.
  const oCircuits = await runEtlTransform(inp, { ...runOpts, onlyTramo: 2 })

  if (inp.movimientosContratoFiles?.length && phaseStore.tramo2Prep) {
    const prep = phaseStore.tramo2Prep
    const mc = await runContractFirstIntegration(inp, prep, phaseStore.excelStep!.normalized)
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
