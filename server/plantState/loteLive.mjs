/**
 * Reconocedor en vivo por lote (loteCore.mjs): en vez de comparar cada lectura suelta contra todos los
 * camiones en planta, el lote de ingreso es el universo conocido y avanza nodo por nodo.
 *
 *  - Lote = camiones en planta según la balanza (SGC + movimientos, balanzaRegistry.mjs) + los que tienen
 *    lectura de ingreso y todavía no figuran en la balanza (la vista SGC llega con 2 a 23 h de demora) si
 *    son camiones conocidos: carta de porte vigente o base de vehículos sin carta (`conocido`, 05/11).
 *  - Circuito: el más frecuente para esa planta y producto en las ventanas guardadas anteriores (el Excel
 *    ya no está en vivo); las cámaras lo corrigen a medida que el camión se lee (fitCircuitsToCameras).
 *  - Capturas = feed + lecturas que solo llegan como alerta (alertReads.mjs) + color/marca/tipo del DSS
 *    cuando ya se consultaron (bajo demanda, dssPhotoLookup → setCaptureAttrs).
 *
 * Una captura reconstruida con P ≥ 0,6 se aplica sola (casi_seguro, regla «lote»); los pasos sin captura
 * entre dos identificados quedan «deducidos» en el recorrido del camión (no son lecturas).
 * Apagar con IDENTIFICATION_LOTE=0. Medición: scripts/cruce-sistema-truckflow/replay-algoritmo.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCESOS, LOTE_THETA, finalSteps, loteModel, reconstructLote } from './loteCore.mjs'
import { GHOST_SIMILARITY, isValidPlate, journeyKeyOf, plateSimilarity } from './plateIdentification.mjs'
import { getEventLiveInstantMs } from './liveEventTime.mjs'
import { resolveCanonicalSectorForLiveFeed } from './sectorProfiles.mjs'
import { logicalLabel, sectorToLogical } from './circuitPrefix.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
/** Capturas y camiones que entran al lote: las últimas 36 h (una visita dura hasta 12 h). */
export const LOTE_LOOKBACK_MS = 36 * 3600_000
const VISIT_MAX_MS = 12 * 3600_000
const PLANTAS = new Set(['RICARDONE', 'TERMINAL_EMBARQUE'])
const FAKE = /^(X+|P+|T+)$/
const ENTRY = new Set(['ricardone:Ingreso', 'ricardone:Pre ingreso', 'san_lorenzo:Ingreso'])
/** Circuito de partida de un camión que solo tiene lectura de ingreso (el 77 % de los viajes es R7). */
const ENTRY_CIRCUIT = { ricardone: 'R7', san_lorenzo: 'SL1' }
/** Reglas que deciden con pruebas propias (balanza, mismo nodo, operaciones): el lote no las pisa. */
/** Parecido lectura ↔ patente que ya identifica al camión (una letra de menos o cambiada). */
const READ_MATCH = 0.85
/** Por debajo de este parecido, una lectura con contenido no es del camión que propone el lote. */
const UNLIKE_READ = 0.3
/** balanza_unica: 66 de 66 bien en el replay 12–18/10; el lote la pisaba (GFP699). */
const STRONG_RULES = new Set(['balanza_unica', 'doble_lectura','acoplado_balanza', 'leida_bien_balanza', 'doble_lectura_balanza', 'busqueda_atras', 'operaciones'])

