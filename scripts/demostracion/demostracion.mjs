// Demostración de la tesis de reconocimiento de patentes (docs/demostracion-patentes/PLAN_DEMOSTRACION.md).
// Para una semana: arma el dataset (feed + DSS), construye la verdad con el Excel (sin cámaras ni modelo),
// corre la regla del modelo por nodos solo con lo que se sabía a la hora de cada lectura, y guarda cada caso.
// Uso: node scripts/demostracion/demostracion.mjs calibracion|prueba
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog, isValidPlate, plateSimilarity } from '../../server/plantState/plateIdentification.mjs'
import { scoreWithNodeModel, readLikelihood, DAMAGED_READ } from '../../server/plantState/nodeModelScore.mjs'
import { compareAttribute } from '../../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const SEMANAS = {
  calibracion: { days: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'], runs: ['2026-09-21_2026-09-27', '2026-09-28_2026-10-04'], dss: 'data/dss-export/2026-09-24_30/capturas.csv' },
  prueba: { days: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'], runs: ['2026-09-28_2026-10-04', '2026-10-05_2026-10-11'], dss: 'data/dss-export/2026-10-01_07/capturas.csv' },
}
const which = process.argv[2] ?? 'prueba'
const cfg0 = SEMANAS[which]
if (!cfg0) throw new Error(`semana desconocida: ${which}`)
// Opcional: solo los primeros N días (prueba rápida).
const cfg = process.argv[3] ? { ...cfg0, days: cfg0.days.slice(0, Number(process.argv[3])) } : cfg0
const root = process.cwd()
const outDir = path.join(root, 'outputs', `demostracion_${which}${process.argv[3] ? `_${process.argv[3]}d` : ''}`)
fs.mkdirSync(outDir, { recursive: true })
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const localMs = (s) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const PAD = 45 * 60_000
const FICTICIAS = /^(X+|P+|T+)$/

// ── Modelo de nodos: cámara → nodo, y nodos esperados por circuito (mismas reglas que el informe) ──
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const NODO_DESCARGA_REAL = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
const INEXISTENTES = new Set(['SLZCalCam'])
const deviceNode = new Map()
for (const n of model.nodes) {
  if (!n.hasCamera) continue
  const id = NODO_DESCARGA_REAL[n.id] ?? n.id
  const add = (d, rear) => { const k = d.toLowerCase(); if (!deviceNode.has(k)) deviceNode.set(k, []); if (!deviceNode.get(k).some((x) => x.node === id)) deviceNode.get(k).push({ node: id, rear }) }
  for (const d of n.devices ?? []) if (!INEXISTENTES.has(d)) add(d, false)
  for (const d of n.rear ?? []) add(d, true)
}
// Posición de cada nodo en cada circuito: ¿B puede venir después de A?
const circuitOrder = model.circuits.map((c) => c.seq.map((x) => NODO_DESCARGA_REAL[x] ?? x))
const canFollow = (a, b) => a === b || circuitOrder.some((seq) => { const i = seq.indexOf(a); return i >= 0 && seq.indexOf(b, i + 1) > i })
const excl = json('data/camaras-exclusiones-2026-09.json')
const excluded = (nodeId, day) => excl.diasCompletos.includes(day) || excl.puntos.some((p) => p.nodeId === nodeId && day >= p.desde && (!p.hasta || day <= p.hasta))
function expectedNodes(circuit, platform) {
  const c = model.circuits.find((x) => x.id === circuit)
  if (!c) return []
  const out = []
  for (const raw of c.seq) {
    const id = NODO_DESCARGA_REAL[raw] ?? raw
    const n = nodeById.get(id)
    if (!n?.hasCamera || n.optional || NO_MEDIBLES.has(id) || out.includes(id)) continue
    if (id === 'san_lorenzo:Plataformas Volcables' && !/^VOLCABLE_PTO_\d/.test(platform ?? '')) continue
    out.push(id)
  }
  return out
}

// ── Capturas del feed (frontales y traseras), con atributos del DSS ──
const ctxDays = [addDays(cfg.days[0], -1), ...cfg.days, addDays(cfg.days.at(-1), 1)]
const events = new Map()
for (const d of ctxDays) {
  const f = `data/truckflow/${d}/event-list.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const e of Array.isArray(o) ? o : o.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
}
const allEvents = [...events.values()]
const captures = []
for (const e of allEvents) {
  const dev = String(e.deviceCode ?? '')
  const t = getEventLiveInstantMs(e)
  if (!Number.isFinite(t)) continue
  for (const m of deviceNode.get(dev.toLowerCase()) ?? []) captures.push({ ev: e, device: dev, plate: plateOf(e.normalizedPlate || e.truckPlate || e.rawTruckPlate), t, node: m.node, rear: m.rear, alert: !!e.fromAlert })
}

// DSS: hora de cámara + 240 s = hora operativa del feed (±5 s).
const dssByDevice = new Map()
let dssRow = 0
const dssLines = fs.readFileSync(path.join(root, cfg.dss), 'utf8').trim().split(/\r?\n/)
const dh = dssLines[0].split(',')
for (const line of dssLines.slice(1)) {
  const v = line.split(',')
  const r = Object.fromEntries(dh.map((h, i) => [h, v[i]]))
  const t = localMs(r.hora_camara.replace(' ', 'T')) + 240_000
  const k = r.camara.toLowerCase()
  if (!dssByDevice.has(k)) dssByDevice.set(k, [])
  dssByDevice.get(k).push({ row: dssRow++, device: r.camara, t, plate: plateOf(r.patente), vehicleColor: r.color, vehicleBrand: r.marca, vehicleCategory: r.tipo, confidence: Number(r.confianza) })
}
for (const l of dssByDevice.values()) l.sort((a, b) => a.t - b.t)
function dssAt(device, t, plate) {
  const l = dssByDevice.get(String(device ?? '').toLowerCase())
  if (!l || !Number.isFinite(t)) return null
  let best = null
  for (const r of l) {
    if (r.t < t - 5000) continue
    if (r.t > t + 5000) break
    const score = (r.plate === plate ? 0 : 10_000) + Math.abs(r.t - t)
    if (!best || score < best.score) best = { ...r, score }
  }
  return best
}
let dssMatched = 0
const usedDss = new Set()
for (const c of captures) { c.dss = dssAt(c.device, c.t, c.plate); if (c.dss) { dssMatched++; usedDss.add(c.dss.row) } }
// Lecturas que están en el DSS y no en el feed (las que el feed manda a alertas): entran como capturas
// sueltas, cada una su propio recorrido. Solo frontales de cámaras del modelo. El modelo solo ve las que
// resultan lecturas malas (se inyectan por día), igual que el sistema en vivo no ve las alertas.
const SKEW = 206 * 60_000
let soloDss = 0
for (const [dev, list] of dssByDevice) {
  const nodes = deviceNode.get(dev) ?? []
  if (!nodes.length || nodes.every((m) => m.rear)) continue
  for (const r of list) {
    if (usedDss.has(r.row) || !ctxDays.includes(arDay(r.t))) continue
    const ev = { id: `dss:${r.row}`, journeyUid: `dss:${r.row}`, deviceCode: r.device, normalizedPlate: r.plate, truckPlate: r.plate, eventCategory: 'physical', occurredAt: new Date(r.t - SKEW).toISOString(), fromDss: true }
    for (const m of nodes) if (!m.rear) captures.push({ ev, device: r.device, plate: r.plate, t: r.t, node: m.node, rear: false, dss: r, soloDss: true })
    soloDss++
  }
}

// ── Movimientos del Excel con circuito resuelto ──
const movs = new Map()
for (const run of cfg.runs) {
  for (const r of json(`runs/windows/${run}/tables/excel_operations_with_truckflow.json`).rows) {
    const plate = plateOf(r.plate_normalized)
    const ing = localMs(r.external_ingreso_at)
    const sal = localMs(r.external_salida_at)
    if (!isValidPlate(plate) || FICTICIAS.test(plate) || !['RICARDONE', 'TERMINAL_EMBARQUE'].includes(r.planta_normalized)) continue
    if (!Number.isFinite(ing) || !Number.isFinite(sal) || !(ctxDays.includes(arDay(sal)) || ctxDays.includes(arDay(ing)))) continue
    const exp = expectedNodes(r.resolved_executive_circuit_code, r.platform_normalized)
    if (!exp.length) continue
    const id = r.external_operation_id ?? `${plate}|${ing}`
    if (!movs.has(id)) movs.set(id, { id, plate, circuit: r.resolved_executive_circuit_code, ing: Math.min(ing, sal), sal: Math.max(ing, sal), exp })
  }
}

// Índice de capturas frontales por nodo, ordenadas por hora.
const frontByNode = new Map()
for (const c of captures) {
  if (c.rear) continue
  if (!frontByNode.has(c.node)) frontByNode.set(c.node, [])
  frontByNode.get(c.node).push(c)
}
for (const l of frontByNode.values()) l.sort((a, b) => a.t - b.t)
const inRange = (list, lo, hi) => {
  let a = 0, b = list.length
  while (a < b) { const m = (a + b) >> 1; if (list[m].t < lo) a = m + 1; else b = m }
  const out = []
  for (let i = a; i < list.length && list[i].t <= hi; i++) out.push(list[i])
  return out
}

// ── Fase 2: pasos esperados, leídos y faltantes ──
const steps = []
const activeWindows = new Map() // patente → ventanas [ing−45, sal+45]
const movRows = []
for (const m of movs.values()) {
  const lo = m.ing - PAD, hi = m.sal + PAD
  if (!activeWindows.has(m.plate)) activeWindows.set(m.plate, [])
  activeWindows.get(m.plate).push([lo, hi])
  const rows = m.exp.map((node) => {
    const hit = inRange(frontByNode.get(node) ?? [], lo, hi).find((c) => c.plate === m.plate)
    const row = { mov: m.id, plate: m.plate, circuit: m.circuit, node, read: !!hit, t: hit ? hit.t : null, device: hit?.device ?? null }
    Object.defineProperty(row, 'cap', { value: hit ?? null, enumerable: false })
    return row
  })
  rows.forEach((r, i) => {
    if (r.read) return
    let p = i - 1; while (p >= 0 && !rows[p].read) p--
    let q = i + 1; while (q < rows.length && !rows[q].read) q++
    r.lo = p >= 0 ? rows[p].t : lo
    r.hi = q < rows.length ? rows[q].t : hi
    // Ventana «entre dos nodos»: de la lectura buena anterior a la siguiente, sin acotar por tiempo.
    r.lo0 = r.lo
    r.hi0 = r.hi
    r.prev = p >= 0 ? rows[p] : null
    r.next = q < rows.length ? rows[q] : null
  })
  movRows.push(rows)
}
// Tiempo de cada tramo A → B medido en los camiones leídos bien en los dos puntos (sin el modelo).
const gaps = new Map()
for (const rows of movRows) for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
  if (!rows[a].read || !rows[b].read) continue
  const k = `${rows[a].node}>${rows[b].node}`
  if (!gaps.has(k)) gaps.set(k, [])
  gaps.get(k).push(rows[b].t - rows[a].t)
}
const band = (a, b) => {
  const l = gaps.get(`${a}>${b}`)
  if (!l || l.length < 20) return null
  l.sort((x, y) => x - y)
  return [l[Math.floor(l.length * 0.02)], l[Math.min(l.length - 1, Math.floor(l.length * 0.98))]]
}
for (const rows of movRows) {
  for (const r of rows) {
    if (!r.read) {
      // Acota la ventana con el tiempo habitual desde la lectura anterior y hasta la siguiente.
      const f = r.prev && band(r.prev.node, r.node)
      const g = r.next && band(r.node, r.next.node)
      if (f) { r.lo = Math.max(r.lo, r.prev.t + f[0]); r.hi = Math.min(r.hi, r.prev.t + f[1]) }
      if (g) { r.lo = Math.max(r.lo, r.next.t - g[1]); r.hi = Math.min(r.hi, r.next.t - g[0]) }
      delete r.prev
      delete r.next
    }
    const day = arDay(r.t ?? (r.lo + r.hi) / 2)
    r.inWeek = cfg.days.includes(day)
    if (!excluded(r.node, day)) steps.push(r)
  }
}
const isActive = (plate, t) => (activeWindows.get(plate) ?? []).some(([lo, hi]) => t >= lo && t <= hi)
const missingByNode = new Map()
for (const s of steps) if (!s.read) { if (!missingByNode.has(s.node)) missingByNode.set(s.node, []); missingByNode.get(s.node).push(s) }

// Lecturas malas: capturas frontales en los días de la semana, en nodos medidos, cuya patente no es la
// de un movimiento del Excel en planta en ese momento.
const measured = new Set(steps.map((s) => s.node))
const seenEv = new Set()
const bad = captures.filter((c) => !c.rear && measured.has(c.node) && cfg.days.includes(arDay(c.t)) && !excluded(c.node, arDay(c.t)) && !isActive(c.plate, c.t) && !seenEv.has(c.ev) && seenEv.add(c.ev))
// Doble lectura: un camión del Excel ya leído bien en ese mismo nodo a 3 min o menos. La lectura mala es
// suya (la cámara lo leyó dos veces) y no completa ningún paso faltante. Si son varios, es ambigua.
const readByNode = new Map()
for (const s of steps) if (s.read) { if (!readByNode.has(s.node)) readByNode.set(s.node, []); readByNode.get(s.node).push(s) }
const TWIN = 30 * 60_000
// Vehículo real: patente válida que vuelve a leerse en otro punto dentro de 8 h, que es de la flota
// habitual, o que es de un movimiento del Excel en otro momento. No es un error de lectura: la verdad
// es «no corregir». Solo las demás (inválidas o válidas vistas una sola vez) son posibles errores.
const fleet = new Set(json('server/plantState/data/flotaPatentes.json').plates)
const excelPlatesEarly = { has: (pl) => excelPlates.has(pl) }
const byPlate = new Map()
for (const c of captures) { if (!byPlate.has(c.plate)) byPlate.set(c.plate, []); byPlate.get(c.plate).push(c) }
const excelPlates = new Set()
for (const d of fs.readdirSync(path.join(root, 'data/movimientos')).filter((x) => /^d{4}-d{2}-d{2}$/.test(x))) {
  const f = `data/movimientos/${d}/movimientos.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const r of Array.isArray(o) ? o : Object.values(o)) { const pl = plateOf(r?.plate_normalized); if (pl) excelPlates.add(pl) }
}
// Una patente del Excel (de cualquier planta y fecha) es un vehículo real distinto: no se corrige.
const realVehicle = (b) => isValidPlate(b.plate) && excelPlates.has(b.plate)
for (const b of bad) {
  // Lo que dice el Excel, para verificar cualquier asignación: camiones con ese paso faltante en esa
  // ventana, y camiones ya leídos bien en ese nodo a 3 min o menos (doble lectura).
  b.excelMissing = [...new Set((missingByNode.get(b.node) ?? []).filter((s) => b.t > s.lo && b.t < s.hi).map((s) => s.plate))]
  b.excelTwins = [...new Set((readByNode.get(b.node) ?? []).filter((s) => Math.abs(s.t - b.t) <= TWIN).map((s) => s.plate))]
  if (realVehicle(b)) { b.kind = 'patente_del_excel'; b.truth = 'no_corregir'; b.truthPlate = null; b.truthPlates = []; continue }
  b.kind = isValidPlate(b.plate) ? 'valida_fuera_excel' : 'invalida'
  const twins = [...new Set((readByNode.get(b.node) ?? []).filter((s) => Math.abs(s.t - b.t) <= TWIN).map((s) => s.plate))]
  if (twins.length) {
    b.truth = twins.length === 1 ? 'relectura' : 'ambigua'
    b.truthPlate = twins.length === 1 ? twins[0] : null
    b.truthPlates = twins
    continue
  }
  const cands = (missingByNode.get(b.node) ?? []).filter((s) => b.t > s.lo && b.t < s.hi)
  const plates = [...new Set(cands.map((s) => s.plate))]
  b.truth = plates.length === 1 ? 'firme' : plates.length > 1 ? 'ambigua' : 'nunca_visto'
  b.truthPlate = plates.length === 1 ? plates[0] : null
  b.truthPlates = plates
}

