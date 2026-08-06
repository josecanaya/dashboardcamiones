/**
 * Llave única de journey — Fase 2a del modelo de niveles A→B→C→D→E.
 *
 * PROBLEMA QUE RESUELVE: hasta v13 los niveles no compartían identidad.
 *   final_circuits.journey_uid     →  "merged_329523c2-a2d__c7c3fe96-fa2"
 *   excel…matched_journey_uids     →  "d50b1d90-9f05-4458-a599-631f0127070f"
 *   journey_timeline.short_uid     →  "d50b1d90-9f0"
 * No había join directo entre C y D: había que partir strings y comparar
 * prefijos de 12 chars a mano en cada consumidor (el front de 2.0 lo hacía en
 * su cliente HTTP). Medido sobre 2026-07-13_2026-07-19, cruzar por uid crudo da
 * 2.030 coincidencias y cruzar por prefijo da 2.363: el mismo dato con dos
 * respuestas según quién lo calcule.
 *
 * REGLA: todo nivel expone `journey_key`. Un journey fusionado tiene UNA llave
 * y conserva sus partes en `journey_parts` para poder volver a los eventos
 * crudos. Nadie más parte strings.
 */

/** Largo del prefijo con el que el ETL fusiona journeys (`merged_<A>__<B>`). */
export const SHORT_UID_LEN = 12

const MERGED_PREFIX = 'merged_'
const MERGED_SEP = '__'
/**
 * Tercer formato, descubierto al auditar 2026-07-13_2026-07-19: un journey se
 * parte en vueltas del mismo camión (`<uuid>__cycle_1`, `__cycle_2`, …). Hasta
 * 7 en una semana. El sufijo NO es decorativo: truncar el uid a 12 chars
 * colapsaba las 7 vueltas en una sola llave y perdía 205 recorridos de 2.384.
 */
const CYCLE_RE = /^(.*?)__cycle_(\d+)$/

/** Prefijo estable de un uid crudo. Es la unidad de religado del ETL. */
export function shortUid(uid: string): string {
  return String(uid ?? '')
    .trim()
    .slice(0, SHORT_UID_LEN)
}

export type JourneyUidKind = 'merged' | 'cycle' | 'raw'

export type ParsedJourneyUid = {
  readonly kind: JourneyUidKind
  /** Partes cortas que lo religan con los eventos crudos. */
  readonly parts: readonly string[]
  /** Número de vuelta, sólo para `cycle`. */
  readonly cycle: string
}

export function parseJourneyUid(journeyUid: string): ParsedJourneyUid {
  const uid = String(journeyUid ?? '').trim()
  if (!uid) return { kind: 'raw', parts: [], cycle: '' }

  if (uid.startsWith(MERGED_PREFIX)) {
    const parts = uid
      .slice(MERGED_PREFIX.length)
      .split(MERGED_SEP)
      .map((p) => p.trim())
      .filter(Boolean)
    return { kind: 'merged', parts, cycle: '' }
  }

  const m = CYCLE_RE.exec(uid)
  if (m) return { kind: 'cycle', parts: [shortUid(m[1]!)], cycle: m[2]! }

  // Llave fusionada YA canónica (`<12>__<12>`, sin prefijo). Sin esta rama,
  // canonicalJourneyKey no sería idempotente: volvería a truncar a 12 chars y
  // se comería la segunda parte, devolviendo una llave distinta cada vez que
  // se la re-normaliza.
  if (uid.includes(MERGED_SEP)) {
    const parts = uid
      .split(MERGED_SEP)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 1) return { kind: 'merged', parts, cycle: '' }
  }

  return { kind: 'raw', parts: [shortUid(uid)], cycle: '' }
}

/**
 * Partes cortas que componen un journey_uid. Son la unidad de religado con los
 * eventos crudos — dos vueltas del mismo camión COMPARTEN parte, por eso la
 * parte sola no alcanza como identidad (ver `canonicalJourneyKey`).
 */
export function journeyUidParts(journeyUid: string): string[] {
  return [...parseJourneyUid(journeyUid).parts]
}

