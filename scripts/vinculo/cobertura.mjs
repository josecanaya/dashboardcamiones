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
const loaded = (t) => DAYS.includes(arDay(t)) // ±1 día: la visita de un camión que entra el último día termina el siguiente

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
// Una alerta en la misma cámara a ±2 s de otra lectura es la misma captura repetida (TruckFlow manda la del
// feed y 1 o 2 alertas vacías): no es otra candidata. 20/10 22:43, Pre ingreso: dos alertas vacías de la
// lectura de OKW772 empataban con RZI017 (HZT017) y el paso no se asignaba.
const seenAt = new Map()
const dupCapture = (dev, t) => (seenAt.get(dev) ?? []).some((x) => Math.abs(x - t) <= 2000)
for (const [src, list] of [['feed', feed], ['alerta', alertReadEvents(alerts, feed)]]) {
  for (const e of list) {
    const dev = String(e.deviceCode ?? '').toLowerCase()
    const node = frontNode.get(dev) ?? rearNode.get(dev)
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t) || !loaded(t)) continue
    if (src === 'alerta' && dupCapture(dev, t)) continue
    seenAt.set(dev, [...(seenAt.get(dev) ?? []), t])
    const tfPlate = plateOf(e.normalizedPlate || e.truckPlate)
    const a = dssAt(e.deviceCode, t, tfPlate, usedDss)
    if (a) usedDss.add(a.row)
    // TruckFlow sin patente pero el DSS la leyó en la misma captura: vale la del DSS (HZT017, 20/10 22:45:
    // TruckFlow vacío, DSS «RZI017»).
    const plate = tfPlate || a?.plate || ''
    // La marca que traen las alertas no se usa: medido 19–25/10, baja los aciertos de la prueba de 95,5 % a 91,7 %
    // con DSS y no recupera nada más sin DSS.
    caps.push({ src, node, rear: !frontNode.has(dev), device: e.deviceCode, t, plate, journey: e.journeyUid ?? null, attrs: a })
  }
}
const dssMatched = caps.filter((c) => c.attrs).length
for (const [dev, list] of dss) {
  const node = frontNode.get(dev) ?? rearNode.get(dev)
  if (!node) continue
  for (const r of list) if (!usedDss.has(r.row) && loaded(r.t)) caps.push({ src: 'dss', node, rear: !frontNode.has(dev), device: r.device, t: r.t, plate: r.plate, journey: null, attrs: r })
}
caps.sort((a, b) => a.t - b.t)

// ── Cartas del Nodo Sur (entran, internas o salen) con su ventana de visita ──
// VINCULO_CARTAS: archivo de cartas ya normalizadas (p. ej. bajar-cartas-api.mjs) en vez de la copia de data/arca.
const cartasRaw = process.env.VINCULO_CARTAS ? JSON.parse(fs.readFileSync(path.resolve(root, process.env.VINCULO_CARTAS), 'utf8')) : dataJson('arca/arca_consignment_notes.json')
const cartas = cartasRaw.map((n) => (Array.isArray(n.plates) ? n : normalizeNote(n))).filter((n) => n.departure && (
  (n.destCuit === VICENTIN_CUIT && (n.locality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.plant))) ||
  (n.originCuit === VICENTIN_CUIT && (n.originLocality === NODO_SUR_LOCALITY || NODO_SUR_PLANTS.has(n.originPlant)))))
