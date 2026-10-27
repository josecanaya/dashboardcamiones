// ¿A qué camión pertenece cada lectura de cámara de la semana? Fuentes: cartas de porte (data/arca) y
// TruckFlow (feed + alertas en data/truckflow/<día>). Sin el Sistema de camiones.
// Cada lectura cae en la primera clase que la explica:
//   carta            la patente es chasis o acoplado de una carta vigente (partida −48 h … +120 h)
//   carta_corregida  a 1 carácter (o con basura alrededor) de una carta vigente que esa visita tiene bien leída
//   sin_carta        patente válida vista en ≥2 nodos distintos en ±12 h: un vehículo real sin carta
//   suelta           patente válida leída una sola vez, sin carta
//   ilegible         texto leído sin formato de patente (mala lectura)
//   sin_patente      la cámara vio un vehículo y no leyó nada (alertas LPR_MALFUNCTION, cola sin patente)
// Si hay export del DSS que cubra la semana (data/dss-export/<desde>_<dd hasta>/capturas.csv), suma sus capturas
// que no llegaron a TruckFlow y usa marca y color para rellenar pasos. Sin export, funciona igual que antes.
// Uso: node scripts/vinculo/cobertura.mjs DESDE HASTA   → reportes/vinculo/<desde>_<hasta>/cobertura.json
// VINCULO_DATA: otra carpeta de datos (por defecto ./data). VINCULO_SIN_DSS=1: ignora el export del DSS.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'
import { compareAttribute } from '../../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'
import { alertReadEvents } from '../../server/plantState/alertReads.mjs'
import { normalizeNote } from '../../server/live/padron/cartasSource.mjs'
import { NODO_SUR_LOCALITY, NODO_SUR_PLANTS, VICENTIN_CUIT } from '../../server/live/padron/padron.mjs'

const [FROM = '2026-10-19', TO = '2026-10-25'] = process.argv.slice(2)
const root = process.cwd()
const DATA = path.resolve(root, process.env.VINCULO_DATA ?? 'data')
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const dataJson = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8').replace(/^﻿/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const H = 3600_000
const DAYS = []
for (let d = addDays(FROM, -1); d <= addDays(TO, 1); d = addDays(d, 1)) DAYS.push(d)
const inWeek = (t) => arDay(t) >= FROM && arDay(t) <= TO

// ── Cámaras → nodo (frontal o trasera), del modelo de nodos ──
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const frontNode = new Map(), rearNode = new Map()
for (const n of model.nodes) {
  if (!n.hasCamera) continue
  const id = SAME[n.id] ?? n.id
  for (const d of n.devices ?? []) if (d !== 'SLZCalCam' && !frontNode.has(d.toLowerCase())) frontNode.set(d.toLowerCase(), id)
  for (const d of n.rear ?? []) if (!rearNode.has(d.toLowerCase())) rearNode.set(d.toLowerCase(), id)
}

