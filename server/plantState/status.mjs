/**
 * Reglas de estado operativo por tipo de sector.
 * Orden estricto: la primera rama que aplica gana.
 */

/**
 * Estado de una ZONA de espera. Orden estricto: la primera rama que aplica gana.
 *
 * A diferencia del sector, la zona se evalúa contra la capacidad OPERATIVA (cuántos
 * camiones puede haber sin romper la operación), no contra la física (cuántos entran).
 * Playa 3 es el caso: entran 141, pero el límite operativo es 30 porque a partir de
 * ahí los camiones estacionados bloquean la circulación.
 *
 * @param {{ backlog?: number, entryBlind?: boolean, capacityOperational?: number|null, drainMinutes?: number|null, drainRatePerHour?: number|null }} zone
 * @param {{ drainMinutes?: number, samples?: number }|null|undefined} baseline
 * @param {{ status?: string, lastEventAgeS?: number|null }|null|undefined} drainEdge  Edge del punto que drena
 * @returns {'normal'|'attention'|'critical'|'no_data'}
 */
export function resolveZoneStatus(zone, baseline, drainEdge) {
  // Sin lecturas en la entrada, el backlog no se midio: no se puede dar estado.
  if (zone?.entryBlind) return 'no_data'
  if (drainEdge) {
    if (drainEdge.status === 'offline') return 'no_data'
    if (
      drainEdge.lastEventAgeS != null &&
      Number.isFinite(drainEdge.lastEventAgeS) &&
      drainEdge.lastEventAgeS > 900
    ) {
      return 'no_data'
    }
  }

  const backlog = Number(zone?.backlog ?? 0)
  const capOp = zone?.capacityOperational
  const hasCap = capOp != null && Number.isFinite(capOp) && capOp > 0
  const drain = zone?.drainMinutes
  const hasDrain = drain != null && Number.isFinite(drain)
  const hasBaseline =
    baseline != null && Number.isFinite(baseline.drainMinutes) && baseline.drainMinutes > 0

  if (hasCap && backlog > capOp) return 'critical'
  if (hasBaseline && hasDrain && drain > 2 * baseline.drainMinutes) return 'critical'

  if (hasCap && backlog > 0.85 * capOp) return 'attention'
  if (hasBaseline && hasDrain && drain > 1.5 * baseline.drainMinutes) return 'attention'

  return 'normal'
}

/**
 * Cuello de botella de la planta: la zona con MAYOR tiempo de drenaje, no la de
 * mayor backlog. 168 camiones que drenan en 2 h 48 duelen más que 34 que drenan en
 * 1 h 25.
 * @param {{ id: string, label: string, backlog: number, drainMinutes: number|null }[]} zones
 * @returns {{ zoneId: string, label: string, drainMinutes: number, backlog: number }|null}
 */
export function resolveBottleneck(zones) {
  let best = null
  for (const z of zones || []) {
    const d = z?.drainMinutes
    if (d == null || !Number.isFinite(d) || d <= 0) continue
    if (!best || d > best.drainMinutes) {
      best = { zoneId: z.id, label: z.label, drainMinutes: d, backlog: z.backlog ?? 0 }
    }
  }
  return best
}

/**
 * @typedef {'normal'|'attention'|'critical'|'no_data'} SectorStatus
 * @typedef {{ type: string, present?: number, capacity?: number|null, rate60?: number, delta40?: number, dwellP90Min?: number|null }} SectorLike
 * @typedef {{ rate60: number, dwellP90Min: number, samples?: number }|null|undefined} BaselineLike
 * @typedef {{ status?: string, lastEventAgeS?: number|null }|null|undefined} EdgeLike
 */

/**
 * @param {SectorLike} sector
 * @param {BaselineLike} baseline
 * @param {EdgeLike} edge
 * @returns {SectorStatus}
 */
export function resolveSectorStatus(sector, baseline, edge) {
  // 1. Sin dato por Edge
  if (edge) {
    if (edge.status === 'offline') return 'no_data'
    if (edge.lastEventAgeS != null && Number.isFinite(edge.lastEventAgeS) && edge.lastEventAgeS > 900) {
      return 'no_data'
    }
  }

  const type = String(sector?.type ?? '')
  const present = Number(sector?.present ?? 0)
  const capacity = sector?.capacity
  const rate60 = Number(sector?.rate60 ?? 0)
  const delta40 = Number(sector?.delta40 ?? 0)
  const dwellP90 = sector?.dwellP90Min
  const hasBaseline =
    baseline != null &&
    Number.isFinite(baseline.rate60) &&
    Number.isFinite(baseline.dwellP90Min)
  const hasCapacity = capacity != null && Number.isFinite(capacity) && capacity > 0

  // 3. Sin baseline suficiente → solo capacidad (antes de ramas que dependen de baseline).
  // Las ramas de tipo abajo respetan hasBaseline; sin él solo evalúan capacidad/delta.

  // 2. Por tipo
  if (type === 'buffer' || type === 'queue') {
    const dwellCritical =
      hasBaseline && dwellP90 != null && Number.isFinite(dwellP90) && dwellP90 > 2 * baseline.dwellP90Min
    const dwellAttention =
      hasBaseline && dwellP90 != null && Number.isFinite(dwellP90) && dwellP90 > 1.5 * baseline.dwellP90Min
    if (delta40 >= 15 || dwellCritical) return 'critical'
    if (delta40 >= 8 || dwellAttention) return 'attention'
    return 'normal'
  }

  if (type === 'process' || type === 'scale' || type === 'discharge' || type === 'load') {
    if (hasBaseline) {
      if (rate60 < 0.7 * baseline.rate60 || (hasCapacity && present >= capacity)) return 'critical'
      if (rate60 < 0.85 * baseline.rate60 || (hasCapacity && present >= 0.85 * capacity)) return 'attention'
      return 'normal'
    }
    // Sin baseline: solo capacidad
    if (hasCapacity && present >= capacity) return 'critical'
    if (hasCapacity && present >= 0.85 * capacity) return 'attention'
    return 'normal'
  }

  if (type === 'gate' || type === 'exit') {
    // Nunca critical por sí solos
    if (hasBaseline && rate60 < 0.7 * baseline.rate60) return 'attention'
    return 'normal'
  }

  // Sin baseline y sin capacidad (u otro tipo) → normal
  if (!hasBaseline && !hasCapacity) return 'normal'

  // 4. Default
  return 'normal'
}
