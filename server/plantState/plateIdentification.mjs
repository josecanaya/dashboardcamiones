/**
 * Identificación de patentes en vivo.
 *
 * Una lectura mal hecha (patente parcial o con caracteres cambiados) aparece en el feed
 * como un journey propio que arranca a mitad del circuito. Este módulo busca a qué
 * camión en planta pertenece, con dos evidencias:
 *   1. Patente: Levenshtein ponderado (confusiones OCR baratas, borrado/inserción medio).
 *   2. Modelo de nodos: el nodo de la lectura tiene que ser un nodo esperado del camión,
 *      según los circuitos compatibles con lo que ya hizo, pesados por los viajes de las
 *      últimas 24 h + el histórico del comité (vale como PRIOR_WEIGHT viajes).
 * El feed en vivo no trae color/marca/tipo ni confianza: los atributos no intervienen acá.
 *
 * Niveles:
 *   confirmado   decisión del operador (o patente exacta: ni siquiera es fragmento)
 *   casi_seguro  patente reparable + nodo esperado + sin rival cercano → se aplica sola
 *   provisorio   patente reparable pero nodo no esperado o rival cercano → operador
 *   pendiente    lectura ilegible sin candidato claro → operador
 * La reconstrucción al cierre del viaje queda como última instancia (fuera de este módulo).
 */

import { visitRowsAt, assessVisitCandidate } from './visitInventory.mjs'
import { arrivalWeight, scoreWithNodeModel } from './nodeModelScore.mjs'
import { outsideTruckSystem } from './balanzaRegistry.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEventLiveInstantMs } from './liveEventTime.mjs'
import { resolveCanonicalSectorForLiveFeed } from './sectorProfiles.mjs'
import { logicalLabel, sectorToLogical } from './circuitPrefix.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TWELVE_H_MS = 12 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Un camión sigue siendo candidato hasta 8 h sin verse (cargas en silos superan las 4 h: LFT141 el 06/10). */
const MAX_GAP_MS = 8 * 60 * 60 * 1000
const SAME_NODE_MS = 30 * 60 * 1000
/** Hasta cuánto después de una lectura mala se acepta la primera lectura buena del camión. */
const MAX_AFTER_MS = 3 * 60 * 60 * 1000

export const PRIOR_WEIGHT = 20
export const MIN_SIMILARITY = 0.65
export const MIN_READ_LENGTH = 4
const RIVAL_MARGIN = 0.15
/** Probabilidad mínima de que el nodo sea esperado para el camión (debajo: solo el piso ε del modelo). */
export const MIN_NODE_PROBABILITY = 0.05
/**
 * Universo de candidatos: camiones en planta para los que el nodo de la lectura es altamente
 * probable (o que ya estaban en ese nodo). Los de afuera solo se muestran si la patente es casi igual.
 */
export const UNIVERSE_NODE_PROBABILITY = 0.2
const OUTSIDE_UNIVERSE_SIMILARITY = 0.85
/** Una lectura con formato válido nunca se corrige sola (ver el nivel `provisorio`); >1 la desactiva. */
export const VALID_AUTO_SIMILARITY = 1.01
/** Lectura ilegible y el camión del universo con una sola lectura: se aplica sola si la patente es casi igual. */
const ONE_READ_SIMILARITY = 0.85
/** Doble lectura: el mismo camión leído bien en el mismo nodo (otra cámara o la misma) a pocos minutos. */
export const TWIN_MS = 3 * 60 * 1000
/** 0,5 unió JAC7110 con JAU7D16 (otro vehículo, descartado por operaciones el 07/10). */
const TWIN_MIN_SIMILARITY = 0.6
/**
 * La cuenta del modelo de nodos (docs «algoritmo explicado»): P(camión) = paso esperado × patente ×
 * atributos, contra «nuevo en el circuito». Por encima de este umbral se aplica sola.
 */
// Criterio de operaciones (19/10): reconocimiento mayor al 60 % se aplica. Antes 0,95 / 0,90
// (replay 06–08/10 contra operaciones); las guardas de balanza y parecido siguen igual.
export const AUTO_APPLY_PROBABILITY = 0.6
export const CUENTA_AUTO_PROBABILITY = AUTO_APPLY_PROBABILITY
export const CUENTA_INVALID_AUTO_PROBABILITY = AUTO_APPLY_PROBABILITY
/**
 * Patente válida que nunca pasó por la balanza y un solo camión parecido (una letra) que la balanza tiene
 * en planta, con el paso pendiente y la cuenta a su favor (≥ 50 %): replay 06–08/10, 13 de 14 bien
 * (falló RKU605 → RKU685, dos camiones reales y RKU605 no figuraba en el Excel).
 */
const BALANZA_NEAR_SIMILARITY = 0.8
/** Reglas automáticas a las que se les pide que el elegido no sea un «camión fantasma» (ver identifyFragments). */
const GHOST_GUARD_RULES = new Set(['universo', 'cuenta', 'atributos_dss'])
/** Parecido mínimo entre una lectura y un camión de la balanza para el viaje fantasma y la regla «balanza única». */
export const GHOST_SIMILARITY = 0.75
const BALANZA_NEAR_CUENTA = 0.5
/** Patente válida corregida por la cuenta: solo si se parece de verdad (una letra) al camión elegido. */
const CUENTA_VALID_SIMILARITY = 0.8
const ENTRY_NODES = new Set(['S0', 'S1', 'SL_S0', 'SL_S1'])
/** Salidas de planta: un camión visto ahí hace más de EXIT_GRACE_MS ya se fue (90 min cubre relecturas tardías en egreso). */
const EXIT_NODES = new Set(['SL_S7', 'S10'])
const EXIT_GRACE_MS = 90 * 60 * 1000
const VALID_PLATE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2})$/

const NODE_MODEL_PATH = path.resolve(__dirname, '../../docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')

let _modelCatalog = null
/**
 * Circuitos del modelo de nodos (Ricardone + San Lorenzo) como secuencias lógicas con cámara:
 * ricardone → S*, san_lorenzo → SL_S*. Los nodos sin cámara se omiten (no generan lecturas).
 * @returns {{ code: string, sequences: string[][] }[]}
 */
export function nodeModelCatalog() {
  if (_modelCatalog) return _modelCatalog
  const model = JSON.parse(fs.readFileSync(NODE_MODEL_PATH, 'utf8'))
  const logicalOf = new Map(
    model.nodes
      .filter((n) => n.hasCamera && n.code)
      .map((n) => [n.id, n.plant === 'san_lorenzo' ? `SL_${n.code}` : n.code])
  )
  _modelCatalog = model.circuits.map((c) => {
    const seq = []
    for (const id of c.seq) {
      const l = logicalOf.get(id)
      if (l && seq[seq.length - 1] !== l) seq.push(l)
    }
    return { code: c.id, sequences: [seq] }
  }).filter((c) => c.sequences[0].length)
  return _modelCatalog
}

let _prior = null
export function historicalPrior() {
  if (_prior) return _prior
  try {
    _prior = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'circuitPriorHistorico.json'), 'utf8')).prior || {}
  } catch {
    _prior = {}
  }
  return _prior
}

export function isValidPlate(plate) {
  return VALID_PLATE.test(String(plate || ''))
}

const CONFUSABLE = new Set(
  ['0O', '0D', '0Q', '8B', '1I', '1L', '5S', '2Z', '6G', '4A', 'MN', 'UV', 'VY', 'HM', 'EF', 'CG'].flatMap((p) => [p, p[1] + p[0]])
)

/** Levenshtein ponderado: confusión OCR 0,3 · otra sustitución 1 · borrado/inserción 0,6. */
export function weightedEditCost(a, b) {
  const n = a.length
  const m = b.length
  let prev = Array.from({ length: m + 1 }, (_, j) => j * 0.6)
  for (let i = 1; i <= n; i++) {
    const cur = [i * 0.6]
    for (let j = 1; j <= m; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : CONFUSABLE.has(a[i - 1] + b[j - 1]) ? 0.3 : 1
      cur[j] = Math.min(prev[j - 1] + sub, prev[j] + 0.6, cur[j - 1] + 0.6)
    }
    prev = cur
  }
  return prev[m]
}

/** Parecido 0–1 entre una lectura y una patente real. Lecturas de menos de 4 caracteres no cuentan. */
export function plateSimilarity(read, real) {
  const r = String(read || '')
  const p = String(real || '')
  if (r.length < MIN_READ_LENGTH || !p) return 0
  return Math.max(0, 1 - weightedEditCost(r, p) / p.length)
}

