// Errores de lectura reales, por punto, con una verdad que no usa el modelo:
// (1) dobles: la misma cámara captura dos veces en ≤ 40 s, sin nada en el medio; una lectura es la patente
//     exacta de un camión del Excel y la otra distinta → la distinta es un error de lectura de ese camión.
// (2) inventario: un único candidato con > 95 % del peso por tiempo, y la lectura no es la patente válida
//     de otro vehículo (formato inválido, o patente que no aparece en ninguna otra captura de la semana).
// Uso: node scripts/demostracion/errores-lectura.mjs
import fs from 'node:fs'
import path from 'node:path'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'

const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const label = new Map()
for (const n of model.nodes) if (n.hasCamera) for (const d of n.devices ?? []) label.set(d.toLowerCase(), (n.plant === 'san_lorenzo' ? 'SL ' : '') + n.label)
const excel = new Set()
for (const d of fs.readdirSync(path.join(root, 'data/movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = `data/movimientos/${d}/movimientos.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const r of Array.isArray(o) ? o : Object.values(o)) { const p = plateOf(r?.plate_normalized); if (p) excel.add(p) }
}
const lines = fs.readFileSync(path.join(root, 'data/dss-export/2026-10-01_07/capturas.csv'), 'utf8').trim().split(/\r?\n/)
const head = lines[0].split(',')
const byDev = new Map(), seen = new Map()
for (const l of lines.slice(1)) {
  const v = l.split(','), r = Object.fromEntries(head.map((h, i) => [h, v[i]]))
  const dev = r.camara.toLowerCase()
  if (!label.has(dev)) continue
  const c = { node: label.get(dev), t: Date.parse(`${r.hora_camara.replace(' ', 'T')}-03:00`), plate: plateOf(r.patente) }
  if (!byDev.has(dev)) byDev.set(dev, [])
  byDev.get(dev).push(c)
  seen.set(c.plate, (seen.get(c.plate) ?? 0) + 1)
}
const pairs = []
for (const list of byDev.values()) {
  list.sort((a, b) => a.t - b.t)
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1]
    if (b.t - a.t > 40_000 || a.plate === b.plate) continue
    if (excel.has(a.plate) && !excel.has(b.plate)) pairs.push({ fuente: 'doble', node: a.node, real: a.plate, leida: b.plate })
    else if (excel.has(b.plate) && !excel.has(a.plate)) pairs.push({ fuente: 'doble', node: a.node, real: b.plate, leida: a.plate })
  }
}
const invFile = path.join(root, 'outputs/demostracion_lote/pares-inventario.json')
for (const x of fs.existsSync(invFile) ? JSON.parse(fs.readFileSync(invFile, 'utf8')) : []) {
  if (!x.leida || (isValidPlate(x.leida) && ((seen.get(x.leida) ?? 0) > 1 || excel.has(x.leida)))) continue
  pairs.push({ fuente: 'inventario', node: label.get('') ?? x.node.replace('san_lorenzo:', 'SL ').replace('ricardone:', ''), real: x.real, leida: x.leida })
}
const CONF = new Set(['0O', '0D', '0Q', '8B', '1I', '1L', '5S', '2Z', '6G', '4A', 'MN', 'UV', 'VY', 'HM', 'EF', 'CG'].flatMap((p) => [p, p[1] + p[0]]))
function ops(a, b) {
  const n = a.length, m = b.length, d = [...Array(n + 1)].map(() => Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  let i = n, j = m
  const o = { conf: 0, sub: 0, menos: 0, mas: 0 }
  while (i || j) {
    if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { if (a[i - 1] !== b[j - 1]) CONF.has(a[i - 1] + b[j - 1]) ? o.conf++ : o.sub++; i--; j-- }
    else if (j && d[i][j] === d[i][j - 1] + 1) { o.menos++; j-- }
    else { o.mas++; i-- }
  }
  return o
}
const cls = (real, leida) => {
  if (!leida) return 'sin lectura'
  const o = ops(leida, real), k = o.conf + o.sub + o.menos + o.mas
  if (k === 1) return o.conf ? '1 confusión típica' : o.menos ? '1 letra de menos' : o.mas ? '1 letra de más' : '1 letra cualquiera'
  if (k === 2) return '2 cambios'
  if (k === 3) return '3 cambios'
  return 'muy dañada (4 o más)'
}
const CL = ['1 confusión típica', '1 letra de menos', '1 letra de más', '1 letra cualquiera', '2 cambios', '3 cambios', 'muy dañada (4 o más)']
const tally = (list) => { const o = Object.fromEntries(CL.map((k) => [k, 0])); for (const x of list) o[cls(x.real, x.leida)]++; return o }
for (const f of ['doble', 'inventario']) {
  const L = pairs.filter((x) => x.fuente === f)
  const t = tally(L)
  console.log(`\n${f}: ${L.length} pares`)
  for (const k of CL) console.log(`  ${k.padEnd(22)} ${String(t[k]).padStart(4)}  ${Math.round((t[k] / L.length) * 100)}%`)
  for (const k of ['2 cambios', '3 cambios', 'muy dañada (4 o más)']) console.log(`  ej. ${k}: ${L.filter((x) => cls(x.real, x.leida) === k).slice(0, 8).map((x) => `${x.real}→${x.leida}`).join(', ')}`)
}
const all = pairs
console.log('\npor punto (dobles + inventario):')
const nodes = [...new Set(all.map((x) => x.node))]
for (const n of nodes) {
  const L = all.filter((x) => x.node === n)
  if (L.length < 15) continue
  const t = tally(L), p = (k) => `${Math.round((t[k] / L.length) * 100)}%`.padStart(4)
  console.log(`  ${n.padEnd(24)} ${String(L.length).padStart(4)} | conf ${p('1 confusión típica')} menos ${p('1 letra de menos')} más ${p('1 letra de más')} cualquiera ${p('1 letra cualquiera')} | 2 cambios ${p('2 cambios')} | 3 ${p('3 cambios')} | 4+ ${p('muy dañada (4 o más)')}`)
}
fs.writeFileSync(path.join(root, 'outputs/demostracion_lote/errores-lectura.json'), JSON.stringify(pairs, null, 1) + '\n')
