/**
 * Lote de ingreso como universo conocido que avanza nodo por nodo (núcleo de scripts/demostracion/lote.mjs).
 *
 * Las capturas se procesan en orden de hora. En cada punto, una captura dudosa se compara solo contra los
 * camiones del lote que tienen ese paso pendiente; pesan cuánto lleva esperando (tiempo de tramo como
 * peso), la patente (distancia de edición), color/marca/tipo del DSS y la trasera (acoplado visto antes con
 * ese tractor). Por camión, cada paso queda leído por la cámara, reconstruido (captura dudosa asignada con
 * P ≥ umbral), deducido (sin captura, pero identificado antes y después) o falta.
 *
 * Lo usan el análisis por lote (scripts/demostracion/lote.mjs, semana 12–18/10: 65,4 % leído por cámara →
 * 99,0 % de pasos identificados, prueba de patentes borradas 97,6 % correctas) y el reconocedor en vivo
 * (loteLive.mjs). Cambiar algo acá cambia los dos: volver a correr lote.mjs y comparar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isValidPlate } from './plateIdentification.mjs'
import { compareAttribute } from './identificationEvidence.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODEL_PATH = path.resolve(__dirname, '../../docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')

export const LOTE_THETA = 0.6
export const H8 = 8 * 3600_000
/** Fallas de hardware: no cuentan en el informe por punto. */
export const EXCLUIDOS = new Set(['ricardone:Ingreso', 'ricardone:Balanza Ingreso'])
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
export const ACCESOS = new Set(['ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Salida 2', 'san_lorenzo:Ingreso', 'san_lorenzo:Egreso', 'san_lorenzo:Carga/Descarga Renova'])
export const NOT_TRUCK = /sedan|suv|pickup|van|car\b|motor|mpv|hatchback/i

// ── Modelo de nodos ──
let _model = null
/**
 * Cámaras → nodo (frontales y traseras) y nodos esperados por circuito, desde modelo_nodo_sur.json.
 * @param {object} [model] el modelo ya leído (por defecto, el del repo)
 */
export function loteModel(model) {
  if (!model && _model) return _model
  const m = model ?? JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'))
  const nodeById = new Map(m.nodes.map((n) => [n.id, n]))
  const frontNode = new Map(), rearNode = new Map()
  for (const n of m.nodes) {
    if (!n.hasCamera) continue
    const id = SAME[n.id] ?? n.id
    for (const d of n.devices ?? []) if (d !== 'SLZCalCam' && !frontNode.has(d.toLowerCase())) frontNode.set(d.toLowerCase(), id)
    for (const d of n.rear ?? []) if (!rearNode.has(d.toLowerCase())) rearNode.set(d.toLowerCase(), id)
  }
  function expectedNodes(circuit) {
    const c = m.circuits.find((x) => x.id === circuit)
    if (!c) return []
    const out = []
    for (const raw of c.seq) {
      const id = SAME[raw] ?? raw
      const n = nodeById.get(id)
      if (!n?.hasCamera || n.optional || NO_MEDIBLES.has(id) || out.includes(id)) continue
      out.push(id)
    }
    return out
  }
  const circuitNodes = m.circuits.map((c) => ({ id: c.id, exp: expectedNodes(c.id) })).filter((c) => c.exp.length)
  /** Nodo del modelo → sector lógico del feed en vivo (ricardone S*, san_lorenzo SL_S*), como nodeModelCatalog. */
  const logicalOf = new Map(m.nodes.filter((n) => n.hasCamera && n.code).map((n) => [n.id, n.plant === 'san_lorenzo' ? `SL_${n.code}` : n.code]))
  const out = { model: m, nodeById, frontNode, rearNode, expectedNodes, circuitNodes, logicalOf }
  if (!model) _model = out
  return out
}

// ── Lectura de patente: chance de leer `read` si pasó `real` ──
// Frecuencia medida de cada cantidad de cambios (scripts/demostracion/errores-lectura.mjs, pares decididos
// solo por el inventario, 01–07/10): de las lecturas malas, 1 cambio ≈ 8 %, 2 ≈ 5 %, 3 ≈ 3 %, 4 o más ≈ 83 %
// (fragmento sin información). Cada cantidad se reparte entre las formas posibles de hacerla
// (≈ 6 posiciones × 20 caracteres por cambio).
export const MAL = 0.45 // parte de las lecturas que salen mal
const PK = { 1: 0.08, 2: 0.05, 3: 0.03 }
export const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
const combos = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r }
export const FRAG = (MAL * 0.83) / 1e6 // fragmento: igual para cualquier camión
export function readL(read, real) {
  if (read === real) return 1 - MAL
  const k = editDist(read, real)
  if (k >= 4 || !PK[k]) return FRAG
  return Math.max(FRAG, (MAL * PK[k]) / (combos(real.length, k) * Math.pow(20, k)))
}