// ── Fase 6: reconstrucción entre dos nodos (retrospectiva) ──
// Cada paso faltante de un camión del Excel puede quedarse con una captura sin dueño de ese punto entre
// su lectura buena anterior y la siguiente, sin importar el tiempo. Una captura por paso y un paso por
// captura; primero los pares que más se parecen (patente × color/marca/tipo). Si la patente no se parece
// a nada, igual se asigna (lectura ilegible). Precisión medida con pasos leídos a los que se les borra la patente.
const attrsOf = new Map()
for (const c of captures) {
  if (c.rear || !c.dss || !activeWindows.has(c.plate)) continue
  if (!attrsOf.has(c.plate)) attrsOf.set(c.plate, { vehicleColor: {}, vehicleBrand: {}, vehicleCategory: {} })
  const a = attrsOf.get(c.plate)
  for (const k of Object.keys(a)) { const v = c.dss[k]; if (v && !/unknown|unrecognized/i.test(v)) a[k][v] = (a[k][v] ?? 0) + 1 }
}
const mode = (o) => Object.entries(o).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
const truckAttrs = (plate) => { const a = attrsOf.get(plate); return a ? { vehicleColor: mode(a.vehicleColor), vehicleBrand: mode(a.vehicleBrand), vehicleCategory: mode(a.vehicleCategory) } : null }
const attrLr = (capDss, plate) => {
  const t = truckAttrs(plate)
  if (!capDss || !t) return 1
  return compareAttribute('color', capDss.vehicleColor, t.vehicleColor).lr * compareAttribute('marca', capDss.vehicleBrand, t.vehicleBrand).lr * compareAttribute('tipo', capDss.vehicleCategory, t.vehicleCategory).lr
}
function reconstruct(stepsIn, capsIn) {
  const out = new Map()
  const byNodeCaps = new Map()
  for (const c of capsIn) { if (!byNodeCaps.has(c.node)) byNodeCaps.set(c.node, []); byNodeCaps.get(c.node).push(c) }
  const pairs = []
  for (const s of stepsIn) for (const c of byNodeCaps.get(s.node) ?? []) {
    if (c.t <= s.lo0 || c.t >= s.hi0) continue
    const L = c.hidden ? DAMAGED_READ : Math.max(DAMAGED_READ, readLikelihood(c.plate, s.plate, 0.75))
    pairs.push({ s, c, score: L * attrLr(c.dss, s.plate) })
  }
  pairs.sort((a, b) => b.score - a.score)
  const usedC = new Set(), usedS = new Set()
  for (const pr of pairs) { if (usedC.has(pr.c) || usedS.has(pr.s)) continue; usedC.add(pr.c); usedS.add(pr.s); out.set(pr.s, pr.c) }
  return out
}
const reconCaps = bad.filter((b) => !isValidPlate(b.plate) || !excelPlatesEarly.has(b.plate))
const missingWeek = steps.filter((s) => !s.read && s.inWeek)
const recon = reconstruct(missingWeek, reconCaps)
// Prueba con respuesta conocida: 1 de cada 4 pasos leídos, con la patente borrada.
const sim = []
for (const rows of movRows) rows.forEach((r, i) => {
  if (!r.read || !r.inWeek || !r.cap || (i * 7 + r.plate.charCodeAt(0)) % 4) return
  let p = i - 1; while (p >= 0 && !rows[p].read) p--
  let q = i + 1; while (q < rows.length && !rows[q].read) q++
  const m = movs.get(r.mov)
  const st = { ...r, read: false, lo0: p >= 0 ? rows[p].t : m.ing - PAD, hi0: q < rows.length ? rows[q].t : m.sal + PAD, sim: true }
  sim.push({ st, cap: { ...r.cap, plate: 'ILEGIBLE', hidden: true, orig: r.cap } })
})
const simRecon = reconstruct([...missingWeek, ...sim.map((x) => x.st)], [...reconCaps, ...sim.map((x) => x.cap)])
const simByNode = {}
for (const x of sim) {
  const o = (simByNode[x.st.node] ??= { n: 0, ok: 0, otra: 0, nada: 0 })
  o.n++
  const got = simRecon.get(x.st)
  if (!got) o.nada++
  else if (got === x.cap) o.ok++
  else o.otra++
}
const reconByNode = {}
for (const s of steps.filter((x) => x.inWeek)) {
  const o = (reconByNode[s.node] ??= { esperados: 0, leidos: 0, reconstruidos: 0, conLecturaParecida: 0 })
  o.esperados++
  if (s.read) o.leidos++
  else if (recon.has(s)) { o.reconstruidos++; if (readLikelihood(recon.get(s).plate, s.plate, 0.75) > DAMAGED_READ) o.conLecturaParecida++ }
}
fs.writeFileSync(path.join(outDir, 'reconstruccion.json'), JSON.stringify({ porPunto: reconByNode, pruebaPatenteBorrada: simByNode }, null, 2) + '\n')
console.log('reconstrucción entre dos nodos')
for (const [k, o] of Object.entries(reconByNode)) {
  const v = simByNode[k]
  console.log(k.padEnd(38), o.esperados, o.leidos, o.reconstruidos, (o.leidos / o.esperados * 100).toFixed(1) + '% → ' + ((o.leidos + o.reconstruidos) / o.esperados * 100).toFixed(1) + '%', v ? `prueba: ${v.ok}/${v.n} bien, ${v.otra} a otra captura, ${v.nada} sin asignar` : '')
}