const plateOf = (e) => String(e?.normalizedPlate || e?.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const localMs = (s) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const dayOf = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const siteOfNode = (node) => (String(node).startsWith('san_lorenzo:') ? 'san_lorenzo' : 'ricardone')

const _priors = new Map()
/**
 * Circuito más frecuente por planta + producto (+ tipo de movimiento) en las 4 ventanas
 * semanales guardadas que terminan antes de `day` (en un replay no se mira la semana analizada).
 * '' = sin circuito con cámaras (productos varios, residuos…): no entra al lote.
 */
export function circuitPriors(day, root = ROOT) {
  if (_priors.has(day)) return _priors.get(day)
  const dir = path.join(root, 'runs', 'windows')
  const wins = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((w) => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(w) && w.slice(0, 10) !== w.slice(11) && w.slice(11) < day && fs.existsSync(path.join(dir, w, 'tables/excel_operations_with_truckflow.json'))).sort((a, b) => b.slice(11).localeCompare(a.slice(11))).slice(0, 4)
    : []
  const count = {}
  const bump = (k, c) => ((count[k] ??= {})[c] = (count[k][c] ?? 0) + 1)
  for (const w of wins) {
    let rows = []
    try { rows = JSON.parse(fs.readFileSync(path.join(dir, w, 'tables/excel_operations_with_truckflow.json'), 'utf8')).rows ?? [] } catch { rows = [] }
    for (const r of rows) {
      const prod = String(r.product_normalized ?? '').toUpperCase()
      if (!PLANTAS.has(r.planta_normalized) || !prod) continue
      const c = r.resolved_executive_circuit_code ?? ''
      bump(`${r.planta_normalized}|${prod}|${r.movement_type}`, c)
      bump(`${r.planta_normalized}|${prod}`, c)
    }
  }
  const best = Object.fromEntries(Object.entries(count).map(([k, o]) => [k, Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]]))
  const prodOf = (v) => String(v.product ?? '').toUpperCase()
  const out = { windows: wins, circuitOf: (v) => best[`${v.planta}|${prodOf(v)}|${v.movementType}`] ?? best[`${v.planta}|${prodOf(v)}`] ?? null }
  _priors.set(day, out)
  if (_priors.size > 20) _priors.delete(_priors.keys().next().value)
  return out
}

/**
 * Color/marca/tipo de un export del DSS (data/dss-export/<desde>_<dd hasta>/capturas.csv) para replays:
 * el DSS en vivo los da bajo demanda; con el export se mide el techo (todas las capturas con atributos).
 * @returns {((device: string, t: number, plate: string) => object|null)|null}
 */
export function dssExportAttrs(fromDay, toDay, root = ROOT) {
  const base = path.join(root, 'data', 'dss-export')
  if (!fs.existsSync(base)) return null
  const d = fs.readdirSync(base).find((x) => /^\d{4}-\d{2}-\d{2}_\d{2}$/.test(x) && x.slice(0, 10) <= fromDay && `${x.slice(0, 8)}${x.slice(11)}` >= toDay && fs.existsSync(path.join(base, x, 'capturas.csv')))
  if (!d) return null
  const lines = fs.readFileSync(path.join(base, d, 'capturas.csv'), 'utf8').trim().split(/\r?\n/)
  const head = lines[0].split(',')
  const byDev = new Map()
  for (const l of lines.slice(1)) {
    const v = l.split(','), r = Object.fromEntries(head.map((h, i) => [h, v[i]]))
    const t = Date.parse(`${r.hora_camara.replace(' ', 'T')}-03:00`) + 240_000
    const k = r.camara.toLowerCase()
    if (!byDev.has(k)) byDev.set(k, [])
    byDev.get(k).push({ t, plate: String(r.patente ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), vehicleColor: r.color, vehicleBrand: r.marca, vehicleCategory: r.tipo })
  }
  for (const l of byDev.values()) l.sort((a, b) => a.t - b.t)
  return captureAttrsLookup(byDev)
}

/** Búsqueda ±5 s por cámara (misma patente primero), la del export del DSS en lote.mjs. */
export function captureAttrsLookup(byDev) {
  return (device, t, plate) => {
    let best = null
    for (const r of byDev.get(String(device).toLowerCase()) ?? []) {
      if (r.t < t - 5000) continue
      if (r.t > t + 5000) break
      const s = (r.plate === plate ? 0 : 10_000) + Math.abs(r.t - t)
      if (!best || s < best.s) best = { ...r, s }
    }
    return best
  }
}

/** Capturas de la misma cámara a ≤ 5 s: un solo paso del camión. */
const SAME_PASS_MS = 5000
/**
 * Un paso llega como evento del feed y además como 1–2 alertas (INVALID_ROUTE, INVALID_JOURNEY_START),
 * muchas veces con patente vacía o distinta: alertReadEvents solo descarta las de la misma patente. En el
 * lote cada captura consume el paso pendiente de un camión, así que el mismo paso se queda con una sola
 * (la de mejor patente; a igual patente, la del feed) y las otras quedan con `samePassAs`.
 * Semana 12–18/10: ~1.600 capturas repetidas, 5 de las 8 asignaciones mal del lote.
 * @returns capturas que representan un paso cada una (orden por hora)
 */
