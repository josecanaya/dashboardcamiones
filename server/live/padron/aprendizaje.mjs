/**
 * Lo que el reconocedor ya aprendió de operaciones, guardado al lado de Vehículos Permitidos y del
 * padrón de cartas (data/padron). Nunca en Supabase.
 *
 * - corregidos.json: lecturas malas confirmadas por operaciones (lectura → patente real), por cámara, y
 *   las patentes que operaciones confirmó que la cámara leyó bien. Las del algoritmo no cuentan: nadie
 *   las verificó.
 * - no-camiones.json: vehículos que no son camiones (tractor o maquinaria, autos y camionetas, servicio,
 *   colectivos), de las quitas manuales con motivo, los descartes del operador y los descartes
 *   automáticos por tipo de vehículo en los accesos compartidos de San Lorenzo, y las máquinas que la IA
 *   ve en la foto (pala cargadora, minicargadora: data/vision/veredictos.jsonl).
 *
 * En corregidos, cada par cuenta además cuántas veces operaciones confirmó lo mismo que había dicho la IA
 * (`confirmaIa`) y cuántas la corrigió (`corrigeIa`): es la medición de la IA contra operaciones.
 *
 * Fuentes: data/plate-identification-log.jsonl (cada decisión, con la lectura), el archivo de casos
 * (data/plate-identification-archive.json) y las quitas de data/plant-state-manual-overrides.json.
 * Se rearma cada hora; a mano: node server/live/padron/aprendizaje.mjs
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normPlate } from './cartasSource.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT_CORREGIDOS = (root) => path.join(root, 'data', 'padron', 'corregidos.json')
const OUT_NO_CAMIONES = (root) => path.join(root, 'data', 'padron', 'no-camiones.json')
const FAKE = /^(X+|P+|T+)$/

function readJson(f) {
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null }
}
function writeAtomic(out, doc) {
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(`${out}.tmp`, JSON.stringify(doc))
  renameSync(`${out}.tmp`, out)
}
function readLog(root) {
  try {
    return readFileSync(path.join(root, 'data', 'plate-identification-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

/** Tipo de vehículo no camión a partir del motivo o de la categoría del DSS. */
export function kindOf(text) {
  const s = String(text ?? '')
  if (/tractor|maquinaria/i.test(s)) return 'tractor_maquinaria'
  if (/servicio/i.test(s)) return 'servicio'
  if (/\b(medium ?bus|bus|colectivo|coach)\b/i.test(s)) return 'colectivo'
  if (/auto|camioneta|particular|pickup|suv|sedan|mpv|van|motorcycle|saloon|passenger/i.test(s)) return 'liviano'
  return null
}

/** Veredictos de la IA por imagen (server/live/vision/visionJudge.mjs), por sitio y fragmento. */
function visionVerdicts(root) {
  const out = new Map()
  try {
    for (const line of readFileSync(path.join(root, 'data', 'vision', 'veredictos.jsonl'), 'utf8').split('\n')) {
      if (!line) continue
      try {
        const v = JSON.parse(line)
        out.set(`${v.site}|${v.fragmentKey}`, v)
      } catch {}
    }
  } catch {}
  return out
}

/**
 * Última decisión de cada caso (una «limpiar» o un descarte posterior anulan la confirmación).
 * El log trae la lectura desde el 07/10; las anteriores se completan con el archivo de casos.
 */
function lastDecisions(root) {
  const last = new Map()
  for (const d of readLog(root)) last.set(`${d.site}|${d.fragmentKey}`, d)
  const archive = readJson(path.join(root, 'data', 'plate-identification-archive.json')) ?? {}
  for (const [site, items] of Object.entries(archive)) {
    for (const it of Object.values(items ?? {})) {
      const d = last.get(`${site}|${it.fragmentKey}`)
      if (d && !d.readPlate) Object.assign(d, { readPlate: it.readPlate, deviceCode: it.deviceCode, node: it.node, captureAt: it.at })
    }
  }
  return [...last.values()]
}

