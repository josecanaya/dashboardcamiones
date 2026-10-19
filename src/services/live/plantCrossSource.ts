import type { BalanzaRow, TruckRow } from './plantStateApi'

/** Nombre visible de cada fuente en En vivo. */
export const SOURCE_TF = 'Truckflow'
export const SOURCE_SGC = 'SGC'

export type CrossMatch = 'patente' | 'acoplado' | 'parecida' | null

/** Un camión de la planta con lo que dice cada fuente (cámaras Truckflow y balanza SGC). */
export type PlantTruck = {
  /** Patente que se muestra: la del SGC si existe (es la declarada), si no la leída por cámara. */
  plate: string
  tf: TruckRow | null
  /** Ingreso abierto en SGC (sin salida). */
  sgc: BalanzaRow | null
  /** Ingreso SGC ya cerrado que coincide con un camión que las cámaras siguen viendo. */
  sgcClosed: BalanzaRow | null
  match: CrossMatch
  sources: 'ambas' | 'sgc' | 'tf'
  /** Minutos en planta: desde el ingreso SGC si existe, si no desde la primera cámara. */
  dwellPlantMin: number | null
  dwellSource: typeof SOURCE_SGC | typeof SOURCE_TF | null
  status: TruckRow['status']
}

const norm = (p: string | null | undefined) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function oneOff(a: string, b: string) {
  if (a.length !== b.length || a.length < 6) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false
  return diff === 1
}

function statusFromMinutes(min: number): TruckRow['status'] {
  return min > 360 ? 'critical' : min > 180 ? 'attention' : 'normal'
}

/**
 * Cruza camiones vistos por cámaras con ingresos SGC por patente: exacta contra camión o acoplado
 * (las cámaras traseras leen el acoplado) y, si no, una sola letra distinta con candidato único.
 */
export function crossPlantSources(trucks: TruckRow[], sgcOpen: BalanzaRow[], sgcClosed: BalanzaRow[] = [], sgcOtherPlants: BalanzaRow[] = []): PlantTruck[] {
  const used = new Set<number>()
  const out: PlantTruck[] = []

  const find = (plate: string, pool: BalanzaRow[]): { row: BalanzaRow; match: CrossMatch } | null => {
    const p = norm(plate)
    const free = pool.filter(r => !used.has(r.nroIngreso))
    const exact = free.find(r => norm(r.plate) === p)
    if (exact) return { row: exact, match: 'patente' }
    const trailer = free.find(r => norm(r.trailer) === p)
    if (trailer) return { row: trailer, match: 'acoplado' }
    const near = free.filter(r => oneOff(norm(r.plate), p) || oneOff(norm(r.trailer), p))
    return near.length === 1 ? { row: near[0], match: 'parecida' } : null
  }

  for (const t of trucks) {
    // Primero en la planta; si no, un ingreso abierto de otra planta (destino): el R7 se da de alta en Ricardone como Terminal.
    const open = find(t.plate, sgcOpen) ?? find(t.plate, sgcOtherPlants)
    if (open) {
      used.add(open.row.nroIngreso)
      out.push({ plate: open.row.plate, tf: t, sgc: open.row, sgcClosed: null, match: open.match, sources: 'ambas', dwellPlantMin: open.row.minutes, dwellSource: SOURCE_SGC, status: t.status })
      continue
    }
    const closed = find(t.plate, sgcClosed)
    if (closed) used.add(closed.row.nroIngreso)
    out.push({ plate: t.plate, tf: t, sgc: null, sgcClosed: closed?.row ?? null, match: closed?.match ?? null, sources: 'tf', dwellPlantMin: t.dwellPlantMin, dwellSource: t.dwellPlantMin != null ? SOURCE_TF : null, status: t.status })
  }

  for (const r of sgcOpen) {
    if (used.has(r.nroIngreso)) continue
    out.push({ plate: r.plate, tf: null, sgc: r, sgcClosed: null, match: null, sources: 'sgc', dwellPlantMin: r.minutes, dwellSource: SOURCE_SGC, status: statusFromMinutes(r.minutes) })
  }
  return out.sort((a, b) => (b.dwellPlantMin ?? -1) - (a.dwellPlantMin ?? -1))
}
