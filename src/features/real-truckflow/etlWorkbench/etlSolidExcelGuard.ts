/**
 * Guarda producto→circuito (excel-first) para el estampado ejecutivo de `debug_matrix`.
 *
 * Problema: `resolveExecutiveCircuitConfigForJourney` (finalCircuitScoring) decide el
 * circuito ejecutivo SOLO con la evidencia de cámaras del recorrido, sin mirar el
 * producto del Excel. Un camión de GRANO SÓLIDO (SOJA / GIRASOL) cuyo journey pasa por
 * cámaras de líquidos (calada líquida, SL interno) queda estampado con un circuito
 * LÍQUIDO (SL1 / R8 / …) — mercadería líquida — que ese producto no puede manejar.
 *
 * En el punto del pipeline donde nace `debug_matrix` todavía NO existe el match
 * journey↔movimiento Excel (eso se calcula después, en `excel_operations_with_truckflow`).
 * Solo hay los movimientos Excel crudos a nivel PATENTE — la misma fuente que ya usa la
 * reconciliación S7/S8. Por eso la guarda es a nivel patente y **conservadora**: solo
 * corrige un código líquido a su circuito sólido cuando la patente, en toda la ventana,
 * es de grano puro (tiene movimientos de grano sólido y NINGÚN movimiento líquido). Así
 * nunca se degrada un aceite real de una patente que también hizo grano.
 *
 * Módulo leaf: depende de la inferencia por plataforma y de la detección de líquido.
 */
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import { isExcelLiquidProductName } from './slLiquidCameras'
import { isPelletExcelProduct } from '../../../etl-core/reports/transileExternoCiclo'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'

/** Circuitos ejecutivos de mercadería LÍQUIDA (aceite / glicerina / girasol líquido). */
export const LIQUID_EXECUTIVE_CIRCUIT_CODES = new Set(['SL1', 'SL2', 'SL3', 'SL5', 'R8', 'R16'])

/** Circuitos ejecutivos de GRANO SÓLIDO (descarga/recepción) que un movimiento Excel puede inferir. */
const SOLID_GRAIN_CIRCUIT_CODES = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R9'])

export function isLiquidExecutiveCircuitCode(code: string): boolean {
  return LIQUID_EXECUTIVE_CIRCUIT_CODES.has(String(code ?? '').trim().toUpperCase())
}

type MovForGuard = Pick<
  ExternalMovimientoContratoNormalized,
  'plate_normalized' | 'patente_original'
> &
  Parameters<typeof inferCircuitFromExternalMovimiento>[0] &
  Partial<Pick<ExternalMovimientoContratoNormalized, 'product_normalized' | 'producto_original'>>

/** Familia operativa de un movimiento Excel a efectos de la guarda. */
type MovFamily = 'LIQUIDO' | 'SOLIDO_GRANO' | 'PELLET' | 'OTRO'

function movFamily(mov: MovForGuard): { family: MovFamily; solidCode: string } {
  const product = String(mov.product_normalized ?? mov.producto_original ?? '')
  const platform = String(mov.platform_normalized ?? mov.plataforma_original ?? '')
  const inferred = inferCircuitFromExternalMovimiento(mov)
  const code = String(inferred?.circuit_code ?? '').trim().toUpperCase()

  // Líquido gana: por producto (aceite/glicerina/girasol líquido) o por circuito líquido inferido.
  if (isExcelLiquidProductName(product, platform) || isLiquidExecutiveCircuitCode(code)) {
    return { family: 'LIQUIDO', solidCode: '' }
  }
  if (isPelletExcelProduct(product)) return { family: 'PELLET', solidCode: '' }
  if (SOLID_GRAIN_CIRCUIT_CODES.has(code)) return { family: 'SOLIDO_GRANO', solidCode: code }
  return { family: 'OTRO', solidCode: '' }
}

/**
 * Mapa patente → circuito ejecutivo SÓLIDO (excel-first). Solo retiene una patente si en
 * toda la ventana es de grano puro: tuvo al menos un movimiento de grano sólido y NINGÚN
 * movimiento líquido. El código elegido es el circuito sólido más frecuente de la patente.
 */
export function buildSolidExcelCircuitByPlate(
  movs: readonly MovForGuard[] | null | undefined
): Map<string, string> {
  const solidCounts = new Map<string, Map<string, number>>()
  const plateHasLiquid = new Set<string>()

  for (const mov of movs ?? []) {
    const plate = normalizePlateStrict(String(mov.plate_normalized ?? mov.patente_original ?? ''))
    if (!plate) continue
    const { family, solidCode } = movFamily(mov)
    if (family === 'LIQUIDO') {
      plateHasLiquid.add(plate)
      continue
    }
    if (family !== 'SOLIDO_GRANO' || !solidCode) continue
    let byCode = solidCounts.get(plate)
    if (!byCode) {
      byCode = new Map<string, number>()
      solidCounts.set(plate, byCode)
    }
    byCode.set(solidCode, (byCode.get(solidCode) ?? 0) + 1)
  }

  const out = new Map<string, string>()
  for (const [plate, byCode] of solidCounts) {
    if (plateHasLiquid.has(plate)) continue // patente mixta: no tocar (podría ser aceite real).
    let bestCode = ''
    let bestCount = -1
    for (const [code, count] of byCode) {
      if (count > bestCount) {
        bestCount = count
        bestCode = code
      }
    }
    if (bestCode) out.set(plate, bestCode)
  }
  return out
}

/**
 * Circuito sólido excel-first para un journey estampado con un circuito LÍQUIDO cuya
 * patente es de grano puro en la ventana. Devuelve el R-code sólido del Excel, o `null`
 * si no aplica (el código actual no es líquido, o la patente no es grano puro / no está).
 * No adivina: sin Excel de grano puro, `null`.
 */
export function resolveSolidExcelFirstCircuitCode(input: {
  currentExecutiveCode: string
  plate: string
  circuitByPlate: Map<string, string>
}): string | null {
  if (!isLiquidExecutiveCircuitCode(input.currentExecutiveCode)) return null
  const plate = normalizePlateStrict(input.plate)
  if (!plate) return null
  return input.circuitByPlate.get(plate) ?? null
}
