/**
 * Padrón del día: quién puede venir al Nodo Sur, en memoria, para que cada lectura de cámara se
 * resuelva sin red (docs/propuesta-en-vivo/ARQUITECTURA_PADRON_EN_VIVO.md, etapa 1).
 *
 * - Se arma con las cartas de la fuente (cartasSource) y se resincroniza por detrás.
 * - Índice por patente de chasis y de acoplado (las cámaras traseras leen el acoplado).
 * - Cada sincronización que cambia algo sube la versión y deja una foto en data/padron/<día>.json:
 *   un reinicio arranca de la foto, sin esperar a la fuente.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normPlate } from './cartasSource.mjs'

export const VICENTIN_CUIT = '30500959629'
/** Localidad ARCA de San Lorenzo: Ricardone descarga con carta a la 25567, así que el padrón es del Nodo Sur. */
export const NODO_SUR_LOCALITY = 18794
/**
 * Plantas ARCA del Nodo Sur (guía de agro, 26/10): las cartas que emite Vicentin suelen traer la localidad
 * de origen en 0, así que la salida se reconoce por la planta de origen.
 */
export const NODO_SUR_PLANTS = new Set(['21831', '21832', '21836', '23326', '25567', '813124'])
const DAY_MS = 86400000
/** Ventana que se guarda: alcanza para el cumplimiento de la semana y los turnos de los próximos días. */
const KEEP_PAST_DAYS = 10
const KEEP_FUTURE_DAYS = 5

export const arDay = (ms = Date.now()) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10)
export const shiftDay = (day, n) => arDay(Date.parse(`${day}T15:00:00Z`) + n * DAY_MS)

/**
 * Entra a descargar al Nodo Sur, sale cargado de una planta de Vicentin del Nodo Sur, transile interno
 * (de Vicentin a Vicentin dentro del Nodo Sur: 21832 → 25567, 3 km, con turno STOP: ocupa cupo), o no nos toca.
 */
function directionOf(n) {
  const toNodo = n.destCuit === VICENTIN_CUIT && (n.locality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.plant))
  const fromNodo = n.originCuit === VICENTIN_CUIT && (n.originLocality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.originPlant))
  if (toNodo && fromNodo) return 'interno'
  if (toNodo) return 'entra'
  if (fromNodo) return 'sale'
  return null
}

function inWindow(n, today) {
  const from = shiftDay(today, -KEEP_PAST_DAYS)
  const to = shiftDay(today, KEEP_FUTURE_DAYS)
  if (n.turnDay) return n.turnDay >= from && n.turnDay <= to
  const dep = n.departure ? arDay(Date.parse(n.departure)) : null
  return dep != null && dep >= from && dep <= to
}

/** Export en disco: mirar el archivo cada minuto es gratis. API de agro: cada 15 min, como se acordó. */
const defaultSyncMs = source => Number(process.env.PADRON_SYNC_MS) || (source.kind === 'export' ? 60_000 : 15 * 60_000)

export function createPadron({ projectRoot, source, syncMs = defaultSyncMs(source), log = console }) {
  const dir = path.join(projectRoot, 'data', 'padron')
  const state = { version: 0, day: arDay(), syncedAt: null, sourceUpdatedAt: null, lastError: null, byCtg: new Map(), byPlate: new Map() }
  let timer = null

  function rebuild(notes) {
    const byCtg = new Map()
    const byPlate = new Map()
    const today = arDay()
    for (const n of notes) {
      const direction = directionOf(n)
      if (!direction || !inWindow(n, today)) continue
      const entry = { ...n, direction }
      byCtg.set(entry.ctg, entry)
      for (const p of entry.plates) byPlate.set(p, [...(byPlate.get(p) ?? []), entry])
    }
    Object.assign(state, { byCtg, byPlate, day: today })
  }

  const snapshotFile = day => path.join(dir, `${day}.json`)
  function writeSnapshot() {
    mkdirSync(dir, { recursive: true })
    const file = snapshotFile(state.day)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: state.version, day: state.day, syncedAt: state.syncedAt, source: source.describe(), sourceUpdatedAt: state.sourceUpdatedAt, notes: [...state.byCtg.values()] }))
    renameSync(tmp, file)
  }
  function loadSnapshot() {
    const file = snapshotFile(arDay())
    if (!existsSync(file)) return false
    const snap = JSON.parse(readFileSync(file, 'utf8'))
    rebuild(snap.notes)
    Object.assign(state, { version: snap.version, syncedAt: snap.syncedAt, sourceUpdatedAt: snap.sourceUpdatedAt })
    return true
  }

  /** Trae los cambios de la fuente; si hubo, rearma el índice, sube la versión y guarda la foto. */
  async function sync() {
    try {
      let changes = await source.fetchChanges()
      // Al arrancar desde la foto, la fuente vuelve a entregar lo mismo: no es una versión nueva.
      if (changes?.full && changes.sourceUpdatedAt && changes.sourceUpdatedAt === state.sourceUpdatedAt && state.byCtg.size) changes = null
      const dayChanged = state.day !== arDay()
      if (!changes && !dayChanged) { state.lastError = null; return false }
      if (changes) {
        const notes = changes.full ? changes.notes : [...new Map([...state.byCtg.values(), ...changes.notes].map(n => [n.ctg, n])).values()]
        rebuild(notes)
        state.sourceUpdatedAt = changes.sourceUpdatedAt ?? state.sourceUpdatedAt
      } else {
        rebuild([...state.byCtg.values()])
      }
      state.version++
      state.syncedAt = new Date().toISOString()
      state.lastError = null
      writeSnapshot()
      log.info?.(`[padron] v${state.version}: ${state.byCtg.size} cartas, ${state.byPlate.size} patentes (${source.describe()})`)
      return true
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e)
      log.warn?.(`[padron] sincronización falló: ${state.lastError}`)
      return false
    }
  }

  function start() {
    try { if (loadSnapshot()) log.info?.(`[padron] arranca de la foto v${state.version} (${state.byCtg.size} cartas)`) } catch (e) { log.warn?.(`[padron] foto ilegible: ${e}`) }
    void sync()
    timer = setInterval(() => void sync(), syncMs)
    timer.unref?.()
  }

  return {
    start,
    sync,
    stop: () => clearInterval(timer),
    /** Cartas del padrón donde aparece la patente (chasis o acoplado). */
    lookup: plate => state.byPlate.get(normPlate(plate)) ?? [],
    byCtg: ctg => state.byCtg.get(String(ctg)) ?? null,
    notes: () => state.byCtg.values(),
    status() {
      let newestDeparture = null
      const counts = { entra: 0, interno: 0, sale: 0 }
      for (const n of state.byCtg.values()) {
        counts[n.direction]++
        if (n.departure && (!newestDeparture || n.departure > newestDeparture)) newestDeparture = n.departure
      }
      return {
        available: state.byCtg.size > 0,
        version: state.version,
        day: state.day,
        syncedAt: state.syncedAt,
        source: source.describe(),
        sourceKind: source.kind,
        sourceUpdatedAt: state.sourceUpdatedAt,
        newestDeparture,
        cartas: state.byCtg.size,
        patentes: state.byPlate.size,
        counts,
        lastError: state.lastError,
      }
    },
  }
}