// Una carta cerrada (descarga confirmada, anulada, rechazada, desactivada) no explica lecturas de 2 h después:
// son del viaje siguiente del mismo camión (INV971, 28/10: su carta del 24/10 cerrada en CN se llevaba la
// lectura de hoy y quedaba con 4 pasos faltantes).
const CLOSED = new Set(['CN', 'AN', 'RE', 'DE'])
for (const n of cartas) {
  const dep = Date.parse(n.departure)
  const closedAt = CLOSED.has(n.stateCode) ? Date.parse(n.stateSince) : NaN
  n.from = dep - 48 * H
  n.to = Math.min(dep + 120 * H, closedAt + 2 * H || Infinity)
}
const cartasByPlate = new Map()
for (const c of cartas) for (const p of c.plates) cartasByPlate.set(p, [...(cartasByPlate.get(p) ?? []), c])
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
// Todas las chapas de la carta (chasis y acoplado): con leer bien una, la otra también está presente
// (WPV930 / VSQ334, 20/10: solo el acoplado se leyó exacto y «HPV930» quedaba suelta).
for (const c of caps) { const n = cartaAt(c.plate, c.t); if (n) for (const p of n.plates) exactByPlate.set(p, [...(exactByPlate.get(p) ?? []), c.t]) }
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
  // Si la lectura trae texto, tiene que parecerse al vehículo (≤ 2 cambios): «HPV930» no es AA568PL aunque
  // pasaran por la misma cámara con 55 s de diferencia (era WPV930, 20/10 23:14).
  const v = [...vehicles][0]
  if (vehicles.size === 1 && (c.plate.length < 3 || readDist(c.plate, v) <= 2)) { c.orig = c.cls; c.cls = 'mismo_paso'; c.vehicle = v }
}

const weekCaps = caps.filter((c) => inWeek(c.t)) // las estadísticas de lecturas son solo de la semana
for (const c of weekCaps) {
  const cls = c.cls
  counts[cls] = (counts[cls] ?? 0) + 1
  perNode[c.node] ??= {}
  perNode[c.node][cls] = (perNode[c.node][cls] ?? 0) + 1
  if (samples[cls] && samples[cls].length < 40) samples[cls].push({ plate: c.plate, node: c.node, device: c.device, at: new Date(c.t - 3 * H).toISOString().slice(0, 16), src: c.src, ...(c.vehicle && c.vehicle !== c.plate ? { vehiculo: c.vehicle } : {}), ...(c.orig ? { antes: c.orig } : {}) })
}