function plateOf(e) {
  return String(e?.normalizedPlate || e?.truckPlate || e?.rawTruckPlate || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
}

/** Misma clave de journey que queries.collectOpenJourneys. */
export function journeyKeyOf(e, t) {
  const uid = String(e?.journeyUid ?? '').trim()
  if (uid) return uid
  return `${plateOf(e) || 'NOPLATE'}#${Math.floor(t / TWELVE_H_MS)}`
}

/**
 * @param {object[]} events
 * @param {number} nowMs
 */
export function buildJourneys(events, nowMs) {
  /** @type {Map<string, { key: string, plate: string, journeyUid: string|null, rows: { t: number, logical: string, sectorCode: string, device: string }[] }>} */
  const map = new Map()
  for (const e of events || []) {
    if (e?.inferred || e?.manualCorrection) continue
    const t = getEventLiveInstantMs(e)
    if (!Number.isFinite(t) || t > nowMs) continue
    const device = String(e.deviceCode ?? '').trim()
    const sectorCode = resolveCanonicalSectorForLiveFeed(e.sectorCode, device)
    const logical = sectorToLogical(sectorCode)
    if (!logical || logical === 'ESPERA') continue
    const key = journeyKeyOf(e, t)
    let j = map.get(key)
    if (!j) {
      j = { key, plate: plateOf(e), journeyUid: String(e.journeyUid ?? '').trim() || null, rows: [] }
      map.set(key, j)
    }
    j.rows.push({ t, logical, sectorCode, device })
  }
  for (const j of map.values()) j.rows.sort((a, b) => a.t - b.t)
  return [...map.values()].filter((j) => j.rows.length)
}

function collapse(logicals) {
  const out = []
  for (const l of logicals) if (out[out.length - 1] !== l) out.push(l)
  return out
}

/** Veces que el propio camión repitió un tramo para que cuente como su patrón (ida y vuelta interno). */
export const OWN_STEP_MIN_REPEATS = 2
/**
 * Probabilidad del paso from → to según el recorrido del propio camión en esta visita. Los camiones
 * internos (AYM824: Volcable ↔ Silo Chief toda la noche) hacen tramos que ningún circuito del catálogo
 * tiene, y el catálogo les daba 0 % aunque el ida y vuelta se repitiera diez veces.
 */
export function ownStepProbability(seen, from, to) {
  let total = 0
  let hits = 0
  for (let i = 0; i + 1 < seen.length; i++) {
    if (seen[i] !== from) continue
    total++
    if (seen[i + 1] === to) hits++
  }
  return hits >= OWN_STEP_MIN_REPEATS ? hits / total : 0
}

/** Posiciones de h como subsecuencia ordenada de seq, o null. */
function subseqLast(seq, h) {
  let i = 0
  let last = -1
  for (let j = 0; j < seq.length && i < h.length; j++) {
    if (seq[j] === h[i]) {
      i += 1
      last = j
    }
  }
  return i === h.length ? last : null
}

/**
 * Peso de cada circuito = viajes de las últimas 24 h + PRIOR_WEIGHT × peso histórico.
 * @param {Record<string, number>} recentCounts
 * @param {Record<string, number>} prior
 */
export function circuitWeights(recentCounts, prior = historicalPrior(), codes = []) {
  const all = new Set([...Object.keys(prior), ...Object.keys(recentCounts || {}), ...codes])
  const w = {}
  for (const c of all) w[c] = (recentCounts?.[c] || 0) + PRIOR_WEIGHT * (prior[c] || 0) + 0.05
  return w
}

/**
 * Circuitos compatibles con lo recorrido y probabilidad de cada próximo nodo.
 * `reachable` = nodos que el camión todavía puede pasar (permite saltar cámaras que no leyeron).
 * @param {string[]} seen secuencia lógica ya colapsada
 * @param {{ code: string, sequences: string[][] }[]} catalog
 * @param {Record<string, number>} weights
 */
export function expectedNodes(seen, catalog, weights) {
  const h = seen.filter((l) => l !== 'ESPERA')
  /** @type {Record<string, number>} */
  const circuit = {}
  /** @type {Record<string, number>} */
  const next = {}
  /** @type {Record<string, number>} */
  const reachable = {}
  let total = 0
  for (const entry of catalog) {
    const seqs = entry.sequences.map((s) => s.filter((l) => l !== 'ESPERA'))
    const fits = seqs.map((s) => [s, subseqLast(s, h)]).filter(([, p]) => p != null)
    if (!fits.length) continue
    const w = (weights[entry.code] ?? 0.05) / fits.length
    for (const [s, p] of fits) {
      total += w
      circuit[entry.code] = (circuit[entry.code] || 0) + w
      const nx = s[p + 1] ?? 'FIN'
      next[nx] = (next[nx] || 0) + w
      for (const l of new Set(s.slice(p + 1))) reachable[l] = (reachable[l] || 0) + w
    }
  }
  const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, total ? v / total : 0]).sort((a, b) => b[1] - a[1]))
  return { circuit: norm(circuit), next: norm(next), reachable: norm(reachable), total }
}

/**
 * Tiempos de tránsito habituales entre nodos, medidos en los viajes bien leídos del buffer (24 h):
 * para cada par A → B (B después de A en el mismo viaje), los minutos entre la última lectura en A
 * y la primera en B. Sirve para saber qué camiones pueden estar llegando a un nodo en este momento.
 * @param {{ plate: string, rows: { t: number, logical: string }[] }[]} journeys
 */
export function transitTimes(journeys) {
  /** @type {Map<string, number[]>} */
  const gaps = new Map()
  for (const j of journeys) {
    if (!isValidPlate(j.plate)) continue
    // Visitas: primera y última lectura de cada pasada por un nodo.
    const visits = []
    for (const r of j.rows) {
      const v = visits[visits.length - 1]
      if (v && v.logical === r.logical) v.last = r.t
      else visits.push({ logical: r.logical, first: r.t, last: r.t })
    }
    for (let a = 0; a < visits.length; a++) {
      for (let b = a + 1; b < visits.length; b++) {
        if (visits[b].logical === visits[a].logical) break
        const k = `${visits[a].logical}>${visits[b].logical}`
        const list = gaps.get(k) ?? []
        list.push(visits[b].first - visits[a].last)
        gaps.set(k, list)
      }
    }
  }
  /** @type {Map<string, { n: number, p50: number, p95: number }>} */
  const out = new Map()
  for (const [k, list] of gaps) {
    list.sort((x, y) => x - y)
    const q = (p) => list[Math.min(list.length - 1, Math.floor(p * list.length))]
    out.set(k, { n: list.length, p50: q(0.5), p95: q(0.95) })
  }
  return out
}

/** Con pocos viajes medidos para ese tramo no se descarta por tiempo (alcanza el tope general de 8 h). */
const MIN_TRANSIT_SAMPLES = 5
/** Margen sobre el p95 del tramo: cubre colas puntuales sin aceptar camiones que ya deberían estar en otro lado. */
const TRANSIT_SLACK = 1.5
const TRANSIT_MIN_ALLOWANCE_MS = 20 * 60 * 1000

/**
 * ¿Es razonable llegar de A a B en `gapMs`? Devuelve también el tiempo habitual para mostrarlo.
 * @param {Map<string, { n: number, p50: number, p95: number }>} transit
 */
export function transitFit(transit, from, to, gapMs) {
  const s = transit.get(`${from}>${to}`)
  if (!s || s.n < MIN_TRANSIT_SAMPLES) return { onTime: true, typicalMinutes: s ? Math.round(s.p50 / 60000) : null, maxMinutes: null }
  const max = Math.max(s.p95 * TRANSIT_SLACK, TRANSIT_MIN_ALLOWANCE_MS)
  return { onTime: gapMs <= max, typicalMinutes: Math.round(s.p50 / 60000), maxMinutes: Math.round(max / 60000) }
}

/** Circuito más probable de un journey completo (para el conteo de 24 h). */
export function bestCircuit(seen, catalog, weights) {
  const { circuit } = expectedNodes(seen, catalog, weights)
  const [code, p] = Object.entries(circuit)[0] || []
  return code ? { code, p } : null
}

/**
 * Clasifica las lecturas sueltas (fragmentos) contra los camiones en planta.
 * @param {object[]} events eventos crudos del buffer (antes de aplicar alias)
 * @param {number} nowMs
 * @param {{ catalog: { code: string, sequences: string[][] }[], recentCounts?: Record<string, number>, decisions?: Record<string, { action: string, plate?: string, journeyUid?: string|null, updatedAt?: string }> }} ctx
 */
