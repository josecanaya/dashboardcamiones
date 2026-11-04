/**
 * Capa 2 del reconocedor («¿Quién es?»). Cada lectura se busca primero en Vehículos Permitidos
 * (autorizaciones y bases del back office: server/live/padron/vehiculosPermitidos.mjs) y después
 * en la carta de porte del padrón del día (server/live/padron). Si la patente es un chasis conocido no
 * es un caso; si es un acoplado, la lectura es del chasis. Las que no están se buscan por parecido entre
 * las patentes de las cartas vigentes (`platesAt`) antes que en la balanza; lo que no resuelve la carta pasa
 * al corrector (capa 3) y la patente corregida vuelve a buscarse acá.
 *
 * Carta vigente = turno STOP a un día de la lectura, o (sin turno) partida entre 2 días antes y 1 después.
 * Las anuladas no cuentan: la patente puede no haber venido nunca. Un vehículo permitido vale siempre.
 */
const DAY_MS = 86_400_000
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const shiftDay = (day, n) => arDay(Date.parse(`${day}T15:00:00Z`) + n * DAY_MS)

function vigente(note, t) {
  if (note.stateCode === 'AN') return false
  if (note.turnDay) {
    const day = arDay(t)
    return note.turnDay >= shiftDay(day, -1) && note.turnDay <= shiftDay(day, 1)
  }
  const dep = Date.parse(note.departure ?? '')
  return Number.isFinite(dep) && t - dep <= 2 * DAY_MS && dep - t <= DAY_MS
}

/**
 * @typedef {{ source: 'permitido', role: 'chasis'|'acoplado', chasis: string, category: string|null }
 *   | { source: 'carta', ctg: string, role: 'chasis'|'acoplado', chasis: string, direction: string, grain: string|null }} PadronHit
 * @param {{ lookup: (plate: string) => object[], notes?: () => Iterable<object> } | null} padron
 * @param {{ lookup: (plate: string) => object|null } | null} [permitidos]
 * @returns {{ at: (plate: string, t: number) => PadronHit | null, cartaAt: (plate: string, t: number) => object | null, platesAt: (t: number) => { plate: string, chasis: string, role: 'chasis'|'acoplado', ctg: string }[] }}
 */
export function padronCartas(padron, permitidos = null) {
  /** Universo por hora: las cartas vigentes cambian por día de turno, no minuto a minuto. */
  const universe = new Map()
  return {
    /**
     * Patentes (chasis y acoplados) de todas las cartas vigentes a la hora `t`: el universo donde se busca
     * la patente parecida de una lectura que no está en ninguna carta.
     */
    platesAt(t) {
      const hour = Math.floor(t / 3600_000)
      if (!universe.has(hour)) {
        const out = []
        for (const n of padron?.notes?.() ?? []) {
          if (!n.plates?.length || !vigente(n, t)) continue
          n.plates.forEach((p, i) => out.push({ plate: p, chasis: n.plates[0], role: i ? 'acoplado' : 'chasis', ctg: n.ctg }))
        }
        if (universe.size > 48) universe.clear()
        universe.set(hour, out)
      }
      return universe.get(hour)
    },
    at(plate, t) {
      const p = plateOf(plate)
      if (p.length < 5) return null
      const v = permitidos?.lookup(p)
      const notes = (padron?.lookup(p) ?? []).filter((n) => vigente(n, t))
      // El par acoplado → chasis de Vehículos Permitidos es histórico (los acoplados cambian de camión):
      // con una carta vigente para esa patente, manda la carta.
      if (v && !(v.role === 'acoplado' && notes.length)) return { source: 'permitido', role: v.role === 'acoplado' ? 'acoplado' : 'chasis', chasis: v.role === 'acoplado' ? v.chasis : p, category: v.category ?? null }
      if (!notes.length) return null
      // Como chasis manda sobre como acoplado; entre varias, la de turno o partida más cercana.
      const ref = (n) => Math.abs((n.turnDay ? Date.parse(`${n.turnDay}T15:00:00Z`) : Date.parse(n.departure)) - t)
      const n = [...notes].sort((a, b) => Number(b.plates[0] === p) - Number(a.plates[0] === p) || ref(a) - ref(b))[0]
      return { source: 'carta', ctg: n.ctg, role: n.plates[0] === p ? 'chasis' : 'acoplado', chasis: n.plates[0], direction: n.direction, grain: n.grain ?? null }
    },
    /** Carta de porte vigente de la patente (sin mirar Vehículos Permitidos): ese día viene con granos. */
    cartaAt(plate, t) {
      const p = plateOf(plate)
      if (p.length < 5) return null
      return (padron?.lookup(p) ?? []).find((n) => vigente(n, t)) ?? null
    },
  }
}

/** «carta de porte 1013…» o «Vehículos Permitidos (agua)», para los motivos del reconocedor. */
export function padronLabel(hit) {
  if (!hit) return ''
  return hit.source === 'permitido' ? `Vehículos Permitidos${hit.category ? ` (${hit.category.replace(/_/g, ' ')})` : ''}` : `carta de porte ${hit.ctg}`
}