const total = weekCaps.length
const pct = (n) => `${((n / total) * 100).toFixed(1)} %`
const linked = (counts.carta ?? 0) + (counts.carta_corregida ?? 0)
console.log(`Semana ${FROM} → ${TO}: ${total} lecturas (${weekCaps.filter((c) => c.src === 'alerta').length} solo como alerta, ${weekCaps.filter((c) => c.src === 'dss').length} solo en el DSS)`)
console.log(dssDir ? `  export del DSS ${dssDir}: ${dssMatched} lecturas de TruckFlow con marca/color/tipo` : '  sin export del DSS para esta semana')
for (const k of ['carta', 'carta_corregida', 'sin_carta', 'mismo_paso', 'suelta', 'ilegible', 'sin_patente']) console.log(`  ${k.padEnd(16)} ${String(counts[k] ?? 0).padStart(6)}  ${pct(counts[k] ?? 0)}`)
const toCarta = weekCaps.filter((c) => c.vehicle && (cartasByPlate.has(c.vehicle))).length
const toVehicle = weekCaps.filter((c) => c.vehicle).length
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
// Rechazado en la calada de Ricardone (no está en el modelo): sale por donde entró y nunca va a balanza.
// Solo con evidencia: leído en Ingreso más de 5 min después de la Calada y en ninguna balanza.
const BALANZAS = ['ricardone:Balanza Ingreso', 'ricardone:Balanza Egreso', 'san_lorenzo:Balanza Ingreso', 'san_lorenzo:Balanza Egreso']
circuits.push({ id: 'Rechazo Ric', exp: ['ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Calada'], rechazo: true })
const rechazado = (mine) => {
  const cal = mine.filter((c) => c.node === 'ricardone:Calada').map((c) => c.t)
  return cal.length > 0 && !mine.some((c) => BALANZAS.includes(c.node)) && mine.some((c) => c.node === 'ricardone:Ingreso' && c.t > Math.min(...cal) + 5 * 60_000)
}
const capsByVehicle = new Map()
for (const c of caps) if (c.vehicle) capsByVehicle.set(c.vehicle, [...(capsByVehicle.get(c.vehicle) ?? []), c])
const trucks = []
for (const n of cartas) {
  const mine = n.plates.flatMap((p) => capsByVehicle.get(p) ?? []).filter((c) => c.t >= n.from && c.t <= n.to)
  if (!mine.length || !inWeek(Math.min(...mine.map((c) => c.t)))) continue
  const seen = new Set(mine.map((c) => c.node))
  // Puntaje: nodos esperados vistos − esperados que faltan − nodos vistos que el circuito no explica
  // (sin este último, SL3 le ganaba a R7 a un camión leído en la Calada y la Salida 2 de Ricardone).
  const score = (c) => c.hit - c.miss.length - c.extra
  const isRech = rechazado(mine)
  const best = circuits.filter((c) => !c.rechazo || isRech).map((c) => ({ ...c, hit: c.exp.filter((x) => seen.has(x)).length, miss: c.exp.filter((x) => !seen.has(x)), extra: [...seen].filter((x) => !c.exp.includes(x)).length }))
    .sort((a, b) => score(b) - score(a) || a.exp.length - b.exp.length)[0]
  trucks.push({ ctg: n.ctg, plate: n.plates[0], circuit: best.id, expected: best.exp.length, missing: best.miss, byClass: Object.fromEntries([...new Set(mine.map((c) => c.cls))].map((k) => [k, mine.filter((c) => c.cls === k).length])) })
}
// ── Pasos de cada camión con carta y capturas sin dueño ──
// Hueco = paso del circuito sin lectura propia, con su ventana (entre el paso anterior y el siguiente) y la hora
// esperada por el tiempo típico del tramo (medido en los camiones bien leídos). Más abajo, cada captura sin
// dueño se asigna al camión más probable; un hueco que recibe una captura queda «reconstruido».
// --prueba: a 1 de cada 4 pasos leídos se les borra la patente y se los da por faltantes; acierto = la
// lectura vuelve al camión que era.
const TEST = process.argv.includes('--prueba')
const TEST_EVERY = 4
let testIdx = 0
for (const tr of trucks) tr.plates = cartas.find((x) => x.ctg === tr.ctg).plates
const firstAtOf = new Map()
for (const tr of trucks) {
  const n = cartas.find((x) => x.ctg === tr.ctg)
  tr.mine = n.plates.flatMap((p) => capsByVehicle.get(p) ?? []).filter((c) => c.t >= n.from && c.t <= n.to)
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

const DATA_END = caps.at(-1)?.t ?? 0
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
  // La carta en estado CN (descarga confirmada) se sella con la tara: coincide con la lectura de la Balanza
  // Egreso del destino a ±2 min (27–28/10: mediana 1 min en 111 camiones R7). Ancla ese paso aunque la cámara
  // no lo lea, y con la descarga confirmada el resto del circuito está hecho.
  const n = cartas.find((x) => x.ctg === tr.ctg)
  tr.carta = { estado: n.stateCode, desde: n.stateSince }
  const at = new Map(fa)
  const balEg = circuit.exp.filter((x) => x.endsWith(':Balanza Egreso')).at(-1)
  const cn = n.stateCode === 'CN' && n.destCuit === VICENTIN_CUIT ? Date.parse(n.stateSince) : NaN
  const firstT = Math.min(...tr.mine.map((c) => c.t)), lastT = Math.max(...tr.mine.map((c) => c.t))
  const anchored = balEg && cn > firstT && cn < firstT + 24 * H
  if (anchored && !fa.has(balEg)) at.set(balEg, cn)
  // Viaje abierto: la carta sigue activa o con arribo sin descarga confirmada y el camión se leyó hace < 24 h.
  const open = (n.stateCode === 'AC' || n.stateCode === 'CF') && DATA_END - lastT < 24 * H
  circuit.exp.forEach((node, i) => {
    if (tr.status[node] !== 'falta' && tr.status[node] !== 'prueba') return
    const prev = circuit.exp.slice(0, i).filter((x) => at.has(x) && x !== node).at(-1)
    const next = circuit.exp.slice(i + 1).find((x) => at.has(x))
    if (!prev && !next) return
    // Viaje abierto: después del último paso leído solo el inmediato siguiente puede haber pasado sin lectura;
    // los de más adelante no se rellenan (BMN766, 28/10: tomaba una captura de Balanza Egreso antes de calar).
    if (open && !next && circuit.exp[i - 1] !== prev) { tr.status[node] = 'en_curso'; return }
    const anchor = anchored && node === balEg
    const from = anchor ? cn - 10 * 60_000 : prev ? at.get(prev) : at.get(next) - 6 * H
    const to = anchor ? cn + 10 * 60_000 : next ? at.get(next) : at.get(prev) + 6 * H
    // Hora esperada en el nodo: desde el paso anterior (tramo prev→nodo) y/o hacia el siguiente (nodo→next).
    const est = []
    const tp = prev && transit.get(`${prev}>${node}`)
    const tn = next && transit.get(`${node}>${next}`)
    if (anchor) est.push({ at: cn, scale: 2 * 60_000 })
    else {
      if (tp) est.push({ at: at.get(prev) + tp.med, scale: tp.scale })
      if (tn) est.push({ at: at.get(next) - tn.med, scale: tn.scale })
    }
    // Pasó seguro sin captura: entre dos pasos leídos, en la entrada a la planta si leyó el paso siguiente
    // (Ingreso Ricardone pierde ~15 % aunque Pre ingreso lea) o con la descarga confirmada por la carta.
    const bounded = Boolean(prev && next) || (i === 0 && Boolean(next)) || Boolean(anchored)
    // Todavía no pasó: paso final sin lectura posterior de un viaje abierto, o ventana que termina después
    // del último dato.
    const pending = !next && (open || to > DATA_END)
    slots.push({ truck: tr, node, from, to, est, bounded, anchor, pending })
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
// Probado con las correcciones del simulador: un horario más ancho (escala ×2 o ×3, piso 0,2) o tratar las
// lecturas cortadas como neutras generan más empates y asignan menos (0 de 12 coincidencias).
const timeFit = (c, s) => s.est.length ? Math.max(...s.est.map((e) => Math.exp(-Math.abs(c.t - e.at) / e.scale))) : 0.3
// ── Cada captura sin dueño va a algún camión ──
// Se recorren por hora. Candidatos: los camiones del lote que podían estar en ese punto en ese momento, o sea
// los que tienen ese paso pendiente (ventana abierta) y los que fueron leídos ahí a ±5 min (la otra cámara del
// mismo paso, una lectura doble). Gana el de mayor puntaje (patente × marca × horario), siempre, con su
// probabilidad. Un camión pasa una vez: ya asignado un paso, las capturas de ese punto 60 s después pesan ×0,1.
// Solo una patente válida que no se parece a ningún candidato (≥ 3 cambios) queda como otro vehículo.
const PASS_MS = 5 * 60_000
// Pasadas leídas: lecturas del camión en un punto a menos de 5 min entre sí; cada una es candidata solo a ±5 min.
for (const tr of trucks) for (const node of new Set(tr.mine.filter((c) => !c.testOf).map((c) => c.node))) {
  const ts = tr.mine.filter((c) => c.node === node && !c.testOf).map((c) => c.t).sort((a, b) => a - b)
  let pass = [ts[0]]
  const push = () => slots.push({ truck: tr, node, from: pass[0] - PASS_MS, to: pass.at(-1) + PASS_MS, est: pass.map((t) => ({ at: t, scale: 60_000 })), read: true })
  for (const t of ts.slice(1)) { if (t - pass.at(-1) > PASS_MS) { push(); pass = [t] } else pass.push(t) }
  push()
}
const slotsByNode = new Map()
for (const s of slots) slotsByNode.set(s.node, [...(slotsByNode.get(s.node) ?? []), s])
const decisions = new Map() // captura → { s, P, rank: [{ s, score }] }
const taken = new Set()
const free = caps.filter((c) => !c.vehicle && inWeek(c.t))
const ranked = new Map()
for (const c of free) {
  const rank = (slotsByNode.get(c.node) ?? []).filter((s) => c.t > s.from && c.t < s.to).map((s) => ({ s, score: affinity(c, s) * timeFit(c, s), h: timeFit(c, s) })).filter((x) => x.h >= 0.01).sort((x, y) => y.score - x.score)
  // Patente válida que no se parece a ningún candidato: es otro vehículo, no se asigna.
  if (!rank.length || (isValidPlate(c.plate) && Math.min(...rank[0].s.truck.plates.map((p) => readDist(c.plate, p))) >= 3)) continue
  ranked.set(c, rank)
}
// Cada captura a su camión más probable; si un paso pendiente recibe capturas de momentos distintos (> 60 s),
// se queda con la mejor y las demás pasan a su siguiente candidato. Se repite hasta que no cambia nada.
const banned = new Map() // captura → pasos que ya la rechazaron
for (let round = 0, changed = true; changed && round < 8; round++) {
  changed = false
  decisions.clear()
  const bySlotNow = new Map()
  for (const [c, rank] of ranked) {
    const ok = rank.filter((x) => !(banned.get(c)?.has(x.s)))
    if (!ok.length) continue
    const total = ok.reduce((t, x) => t + x.score, 0)
    decisions.set(c, { s: ok[0].s, P: ok[0].score / total, rank: ok.slice(0, 5).map((x) => ({ ...x, P: x.score / total })) })
    if (!ok[0].s.read) bySlotNow.set(ok[0].s, [...(bySlotNow.get(ok[0].s) ?? []), { c, score: ok[0].score }])
  }
  for (const [s, list] of bySlotNow) {
    const best = list.reduce((m, x) => (x.score > m.score ? x : m))
    for (const x of list) if (Math.abs(x.c.t - best.c.t) > SAME_PASS_MS) { banned.set(x.c, new Set([...(banned.get(x.c) ?? []), s])); changed = true }
  }
}
for (const [c, d] of decisions) {
  taken.add(c)
  const s = d.s
  if (!s.read && (!s.filled || d.rank[0].score > s.filledScore)) { s.filled = c; s.filledScore = d.rank[0].score; s.P = d.P }
}
slots.splice(0, slots.length, ...slots.filter((s) => !s.read))
const pairs = [...decisions].map(([c, d]) => ({ c, s: d.s, score: d.rank[0].score }))
const bySlot = new Map()
for (const s of slots) bySlot.set(s, (freeByNode.get(s.node) ?? []).filter((c) => c.t > s.from && c.t < s.to).map((c) => ({ c, s, score: affinity(c, s) * timeFit(c, s) })).sort((x, y) => y.score - x.score))
// Por qué no se llenó cada hueco: sin lecturas libres en la ventana, lejos del horario esperado, empate con otra
// lectura del mismo hueco, o la lectura le queda igual de bien a otro camión.
const hhmm = (t) => new Date(t - 3 * H).toISOString().slice(5, 16).replace('T', ' ')
const why = new Map()
// Todas las lecturas libres del punto en la ventana del hueco (las 12 de mayor puntaje), con el desglose
// del puntaje: patente × marca × horario. Es lo que muestra el simulador (scripts/vinculo/simulador.mjs).
const allCands = (s) => (freeByNode.get(s.node) ?? []).filter((c) => c.t > s.from && c.t < s.to).map((c) => {
  const marca = lrAttrs(c, s.truck), horario = timeFit(c, s), patente = affinity(c, s) / marca
  return { at: new Date(c.t).toISOString(), hora: hhmm(c.t), camara: c.device, patente: c.plate || '', fuente: c.src, marca: c.attrs?.vehicleBrand ?? null, color: c.attrs?.vehicleColor ?? null, tipo: c.attrs?.vehicleCategory ?? null,
    partes: { patente: Math.round(patente * 100) / 100, marca: Math.round(marca * 100) / 100, horario: Math.round(horario * 100) / 100 }, puntaje: Math.round(patente * marca * horario * 1000) / 1000, elegida: s.filled === c, tomada: taken.has(c) && decisions.get(c)?.s !== s,
    vaA: decisions.get(c) ? { patente: decisions.get(c).s.truck.plate, prob: Math.round(decisions.get(c).P * 100) } : null }
}).sort((a, b) => b.puntaje - a.puntaje).slice(0, 12)
const motivos = {}
for (const s of slots) {
  if (s.filled) continue
  const inWin = (freeByNode.get(s.node) ?? []).filter((c) => c.t > s.from && c.t < s.to)
  const motivo = !inWin.length ? 'sin capturas en el punto dentro de la ventana' : 'cada captura de la ventana fue más probable de otro camión'
  motivos[motivo] = (motivos[motivo] ?? 0) + 1
  why.set(s, { motivo, lecturasEnVentana: inWin.length })
}
let ok = 0, bad = 0, none = 0
const bands = { 'alta (≥ 80 %)': [0, 0], 'media (50–80 %)': [0, 0], 'baja (< 50 %)': [0, 0] }
for (const s of slots) {
  if (s.truck.status[s.node] === 'prueba' && s.filled) { const b = bands[s.P >= 0.8 ? 'alta (≥ 80 %)' : s.P >= 0.5 ? 'media (50–80 %)' : 'baja (< 50 %)']; b[s.filled.testOf === s.truck.ctg ? 0 : 1]++ }
}
for (const s of slots) {
  s.truck.huecos ??= []
  if (s.truck.status[s.node] !== 'prueba') s.truck.huecos.push({ nodo: s.node, desde: hhmm(s.from), hasta: hhmm(s.to), esperada: s.est.length ? hhmm(s.est[0].at) : null, ...(s.filled ? { asignada: { patente: s.filled.plate || '(sin patente)', hora: hhmm(s.filled.t), fuente: s.filled.src, marca: s.filled.attrs?.vehicleBrand ?? null, prob: Math.round(s.P * 100) } } : why.get(s)), todas: allCands(s) })
  if (s.truck.status[s.node] === 'prueba') {
    if (!s.filled) none++
    else if (s.filled.testOf === s.truck.ctg) ok++
    else bad++
  }
  s.truck.status[s.node] = s.filled ? 'reconstruido' : s.anchor ? 'por_carta' : s.bounded ? 'deducido' : s.pending ? 'en_curso' : 'falta'
}
const tally = {}
for (const tr of trucks) for (const v of Object.values(tr.status)) tally[v] = (tally[v] ?? 0) + 1
const nSteps = Object.values(tally).reduce((a, b) => a + b, 0)
console.log(`\nAlgoritmo por lote sobre los pasos de los camiones con carta (${nSteps} pasos${TEST ? `, con prueba en 1 de cada ${TEST_EVERY}` : ''}):`)
for (const k of ['camara', 'reconstruido', 'por_carta', 'deducido', 'en_curso', 'falta']) console.log(`  ${k.padEnd(13)} ${String(tally[k] ?? 0).padStart(5)}  ${(((tally[k] ?? 0) / nSteps) * 100).toFixed(1)} %`)
console.log('  pasos sin asignar, por motivo:', Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))
if (TEST) console.log(`  prueba: ${ok} bien · ${bad} mal · ${none} sin asignar (de ${ok + bad + none}) → aciertos ${((ok / Math.max(1, ok + bad)) * 100).toFixed(1)} % de lo asignado, recupera ${((ok / Math.max(1, ok + bad + none)) * 100).toFixed(1)} %`)
if (TEST) for (const [k, [b, m]] of Object.entries(bands)) console.log(`    seguridad ${k.padEnd(16)} ${b} bien · ${m} mal → ${((b / Math.max(1, b + m)) * 100).toFixed(0)} %`)
for (const tr of trucks) tr.missing = Object.entries(tr.status).filter(([, v]) => v === 'falta').map(([k]) => k)

const missByNode = {}
for (const t of trucks) for (const m of t.missing) missByNode[m] = (missByNode[m] ?? 0) + 1
const steps = trucks.reduce((s, t) => s + t.expected, 0)
const missing = trucks.reduce((s, t) => s + t.missing.length, 0)
const enCurso = trucks.filter((t) => Object.values(t.status).includes('en_curso'))
const pend = trucks.reduce((s, t) => s + Object.values(t.status).filter((v) => v === 'en_curso').length, 0)
const closed = trucks.length - enCurso.length
const completeClosed = trucks.filter((t) => !t.missing.length && !enCurso.includes(t)).length
console.log(`\nCamiones con carta que llegaron: ${trucks.length} · ${closed} con el viaje terminado, ${enCurso.length} en curso (último dato ${new Date(DATA_END - 3 * H).toISOString().slice(5, 16).replace('T', ' ')})`)
console.log(`  terminados: completos ${completeClosed}/${closed} (${((completeClosed / Math.max(1, closed)) * 100).toFixed(1)} %) · pasos ${steps - missing - pend}/${steps - pend} (${(((steps - missing - pend) / (steps - pend)) * 100).toFixed(1)} %)`)
console.log(`  en curso: ${pend} pasos por hacer; con faltantes antes de la última lectura: ${enCurso.filter((t) => t.missing.length).length}`)
console.log('  por circuito:', Object.entries(trucks.reduce((o, t) => ({ ...o, [t.circuit]: (o[t.circuit] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))
console.log('  pasos que faltan por nodo:')
for (const [k, v] of Object.entries(missByNode).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(42)} ${v}`)

const out = path.join(root, 'reportes/vinculo', `${FROM}_${TO}`)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'cobertura.json'), JSON.stringify({
  desde: FROM, hasta: TO, total, counts, perNode, samples, transit: Object.fromEntries([...transit].map(([k, v]) => [k, { n: v.n, medMin: Math.round(v.med / 60_000) }])),
  camiones: trucks.map(({ mine, ...t }) => ({ ...t, lecturas: mine.filter((c) => !c.testOf).map((c) => ({ nodo: c.node, hora: hhmm(c.t), at: new Date(c.t).toISOString(), camara: c.device, patente: c.plate, clase: c.cls, fuente: c.src, marca: c.attrs?.vehicleBrand ?? null })) })),
  // Cada captura asignada con los camiones que se la disputaban (para el simulador).
  capturas: [...decisions].map(([c, d]) => ({ at: new Date(c.t).toISOString(), hora: hhmm(c.t), camara: c.device, nodo: c.node, patente: c.plate || '', fuente: c.src, marca: c.attrs?.vehicleBrand ?? null,
    rivales: d.rank.map((x) => { const m = lrAttrs(c, x.s.truck), h = timeFit(c, x.s); return { ctg: x.s.truck.ctg, patente: x.s.truck.plate, prob: Math.round(x.P * 100), por: x.s.read ? 'leido' : 'pendiente', desde: hhmm(x.s.from), hasta: hhmm(x.s.to), partes: { patente: Math.round((affinity(c, x.s) / m) * 100) / 100, marca: Math.round(m * 100) / 100, horario: Math.round(h * 100) / 100 } } }) })),
  sinCarta: [...sinCartaPlates].map(([plate, nodes]) => ({ plate, lecturas: byPlate.get(plate).length, nodos: [...nodes] })).sort((a, b) => b.lecturas - a.lecturas),
}, null, 1))
console.log(`\n→ ${path.relative(root, out)}/cobertura.json`)
