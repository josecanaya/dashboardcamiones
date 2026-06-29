import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { EXECUTIVE_CIRCUIT_MATRIX } from './finalCircuitScoring'
import { isSanLorenzoAceiteLiquidPlatform } from './slLiquidCameras'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'

export type InferredExecutiveCircuit = {
  circuit_code: string
  circuit_label: string
  inference_source: 'platform' | 'plant'
}

function circuitFromCode(code: string, source: InferredExecutiveCircuit['inference_source']): InferredExecutiveCircuit | null {
  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
  if (!cfg) return null
  return { circuit_code: code, circuit_label: cfg.label, inference_source: source }
}

function isExcelDispatchMovement(
  mov: Pick<ExternalMovimientoContratoNormalized, 'movement_type' | 'movement_type_detail' | 'mov'>
): boolean {
  const movType = String(mov.movement_type ?? '').toUpperCase()
  const movCode = String(mov.mov ?? mov.movement_type_detail ?? '').toUpperCase()
  return movType === 'DESPACHO' || movCode === 'DE' || movCode === 'DI' || movCode === 'EA'
}

function slLiquidCircuitFromAceiteAtTerminal(
  plant: string,
  dispatch: boolean
): InferredExecutiveCircuit | null {
  /** Terminal de embarque: descarga en plataforma Aceite OSL/PTO → SL1 (S10). */
  if (plant === 'TERMINAL_EMBARQUE') {
    const code = dispatch ? 'SL1' : 'SL5'
    return (
      circuitFromCode(code, 'plant') ?? {
        circuit_code: code,
        circuit_label:
          code === 'SL1' ?
            'Recepción interna San Lorenzo'
          : 'Despacho líquidos San Lorenzo (S10)',
        inference_source: 'plant',
      }
    )
  }
  if (plant === 'SAN_LORENZO') {
    const code = dispatch ? 'SL5' : 'SL1'
    return (
      circuitFromCode(code, 'plant') ?? {
        circuit_code: code,
        circuit_label: dispatch ? 'Despacho líquidos San Lorenzo (S10)' : 'Recepción interna San Lorenzo',
        inference_source: 'plant',
      }
    )
  }
  return null
}

function inferAceiteOslExecutiveCircuit(
  plant: string,
  mov: Pick<ExternalMovimientoContratoNormalized, 'movement_type' | 'movement_type_detail' | 'mov'>
): InferredExecutiveCircuit | null {
  const dispatch = isExcelDispatchMovement(mov)
  if (plant === 'RICARDONE') {
    return circuitFromCode(dispatch ? 'R16' : 'R8', 'platform')
  }
  const atTerminal = slLiquidCircuitFromAceiteAtTerminal(plant, dispatch)
  if (atTerminal) return atTerminal
  return circuitFromCode('R34', 'platform')
}

/** Volcables PTO = descarga San Lorenzo (circuito R7), distinto de VOLCABLE 1/2 Ricardone. */
export function isSanLorenzoVolcablePtoPlatform(platform: string | null | undefined): boolean {
  return String(platform ?? '')
    .trim()
    .toUpperCase()
    .startsWith('VOLCABLE_PTO_')
}

