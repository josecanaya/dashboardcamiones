import { normalizePlate } from '../services/argentinaPlate'

/** Categoría manual del catálogo (no se infiere por reglas de circuito). */
export type TruckPlateRegistryCategory =
  | 'vicentin_asociado'
  | 'prestador_servicio'
  | 'vehiculo_particular'

export const TRUCK_PLATE_REGISTRY_CATEGORY_LABELS: Record<TruckPlateRegistryCategory, string> = {
  vicentin_asociado: 'Asociado Vicentin (por día)',
  prestador_servicio: 'Prestador de servicios',
  vehiculo_particular: 'Vehículo particular',
}

export type TruckPlateRegistryEntry = {
  id: string
  /** Patente normalizada (ABC123 / AB123CD). */
  plate: string
  category: TruckPlateRegistryCategory
  /** Si false, no se aplica exclusión en ETL. */
  active: boolean
  /** Excluir eventos/viajes de métricas y conteos ejecutivos. */
  excludeFromAnalytics: boolean
  notes?: string
  /** Etiqueta libre (empresa, chofer, motivo). */
  label?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export type TruckPlateRegistryDocument = {
  version: 1
  updatedAt: string
  entries: TruckPlateRegistryEntry[]
}

export function normalizeRegistryPlate(raw: string): string {
  return normalizePlate(raw)
}

export function buildRegistryLookup(
  doc: TruckPlateRegistryDocument | null | undefined
): Map<string, TruckPlateRegistryEntry> {
  const m = new Map<string, TruckPlateRegistryEntry>()
  if (!doc?.entries?.length) return m
  for (const e of doc.entries) {
    if (!e.active || !e.excludeFromAnalytics) continue
    const p = normalizeRegistryPlate(e.plate)
    if (!p) continue
    m.set(p, { ...e, plate: p })
  }
  return m
}

export function newRegistryEntryId(): string {
  return `tpr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