const lcs = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length] }
const near = (list, t, ms) => (list ?? []).filter((x) => Math.abs(x.t - t) <= ms)
const mode = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

/**
 * Circuito por cámaras: el del modelo que mejor encaja con los puntos donde se leyó al camión en su visita
 * (en orden). Se mantiene el del lote si explica todas las lecturas en orden; si las cámaras lo contradicen
 * se elige el que explica más lecturas (empate: el que menos puntos deja sin leer).
 * @returns {number} circuitos cambiados
 */
export function fitCircuitsToCameras(lote, front, circuitNodes) {
  let changed = 0
  for (const m of lote) {
    const obs = front.filter((c) => c.plate === m.plate && c.t >= m.vStart && c.t <= m.vEnd).map((c) => c.node).filter((n, i, a) => n !== a[i - 1])
    if (!obs.length) continue
    if (lcs(obs, m.exp) === obs.length) continue
    let best = null
    for (const c of circuitNodes) {
      const k = lcs(obs, c.exp)
      const score = k * 10 - (c.exp.length - k) * 0.1
      if (!best || score > best.score) best = { ...c, score }
    }
    if (best && lcs(obs, best.exp) <= lcs(obs, m.exp)) continue
    if (best && best.id !== m.circuit) { m.circuitExcel = m.circuit; m.circuit = best.id; m.exp = best.exp; changed++ }
  }
  return changed
}

/**
 * Recorre las capturas en orden y asigna cada una a un camión del lote.
 *
 * @param {object} p
 * @param {{ node: string, rear: boolean, device: string, t: number, plate: string, attrs: object|null }[]} p.caps
 *   capturas ordenadas por hora (frontales y traseras). Cada frontal procesada recibe `c.lote` con el resultado.
 * @param {{ id: string, plate: string, circuit: string, ing: number, sal: number, exp: string[], vStart: number, vEnd: number, inSample?: boolean }[]} p.lote
 *   camiones del lote; se les agrega status (Map nodo → paso), last, lastT.
 * @param {{ has(plate: string): boolean }} p.known patentes que pasaron alguna vez por la balanza
 * @param {number} [p.theta] umbral de asignación
 * @param {number} [p.hideEvery] prueba: a 1 de cada N lecturas buenas se le borra la patente (0 = sin prueba)
 * @param {number} p.start @param {number} p.end capturas que se recorren
 * @param {(t: number) => boolean} p.inDay capturas que cuentan en las estadísticas
 * @param {(t: number) => boolean} p.inOtrosDay capturas para medir la parte «otros vehículos» de cada punto
 * @param {(c: object) => boolean} [p.skipCapture] capturas que no se miden (p. ej. decididas por operaciones)
 * @param {boolean} [p.fitCircuits] corregir el circuito del lote con las cámaras (default true)
 */