// ── Capturas del DSS (marca, color, tipo) si hay export que cubra la semana ──
// Mismo criterio que scripts/demostracion/lote.mjs: hora DSS + 240 s, misma cámara a ±5 s.
// Si la semana no tiene capturas.csv, se arma solo con el export más nuevo que la cubra en la carpeta del DSS
// (VINCULO_DSS_ZIPS, por defecto C:\Users\Public\DSS Client: «Vehicle Capture Records-*.zip»).
const dss = new Map()
const findDssDir = () => fs.readdirSync(path.join(DATA, 'dss-export')).find((d) => /^\d{4}-\d{2}-\d{2}_\d{2}$/.test(d) && d.slice(0, 10) <= FROM && `${d.slice(0, 8)}${d.slice(11)}` >= TO && fs.existsSync(path.join(DATA, 'dss-export', d, 'capturas.csv')))
function importDss() {
  const zips = process.env.VINCULO_DSS_ZIPS ?? 'C:/Users/Public/DSS Client'
  if (!fs.existsSync(zips)) return
  const dir = path.join(DATA, 'dss-export', `${FROM}_${TO.slice(8)}`)
  const csv = path.join(dir, 'capturas.csv')
  for (const z of fs.readdirSync(zips).filter((f) => /^Vehicle Capture Records-.*\.zip$/.test(f)).sort().reverse()) {
    fs.mkdirSync(dir, { recursive: true })
    const [n, first, last] = execFileSync('python', ['-I', path.join(root, 'scripts/demostracion/dss-xlsx-a-csv.py'), path.join(zips, z), csv, addDays(FROM, -1), addDays(TO, 1)], { encoding: 'utf8' }).trim().split(/\s+(?=\d{4}-)/)
    // Tiene que cubrir de 22:00 del día anterior a las 02:00 del día siguiente (hora de cámara).
    if (Number(n.split(' ')[0]) && first <= `${addDays(FROM, -1)} 22:00` && last >= `${addDays(TO, 1)} 02:00`) { console.log(`export del DSS importado de ${z}: ${n} filas`); return }
    fs.rmSync(csv)
  }
  console.log('ningún export del DSS cubre la semana entera: sigo sin DSS')
}
let dssDir = null
if (!process.env.VINCULO_SIN_DSS) { dssDir = findDssDir(); if (!dssDir) { importDss(); dssDir = findDssDir() } }
if (dssDir) {
  const lines = fs.readFileSync(path.join(DATA, 'dss-export', dssDir, 'capturas.csv'), 'utf8').trim().split(/\r?\n/)
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
const dssAt = (dev, t, plate, used) => {
  let best = null
  for (const r of dss.get(dev.toLowerCase()) ?? []) {
    if (r.t < t - 5000) continue
    if (r.t > t + 5000) break
    if (used.has(r.row)) continue
    const s = (r.plate === plate ? 0 : 10_000) + Math.abs(r.t - t)
    if (!best || s < best.s) best = { ...r, s }
  }
  return best
}

// ── Lecturas: feed + alertas (las que no entraron a ningún viaje) + capturas que solo tiene el DSS ──
const caps = []
const feed = []
for (const d of DAYS) {
  const f = `truckflow/${d}/event-list.json`
  if (!fs.existsSync(path.join(DATA, f))) continue
  const o = dataJson(f)
  for (const e of Array.isArray(o) ? o : o.records ?? []) {
    if (e.inferred || e.manualCorrection || e.eventCategory !== 'physical') continue
    feed.push(e)
  }
}
const alerts = DAYS.flatMap((d) => { const f = `truckflow/${d}/alert-list.json`; if (!fs.existsSync(path.join(DATA, f))) return []; const o = dataJson(f); return Array.isArray(o) ? o : o.records ?? o.value ?? [] })
const usedDss = new Set()
for (const [src, list] of [['feed', feed], ['alerta', alertReadEvents(alerts, feed)]]) {
  for (const e of list) {
    const dev = String(e.deviceCode ?? '').toLowerCase()
    const node = frontNode.get(dev) ?? rearNode.get(dev)
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t) || !inWeek(t)) continue
    const plate = plateOf(e.normalizedPlate || e.truckPlate)
    const a = dssAt(e.deviceCode, t, plate, usedDss)
    if (a) usedDss.add(a.row)
    caps.push({ src, node, rear: !frontNode.has(dev), device: e.deviceCode, t, plate, journey: e.journeyUid ?? null, attrs: a })
  }
}
const dssMatched = caps.filter((c) => c.attrs).length
for (const [dev, list] of dss) {
  const node = frontNode.get(dev) ?? rearNode.get(dev)
  if (!node) continue
  for (const r of list) if (!usedDss.has(r.row) && inWeek(r.t)) caps.push({ src: 'dss', node, rear: !frontNode.has(dev), device: r.device, t: r.t, plate: r.plate, journey: null, attrs: r })
}
caps.sort((a, b) => a.t - b.t)

// ── Cartas del Nodo Sur (entran, internas o salen) con su ventana de visita ──
const cartas = dataJson('arca/arca_consignment_notes.json').map(normalizeNote).filter((n) => n.departure && (
  (n.destCuit === VICENTIN_CUIT && (n.locality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.plant))) ||
  (n.originCuit === VICENTIN_CUIT && (n.originLocality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.originPlant)))))
