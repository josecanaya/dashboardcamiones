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
const READ_CODES = new Set(['LPR_MALFUNCTION', 'UNMATCHED_TAIL_OBSERVATION', 'INVALID_ROUTE', 'INVALID_JOURNEY_START'])
const plateKey = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

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
  const plate = plateKey(p.normalizedPlate ?? p.plate) || plateKey(/plate <([^>]+)>/.exec(String(a.description ?? ''))?.[1])
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
  }
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
