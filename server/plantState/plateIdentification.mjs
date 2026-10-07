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
  const weights = circuitWeights(ctx.recentCounts || {}, historicalPrior(), ctx.catalog.map((c) => c.code))
  const decisions = ctx.decisions || {}

  const parents = [...journeys, ...otherJourneys].filter((j) => isValidPlate(j.plate))
  const fragments = journeys.filter((j) => {
    const first = j.rows[0].logical
    if (!isValidPlate(j.plate)) return true
    // Patente válida que arranca a mitad de circuito: puede ser una lectura cambiada (KMO254 por KWO254).
    // Si la misma patente se leyó en dos o más nodos distintos, es un camión real al que no se le leyó el ingreso.
    if (new Set(j.rows.map((r) => r.logical)).size > 1) return false
    return !ENTRY_NODES.has(first)
  })

  /** @type {Map<string, ReturnType<typeof expectedNodes>>} */
  const memo = new Map()
  const expectedFor = (seen) => {
    const k = seen.join('>')
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
  const recentReadsOf = (p) =>
    (readsByPlate.get(p.plate) ?? [])
      .filter((r) => r.t <= nowMs)
      .sort((a, b) => b.t - a.t)
      .slice(0, 10)
      .map((r) => ({ at: new Date(r.t).toISOString(), node: r.logical, nodeLabel: logicalLabel(r.logical), device: r.device, otherSite: r.otherSite }))
  /** Circuito del candidato SI esta lectura es suya: los nodos que ya hizo + el de la lectura. */
  const circuitIfMatch = (logicals) => {
    const e = expectedFor(collapse(logicals))
    const [code, prob] = Object.entries(e.circuit)[0] ?? []
    return { circuit: code ?? null, circuitProbability: Math.round((prob ?? 0) * 1000) / 1000 }
  }

  /** @type {object[]} */
  const items = []
  for (const f of fragments) {
    const head = f.rows[0]
    const candidates = []
    for (const p of parents) {
      if (p.key === f.key || p.plate === f.plate) continue
      const before = p.rows.filter((r) => r.t <= head.t)
      if (!before.length) {
        // El camión todavía no se había leído bien: su primera lectura buena llega DESPUÉS.
        // Ej. OQT40 (Ingreso SL 11:12) → OQT140 leído bien recién en Carga OSL. Solo por patente
        // y si el nodo de la lectura mala puede venir antes que el primero bien leído.
        const first = p.rows[0]
        if (first.t - head.t > MAX_AFTER_MS) continue
        const sim = plateSimilarity(f.plate, p.plate)
        if (sim < MIN_SIMILARITY) continue
        const ahead = first.logical === head.logical ? 1 : expectedFor([head.logical]).reachable[first.logical] || 0
        candidates.push({
          plate: p.plate,
          journeyKey: p.key,
          journeyUid: p.journeyUid,
          similarity: Math.round(sim * 1000) / 1000,
          nodeProbability: Math.round(ahead * 1000) / 1000,
          nextProbability: 0,
          expectedNext: null,
          ...circuitIfMatch([head.logical, ...p.rows.map((r) => r.logical)]),
          recentReads: recentReadsOf(p),
          lastNode: first.logical,
          lastNodeLabel: logicalLabel(first.logical),
          lastSeenAt: new Date(first.t).toISOString(),
          /** Lectura buena del candidato para mostrar su foto al lado (cámara + hora del feed). */
          photoDevice: first.device,
          photoAt: new Date(first.t).toISOString(),
          where: p.otherSite ? 'otra_planta' : 'leido_despues',
          seenAfter: true,
          sameNode: false,
          reads: p.rows.length,
          score: 4 * sim + Math.log(ahead + 0.01),
        })
        continue
      }
      if (head.t - before[before.length - 1].t > MAX_GAP_MS) continue
      const lastSeenRow = before[before.length - 1]
      if (EXIT_NODES.has(lastSeenRow.logical) && head.t - lastSeenRow.t > EXIT_GRACE_MS) continue
      const sim = plateSimilarity(f.plate, p.plate)
      const seen = collapse(before.map((r) => r.logical))
      const exp = expectedFor(seen)
      // Otra cámara del mismo nodo donde ya está el camión (frente/trasera, doble lectura): es esperado.
      const lastBefore = before[before.length - 1]
      const sameNode = lastBefore.logical === head.logical && head.t - lastBefore.t <= SAME_NODE_MS
      const pNext = sameNode ? 1 : exp.next[head.logical] || 0
      const pReach = exp.reachable[head.logical] || 0
      if (sim < MIN_SIMILARITY && pNext < 0.5) continue
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
        recentReads: recentReadsOf(p),
        lastNode: seen[seen.length - 1] ?? null,
        lastNodeLabel: seen.length ? logicalLabel(seen[seen.length - 1]) : null,
        lastSeenAt: new Date(lastBefore.t).toISOString(),
        photoDevice: lastBefore.device,
        photoAt: new Date(lastBefore.t).toISOString(),
        where: p.otherSite ? 'otra_planta' : 'en_planta',
        sameNode,
        reads: p.rows.length,
        score: 4 * sim + Math.log(Math.max(pNext, pReach) + 0.01),
      })
    }
    // Primero los que se parecen por patente; dentro de cada grupo, por puntaje.
    candidates.sort((a, b) => (b.similarity >= MIN_SIMILARITY) - (a.similarity >= MIN_SIMILARITY) || b.score - a.score)
    // Un mismo camión puede tener dos journeys en el buffer: queda el mejor.
    const seenPlates = new Set()
    const unique = candidates.filter((c) => (seenPlates.has(c.plate) ? false : seenPlates.add(c.plate)))
    candidates.length = 0
    candidates.push(...unique)
    const plateMatches = candidates.filter((c) => c.similarity >= MIN_SIMILARITY)
    const best = plateMatches[0] || null
    const rival = plateMatches[1] || null

    let level
    let reason
    if (best && isValidPlate(f.plate)) {
      // La lectura es una patente válida: puede ser otro camión real (06/10: KGX035, AF114VE,
      // FFR877, AB912RO estaban bien leídas y se habían unido solas a KGL025, AF211ER…). Nunca se
      // aplica sola: decide operaciones.
      level = 'provisorio'
      reason = `patente válida parecida a ${best.plate}: elegir la correcta`
    } else if (best && best.reads >= 2 && best.nodeProbability >= MIN_NODE_PROBABILITY && (!rival || best.similarity - rival.similarity >= RIVAL_MARGIN || rival.nodeProbability < MIN_NODE_PROBABILITY)) {
      level = 'casi_seguro'
      reason = 'patente reparable y nodo esperado de su circuito'
    } else if (best) {
      level = 'provisorio'
      reason = best.nodeProbability < MIN_NODE_PROBABILITY ? 'patente parecida pero el nodo no es esperado' : 'dos camiones con patente parecida'
    } else if (!isValidPlate(f.plate)) {
      level = 'pendiente'
      reason = candidates.length ? 'lectura ilegible: varios camiones esperados en ese nodo' : 'lectura ilegible sin candidato'
    } else {
      // Patente válida sin parecido con nadie: camión real al que no se le leyó el ingreso.
      continue
    }

    const decision = decisions[f.key] || null
    let assignedPlate = level === 'casi_seguro' ? best.plate : null
    let assignedJourneyUid = level === 'casi_seguro' ? best.journeyUid : null
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
      level,
      reason,
      assignedPlate,
      assignedJourneyUid,
      renameJourneyUid,
      candidates: candidates.slice(0, 5).map(({ score, ...c }) => ({ ...c, score: Math.round(score * 100) / 100 })),
      decision,
    })
  }

  // Decisiones cruzadas (TGL378 → TGT378 y TGT378 → TGL378, 07/10): se queda la más reciente y la
  // otra vuelve a revisión, para no renombrar dos viajes uno con la patente del otro.
  const byRead = new Map(items.filter((it) => it.assignedPlate).map((it) => [it.readPlate, it]))
  for (const a of items) {
    const b = a.assignedPlate ? byRead.get(a.assignedPlate) : null
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
