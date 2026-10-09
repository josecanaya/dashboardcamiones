// Inventario por nodo, solo con cámaras. Las capturas se procesan en orden de hora. Cada camión tiene su
// último punto; el universo de un nodo son los camiones cuyo último punto es el anterior a ese nodo en su
// circuito (o el de antes, salteando una cámara, con menos peso) y que todavía no pasaron por él. Una
// captura dudosa se compara solo contra ese universo + «primera vista». Al asignarla, el camión sale del
// universo de ese nodo y entra al del siguiente.
// Prueba: a 1 de cada 4 lecturas buenas de camiones conocidos se le borra la patente; ¿vuelve a su camión?
// Uso: node scripts/demostracion/inventario-nodos.mjs [días=2] [umbral=0.6]
import fs from 'node:fs'
import path from 'node:path'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'
import { readLikelihood, neverSeenReadLikelihood, DAMAGED_READ, pInicioTable } from '../../server/plantState/nodeModelScore.mjs'
import { compareAttribute } from '../../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].slice(0, Number(process.argv[2] ?? 2))
const THETA = Number(process.argv[3] ?? 0.6)
const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const franja = (ms) => { const h = new Date(ms - 3 * 3600_000).getUTCHours(); return h >= 6 && h < 18 ? 'dia' : 'noche' }
const H8 = 8 * 3600_000

// ── Modelo de nodos: cámara → nodo, y nodos anteriores de cada nodo en los circuitos ──
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const camNode = (id) => { const n = nodeById.get(SAME[id] ?? id); return n?.hasCamera && !n.optional ? SAME[id] ?? id : null }
const deviceNode = new Map()
for (const n of model.nodes) {
  if (!n.hasCamera) continue
  for (const d of n.devices ?? []) if (d !== 'SLZCalCam' && !deviceNode.has(d.toLowerCase())) deviceNode.set(d.toLowerCase(), SAME[n.id] ?? n.id)
}
const pred1 = new Map(), pred2 = new Map()
const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v) }
for (const c of model.circuits) {
  const seq = c.seq.map(camNode).filter(Boolean).filter((x, i, a) => x !== a[i - 1])
  for (let i = 1; i < seq.length; i++) { add(pred1, seq[i], seq[i - 1]); if (i > 1) add(pred2, seq[i], seq[i - 2]) }
}
const logical = (id) => { const n = nodeById.get(id); return n.plant === 'san_lorenzo' ? `SL_${n.code}` : n.code }
const pIni = pInicioTable()