export function samePassCaptures(caps) {
  const score = (c) => (isValidPlate(c.plate) ? 100 : 0) + c.plate.length * 2 + (c.ev?.fromAlert ? 0 : 1)
  /** cámara → paso abierto { last: hora de la última captura, list } */
  const open = new Map()
  const groups = []
  for (const c of caps) {
    const k = String(c.device).toLowerCase()
    const g = open.get(k)
    // Dos patentes válidas distintas son dos camiones aunque pasen juntos.
    const other = g?.list.some((x) => isValidPlate(x.plate) && isValidPlate(c.plate) && x.plate !== c.plate)
    if (g && c.t - g.last <= SAME_PASS_MS && !other) {
      g.list.push(c)
      g.last = c.t
      continue
    }
    const ng = { last: c.t, list: [c] }
    open.set(k, ng)
    groups.push(ng)
  }
  const out = []
  for (const g of groups) {
    const best = g.list.reduce((a, b) => (score(b) > score(a) ? b : a))
    for (const c of g.list) if (c !== best) c.samePassAs = best
    out.push(best)
  }
  return out.sort((a, b) => a.t - b.t)
}

/**
 * Arma el lote y recorre las capturas de las dos plantas.
 * @param {{ events: object[], nowMs: number, balanza: ReturnType<import('./balanzaRegistry.mjs').buildBalanzaRegistry>|null, attrsAt?: Function|null, conocido?: ((plate: string, t: number) => boolean)|null, theta?: number, root?: string }} p
 *   conocido: camión con carta de porte vigente o en la base sin carta (no los particulares: no hacen circuito).
 */