const cartasByPlate = new Map()
for (const n of cartas) {
  const dep = Date.parse(n.departure)
  const c = { ...n, from: dep - 48 * H, to: dep + 120 * H }
  for (const p of n.plates) cartasByPlate.set(p, [...(cartasByPlate.get(p) ?? []), c])
}
const cartaAt = (plate, t) => (cartasByPlate.get(plate) ?? []).find((c) => t >= c.from && t <= c.to) ?? null

// ── Distancia de lectura (con núcleos de formato válido dentro de lecturas con basura) ──
const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
function plateCores(read) {
  if (!read || isValidPlate(read)) return []
  const out = []
  for (const n of [6, 7]) for (let i = 0; i + n <= read.length; i++) { const s = read.slice(i, i + n); if (isValidPlate(s)) out.push(s) }
  return out
}
const readDist = (read, real) => Math.min(editDist(read, real), ...plateCores(read).map((s) => editDist(s, real)))

// Camiones con carta presentes cerca de cada hora: lecturas exactas por patente de carta.
const exactByPlate = new Map()
for (const c of caps) if (cartaAt(c.plate, c.t)) exactByPlate.set(c.plate, [...(exactByPlate.get(c.plate) ?? []), c.t])
const present = (t) => [...exactByPlate].filter(([, ts]) => ts.some((x) => Math.abs(x - t) <= 6 * H)).map(([p]) => p)

// Misma patente en otros nodos (±12 h) → vehículo real.
const byPlate = new Map()
for (const c of caps) byPlate.set(c.plate, [...(byPlate.get(c.plate) ?? []), c])

const counts = {}
const perNode = {}
const samples = { carta_corregida: [], sin_carta: [], mismo_paso: [], suelta: [], ilegible: [], sin_patente: [] }
const sinCartaPlates = new Map()
for (const c of caps) {
  let cls
  let detail = null
  const exact = cartaAt(c.plate, c.t)
  if (exact) cls = 'carta'
  else {
    const near = present(c.t).map((p) => ({ p, d: readDist(c.plate, p) })).filter((x) => x.d <= 1).sort((a, b) => a.d - b.d)
    // Una sola carta parecida: corregida. Dos o más a la misma distancia: ambigua, no se fuerza.
    if (c.plate && near.length && (near.length === 1 || near[0].d < near[1].d)) { cls = 'carta_corregida'; detail = near[0].p }
    else if (isValidPlate(c.plate)) {
      const otherNodes = new Set((byPlate.get(c.plate) ?? []).filter((o) => Math.abs(o.t - c.t) <= 12 * H).map((o) => o.node))
      cls = otherNodes.size >= 2 ? 'sin_carta' : 'suelta'
      if (cls === 'sin_carta') sinCartaPlates.set(c.plate, new Set([...(sinCartaPlates.get(c.plate) ?? []), ...otherNodes]))
    } else cls = c.plate.length < 4 ? 'sin_patente' : 'ilegible'
  }
  c.cls = cls
  c.vehicle = cls === 'carta' || cls === 'sin_carta' ? c.plate : detail
}

// Mismo paso: una lectura sin vincular (suelta, mal leída o sin patente) con UN solo vehículo conocido leído
// en el mismo nodo a ±60 s es ese mismo paso (frontal + trasera, lectura doble, alerta que repite el feed).
const SAME_PASS_MS = 60_000
const known = new Map()
for (const c of caps) if (c.vehicle) known.set(c.node, [...(known.get(c.node) ?? []), c])
for (const c of caps) {
  if (c.vehicle) continue
  const vehicles = new Set((known.get(c.node) ?? []).filter((o) => Math.abs(o.t - c.t) <= SAME_PASS_MS).map((o) => o.vehicle))
  if (vehicles.size === 1) { c.orig = c.cls; c.cls = 'mismo_paso'; c.vehicle = [...vehicles][0] }
}

