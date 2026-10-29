/**
 * Registro de balanza (SGC Vicentin, respaldo: movimientos del Excel) como refuerzo del reconocedor de
 * patentes. Responde tres preguntas ante la duda:
 *   - ¿Esta patente es un camión que entró a planta? (FECHAINGRESO del SGC = alta en Preingreso).
 *   - ¿Esta patente es el ACOPLADO de un camión en planta? Las cámaras traseras leen el acoplado y el
 *     feed lo trata como otro camión: el SGC da el par camión/acoplado.
 *   - ¿Esta patente vino alguna vez a la balanza? (historia de movimientos).
 * La vista SGC aparece con demora (2 a 23 h desde el ingreso): estar en el registro es evidencia; no
 * estar todavía no prueba nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DAY_MS = 86_400_000
/** Margen de presencia: la cámara de Preingreso lee ~1 min antes del alta; el egreso puede leerse después de la salida. */
const BEFORE_INGRESO_MS = 30 * 60_000
const AFTER_SALIDA_MS = 60 * 60_000
/** Sin salida registrada, se lo da por adentro hasta 36 h (la vista desaparece a las 24 h). */
const OPEN_MAX_MS = 36 * 3600_000
const HISTORY_DAYS = 90

const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Hora local sin zona (SGC y Excel) → ms. */
const localMs = (s) => {
  if (!s) return NaN
  const str = String(s)
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(str) ? str : `${str}-03:00`)
}
const FAKE = /^(X+|P+|T+)$/

/**
 * @param {{ plate: string, trailer?: string|null, ingresoMs: number, salidaMs?: number|null, source?: string }[]} visits
 * @param {Set<string>} [known] patentes que pasaron alguna vez por la balanza
 */
export function buildBalanzaRegistry(visits, known = new Set()) {
  const byPlate = new Map()
  const byTrailer = new Map()
  for (const v of visits) {
    if (!v.plate || FAKE.test(v.plate) || !Number.isFinite(v.ingresoMs)) continue
    if (!byPlate.has(v.plate)) byPlate.set(v.plate, [])
    byPlate.get(v.plate).push(v)
    if (v.trailer && !FAKE.test(v.trailer) && v.trailer !== v.plate) {
      if (!byTrailer.has(v.trailer)) byTrailer.set(v.trailer, [])
      byTrailer.get(v.trailer).push(v)
    }
  }
  const inside = (v, t) => {
    if (t < v.ingresoMs - BEFORE_INGRESO_MS) return false
    if (Number.isFinite(v.salidaMs)) return t <= v.salidaMs + AFTER_SALIDA_MS
    return t - v.ingresoMs <= OPEN_MAX_MS
  }
  const latest = Math.max(0, ...visits.map((v) => v.ingresoMs).filter(Number.isFinite))
  return {
    size: visits.length,
    /** Última alta registrada: si la lectura es posterior, el registro todavía no la puede cubrir. */
    latestIngresoMs: latest || null,
    /** Visita del camión con esta patente que estaba en planta a la hora t. */
    truckAt(plate, t) {
      return (byPlate.get(plate) ?? []).find((v) => inside(v, t)) ?? null
    },
    /** Camión cuyo acoplado tiene esta patente y estaba en planta a la hora t (uno solo; si hay dos, null). */
    trailerAt(plate, t) {
      const hits = (byTrailer.get(plate) ?? []).filter((v) => inside(v, t))
      const trucks = new Set(hits.map((v) => v.plate))
      return trucks.size === 1 ? hits[0] : null
    },
    /** Patentes de los camiones que la balanza tiene en planta a la hora t. */
    platesAt(t) {
      const out = []
      for (const [plate, vs] of byPlate) if (vs.some((v) => inside(v, t))) out.push(plate)
      return out
    },
    /**
     * Lo que ve una cámara trasera de cada camión en planta a la hora t: su acoplado, o su chasis si va sin
     * acoplado. `truck` es la patente del chasis (el camión al que se asigna la lectura).
     */
    rearPlatesAt(t) {
      const out = []
      for (const [plate, vs] of byPlate) {
        const v = vs.find((x) => inside(x, t))
        if (v) out.push({ plate: v.trailer && !FAKE.test(v.trailer) && v.trailer !== plate ? v.trailer : plate, truck: plate })
      }
      return out
    },
    /** La patente pasó alguna vez por la balanza (historia) o figura hoy. */
    isKnown(plate) {
      return known.has(plate) || byPlate.has(plate)
    },
    isTrailer(plate) {
      return byTrailer.has(plate)
    },
  }
}

/**
 * Vehículo fuera del sistema de camiones: ni la patente leída ni ningún candidato figuran en la balanza
 * (en planta a esa hora, como acoplado, o alguna vez en la historia). Típico de autos y camionetas en
 * Egreso SL y Renova. Esos casos salen de la bandeja del operador a una lista aparte.
 * @param {{ readPlate: string, validFormat: boolean, at: string }} item
 * @param {{ plate: string, similarity?: number }[]} candidates
 * @param {ReturnType<typeof buildBalanzaRegistry>} reg
 * @param {{ closed?: boolean }} [opts] closed: caso de un día cerrado (la balanza de esa hora ya está
 *   completa): el candidato cuenta solo si estaba en planta. En vivo el SGC llega con horas de demora,
 *   así que también cuenta un candidato que vino alguna vez a la balanza.
 */
