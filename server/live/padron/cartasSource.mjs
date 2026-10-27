/**
 * De dónde salen las cartas de porte del padrón.
 *
 * - Hoy: el export de saasDB.arca_consignment_notes en data/arca/arca_consignment_notes.json (Mongo
 *   extended JSON). Se relee cuando cambia el archivo: dejar un export nuevo alcanza.
 * - Con AGRO_SUPPORT_KEY (llave de soporte de agro, credencial 10003): la API de agro, que mantiene la
 *   copia de ARCA al día (destino cada 10 min, emitidas cada 1 min). La llave de cámara (10002) da 403.
 *
 * Las dos devuelven notas normalizadas con normalizeNote: el padrón no sabe de dónde vinieron.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** codGrano ARCA → producto, deducido del cruce con PRODUCTO del SGC (26/10/2026). */
const GRAIN_NAME = { 2: 'Girasol', 19: 'Maíz', 23: 'Soja', 31: 'Algodón', 32: 'Cártamo' }
/** Turno STOP: VIC<nro><DDMMAA>. */
const TURN_RE = /^[A-Z]+\d+(\d{2})(\d{2})(\d{2})$/i
/** Turno de otras terminales (salidas de girasol a la 408411): MOL<nro>/<DDMMAAAA>. */
const TURN_SLASH_RE = /\/(\d{2})(\d{2})\d{2}(\d{2})$/