for (const c of caps) {
  const cls = c.cls
  counts[cls] = (counts[cls] ?? 0) + 1
  perNode[c.node] ??= {}
  perNode[c.node][cls] = (perNode[c.node][cls] ?? 0) + 1
  if (samples[cls] && samples[cls].length < 40) samples[cls].push({ plate: c.plate, node: c.node, device: c.device, at: new Date(c.t - 3 * H).toISOString().slice(0, 16), src: c.src, ...(c.vehicle && c.vehicle !== c.plate ? { vehiculo: c.vehicle } : {}), ...(c.orig ? { antes: c.orig } : {}) })
}

const total = caps.length
const pct = (n) => `${((n / total) * 100).toFixed(1)} %`
const linked = (counts.carta ?? 0) + (counts.carta_corregida ?? 0)
console.log(`Semana ${FROM} → ${TO}: ${total} lecturas (${caps.filter((c) => c.src === 'alerta').length} solo como alerta, ${caps.filter((c) => c.src === 'dss').length} solo en el DSS)`)
console.log(dssDir ? `  export del DSS ${dssDir}: ${dssMatched} lecturas de TruckFlow con marca/color/tipo` : '  sin export del DSS para esta semana')
for (const k of ['carta', 'carta_corregida', 'sin_carta', 'mismo_paso', 'suelta', 'ilegible', 'sin_patente']) console.log(`  ${k.padEnd(16)} ${String(counts[k] ?? 0).padStart(6)}  ${pct(counts[k] ?? 0)}`)
const toCarta = caps.filter((c) => c.vehicle && (cartasByPlate.has(c.vehicle))).length
const toVehicle = caps.filter((c) => c.vehicle).length
console.log(`  → vinculadas a una carta: ${linked} directas, ${toCarta} con el mismo paso (${pct(toCarta)})`)
console.log(`  → vinculadas a algún vehículo (carta o sin carta): ${toVehicle} (${pct(toVehicle)})`)
console.log('\nPor nodo (carta+corregida / total):')
for (const [node, o] of Object.entries(perNode).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))) {
  const n = Object.values(o).reduce((s, v) => s + v, 0)
  const l = (o.carta ?? 0) + (o.carta_corregida ?? 0)
  console.log(`  ${node.padEnd(42)} ${String(l).padStart(5)} / ${String(n).padStart(5)}  ${((l / n) * 100).toFixed(0).padStart(3)} %   sin_carta ${o.sin_carta ?? 0} · suelta ${o.suelta ?? 0} · ilegible ${o.ilegible ?? 0} · sin patente ${o.sin_patente ?? 0}`)
}