export function identifyFragments(events, nowMs, ctx) {
  // Los camiones de la otra planta también son candidatos (R7: se lee bien en Ricardone y mal en
  // San Lorenzo, o al revés); las lecturas a revisar son solo las de esta planta.
  const journeys = buildJourneys(events, nowMs)
  const otherJourneys = (ctx.otherSiteEvents?.length ? buildJourneys(ctx.otherSiteEvents, nowMs) : []).map((j) => ({ ...j, otherSite: true }))
  let weights = circuitWeights({}, historicalPrior(), ctx.catalog.map((c) => c.code))
  let activeAt = nowMs
  const causalWeights = new Map()
  const decisions = ctx.decisions || {}

  const opt = { universe: true, universeNodeProbability: UNIVERSE_NODE_PROBABILITY, validAutoSimilarity: VALID_AUTO_SIMILARITY, minReads: 2, validSameNode: true, validSameNodeSimilarity: 0.8, ...ctx.options }
  const parents = [...journeys, ...otherJourneys].filter((j) => isValidPlate(j.plate))
  // Una lectura con decisión de operaciones sigue siendo un caso aunque después deje de parecer un
  // fragmento (se volvió a leer en otro nodo, el candidato salió de planta): la decisión no se pierde.
  const decided = (j) => ['confirm', 'reject'].includes(decisions[j.key]?.action)
  /** Registro de balanza (SGC): refuerzo ante la duda. Ver balanzaRegistry.mjs. */
  const bz = ctx.balanza ?? null
  const trailerOfJourney = (j) => (bz && bz.isTrailer(j.plate) && !bz.truckAt(j.plate, j.rows[0].t) ? bz.trailerAt(j.plate, j.rows[0].t) : null)
  /**
   * Viaje fantasma: patente válida mal leída igual en varias cámaras (BOH961 en Preingreso e Ingreso, era
   * BDH961). No está en la balanza ni vino nunca, y en planta hay un camión parecido según la balanza.
   * Cruce 13–19/10: 57 de 175 lecturas malas eran viajes así y nunca llegaban a la bandeja.
   */
  const ghostOfJourney = (j) =>
    Boolean(bz && isValidPlate(j.plate) && !bz.truckAt(j.plate, j.rows[0].t) && !bz.isKnown(j.plate) &&
      bz.platesAt(j.rows[0].t).some((p) => p !== j.plate && plateSimilarity(j.plate, p) >= GHOST_SIMILARITY))
  const fragments = journeys.filter((j) => {
    if (decided(j)) return true
    const first = j.rows[0].logical
    if (!isValidPlate(j.plate)) return true
    // Patente del acoplado (cámaras traseras): el feed la trata como otro camión aunque recorra varios nodos.
    if (trailerOfJourney(j)) return true
    if (ghostOfJourney(j)) return true
    // Patente válida que arranca a mitad de circuito: puede ser una lectura cambiada (KMO254 por KWO254).
    // Si la misma patente se leyó en dos o más nodos distintos, es un camión real al que no se le leyó el ingreso.
    if (new Set(j.rows.map((r) => r.logical)).size > 1) return false
    return !ENTRY_NODES.has(first)
  })

  const causalTransit = new Map()

  /** @type {Map<string, ReturnType<typeof expectedNodes>>} */
  const memo = new Map()
  const expectedFor = (seen) => {
    const k = `${activeAt}|${seen.join('>')}`
    let v = memo.get(k)
    if (!v) {
      v = expectedNodes(seen, ctx.catalog, weights)
      memo.set(k, v)
    }
    return v
  }

  /** Últimas lecturas del candidato (para ver sus pasos antes de decidir). */
  // Todas las lecturas de cada patente, de todos sus viajes y de las dos plantas (un transile hace
  // varias vueltas y cada una es un viaje distinto en el feed).
  /** @type {Map<string, { t: number, logical: string, device: string, otherSite: boolean }[]>} */
  const readsByPlate = new Map()
  for (const j of [...journeys, ...otherJourneys]) {
    if (!j.plate) continue
    const list = readsByPlate.get(j.plate) ?? []
    for (const r of j.rows) list.push({ ...r, otherSite: Boolean(j.otherSite) })
    readsByPlate.set(j.plate, list)
  }
  const recentReadsOf = (p, at, rows = p.rows) =>
    rows
      .filter((r) => r.t <= at)
      .sort((a, b) => b.t - a.t)
      .slice(0, 10)
      .map((r) => ({ at: new Date(r.t).toISOString(), node: r.logical, nodeLabel: logicalLabel(r.logical), device: r.device, otherSite: r.otherSite }))
  /** Circuito del candidato SI esta lectura es suya: los nodos que ya hizo + el de la lectura. */
  const circuitIfMatch = (logicals) => {
    const e = expectedFor(collapse(logicals))
    const [code, prob] = Object.entries(e.circuit)[0] ?? []
    return { circuit: code ?? null, circuitProbability: Math.round((prob ?? 0) * 1000) / 1000 }
  }

  /** Tiempo entre la lectura del candidato y esta, contra lo habitual para ese tramo. */
  const timing = (fit, gapMs) => ({
    onTime: fit ? fit.onTime : true,
    gapMinutes: Math.round(Math.abs(gapMs) / 60000),
    typicalMinutes: fit ? fit.typicalMinutes : null,
    maxMinutes: fit ? fit.maxMinutes : null,
  })

  /** @type {object[]} */
  const items = []
  for (const f of fragments) {
    const head = f.rows[0]
    activeAt=head.t
    const causalJourneys=[...journeys,...otherJourneys].map(j=>({...j,rows:visitRowsAt(j.rows,head.t)})).filter(j=>j.rows.length)
    weights=causalWeights.get(head.t)
    if (!weights) {
      const counts={}
      const prior=historicalPrior()
      const base=circuitWeights({},prior,ctx.catalog.map(c=>c.code))
      for (const j of causalJourneys) {
        if (!isValidPlate(j.plate) || !ENTRY_NODES.has(j.rows[0].logical) || head.t-j.rows[0].t>DAY_MS) continue
        const seen=collapse(j.rows.map(r=>r.logical));if(seen.length<2)continue
        const fit=bestCircuit(seen,ctx.catalog,base)
        if(fit && fit.p>=0.5)counts[fit.code]=(counts[fit.code]??0)+1
      }
      weights=circuitWeights(counts,prior,ctx.catalog.map(c=>c.code));causalWeights.set(head.t,weights)
    }
    let transit=ctx.transit??causalTransit.get(head.t)
    if (!transit) { transit=transitTimes(causalJourneys); causalTransit.set(head.t,transit) }
    const candidates = []
    /** Camiones conocidos que esperan este paso, se parezcan o no (denominador del modelo por nodos). */
    let expectedAtNode = 0
    for (const p of parents) {
      if (p.key === f.key || p.plate === f.plate) continue
      // Doble lectura: el camión se leyó bien en este mismo nodo (otra cámara o la misma) a pocos
      // minutos, antes o después. Es la evidencia más fuerte de que la lectura mala es suya.
      let twinMs = Infinity
      for (const r of p.rows) if (r.logical === head.logical) twinMs = Math.min(twinMs, Math.abs(r.t - head.t))
      const twin = twinMs <= TWIN_MS
      const twinSeconds = twin ? Math.round(twinMs / 1000) : null
      const before = visitRowsAt(p.rows, head.t)
      if (!before.length) {
        // El camión todavía no se había leído bien: su primera lectura buena llega DESPUÉS.
        // Ej. OQT40 (Ingreso SL 11:12) → OQT140 leído bien recién en Carga OSL. Solo por patente
        // y si el nodo de la lectura mala puede venir antes que el primero bien leído.
        const first = p.rows[0]
        if (first.t - head.t > MAX_AFTER_MS) continue
        const sim = plateSimilarity(f.plate, p.plate)
        if (sim < (twin ? TWIN_MIN_SIMILARITY : MIN_SIMILARITY)) continue
        const ahead = twin || first.logical === head.logical ? 1 : expectedFor([head.logical]).reachable[first.logical] || 0
        candidates.push({
          plate: p.plate,
          journeyKey: p.key,
          journeyUid: p.journeyUid,
          similarity: Math.round(sim * 1000) / 1000,
          nodeProbability: Math.round(ahead * 1000) / 1000,
          nextProbability: 0,
          expectedNext: null,
          ...circuitIfMatch([head.logical, ...p.rows.map((r) => r.logical)]),
          recentReads: recentReadsOf(p, first.t, [first]),
          lastNode: first.logical,
          lastNodeLabel: logicalLabel(first.logical),
          lastSeenAt: new Date(first.t).toISOString(),
          /** Lectura buena del candidato para mostrar su foto al lado (cámara + hora del feed). */
          photoDevice: first.device,
          photoAt: new Date(first.t).toISOString(),
          where: p.otherSite ? 'otra_planta' : 'leido_despues',
          seenAfter: true,
          sameNode: twin,
          twin,
          twinSeconds,
          ...timing(twin ? null : transitFit(transit, head.logical, first.logical, first.t - head.t), first.t - head.t),
          reads: 0,
          automaticEligible: false,
          score: 4 * sim + Math.log(ahead + 0.01),
        })
        continue
      }
      if (head.t - before[before.length - 1].t > MAX_GAP_MS) continue
      const lastSeenRow = before[before.length - 1]
      // Los egresos previos se conservan como excepciones; no prueban presencia actual.
      const sim = plateSimilarity(f.plate, p.plate)
      const seen = collapse(before.map((r) => r.logical))
      const exp = expectedFor(seen)
      // Otra cámara del mismo nodo donde ya está el camión (frente/trasera, doble lectura): es esperado.
      const lastBefore = before[before.length - 1]
      const sameNode = before.some(r=>r.logical===head.logical && head.t-r.t<=TWIN_MS) || (lastBefore.logical === head.logical && head.t - lastBefore.t <= SAME_NODE_MS)
      const pOwn = ownStepProbability(seen, lastBefore.logical, head.logical)
      const pNext = sameNode ? 1 : Math.max(exp.next[head.logical] || 0, pOwn)
      const pReach = exp.reachable[head.logical] || 0
      if (pNext > 0 || pReach > 0) {
        const onTime = sameNode || transitFit(transit, lastBefore.logical, head.logical, head.t - lastBefore.t).onTime
        expectedAtNode += arrivalWeight({ sameNode, nextProbability: pNext, nodeProbability: Math.max(pNext, pReach), onTime })
      }
      if (sim < (twin ? TWIN_MIN_SIMILARITY : MIN_SIMILARITY) && pNext < 0.5) continue
      candidates.push({
        plate: p.plate,
        journeyKey: p.key,
        journeyUid: p.journeyUid,
        similarity: Math.round(sim * 1000) / 1000,
        nodeProbability: Math.round(Math.max(pNext, pReach) * 1000) / 1000,
        nextProbability: Math.round(pNext * 1000) / 1000,
        expectedNext: Object.keys(exp.next)[0] ?? null,
        // Antes mostraba el circuito previo (R7) aunque la lectura fuera en Playa 3, donde R7 no pasa.
        ...circuitIfMatch([...seen, head.logical]),
        circuitBefore: Object.keys(exp.circuit)[0] ?? null,
        recentReads: recentReadsOf(p, head.t, before),
        lastNode: seen[seen.length - 1] ?? null,
        lastNodeLabel: seen.length ? logicalLabel(seen[seen.length - 1]) : null,
        lastSeenAt: new Date(lastBefore.t).toISOString(),
        photoDevice: lastBefore.device,
        photoAt: new Date(lastBefore.t).toISOString(),
        where: p.otherSite ? 'otra_planta' : 'en_planta',
        sameNode,
        twin,
        twinSeconds,
        ...timing(sameNode ? null : transitFit(transit, lastBefore.logical, head.logical, head.t - lastBefore.t), head.t - lastBefore.t),
        // Solo cuentan las lecturas conocidas cuando ocurrió el evento.
        reads: before.length,
        automaticEligible: !twin || before.some((r) => r.logical === head.logical && head.t - r.t <= TWIN_MS),
        score: 4 * sim + Math.log(Math.max(pNext, pReach) + 0.01),
      })
    }
    // Evalúa la visita ANTES de deduplicar: una visita futura no oculta la referencia causal.
    for (const c of candidates) {
      const parent=parents.find(p=>p.key===c.journeyKey && p.plate===c.plate)
      c.inventory=assessVisitCandidate(c,head,visitRowsAt(parent?.rows??[],head.t))
      c.inUniverse = (c.inventory.status==='expected' || (opt.allowInventoryReasons ?? []).some(r=>c.inventory.reason.startsWith(r))) && !c.seenAfter && c.automaticEligible!==false && (c.sameNode || (c.nodeProbability>=opt.universeNodeProbability && (c.onTime || opt.ignoreTransit)))
      if (!c.inUniverse) c.automaticEligible=false
    }
    candidates.sort((a,b)=>Number(b.inUniverse)-Number(a.inUniverse) || (b.similarity>=MIN_SIMILARITY)-(a.similarity>=MIN_SIMILARITY) || b.score-a.score)
    const seenPlates = new Set()
    const unique = candidates.filter(c=>seenPlates.has(c.plate) ? false : seenPlates.add(c.plate))
    const isMatch = (c) => c.similarity >= MIN_SIMILARITY || (c.twin && c.similarity >= TWIN_MIN_SIMILARITY)
    const ordered = opt.universe
      ? [...unique.filter((c) => isMatch(c) && c.inUniverse), ...unique.filter((c) => isMatch(c) && !c.inUniverse), ...unique.filter((c) => !isMatch(c))]
      : unique
    candidates.length = 0
    candidates.push(...ordered)
    const plateMatches = candidates.filter(isMatch)
    const inside = plateMatches.filter((c) => c.inUniverse)
    const best = (opt.universe ? inside[0] : null) || plateMatches[0] || null
    // Rival: otro camión parecido dentro del universo, o uno de afuera con patente casi igual.
    const rival = plateMatches.find((c) => c !== best && (c.inUniverse || c.similarity >= OUTSIDE_UNIVERSE_SIMILARITY)) || null
    const twins = plateMatches.filter((c) => c.twin && c.automaticEligible !== false)
    const valid = isValidPlate(f.plate)
    const clearOfRival = (b) => !rival || b.similarity - rival.similarity >= RIVAL_MARGIN

    let level
    let reason
    const nonTwin = plateMatches.find((c) => !twins.includes(c))
    const twin = twins.length === 1 && (!nonTwin || twins[0].similarity >= nonTwin.similarity) ? twins[0] : null
    if (twin) {
      candidates.splice(candidates.indexOf(twin), 1)
      candidates.unshift(twin)
    }
    const twinText = twin ? `${twin.plate} se leyó en este mismo nodo ${twin.twinSeconds < 60 ? `a ${twin.twinSeconds} s` : `a ${Math.round(twin.twinSeconds / 60)} min`}` : ''

    // Refuerzo de balanza (SGC): ¿es el acoplado de un camión en planta? ¿es un camión que entró?
    const trailerHit = trailerOfJourney(f)
    const readInBalanza = Boolean(bz && valid && bz.truckAt(f.plate, head.t))
    const readKnown = Boolean(bz && valid && bz.isKnown(f.plate))
    const inBalanza = (plate) => Boolean(bz?.truckAt(plate, head.t))
    /** Viaje del camión más cercano a la lectura (para sumarle la lectura del acoplado). */
    const journeyOfPlate = (plate) =>
      candidates.find((c) => c.plate === plate) ??
      parents
        .filter((p) => p.plate === plate)
        .map((p) => ({ p, d: head.t < p.rows[0].t ? p.rows[0].t - head.t : Math.max(0, head.t - p.rows[p.rows.length - 1].t) }))
        .sort((a, b) => a.d - b.d)
        .map(({ p }) => ({ plate, journeyUid: p.journeyUid, journeyKey: p.key }))[0] ??
      { plate, journeyUid: null }

    // La cuenta del documento: camiones con el paso pendiente (no los leídos recién después) contra «nuevo».
    // Lectura ilegible sin ningún parecido: la patente no informa, deciden el recorrido y la hora.
    // «Paso pendiente» = el inventario de la visita lo espera acá (no lo consumió por otro carril, etc.).
    const eligible = candidates.filter((c) => !c.seenAfter && arrivalWeight(c) > 0 && c.inventory?.status === 'expected')
    let cuenta = null
    if (eligible.length) {
      const nm = scoreWithNodeModel(
        { readPlate: f.plate, validFormat: valid, node: head.logical, at: new Date(head.t).toISOString(), expectedAtNode },
        eligible,
        { ignorePlate: !valid && !plateMatches.length }
      )
      const top = [...nm.candidates].sort((a, b) => b.probability - a.probability)[0]
      const c = top && eligible.find((x) => x.plate === top.plate)
      cuenta = { probability: top?.probability ?? 0, neverSeen: nm.neverSeen.probability, candidate: c ?? null, ignorePlate: !valid && !plateMatches.length }
    }
    // Patente válida: se corrige solo si la leída nunca pasó por la balanza y el elegido sí está en planta
    // (o tiene dos lecturas), y se parece de verdad. MFY738/MFY788 son dos camiones reales: la balanza los separa.
    const cuentaOk = Boolean(
      opt.cuenta !== false && cuenta?.candidate &&
      (!valid
        ? cuenta.probability >= CUENTA_INVALID_AUTO_PROBABILITY
        : cuenta.probability >= CUENTA_AUTO_PROBABILITY && bz && !readKnown && cuenta.candidate.similarity >= CUENTA_VALID_SIMILARITY && (inBalanza(cuenta.candidate.plate) || cuenta.candidate.reads >= opt.minReads))
    )
    // Patente válida desconocida para la balanza y un único camión parecido que sí está en planta.
    const nearInBalanza = valid && bz && !readKnown ? candidates.filter((c) => c.similarity >= BALANZA_NEAR_SIMILARITY && !c.seenAfter && inBalanza(c.plate)) : []
    const balanzaNear =
      opt.cuenta !== false && nearInBalanza.length === 1 && nearInBalanza[0].inventory?.status === 'expected' &&
      cuenta?.candidate?.plate === nearInBalanza[0].plate && cuenta.probability >= BALANZA_NEAR_CUENTA
        ? nearInBalanza[0]
        : null
    // Doble lectura con dos patentes válidas: la balanza dice cuál es la real.
    const twinByBalanza = Boolean(twin && valid && bz && inBalanza(twin.plate) && !readKnown)
    // Una patente válida se corrige sola solo si la buena se leyó en este mismo nodo hace poco
    // (misma cámara o la de al lado: AC297UX → AC297HX en Balanza B3, 15 min antes) y el camión
    // tiene al menos dos lecturas. Sin eso fallaba 1 de cada 3 (MFY738/MFY788, OJD501/OJO501).
    const validOk = (b) => b.similarity >= opt.validAutoSimilarity || (opt.validSameNode && b.sameNode && !b.twin && b.similarity >= opt.validSameNodeSimilarity) || (opt.validNextNode && !b.sameNode && b.onTime && (b.nextProbability ?? 0) >= opt.validNextProbability && b.similarity >= opt.validSameNodeSimilarity)
    const autoOk = (b) =>
      b && b.inUniverse && clearOfRival(b) &&
      (b.reads >= opt.minReads || b.twin || (!valid && b.similarity >= ONE_READ_SIMILARITY)) &&
      (!valid || validOk(b))
    // Caso que se puede decidir con color/marca/tipo del DSS (lo calcula el servidor en segundo plano):
    // único camión del universo y, si la patente es válida, leído en este mismo nodo.
    const evidenceEligible = Boolean(best && !twin && best.inUniverse && clearOfRival(best) && (!valid || best.sameNode))
    const verdict = ctx.evidenceVerdicts?.[f.key]
    /** @type {typeof best} */
    let chosen = null
    let rule = null
    // Patente válida que la balanza tiene en planta y no se parece a nadie: no es un caso, es un camión real.
    if (readInBalanza && !plateMatches.length && !decided(f) && !trailerHit) continue
    if (twin && !valid) {
      // Lectura ilegible y el camión leído bien en el mismo nodo a segundos/minutos: es él.
      level = 'casi_seguro'
      reason = twinText
      chosen = twin
      rule = 'doble_lectura'
    } else if (trailerHit) {
      level = 'casi_seguro'
      chosen = journeyOfPlate(trailerHit.plate)
      reason = `${f.plate} es el acoplado de ${trailerHit.plate} según la balanza (SGC)`
      rule = 'acoplado_balanza'
    } else if (readInBalanza) {
      // Patente válida de un camión que la balanza tiene en planta: la cámara leyó bien.
      level = 'casi_seguro'
      chosen = { plate: f.plate, journeyUid: f.journeyUid }
      reason = `${f.plate} figura en la balanza (SGC): es un camión en planta y la cámara leyó bien`
      rule = 'leida_bien_balanza'
    } else if (twinByBalanza) {
      level = 'casi_seguro'
      chosen = twin
      reason = `${twinText}; la balanza tiene a ${twin.plate} en planta y ${f.plate} nunca pasó por la balanza`
      rule = 'doble_lectura_balanza'
    } else if (twin) {
      // Dos patentes válidas en el mismo nodo a segundos: es el mismo camión pero no se sabe cuál leyó
      // mal (MML273 en Egreso C1 y HHL273 en C2: la correcta era HHL273). Decide operaciones.
      level = 'provisorio'
      reason = `${twinText}: mismo camión, elegir qué patente es la correcta`
    } else if (autoOk(best)) {
      level = 'casi_seguro'
      chosen = best
      reason = valid
        ? `${best.plate} se leyó en este mismo nodo hace ${best.gapMinutes} min y es el único camión del universo`
        : `patente reparable y ${best.plate} es el único camión del universo esperado en este nodo`
      rule = 'universo'
    } else if (verdict && ((best && verdict.plate === best.plate && evidenceEligible) || (verdict.rule === 'cuenta' && cuenta?.candidate?.plate === verdict.plate))) {
      // Patente + recorrido + color/marca/tipo del DSS por encima del umbral calibrado.
      level = 'casi_seguro'
      chosen = best && verdict.plate === best.plate ? best : cuenta.candidate
      reason = `patente, recorrido y color/marca/tipo coinciden con ${chosen.plate} (${Math.round(verdict.probability * 100)}%)`
      rule = 'atributos_dss'
    } else if (cuentaOk) {
      level = 'casi_seguro'
      chosen = cuenta.candidate
      reason = `la cuenta da ${Math.round(cuenta.probability * 100)} % a ${chosen.plate}: tenía este paso pendiente${cuenta.ignorePlate ? ' (la lectura no se parece a ninguna patente)' : ''}${valid ? ` y ${f.plate} nunca pasó por la balanza` : ''}`
      rule = 'cuenta'
    } else if (balanzaNear) {
      level = 'casi_seguro'
      chosen = balanzaNear
      reason = `${f.plate} nunca pasó por la balanza y ${chosen.plate} (una letra distinta) está en planta según la balanza, con este paso pendiente (cuenta ${Math.round(cuenta.probability * 100)} %)`
      rule = 'balanza_parecida'
    } else if (best && valid) {
      level = 'provisorio'
      reason = `patente válida parecida a ${best.plate}${best.inUniverse ? ' (en el universo de este nodo)' : ''}: elegir la correcta`
    } else if (best) {
      level = 'provisorio'
      reason = !best.inUniverse
        ? 'patente parecida pero el nodo no es un paso probable de ese camión'
        : !clearOfRival(best)
          ? 'dos camiones del universo con patente parecida'
          : 'patente parecida pero el camión tiene una sola lectura'
    } else if (!valid) {
      level = 'pendiente'
      reason = candidates.length ? 'lectura ilegible: varios camiones esperados en ese nodo' : 'lectura ilegible sin candidato'
    } else if (decided(f)) {
      // Sin candidatos hoy (salieron de planta), pero operaciones ya decidió: se respeta.
      level = 'provisorio'
      reason = 'decisión de operaciones'
    } else if (ghostOfJourney(f)) {
      level = 'provisorio'
      reason = `${f.plate} no figura en la balanza y se parece a un camión que sí está en planta: posible lectura mala repetida`
    } else {
      // Patente válida sin parecido con nadie: camión real al que no se le leyó el ingreso.
      continue
    }

    // Camión fantasma: una lectura mala repetida en varias cámaras (DSP630 en Ingreso y Calada) arma un
    // viaje propio que atrae las demás lecturas malas. Si el elegido no está en la balanza y otro camión
    // parecido sí está en planta, no se aplica solo: cruce 13–19/10, 5 de 7 errores automáticos
    // (DSP63 → DSP630 era OSP630, HOCZ112 → HOC112 era HDC112, MDY20 → MDY210 era MDY213).
    const bzSimilar = bz ? bz.platesAt(head.t).filter((p) => p !== f.plate && plateSimilarity(f.plate, p) >= MIN_SIMILARITY) : []
    if (bz && level === 'casi_seguro' && chosen && GHOST_GUARD_RULES.has(rule) && !inBalanza(chosen.plate)) {
      // Parecido a la lectura o al propio elegido: COM1759 (ilegible) → MIN155, que es la lectura mala de GON155.
      const inPlant = [...new Set([...bzSimilar, ...bz.platesAt(head.t).filter((p) => plateSimilarity(chosen.plate, p) >= MIN_SIMILARITY)])].filter((p) => p !== chosen.plate)
      if (inPlant.length) {
        for (const p of inPlant) if (!bzSimilar.includes(p)) bzSimilar.push(p)
        level = 'provisorio'
        reason = `${chosen.plate} no figura en la balanza y ${inPlant.slice(0, 2).join(' / ')} (patente parecida) sí está en planta: elegir la correcta`
        rule = null
        chosen = null
      }
    }

    // Balanza única: lo que quedó abierto se asigna al ÚNICO camión parecido que la balanza tiene en planta.
    // Lectura ilegible: alcanza con eso. Patente válida (viaje fantasma): además ese camión no tiene
    // ninguna lectura de cámara en su visita (el fantasma es su recorrido) y la leída nunca vino a la balanza.
    if (bz && (level === 'provisorio' || level === 'pendiente') && !twin && !readInBalanza && !(valid && readKnown)) {
      const ranked = bz.platesAt(head.t)
        .filter((p) => p !== f.plate)
        .map((p) => ({ plate: p, similarity: plateSimilarity(f.plate, p) }))
        .filter((x) => x.similarity >= GHOST_SIMILARITY)
        .sort((a, b) => b.similarity - a.similarity)
      const top = ranked[0]
      const clear = top && (!ranked[1] || top.similarity - ranked[1].similarity >= RIVAL_MARGIN)
      // Un camión de cámara en el universo que se parece más (interno de silos, sin balanza) manda.
      const betterCamera = top && plateMatches.some((c) => c.inUniverse && c.similarity > top.similarity && !inBalanza(c.plate))
      const visit = top && bz.truckAt(top.plate, head.t)
      const unread = visit && !(readsByPlate.get(top.plate) ?? []).some((r) => r.t >= visit.ingresoMs - 30 * 60_000 && r.t <= (visit.salidaMs ?? head.t + 6 * 3600_000) + 60 * 60_000)
      // Lectura suelta en un solo nodo: no hace falta que el camión real no tenga lecturas (es una lectura más suya).
      const singleNode = new Set(f.rows.map((r) => r.logical)).size === 1
      if (clear && !betterCamera && (!valid || unread || singleNode)) {
        level = 'casi_seguro'
        chosen = journeyOfPlate(top.plate)
        rule = 'balanza_unica'
        reason = `${f.plate} no figura en la balanza y ${top.plate} (parecido ${Math.round(top.similarity * 100)} %) es el único camión parecido en planta según la balanza${valid && !singleNode ? ', sin ninguna lectura de cámara en su visita' : ''}`
        if (!bzSimilar.includes(top.plate)) bzSimilar.push(top.plate)
      }
    }

    const decision = decisions[f.key] || null
    let assignedPlate = level === 'casi_seguro' ? chosen.plate : null
    let assignedJourneyUid = level === 'casi_seguro' ? chosen.journeyUid : null
    /** Journey del candidato que también se corrige cuando la patente buena es la leída (o una escrita a mano). */
    let renameJourneyUid = null
    if (decision?.action === 'confirm' && decision.plate) {
      level = 'confirmado'
      assignedPlate = decision.plate
      const chosen = candidates.find((c) => c.plate === decision.plate)
      // Patente escrita a mano: si ese camión está en planta, la lectura se suma a su viaje.
      const typed = !chosen && !decision.journeyUid
        ? parents.filter((p) => p.plate === decision.plate && p.rows[0].t <= head.t).at(-1)
        : null
      assignedJourneyUid = decision.journeyUid ?? chosen?.journeyUid ?? typed?.journeyUid ?? null
      if (!chosen && !typed && assignedJourneyUid) renameJourneyUid = assignedJourneyUid
      reason = renameJourneyUid
        ? `confirmado por operaciones: la patente correcta es ${decision.plate}`
        : 'confirmado por operaciones'
    } else if (decision?.action === 'review' || decision?.action === 'defer') {
      // Revisión humana solicitada o diferida: la sugerencia automática no se aplica.
      if (level === 'casi_seguro') level = candidates.length ? 'provisorio' : 'pendiente'
      reason = decision.action === 'defer' ? `diferido: ${decision.reason ?? 'sin motivo'}` : 'reabierto para revisión humana'
      assignedPlate = null
      assignedJourneyUid = null
    } else if (decision?.action === 'reject') {
      level = 'rechazado'
      reason = 'descartado por operaciones'
      assignedPlate = null
      assignedJourneyUid = null
    }
    // Ni la lectura ni ningún candidato figuran en la balanza: vehículo fuera del sistema de camiones
    // (autos y camionetas en Egreso SL y Renova). Sale de la bandeja del operador a una lista aparte.
    // Un camión parecido en planta según la balanza (aunque ninguna cámara lo haya leído bien) prueba
    // que la lectura es de un camión: no va a «fuera del sistema».
    if (!decision && (level === 'provisorio' || level === 'pendiente') && bz && !bzSimilar.length &&
        outsideTruckSystem({ readPlate: f.plate, validFormat: valid, at: new Date(head.t).toISOString() }, candidates, bz)) {
      level = 'fuera_sistema'
      reason = `ni ${f.plate || 'la lectura'} ni ${candidates.length ? 'sus candidatos' : 'ningún camión'} figuran en la balanza: vehículo fuera del sistema de camiones`
      rule = 'fuera_sistema'
    }

    items.push({
      fragmentKey: f.key,
      readPlate: f.plate || 'SIN_PATENTE',
      validFormat: isValidPlate(f.plate),
      node: head.logical,
      nodeLabel: logicalLabel(head.logical),
      sectorCode: head.sectorCode,
      deviceCode: head.device,
      at: new Date(head.t).toISOString(),
      events: f.rows.length,
      expectedAtNode: Math.round(expectedAtNode * 10) / 10,
      level,
      reason,
      assignedPlate,
      assignedJourneyUid,
      renameJourneyUid,
      /** El servidor puede decidirlo con color/marca/tipo del DSS (umbral en identificationEvidence). */
      // También las que la cuenta deja cerca del umbral: color/marca/tipo del DSS pueden cerrarlas.
      evidenceEligible: (evidenceEligible || Boolean(!twin && cuenta?.candidate && cuenta.probability >= 0.5 && (!valid || (bz && !readKnown)))) && level !== 'casi_seguro' && !decision,
      rule: decision ? 'operaciones' : rule,
      cuenta: cuenta ? { plate: cuenta.candidate?.plate ?? null, probability: Math.round(cuenta.probability * 1000) / 1000, nuevo: Math.round(cuenta.neverSeen * 1000) / 1000, ignorePlate: cuenta.ignorePlate } : null,
      balanza: bz ? { readInPlant: readInBalanza, readKnown, trailerOf: trailerHit?.plate ?? null, similarInPlant: bzSimilar } : null,
      candidates: [...candidates.slice(0, opt.maxCandidates ?? 5), ...(cuenta?.candidate && !candidates.slice(0, opt.maxCandidates ?? 5).includes(cuenta.candidate) ? [cuenta.candidate] : [])].map(({ score, ...c }) => ({ ...c, inBalanza: inBalanza(c.plate), score: Math.round(score * 100) / 100 })),
      decision,
    })
  }

  // Decisiones cruzadas (TGL378 → TGT378 y TGT378 → TGL378, 07/10): se queda la más reciente y la
  // otra vuelve a revisión, para no renombrar dos viajes uno con la patente del otro.
  // «La cámara leyó bien» (X → X) no contradice nada: antes dos lecturas gemelas confirmadas así
  // se anulaban entre sí (AH763WD, AG688FB, AB349QJ el 07–08/10) y volvían a la bandeja.
  const renames = items.filter((it) => it.assignedPlate && it.assignedPlate !== it.readPlate)
  const byRead = new Map(renames.map((it) => [it.readPlate, it]))
  for (const a of renames) {
    const b = byRead.get(a.assignedPlate)
    if (!b || b === a || b.assignedPlate !== a.readPlate) continue
    const ta = Date.parse(a.decision?.updatedAt ?? '') || 0
    const tb = Date.parse(b.decision?.updatedAt ?? '') || 0
    const loser = ta >= tb ? b : a
    if (!loser.assignedPlate) continue
    loser.level = 'provisorio'
    loser.reason = `contradice otra decisión (${loser.assignedPlate} → ${loser.readPlate}): revisar`
    loser.assignedPlate = null
    loser.assignedJourneyUid = null
    loser.renameJourneyUid = null
  }

  items.sort((a, b) => b.at.localeCompare(a.at))
  const counts = items.reduce((acc, it) => ({ ...acc, [it.level]: (acc[it.level] || 0) + 1 }), {})
  return { at: new Date(nowMs).toISOString(), weights, counts, items }
}