export function buildLiveLote({ events, nowMs, balanza, attrsAt = null, conocido = null, theta = LOTE_THETA, root = ROOT }) {
  const LM = loteModel()
  const from = nowMs - LOTE_LOOKBACK_MS
  const caps = []
  const seen = new Set()
  for (const e of events ?? []) {
    if (e?.inferred || e?.manualCorrection || (e?.eventCategory && e.eventCategory !== 'physical')) continue
    const dev = String(e.deviceCode ?? '').toLowerCase()
    const node = LM.frontNode.get(dev) ?? LM.rearNode.get(dev)
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t) || t > nowMs || t < from) continue
    const plate = plateOf(e)
    const id = `${e.id ?? e.journeyUid}|${dev}|${t}|${plate}`
    if (seen.has(id)) continue
    seen.add(id)
    // Sin consulta al DSS, los atributos que trajo la alerta de esa misma lectura (withAlertAttributes).
    const a = e.attributes
    const own = a ? { vehicleColor: a.color ?? null, vehicleBrand: a.brand ?? null, vehicleCategory: a.category ?? null } : null
    caps.push({ node, rear: !LM.frontNode.has(dev), device: e.deviceCode, t, plate, attrs: (attrsAt ? attrsAt(e.deviceCode, t, plate) : null) ?? own, key: journeyKeyOf(e, t), ev: e })
  }
  caps.sort((a, b) => a.t - b.t)
  const passes = samePassCaptures(caps)
  const front = passes.filter((c) => !c.rear)

  // ── Lote: visitas de la balanza (SGC y movimientos repiten la misma visita: una por patente cada 60 min) ──
  const priors = circuitPriors(dayOf(nowMs), root)
  const lote = []
  const visits = (balanza?.visits ?? []).filter((v) => isValidPlate(v.plate) && !FAKE.test(v.plate)).sort((a, b) => a.ingresoMs - b.ingresoMs)
  const ingresosOf = new Map()
  for (const v of visits) { if (!ingresosOf.has(v.plate)) ingresosOf.set(v.plate, []); ingresosOf.get(v.plate).push(v.ingresoMs) }
  for (const v of visits) {
    if (!PLANTAS.has(v.planta) || v.ingresoMs > nowMs || v.ingresoMs < from) continue
    const ing = Number.isFinite(v.salidaMs) ? Math.min(v.ingresoMs, v.salidaMs) : v.ingresoMs
    const dup = lote.find((m) => m.plate === v.plate && Math.abs(m.ing - ing) <= 60 * 60_000)
    if (dup) { if (!Number.isFinite(dup.sal) && Number.isFinite(v.salidaMs)) dup.sal = Math.max(v.ingresoMs, v.salidaMs); continue }
    const circuit = priors.circuitOf(v)
    const exp = circuit ? LM.expectedNodes(circuit) : []
    if (!exp.length) continue
    lote.push({ id: `${v.source}:${v.plate}:${ing}`, plate: v.plate, circuit, ing, sal: Number.isFinite(v.salidaMs) ? Math.max(v.ingresoMs, v.salidaMs) : NaN, exp, source: 'balanza' })
  }
  const setVisit = (m) => {
    // Camión que entró por su lectura de ingreso: el alta en balanza de la próxima hora es esta misma visita.
    const gap = (m.source === 'camara' ? 60 : 10) * 60_000
    const after = (ingresosOf.get(m.plate) ?? []).filter((t) => t > m.ing + gap).sort((a, b) => a - b)[0]
    m.vStart = m.ing - 20 * 60_000
    m.vEnd = Math.min(after != null ? after - 10 * 60_000 : Infinity, m.ing + VISIT_MAX_MS)
    m.inSample = true
  }
  lote.forEach(setVisit)

  // ── + camiones con lectura de ingreso que la balanza todavía no tiene ──
  const inLote = (plate, t) => lote.some((m) => m.plate === plate && t >= m.vStart && t <= m.vEnd)
  const nodesOf = new Map()
  for (const c of front) if (isValidPlate(c.plate)) { if (!nodesOf.has(c.plate)) nodesOf.set(c.plate, []); nodesOf.get(c.plate).push(c) }
  for (const c of front) {
    if (!ENTRY.has(c.node) || !isValidPlate(c.plate) || FAKE.test(c.plate) || inLote(c.plate, c.t)) continue
    // Lectura mala repetida (BOH961 por BDH961): no figura en la balanza y un camión parecido sí está en planta.
    const known = Boolean(balanza?.isKnown(c.plate)) || Boolean(conocido?.(c.plate, c.t))
    if (balanza && !known && balanza.platesAt(c.t).some((p) => p !== c.plate && plateSimilarity(c.plate, p) >= GHOST_SIMILARITY)) continue
    // Autos y camionetas: solo los accesos. Un camión vino alguna vez a la balanza o pasa por un punto interno.
    const internal = (nodesOf.get(c.plate) ?? []).some((x) => !ACCESOS.has(x.node) && x.t >= c.t && x.t <= c.t + VISIT_MAX_MS)
    if (!known && !internal) continue
    if (c.attrs && /sedan|suv|pickup|van|car\b|motor|mpv|hatchback/i.test(c.attrs.vehicleCategory ?? '') && !internal) continue
    const circuit = ENTRY_CIRCUIT[siteOfNode(c.node)]
    const m = { id: `camara:${c.plate}:${c.t}`, plate: c.plate, circuit, ing: c.t, sal: NaN, exp: LM.expectedNodes(circuit), source: 'camara' }
    setVisit(m)
    lote.push(m)
  }

  const known = { has: (p) => Boolean(balanza?.isKnown(p)) || Boolean(conocido?.(p, nowMs)) }
  const run = reconstructLote({ caps: passes, lote, known, theta, hideEvery: 0, start: from, end: nowMs, inDay: () => true, inOtrosDay: (t) => t >= nowMs - 24 * 3600_000, circuitNodes: LM.circuitNodes })
  // Las capturas repetidas del mismo paso comparten el veredicto de la que quedó.
  // Si el paso quedó leído bien, la repetida con otra patente es una lectura mala de ese mismo camión.
  for (const c of caps) {
    const p = c.samePassAs
    if (!p) continue
    c.lote = p.lote?.via === 'camara' && c.plate !== p.plate ? { ...p.lote, via: 'reconstruida', P: 1, rivales: [], samePass: true } : p.lote
  }
  const byKey = new Map()
  for (const c of caps) if (!c.rear) { if (!byKey.has(c.key)) byKey.set(c.key, []); byKey.get(c.key).push(c) }
  return { at: nowMs, theta, lote, caps, front, byKey, circuitosCambiados: run.circuitosCambiados, priorsFrom: priors.windows }
}