// ── ¿Cada camión con carta tiene todos sus pasos? ──
// Circuito = el del modelo de nodos que mejor encaja con lo leído (más nodos esperados vistos, menos faltantes).
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
const LIQUID_NODES = new Set(['ricardone:Liquidos Carga/Descarga', 'san_lorenzo:Carga/Descarga Renova', 'san_lorenzo:Carga / Descarga OSL', 'san_lorenzo:Carga/descarga'])
const circuits = model.circuits.map((c) => {
  const exp = []
  for (const raw of c.seq) {
    const id = SAME[raw] ?? raw
    const n = nodeById.get(id)
    if (n?.hasCamera && !n.optional && !NO_MEDIBLES.has(id) && !exp.includes(id)) exp.push(id)
  }
  return { id: c.id, exp, liquid: c.seq.some((s) => LIQUID_NODES.has(s)) }
}).filter((c) => c.exp.length && !c.liquid) // las cartas de porte son de granos: nunca un circuito de líquidos
const capsByVehicle = new Map()
for (const c of caps) if (c.vehicle) capsByVehicle.set(c.vehicle, [...(capsByVehicle.get(c.vehicle) ?? []), c])
const trucks = []
for (const n of cartas) {
  const dep = Date.parse(n.departure)
  const mine = n.plates.flatMap((p) => capsByVehicle.get(p) ?? []).filter((c) => c.t >= dep - 48 * H && c.t <= dep + 120 * H)
  if (!mine.length || !inWeek(mine[0].t)) continue
  const seen = new Set(mine.map((c) => c.node))
  // Puntaje: nodos esperados vistos − esperados que faltan − nodos vistos que el circuito no explica
  // (sin este último, SL3 le ganaba a R7 a un camión leído en la Calada y la Salida 2 de Ricardone).
  const score = (c) => c.hit - c.miss.length - c.extra
  const best = circuits.map((c) => ({ ...c, hit: c.exp.filter((x) => seen.has(x)).length, miss: c.exp.filter((x) => !seen.has(x)), extra: [...seen].filter((x) => !c.exp.includes(x)).length }))
    .sort((a, b) => score(b) - score(a) || a.exp.length - b.exp.length)[0]
  trucks.push({ ctg: n.ctg, plate: n.plates[0], circuit: best.id, expected: best.exp.length, missing: best.miss, byClass: Object.fromEntries([...new Set(mine.map((c) => c.cls))].map((k) => [k, mine.filter((c) => c.cls === k).length])) })
}
// ── Rellenar los pasos que faltan (lote: el universo son los camiones con ese paso pendiente) ──
// Cada hueco (camión × nodo sin lectura) busca lecturas sin vincular de ese nodo entre su paso anterior y el
// siguiente. Puntaje = parecido de patente × qué tan bien encaja la hora con el tiempo típico del tramo
// (medido en los camiones bien leídos). Se asigna de mejor a peor y solo si le gana con margen a la segunda.
// --prueba: a 1 de cada 4 pasos leídos se les borra la patente y se los da por faltantes; acierto = la
// lectura vuelve al camión que era.
const TEST = process.argv.includes('--prueba')
const TEST_EVERY = 4
// Semana 19–25/10, prueba sin patente. Sin DSS, margen 2: 93 % de aciertos; 1,2 → 79 %, 3 → 95 % pero recupera
// la mitad. Con DSS (marca), margen 3: 93 % de aciertos y recupera 32 % en vez de 18 %.
const MARGIN = Number(process.env.VINCULO_MARGEN ?? (dss.size ? 3 : 2))
let testIdx = 0
for (const tr of trucks) tr.plates = cartas.find((x) => x.ctg === tr.ctg).plates
const firstAtOf = new Map()
for (const tr of trucks) {
  const n = cartas.find((x) => x.ctg === tr.ctg)
  const dep = Date.parse(n.departure)
  tr.mine = n.plates.flatMap((p) => capsByVehicle.get(p) ?? []).filter((c) => c.t >= dep - 48 * H && c.t <= dep + 120 * H)
  const firstAt = new Map()
  for (const c of tr.mine) if (!firstAt.has(c.node) || c.t < firstAt.get(c.node)) firstAt.set(c.node, c.t)
  firstAtOf.set(tr, firstAt)
}
// Tiempos de tramo A→B (B = el siguiente nodo esperado leído) de los camiones bien leídos.
const gaps = new Map()
for (const tr of trucks) {
  const fa = firstAtOf.get(tr)
  const exp = circuits.find((c) => c.id === tr.circuit).exp.filter((x) => fa.has(x))
  for (let i = 0; i + 1 < exp.length; i++) {
    const g = fa.get(exp[i + 1]) - fa.get(exp[i])
    if (g > 0) gaps.set(`${exp[i]}>${exp[i + 1]}`, [...(gaps.get(`${exp[i]}>${exp[i + 1]}`) ?? []), g])
  }
}
const transit = new Map([...gaps].map(([k, l]) => {
  l.sort((x, y) => x - y)
  const q = (p) => l[Math.min(l.length - 1, Math.floor(p * l.length))]
  return [k, { n: l.length, med: q(0.5), scale: Math.max(5 * 60_000, (q(0.75) - q(0.25)) / 2) }]
}))

