// p_inicio por nodo: probabilidad de que un camión tenga en ese nodo su PRIMERA lectura exacta,
// según la secuencia de cámaras de cada circuito del modelo de nodos y la lectura exacta de cada
// punto (septiembre, día y noche). Universo conocido = 1 − p_inicio. Solo nodos: no usa el Excel
// como entrada (la tasa por punto viene del informe de reconocimiento de septiembre).
// Uso: node scripts/p-inicio-nodos.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const report = json('reportes/camaras/2026-09-01_2026-09-30/reconocimiento-camaras.json')
const nodes = new Map(model.nodes.map((n) => [n.id, n]))
// Mismo criterio que el informe: la recepción de Silo Chief descarga en el volcable de Keppler.
const SAME_AS = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const rate = new Map(report.puntos.map((p) => [p.nodeId, {
  total: p.total.exactos / p.total.esperados, dia: p.dia.exactos / p.dia.esperados, noche: p.noche.exactos / p.noche.esperados,
}]))
const rateOf = (id) => rate.get(SAME_AS[id] ?? id) ?? null

// Peso de cada circuito: recorridos de cámara de septiembre (final_circuits, v17). Los circuitos
// directos a San Lorenzo no aparecen ahí: el resumen por nodo los muestra aparte.
const weights = {}
for (const w of ['2026-08-31_2026-09-06', '2026-09-07_2026-09-13', '2026-09-14_2026-09-20', '2026-09-21_2026-09-27', '2026-09-28_2026-10-04']) {
  for (const r of json(`runs/windows/${w}/tables/final_circuits.json`).rows) {
    const c = r.executive_circuit_code
    if (c && c !== 'SIN_PUNTO') weights[c] = (weights[c] ?? 0) + 1
  }
}

const FR = ['total', 'dia', 'noche']
const byNode = new Map()
const perCircuit = []
for (const c of model.circuits) {
  const steps = c.seq.map((id) => nodes.get(id)).filter((n) => n?.hasCamera && !n.optional)
  let miss = { total: 1, dia: 1, noche: 1 }
  const before = []
  const rows = []
  for (const n of steps) {
    const p = Object.fromEntries(FR.map((f) => [f, miss[f]]))
    rows.push({ node: n.id, label: n.label, plant: n.plant, previos: before.map((b) => b.label), pInicio: p, sinTasa: !rateOf(n.id) })
    const e = byNode.get(n.id) ?? { node: n.id, label: n.label, plant: n.plant, circuits: [] }
    e.circuits.push({ circuit: c.id, weight: weights[c.id] ?? 0, previos: before.length, pInicio: p })
    byNode.set(n.id, e)
    const r = rateOf(n.id)
    // Un nodo sin tasa medida no aporta universo (no se sabe cuánto lee): no reduce p_inicio.
    if (r) for (const f of FR) miss[f] *= 1 - r[f]
    before.push(n)
  }
  perCircuit.push({ circuit: c.id, weight: weights[c.id] ?? 0, steps: rows })
}

const order = model.nodes.filter((n) => byNode.has(n.id)).map((n) => n.id)
const summary = order.map((id) => {
  const e = byNode.get(id)
  const weighted = e.circuits.filter((c) => c.weight > 0)
  const wsum = weighted.reduce((s, c) => s + c.weight, 0)
  const avg = (f) => (wsum ? weighted.reduce((s, c) => s + c.weight * c.pInicio[f], 0) / wsum : null)
  const vals = e.circuits.map((c) => c.pInicio.total)
  const starts = e.circuits.filter((c) => c.previos === 0).map((c) => c.circuit)
  return {
    node: id, label: e.label, plant: e.plant, lectura: rateOf(id),
    circuitos: e.circuits.length, circuitosQueArrancanAca: starts,
    pInicioPonderado: wsum ? Object.fromEntries(FR.map((f) => [f, avg(f)])) : null,
    pInicioMin: Math.min(...vals), pInicioMax: Math.max(...vals),
    previosTipicos: Math.round(e.circuits.reduce((s, c) => s + c.previos, 0) / e.circuits.length),
  }
})
const out = { generatedAt: new Date().toISOString(),
  fuente: { modelo: 'modelo_nodo_sur.json', lecturaPorPunto: 'reconocimiento-camaras.json (exactos/esperados, septiembre)', pesos: 'final_circuits v17 septiembre (recorridos de cámara)' },
  pesos: weights, summary, perCircuit }