/**
 * Reescribe los eventos de cada fragmento asignado como del camión identificado.
 * @param {object[]} events
 * @param {{ fragmentKey: string, assignedPlate: string|null, assignedJourneyUid: string|null, readPlate: string }[]} items
 */
export function applyIdentifications(events, items) {
  const assigned = items.filter((it) => it.assignedPlate)
  const byKey = new Map(assigned.map((it) => [it.fragmentKey, it]))
  const byRenamed = new Map(assigned.filter((it) => it.renameJourneyUid).map((it) => [it.renameJourneyUid, it]))
  if (!byKey.size) return events
  return events.map((e) => {
    const t = getEventLiveInstantMs(e)
    const renamed = byRenamed.get(String(e.journeyUid ?? '').trim())
    if (renamed) {
      return { ...e, normalizedPlate: renamed.assignedPlate, truckPlate: renamed.assignedPlate, identifiedFromPlate: plateOf(e), identificationLevel: renamed.level }
    }
    const it = byKey.get(journeyKeyOf(e, t))
    if (!it) return e
    return {
      ...e,
      normalizedPlate: it.assignedPlate,
      truckPlate: it.assignedPlate,
      journeyUid: it.assignedJourneyUid || e.journeyUid,
      identifiedFromPlate: it.readPlate,
      identificationLevel: it.level,
    }
  })
}

