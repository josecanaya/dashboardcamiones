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
import { arrivalWeight } from './nodeModelScore.mjs'
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
  const fragments = journeys.filter((j) => {
    if (decided(j)) return true
    const first = j.rows[0].logical
    if (!isValidPlate(j.plate)) return true
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
      const pNext = sameNode ? 1 : exp.next[head.logical] || 0
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
    if (twin && !valid) {
      // Lectura ilegible y el camión leído bien en el mismo nodo a segundos/minutos: es él.
      level = 'casi_seguro'
      reason = twinText
      chosen = twin
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
    } else if (verdict && best && verdict.plate === best.plate && evidenceEligible) {
      // Patente + recorrido + color/marca/tipo del DSS por encima del umbral calibrado.
      level = 'casi_seguro'
      chosen = best
      reason = `patente, recorrido y color/marca/tipo coinciden con ${chosen.plate} (${Math.round(verdict.probability * 100)}%)`
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
    } else {
      // Patente válida sin parecido con nadie: camión real al que no se le leyó el ingreso.
      continue
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
      evidenceEligible: evidenceEligible && level !== 'casi_seguro' && !decision,
      candidates: candidates.slice(0, opt.maxCandidates ?? 5).map(({ score, ...c }) => ({ ...c, score: Math.round(score * 100) / 100 })),
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
 * Aplica los vínculos confirmados por operaciones: los eventos del viaje mal leído pasan a ser del camión.
 * @param {object[]} events
 * @param {{ journeyKey: string, plate: string, journeyUid?: string|null }[]} links
 */
export function applyLinks(events, links) {
  if (!links.length) return events
  const byKey = new Map(links.map((l) => [l.journeyKey, l]))
  return events.map((e) => {
    const l = byKey.get(journeyKeyOf(e, getEventLiveInstantMs(e)))
    if (!l) return e
    return { ...e, normalizedPlate: l.plate, truckPlate: l.plate, journeyUid: l.journeyUid || e.journeyUid, identifiedFromPlate: plateOf(e), identificationLevel: 'confirmado' }
  })
}