// ── Capturas frontales: feed + las que solo están en el DSS, con color/marca/tipo ──
const dss = new Map()
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
for (const d of [addDays(DAYS[0], -1), ...DAYS]) {
  const f = `data/truckflow/${d}/event-list.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const e of Array.isArray(o) ? o : o.records ?? []) {
    if (e.inferred || e.manualCorrection || e.eventCategory !== 'physical') continue
    const node = deviceNode.get(String(e.deviceCode ?? '').toLowerCase())
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t)) continue
    const plate = plateOf(e.normalizedPlate || e.truckPlate)
    const a = dssAt(e.deviceCode, t, plate)
    if (a) usedDss.add(a.row)
    caps.push({ node, device: e.deviceCode, t, plate, attrs: a })
  }
}
for (const [dev, list] of dss) {
  const node = deviceNode.get(dev)
  if (!node) continue
  for (const r of list) if (!usedDss.has(r.row)) caps.push({ node, device: r.device, t: r.t, plate: r.plate, attrs: r })
}
// Dedupe: la misma patente en el mismo nodo a menos de 2 min es la misma pasada (frente de otra cámara).
caps.sort((a, b) => a.t - b.t)
const lastSeenAt = new Map()
const stream = caps.filter((c) => {
  const k = `${c.node}|${c.plate}`
  const p = lastSeenAt.get(k)
  lastSeenAt.set(k, c.t)
  return !(p != null && c.t - p < 120_000 && isValidPlate(c.plate))
})

// ── Tiempo de cada tramo A → N medido con lecturas buenas consecutivas de la misma patente ──
// Se usa como peso (no como filtro): la chance de que un camión que espera hace e minutos llegue
// justo ahora es f(e) / S(e) (llega ahora, dado que todavía no llegó).
const BIN = 2 * 60_000, NB = Math.ceil(H8 / BIN)
const gapHist = new Map()
{
  const last = new Map()
  for (const c of stream) {
    if (!isValidPlate(c.plate)) continue
    const l = last.get(c.plate)
    if (l && l.node !== c.node && c.t - l.t < H8 && pred1.get(c.node)?.has(l.node)) {
      const k = `${l.node}>${c.node}`
      if (!gapHist.has(k)) gapHist.set(k, new Array(NB).fill(0))
      gapHist.get(k)[Math.min(NB - 1, Math.floor((c.t - l.t) / BIN))]++
    }
    last.set(c.plate, c)
  }
}
const hazardCache = new Map()
function hazard(from, to, e) {
  const k = `${from}>${to}`
  let h = hazardCache.get(k)
  if (!h) {
    const hist = gapHist.get(k)
    const n = hist ? hist.reduce((a, b) => a + b, 0) : 0
    h = new Array(NB).fill(1 / NB)
    if (n >= 20) {
      // Suavizado: cada bin con 3 vecinos y un piso, para que un tramo con pocos datos no anule a nadie.
      const sm = hist.map((_, i) => (hist[Math.max(0, i - 1)] + hist[i] + hist[Math.min(NB - 1, i + 1)]) / 3 + n * 0.0005)
      const tot = sm.reduce((a, b) => a + b, 0)
      let surv = 1
      for (let i = 0; i < NB; i++) { const f = sm[i] / tot; h[i] = f / Math.max(surv, 1e-6); surv -= f }
    }
    hazardCache.set(k, h)
  }
  return h[Math.min(NB - 1, Math.max(0, Math.floor(e / BIN)))]
}

const NOT_TRUCK = /sedan|suv|pickup|van|car\b|motor|mpv|hatchback/i
const isTruckLooking = (c) => !c.attrs || !NOT_TRUCK.test(c.attrs.vehicleCategory ?? '')

// ── Estado: dónde está cada camión ──
const state = new Map() // patente → { node, t, attrs: {color:{},...} }
const attrsMode = (st) => {
  if (!st?.attrs) return null
  const m = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { vehicleColor: m(st.attrs.vehicleColor), vehicleBrand: m(st.attrs.vehicleBrand), vehicleCategory: m(st.attrs.vehicleCategory) }
}
const remember = (plate, c) => {
  const st = state.get(plate) ?? { attrs: { vehicleColor: {}, vehicleBrand: {}, vehicleCategory: {} }, visited: new Map() }
  st.node = c.node
  st.t = c.t
  st.visited.set(c.node, c.t)
  if (c.attrs) for (const k of Object.keys(st.attrs)) { const v = c.attrs[k]; if (v && !/unknown|unrecognized/i.test(v)) st.attrs[k][v] = (st.attrs[k][v] ?? 0) + 1 }
  state.set(plate, st)
}
// Universo del nodo N a la hora t: último punto = anterior a N (peso 1) o el de antes (peso 0,25),
// visto hace 8 h o menos, y sin pasar por N en esta visita.
function universe(N, t) {
  const out = []
  for (const [plate, st] of state) {
    if (t - st.t > H8 || t <= st.t) continue
    const passed = st.visited.get(N)
    if (passed != null && t - passed < H8) continue
    const w = pred1.get(N)?.has(st.node) ? 1 : pred2.get(N)?.has(st.node) ? 0.25 : 0
    if (w) out.push({ plate, w: w * hazard(st.node, N, t - st.t), st })
  }
  return out
}
const lrAttrs = (a, b) => (!a || !b ? 1 : ['vehicleColor', 'vehicleBrand', 'vehicleCategory'].reduce((p, k, i) => p * compareAttribute(['color', 'marca', 'tipo'][i], a[k], b[k]).lr, 1))

// ── Recorrido ──
const res = {}
const R = (node) => (res[node] ??= { capturas: 0, buenas: 0, dudosas: 0, asignadas: 0, universo: [], efectivo: [], prueba: { n: 0, bien: 0, otra: 0, nada: 0 } })
let hideCounter = 0
for (const c of stream) {
  const inWeek = DAYS.includes(arDay(c.t))
  const r = R(c.node)
  const known = isValidPlate(c.plate) && state.has(c.plate)
  // Prueba: borrar la patente a 1 de cada 4 lecturas buenas de camiones conocidos que estaban esperando aquí.
  let hidden = null
  if (inWeek && known && universe(c.node, c.t).some((u) => u.plate === c.plate) && hideCounter++ % 4 === 0) hidden = c.plate
  const plate = hidden ? 'ILEGIBLE' : c.plate
  if (inWeek) r.capturas++
  // Lectura buena: patente válida de un camión que ya conocemos, o primera vista en un punto de entrada.
  if (!hidden && isValidPlate(plate) && (state.has(plate) || (pIni.nodes[logical(c.node)]?.pInicio?.[franja(c.t)] ?? 1) >= 0.5)) {
    if (inWeek) r.buenas++
    remember(plate, c)
    continue
  }
  if (!isTruckLooking(c) && !hidden) continue // auto o camioneta: no se compara con camiones
  // Dudosa: solo contra el universo del nodo + primera vista.
  const U = universe(c.node, c.t)
  if (inWeek) { r.dudosas++; r.universo.push(U.length); const ws = U.reduce((a, u) => a + u.w, 0); r.efectivo.push(ws ? 1 / U.reduce((a, u) => a + (u.w / ws) ** 2, 0) : 0) }
  const p0 = pIni.nodes[logical(c.node)]?.pInicio?.[franja(c.t)] ?? 0.5
  const wsum = Math.max(1, U.reduce((s, u) => s + u.w, 0))
  const scored = U.map((u) => {
    const L = plate === 'ILEGIBLE' ? DAMAGED_READ : Math.max(DAMAGED_READ, readLikelihood(plate, u.plate, 0.75))
    return { plate: u.plate, score: ((1 - p0) * u.w / wsum) * L * lrAttrs(c.attrs, attrsMode(u.st)) }
  })
  const never = p0 * (plate === 'ILEGIBLE' ? DAMAGED_READ : neverSeenReadLikelihood(plate, isValidPlate(plate), 0.75, new Set(U.map((u) => u.plate))))
  const total = scored.reduce((s, x) => s + x.score, 0) + never
  const best = scored.sort((a, b) => b.score - a.score)[0]
  const P = best && total ? best.score / total : 0
  const assigned = best && P >= THETA ? best.plate : null
  if (assigned) { remember(assigned, c); if (inWeek) r.asignadas++ }
  else if (isValidPlate(plate)) remember(plate, c) // primera vista: entra al inventario
  if (hidden && inWeek) {
    r.prueba.n++
    if (assigned === hidden) r.prueba.bien++
    else if (assigned) r.prueba.otra++
    else r.prueba.nada++
    if (!assigned) remember(hidden, c) // la prueba no debe dejar al camión fuera del inventario
  }
}

const med = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[s.length >> 1] }
const out = {}
let T = { n: 0, bien: 0, otra: 0 }
console.log(`inventario por nodo · días ${DAYS.join(', ')} · umbral ${THETA}`)
for (const [node, r] of Object.entries(res).sort((a, b) => b[1].capturas - a[1].capturas)) {
  if (!r.capturas) continue
  const p = r.prueba
  T.n += p.n; T.bien += p.bien; T.otra += p.otra
  out[node] = { ...r, universoMediana: med(r.universo), efectivoMediana: med(r.efectivo), universo: undefined, efectivo: undefined }
  console.log(`${node.padEnd(38)} capturas ${String(r.capturas).padStart(5)} buenas ${String(r.buenas).padStart(5)} dudosas ${String(r.dudosas).padStart(5)} asignadas ${String(r.asignadas).padStart(4)} · universo ${String(med(r.universo) ?? '-').padStart(3)} → efectivo ${(med(r.efectivo) ?? 0).toFixed(1).padStart(5)} · prueba: ${p.bien}/${p.n} bien, ${p.otra} a otro, ${p.nada} sin asignar`)
}
console.log(`TOTAL prueba: ${T.bien}/${T.n} bien (${(T.bien / T.n * 100).toFixed(1)}%), ${T.otra} a otro camión (${(T.otra / T.n * 100).toFixed(1)}%)`)
fs.mkdirSync(path.join(root, 'outputs/demostracion_inventario'), { recursive: true })
fs.writeFileSync(path.join(root, 'outputs/demostracion_inventario/resultado.json'), JSON.stringify({ dias: DAYS, umbral: THETA, porNodo: out, total: T }, null, 2) + '\n')