/**
 * Conteo rodante de circuitos por journey en las últimas 24 h.
 * @param {Map<string, { code: string, t: number }>} store
 */
export function updateRecentCircuits(store, events, nowMs, catalog) {
  const weights = circuitWeights({}, historicalPrior(), catalog.map((c) => c.code))
  for (const j of buildJourneys(events, nowMs)) {
    if (!isValidPlate(j.plate) || !ENTRY_NODES.has(j.rows[0].logical)) continue
    const seen = collapse(j.rows.map((r) => r.logical))
    if (seen.length < 2) continue
    const best = bestCircuit(seen, catalog, weights)
    if (best && best.p >= 0.5) store.set(j.key, { code: best.code, t: j.rows[0].t })
  }
  for (const [k, v] of store) if (nowMs - v.t > DAY_MS) store.delete(k)
  /** @type {Record<string, number>} */
  const counts = {}
  for (const v of store.values()) counts[v.code] = (counts[v.code] || 0) + 1
  return counts
}

/**
 * Últimas capturas de cámara con su identificación (feed de actividad del home).
 * @param {object[]} events eventos crudos del buffer
 * @param {{ items: object[] }} identification resultado de identifyFragments
 * @param {number} nowMs
 * @param {number} limit
 */
export function recentCaptures(events, identification, nowMs, limit = 60) {
  const byKey = new Map((identification?.items || []).map((it) => [it.fragmentKey, it]))
  const rows = []
  for (const e of events || []) {
    if (e?.inferred || e?.manualCorrection) continue
    const t = getEventLiveInstantMs(e)
    if (!Number.isFinite(t) || t > nowMs) continue
    const device = String(e.deviceCode ?? '').trim()
    const sectorCode = resolveCanonicalSectorForLiveFeed(e.sectorCode, device)
    const logical = sectorToLogical(sectorCode)
    const plate = plateOf(e)
    const it = byKey.get(journeyKeyOf(e, t)) || null
    rows.push({
      at: new Date(t).toISOString(),
      t,
      /** Hora tal como la registra la cámara (reloj del sensor, sin corregir): sirve para buscarla en DSS. */
      cameraTime: String(e.occurredAt ?? '').match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ?? null,
      cameraAt: String(e.occurredAt ?? '') || null,
      deviceCode: device,
      node: logical,
      nodeLabel: logical ? logicalLabel(logical) : sectorCode || device,
      readPlate: plate || 'SIN_PATENTE',
      validFormat: isValidPlate(plate),
      level: it ? it.level : isValidPlate(plate) ? 'leida' : 'pendiente',
      identifiedPlate: it?.assignedPlate ?? (isValidPlate(plate) ? plate : null),
      fragmentKey: it?.fragmentKey ?? null,
      candidates: it ? it.candidates.slice(0, 3) : [],
    })
  }
  rows.sort((a, b) => b.t - a.t)
  return rows.slice(0, limit).map(({ t, ...r }) => r)
}