export function buildCorregidos(root = ROOT) {
  const pairs = new Map()
  const real = new Map()
  const ia = visionVerdicts(root)
  const iaStats = { confirmadas: 0, corregidas: 0 }
  for (const d of lastDecisions(root)) {
    if (d.action !== 'confirm' || d.source === 'automatic_algorithm') continue
    const read = normPlate(d.readPlate)
    const plate = normPlate(d.plate)
    if (!read || !plate || FAKE.test(plate)) continue
    // ¿Operaciones dijo lo mismo que la IA (el candidato elegido o la patente que leyó en la foto)?
    const v = ia.get(`${d.site}|${d.fragmentKey}`)
    const iaPlates = v ? [v.plate, v.seenPlate].filter(Boolean).map(normPlate) : []
    const iaAgrees = iaPlates.includes(plate)
    if (v && !v.skipped) iaAgrees ? iaStats.confirmadas++ : iaStats.corregidas++
    if (read === plate) {
      const r = real.get(plate) ?? { plate, count: 0, lastAt: null }
      r.count++
      r.lastAt = [r.lastAt, d.decidedAt].filter(Boolean).sort().at(-1)
      real.set(plate, r)
      continue
    }
    const k = `${read}>${plate}`
    const p = pairs.get(k) ?? { read, real: plate, count: 0, devices: {}, lastAt: null, confirmaIa: 0, corrigeIa: 0 }
    p.count++
    if (v && !v.skipped) iaAgrees ? p.confirmaIa++ : p.corrigeIa++
    if (d.deviceCode) p.devices[d.deviceCode] = (p.devices[d.deviceCode] ?? 0) + 1
    p.lastAt = [p.lastAt, d.decidedAt].filter(Boolean).sort().at(-1)
    pairs.set(k, p)
  }
  // Una patente confirmada como real no es la lectura mala de otra (OJD501 / OJO501: los dos existen).
  const entries = [...pairs.values()].map((p) => ({ ...p, readIsReal: real.has(p.read) }))
  const doc = { builtAt: new Date().toISOString(), pairs: entries, real: [...real.values()], ia: iaStats }
  writeAtomic(OUT_CORREGIDOS(root), doc)
  return doc
}

export function buildNoCamiones(root = ROOT) {
  const byPlate = new Map()
  const add = (plate, kind, source, at, category = null) => {
    const p = normPlate(plate)
    if (!p || p.length < 5 || FAKE.test(p) || !kind) return
    const e = byPlate.get(p) ?? { plate: p, kinds: {}, sources: {}, categories: {}, count: 0, lastAt: null }
    e.kinds[kind] = (e.kinds[kind] ?? 0) + 1
    e.sources[source] = (e.sources[source] ?? 0) + 1
    if (category) e.categories[category] = (e.categories[category] ?? 0) + 1
    e.count++
    e.lastAt = [e.lastAt, at].filter(Boolean).sort().at(-1)
    byPlate.set(p, e)
  }
  // Quitas manuales del plano con motivo («Tractor o maquinaria», «Auto particular / camioneta», «servicio»).
  const overrides = readJson(path.join(root, 'data', 'plant-state-manual-overrides.json')) ?? {}
  for (const site of Object.values(overrides)) {
    for (const [plate, o] of Object.entries(site ?? {})) if (o?.action === 'remove') add(plate, kindOf(o.reason), 'manual', o.updatedAt)
  }
  for (const d of lastDecisions(root)) {
    if (d.action !== 'reject') continue
    // «No es un vehículo (falsa detección)» u «otro país»: la patente no es de un vehículo de acá, no entra.
    if (d.source === 'automatic_relevance') {
      const cat = d.relevance?.capture?.vehicleCategory
      add(d.relevance?.capture?.plate ?? d.readPlate, kindOf(cat), 'automatico', d.decidedAt, cat)
    } else {
      add(d.readPlate, kindOf(d.reason), 'operador', d.decidedAt)
    }
  }
  // Máquinas que la IA vio en la foto: la lectura (y la patente que leyó, si leyó una) es de una máquina.
  for (const v of visionVerdicts(root).values()) {
    // Los veredictos anteriores al campo «tipo» lo dicen en el motivo (KOV00, MOB09 el 28/10).
    const machine = v.vehicleType ? v.vehicleType === 'maquinaria' : !v.plate && /pala cargadora|minicargadora|autoelevador|tractor agr[ií]cola|retroexcavadora/i.test(v.reason ?? '')
    if (!machine) continue
    add(v.readPlate, 'tractor_maquinaria', 'ia', v.at)
    if (v.seenPlate) add(v.seenPlate, 'tractor_maquinaria', 'ia', v.at)
  }
  // Un vehículo con movimientos de balanza (Vehículos Permitidos) es un camión aunque una vez se haya descartado.
  const permitidos = new Set((readJson(path.join(root, 'data', 'padron', 'vehiculos-permitidos.json'))?.entries ?? []).filter((e) => e.category !== 'vehiculo_particular').map((e) => e.plate))
  const entries = [...byPlate.values()]
    .filter((e) => !permitidos.has(e.plate))
    .map((e) => ({ ...e, kind: Object.entries(e.kinds).sort((a, b) => b[1] - a[1])[0][0] }))
  const counts = entries.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {})
  const doc = { builtAt: new Date().toISOString(), counts, entries }
  writeAtomic(OUT_NO_CAMIONES(root), doc)
  return doc
}

