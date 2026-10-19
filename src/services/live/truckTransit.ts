import { pathLengthPercent, plantTramoId, tramoPath } from '../../data/plantRouteGeometry'
import type { PlantLayout, PlantPoint } from '../../data/plantZones.types'
import type { TruckRow } from './plantStateApi'

/**
 * Camión sobre el plano: quieto en un punto, esperando en una playa (`waitZoneId`) o en tránsito
 * por la línea hacia el siguiente punto. `inferred` = la ubicación supone una lectura que no llegó.
 */
export type TruckPlacement = {
  plate: string
  pointId: string
  waitZoneId: string | null
  transit: { toPointId: string; fraction: number; guessed: boolean } | null
  inferred: boolean
}

const MIN_PER_PERCENT = 0.3
const MIN_TRAVEL = 2
const MAX_TRAVEL = 15
/** Nunca llega al nodo siguiente solo por tiempo: llegar lo decide la próxima lectura de cámara. */
const MAX_FRACTION = 0.92

/** Código lógico del circuito (S9, SL_S4) → punto del plano (S9-V1, S4), prefiriendo el que tiene tramo desde `fromId`. */
export function resolvePointId(code: string | null | undefined, points: PlantPoint[], fromId: string | null, tramoIds: Set<string>) {
  if (!code) return null
  const c = code.replace(/^SL_/, '')
  if (points.some((p) => p.id === c)) return c
  const lanes = points.filter((p) => p.id.startsWith(`${c}-`))
  if (!lanes.length) return null
  return (fromId && lanes.find((p) => tramoIds.has(plantTramoId(fromId, p.id)))?.id) || lanes[0].id
}

/** Patentes que difieren en un carácter (cambiado, sobrante o faltante): misma unidad leída distinto. */
export function nearPlate(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/**
 * Ubica cada camión sobre el plano:
 * - en su último punto mientras dura su permanencia ahí (`stayMin`);
 * - después, si el punto tiene playa de espera (`waitZone`), en la grilla de esa playa hasta su próxima lectura;
 * - si no, en la línea hacia el siguiente punto (el esperado por su circuito o `nextDefault`), avanzando
 *   según los minutos desde la última lectura sobre un tiempo de viaje estimado por el largo del tramo.
 * Un punto con `assumeNextAfterMin` (Ingreso) da por pasado el siguiente si el camión ya figura en SGC
 * o si pasó ese tiempo sin lectura; y se descarta como lectura duplicada si la misma unidad (patente
 * a un carácter) ya está más adentro de la planta.
 */
export function placeTrucks(trucks: TruckRow[], layout: PlantLayout | null, opts: { sgcPlates?: Set<string> } = {}): TruckPlacement[] {
  if (!layout?.points?.length || !layout.basePlan) return []
  const { width, height } = layout.basePlan
  const points = layout.points
  const byId = new Map(points.map((p) => [p.id, p]))
  const byDevice = new Map<string, string>()
  for (const p of points) for (const d of p.cameraGroup.devices) byDevice.set(d, p.id)
  const bySector = new Map<string, string>()
  for (const p of points) if (!bySector.has(p.sectorCode)) bySector.set(p.sectorCode, p.id)
  const zonesWithShape = new Set(layout.zones.filter((z) => (z.polygonPercent?.length ?? 0) >= 3).map((z) => z.zoneId))
  const tramos = layout.tramos ?? []
  const tramoIds = new Set(tramos.map((t) => t.id))
  const sgc = opts.sgcPlates ?? new Set<string>()

  const located = trucks.flatMap((t) => {
    const pointId = (t.lastDevice && byDevice.get(t.lastDevice)) || bySector.get(t.sectorCode)
    return pointId ? [{ t, pointId }] : []
  })
  const deeper = located.filter(({ pointId }) => byId.get(pointId)?.assumeNextAfterMin == null).map(({ t }) => t.plate)

  return located.flatMap(({ t, pointId }): TruckPlacement[] => {
    let from = byId.get(pointId)!
    let elapsed = t.minutesSinceLastDetection ?? 0
    let inferred = false
    if (from.assumeNextAfterMin != null) {
      if (deeper.some((p) => p !== t.plate && nearPlate(p, t.plate))) return []
      const next = from.nextDefault ? byId.get(from.nextDefault) : undefined
      if (next && (sgc.has(t.plate) || elapsed >= from.assumeNextAfterMin)) {
        from = next
        elapsed = Infinity
        inferred = true
      }
    }
    const base = { plate: t.plate, pointId: from.id, inferred }
    const stay = from.stayMin === undefined ? 0 : from.stayMin
    const left = stay !== null && elapsed >= stay
    if (from.waitZone && zonesWithShape.has(from.waitZone) && (stay === null || left)) return [{ ...base, waitZoneId: from.waitZone, transit: null }]
    if (!left) return [{ ...base, waitZoneId: null, transit: null }]
    const expected = resolvePointId(t.nextExpectedPoint, points, from.id, tramoIds)
    const toId = expected && expected !== from.id ? expected : from.nextDefault ?? null
    const to = toId ? byId.get(toId) : undefined
    if (!to) return [{ ...base, waitZoneId: null, transit: null }]
    const travel = Math.min(MAX_TRAVEL, Math.max(MIN_TRAVEL, pathLengthPercent(tramoPath(from, to, tramos), width, height) * MIN_PER_PERCENT))
    const fraction = Math.min(MAX_FRACTION, Math.max(0.04, (elapsed - (stay ?? 0)) / travel))
    return [{ ...base, waitZoneId: null, transit: { toPointId: to.id, fraction, guessed: !expected || expected === from.id } }]
  })
}
