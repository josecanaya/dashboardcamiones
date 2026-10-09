// Lote de ingreso como universo conocido que avanza y se distribuye por la planta.
// Lote = movimientos del Excel que ingresaron un día (el Excel solo arma el lote y sirve de contraste).
// Las capturas se procesan en orden de hora. En cada punto, una captura dudosa se compara solo contra los
// camiones del lote que tienen ese paso pendiente; pesan cuánto lleva esperando (tiempo de tramo como
// peso), la patente, color/marca/tipo y la trasera (acoplado visto antes con ese tractor).
// Por camión: puntos leídos por la cámara, reconstruidos (captura dudosa asignada), deducidos (sin captura,
// pero leído antes y después) y faltantes. Prueba: a 1 de cada 4 lecturas buenas se le borra la patente.
// Uso: node scripts/demostracion/lote.mjs [día=2026-10-01] [umbral=0.6]
import fs from 'node:fs'
import path from 'node:path'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'
import { readLikelihood, DAMAGED_READ } from '../../server/plantState/nodeModelScore.mjs'
import { compareAttribute } from '../../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const ARG = process.argv[2] ?? '2026-10-01'
const WEEK = ARG === 'semana'
const DAY = WEEK ? '2026-10-01' : ARG
const WEEK_DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']
const THETA = Number(process.argv[3] ?? 0.6)
// Cuarto del día (opcional): Q1 22–04 h (desde la noche anterior), Q2 04–10, Q3 10–16, Q4 16–22.
const Q = process.argv[4] ? Number(process.argv[4]) : null
const qRange = Q ? [Date.parse(`${DAY}T00:00:00-03:00`) + (-2 + (Q - 1) * 6) * 3600_000, Date.parse(`${DAY}T00:00:00-03:00`) + (4 + (Q - 1) * 6) * 3600_000] : null
const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const localMs = (s) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const PAD = 45 * 60_000
const H8 = 8 * 3600_000
const DAYS = WEEK ? [addDays(DAY, -1), ...WEEK_DAYS, '2026-10-08'] : [addDays(DAY, -1), DAY, addDays(DAY, 1), addDays(DAY, 2)]
const EXCLUIDOS = new Set(['ricardone:Ingreso', 'ricardone:Balanza Ingreso']) // fallas de hardware

