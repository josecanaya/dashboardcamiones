// Cuánto aporta cada hipótesis en cada punto, de día y de noche (semana 01–07/10, DSS + Excel como verdad).
// - Patente: parte de las capturas frontales de camiones del Excel con la patente exacta.
// - Color / marca / tipo: cuántas veces el DSS los da, y cuánto distinguen al mismo camión de otro:
//   coincide con el mismo camión (su valor más común en las demás cámaras) contra coincide con otro camión.
//   Razón = P(coincide | mismo) / P(coincide | otro). Cuanto más alta, más pesa ese atributo en ese punto.
// Uso: node scripts/demostracion/pesos-por-nodo.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const franja = (ms) => { const h = new Date(ms - 3 * 3600_000).getUTCHours(); return h >= 6 && h < 18 ? 'dia' : 'noche' }
const known = (v) => v && !/unknown|unrecognized/i.test(v)

const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const front = new Map()
for (const n of model.nodes) if (n.hasCamera) for (const d of n.devices ?? []) front.set(d.toLowerCase(), n.label + (n.plant === 'san_lorenzo' ? ' SL' : ''))

const excel = new Set()
for (const d of fs.readdirSync(path.join(root, 'data/movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = `data/movimientos/${d}/movimientos.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const r of Array.isArray(o) ? o : Object.values(o)) { const p = plateOf(r?.plate_normalized); if (p) excel.add(p) }
}

const lines = fs.readFileSync(path.join(root, 'data/dss-export/2026-10-01_07/capturas.csv'), 'utf8').trim().split(/\r?\n/)
const head = lines[0].split(',')
const caps = []
for (const l of lines.slice(1)) {
  const v = l.split(','), r = Object.fromEntries(head.map((h, i) => [h, v[i]]))
  const node = front.get(r.camara.toLowerCase())
  if (!node) continue
  const t = Date.parse(`${r.hora_camara.replace(' ', 'T')}-03:00`)
  caps.push({ node, f: franja(t), plate: plateOf(r.patente), color: r.color, marca: r.marca, tipo: r.tipo })
}
// Valor más común de cada atributo por camión, contando todas sus capturas bien leídas.
const counts = new Map()
for (const c of caps) {
  if (!excel.has(c.plate)) continue
  if (!counts.has(c.plate)) counts.set(c.plate, { color: {}, marca: {}, tipo: {} })
  const s = counts.get(c.plate)
  for (const k of ['color', 'marca', 'tipo']) if (known(c[k])) s[k][c[k]] = (s[k][c[k]] ?? 0) + 1
}
// Moda excluyendo la propia captura, para no compararla consigo misma.
const modeWithout = (plate, k, v) => {
  const o = { ...counts.get(plate)?.[k] }
  if (known(v) && o[v]) o[v]--
  return Object.entries(o).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
const trucks = [...counts.keys()]
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const out = {}
for (const c of caps) {
  const o = (out[`${c.node}|${c.f}`] ??= { node: c.node, franja: c.f, n: 0, camion: 0, exacta: 0, attr: { color: { dato: 0, mismo: 0, nMismo: 0, otro: 0, nOtro: 0 }, marca: { dato: 0, mismo: 0, nMismo: 0, otro: 0, nOtro: 0 }, tipo: { dato: 0, mismo: 0, nMismo: 0, otro: 0, nOtro: 0 } } })
  o.n++
  if (!excel.has(c.plate)) continue
  o.camion++
  o.exacta++
  for (const k of ['color', 'marca', 'tipo']) {
    const a = o.attr[k]
    if (!known(c[k])) continue
    a.dato++
    const same = modeWithout(c.plate, k, c[k])
    if (same) { a.nMismo++; if (same === c[k]) a.mismo++ }
    const other = trucks[Math.floor(rnd() * trucks.length)]
    const om = other !== c.plate ? modeWithout(other, k, null) : null
    if (om) { a.nOtro++; if (om === c[k]) a.otro++ }
  }
}
const pc = (a, b) => (b ? Math.round((a / b) * 100) : null)
const ratio = (a) => { const pm = a.nMismo ? a.mismo / a.nMismo : 0, po = a.nOtro ? (a.otro + 0.5) / (a.nOtro + 1) : 1; return pm && po ? Math.round((pm / po) * 10) / 10 : null }
const rows = Object.values(out).filter((o) => o.camion >= 30).sort((a, b) => a.node.localeCompare(b.node) || a.franja.localeCompare(b.franja))
console.log('punto'.padEnd(30), 'franja', 'capturas', '| color: dato% razón | marca: dato% razón | tipo: dato% razón')
for (const o of rows) {
  const f = (k) => `${String(pc(o.attr[k].dato, o.camion)).padStart(3)}% ×${String(ratio(o.attr[k]) ?? '-').padStart(4)}`
  console.log(o.node.padEnd(30), o.franja.padEnd(6), String(o.camion).padStart(7), '|', f('color'), '|', f('marca'), '|', f('tipo'))
}
fs.writeFileSync(path.join(root, 'outputs/demostracion_lote/pesos-por-nodo.json'), JSON.stringify(rows, null, 2) + '\n')
