/**
 * Vehículos Permitidos: los que vienen al Nodo Sur sin carta de porte (agua, residuos, chip y leña,
 * combustibles, insumos, alcohol y burlanda, mercaderías varias) más el registro de vehículos cargado a
 * mano (particulares, servicios). Es la primera consulta de la capa 2 del reconocedor; después va la carta.
 *
 * - Se arma con el historial de la balanza: data/movimientos (Excel y, desde 15/10, SGC) + data/sgc del
 *   día (todavía no volcado a movimientos). Granos y derivados con carta (0101/0201/0301/0501/0909 y
 *   02xx–03xx) no cuentan: esos los resuelve el padrón de cartas.
 * - Registro manual: Supabase (truck_plate_registry) si responde; si no, la copia data/truck-registry.
 * - Se guarda al lado del padrón: data/padron/vehiculos-permitidos.json. Nunca se escribe en Supabase.
 * - `node server/live/padron/vehiculosPermitidos.mjs` lo rearma a mano.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normPlate } from './cartasSource.mjs'

const FAKE = /^(X+|P+|T+)$/
/** Granos (carta de porte) y derivados granarios (aceites, pellets, harinas, cáscara: carta de derivados). */
// 00xx: semillas con carta (0081 camelina).
const WITH_CARTA = (cod) => ['0101', '0201', '0301', '0501', '0909'].includes(cod) || /^0[023]\d\d$/.test(cod)
/** 9999 que en realidad son camiones de granos (se equivocaron de planta, trasilado, muestras de calado, vuelta). */
const GRAIN_VARIOS = /EQUIVOCAN DE PTA|TRASILADO|TRANSILADO|MUESTRAS CALADO|TOLVA CALADO|RECHAZADO DE TEM/i

/**
 * Camión de granos: producto con carta de porte (granos, semillas, derivados) o un 9999 que en realidad es
 * de granos. Todo lo demás (agua, residuos, leña, burlanda, alcohol, glicerina, heno, insumos) es un
 * vehículo de Vehículos Permitidos: se registra pero no se muestra en el plano de En vivo.
 */
export function isGrainProduct(cod, obs = '') {
  const c = String(cod ?? '').padStart(4, '0')
  return WITH_CARTA(c) || (c === '9999' && GRAIN_VARIOS.test(String(obs ?? '')))
}

export function categoryOf(cod) {
  const c = String(cod ?? '').padStart(4, '0')
  if (['0780', '0802'].includes(c)) return 'agua'
  if (['0870', '0871', '0872', '0873', '0877', '0878', '0777', '0700', '0849', '0946', '0947', '0920', '0906', '0996', '0744', '0935'].includes(c)) return 'residuos'
  if (/^08[12]\d$/.test(c)) return 'biomasa'
  if (['0703', '0704', '0880'].includes(c)) return 'combustible'
  if (['0714', '0716', '0720', '0735', '0736', '0737', '0740', '0743'].includes(c)) return 'alcohol_burlanda'
  if (['0883', '0887', '0888'].includes(c)) return 'glicerina'
  if (['0772', '0774', '0771'].includes(c)) return 'forraje'
  if (c === '9999') return 'varios'
  return 'insumos'
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = (root) => path.join(root, 'data', 'padron', 'vehiculos-permitidos.json')

function readJson(f) {
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null }
}

/** Filas de balanza unificadas: { id, plate, trailer, cod, product, at, planta, obs }. */
function balanzaRows(root) {
  const rows = new Map()
  const movDir = path.join(root, 'data', 'movimientos')
  for (const d of existsSync(movDir) ? readdirSync(movDir) : []) {
    for (const r of readJson(path.join(movDir, d, 'movimientos.json')) ?? []) {
      const id = r.ingreso_id ? `sgc:${r.ingreso_id}` : r.external_operation_id
      rows.set(id, {
        plate: normPlate(r.plate_normalized ?? r.patente_original), trailer: normPlate(r.patente_acoplado),
        cod: String(r.cod_prod ?? ''), product: r.producto_original ?? r.product_normalized ?? '',
        at: r.external_ingreso_at || r.external_salida_at || `${d}T12:00:00`, planta: r.planta_normalized ?? '',
        obs: `${r.observaciones ?? ''} ${r.cliente_contrato ?? ''}`,
      })
    }
  }
  const sgcDir = path.join(root, 'data', 'sgc')
  for (const d of existsSync(sgcDir) ? readdirSync(sgcDir).filter((x) => /^\d{4}-/.test(x)) : []) {
    const doc = readJson(path.join(sgcDir, d, 'ingresos.json')) ?? {}
    for (const r of Object.values(doc)) {
      const id = `sgc:${r.NROINGRESO}`
      if (rows.has(id)) continue
      rows.set(id, {
        plate: normPlate(r.PATENTECAMION), trailer: normPlate(r.PATENTEACOPLADO), cod: String(r.PRODUCTOCODIGO ?? ''),
        product: r.PRODUCTO ?? '', at: r.FECHAINGRESO ?? `${d}T12:00:00`, planta: r.PLANTA ?? '', obs: '',
      })
    }
  }
  return [...rows.values()]
}