// ── Modelo de nodos ──
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
const frontNode = new Map(), rearNode = new Map()
for (const n of model.nodes) {
  if (!n.hasCamera) continue
  const id = SAME[n.id] ?? n.id
  for (const d of n.devices ?? []) if (d !== 'SLZCalCam' && !frontNode.has(d.toLowerCase())) frontNode.set(d.toLowerCase(), id)
  for (const d of n.rear ?? []) if (!rearNode.has(d.toLowerCase())) rearNode.set(d.toLowerCase(), id)
}
function expectedNodes(circuit, platform) {
  const c = model.circuits.find((x) => x.id === circuit)
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

// ── Capturas (feed + solo DSS), frontales y traseras, con atributos ──
const dss = new Map()
{
  const lines = fs.readFileSync(path.join(root, 'data/dss-export/2026-10-01_07/capturas.csv'), 'utf8').trim().split(/\r?\n/)
  const head = lines[0].split(',')
  let row = 0
  for (const l of lines.slice(1)) {
    const v = l.split(','), r = Object.fromEntries(head.map((h, i) => [h, v[i]]))
    const t = Date.parse(`${r.hora_camara.replace(' ', 'T')}-03:00`) + 240_000
    const k = r.camara.toLowerCase()
    if (!dss.has(k)) dss.set(k, [])
    dss.get(k).push({ row: row++, device: r.camara, t, plate: plateOf(r.patente), vehicleColor: r.color, vehicleBrand: r.marca, vehicleCategory: r.tipo })
  }
  for (const l of dss.values()) l.sort((a, b) => a.t - b.t)
}
const dssAt = (dev, t, plate) => {
  let best = null
  for (const r of dss.get(dev.toLowerCase()) ?? []) {
    if (r.t < t - 5000) continue
    if (r.t > t + 5000) break
    const s = (r.plate === plate ? 0 : 10_000) + Math.abs(r.t - t)
    if (!best || s < best.s) best = { ...r, s }
  }
  return best
}
const caps = []
const usedDss = new Set()
for (const d of DAYS) {
  const f = `data/truckflow/${d}/event-list.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const e of Array.isArray(o) ? o : o.records ?? []) {
    if (e.inferred || e.manualCorrection || e.eventCategory !== 'physical') continue
    const dev = String(e.deviceCode ?? '').toLowerCase()
    const node = frontNode.get(dev) ?? rearNode.get(dev)
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t)) continue
    const plate = plateOf(e.normalizedPlate || e.truckPlate)
    const a = dssAt(e.deviceCode, t, plate)
    if (a) usedDss.add(a.row)
    caps.push({ node, rear: !frontNode.has(dev), device: e.deviceCode, t, plate, attrs: a })
  }
}
for (const [dev, list] of dss) {
  const node = frontNode.get(dev) ?? rearNode.get(dev)
  if (!node) continue
  for (const r of list) if (!usedDss.has(r.row) && DAYS.includes(arDay(r.t))) caps.push({ node, rear: !frontNode.has(dev), device: r.device, t: r.t, plate: r.plate, attrs: r })
}
caps.sort((a, b) => a.t - b.t)
const front = caps.filter((c) => !c.rear)
const rear = caps.filter((c) => c.rear)
const rearByNode = new Map()
for (const c of rear) { if (!rearByNode.has(c.node)) rearByNode.set(c.node, []); rearByNode.get(c.node).push(c) }
const near = (list, t, ms) => (list ?? []).filter((x) => Math.abs(x.t - t) <= ms)

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

// ── Lote: movimientos que ingresaron ese día ──
const lote = []
const seenOp = new Set()
for (const run of ['2026-09-28_2026-10-04', '2026-10-05_2026-10-11']) {
  for (const r of json(`runs/windows/${run}/tables/excel_operations_with_truckflow.json`).rows) {
    const plate = plateOf(r.plate_normalized)
    const ing = localMs(r.external_ingreso_at), sal = localMs(r.external_salida_at)
    if (!isValidPlate(plate) || /^(X+|P+|T+)$/.test(plate) || !['RICARDONE', 'TERMINAL_EMBARQUE'].includes(r.planta_normalized)) continue
    if (!Number.isFinite(ing) || !Number.isFinite(sal)) continue
    const t0 = Math.min(ing, sal)
    if (WEEK ? !['2026-09-30', ...WEEK_DAYS].includes(arDay(t0)) : qRange ? t0 < qRange[0] || t0 >= qRange[1] : arDay(t0) !== DAY) continue
    const id = r.external_operation_id ?? `${plate}|${ing}`
    if (seenOp.has(id)) continue
    seenOp.add(id)
    const exp = expectedNodes(r.resolved_executive_circuit_code, r.platform_normalized)
    if (!exp.length) continue
    lote.push({ id, plate, circuit: r.resolved_executive_circuit_code, ing: Math.min(ing, sal), sal: Math.max(ing, sal), exp, status: new Map(), last: null, lastT: Math.min(ing, sal) })
  }
}
const allExcel = new Set()
for (const d of fs.readdirSync(path.join(root, 'data/movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = `data/movimientos/${d}/movimientos.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const r of Array.isArray(o) ? o : Object.values(o)) { const pl = plateOf(r?.plate_normalized); if (pl) allExcel.add(pl) }
}
// La visita sale de las cámaras: empieza 20 min antes del ingreso y termina cuando el camión arranca la
// vuelta siguiente (próximo ingreso de esa patente en el Excel, cualquier planta) o a las 12 h.
const nextIng = new Map()
for (const run of ['2026-09-28_2026-10-04', '2026-10-05_2026-10-11']) for (const r of json(`runs/windows/${run}/tables/excel_operations_with_truckflow.json`).rows) {
  const pl = plateOf(r.plate_normalized), t = localMs(r.external_ingreso_at)
  if (!Number.isFinite(t)) continue
  if (!nextIng.has(pl)) nextIng.set(pl, [])
  nextIng.get(pl).push(t)
}
for (const m of lote) {
  const after = (nextIng.get(m.plate) ?? []).filter((t) => t > m.ing + 10 * 60_000).sort((a, b) => a - b)[0]
  m.vStart = m.ing - 20 * 60_000
  m.vEnd = Math.min(after != null ? after - 10 * 60_000 : Infinity, m.ing + 12 * 3600_000)
}
const MUESTRA = process.env.MUESTRA ? process.env.MUESTRA.split(':') : null
if (MUESTRA) {
  const base = Date.parse(`${MUESTRA[0]}T00:00:00-03:00`), q = Number(MUESTRA[1])
  const lo = base + (-2 + (q - 1) * 6) * 3600_000, hi = base + (4 + (q - 1) * 6) * 3600_000
  for (const m of lote) m.inSample = m.ing >= lo && m.ing < hi
} else for (const m of lote) m.inSample = !WEEK || WEEK_DAYS.includes(arDay(m.ing))
// Circuito por cámaras: el del modelo que mejor encaja con los puntos donde se leyó al camión en su visita
// (en orden). Empate → el del Excel. Así un egreso de glicerina por Renova no espera Calada de Ricardone.
const circuitNodes = model.circuits.map((c) => ({ id: c.id, exp: expectedNodes(c.id, null) })).filter((c) => c.exp.length)
const lcs = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length] }
let circuitosCambiados = 0
for (const m of lote) {
  const obs = front.filter((c) => c.plate === m.plate && c.t >= m.vStart && c.t <= m.vEnd).map((c) => c.node).filter((n, i, a) => n !== a[i - 1])
  if (!obs.length) continue
  // Se mantiene el circuito del Excel si explica todas las lecturas en orden; solo si las cámaras lo
  // contradicen se elige el que explica más lecturas (empate: el que menos puntos deja sin leer).
  if (lcs(obs, m.exp) === obs.length) continue
  let best = null
  for (const c of circuitNodes) {
    const k = lcs(obs, c.exp)
    const score = k * 10 - (c.exp.length - k) * 0.1
    if (!best || score > best.score) best = { ...c, score }
  }
  if (best && lcs(obs, best.exp) <= lcs(obs, m.exp)) continue
  if (best && best.id !== m.circuit) { m.circuitExcel = m.circuit; m.circuit = best.id; m.exp = best.exp; circuitosCambiados++ }
}
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
  if (WEEK ? !WEEK_DAYS.includes(arDay(c.t)) : arDay(c.t) !== DAY && arDay(c.t) !== addDays(DAY, 1)) continue
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
const mode = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
const lrAttrs = (a, plate) => {
  const s = attrsOf.get(plate)
  if (!a || !s) return 1
  return compareAttribute('color', a.vehicleColor, mode(s.vehicleColor)).lr * compareAttribute('marca', a.vehicleBrand, mode(s.vehicleBrand)).lr * compareAttribute('tipo', a.vehicleCategory, mode(s.vehicleCategory)).lr
}
const ACCESOS = new Set(['ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Salida 2', 'san_lorenzo:Ingreso', 'san_lorenzo:Egreso', 'san_lorenzo:Carga/Descarga Renova'])
// Chance de leer `read` si pasó `real`, con la frecuencia medida de cada cantidad de cambios
// (scripts/demostracion/errores-lectura.mjs, pares decididos solo por el inventario, 01–07/10):
// de las lecturas malas, 1 cambio ≈ 8 %, 2 ≈ 5 %, 3 ≈ 3 %, 4 o más ≈ 83 % (fragmento sin información).
// Cada cantidad se reparte entre las formas posibles de hacerla (≈ 6 posiciones × 20 caracteres por cambio).
const MAL = 0.45 // parte de las lecturas que salen mal
const PK = { 1: 0.08, 2: 0.05, 3: 0.03 }
const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
const combos = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r }
const FRAG = (MAL * 0.83) / 1e6 // fragmento: igual para cualquier camión
function readL(read, real) {
  if (read === real) return 1 - MAL
  const k = editDist(read, real)
  if (k >= 4 || !PK[k]) return FRAG
  return Math.max(FRAG, (MAL * PK[k]) / (combos(real.length, k) * Math.pow(20, k)))
}

