/**
 * Lecturas de cámara que TruckFlow solo manda como alerta (LPR_MALFUNCTION, UNMATCHED_TAIL_OBSERVATION,
 * INVALID_ROUTE, INVALID_JOURNEY_START): no entran a ningún journey y por eso el reconocedor no las veía.
 * Cruce 13–19/10: 67 de 175 lecturas malas de camiones del Sistema eran solo alertas.
 *
 * Se convierten en eventos de un journey propio (`alert-<id>`) para que la identificación las trate como
 * cualquier lectura suelta. Hora: la de la cámara (externalEventBody.UTC, hora local rotulada como UTC)
 * + 240 s, la misma escala que el feed; occurredAt se guarda sin el skew de 206 min que suma el feed.
 */
import { getEventLiveInstantMs } from './liveEventTime.mjs'

const SKEW_MS = 206 * 60_000
const FEED_LAG_MS = 240_000
/** Una alerta que repite un evento del feed (misma cámara y patente, ±2 min) no suma nada. */
const DUP_MS = 2 * 60_000
/**
 * TRAILER_MISMATCH también es una lectura de la trasera (el acoplado observado); el viaje al que Enesimal la
 * pegó no se usa: en los pares que confirma la carta, la trasera llega a 10–60 s de su frontal y estos
 * emparejamientos daban ~17 min (ensamblador de pasos, pasos.mjs).
 */
const READ_CODES = new Set(['LPR_MALFUNCTION', 'UNMATCHED_TAIL_OBSERVATION', 'INVALID_ROUTE', 'INVALID_JOURNEY_START', 'TRAILER_MISMATCH'])
const plateKey = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const known = (v) => (v && !/^unknown$/i.test(String(v)) ? String(v) : null)
const LIGHT = new Set(['Pickup', 'SUV', 'SaloonCar', 'PassengerCar', 'MPV'])

/**
 * Lo que la cámara vio del vehículo y el feed de eventos no trae: tipo, tamaño, color, marca y la
 * confianza de la lectura. Solo llega en el payload de las alertas (externalEventBody del DSS).
 * @returns {{ category: string|null, size: string|null, color: string|null, brand: string|null, plateConfidence: number|null, vehicleClass: 'liviano'|'camion'|null }|null}
 */
export function alertAttributes(a) {
  let p = {}
  try {
    p = typeof a?.payload === 'string' ? JSON.parse(a.payload) : (a?.payload ?? {})
  } catch {
    return null
  }
  const b = p.externalEventBody
  if (!b) return null
  const category = known(b.Vehicle?.Category)
  const size = known(b.TrafficCar?.VehicleSize)
  const conf = Number(b.Object?.Confidence)
  return {
    category,
    size,
    color: known(b.VehicleColor ?? b.TrafficCar?.VehicleColor),
    brand: known(b.VehicleBrand),
    plateConfidence: Number.isFinite(conf) ? conf : null,
    // El tamaño es lo más estable entre cámaras; la categoría sola confunde camionetas con camiones chicos.
    vehicleClass: size === 'Light-duty' || (LIGHT.has(category) && size !== 'Oversize') ? 'liviano' : size === 'Oversize' || /Truck$/.test(category ?? '') ? 'camion' : null,
  }
}

/** Instante operativo de la alerta (ms) o NaN. */
export function alertInstantMs(a) {
  let p = {}
  try {
    p = typeof a.payload === 'string' ? JSON.parse(a.payload) : (a.payload ?? {})
  } catch {
    p = {}
  }
  const utc = Number(p.externalEventBody?.UTC)
  return Number.isFinite(utc) && utc > 0 ? utc * 1000 + 3 * 3600_000 + FEED_LAG_MS : Number.NaN
}

/** @returns {object|null} evento sintético o null si la alerta no es una lectura usable */
export function alertToReadEvent(a) {
  const code = String(a?.alertCode ?? '').toUpperCase()
  if (!READ_CODES.has(code)) return null
  const device = String(a.deviceCode ?? '').trim()
  const sectorCode = String(a.sectorCode ?? '').trim()
  if (!device || !sectorCode) return null
  let p = {}
  try {
    p = typeof a.payload === 'string' ? JSON.parse(a.payload) : (a.payload ?? {})
  } catch {
    p = {}
  }
  const plate = plateKey(p.normalizedPlate ?? p.plate ?? p.observedTrailerPlate) || plateKey(/(?:plate|trailer) <([^>]+)>/.exec(String(a.description ?? ''))?.[1])
  const t = alertInstantMs(a)
  if (!Number.isFinite(t)) return null
  const occurredAt = new Date(t - SKEW_MS).toISOString()
  return {
    id: `alert-${a.id}`,
    journeyUid: `alert-${a.id}`,
    truckPlate: plate,
    normalizedPlate: plate,
    sectorCode,
    deviceCode: device,
    occurredAt,
    recordedAt: occurredAt,
    eventCategory: 'physical',
    eventType: 'alert_read',
    fromAlert: code,
    attributes: alertAttributes(a),
  }
}

/**
 * Suma a cada evento del feed los atributos de la alerta de esa misma lectura (misma cámara y patente,
 * ±2 min). Las alertas de ruta e inicio inválidos salen de lecturas del feed: ahí está el color/marca/tipo.
 * @param {object[]} events
 * @param {object[]} alerts
 */
export function withAlertAttributes(events, alerts) {
  const byKey = new Map()
  for (const a of alerts) {
    const attributes = alertAttributes(a)
    const t = alertInstantMs(a)
    if (!attributes || !Number.isFinite(t)) continue
    let plate = ''
    try {
      const p = typeof a.payload === 'string' ? JSON.parse(a.payload) : (a.payload ?? {})
      plate = plateKey(p.normalizedPlate ?? p.plate)
    } catch {}
    plate ||= plateKey(a.truckPlate)
    const k = `${String(a.deviceCode ?? '').trim()}|${plate}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push({ t, attributes })
  }
  if (!byKey.size) return events
  return events.map((e) => {
    if (e.attributes) return e
    const list = byKey.get(`${String(e.deviceCode ?? '').trim()}|${plateKey(e.truckPlate ?? e.normalizedPlate)}`)
    if (!list) return e
    const t = getEventLiveInstantMs(e)
    const hit = list.filter((x) => Math.abs(x.t - t) <= DUP_MS).sort((x, y) => Math.abs(x.t - t) - Math.abs(y.t - t))[0]
    return hit ? { ...e, attributes: hit.attributes } : e
  })
}

/**
 * Alertas → eventos, sin las que repiten una lectura del feed.
 * @param {object[]} alerts
 * @param {object[]} events eventos del feed del mismo período
 */
export function alertReadEvents(alerts, events) {
  const seen = new Map()
  for (const e of events) {
    const k = `${e.deviceCode}|${plateKey(e.truckPlate ?? e.normalizedPlate)}`
    const t = getEventLiveInstantMs(e)
    if (!Number.isFinite(t)) continue
    if (!seen.has(k)) seen.set(k, [])
    seen.get(k).push(t)
  }
  const out = []
  const ids = new Set()
  for (const a of alerts) {
    const ev = alertToReadEvent(a)
    if (!ev || ids.has(ev.id)) continue
    const t = getEventLiveInstantMs(ev)
    if ((seen.get(`${ev.deviceCode}|${ev.truckPlate}`) ?? []).some((x) => Math.abs(x - t) <= DUP_MS)) continue
    ids.add(ev.id)
    out.push(ev)
  }
  return out
}
