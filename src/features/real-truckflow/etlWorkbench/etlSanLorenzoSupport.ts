import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import {
  lookupSanLorenzoCameraByDevice,
  SAN_LORENZO_CAMERAS,
} from '../../../data/sanLorenzoCameraCatalog'
import { isEtlRearCameraDevice } from './etlRearDevices'
import type { ExecutiveCircuitDecision } from './finalCircuitScoring'

const SL_LOGICAL_CODES = new Set(SAN_LORENZO_CAMERAS.map((c) => c.logicalCode))

/** Desactivado esta semana: SL no promociona journeys (comité). */
export const ETL_SL_EXECUTIVE_SUPPORT_ENABLED = false

/** Desactivado esta semana: no cerrar circuito SL interno (S1/S5/S7). La ruta Ric→SL (R7) sigue activa. */
export const ETL_SL_INTERNAL_CLASSIFICATION_ENABLED = false

export type SanLorenzoSupportSnapshot = {
  slPointCount: number
  slStrongPointCount: number
  slLogicalCodes: string[]
  hasSlIngreso: boolean
  hasSlCorroboration: boolean
  hasSlStrongPoint: boolean
  hasSlBalancaCompleta: boolean
}

function journeyFrontEvents(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode))
}

export function snapshotSanLorenzoSupport(j: ReconstructedRealJourney): SanLorenzoSupportSnapshot {
  const logicals = new Set<string>()
  let slStrongPointCount = 0

  for (const e of journeyFrontEvents(j)) {
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    if (dev?.installed === false) continue
    const norm = normalizeRealEventPoint(e)
    const code = dev?.logicalCode ?? norm.logicalCode
    if (!SL_LOGICAL_CODES.has(code) || code.includes('EXCLUIDA')) continue
    logicals.add(code)
    if (dev?.strongPoint) slStrongPointCount++
  }

  const slLogicalCodes = [...logicals]
  const hasSlIngreso = logicals.has('SL_INGRESO')
  const hasSlBalancaCompleta =
    logicals.has('SL_BALANZA_INGRESO') && logicals.has('SL_BALANZA_SALIDA')
  const hasSlStrongPoint = slStrongPointCount > 0
  const hasSlCorroboration =
    (hasSlIngreso && logicals.size >= 2) || hasSlStrongPoint || hasSlBalancaCompleta

  return {
    slPointCount: logicals.size,
    slStrongPointCount,
    slLogicalCodes,
    hasSlIngreso,
    hasSlCorroboration,
    hasSlStrongPoint,
    hasSlBalancaCompleta,
  }
}

export function journeyHasSanLorenzoStrongPoint(j: ReconstructedRealJourney): boolean {
  return snapshotSanLorenzoSupport(j).hasSlStrongPoint
}

export { journeyHasSlIngresoEvidence, journeyIsRicSanLorenzoRouteEvidence } from './etlRicSanLorenzoRoute'

/** Refuerza decisión ejecutiva usando evidencia SL sin romper reglas Ricardone. */
export function applySanLorenzoExecutiveSupport(input: {
  journey: ReconstructedRealJourney
  executiveCircuitCode: string
  technicalCircuitCode: string
  executive: ExecutiveCircuitDecision
  frontEventCount: number
  hasOperationalEntry: boolean
  hasOperationalExit: boolean
}): ExecutiveCircuitDecision {
  if (!ETL_SL_EXECUTIVE_SUPPORT_ENABLED) return input.executive
  const sl = snapshotSanLorenzoSupport(input.journey)
  if (!sl.hasSlCorroboration) return input.executive

  const code = input.executiveCircuitCode || input.technicalCircuitCode

  if (code === 'R7' || code === 'CIRCUITO_SAN_LORENZO') {
    if (input.executive.executiveStatus === 'INCOMPLETO' && sl.hasSlIngreso && sl.slPointCount >= 2) {
      return {
        executiveStatus: 'PROBABLE',
        executiveReason: 'SL_CORROBORACION_R7',
        validDetail: '',
      }
    }
    if (
      (input.executive.executiveStatus === 'INCOMPLETO' || input.executive.executiveStatus === 'PROBABLE') &&
      sl.hasSlStrongPoint &&
      input.hasOperationalEntry
    ) {
      return {
        executiveStatus: 'VALIDO',
        executiveReason: 'SL_PUNTO_FUERTE_R7',
        validDetail: 'DEDUCIDO',
      }
    }
  }

  if (code === 'RS_REC' || code === 'RS_DESP') {
    if (
      input.executive.executiveStatus === 'INCOMPLETO' &&
      sl.hasSlCorroboration &&
      input.frontEventCount >= 3
    ) {
      return {
        executiveStatus: 'PROBABLE',
        executiveReason: 'SL_CORROBORACION_SOLIDO',
        validDetail: '',
      }
    }
    if (
      input.executive.executiveStatus === 'PROBABLE' &&
      sl.hasSlBalancaCompleta &&
      input.hasOperationalEntry &&
      input.hasOperationalExit
    ) {
      return {
        executiveStatus: 'VALIDO',
        executiveReason: 'SL_BALANZA_COMPLETA_SOLIDO',
        validDetail: 'DEDUCIDO',
      }
    }
  }

  if (
    input.executive.executiveStatus === 'NO_EVALUABLE' &&
    sl.hasSlCorroboration &&
    input.frontEventCount >= 4 &&
    input.hasOperationalEntry
  ) {
    return {
      executiveStatus: 'PROBABLE',
      executiveReason: 'SL_CORROBORACION_GENERICO',
      validDetail: '',
    }
  }

  return input.executive
}
