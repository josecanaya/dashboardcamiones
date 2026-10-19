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

let _known = null
/** Patentes de los movimientos de los últimos HISTORY_DAYS días (se recarga cada hora o al cambiar de día). */
function knownPlates(root, nowMs) {
  if (_known && Math.abs(nowMs - _known.at) < 3600_000 && dayOf(nowMs) === dayOf(_known.at)) return _known.set
  const set = new Set()
  const dir = path.join(root, 'data', 'movimientos')
  const from = dayOf(nowMs - HISTORY_DAYS * DAY_MS)
  // Hasta el día anterior: el día en curso lo cubre el registro (y en un replay no se mira el futuro).
  const to = dayOf(nowMs - DAY_MS)
  const days = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to) : []
  for (const d of days) for (const r of readJson(path.join(dir, d, 'movimientos.json'), [])) {
    const p = plateOf(r.plate_normalized)
    if (p && !FAKE.test(p)) set.add(p)
  }
  _known = { at: nowMs, set }
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
  for (let k = -3; k <= 0; k++) {
    const d = dayOf(nowMs + k * DAY_MS)
    visits.push(...visitsFromSgc(Object.values(readJson(path.join(root, 'data', 'sgc', d, 'ingresos.json'), {}))))
    visits.push(...visitsFromMovimientos(readJson(path.join(root, 'data', 'movimientos', d, 'movimientos.json'), [])))
  }
  const registry = buildBalanzaRegistry(visits, knownPlates(root, nowMs))
  _live = { at: nowMs, registry }
  return registry
}

/** Registro para un replay de días cerrados (movimientos del Excel alrededor del día). */
export function replayBalanzaRegistry(day, root = ROOT) {
  const visits = []
  const base = Date.parse(`${day}T12:00:00-03:00`)
  for (let k = -2; k <= 2; k++) {
    const d = dayOf(base + k * DAY_MS)
    visits.push(...visitsFromSgc(Object.values(readJson(path.join(root, 'data', 'sgc', d, 'ingresos.json'), {}))))
    visits.push(...visitsFromMovimientos(readJson(path.join(root, 'data', 'movimientos', d, 'movimientos.json'), [])))
  }
  return buildBalanzaRegistry(visits, knownPlates(root, base))
}