// ── Fase 4: la regla, causal ──
const catalog = nodeModelCatalog()
const truckDss = (plate, device, t) => dssAt(device, t, plate)
for (const day of cfg.days) {
  const end = Date.parse(`${day}T23:59:59-03:00`)
  const dayBad = bad.filter((x) => arDay(x.t) === day)
  const iso = new Map(dayBad.map((b, i) => [b.ev, `demo:${day}:${i}`]))
  const decisions = Object.fromEntries([...iso.values()].map((k) => [k, { action: 'reject' }]))
  const evs = [...allEvents, ...dayBad.filter((b) => b.ev.fromDss).map((b) => b.ev)].filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 48 * 3600_000 && t <= end }).map((e) => (iso.has(e) ? { ...e, journeyUid: iso.get(e) } : e))
  const { items } = identifyFragments(evs, end, { catalog, decisions, options: { maxCandidates: 30 } })
  const byKey = new Map(items.map((i) => [i.fragmentKey, i]))
  for (const b of dayBad) {
    const item = byKey.get(iso.get(b.ev))
    if (!item) { b.model = { evaluated: false }; continue }
    const readAttrs = b.dss
    const cands = item.candidates.map((c) => {
      const a = truckDss(c.plate, c.photoDevice, Date.parse(c.photoAt))
      const lr = ['color', 'marca', 'tipo'].reduce((p, k) => p * compareAttribute(k, readAttrs?.[k === 'color' ? 'vehicleColor' : k === 'marca' ? 'vehicleBrand' : 'vehicleCategory'], a?.[k === 'color' ? 'vehicleColor' : k === 'marca' ? 'vehicleBrand' : 'vehicleCategory']).lr, 1)
      return { ...c, attrLr: readAttrs && a ? lr : 1, attrsBoth: !!(readAttrs && a) }
    })
    const r = scoreWithNodeModel(item, cands)
    // Variante sin patente (lectura ilegible): solo recorrido, hora y atributos.
    const r2 = scoreWithNodeModel(item, cands, { ignorePlate: true })
    const top2 = [...r2.candidates].sort((x, y) => y.probability - x.probability)[0]
    const never2 = !top2 || r2.neverSeen.probability >= top2.probability
    let check2 = null
    if (!never2) {
      const later = (byPlate.get(top2.plate) ?? []).filter((x) => !x.rear && x.t > b.t + 1000 && x.t - b.t <= 8 * 3600_000).sort((x, y) => x.t - y.t)[0]
      check2 = later ? { node: later.node, minutos: Math.round((later.t - b.t) / 60000), enOrden: canFollow(b.node, later.node) } : { node: null, minutos: null, enOrden: false }
    }
    b.sinPatente = { winner: never2 ? null : top2.plate, p: never2 ? r2.neverSeen.probability : top2.probability, check: check2 }
    const top = [...r.candidates].sort((x, y) => y.probability - x.probability)[0]
    const neverWins = !top || r.neverSeen.probability >= top.probability
    // Verificación con lo que el modelo no vio: la próxima lectura buena del camión elegido (hasta 8 h).
    let check = null
    if (!neverWins) {
      const later = (byPlate.get(top.plate) ?? []).filter((x) => !x.rear && x.t > b.t + 1000 && x.t - b.t <= 8 * 3600_000).sort((x, y) => x.t - y.t)[0]
      check = later ? { node: later.node, minutos: Math.round((later.t - b.t) / 60000), enOrden: canFollow(b.node, later.node) } : { node: null, minutos: null, enOrden: false }
    }
    b.model = { evaluated: true, check, winner: neverWins ? null : top.plate, p: neverWins ? r.neverSeen.probability : top.probability, pNever: r.neverSeen.probability, pInicio: r.pInicio, franja: r.franja,
      expected: r.expectedAtNode, attrs: cands.find((c) => c.plate === top?.plate)?.attrsBoth ?? false, candidates: r.candidates.map((c) => ({ plate: c.plate, p: Math.round(c.probability * 1e4) / 1e4 })) }
  }
}