export const normPlate = p => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const dateOf = v => (v && typeof v === 'object' ? v.$date : v) ?? null
const numOf = v => (v && typeof v === 'object' ? v.$numberLong : v) ?? null
const turnDayOf = code => {
  const s = String(code ?? '').trim()
  const m = TURN_RE.exec(s) ?? TURN_SLASH_RE.exec(s)
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Una carta, venga del export de Mongo (snake_case, $date/$numberLong) o de la API de agro
 * (camelCase, guía 26/10). Sin CUIT de choferes ni transportistas: el padrón no los necesita.
 */
export function normalizeNote(n) {
  const t = n.transport ?? {}
  const load = n.load ?? {}
  const grainCode = load.grain_code ?? load.grainCode ?? null
  const turnCode = t.turn_code ?? t.turnCode ?? null
  return {
    ctg: String(n.ctg),
    /** 74 = granos (CPE), 284 = derivados granarios (CPEDG). Las copias viejas no lo traían: eran todas de granos. */
    typeCode: Number(n.type_code ?? n.typeCode) || 74,
    derivedProductCode: Number(load.derived_product_code ?? load.derivedProductCode) || null,
    stateCode: n.arca_state_code ?? n.arcaStateCode ?? null,
    stateSince: dateOf(n.state_start_time) ?? n.stateStartTime ?? null,
    issued: dateOf(n.issue_time ?? n.issueTime),
    departure: dateOf(n.departure_time ?? n.departureTime),
    expire: dateOf(n.expire_time ?? n.expireTime),
    plant: String(numOf(n.destination?.plant) ?? ''),
    destCuit: String(n.destination?.cuit ?? ''),
    locality: Number(n.destination?.locality_code ?? n.destination?.localityCode) || null,
    originCuit: String(n.origin?.cuit ?? ''),
    originPlant: String(numOf(n.origin?.plant) ?? ''),
    originLocality: Number(n.origin?.locality_code ?? n.origin?.localityCode) || null,
    plates: (t.plates ?? []).map(normPlate),
    turnCode,
    turnDay: turnDayOf(turnCode),
    grain: GRAIN_NAME[grainCode] ?? (grainCode != null ? `Grano ${grainCode}` : null),
    distanceKm: Number(t.distance_km ?? t.distanceKm) || null,
    grossKg: Number(numOf(load.gross_weight_kg ?? load.grossWeightKg)) || null,
    tareKg: Number(numOf(load.tare_weight_kg ?? load.tareWeightKg)) || null,
  }
}

/** Export de Mongo en disco: cambia solo cuando alguien deja un archivo nuevo. */
function createJsonSource(projectRoot) {
  const file = path.join(projectRoot, 'data', 'arca', 'arca_consignment_notes.json')
  let lastMtime = 0
  return {
    kind: 'export',
    describe: () => `export ${path.relative(projectRoot, file)}`,
    /** null si no cambió desde la última vez; si cambió, todas las notas (reemplazo completo). */
    async fetchChanges() {
      if (!existsSync(file)) return null
      const { mtimeMs } = statSync(file)
      if (mtimeMs === lastMtime) return null
      lastMtime = mtimeMs
      return { full: true, notes: JSON.parse(readFileSync(file, 'utf8')).map(normalizeNote), sourceUpdatedAt: new Date(mtimeMs).toISOString() }
    },
  }
}

/** Ventana de la carga inicial: la del padrón (10 días atrás) con margen, por fecha de emisión. */
const COLD_PAST_DAYS = 12
const COLD_FUTURE_DAYS = 5
/** Cada consulta incremental se superpone 2 min con la anterior: una carta sincronizada en el borde no se pierde. */
const OVERLAP_MS = 2 * 60_000
const PAGE_SIZE = 100 // tope de la API (pide 500, devuelve 100)

/**
 * API de agro con la llave de soporte (credencial 10003): GET /v1/arca_consignment_notes, de los dos tipos
 * (74 granos, 284 derivados), entrando y saliendo. Arranque: todo lo emitido en la ventana del padrón.
 * Después: solo lo que la copia de agro sincronizó desde la última consulta (filter.syncTimeAfter).
 */
function createAgroSource(env) {
  const base = String(env.AGRO_API_BASE ?? 'https://agro.bimtrazer.com').replace(/\/$/, '')
  const headers = { SaasAgroArApiKey: env.AGRO_GW_KEY, 'X-Plant-Access-Key': env.AGRO_SUPPORT_KEY }
  let cursor = null

  async function listAll(params) {
    const notes = []
    for (let page = 1; ; page++) {
      const q = new URLSearchParams({ ...params, 'pageParams.pageSize': String(PAGE_SIZE), 'pageParams.pageNumber': String(page) })
      const r = await fetch(`${base}/v1/arca_consignment_notes?${q}`, { headers, signal: AbortSignal.timeout(60_000) })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(`agro ${r.status}: ${body.detail ?? body.title ?? 'error'}`)
      }
      const body = await r.json()
      notes.push(...(body.list ?? []).map(normalizeNote))
      if (page >= Number(body.pagination?.totalPages ?? 1)) return notes
    }
  }
  const ymd = (prefix, ms) => {
    const d = new Date(ms - 3 * 3600_000)
    return { [`${prefix}.year`]: String(d.getUTCFullYear()), [`${prefix}.month`]: String(d.getUTCMonth() + 1), [`${prefix}.day`]: String(d.getUTCDate()) }
  }

  return {
    kind: 'api',
    describe: () => 'API agro (llave de soporte)',
    async fetchChanges() {
      const startedAt = Date.now()
      if (!cursor) {
        const notes = await listAll({
          ...ymd('filter.issueDateRange.startDate', startedAt - COLD_PAST_DAYS * 86400_000),
          ...ymd('filter.issueDateRange.endDate', startedAt + COLD_FUTURE_DAYS * 86400_000),
        })
        cursor = startedAt - OVERLAP_MS
        return { full: true, notes, sourceUpdatedAt: new Date(startedAt).toISOString() }
      }
      const notes = await listAll({ 'filter.syncTimeAfter': new Date(cursor).toISOString() })
      cursor = startedAt - OVERLAP_MS
      return notes.length ? { full: false, notes, sourceUpdatedAt: new Date(startedAt).toISOString() } : null
    },
  }
}

export function createCartasSource({ projectRoot, env = process.env }) {
  // Con la llave de soporte, la API de agro (al día); sin ella, el export que se deja en data/arca.
  if (env.AGRO_SUPPORT_KEY && env.AGRO_GW_KEY) return createAgroSource(env)
  return createJsonSource(projectRoot)
}