fs.mkdirSync(path.join(root, 'docs/auditoria-patentes-2026-10-08/teorema'), { recursive: true })
fs.writeFileSync(path.join(root, 'docs/auditoria-patentes-2026-10-08/teorema/p-inicio-nodos.json'), JSON.stringify(out, null, 2) + '\n')
// Tabla para el servidor en vivo, por código lógico (S2, SL_S0…). Varios nodos comparten código
// (S4 = balanza de ingreso y de egreso): se toma el p_inicio más alto, que es el más prudente. Un
// nodo donde arranca algún circuito vale 1: ahí puede entrar un camión nuevo de verdad.
const FLOOR = 0.016 // 198 de 12.146 camiones de septiembre no se leyeron en ningún punto
const live = {}
for (const s of summary) {
  const n = nodes.get(s.node)
  const code = n.plant === 'san_lorenzo' ? `SL_${n.code}` : n.code
  const start = s.circuitosQueArrancanAca.length > 0
  // En San Lorenzo los circuitos directos al puerto no tienen peso con cámaras: el ponderado solo
  // refleja a los R7. Se usa el máximo entre circuitos, que es el valor prudente.
  const base = (f) => (n.plant === 'san_lorenzo' ? s.pInicioMax : s.pInicioPonderado?.[f] ?? s.pInicioMax)
  const p = (f) => (start ? 1 : Math.max(FLOOR, base(f)))
  const prev = live[code]
  const row = { label: prev ? `${prev.label} / ${s.label}` : s.label, start: start || !!prev?.start,
    pInicio: { dia: Math.max(p('dia'), prev?.pInicio.dia ?? 0), noche: Math.max(p('noche'), prev?.pInicio.noche ?? 0) },
    read: s.lectura ? { dia: s.lectura.dia, noche: s.lectura.noche } : prev?.read ?? null }
  live[code] = row
}
// El valor que usa el servidor: lo medido con cámaras (primera lectura confirmada después en otro
// nodo, scripts/p-inicio-camaras.mjs) cuando hay 100 pasos o más; si no, el del modelo. El modelo
// supone que las cámaras fallan por separado y queda corto en los nodos profundos (una patente
// sucia falla en todas), y trata Ingreso SL como partida cuando el 90 % viene de Ricardone.
const measuredFile = path.join(root, 'docs/auditoria-patentes-2026-10-08/teorema/p-inicio-camaras.json')
const measured = fs.existsSync(measuredFile) ? JSON.parse(fs.readFileSync(measuredFile, 'utf8')).nodos : {}
for (const [code, row] of Object.entries(live)) {
  row.pInicioModelo = { ...row.pInicio }
  row.camionNuevo = {}
  row.noCamion = {}
  for (const f of ['dia', 'noche']) {
    const m = measured[code]?.[f]
    const truck = m && m.pasos >= 100 ? Math.max(FLOOR, m.pConfirmada) : row.pInicio[f]
    // Nunca visto = no es camión (autos y servicio en Egreso SL o Renova) + camión que aparece por primera vez.
    const nc = measured[code]?.noCamion?.[f]
    const other = nc && nc.pasos >= 100 ? nc.p : 0
    row.camionNuevo[f] = truck
    row.noCamion[f] = other
    row.pInicio[f] = other + (1 - other) * truck
  }
  row.fuente = measured[code] ? 'camaras' : 'modelo'
}
fs.writeFileSync(path.join(root, 'server/plantState/data/pInicioNodos.json'), JSON.stringify({
  generatedAt: out.generatedAt, source: 'scripts/p-inicio-nodos.mjs + scripts/p-inicio-camaras.mjs', floor: FLOOR,
  // Patentes válidas distintas leídas por las cámaras en septiembre (event-list, eventos físicos).
  fleetPlates: 12789, nodes: live }, null, 2) + '\n')

const pc = (x) => (x == null ? '   —  ' : `${(x * 100).toFixed(1).padStart(5)}%`)
console.log('nodo'.padEnd(36), 'lee', ' p_ini pond (tot/día/noche)', '  rango', '  arrancan acá')
for (const s of summary) console.log(`${(s.plant[0].toUpperCase() + ' ' + s.label).padEnd(36)} ${s.lectura ? pc(s.lectura.total) : '  s/d '}  ${pc(s.pInicioPonderado?.total)} ${pc(s.pInicioPonderado?.dia)} ${pc(s.pInicioPonderado?.noche)}   ${pc(s.pInicioMin)}–${pc(s.pInicioMax)}  ${s.circuitosQueArrancanAca.join(',')}`)