const NOT_TRUCK = /sedan|suv|pickup|van|car\b|motor|mpv|hatchback/i

// ── Recorrido del lote ──
const paresInventario = []
const res = {}
const R = (n) => (res[n] ??= { prueba: { n: 0, bien: 0, otro: 0, nada: 0, errores: [] }, universo: [], efectivo: [], cap: { total: 0, lote: 0, otroDiaOVehiculo: 0, noCamion: 0, sinCandidato: 0, sinDecidir: 0, asignada: 0 } })
let hideCounter = 0
const start = Date.parse(`${DAY}T00:00:00-03:00`) - 3600_000
const end = Date.parse(`${WEEK ? '2026-10-08' : addDays(DAY, 2)}T23:59:59-03:00`)
for (const c of front) {
  if (c.t < start || c.t > end) continue
  const inDay = WEEK ? WEEK_DAYS.includes(arDay(c.t)) : DAYS.slice(1, 3).includes(arDay(c.t))
  const CR = R(c.node).cap
  if (inDay) CR.total++
  const own = isValidPlate(c.plate) ? activeMov(c.plate, c.t) : null
  let hidden = null
  // Orden: antes del ingreso solo valen los primeros puntos; después, cada paso va después del anterior.
  const ordered = (m, node) => { const iN = m.exp.indexOf(node), iL = m.last ? m.exp.indexOf(m.last) : -1; return iN >= 0 && iN > iL && (c.t >= m.ing - 5 * 60_000 || iN <= 1) }
  if (own && ordered(own, c.node) && !own.status.has(c.node) && hideCounter++ % 4 === 0) hidden = own
  if (own && !hidden) {
    if (inDay) CR.lote++
    learnAttrs(own.plate, c.attrs)
    const iN = own.exp.indexOf(c.node), iL = own.last ? own.exp.indexOf(own.last) : -1
    // Antes del ingreso solo valen los primeros puntos; después, cada paso tiene que ir después del anterior.
    const inOrder = iN > iL && (c.t >= own.ing - 5 * 60_000 || iN <= 1)
    if (iN >= 0 && inOrder && !own.status.has(c.node)) { own.status.set(c.node, { via: 'camara', t: c.t, read: c.plate, device: c.device }); own.last = c.node; own.lastT = c.t }
    continue
  }
  // Autos y camionetas solo pasan por los accesos; en calada, balanzas y descargas el tipo del DSS se equivoca
  // por el ángulo de la cámara y no se descarta nada.
  if (!hidden && ACCESOS.has(c.node) && c.attrs && NOT_TRUCK.test(c.attrs.vehicleCategory ?? '')) { if (inDay) CR.noCamion++; continue }
  // Patente válida de un camión de otro lote o que no está en el Excel: es otro vehículo real.
  if (!hidden && isValidPlate(c.plate) && allExcel.has(c.plate)) { if (inDay) CR.otroDiaOVehiculo++; continue }
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
  if (inDay) { r.universo.push(U.length); r.efectivo.push(ws ? 1 / U.reduce((a, u) => a + (u.w / ws) ** 2, 0) : 0) }
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
  const pick = best && P >= THETA ? best.m : null
  if (inDay && !hidden) { if (!U.length) CR.sinCandidato++; else if (pick) CR.asignada++; else CR.sinDecidir++ }
  const before = pick && hidden ? { verdadero: { last: hidden.last, esperaMin: Math.round((c.t - hidden.lastT) / 60000) }, asignado: { last: pick.last, esperaMin: Math.round((c.t - pick.lastT) / 60000) }, rankVerdadero: scored.findIndex((x) => x.m === hidden) + 1 } : null
  if (pick) { pick.status.set(c.node, { via: 'reconstruida', t: c.t, P, prueba: !!hidden, read: hidden ? '(patente borrada para la prueba)' : c.plate, device: c.device, rivales: scored.slice(1, 3).map((x) => ({ plate: x.m.plate, p: total ? x.score / total : 0 })) }); pick.last = c.node; pick.lastT = c.t }
  if (hidden && hidden.inSample) {
    r.prueba.n++
    if (pick === hidden) r.prueba.bien++
    else if (pick) r.prueba.otro++
    else r.prueba.nada++
    if (pick && pick !== hidden) r.prueba.errores.push({ at: new Date(c.t - 240_000).toISOString(), node: c.node, device: c.device, leyo: c.plate, verdadero: hidden.plate, asignado: pick.plate, P: Math.round(P * 100), rivales: scored.slice(0, 4).map((x) => `${x.m.plate} ${Math.round((x.score / total) * 100)}%`), antes: before })
    if (pick !== hidden && !hidden.status.has(c.node) && ordered(hidden, c.node)) { hidden.status.set(c.node, { via: 'camara', t: c.t, read: hidden.plate, device: c.device }); hidden.last = c.node; hidden.lastT = c.t }
  }
}

