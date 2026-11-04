/**
 * Lote (paso 0) para los camiones sin carta de porte: viajes con la forma de VINCULO_EXTRA
 * (scripts/vinculo/cobertura.mjs), para que el vínculo también les arme el recorrido y les asigne pasos.
 * Orden del universo: carta → base sin carta del back office → SGC como última instancia
 * (docs/RECONOCEDOR_RECORRIDO_CAPTURA.md). Lo usan el servidor (vinculoLive) y el replay por capas.
 */
import { alertReadEvents } from '../../plantState/alertReads.mjs'
import { getEventLiveInstantMs } from '../../plantState/liveEventTime.mjs'
import { isValidPlate } from '../../plantState/plateIdentification.mjs'

const HORA = 3600_000
const iso = (ms) => new Date(ms).toISOString()

/**
 * Primera y última lectura de cada patente válida (feed + alertas) entre desdeMs y hastaMs.
 * @returns {Map<string, { min: number, max: number }>}
 */
export function lecturasVistas(events, alerts, desdeMs, hastaMs) {
  const vistas = new Map()
  for (const e of [...events, ...alertReadEvents(alerts ?? [], events)]) {
    const p = String(e.normalizedPlate || e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const t = getEventLiveInstantMs(e)
    if (!isValidPlate(p) || !Number.isFinite(t) || t < desdeMs || t >= hastaMs) continue
    const v = vistas.get(p) ?? vistas.set(p, { min: t, max: t }).get(p)
    v.min = Math.min(v.min, t)
    v.max = Math.max(v.max, t)
  }
  return vistas
}

/**
 * @param {{
 *   vistas: ReturnType<typeof lecturasVistas>, desdeMs: number, hastaMs: number,
 *   conCarta: (plate: string) => boolean,
 *   baseDe: (plate: string) => 'particulares'|'sin_carta'|null,
 *   visits?: { plate: string, trailer?: string|null, ingresoMs: number, salidaMs?: number|null }[],
 * }} p
 */
export function viajesSinCarta({ vistas, desdeMs, hastaMs, conCarta, baseDe, visits = [] }) {
  const out = []
  const ya = new Set()
  for (const [p, v] of vistas) {
    if (conCarta(p) || baseDe(p) !== 'sin_carta') continue
    ya.add(p)
    out.push({ ctg: `BASE:${p}`, plates: [p], departure: iso(v.min), stateCode: 'AC', desde: iso(v.min - HORA), hasta: iso(v.max + HORA), origen: 'base' })
  }
  for (const v of visits) {
    if (!isValidPlate(v.plate) || !Number.isFinite(v.ingresoMs) || v.ingresoMs < desdeMs || v.ingresoMs >= hastaMs) continue
    if (conCarta(v.plate) || baseDe(v.plate) || ya.has(v.plate)) continue
    const hasta = (Number.isFinite(v.salidaMs) ? v.salidaMs : v.ingresoMs + 12 * HORA) + HORA
    out.push({ ctg: `SGC:${v.plate}:${v.ingresoMs}`, plates: [v.plate, ...(isValidPlate(v.trailer ?? '') ? [v.trailer] : [])], departure: iso(v.ingresoMs), stateCode: 'AC', desde: iso(v.ingresoMs - HORA), hasta: iso(hasta), origen: 'sgc' })
  }
  return out
}

/**
 * Universo extra de la primera corrección (capa 3.1), además de las cartas vigentes: base sin carta siempre;
 * particulares solo si se vieron cerca de esa hora (±1 h: un fragmento corto se pegaba a cualquier auto de la
 * base, 03/11 solo el 26 % de esos autos se había visto ese día); SGC dentro de la ventana de su visita.
 * @param {ReturnType<typeof viajesSinCarta>} viajes
 * @param {{ plate: string, role: string, backoffice: { base: string } }[]} aceptados entradas del back office
 * @param {ReturnType<typeof lecturasVistas>} vistas
 * @returns {(t: number) => { plate: string, chasis: string, role: 'chasis', ctg: string }[]}
 */
export function universoExtra31(viajes, aceptados, vistas) {
  const lista = [
    ...aceptados.filter((e) => e.role === 'chasis' && (e.backoffice.base !== 'particulares' || vistas.has(e.plate))).map((e) => {
      const v = e.backoffice.base === 'particulares' ? vistas.get(e.plate) : null
      return { plate: e.plate, chasis: e.plate, role: 'chasis', ctg: e.backoffice.base === 'particulares' ? 'base particulares' : 'base sin carta', ...(v ? { desde: v.min - HORA, hasta: v.max + HORA } : {}) }
    }),
    ...viajes.filter((x) => x.origen === 'sgc').map((x) => ({ plate: x.plates[0], chasis: x.plates[0], role: 'chasis', ctg: 'SGC', desde: Date.parse(x.desde), hasta: Date.parse(x.hasta) })),
  ]
  return (t) => lista.filter((x) => !x.desde || (t >= x.desde && t <= x.hasta))
}