/** Circuito ejecutivo R* inferido desde plataforma/planta del Excel operativo. */
export function inferCircuitFromExternalMovimiento(
  mov: Pick<
    ExternalMovimientoContratoNormalized,
    | 'platform_normalized'
    | 'plataforma_original'
    | 'planta_normalized'
    | 'movement_type'
    | 'movement_type_detail'
    | 'mov'
  >
): InferredExecutiveCircuit | null {
  const platform = String(mov.platform_normalized ?? '').toUpperCase()
  const original = String(mov.plataforma_original ?? '').toUpperCase()
  const plant = String(mov.planta_normalized ?? '').toUpperCase()
  const movType = String(mov.movement_type ?? '').toUpperCase()
  const movCode = String(mov.mov ?? mov.movement_type_detail ?? '').toUpperCase()

  if (isSanLorenzoVolcablePtoPlatform(platform) || /VOLCABLE\s+PTO/.test(original)) {
    return circuitFromCode('R7', 'platform')
  }

  if (platform.startsWith('VOLCABLE_')) {
    const num = Number.parseInt(platform.replace('VOLCABLE_', ''), 10)
    if (num === 2 || num === 4) return circuitFromCode('R6', 'platform')
    return circuitFromCode('R5', 'platform')
  }

  if (platform === 'CELDA_16') {
    if (movType === 'DESPACHO' || movCode === 'DE' || movCode === 'DI' || movCode === 'EA') {
      return circuitFromCode('R9', 'platform')
    }
    return circuitFromCode('R1', 'platform')
  }

  if (platform.startsWith('KEPPLER_') || platform.startsWith('KEPLER_')) {
    const num = Number.parseInt(platform.replace(/KEPPLER_|KEPLER_/, ''), 10)
    if (num === 2) return circuitFromCode('R4', 'platform')
    return circuitFromCode('R3', 'platform')
  }

  if (isSanLorenzoAceiteLiquidPlatform(platform, original)) {
    return inferAceiteOslExecutiveCircuit(plant, mov)
  }

  if (plant === 'TERMINAL_EMBARQUE') {
    if (isSanLorenzoVolcablePtoPlatform(platform)) {
      return circuitFromCode('R7', 'platform')
    }
    if (platform.startsWith('VOLCABLE_')) {
      const num = Number.parseInt(platform.replace('VOLCABLE_', ''), 10)
      if (num === 2 || num === 4) return circuitFromCode('R20', 'platform')
      return circuitFromCode('R19', 'platform')
    }
    if (platform === 'CELDA_16') return circuitFromCode('R26', 'platform')
  }

  return null
}

export function journeyNeedsCircuitFromExcel(journey: TruckflowJourneyForMerge): boolean {
  if (!journey.circuit_code) return true
  if (journey.anomaly_real) return true
  const st = String(journey.executive_status ?? '').toUpperCase()
  return st === 'ANOMALO' || st === 'NO_DIFERENCIABLE' || st === 'NO_EVALUABLE' || st === 'INCOMPLETO'
}

/** Aplica circuito del Excel cuando Truckflow no clasificó o marcó anomalía. */
export function applyExternalCircuitToJourney(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized
): TruckflowJourneyForMerge & { circuit_from_excel: boolean; truckflow_circuit_code: string } {
  const inferred = inferCircuitFromExternalMovimiento(mov)
  const truckflow_circuit_code = journey.circuit_code
  if (!inferred || !mov.platform_normalized) {
    return { ...journey, circuit_from_excel: false, truckflow_circuit_code }
  }

  const truckflowCode = String(journey.circuit_code ?? '').trim().toUpperCase()
  const excelOverridesSlOnRicLiquid =
    (truckflowCode === 'SL1' || truckflowCode === 'SL5') &&
    (inferred.circuit_code === 'R8' || inferred.circuit_code === 'R16')

  if (!journeyNeedsCircuitFromExcel(journey) && !excelOverridesSlOnRicLiquid) {
    return { ...journey, circuit_from_excel: false, truckflow_circuit_code }
  }

  return {
    ...journey,
    circuit_code: inferred.circuit_code,
    circuit_label: inferred.circuit_label,
    circuit_from_excel: true,
    truckflow_circuit_code,
  }
}

/** Prioriza anomalías sin circuito al buscar Truckflow desde Excel. */
export function excelAnchorJourneyPriority(
  journey: TruckflowJourneyForMerge,
  mov: ExternalMovimientoContratoNormalized
): number {
  let score = 0
  if (journey.anomaly_real) score += 20
  const st = String(journey.executive_status ?? '').toUpperCase()
  if (st === 'ANOMALO' || st === 'NO_DIFERENCIABLE' || st === 'NO_EVALUABLE') score += 15
  if (!journey.circuit_code) score += 10
  if (mov.platform_normalized && journeyNeedsCircuitFromExcel(journey)) score += 12
  if (journeyNeedsOperationalEnrichmentFromStatus(journey)) score += 8
  return score
}

function journeyNeedsOperationalEnrichmentFromStatus(journey: TruckflowJourneyForMerge): boolean {
  const st = String(journey.executive_status ?? '').toUpperCase()
  return st === 'NO_DIFERENCIABLE' || st === 'NO_EVALUABLE' || journey.anomaly_real
}