/**
 * Llave canónica de un journey. Determinística y estable entre corridas:
 * las partes se ordenan, así que `merged_B__A` y `merged_A__B` son la misma,
 * y la vuelta se conserva para que dos ciclos nunca colapsen.
 */
export function canonicalJourneyKey(journeyUid: string): string {
  const { kind, parts, cycle } = parseJourneyUid(journeyUid)
  if (!parts.length) return ''
  if (kind === 'merged') return [...parts].sort().join(MERGED_SEP)
  if (kind === 'cycle') return `${parts[0]}__cycle_${cycle}`
  return parts[0]!
}

/** Separador de listas en las columnas multi-valor del ETL (`a;b`, `a,b`, `a|b`). */
const LIST_SEP = /[;,|]/

/** Parsea una celda multi-valor de uids (ej. `matched_journey_uids`). */
export function parseUidList(cell: unknown): string[] {
  const raw = String(cell ?? '').trim()
  if (!raw) return []
  return raw
    .split(LIST_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
}

export type JourneyKeyIndex = {
  /**
   * parte corta → llaves que la contienen. Es multi-valor a propósito: las
   * vueltas de un mismo camión comparten prefijo, así que un uid crudo citado
   * por el Excel puede corresponder a varios ciclos y desempatarlo es
   * competencia del nivel C (por solape temporal), no de la llave.
   */
  readonly byPart: ReadonlyMap<string, readonly string[]>
  /** llave canónica → partes que la componen. */
  readonly partsByKey: ReadonlyMap<string, readonly string[]>
}

/**
 * Índice de religado a partir de los journeys ya reconstruidos (nivel D crudo
 * o el pool limpio). Con esto, cualquier uid — crudo, corto, fusionado o con
 * ciclo — resuelve a las llaves que lo respaldan.
 */
export function buildJourneyKeyIndex(journeyUids: Iterable<string>): JourneyKeyIndex {
  const byPart = new Map<string, string[]>()
  const partsByKey = new Map<string, readonly string[]>()
  for (const uid of journeyUids) {
    const key = canonicalJourneyKey(uid)
    if (!key) continue
    const parts = journeyUidParts(uid)
    partsByKey.set(key, parts)
    for (const p of parts) {
      let arr = byPart.get(p)
      if (!arr) byPart.set(p, (arr = []))
      if (!arr.includes(key)) arr.push(key)
    }
  }
  return { byPart, partsByKey }
}

/**
 * Todas las llaves canónicas que respaldan un uid. Puede devolver varias
 * cuando el journey se partió en vueltas.
 */
export function resolveJourneyKeys(uid: string, index: JourneyKeyIndex): string[] {
  const direct = canonicalJourneyKey(uid)
  if (direct && index.partsByKey.has(direct)) return [direct]
  const out = new Set<string>()
  for (const part of journeyUidParts(uid)) {
    for (const k of index.byPart.get(part) ?? []) out.add(k)
  }
  return [...out]
}

/**
 * Llaves citadas por una celda multi-valor. `resueltas` son las que existen en
 * el índice; `huerfanas` las que C cita y ningún journey respalda — se
 * devuelven aparte en vez de descartarse en silencio. `ambiguas` marca los
 * uids que cayeron en más de una vuelta y necesitan desempate temporal.
 */
export function resolveCitedKeys(
  cell: unknown,
  index: JourneyKeyIndex
): { resueltas: string[]; huerfanas: string[]; ambiguas: string[] } {
  const resueltas = new Set<string>()
  const huerfanas = new Set<string>()
  const ambiguas = new Set<string>()
  for (const uid of parseUidList(cell)) {
    const keys = resolveJourneyKeys(uid, index)
    if (!keys.length) {
      huerfanas.add(shortUid(uid))
      continue
    }
    if (keys.length > 1) ambiguas.add(shortUid(uid))
    for (const k of keys) resueltas.add(k)
  }
  return { resueltas: [...resueltas], huerfanas: [...huerfanas], ambiguas: [...ambiguas] }
}
