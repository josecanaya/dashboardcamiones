/**
 * De dónde salen las cartas de porte del padrón.
 *
 * - Hoy: el export de saasDB.arca_consignment_notes en data/arca/arca_consignment_notes.json (Mongo
 *   extended JSON). Se relee cuando cambia el archivo: dejar un export nuevo alcanza.
 * - Con AGRO_SUPPORT_KEY (llave de soporte de agro): la API de agro, que mantiene la copia de ARCA
 *   al día (destino cada 10 min, emitidas cada 1 min). Pendiente de conectar: la llave de cámara da
 *   403 al listar (27/10/2026).
 *
 * Las dos devuelven notas normalizadas con normalizeNote: el padrón no sabe de dónde vinieron.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** codGrano ARCA → producto, deducido del cruce con PRODUCTO del SGC (26/10/2026). */
const GRAIN_NAME = { 2: 'Girasol', 19: 'Maíz', 23: 'Soja', 31: 'Algodón', 32: 'Cártamo' }
/** Turno STOP: VIC<nro><DDMMAA>. */
const TURN_RE = /^[A-Z]+\d+(\d{2})(\d{2})(\d{2})$/i

export const normPlate = p => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const dateOf = v => (v && typeof v === 'object' ? v.$date : v) ?? null
const numOf = v => (v && typeof v === 'object' ? v.$numberLong : v) ?? null
const turnDayOf = code => {
  const m = TURN_RE.exec(String(code ?? '').trim())
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
    stateCode: n.arca_state_code ?? n.arcaStateCode ?? null,
    stateSince: dateOf(n.state_start_time) ?? n.stateHistory?.at?.(-1)?.time ?? null,
    issued: dateOf(n.issue_time ?? n.issueTime),
    departure: dateOf(n.departure_time ?? n.departureTime),
    expire: dateOf(n.expire_time ?? n.expireTime),
    plant: String(numOf(n.destination?.plant) ?? ''),
    destCuit: String(n.destination?.cuit ?? ''),
    locality: Number(n.destination?.locality_code ?? n.destination?.localityCode) || null,
    originCuit: String(n.origin?.cuit ?? ''),
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

export function createCartasSource({ projectRoot, env = process.env }) {
  // La llave de soporte todavía no llegó: cuando esté, acá va la consulta incremental a la API de agro
  // (listar cartas modificadas desde el último cursor) y este módulo deja de leer el export.
  if (env.AGRO_SUPPORT_KEY) console.warn('[padron] AGRO_SUPPORT_KEY presente pero la fuente de agro no está conectada: se sigue leyendo el export')
  return createJsonSource(projectRoot)
}