const slots = []
for (const tr of trucks) {
  const fa = firstAtOf.get(tr)
  const circuit = circuits.find((c) => c.id === tr.circuit)
  tr.status = {}
  for (const node of circuit.exp) {
    if (!fa.has(node)) { tr.status[node] = 'falta'; continue }
    tr.status[node] = 'camara'
    if (TEST && testIdx++ % TEST_EVERY === 0) {
      for (const c of tr.mine.filter((c) => c.node === node)) { c.vehicle = null; c.testOf = tr.ctg; c.plate = '' }
      fa.delete(node)
      tr.status[node] = 'prueba'
    }
  }
  circuit.exp.forEach((node, i) => {
    if (tr.status[node] !== 'falta' && tr.status[node] !== 'prueba') return
    const prev = circuit.exp.slice(0, i).filter((x) => fa.has(x)).at(-1)
    const next = circuit.exp.slice(i + 1).find((x) => fa.has(x))
    if (!prev && !next) return
    const from = prev ? fa.get(prev) : fa.get(next) - 6 * H
    const to = next ? fa.get(next) : fa.get(prev) + 6 * H
    // Hora esperada en el nodo: desde el paso anterior (tramo prev→nodo) y/o hacia el siguiente (nodo→next).
    const est = []
    const tp = prev && transit.get(`${prev}>${node}`)
    const tn = next && transit.get(`${node}>${next}`)
    if (tp) est.push({ at: fa.get(prev) + tp.med, scale: tp.scale })
    if (tn) est.push({ at: fa.get(next) - tn.med, scale: tn.scale })
    slots.push({ truck: tr, node, from, to, est, bounded: Boolean(prev && next) })
  })
}
const freeByNode = new Map()
for (const c of caps) if (!c.vehicle) freeByNode.set(c.node, [...(freeByNode.get(c.node) ?? []), c])
// Perfil de marca de cada camión con carta (frontal y trasera por separado: la trasera ve el acoplado), armado
// con sus lecturas exactas de la semana. Las lecturas borradas de la prueba no cuentan.
// Solo la marca: con color la prueba acierta un poco menos (92,6 % contra 93,2 %) y el tipo no sirve
// (en balanzas y calada el DSS confunde camión con camioneta por el ángulo). Pesar más una marca rara que
// Mercedes tampoco cambió nada (93,6 %).
const USE_ATTRS = dss.size > 0 && !process.env.VINCULO_SIN_ATRIBUTOS
const profile = new Map()
for (const tr of trucks) {
  const p = { f: {}, t: {} }
  for (const c of tr.mine) {
    const v = c.attrs?.vehicleBrand
    if (!v || c.testOf || c.cls !== 'carta' || /unknown|unrecognized/i.test(v)) continue
    const side = p[c.rear ? 't' : 'f']
    side[v] = (side[v] ?? 0) + 1
  }
  profile.set(tr, p)
}
const mode = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
const lrAttrs = (c, tr) => (USE_ATTRS && c.attrs ? compareAttribute('marca', c.attrs.vehicleBrand, mode(profile.get(tr)[c.rear ? 't' : 'f'])).lr : 1)
// Parecido de patente (si la lectura no trae nada, neutro) × marca del DSS.
const affinity = (c, s) => {
  const attrs = lrAttrs(c, s.truck)
  if (!c.plate) return 0.5 * attrs
  const d = Math.min(...s.truck.plates.map((p) => readDist(c.plate, p)))
  return (d <= 1 ? 1 : d <= 2 ? 0.7 : d >= 4 ? 0.05 : 0.3) * attrs
}
const timeFit = (c, s) => s.est.length ? Math.max(...s.est.map((e) => Math.exp(-Math.abs(c.t - e.at) / e.scale))) : 0.3
const pairs = []
for (const s of slots) for (const c of freeByNode.get(s.node) ?? []) {
  if (c.t <= s.from || c.t >= s.to) continue
  const score = affinity(c, s) * timeFit(c, s)
  if (score > 0.02) pairs.push({ s, c, score })
}
pairs.sort((a, b) => b.score - a.score)
const bySlot = new Map(), byCap = new Map()
for (const p of pairs) { bySlot.set(p.s, [...(bySlot.get(p.s) ?? []), p]); byCap.set(p.c, [...(byCap.get(p.c) ?? []), p]) }
const taken = new Set()
const secondBest = (list, self, ok) => list.filter((p) => p !== self && ok(p)).reduce((m, p) => Math.max(m, p.score), 0)
for (let pass = 0, changed = true; changed && pass < 6; pass++) {
  changed = false
  for (const p of pairs) {
    if (p.s.filled || taken.has(p.c)) continue
    // Que la lectura sea la mejor del hueco y el hueco el mejor de la lectura, con margen sobre la segunda.
    const otherCap = secondBest(bySlot.get(p.s), p, (o) => !taken.has(o.c) && Math.abs(o.c.t - p.c.t) > SAME_PASS_MS)
    const otherSlot = secondBest(byCap.get(p.c), p, (o) => !o.s.filled)
    if (p.score < MARGIN * otherCap || p.score < MARGIN * otherSlot) continue
    for (const o of freeByNode.get(p.s.node)) if (Math.abs(o.t - p.c.t) <= SAME_PASS_MS) taken.add(o)
    p.s.filled = p.c
    changed = true
  }
}
let ok = 0, bad = 0, none = 0
for (const s of slots) {
  if (s.truck.status[s.node] === 'prueba') {
    if (!s.filled) none++
    else if (s.filled.testOf === s.truck.ctg) ok++
    else bad++
  }
  s.truck.status[s.node] = s.filled ? 'reconstruido' : s.bounded ? 'deducido' : 'falta'
}
const tally = {}
for (const tr of trucks) for (const v of Object.values(tr.status)) tally[v] = (tally[v] ?? 0) + 1
const nSteps = Object.values(tally).reduce((a, b) => a + b, 0)
console.log(`\nAlgoritmo por lote sobre los pasos de los camiones con carta (${nSteps} pasos${TEST ? `, con prueba en 1 de cada ${TEST_EVERY}` : ''}):`)
for (const k of ['camara', 'reconstruido', 'deducido', 'falta']) console.log(`  ${k.padEnd(13)} ${String(tally[k] ?? 0).padStart(5)}  ${(((tally[k] ?? 0) / nSteps) * 100).toFixed(1)} %`)
if (TEST) console.log(`  prueba: ${ok} bien · ${bad} mal · ${none} sin asignar (de ${ok + bad + none}) → aciertos ${((ok / Math.max(1, ok + bad)) * 100).toFixed(1)} % de lo asignado, recupera ${((ok / Math.max(1, ok + bad + none)) * 100).toFixed(1)} %`)
for (const tr of trucks) tr.missing = Object.entries(tr.status).filter(([, v]) => v === 'falta').map(([k]) => k)