export function reconstructLote({ caps, lote, known, theta = LOTE_THETA, hideEvery = 0, start, end, inDay, inOtrosDay, fitCircuits = true, circuitNodes = loteModel().circuitNodes }) {
  for (const m of lote) { m.status = new Map(); m.last = null; m.lastT = m.ing }
  const front = caps.filter((c) => !c.rear)
  const rear = caps.filter((c) => c.rear)
  const rearByNode = new Map()
  for (const c of rear) { if (!rearByNode.has(c.node)) rearByNode.set(c.node, []); rearByNode.get(c.node).push(c) }

  // ── Acoplados: trasera leída a ±30 s de una frontal buena en el mismo punto → par tractor/acoplado ──
  const trailerOf = new Map() // acoplado → Map(tractor → veces)
  for (const c of front) {
    if (!isValidPlate(c.plate)) continue
    for (const r of near(rearByNode.get(c.node), c.t, 30_000)) {
      if (!isValidPlate(r.plate) || r.plate === c.plate) continue
      if (!trailerOf.has(r.plate)) trailerOf.set(r.plate, new Map())
      const m = trailerOf.get(r.plate)
      m.set(c.plate, (m.get(c.plate) ?? 0) + 1)
    }
  }

  const circuitosCambiados = fitCircuits ? fitCircuitsToCameras(lote, front, circuitNodes) : 0
  const lotePlates = new Map()
  for (const m of lote) { if (!lotePlates.has(m.plate)) lotePlates.set(m.plate, []); lotePlates.get(m.plate).push(m) }
  const activeMov = (plate, t) => (lotePlates.get(plate) ?? []).find((m) => t >= m.vStart && t <= m.vEnd)

  // ── Tiempo de tramo como peso: P(llega ahora | todavía no llegó), con lecturas buenas del lote ──
  const BIN = 2 * 60_000, NB = Math.ceil(H8 / BIN)
  const gapHist = new Map()
  for (const m of lote) {
    let prevT = m.ing, prevN = 'INICIO'
    for (const n of m.exp) {
      const hit = front.find((c) => c.node === n && c.plate === m.plate && c.t >= m.vStart && c.t <= m.vEnd && c.t > prevT - 60_000)
      if (!hit) continue
      const k = `${prevN}>${n}`
      if (!gapHist.has(k)) gapHist.set(k, new Array(NB).fill(0))
      gapHist.get(k)[Math.min(NB - 1, Math.max(0, Math.floor((hit.t - prevT) / BIN)))]++
      prevT = hit.t
      prevN = n
    }
  }
  // Primer punto: minutos entre el ingreso y la primera lectura buena en ese punto (con signo), por punto.
  // Probabilidad por bloque de 2 min, la misma escala que el tiempo de tramo.
  const OFF = 30, entryHist = new Map()
  for (const m of lote) {
    const n0 = m.exp.find((n) => !EXCLUIDOS.has(n)) ?? m.exp[0]
    const hit = front.find((c) => c.node === n0 && c.plate === m.plate && Math.abs(c.t - m.ing) <= OFF * 60_000)
    if (!hit) continue
    if (!entryHist.has(n0)) entryHist.set(n0, new Array(OFF + 1).fill(0))
    entryHist.get(n0)[Math.round((hit.t - m.ing) / BIN) + OFF / 2]++
  }
  function entryWeight(node, e) {
    const hst = entryHist.get(node)
    const i = Math.round(e / BIN) + OFF / 2
    if (i < 0 || i > OFF) return 1e-4
    if (!hst) return 0.05
    const n = hst.reduce((a, b) => a + b, 0)
    return ((hst[Math.max(0, i - 1)] + hst[i] + hst[Math.min(OFF, i + 1)]) / 3 + 0.1) / (n + 0.1 * (OFF + 1))
  }
  const hz = new Map()
  function hazard(from, to, e) {
    const k = `${from}>${to}`
    if (!hz.has(k)) {
      const hist = gapHist.get(k)
      const n = hist ? hist.reduce((a, b) => a + b, 0) : 0
      const h = new Array(NB).fill(1 / NB)
      // Fantasma: si espera mucho más que el tramo normal (p99 × 1,5 + 10 min), ya pasó sin ser leído.
      let cut = 4 * 3600_000
      if (n >= 8) { let acc = 0; for (let i = 0; i < NB; i++) { acc += hist[i]; if (acc >= 0.99 * n) { cut = (i + 1) * BIN * 1.5 + 10 * 60_000; break } } }
      h.cut = cut
      if (n >= 8) {
        const sm = hist.map((_, i) => (hist[Math.max(0, i - 1)] + hist[i] + hist[Math.min(NB - 1, i + 1)]) / 3 + n * 0.001)
        const tot = sm.reduce((a, b) => a + b, 0)
        let surv = 1
        for (let i = 0; i < NB; i++) { const f = sm[i] / tot; h[i] = f / Math.max(surv, 1e-6); surv -= f }
      }
      hz.set(k, h)
    }
    const h = hz.get(k)
    return h[Math.min(NB - 1, Math.max(0, Math.floor(e / BIN)))] * (e > h.cut ? 0.002 : 1)
  }

  // Parte de las capturas de cada punto que no son de camiones del lote (otros vehículos, otros días).
  const otros = {}
  for (const c of front) {
    if (!inOtrosDay(c.t)) continue
    const o = (otros[c.node] ??= { n: 0, otro: 0 })
    if (!isValidPlate(c.plate)) continue
    o.n++
    if (!activeMov(c.plate, c.t)) o.otro++
  }
  const pOtro = (node) => { const o = otros[node]; return o && o.n >= 20 ? Math.min(0.95, Math.max(0.05, o.otro / o.n)) : 0.5 }

  const attrsOf = new Map()
  const learnAttrs = (plate, a) => {
    if (!a) return
    if (!attrsOf.has(plate)) attrsOf.set(plate, { vehicleColor: {}, vehicleBrand: {}, vehicleCategory: {} })
    const s = attrsOf.get(plate)
    for (const k of Object.keys(s)) { const v = a[k]; if (v && !/unknown|unrecognized/i.test(v)) s[k][v] = (s[k][v] ?? 0) + 1 }
  }
  const lrAttrs = (a, plate) => {
    const s = attrsOf.get(plate)
    if (!a || !s) return 1
    return compareAttribute('color', a.vehicleColor, mode(s.vehicleColor)).lr * compareAttribute('marca', a.vehicleBrand, mode(s.vehicleBrand)).lr * compareAttribute('tipo', a.vehicleCategory, mode(s.vehicleCategory)).lr
  }

  // ── Recorrido del lote ──
  const paresInventario = []
  const res = {}
  const R = (n) => (res[n] ??= { prueba: { n: 0, bien: 0, otro: 0, nada: 0, errores: [] }, universo: [], efectivo: [], cap: { total: 0, lote: 0, otroDiaOVehiculo: 0, noCamion: 0, sinCandidato: 0, sinDecidir: 0, asignada: 0 } })
  let hideCounter = 0
  for (const c of front) {
    if (c.t < start || c.t > end) continue
    const counts = inDay(c.t)
    const CR = R(c.node).cap
    if (counts) CR.total++
    const own = isValidPlate(c.plate) ? activeMov(c.plate, c.t) : null
    let hidden = null
    // Orden: antes del ingreso solo valen los primeros puntos; después, cada paso va después del anterior.
    const ordered = (m, node) => { const iN = m.exp.indexOf(node), iL = m.last ? m.exp.indexOf(m.last) : -1; return iN >= 0 && iN > iL && (c.t >= m.ing - 5 * 60_000 || iN <= 1) }
    if (own && ordered(own, c.node) && !own.status.has(c.node) && hideEvery > 0 && hideCounter++ % hideEvery === 0) hidden = own
    if (own && !hidden) {
      if (counts) CR.lote++
      learnAttrs(own.plate, c.attrs)
      const iN = own.exp.indexOf(c.node), iL = own.last ? own.exp.indexOf(own.last) : -1
      const inOrder = iN > iL && (c.t >= own.ing - 5 * 60_000 || iN <= 1)
      if (iN >= 0 && inOrder && !own.status.has(c.node)) { own.status.set(c.node, { via: 'camara', t: c.t, read: c.plate, device: c.device, cap: c }); own.last = c.node; own.lastT = c.t }
      c.lote = { via: 'camara', member: own }
      continue
    }
    // Autos y camionetas solo pasan por los accesos; en calada, balanzas y descargas el tipo del DSS se equivoca
    // por el ángulo de la cámara y no se descarta nada.
    if (!hidden && ACCESOS.has(c.node) && c.attrs && NOT_TRUCK.test(c.attrs.vehicleCategory ?? '')) { if (counts) CR.noCamion++; c.lote = { via: 'no_camion' }; continue }
    // Patente válida de un camión de otro lote o que no está en el Excel: es otro vehículo real.
    if (!hidden && isValidPlate(c.plate) && known.has(c.plate)) { if (counts) CR.otroDiaOVehiculo++; c.lote = { via: 'otro_vehiculo' }; continue }
    // Universo: camiones del lote con ese paso pendiente, que siguen en planta y cuyo último punto es anterior.
    const U = []
    for (const m of lote) {
      if (c.t < m.vStart || c.t > m.vEnd || m.status.has(c.node)) continue
      const iN = m.exp.indexOf(c.node)
      if (iN < 0) continue
      const iL = m.last ? m.exp.indexOf(m.last) : -1
      if (iL >= iN) continue
      // Sin ningún punto identificado todavía, solo se reconstruyen los primeros puntos: hace falta un ancla.
      if (iL < 0 && iN > 1) continue
      const skipped = iN - iL - 1
      // Primer punto: el camión tiene que estar a pocos minutos de su ingreso (±5 min pesa entero; después cae).
      const w = m.last == null
        ? Math.pow(0.25, skipped) * entryWeight(c.node, c.t - m.ing)
        : Math.pow(0.25, skipped) * hazard(m.last, c.node, c.t - m.lastT)
      if (w > 0) U.push({ m, w })
    }
    const r = R(c.node)
    const ws = U.reduce((a, u) => a + u.w, 0)
    if (counts) { r.universo.push(U.length); r.efectivo.push(ws ? 1 / U.reduce((a, u) => a + (u.w / ws) ** 2, 0) : 0) }
    // Par para medir errores de lectura sin usar la patente: el inventario decide solo (un candidato > 95 %).
    if (!hidden && U.length && ws > 0) { const top = U.reduce((a, b) => (b.w > a.w ? b : a)); if (top.w / ws > 0.95) paresInventario.push({ node: c.node, t: c.t, real: top.m.plate, leida: c.plate }) }
    const po = pOtro(c.node)
    const pl = hidden ? null : c.plate
    const rearHere = near(rearByNode.get(c.node), c.t, 30_000).filter((x) => isValidPlate(x.plate))
    const scored = U.map(({ m, w }) => {
      const L = pl ? readL(pl, m.plate) : FRAG
      let rearLr = 1
      for (const x of rearHere) { const k = trailerOf.get(x.plate)?.get(m.plate) ?? 0; if (k) rearLr = Math.max(rearLr, k >= 2 ? 50 : 20) }
      return { m, score: ((1 - po) * w / Math.max(ws, 1e-9)) * L * lrAttrs(c.attrs, m.plate) * rearLr }
    })
    const never = po * (pl && isValidPlate(pl) ? (1 - MAL) / 12789 : FRAG)
    const total = scored.reduce((a, s) => a + s.score, 0) + never
    const best = scored.sort((a, b) => b.score - a.score)[0]
    const P = best && total ? best.score / total : 0
    const pick = best && P >= theta ? best.m : null
    if (counts && !hidden) { if (!U.length) CR.sinCandidato++; else if (pick) CR.asignada++; else CR.sinDecidir++ }
    const rivales = scored.slice(pick ? 1 : 0, pick ? 3 : 3).map((x) => ({ plate: x.m.plate, p: total ? x.score / total : 0 }))
    if (!hidden) c.lote = pick ? { via: 'reconstruida', member: pick, P, rivales } : { via: U.length ? 'sin_decidir' : 'sin_candidato', P, best: best?.m ?? null, rivales }
    const before = pick && hidden ? { verdadero: { last: hidden.last, esperaMin: Math.round((c.t - hidden.lastT) / 60000) }, asignado: { last: pick.last, esperaMin: Math.round((c.t - pick.lastT) / 60000) }, rankVerdadero: scored.findIndex((x) => x.m === hidden) + 1 } : null
    if (pick) { pick.status.set(c.node, { via: 'reconstruida', t: c.t, P, prueba: !!hidden, read: hidden ? '(patente borrada para la prueba)' : c.plate, device: c.device, cap: c, rivales: scored.slice(1, 3).map((x) => ({ plate: x.m.plate, p: total ? x.score / total : 0 })) }); pick.last = c.node; pick.lastT = c.t }
    if (hidden && hidden.inSample) {
      r.prueba.n++
      if (pick === hidden) r.prueba.bien++
      else if (pick) r.prueba.otro++
      else r.prueba.nada++
      if (pick && pick !== hidden) r.prueba.errores.push({ at: new Date(c.t - 240_000).toISOString(), node: c.node, device: c.device, leyo: c.plate, verdadero: hidden.plate, asignado: pick.plate, P: Math.round(P * 100), rivales: scored.slice(0, 4).map((x) => `${x.m.plate} ${Math.round((x.score / total) * 100)}%`), antes: before })
      if (pick !== hidden && !hidden.status.has(c.node) && ordered(hidden, c.node)) { hidden.status.set(c.node, { via: 'camara', t: c.t, read: hidden.plate, device: c.device, cap: c }); hidden.last = c.node; hidden.lastT = c.t }
    }
  }
  return { front, res, R, paresInventario, circuitosCambiados }
}

/**
 * Estado final de cada paso de un camión del lote: camara / reconstruida / deducida (sin captura, pero el
 * camión se identificó en un punto posterior de su circuito) / deducidaFinal (después de su último punto
 * identificado no hay otra lectura suya en la visita: salió por el único camino que le queda) / falta.
 * @param {number} [nowMs] en vivo: si la visita sigue abierta, lo que viene después del último punto queda
 *   «pendiente» (todavía no pasó), no deducido.
 */
export function finalSteps(m, front, nowMs = Infinity) {
  const st = m.exp.map((n) => m.status.get(n)?.via ?? null)
  const filledIdx = st.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  const lastFilled = filledIdx.at(-1) ?? -1
  const seenAfter = front.some((c) => c.plate === m.plate && c.t > (m.status.get(m.exp[lastFilled])?.t ?? m.ing) && c.t <= m.vEnd && !m.exp.includes(c.node))
  const open = nowMs < m.vEnd && !(Number.isFinite(m.sal) && m.sal <= nowMs)
  return st.map((v, i) => v ?? (i < lastFilled ? 'deducida' : open ? 'pendiente' : lastFilled >= 0 && !seenAfter ? 'deducidaFinal' : 'falta'))
}