// ── Deducidos y faltantes, por camión y por punto ──
const porPunto = {}
const porCamion = []
for (const m of lote.filter((x) => x.inSample)) {
  const st = m.exp.map((n) => m.status.get(n)?.via ?? null)
  const filledIdx = st.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  const lastFilled = filledIdx.at(-1) ?? -1
  // Deducido: sin captura, pero el camión se identificó en un punto posterior de su circuito.
  // Final del recorrido: si después de su último punto identificado no hay otra lectura suya en la visita,
  // salió por el único camino que le queda en su circuito (deducido al final).
  const seenAfter = front.some((c) => c.plate === m.plate && c.t > (m.status.get(m.exp[lastFilled])?.t ?? m.ing) && c.t <= m.vEnd && !m.exp.includes(c.node))
  const final = st.map((v, i) => v ?? (i < lastFilled ? 'deducida' : lastFilled >= 0 && !seenAfter ? 'deducidaFinal' : 'falta'))
  m.exp.forEach((n, i) => {
    if (EXCLUIDOS.has(n)) return
    const o = (porPunto[n] ??= { esperados: 0, camara: 0, reconstruida: 0, deducida: 0, deducidaFinal: 0, falta: 0 })
    o.esperados++
    o[final[i]]++
  })
  const mine = final.filter((_, i) => !EXCLUIDOS.has(m.exp[i]))
  porCamion.push({ plate: m.plate, circuit: m.circuit, pasos: mine.length, camara: mine.filter((x) => x === 'camara').length, reconstruida: mine.filter((x) => x === 'reconstruida').length, deducida: mine.filter((x) => x === 'deducida' || x === 'deducidaFinal').length, falta: mine.filter((x) => x === 'falta').length, faltan: m.exp.filter((n, i) => !EXCLUIDOS.has(n) && final[i] === 'falta'), ing: new Date(m.ing).toISOString(), sal: new Date(m.sal).toISOString(),
    pasosDetalle: m.exp.map((n, i) => ({ node: n, estado: EXCLUIDOS.has(n) ? 'excluido' : final[i], ...(m.status.get(n) ? { t: new Date(m.status.get(n).t).toISOString(), read: m.status.get(n).read, device: m.status.get(n).device, P: m.status.get(n).P, prueba: m.status.get(n).prueba, rivales: m.status.get(n).rivales } : {}) })) })
}
const med = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[s.length >> 1] }
const pc = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '—')
console.log(MUESTRA ? `muestra: ingresaron el ${MUESTRA[0]} en Q${MUESTRA[1]} → ${lote.filter((m) => m.inSample).length} camiones (universo: inventario de ${lote.length})` : '')
console.log(`${WEEK ? 'inventario de la semana 01–07/10' : `lote ingresado el ${DAY}${Q ? ` · Q${Q}` : ''}`}: ${lote.length} camiones · umbral ${THETA}`)
console.log('punto'.padEnd(36), 'esper cámara +recon +deduc +final falta  cámara%  final%  efect | capturas: total lote otro noCam sinCand sinDec asign | prueba')
const T = { esperados: 0, camara: 0, reconstruida: 0, deducida: 0, deducidaFinal: 0, falta: 0 }
for (const [n, o] of Object.entries(porPunto).sort((a, b) => b[1].esperados - a[1].esperados)) {
  for (const k of Object.keys(T)) T[k] += o[k]
  const r = res[n] ?? R(n)
  const k = r.cap
  console.log(n.padEnd(36), String(o.esperados).padStart(5), String(o.camara).padStart(6), String(o.reconstruida).padStart(6), String(o.deducida).padStart(6), String(o.deducidaFinal).padStart(6), String(o.falta).padStart(5), pc(o.camara, o.esperados).padStart(8), pc(o.camara + o.reconstruida + o.deducida + o.deducidaFinal, o.esperados).padStart(7), (med(r.efectivo) ?? 0).toFixed(1).padStart(6), '|', [k.total, k.lote, k.otroDiaOVehiculo, k.noCamion, k.sinCandidato, k.sinDecidir, k.asignada].map((x) => String(x).padStart(5)).join(' '), `| ${r.prueba.bien}/${r.prueba.n} bien, ${r.prueba.otro} mal`)
}
console.log('TOTAL'.padEnd(36), String(T.esperados).padStart(5), String(T.camara).padStart(6), String(T.reconstruida).padStart(6), String(T.deducida).padStart(6), String(T.deducidaFinal).padStart(6), String(T.falta).padStart(5), pc(T.camara, T.esperados).padStart(8), pc(T.camara + T.reconstruida + T.deducida + T.deducidaFinal, T.esperados).padStart(7))
const K = Object.values(res).reduce((a, r) => { for (const x of Object.keys(a)) a[x] += r.cap[x]; return a }, { total: 0, lote: 0, otroDiaOVehiculo: 0, noCamion: 0, sinCandidato: 0, sinDecidir: 0, asignada: 0 })
console.log('capturas (01–02/10):', JSON.stringify(K))
const pr = Object.values(res).reduce((a, r) => ({ n: a.n + r.prueba.n, bien: a.bien + r.prueba.bien, otro: a.otro + r.prueba.otro }), { n: 0, bien: 0, otro: 0 })
console.log(`prueba patente borrada: ${pr.bien}/${pr.n} bien (${pc(pr.bien, pr.n)}), ${pr.otro} a otro camión (${pc(pr.otro, pr.n)}); de las asignadas, ${pc(pr.bien, pr.bien + pr.otro)} correctas`)
const dist = {}
for (const c of porCamion) dist[c.falta] = (dist[c.falta] ?? 0) + 1
console.log('camiones por cantidad de puntos que faltan:', JSON.stringify(dist), `· completos: ${dist[0] ?? 0} de ${porCamion.length} (${pc(dist[0] ?? 0, porCamion.length)})`)
fs.mkdirSync(path.join(root, 'outputs/demostracion_lote'), { recursive: true })
console.log('circuitos corregidos por cámaras:', circuitosCambiados)
const erroresPrueba = Object.values(res).flatMap((r) => r.prueba.errores)
fs.writeFileSync(path.join(root, 'outputs/demostracion_lote/pares-inventario.json'), JSON.stringify(paresInventario) + '\n')
fs.writeFileSync(path.join(root, `outputs/demostracion_lote/lote_${WEEK ? 'semana' : DAY}${Q ? `_Q${Q}` : ''}${MUESTRA ? `_muestra_${MUESTRA.join('Q')}` : ''}.json`), JSON.stringify({ dia: DAY, umbral: THETA, porPunto, porCamion, prueba: pr, erroresPrueba }, null, 2) + '\n')