/**
 * Índices en memoria para el reconocedor: `corregidos` (lectura mala → real, patentes confirmadas) y
 * `noCamiones` (lookup por patente).
 */
export function createAprendizaje({ projectRoot = ROOT, rebuildMs = 3600_000, log = console } = {}) {
  let pairsByRead = new Map()
  let real = new Set()
  let noCam = new Map()
  let meta = null
  const load = () => {
    const c = readJson(OUT_CORREGIDOS(projectRoot))
    const n = readJson(OUT_NO_CAMIONES(projectRoot))
    if (c) {
      pairsByRead = new Map()
      for (const p of c.pairs) if (!p.readIsReal) pairsByRead.set(p.read, [...(pairsByRead.get(p.read) ?? []), p])
      real = new Set(c.real.map((r) => r.plate))
    }
    if (n) noCam = new Map(n.entries.map((e) => [e.plate, e]))
    meta = { builtAt: c?.builtAt ?? n?.builtAt ?? null, ia: c?.ia ?? null, pares: c?.pairs.length ?? 0, confirmadas: c?.real.length ?? 0, noCamiones: n?.entries.length ?? 0, porTipo: n?.counts ?? {} }
  }
  const rebuild = async () => {
    try {
      buildCorregidos(projectRoot)
      buildNoCamiones(projectRoot)
      load()
      log.info?.(`[aprendizaje] ${meta.pares} pares corregidos, ${meta.confirmadas} confirmadas, ${meta.noCamiones} no camiones`)
    } catch (e) {
      log.warn?.(`[aprendizaje] no se pudo rearmar: ${e instanceof Error ? e.message : e}`)
    }
  }
  return {
    start() {
      load()
      const stale = !meta?.builtAt || Date.now() - Date.parse(meta.builtAt) > rebuildMs || statSync(OUT_CORREGIDOS(projectRoot), { throwIfNoEntry: false }) == null
      if (stale) void rebuild()
      setInterval(() => void rebuild(), rebuildMs).unref?.()
    },
    rebuild,
    corregidos: {
      /** Patentes reales a las que operaciones ya llevó esta lectura (de más a menos veces). */
      realOf: (read) => [...(pairsByRead.get(normPlate(read)) ?? [])].sort((a, b) => b.count - a.count),
      /** Operaciones confirmó que la cámara leyó bien esta patente. */
      isReal: (plate) => real.has(normPlate(plate)),
    },
    noCamiones: {
      /** @returns {{ plate: string, kind: string, sources: Record<string, number> } | null} */
      lookup: (plate) => noCam.get(normPlate(plate)) ?? null,
    },
    status: () => meta,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = buildCorregidos()
  const n = buildNoCamiones()
  console.log(`${c.pairs.length} pares lectura → real (${c.pairs.filter((p) => p.count > 1).length} repetidos, ${c.pairs.filter((p) => p.readIsReal).length} donde la leída también es real), ${c.real.length} patentes confirmadas`)
  console.log(`${n.entries.length} no camiones`, n.counts)
}