const complete = trucks.filter((t) => !t.missing.length).length
const missByNode = {}
for (const t of trucks) for (const m of t.missing) missByNode[m] = (missByNode[m] ?? 0) + 1
const steps = trucks.reduce((s, t) => s + t.expected, 0)
const missing = trucks.reduce((s, t) => s + t.missing.length, 0)
console.log(`\nCamiones con carta que llegaron: ${trucks.length} · completos ${complete} (${((complete / trucks.length) * 100).toFixed(1)} %) · pasos ${steps - missing}/${steps} (${(((steps - missing) / steps) * 100).toFixed(1)} %)`)
console.log('  por circuito:', Object.entries(trucks.reduce((o, t) => ({ ...o, [t.circuit]: (o[t.circuit] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))
console.log('  pasos que faltan por nodo:')
for (const [k, v] of Object.entries(missByNode).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(42)} ${v}`)

const out = path.join(root, 'reportes/vinculo', `${FROM}_${TO}`)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'cobertura.json'), JSON.stringify({
  desde: FROM, hasta: TO, total, counts, perNode, samples, transit: Object.fromEntries([...transit].map(([k, v]) => [k, { n: v.n, medMin: Math.round(v.med / 60_000) }])),
  camiones: trucks.map(({ mine, ...t }) => t),
  sinCarta: [...sinCartaPlates].map(([plate, nodes]) => ({ plate, lecturas: byPlate.get(plate).length, nodos: [...nodes] })).sort((a, b) => b.lecturas - a.lecturas),
}, null, 1))
console.log(`\n→ ${path.relative(root, out)}/cobertura.json`)