/** Journey del feed de un camión del lote (el de sus lecturas buenas en la visita). */
function memberJourneyUid(m) {
  const n = {}
  for (const s of m.status.values()) if (s.via === 'camara' && s.cap?.ev?.journeyUid) n[s.cap.ev.journeyUid] = (n[s.cap.ev.journeyUid] ?? 0) + 1
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Veredicto del lote para una lectura suelta (todas sus capturas frontales). */
export function loteVerdict(lote, fragmentKey) {
  const caps = (lote?.byKey.get(fragmentKey) ?? []).filter((c) => c.lote)
  if (!caps.length) return null
  const recon = caps.filter((c) => c.lote.via === 'reconstruida')
  const own = caps.filter((c) => c.lote.via === 'camara')
  const members = new Set([...recon, ...own].map((c) => c.lote.member))
  if (!recon.length || members.size !== 1) return { caps, member: null }
  const m = recon[0].lote.member
  const P = Math.max(...recon.map((c) => c.lote.P))
  return { caps, member: m, P, rivales: recon[0].lote.rivales ?? [], reconstructed: recon.length }
}

/**
 * Aplica el lote a la bandeja de una planta: lo reconstruido con P ≥ umbral queda casi_seguro (regla «lote»).
 * Lo que el lote no resuelve sigue con las reglas de identifyFragments, salvo `mode: 'solo'` (las reglas
 * de cuenta/universo dejan de aplicarse solas y quedan para operaciones).
 * Lecturas válidas que no eran caso (viaje propio con patente mal leída) y el lote asigna a otro camión
 * entran a la bandeja como casos nuevos ya resueltos.
 * @param {object[]} items bandeja de identifyFragments (se modifica)
 * @param {ReturnType<typeof buildLiveLote>} lote
 * @param {string} site
 */
export function applyLoteToItems(items, lote, site, { mode = process.env.IDENTIFICATION_LOTE_MODE || 'override' } = {}) {
  if (!lote) return items
  const keys = new Set(items.map((it) => it.fragmentKey))
  for (const it of items) {
    if (it.decision || ['confirmado', 'rechazado'].includes(it.level) || STRONG_RULES.has(it.rule)) continue
    const v = loteVerdict(lote, it.fragmentKey)
    // La lectura es casi la patente de otro camión (VSC98 → VSC984) y no se parece a la del lote: decide la bandeja.
    const top = (it.candidates ?? []).reduce((a, c) => (!a || (c.similarity ?? 0) > (a.similarity ?? 0) ? c : a), null)
    // Lectura con contenido (≥ 4 caracteres) que no se parece a la patente del lote (IGEP6991 → OUN733):
    // replay 12–18/10, 0 de 5 bien; las 162 bien se parecen ≥ 0,5. Vacías y cortas sí se reconstruyen.
    const read = String(it.readPlate ?? '').replace(/[^A-Z0-9]/gi, '')
    const unlike = (m) => read.length >= 4 && read !== 'SINPATENTE' && plateSimilarity(read, m.plate) < UNLIKE_READ
    const contradicts = (m) => unlike(m) || (top && top.plate !== m.plate && (top.similarity ?? 0) >= READ_MATCH && plateSimilarity(it.readPlate, m.plate) < (top.similarity ?? 0) - 0.3)
    if (v?.member && contradicts(v.member)) {
      it.lote = { plate: v.member.plate, probability: Math.round(v.P * 1000) / 1000, circuit: v.member.circuit, contradicted: top?.plate ?? null, rivales: [] }
    } else if (v?.member) {
      if (v.member.plate === it.readPlate) continue
      const m = v.member
      const cand = (it.candidates ?? []).find((c) => c.plate === m.plate)
      Object.assign(it, {
        level: 'casi_seguro',
        assignedPlate: m.plate,
        assignedJourneyUid: memberJourneyUid(m) ?? cand?.journeyUid ?? null,
        rule: 'lote',
        reason: `el lote da ${Math.round(v.P * 100)} % a ${m.plate}: tenía este paso pendiente${v.rivales[0] ? ` (siguiente: ${v.rivales[0].plate} ${Math.round(v.rivales[0].p * 100)} %)` : ''}`,
        evidenceEligible: false,
        lote: { plate: m.plate, probability: Math.round(v.P * 1000) / 1000, circuit: m.circuit, rivales: v.rivales.map((r) => ({ plate: r.plate, probability: Math.round(r.p * 1000) / 1000 })) },
      })
    } else if (v && it.level !== 'casi_seguro') {
      // El lote no llega al umbral: color/marca/tipo del DSS (bajo demanda) pueden cerrarlo en la próxima vuelta.
      const pend = v.caps.filter((c) => c.lote.via === 'sin_decidir' && c.lote.best).sort((a, b) => b.lote.P - a.lote.P)[0]
      if (pend && pend.lote.P >= 0.3) {
        it.evidenceEligible = !it.decision
        it.lote = { plate: pend.lote.best.plate, probability: Math.round(pend.lote.P * 1000) / 1000, circuit: pend.lote.best.circuit, pending: true, rivales: [] }
      }
    }
    if (mode === 'solo' && !v?.member && it.level === 'casi_seguro' && it.assignedPlate && it.rule !== 'lote') {
      Object.assign(it, { level: it.candidates?.length ? 'provisorio' : 'pendiente', assignedPlate: null, assignedJourneyUid: null, reason: `${it.reason} · el lote no lo confirma`, rule: null })
    }
  }
  // Viajes con patente válida que no eran caso y el lote reconstruye como otro camión.
  const extra = new Map()
  for (const [key, caps] of lote.byKey) {
    if (keys.has(key) || siteOfNode(caps[0].node) !== site) continue
    const v = loteVerdict(lote, key)
    if (!v?.member || v.member.plate === caps[0].plate) continue
    if (String(caps[0].plate).length >= 4 && plateSimilarity(caps[0].plate, v.member.plate) < UNLIKE_READ) continue
    extra.set(key, v)
  }
  for (const [key, v] of extra) {
    const head = v.caps[0]
    const e = head.ev
    const sectorCode = resolveCanonicalSectorForLiveFeed(e.sectorCode, String(e.deviceCode ?? '').trim())
    const logical = sectorToLogical(sectorCode)
    const m = v.member
    items.push({
      fragmentKey: key,
      readPlate: head.plate || 'SIN_PATENTE',
      validFormat: isValidPlate(head.plate),
      node: logical,
      nodeLabel: logicalLabel(logical),
      sectorCode,
      deviceCode: head.device,
      at: new Date(head.t).toISOString(),
      events: v.caps.length,
      expectedAtNode: null,
      level: 'casi_seguro',
      reason: `el lote da ${Math.round(v.P * 100)} % a ${m.plate}: ${head.plate} no tiene visita y ${m.plate} tenía este paso pendiente`,
      assignedPlate: m.plate,
      assignedJourneyUid: memberJourneyUid(m),
      renameJourneyUid: null,
      evidenceEligible: false,
      rule: 'lote',
      cuenta: null,
      balanza: null,
      candidates: [{ plate: m.plate, journeyUid: memberJourneyUid(m), similarity: Math.round(plateSimilarity(head.plate, m.plate) * 100) / 100, inUniverse: true }],
      decision: null,
      lote: { plate: m.plate, probability: Math.round(v.P * 1000) / 1000, circuit: m.circuit, rivales: v.rivales.map((r) => ({ plate: r.plate, probability: Math.round(r.p * 1000) / 1000 })) },
    })
  }
  return items
}

/**
 * Recorrido de un camión según el lote: cada paso de su circuito con su estado (camara, reconstruida,
 * deducida, deducidaFinal, pendiente, falta). El paso deducido no es una lectura: no tiene hora ni cámara.
 * @returns {{ plate: string, circuit: string, source: string, ing: string, steps: { node: string, logical: string|null, estado: string, at?: string, read?: string, probability?: number }[] }|null}
 */
export function loteTruckSteps(lote, plate, nowMs = lote?.at ?? Date.now()) {
  const m = [...(lote?.lote ?? [])].filter((x) => x.plate === plate && x.vStart <= nowMs).sort((a, b) => b.ing - a.ing)[0]
  if (!m) return null
  const fin = finalSteps(m, lote.front, nowMs)
  const { logicalOf } = loteModel()
  return {
    plate: m.plate,
    circuit: m.circuit,
    source: m.source,
    ing: new Date(m.ing).toISOString(),
    steps: m.exp.map((node, i) => {
      const s = m.status.get(node)
      return { node, logical: logicalOf.get(node) ?? null, estado: fin[i], ...(s ? { at: new Date(s.t).toISOString(), read: s.read, device: s.device, ...(s.P != null ? { probability: Math.round(s.P * 1000) / 1000 } : {}) } : {}) }
    }),
  }
}
