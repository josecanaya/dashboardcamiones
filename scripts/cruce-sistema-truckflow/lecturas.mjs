/**
 * Lecturas crudas de cámara de todos los días guardados (`data/truckflow/<día>/`): eventos de
 * journey + alertas (INVALID_ROUTE, INVALID_JOURNEY_START, UNMATCHED_TAIL, LPR_MALFUNCTION…).
 * Las alertas son lecturas reales que no entraron a un journey: ahí está casi toda patente mala.
 *
 * Hora operativa (ms, reloj de pared Argentina como epoch real):
 *  - evento: occurredAt + 206 min (skew fijo del sensor); en el export roto 27/08→02/09 ya viene en
 *    hora de pared (occurredAt ≈ createdAt) y no se suma.
 *  - alerta: hora de la cámara (payload externalEventBody.UTC, hora local rotulada como UTC) + 240 s,
 *    la misma escala que los eventos (feed = cámara + 240 s). createdAt llega 3–5 min tarde y el
 *    atraso cambia con los días (190 s en agosto, 320 s en octubre): solo se usa si falta el UTC.
 *
 * Uso: node scripts/cruce-sistema-truckflow/lecturas.mjs  → cache en reportes/cruce-sistema-truckflow/_lecturas.jsonl
 * (una línea por día: {day, reads:[[t, device, plate, src, code, conf, color, category, brand]]}).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
export const OUT_DIR = join(root, 'reportes/cruce-sistema-truckflow')
export const CACHE = join(OUT_DIR, '_lecturas.jsonl')
const SKEW_MS = 206 * 60_000
/** Hora del feed TruckFlow = hora real de la cámara + 240 s (ver server/dssPhotoLookup.mjs). */
const FEED_LAG_MS = 240_000

export const plateKey = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const loadArr = (file) => {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
}

function readDay(day) {
  const dir = join(root, 'data/truckflow', day)
  const reads = []
  const fe = join(dir, 'event-list.json')
  if (existsSync(fe)) {
    let arr = loadArr(fe)
    const fRaw = join(dir, 'event-list.raw.json')
    if (existsSync(fRaw)) {
      const r = loadArr(fRaw)
      if (r.length > arr.length) arr = r
    }
    for (const e of arr) {
      let t = Date.parse(String(e.occurredAt ?? e.recordedAt ?? ''))
      const created = Date.parse(String(e.createdAt ?? ''))
      const yaEnHoraDePared = Number.isFinite(created) && Math.abs(created - t) < 60 * 60_000
      if (Number.isFinite(t)) t += yaEnHoraDePared ? 0 : SKEW_MS
      else t = created
      if (!Number.isFinite(t)) continue
      const device = String(e.deviceCode ?? '').trim()
      if (!device) continue
      reads.push([t, device, plateKey(e.truckPlate ?? e.normalizedPlate), 'e', '', null, '', '', ''])
    }
  }
  const fa = join(dir, 'alert-list.json')
  if (existsSync(fa)) {
    for (const a of loadArr(fa)) {
      const device = String(a.deviceCode ?? '').trim()
      if (!device) continue
      let p = {}
      try {
        p = typeof a.payload === 'string' ? JSON.parse(a.payload) : (a.payload ?? {})
      } catch {
        /* payload no JSON */
      }
      const body = p.externalEventBody ?? {}
      const camUtc = Number(body.UTC)
      const t = Number.isFinite(camUtc) && camUtc > 0 ? camUtc * 1000 + 3 * 3600_000 + FEED_LAG_MS : Date.parse(String(a.createdAt ?? ''))
      if (!Number.isFinite(t)) continue
      const plate = plateKey(p.normalizedPlate ?? p.plate) || plateKey(/Truck <([^>]+)>/.exec(String(a.description ?? ''))?.[1]) || plateKey(/plate <([^>]+)>/.exec(String(a.description ?? ''))?.[1])
      reads.push([
        t,
        device,
        plate,
        'a',
        String(a.alertCode ?? ''),
        body.Object?.Confidence ?? null,
        String(body.VehicleColor ?? body.TrafficCar?.VehicleColor ?? ''),
        String(body.Vehicle?.Category ?? ''),
        String(body.VehicleBrand ?? ''),
      ])
    }
  }
  return reads
}

export function buildCache({ force = false } = {}) {
  mkdirSync(OUT_DIR, { recursive: true })
  const days = readdirSync(join(root, 'data/truckflow')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!force && existsSync(CACHE)) {
    const cacheMs = statSync(CACHE).mtimeMs
    const stale = days.some((d) => {
      const dir = join(root, 'data/truckflow', d)
      return ['event-list.json', 'alert-list.json'].some((f) => existsSync(join(dir, f)) && statSync(join(dir, f)).mtimeMs > cacheMs)
    })
    if (!stale) return
  }
  const lines = []
  for (const day of days) {
    const reads = readDay(day)
    lines.push(JSON.stringify({ day, reads }))
    process.stderr.write(`\r${day} ${reads.length}      `)
  }
  process.stderr.write('\n')
  writeFileSync(CACHE, lines.join('\n'))
}

/** Todas las lecturas, sin duplicados (el export repite eventos entre días vecinos), ordenadas por hora. */
export function loadReads() {
  buildCache()
  const seen = new Set()
  const out = []
  for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line) continue
    for (const r of JSON.parse(line).reads) {
      const k = `${r[0]}|${r[1]}|${r[2]}|${r[3]}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ t: r[0], dev: r[1], plate: r[2], src: r[3], code: r[4], conf: r[5], color: r[6], cat: r[7], brand: r[8] })
    }
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) buildCache({ force: process.argv.includes('--force') })
