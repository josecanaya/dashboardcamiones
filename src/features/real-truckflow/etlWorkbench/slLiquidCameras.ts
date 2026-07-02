/**
 * Punto líquidos San Lorenzo (sector S10) — SL1 recepción / SL5 despacho comparten las mismas cámaras.
 */

import type { SlCameraAuditSlot } from './auditSlCameraExcelCoverage'

export const SL_LIQUID_CIRCUIT_CODES = ['SL1', 'SL2', 'SL5'] as const
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
  return c === 'SL1' || c === 'SL2' || c === 'SL5'
}

/** Circuitos ejecutivos aceite/líquido (comité): SL1 OSL, SL2 PTO, SL3 Renova, R8 genérico. */
export const ACEITE_EXECUTIVE_CIRCUIT_CODES = ['SL1', 'SL2', 'SL3', 'R8'] as const
export type AceiteExecutiveCircuitCode = (typeof ACEITE_EXECUTIVE_CIRCUIT_CODES)[number]

export function isAceiteExecutiveCircuitCode(code: string): code is AceiteExecutiveCircuitCode {
  return (ACEITE_EXECUTIVE_CIRCUIT_CODES as readonly string[]).includes(String(code ?? '').trim().toUpperCase())
}

export function normalizeAceitePlatformKey(
  platformNormalized: string | null | undefined,
  plataformaOriginal?: string | null
): 'OSL' | 'PTO' | 'GENERIC' | '' {
  const p = String(platformNormalized ?? '').trim().toUpperCase()
  const o = String(plataformaOriginal ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
  if (p === 'ACEITE_OSL' || p === 'ACEITEOSL' || o === 'ACEITE OSL' || o === 'ACEITEOSL') return 'OSL'
  if (p === 'ACEITE_PTO' || p === 'ACEITEPTO' || o === 'ACEITE PTO' || o === 'ACEITEPTO') return 'PTO'
  if (p === 'ACEITE' || o === 'ACEITE') return 'GENERIC'
  if (p.includes('OSL')) return 'OSL'
  if (p.includes('PTO') && p.includes('ACEITE')) return 'PTO'
  return ''
}

export function excelObservacionesIndicateRenovaAceite(
  ...fields: (string | null | undefined)[]
): boolean {
  const hay = fields.map((f) => String(f ?? '').toUpperCase()).join(' ')
  return /\bRENOVA\b/.test(hay)
}

/**
 * Excel plataforma → circuito ejecutivo aceite (ACEITE→R8, OSL→SL1, PTO→SL2).
 * La planta no redefine la plataforma aceite explícita del Excel.
 */
export function inferAceiteExecutiveCircuitFromPlatform(
  platformNormalized: string | null | undefined,
  plataformaOriginal: string | null | undefined,
  _plantaNormalized?: string | null | undefined
): AceiteExecutiveCircuitCode | null {
  const key = normalizeAceitePlatformKey(platformNormalized, plataformaOriginal)
  if (!key) {
    if (!isPermittedAceiteLiquidDischargePlatform(platformNormalized, plataformaOriginal)) return null
    return null
  }
  if (key === 'OSL') return 'SL1'
  if (key === 'PTO') return 'SL2'
  if (key === 'GENERIC') return 'R8'
  return null
}

/** Plataforma aceite u observación RENOVA con plataforma vacía (SL3). */
export function inferAceiteExecutiveCircuitFromExcel(
  platformNormalized: string | null | undefined,
  plataformaOriginal: string | null | undefined,
  plantaNormalized: string | null | undefined,
  observaciones?: string | null,
  observacionCalidad?: string | null
): AceiteExecutiveCircuitCode | null {
  const fromPlatform = inferAceiteExecutiveCircuitFromPlatform(
    platformNormalized,
    plataformaOriginal,
    plantaNormalized
  )
  if (fromPlatform) return fromPlatform
  const platformEmpty =
    !String(platformNormalized ?? '').trim() && !String(plataformaOriginal ?? '').trim()
  if (platformEmpty && excelObservacionesIndicateRenovaAceite(observaciones, observacionCalidad)) {
    return 'SL3'
  }
  return null
}

function haystackHasRicLiquidBalanza(hay: string): boolean {
  if (/RICB1INGRESO|RIC_B1_INGRESO/.test(hay) && /RICB2EGRESO|RIC_B2_EGRESO/.test(hay)) return true
  return /RICB1|RIC_B1/.test(hay) && /RICB2|RIC_B2/.test(hay)
}

/** Descarga líquida en Ricardone (sin paso por terminal SL en secuencia). */
export function haystackIndicatesAceiteRicardoneDischarge(hay: string): boolean {
  const h = `${hay ?? ''}`.toUpperCase()
  if (haystackHasRicLiquidBalanza(h) || /RICALIQ|RIC_CAL_LIQ/.test(h)) return true
  if (/SL_INGRESO|SL_BALANZA|SL_EGRESO|RENCARG|RENDESC/.test(h)) return false
  if (/LIQUIDO/.test(h) && /BALANZA_INGRESO|BALANZA_EGRESO/.test(h)) return true
  if (/LIQUIDO/.test(h) && /INGRESO|PREINGRESO/.test(h) && !/SL_/.test(h)) return true
  return false
}

function haystackHasSlS10Camera(hay: string): boolean {
  return /RENCARGFTE|RENDESCFTE|RENCARGTRAS|RENDESCTRAS|RENDESCTTRAS|RENCARG|RENDESC/.test(hay)
}

/** Truckflow (códigos + secuencia/dispositivos) desempata blanks y corrige R7 erróneo en aceite. */
export function inferAceiteExecutiveCircuitFromTruckflowEvidence(
  truckflowCircuitCodes: string,
  observedSequenceCombined: string
): AceiteExecutiveCircuitCode | null {
  const codes = String(truckflowCircuitCodes ?? '')
    .toUpperCase()
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hay = `${observedSequenceCombined ?? ''}`.toUpperCase()

  if (haystackHasSlS10Camera(hay) || /SL_LIQUIDO_DESCARGA|SL_LIQUIDO_OPERACION/.test(hay)) return 'SL1'
  if (codes.includes('R8') || /RICALIQ|RIC_CAL_LIQ/.test(hay) || haystackHasRicLiquidBalanza(hay)) return 'R8'
  if (haystackIndicatesAceiteRicardoneDischarge(hay)) return 'R8'
  if (codes.includes('SL1')) return 'SL1'
  if (codes.includes('SL2')) return 'SL2'

  const slTerminal =
    /SL_INGRESO|SL_BALANZA/.test(hay) &&
    /SL_EGRESO|SL_BALANZA_EGRESO|SL_BALANZA_SALIDA/.test(hay)
  if (slTerminal && !haystackHasSlS10Camera(hay)) return 'SL2'

  if (codes.includes('R7') && slTerminal) return 'SL2'
  return null
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
  if (normalizeAceitePlatformKey(platformNormalized, plataformaOriginal)) return true
  const o = String(plataformaOriginal ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
  if (o === 'ACEITE' || o === 'ACEITEOSL' || o === 'ACEITEPTO') return true
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
  observaciones?: string
  observacion_calidad?: string
  resolved_executive_circuit_code?: string
  resolved_circuit_family?: string
  resolved_product?: string
  product_normalized?: string
}): boolean {
  const platform = String(row.platform_normalized ?? '')
  const original = String(row.plataforma_original ?? row.platform_normalized ?? '')
  if (
    inferAceiteExecutiveCircuitFromExcel(
      platform,
      original,
      row.planta_normalized,
      row.observaciones,
      row.observacion_calidad
    )
  ) {
    return true
  }
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