/*
 * Lecturas anteriores perdidas de un camión (caso inverso a los fragmentos): el camión se lee bien
 * desde un punto intermedio (ej. Playa 3) y sus pasos previos quedaron bajo otra patente mal leída,
 * como un viaje propio. Se buscan viajes que terminan antes de la primera lectura buena, cuyos nodos
 * encajan ANTES en algún circuito, y se ordenan por parecido de patente + circuito + cercanía.
 */
const PREDECESSOR_SLACK_MS = 10 * 60 * 1000
const MIN_PREDECESSOR_SIMILARITY = 0.5

/**
 * @param {object[]} events historia cruda (sin identificaciones aplicadas)
 * @param {number} nowMs
 * @param {string} plate camión bien leído
 * @param {{ catalog: { code: string, sequences: string[][] }[], recentCounts?: Record<string, number>, otherSiteEvents?: object[], linkedKeys?: string[], windowMs?: number }} ctx
 */
export function findPredecessors(events, nowMs, plate, ctx) {
  const windowMs = ctx.windowMs ?? 6 * 60 * 60 * 1000
  const journeys = buildJourneys(events, nowMs)
  const others = (ctx.otherSiteEvents?.length ? buildJourneys(ctx.otherSiteEvents, nowMs) : []).map((j) => ({ ...j, otherSite: true }))
  const all = [...journeys, ...others]
  // El viaje actual del camión es el último de su patente; la nube a veces parte un recorrido en dos
  // viajes (BXN336 07/10: Ingreso 06:50 en un viaje y Playa 3 en otro), así que los viajes anteriores
  // de la misma patente también son candidatos.
  // El viaje actual es de ESTA planta; los de la otra planta con la misma patente son su recorrido allá (R7, transiles).
  const byLast = (a, b) => b.rows[b.rows.length - 1].t - a.rows[a.rows.length - 1].t
  const mine = journeys.filter((j) => j.plate === plate).sort(byLast)
  const otherMine = others.filter((j) => j.plate === plate).sort(byLast)
  if (!mine.length) return { plate, firstAt: null, firstNode: null, firstNodeLabel: null, startsAtEntry: false, windowMs, candidates: [], previousTrips: [], otherPlantTrips: [] }
  const target = mine[0]
  const rows = target.rows
  const first = rows[0]
  const mineSeq = collapse(rows.map((r) => r.logical))
  const weights = circuitWeights(ctx.recentCounts || {}, historicalPrior(), ctx.catalog.map((c) => c.code))
  const linked = new Set(ctx.linkedKeys || [])
  const candidates = []
  for (const j of all) {
    if (j.key === target.key || linked.has(j.key)) continue
    // Mismo camión en la otra planta: no es una lectura perdida, va en otherPlantTrips.
    if (j.otherSite && j.plate === plate) continue
    // Si el viaje siguió leyéndose después de la primera lectura buena, es otro camión.
    if (j.rows.some((r) => r.t > first.t + PREDECESSOR_SLACK_MS)) continue
    const before = j.rows.filter((r) => r.t <= first.t + PREDECESSOR_SLACK_MS && first.t - r.t <= windowMs)
    if (!before.length) continue
    const fit = bestCircuit(collapse([...before.map((r) => r.logical), ...mineSeq]), ctx.catalog, weights)
    if (!fit) continue
    const similarity = j.plate === plate ? 1 : plateSimilarity(j.plate, plate)
    // Patente legible pero poco parecida: es otro camión. Las ilegibles quedan (pueden ser él).
    if (similarity < MIN_PREDECESSOR_SIMILARITY && isValidPlate(j.plate)) continue
    // Ilegibles: solo si conservan algo de la patente (o no se leyó nada); un «CAT» de una pala no es candidato.
    if (!isValidPlate(j.plate) && j.plate && j.plate.length >= MIN_READ_LENGTH && similarity < 0.35) continue
    const gapMs = Math.max(0, first.t - before[before.length - 1].t)
    const score = 0.6 * similarity + 0.3 * fit.p + 0.1 * (1 - gapMs / windowMs)
    candidates.push({
      journeyKey: j.key,
      journeyUid: j.journeyUid,
      readPlate: j.plate || 'SIN_PATENTE',
      samePlate: j.plate === plate,
      validFormat: isValidPlate(j.plate),
      otherSite: Boolean(j.otherSite),
      similarity: Math.round(similarity * 1000) / 1000,
      circuit: fit.code,
      circuitProbability: Math.round(fit.p * 1000) / 1000,
      gapMin: Math.round(gapMs / 60000),
      score: Math.round(score * 1000) / 1000,
      reads: before.map((r) => ({ at: new Date(r.t).toISOString(), node: r.logical, nodeLabel: logicalLabel(r.logical), device: r.device })),
    })
  }
  candidates.sort((a, b) => b.score - a.score)
  // Viajes anteriores de la misma patente (otra vuelta o recorrido cerrado): se muestran como contexto.
  const previousTrips = mine
    .filter((j) => j.key !== target.key && j.rows[0].t < first.t && first.t - j.rows[0].t <= windowMs)
    .map((j) => ({
      journeyKey: j.key,
      startAt: new Date(j.rows[0].t).toISOString(),
      endAt: new Date(j.rows[j.rows.length - 1].t).toISOString(),
      gapMin: Math.round(Math.max(0, first.t - j.rows[j.rows.length - 1].t) / 60000),
      reads: j.rows.map((r) => ({ at: new Date(r.t).toISOString(), node: r.logical, nodeLabel: logicalLabel(r.logical), device: r.device })),
    }))
  // Recorrido de la misma patente en la otra planta, en la ventana previa (y hasta ahora, por si va y vuelve).
  const otherPlantTrips = otherMine
    .filter((j) => first.t - j.rows[0].t <= windowMs)
    .map((j) => ({
      journeyKey: j.key,
      startAt: new Date(j.rows[0].t).toISOString(),
      endAt: new Date(j.rows[j.rows.length - 1].t).toISOString(),
      gapMin: Math.round((first.t - j.rows[j.rows.length - 1].t) / 60000),
      reads: j.rows.map((r) => ({ at: new Date(r.t).toISOString(), node: r.logical, nodeLabel: logicalLabel(r.logical), device: r.device })),
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  return {
    previousTrips,
    otherPlantTrips,
    plate,
    firstAt: new Date(first.t).toISOString(),
    firstNode: first.logical,
    firstNodeLabel: logicalLabel(first.logical),
    startsAtEntry: ENTRY_NODES.has(first.logical),
    targetJourneyUid: target.journeyUid,
    windowMs,
    candidates: candidates.slice(0, 15),
  }
}

/**
 * Paso deducido (doc «algoritmo explicado»: cámara / corregido / deducido): un nodo sin lectura entre dos
 * lecturas del camión, por el que pasan TODOS (≥ minProbability del peso) los circuitos compatibles con lo
 * que leyó. Ej. Preingreso → Balanza sin Calada leída: Calada queda deducida.
 * @param {string[]} seen secuencia lógica colapsada de lecturas (una planta)
 * @param {{ code: string, sequences: string[][] }[]} catalog
 * @returns {{ after: string, before: string, node: string, probability: number }[]}
 */
export function deduceSkippedSteps(seen, catalog, { weights = circuitWeights({}, historicalPrior(), catalog.map((c) => c.code)), minProbability = DEDUCED_MIN_PROBABILITY } = {}) {
  const h = seen.filter((l) => l && l !== 'ESPERA')
  if (h.length < 2) return []
  /** Por par (i, i+1): peso de cada nodo intermedio y peso total de los circuitos compatibles. */
  const between = h.slice(1).map(() => new Map())
  let total = 0
  for (const entry of catalog) {
    const fits = []
    for (const s of entry.sequences) {
      // Posición de cada lectura en el circuito (primera coincidencia en orden).
      const pos = []
      let j = 0
      for (const l of h) {
        while (j < s.length && s[j] !== l) j++
        if (j >= s.length) break
        pos.push(j++)
      }
      if (pos.length === h.length) fits.push([s, pos])
    }
    if (!fits.length) continue
    const w = (weights[entry.code] ?? 0.05) / fits.length
    for (const [s, pos] of fits) {
      total += w
      for (let i = 0; i < pos.length - 1; i++) for (const n of new Set(s.slice(pos[i] + 1, pos[i + 1]))) between[i].set(n, (between[i].get(n) ?? 0) + w)
    }
  }
  if (!total) return []
  const out = []
  between.forEach((m, i) => {
    for (const [node, w] of m) if (w / total >= minProbability && !h.includes(node)) out.push({ after: h[i], before: h[i + 1], node, probability: Math.round((w / total) * 1000) / 1000 })
  })
  return out
}
export const DEDUCED_MIN_PROBABILITY = 0.95

/**
 * Secuencia lógica con los pasos deducidos intercalados (para elegir circuito y próximo punto: si Preingreso
 * quedó deducido entre Ingreso y Calada, el próximo no es Preingreso). Apagar con PLANT_DEDUCED_STEPS=0.
 * @param {string[]} logicalSeq
 */
export function withDeducedSequence(logicalSeq, catalog = nodeModelCatalog()) {
  if (process.env.PLANT_DEDUCED_STEPS === '0') return logicalSeq
  const seq = collapse((logicalSeq || []).filter((l) => l && l !== 'ESPERA'))
  const deduced = deduceSkippedSteps(seq, catalog)
  if (!deduced.length) return logicalSeq
  const out = []
  seq.forEach((l, i) => {
    out.push(l)
    for (const d of deduced) if (d.after === l && d.before === seq[i + 1]) out.push(d.node)
  })
  return out
}

/*
 * Búsqueda hacia atrás automática (doc «algoritmo explicado»): un camión que aparece a mitad de circuito
 * (Calada, Balanza…) sin lectura de entrada, y que la balanza (SGC/movimientos) tiene en planta, se une
 * a la lectura de entrada suelta (Preingreso/Ingreso) que no se asignó a nadie y cae a la hora de su alta
 * en balanza. Compiten por cada lectura suelta todos los camiones que la balanza da de alta a esa hora
 * (también los que tienen su propia lectura de entrada: la suelta puede ser una doble lectura suya) y
 * «nuevo» (auto, servicio o camión que el SGC todavía no muestra). Decide la cuenta (scoreWithNodeModel).
 * Solo Ricardone: en San Lorenzo el ingreso del movimiento no es la llegada a la planta (R7, transiles).
 */
/**
 * Minutos de la lectura de entrada respecto del alta en balanza (replay 06–09/10, Ricardone):
 * Preingreso S1 p25–p75 = −1…0 min; Ingreso S0 p05–p95 = −16…−2 min.
 */
export const BACKWARD_ENTRY_WINDOW_MIN = { S1: [-6, 2], S0: [-17, 0] }
// Sigue en 95 %: une lecturas vacías solo por la hora del alta, no hay patente que reconocer.
export const BACKWARD_AUTO_PROBABILITY = 0.95
/** «Nuevo» en Preingreso: lecturas de entrada que no son de ningún camión de la balanza (calibrado en el replay). */
export const BACKWARD_NEW_PRIOR = 0.3

/**
 * @param {object[]} events historia cruda de la planta (sin identificaciones aplicadas)
 * @param {number} nowMs
 * @param {{ balanza: ReturnType<import('./balanzaRegistry.mjs').buildBalanzaRegistry>|null, site?: string, catalog?: object[], excludeKeys?: Iterable<string>, dismissed?: (plate: string, journeyKey: string) => boolean, options?: { window?: Record<string, [number, number]>, threshold?: number, newPrior?: number, lookbackMs?: number } }} ctx
 * @returns {{ journeyKey: string, journeyUid: string|null, plate: string, targetJourneyUid: string|null, readPlate: string, node: string, at: string, probability: number, auto: boolean, reason: string, rivals: { plate: string, probability: number }[] }[]}
 */
export function autoPredecessorLinks(events, nowMs, ctx) {
  const bz = ctx.balanza
  if (!bz || (ctx.site && ctx.site !== 'ricardone')) return []
  const win = ctx.options?.window ?? BACKWARD_ENTRY_WINDOW_MIN
  const threshold = ctx.options?.threshold ?? BACKWARD_AUTO_PROBABILITY
  const newPrior = ctx.options?.newPrior ?? BACKWARD_NEW_PRIOR
  const lookbackMs = ctx.options?.lookbackMs ?? DAY_MS
  const exclude = new Set(ctx.excludeKeys ?? [])
  const journeys = buildJourneys(events, nowMs)
  const isEntry = (l) => Object.hasOwn(win, l)
  const inWindow = (r, ingresoMs) => {
    const [lo, hi] = win[r.logical] ?? [0, -1]
    const d = (r.t - ingresoMs) / 60000
    return d >= lo && d <= hi
  }
  // Lecturas de entrada sueltas: viajes que solo tienen lecturas de entrada, sin asignar ni vincular, y cuya
  // patente no es de otro camión que la balanza tiene en planta.
  const orphans = journeys.filter((j) =>
    !exclude.has(j.key) && j.rows.every((r) => isEntry(r.logical)) && nowMs - j.rows[0].t <= lookbackMs &&
    !(isValidPlate(j.plate) && (bz.truckAt(j.plate, j.rows[0].t) || bz.isTrailer(j.plate))))
  if (!orphans.length) return []
  // Camiones que necesitan su entrada: patente válida, primera lectura a mitad de circuito, en balanza, y
  // sin ninguna lectura de entrada propia (otro viaje de la misma patente) cerca de su alta.
  /** @type {Map<string, { plate: string, key: string, journeyUid: string|null, first: { t: number, logical: string }, ingresoMs: number }>} */
  const needing = new Map()
  for (const j of journeys) {
    if (!isValidPlate(j.plate) || isEntry(j.rows[0].logical) || exclude.has(j.key)) continue
    if (nowMs - j.rows[0].t > lookbackMs) continue
    const v = bz.truckAt(j.plate, j.rows[0].t)
    if (!v || v.ingresoMs > j.rows[0].t) continue
    const ownEntry = journeys.some((o) => o.plate === j.plate && o.rows.some((r) => isEntry(r.logical) && Math.abs(r.t - v.ingresoMs) <= 60 * 60_000))
    if (ownEntry) continue
    const prev = needing.get(j.plate)
    if (!prev || j.rows[0].t < prev.first.t) needing.set(j.plate, { plate: j.plate, key: j.key, journeyUid: j.journeyUid, first: j.rows[0], ingresoMs: v.ingresoMs })
  }
  if (!needing.size) return []
  // Altas de balanza a la hora de cada lectura suelta: todos los camiones de la balanza que entraron ahí.
  const entryPlates = new Map()
  for (const j of journeys) if (isValidPlate(j.plate)) entryPlates.set(j.plate, true)
  for (const n of needing.values()) entryPlates.set(n.plate, true)

  const out = []
  for (const o of orphans) {
    const at = o.rows[0]
    // Candidatos: patentes leídas en la planta (o que necesitan entrada) con alta en balanza que encaja con la lectura.
    const cands = []
    for (const plate of entryPlates.keys()) {
      const v = bz.truckAt(plate, at.t)
      if (!v || !o.rows.some((r) => inWindow(r, v.ingresoMs))) continue
      const need = needing.get(plate)
      // Un camión que necesita entrada tiene que haberse leído después de esta lectura.
      if (need && need.first.t < o.rows[o.rows.length - 1].t) continue
      cands.push({ plate, need: need ?? null, sameNode: false, nextProbability: 1, nodeProbability: 1, onTime: true })
    }
    if (!cands.some((c) => c.need)) continue
    const valid = isValidPlate(o.plate)
    const similar = cands.some((c) => plateSimilarity(o.plate, c.plate) >= MIN_SIMILARITY)
    const nm = scoreWithNodeModel(
      { readPlate: o.plate, validFormat: valid, node: at.logical, at: new Date(at.t).toISOString(), expectedAtNode: cands.length },
      cands,
      { ignorePlate: !o.plate || (!valid && !similar), pInicio: newPrior }
    )
    const ranked = nm.candidates.map((r, i) => ({ ...r, c: cands[i] })).sort((a, b) => b.probability - a.probability)
    const top = ranked[0]
    if (!top?.c.need) continue
    out.push({
      journeyKey: o.key,
      journeyUid: o.journeyUid,
      plate: top.plate,
      targetJourneyUid: top.c.need.journeyUid,
      readPlate: o.plate || 'SIN_PATENTE',
      node: at.logical,
      at: new Date(at.t).toISOString(),
      probability: Math.round(top.probability * 1000) / 1000,
      auto: top.probability >= threshold,
      reason: `${top.plate} apareció en ${logicalLabel(top.c.need.first.logical)} sin lectura de entrada; la balanza lo da de alta ${Math.round((at.t - top.c.need.ingresoMs) / 60000)} min respecto de esta lectura de ${logicalLabel(at.logical)} (cuenta ${Math.round(top.probability * 100)} %)`,
      rivals: ranked.slice(1, 3).map((r) => ({ plate: r.plate, probability: Math.round(r.probability * 1000) / 1000 })),
    })
  }
  // Una lectura por camión: si dos sueltas apuntan al mismo, ninguna se aplica sola (puede ser frente/trasera
  // de él, pero también de otro que el SGC todavía no muestra).
  const perPlate = new Map()
  for (const l of out) perPlate.set(l.plate, (perPlate.get(l.plate) ?? 0) + 1)
  for (const l of out) if (perPlate.get(l.plate) > 1 && !ctx.options?.allowMany) l.auto = false
  return out.filter((l) => !ctx.dismissed?.(l.plate, l.journeyKey))
}

/**
 * Aplica los vínculos confirmados por operaciones: los eventos del viaje mal leído pasan a ser del camión.
 * @param {object[]} events
 * @param {{ journeyKey: string, plate: string, journeyUid?: string|null, level?: string }[]} links
 */
export function applyLinks(events, links) {
  if (!links.length) return events
  const byKey = new Map(links.map((l) => [l.journeyKey, l]))
  return events.map((e) => {
    const l = byKey.get(journeyKeyOf(e, getEventLiveInstantMs(e)))
    if (!l) return e
    return { ...e, normalizedPlate: l.plate, truckPlate: l.plate, journeyUid: l.journeyUid || e.journeyUid, identifiedFromPlate: plateOf(e), identificationLevel: l.level ?? 'confirmado' }
  })
}
