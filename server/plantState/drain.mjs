/**
 * Tasa efectiva de drenaje y tiempo estimado de espera por zona.
 *
 * La tasa que vacía una zona NO es una constante: Celda 16 no puede recibir mientras
 * carga, y los silos tampoco. Con todo activo Playa 3 drena a ~24/h; si Celda 16 está
 * cargando quedan ~13/h y el mismo backlog pasa de 1 h 25 a 2 h 37 sin que entre un
 * camión más. Por eso se suman solo los puntos que están recibiendo ahora.
 */

import { POINTS, LOAD_DEVICES, devicesOfPoint, pointIdsOfSite } from './plantGraph.mjs'
import { DEFAULT_SITE } from './sectorProfiles.mjs'

/** Ventana para considerar que un punto está operando. */
export const ACTIVITY_WINDOW_MS = 20 * 60 * 1000

/**
 * @typedef {{ receiving: boolean, loading: boolean, lastEventAgeMs: number|null }} PointActivity
 * @typedef {Record<string, PointActivity>} PointActivityMap
 */

/**
 * Construye la actividad por punto a partir de los eventos normalizados.
 * @param {{ t: number, device: string }[]} normalized
 * @param {number} nowMs
 * @param {string} [site]
 * @returns {PointActivityMap}
 */
export function buildPointActivity(normalized, nowMs, site = DEFAULT_SITE) {
  const since = nowMs - ACTIVITY_WINDOW_MS
  /** @type {PointActivityMap} */
  const out = {}

  // Solo los puntos de esta planta: recorrer los de la otra es trabajo perdido
  // y deja en el mapa puntos que nunca van a tener eventos.
  for (const pointId of pointIdsOfSite(site)) {
    const devices = new Set(devicesOfPoint(pointId))
    const loadSet = new Set(LOAD_DEVICES.get(pointId) ?? [])
    let lastT = Number.NaN
    let recent = 0
    let recentLoad = 0

    for (const row of normalized) {
      if (!devices.has(row.device)) continue
      if (!Number.isFinite(lastT) || row.t > lastT) lastT = row.t
      if (row.t <= since) continue
      recent += 1
      if (loadSet.has(row.device)) recentLoad += 1
    }

    out[pointId] = {
      receiving: recent > 0 && recentLoad === 0,
      loading: recentLoad > 0,
      lastEventAgeMs: Number.isFinite(lastT) ? nowMs - lastT : null,
    }
  }

  // Exclusiones declaradas: si el par está cargando, el de recepción no recibe.
  for (const p of Object.values(POINTS)) {
    if (!p.exclusiveWith) continue
    if (!out[p.id]) continue
    const other = out[p.exclusiveWith]
    if (other?.loading) out[p.id].receiving = false
  }
  // Los silos comparten sistema con la carga desde silos.
  if (out.CARGA_SILOS?.loading && out.SILOS) out.SILOS.receiving = false
  if (out.SILOS?.loading && out.CARGA_SILOS) out.CARGA_SILOS.receiving = false

  return out
}

/**
 * Suma las tasas de los puntos de destino que están recibiendo ahora.
 * Si ningún punto tiene tasa relevada, devuelve null (no cero).
 * @param {{ to: string[] }} zone
 * @param {PointActivityMap} activity
 * @returns {{ rate: number|null, nominal: number|null, activePoints: string[], idlePoints: string[] }}
 */
export function effectiveDrainRate(zone, activity) {
  const targets = zone?.to ?? []
  let rate = 0
  let nominal = 0
  let known = 0
  /** @type {string[]} */
  const activePoints = []
  /** @type {string[]} */
  const idlePoints = []

  for (const pointId of targets) {
    const p = POINTS[pointId]
    if (!p || p.ratePerHour == null) continue

    // Pares excluyentes (recepción de silos vs. carga desde silos): nunca suman los
    // dos. Si el otro ya se contó, este no aporta.
    if (p.exclusiveWith && activePoints.includes(p.exclusiveWith)) {
      idlePoints.push(pointId)
      continue
    }

    known += 1
    nominal += p.ratePerHour
    const act = activity?.[pointId]
    // Sin lectura de actividad se asume operando: no inventar una parada.
    const receiving = act ? act.receiving || act.lastEventAgeMs == null : true
    if (receiving) {
      rate += p.ratePerHour
      activePoints.push(pointId)
    } else {
      idlePoints.push(pointId)
    }
  }

  if (!known) return { rate: null, nominal: null, activePoints: [], idlePoints: [] }
  return { rate, nominal, activePoints, idlePoints }
}

/**
 * Minutos estimados hasta vaciar la zona al ritmo actual.
 * @returns {number|null} null si no hay tasa relevada o si nada está drenando.
 */
export function drainMinutes(zone, backlog, activity) {
  const { rate } = effectiveDrainRate(zone, activity)
  if (rate == null) return null
  if (rate <= 0) return null
  const n = Number(backlog ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round((n / rate) * 60)
}

/** "2 h 48" · "9 min" · null */
export function formatDrain(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return null
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}