export function outsideTruckSystem(item, candidates, reg, opts = {}) {
  if (!reg) return false
  const t = Date.parse(item.at)
  const read = item.readPlate
  if (read && (reg.truckAt(read, t) || reg.trailerAt(read, t) || (item.validFormat && reg.isKnown(read)))) return false
  // Patente válida: solo cuentan los candidatos parecidos (los que entran solo por recorrido, con 0,2–0,4
  // de parecido, no son esa patente). Lectura ilegible: cuentan todos, la patente no informa.
  const plates = candidates.filter((c) => !item.validFormat || (c.similarity ?? 0) >= OUTSIDE_MIN_SIMILARITY).map((c) => c.plate)
  return !plates.some((p) => reg.truckAt(p, t) || (!opts.closed && reg.isKnown(p)))
}
const OUTSIDE_MIN_SIMILARITY = 0.65

const readJson = (f, fb) => {
  try {
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) : fb
  } catch {
    return fb
  }
}
const dayOf = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)

/** Filas del store SGC (data/sgc/<día ingreso>/ingresos.json) → visitas. */
export function visitsFromSgc(rows) {
  return rows.map((r) => ({
    plate: plateOf(r.PATENTECAMION),
    trailer: plateOf(r.PATENTEACOPLADO) || null,
    ingresoMs: localMs(r.FECHAINGRESO),
    salidaMs: r.FECHASALIDA ? localMs(r.FECHASALIDA) : null,
    /** Código de producto: separa camiones de granos de los demás vehículos (isGrainProduct). */
    cod: r.PRODUCTOCODIGO != null ? String(r.PRODUCTOCODIGO).padStart(4, '0') : null,
    source: 'sgc',
  }))
}

/** Movimientos (Excel o SGC) → visitas. El Excel no trae acoplado. */
export function visitsFromMovimientos(rows) {
  return rows.map((r) => ({
    plate: plateOf(r.plate_normalized),
    trailer: plateOf(r.trailer_plate ?? r.patente_acoplado) || null,
    ingresoMs: localMs(r.external_ingreso_at),
    salidaMs: r.external_salida_at ? localMs(r.external_salida_at) : null,
    source: 'movimientos',
  }))
}

/**
 * Lo derivado de cada archivo de día (patentes, visitas) se calcula una sola vez y se recalcula solo
 * si el archivo cambió. Antes cada día archivado releía y parseaba 90 días de movimientos (~8,8 s de
 * los ~18 s del primer estado en vivo, perfil 27/10/2026).
 */
const _derived = new Map()
function derivedFromFile(f, fallback, derive) {
  let mtimeMs = 0
  try { mtimeMs = fs.statSync(f).mtimeMs } catch { return derive(fallback) }
  const key = `${f}|${derive.name}`
  const hit = _derived.get(key)
  if (hit && hit.mtimeMs === mtimeMs) return hit.value
  const value = derive(readJson(f, fallback))
  _derived.set(key, { mtimeMs, value })
  return value
}
function movPlates(rows) {
  const set = new Set()
  for (const r of rows) {
    const p = plateOf(r.plate_normalized)
    if (p && !FAKE.test(p)) set.add(p)
  }
  return set
}
const sgcVisits = (store) => visitsFromSgc(Object.values(store))
const movVisits = (rows) => visitsFromMovimientos(rows)
/** Visitas SGC + movimientos de un día (sin copiar: quien las usa no las modifica). */
function dayVisits(root, d) {
  return [
    ...derivedFromFile(path.join(root, 'data', 'sgc', d, 'ingresos.json'), {}, sgcVisits),
    ...derivedFromFile(path.join(root, 'data', 'movimientos', d, 'movimientos.json'), [], movVisits),
  ]
}

const _known = new Map()
/** Patentes de los movimientos de los últimos HISTORY_DAYS días (se recarga cada hora o al cambiar de día). */
function knownPlates(root, nowMs) {
  const dir = path.join(root, 'data', 'movimientos')
  const from = dayOf(nowMs - HISTORY_DAYS * DAY_MS)
  // Hasta el día anterior: el día en curso lo cubre el registro (y en un replay no se mira el futuro).
  const to = dayOf(nowMs - DAY_MS)
  const key = `${dir}|${from}|${to}`
  const hit = _known.get(key)
  if (hit && Date.now() - hit.at < 3600_000) return hit.set
  const days = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to) : []
  const set = new Set()
  for (const d of days) for (const p of derivedFromFile(path.join(dir, d, 'movimientos.json'), [], movPlates)) set.add(p)
  _known.set(key, { at: Date.now(), set })
  return set
}

let _live = null
/**
 * Registro para el servidor en vivo: store SGC de los últimos 3 días + movimientos de los últimos
 * 3 días (respaldo si el SGC está caído) + historia para «¿vino alguna vez?». Caché de 2 min.
 */
export function liveBalanzaRegistry(nowMs = Date.now(), root = ROOT) {
  if (_live && nowMs - _live.at < 120_000) return _live.registry
  const visits = []
  for (let k = -3; k <= 0; k++) visits.push(...dayVisits(root, dayOf(nowMs + k * DAY_MS)))
  const registry = buildBalanzaRegistry(visits, knownPlates(root, nowMs))
  _live = { at: nowMs, registry }
  return registry
}

/** Registro para un replay de días cerrados (movimientos del Excel alrededor del día). */
export function replayBalanzaRegistry(day, root = ROOT) {
  const visits = []
  const base = Date.parse(`${day}T12:00:00-03:00`)
  for (let k = -2; k <= 2; k++) visits.push(...dayVisits(root, dayOf(base + k * DAY_MS)))
  return buildBalanzaRegistry(visits, knownPlates(root, base))
}
