/**
 * Punto líquidos San Lorenzo (sector S10) — SL1 recepción / SL5 despacho comparten las mismas cámaras.
 */

import type { SlCameraAuditSlot } from './auditSlCameraExcelCoverage'

export const SL_LIQUID_CIRCUIT_CODES = ['SL1', 'SL5'] as const
export type SlLiquidCircuitCode = (typeof SL_LIQUID_CIRCUIT_CODES)[number]

export const RIC_LIQUIDO_CAMERA = 'RicCalLiq'

export const SL_LIQUIDOS_S10_FRONT_DEVICES = ['RenCargFte', 'RenDescFte'] as const
export const SL_LIQUIDOS_S10_ALL_DEVICES = [
  'RenCargFte',
  'RenDescFte',
  'RenCargTras',
  'RenDescTras',
] as const

/** Código lógico unificado para KPI/auditoría (carga o descarga en S10). */
export const SL_LIQUIDO_OPERACION_LOGICAL = 'SL_LIQUIDO_OPERACION'

const TRANSILE_EXTERNO_RIC_SL = new Set(['R26', 'R27', 'R34'])
const RIC_LIQUIDO_RECEPCION = new Set(['R8'])
const RIC_LIQUIDO_DESPACHO = new Set(['R16'])

export function isSlLiquidCircuit(circuit: string): boolean {
  const c = String(circuit ?? '').trim().toUpperCase()
  return c === 'SL1' || c === 'SL5'
}

/** Plataformas de descarga permitidas para camiones de aceite (Excel operativo). */
export const PERMITTED_ACEITE_LIQUID_DISCHARGE_PLATFORMS = [
  'ACEITE_OSL',
  'ACEITE_PTO',
  'ACEITE',
] as const

export function isPermittedAceiteLiquidDischargePlatform(
  platformNormalized: string | null | undefined,
  plataformaOriginal?: string | null
): boolean {
  const p = String(platformNormalized ?? '').trim().toUpperCase()
  if ((PERMITTED_ACEITE_LIQUID_DISCHARGE_PLATFORMS as readonly string[]).includes(p)) return true
  const o = String(plataformaOriginal ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
  if (o === 'ACEITE') return true
  return o === 'ACEITE OSL' || o === 'ACEITE PTO'
}

function excelProductLooksLiquid(product: string, platform: string): boolean {
  return isExcelLiquidProductName(product, platform)
}

/** Producto Excel de aceite / girasol industrial (no solo grano GIRASOL). */
export function isExcelLiquidProductName(product: string, platform = ''): boolean {
  const p = `${product} ${platform}`.trim().toUpperCase()
  if (!p) return false
  if (p.includes('LIQUIDO') || p.includes('OSL')) return true
  if (p.includes('ACEITE')) return true
  if (p.includes('AC GIRASOL') || p.startsWith('AC GIRASOL')) return true
  if (
    p.includes('GIRASOL') &&
    (p.includes('OLEICO') || p.includes('CRUDO') || p.includes('REFIN') || p.includes('ACEITE'))
  ) {
    return true
  }
  return false
}

/** Movimiento Excel líquido/aceite que debe anclarse al comité aunque no haya journey Truckflow. */
export function isExcelLiquidMovementForOrphanCommittee(row: {
  platform_normalized?: string
  plataforma_original?: string
  planta_normalized?: string
  resolved_executive_circuit_code?: string
  resolved_circuit_family?: string
  resolved_product?: string
  product_normalized?: string
}): boolean {
  const platform = String(row.platform_normalized ?? '')
  const original = String(row.plataforma_original ?? row.platform_normalized ?? '')
  if (isPermittedAceiteLiquidDischargePlatform(platform, original)) return true
  const family = String(row.resolved_circuit_family ?? '').trim().toUpperCase()
  if (family === 'LIQUIDO') return true
  const product = String(row.resolved_product ?? row.product_normalized ?? '')
  if (isExcelLiquidProductName(product, platform)) return true
  const plant = String(row.planta_normalized ?? '').trim().toUpperCase()
  const circuit = String(row.resolved_executive_circuit_code ?? '').trim().toUpperCase()
  if (plant === 'RICARDONE') {
    if (isRicLiquidReceptionCode(circuit) || isRicLiquidDespachoCode(circuit)) return true
  }
  if (isSlLiquidCircuit(circuit)) return true
  return false
}

/** Plataforma Excel de líquidos (inferencia de circuito R8/R16/SL1/SL5). */
export function isSanLorenzoAceiteLiquidPlatform(
  platformNormalized: string | null | undefined,
  plataformaOriginal?: string | null
): boolean {
  return isPermittedAceiteLiquidDischargePlatform(platformNormalized, plataformaOriginal)
}

export function isTransileExternoRicSlCode(circuit: string): boolean {
  return TRANSILE_EXTERNO_RIC_SL.has(String(circuit ?? '').trim().toUpperCase())
}

export function isRicLiquidReceptionCode(circuit: string): boolean {
  return RIC_LIQUIDO_RECEPCION.has(String(circuit ?? '').trim().toUpperCase())
}

export function isRicLiquidDespachoCode(circuit: string): boolean {
  return RIC_LIQUIDO_DESPACHO.has(String(circuit ?? '').trim().toUpperCase())
}

export function isSlLiquidS10Device(deviceCode: string): boolean {
  const d = String(deviceCode ?? '').trim()
  return (SL_LIQUIDOS_S10_ALL_DEVICES as readonly string[]).includes(d)
}

export function slLiquidS10DeviceRole(deviceCode: string): 'carga' | 'descarga' | 'otro' {
  const d = String(deviceCode ?? '').trim()
  if (d === 'RenCargFte' || d === 'RenCargTras') return 'carga'
  if (d === 'RenDescFte' || d === 'RenDescTras') return 'descarga'
  return 'otro'
}

/** Slot único S10 para auditoría Excel ↔ crudo (cualquier Ren*). */
export function buildSlLiquidS10UnifiedSlot(): SlCameraAuditSlot {
  const deviceCodes = new Set<string>(SL_LIQUIDOS_S10_ALL_DEVICES)
  return {
    slotId: 'S10',
    logicalCode: SL_LIQUIDO_OPERACION_LOGICAL,
    pipelineLogicalCode: SL_LIQUIDO_OPERACION_LOGICAL,
    label: 'Punto líquidos S10 (Renova carga/descarga)',
    deviceCodes,
    sectorCodes: new Set([
      'PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1',
      'S10',
      '1-S10',
    ]),
  }
}

export function buildSlLiquidS10PerDeviceSlots(): SlCameraAuditSlot[] {
  return SL_LIQUIDOS_S10_ALL_DEVICES.map((deviceCode) => ({
    slotId: 'S10',
    logicalCode:
      slLiquidS10DeviceRole(deviceCode) === 'carga' ? 'SL_LIQUIDO_CARGA' : 'SL_LIQUIDO_DESCARGA',
    pipelineLogicalCode: SL_LIQUIDO_OPERACION_LOGICAL,
    label: deviceCode,
    deviceCode,
    deviceCodes: new Set([deviceCode]),
    sectorCodes: new Set(['PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1', 'S10', '1-S10']),
  }))
}
