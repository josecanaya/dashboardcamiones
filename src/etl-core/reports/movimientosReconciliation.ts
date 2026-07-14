/**
 * Guardia de reconciliación movimientos Excel ↔ operaciones emitidas
 * (función pura, etl-core/reports).
 *
 * Invariante de negocio (usuario, 2026-07-14): el ETL nunca puede emitir MÁS
 * operaciones que las filas del Excel de movimientos — las cámaras pueden perder
 * operaciones (nunca captarlas todas), pero jamás inventarlas. Si por patente el
 * ETL emite más de lo cargado, hay duplicación y debe saltar sola en cada corrida.
 *
 * Verifica tres cosas, todas señal de duplicación/misasignación:
 *  1. Patentes con `emitido > cargado`.
 *  2. `external_operation_id` emitidos que no existen en lo cargado (fantasmas).
 *  3. Un `external_operation_id` asignado a más de una patente (misasignación).
 */

export type ReconEntry = {
  plate_normalized: string
  external_operation_id: string
}

export type ReconPlateRow = {
  plate: string
  loaded: number
  emitted: number
  /** emitido - cargado; > 0 es violación. */
  diff: number
}

export type MovimientosReconciliation = {
  perPlate: ReconPlateRow[]
  /** Patentes con emitido > cargado. Vacío = sano. */
  violations: ReconPlateRow[]
  /** Ids emitidos que no están en lo cargado. */
  phantomEmittedIds: string[]
  /** Ids emitidos bajo más de una patente. */
  crossPlateIds: { external_operation_id: string; plates: string[] }[]
  totalLoaded: number
  totalEmitted: number
  /** true si no hay violaciones, fantasmas ni cross-patente. */
  ok: boolean
}

const clean = (v: unknown) => String(v ?? '').trim()

/**
 * Reconcilia lo cargado (Excel) contra lo emitido (operaciones del ETL).
 * `filter` permite acotar a un rubro (p. ej. solo aceite) usando cualquier
 * criterio que el llamador conozca; se aplica a ambos lados por igual.
 */
export function reconcileMovimientos(
  loaded: ReconEntry[],
  emitted: ReconEntry[],
  filter?: (e: ReconEntry) => boolean
): MovimientosReconciliation {
  const loadedF = filter ? loaded.filter(filter) : loaded
  const emittedF = filter ? emitted.filter(filter) : emitted

  const loadedByPlate = new Map<string, number>()
  const loadedIds = new Set<string>()
  for (const e of loadedF) {
    const p = clean(e.plate_normalized)
    if (p) loadedByPlate.set(p, (loadedByPlate.get(p) ?? 0) + 1)
    const id = clean(e.external_operation_id)
    if (id) loadedIds.add(id)
  }

  const emittedByPlate = new Map<string, number>()
  const idToPlates = new Map<string, Set<string>>()
  for (const e of emittedF) {
    const p = clean(e.plate_normalized)
    if (p) emittedByPlate.set(p, (emittedByPlate.get(p) ?? 0) + 1)
    const id = clean(e.external_operation_id)
    if (id) {
      if (!idToPlates.has(id)) idToPlates.set(id, new Set())
      if (p) idToPlates.get(id)!.add(p)
    }
  }

  const plates = new Set<string>([...loadedByPlate.keys(), ...emittedByPlate.keys()])
  const perPlate: ReconPlateRow[] = []
  for (const plate of plates) {
    const l = loadedByPlate.get(plate) ?? 0
    const em = emittedByPlate.get(plate) ?? 0
    perPlate.push({ plate, loaded: l, emitted: em, diff: em - l })
  }
  perPlate.sort((a, b) => b.diff - a.diff || a.plate.localeCompare(b.plate))

  const violations = perPlate.filter((r) => r.diff > 0)

  const phantomEmittedIds: string[] = []
  for (const id of idToPlates.keys()) {
    if (!loadedIds.has(id)) phantomEmittedIds.push(id)
  }

  const crossPlateIds: { external_operation_id: string; plates: string[] }[] = []
  for (const [id, ps] of idToPlates) {
    if (ps.size > 1) crossPlateIds.push({ external_operation_id: id, plates: [...ps].sort() })
  }

  return {
    perPlate,
    violations,
    phantomEmittedIds,
    crossPlateIds,
    totalLoaded: loadedF.length,
    totalEmitted: emittedF.length,
    ok: violations.length === 0 && phantomEmittedIds.length === 0 && crossPlateIds.length === 0,
  }
}

/** CSV por patente (loaded/emitted/diff), violaciones primero. */
export function movimientosReconciliationCsv(recon: MovimientosReconciliation): string {
  const header = 'plate,loaded,emitted,diff,flag'
  const lines = recon.perPlate.map((r) => {
    const flag = r.diff > 0 ? 'VIOLACION' : ''
    return `${r.plate},${r.loaded},${r.emitted},${r.diff},${flag}`
  })
  return [header, ...lines].join('\n') + '\n'
}