const cases = bad.map((b) => ({ kind: b.kind, device: b.device, node: b.node, at: new Date(b.t).toISOString(), read: b.plate, valid: isValidPlate(b.plate), dss: b.dss ? { color: b.dss.vehicleColor, marca: b.dss.vehicleBrand, tipo: b.dss.vehicleCategory, conf: b.dss.confidence } : null,
  truth: b.truth, truthPlate: b.truthPlate, truthPlates: b.truthPlates.slice(0, 5), simTruth: b.truthPlate ? Math.round(plateSimilarity(b.plate, b.truthPlate) * 100) / 100 : null, excelMissing: b.excelMissing, excelTwins: b.excelTwins, model: b.model, sinPatente: b.sinPatente }))
const summary = { semana: which, days: cfg.days, eventos: allEvents.length, lecturasSoloDss: soloDss, capturasEnNodos: captures.length, conDss: dssMatched, movimientos: movs.size, pasos: steps.length, pasosLeidos: steps.filter((s) => s.read).length,
  lecturasMalas: bad.length, verdad: cases.reduce((o, c) => ((o[c.truth] = (o[c.truth] ?? 0) + 1), o), {}), evaluadasPorElModelo: cases.filter((c) => c.model.evaluated).length }
fs.writeFileSync(path.join(outDir, 'casos.json'), JSON.stringify({ summary, cases }) + '\n')
fs.writeFileSync(path.join(outDir, 'pasos.json'), JSON.stringify(steps) + '\n')
console.log(JSON.stringify(summary, null, 2))