/** Registro manual: Supabase si responde (solo lectura), si no la copia local. */
async function registryEntries(root) {
  const local = () => ({ source: 'data/truck-registry/registry.json', entries: readJson(path.join(root, 'data', 'truck-registry', 'registry.json'))?.entries ?? [] })
  try {
    const { createServerSupabaseClient } = await import('../../supabase-client.mjs')
    const sb = createServerSupabaseClient()
    if (!sb) return local()
    const { data, error } = await Promise.race([
      sb.from('truck_plate_registry').select('*'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ])
    if (error) throw new Error(error.message)
    return { source: 'supabase truck_plate_registry', entries: (data ?? []).map((r) => ({ plate: r.plate_normalized ?? r.plate, category: r.category, active: r.active, label: r.label, notes: r.notes })) }
  } catch {
    return local()
  }
}

export async function buildVehiculosPermitidos(root = ROOT) {
  const byPlate = new Map()
  const add = (plate, data) => {
    if (!plate || plate.length < 5 || FAKE.test(plate)) return null
    const e = byPlate.get(plate) ?? { plate, role: 'chasis', categories: {}, products: {}, movements: 0, withCarta: 0, firstSeen: null, lastSeen: null, sources: [] }
    byPlate.set(plate, e)
    return Object.assign(e, data)
  }
  const rows = balanzaRows(root)
  const grainPlates = new Set()
  for (const r of rows) {
    const varios = r.cod === '9999'
    if (WITH_CARTA(r.cod) || (varios && GRAIN_VARIOS.test(r.obs))) { grainPlates.add(r.plate); continue }
    const cat = categoryOf(r.cod)
    for (const [plate, role] of [[r.plate, 'chasis'], [r.trailer, 'acoplado']]) {
      const e = add(plate, {})
      if (!e) continue
      if (role === 'acoplado') { e.asTrailer = (e.asTrailer ?? 0) + 1; e.chasis = r.plate } else e.asTruck = (e.asTruck ?? 0) + 1
      e.movements++
      e.categories[cat] = (e.categories[cat] ?? 0) + 1
      const pk = `${r.cod} ${r.product}`.trim()
      e.products[pk] = (e.products[pk] ?? 0) + 1
      const day = String(r.at).slice(0, 10)
      if (!e.firstSeen || day < e.firstSeen) e.firstSeen = day
      if (!e.lastSeen || day > e.lastSeen) e.lastSeen = day
      if (!e.sources.includes('balanza')) e.sources.push('balanza')
    }
  }
  for (const e of byPlate.values()) {
    e.category = Object.entries(e.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    // Acoplado solo si nunca vino como chasis: el reconocedor suma su lectura al camión.
    e.role = e.asTrailer && !e.asTruck ? 'acoplado' : 'chasis'
    if (e.role === 'chasis') delete e.chasis
    e.alsoGrain = grainPlates.has(e.plate)
  }
  const reg = await registryEntries(root)
  for (const r of reg.entries) {
    if (r.active === false) continue
    const e = add(normPlate(r.plate), {})
    if (!e) continue
    e.category ??= r.category
    e.registry = { category: r.category, label: r.label ?? null, notes: r.notes ?? null }
    if (!e.sources.includes('registro')) e.sources.push('registro')
  }
  const entries = [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate))
  const counts = entries.reduce((m, e) => ({ ...m, [e.category]: (m[e.category] ?? 0) + 1 }), {})
  const doc = { builtAt: new Date().toISOString(), balanzaRows: rows.length, registrySource: reg.source, counts, entries }
  const out = OUT(root)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(`${out}.tmp`, JSON.stringify(doc))
  renameSync(`${out}.tmp`, out)
  return doc
}

/**
 * Lista en memoria para el reconocedor. Arranca del archivo y se rearma cada hora (los movimientos
 * y el SGC se guardan por hora): un camión de agua nuevo entra a la lista sin tocar nada.
 */
export function createVehiculosPermitidos({ projectRoot = ROOT, rebuildMs = 3600_000, log = console } = {}) {
  let byPlate = new Map()
  let meta = null
  const load = () => {
    const doc = readJson(OUT(projectRoot))
    if (!doc) return
    byPlate = new Map(doc.entries.map((e) => [e.plate, e]))
    meta = { builtAt: doc.builtAt, counts: doc.counts, registrySource: doc.registrySource, vehiculos: doc.entries.length }
  }
  const rebuild = async () => {
    try {
      await buildVehiculosPermitidos(projectRoot)
      load()
      log.info?.(`[permitidos] ${meta?.vehiculos ?? 0} vehículos (registro: ${meta?.registrySource})`)
    } catch (e) {
      log.warn?.(`[permitidos] no se pudo rearmar: ${e instanceof Error ? e.message : e}`)
    }
  }
  return {
    start() {
      load()
      const stale = !meta || Date.now() - Date.parse(meta.builtAt) > rebuildMs || statSync(OUT(projectRoot), { throwIfNoEntry: false }) == null
      if (stale) void rebuild()
      setInterval(() => void rebuild(), rebuildMs).unref?.()
    },
    rebuild,
    /** @returns {{ plate: string, role: string, chasis?: string, category: string, alsoGrain: boolean } | null} */
    lookup: (plate) => byPlate.get(normPlate(plate)) ?? null,
    status: () => meta,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = await buildVehiculosPermitidos()
  console.log(`${doc.entries.length} vehículos permitidos (${doc.balanzaRows} filas de balanza, registro: ${doc.registrySource})`, doc.counts)
}
