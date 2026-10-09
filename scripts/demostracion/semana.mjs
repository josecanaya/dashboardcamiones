// Suma la semana: de cada paso que tenía que hacer cada camión, cuánto vio la cámara, cuánto corrigió el
// algoritmo, cuánto se dedujo y cuánto falta. Uso: node scripts/demostracion/semana.mjs 2026-10-01 2026-10-07
import fs from 'node:fs'
const [from, to] = process.argv.slice(2)
const days = []
for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400_000) days.push(new Date(t).toISOString().slice(0, 10))
const K = ['camara', 'corregido', 'deducido', 'final', 'falta']
const tot = { total: 0, camiones: 0, completos: 0 }, porDia = [], porPunto = {}
for (const k of K) tot[k] = 0
for (const d of days) {
  const f = `outputs/demostracion_camaras/${d}_Q1Q2Q3Q4.json`
  if (!fs.existsSync(f)) continue
  const R = JSON.parse(fs.readFileSync(f, 'utf8'))
  const o = { dia: d, camiones: R.porCamion.length, total: 0 }
  for (const k of K) o[k] = 0
  for (const [n, p] of Object.entries(R.porPunto)) { const q = (porPunto[n] ??= { total: 0, ...Object.fromEntries(K.map((k) => [k, 0])) }); q.total += p.total; o.total += p.total; for (const k of K) { q[k] += p[k]; o[k] += p[k] } }
  o.completos = R.porCamion.filter((c) => c.pasos.every((p) => p.estado !== 'falta')).length
  porDia.push(o)
  tot.camiones += o.camiones; tot.completos += o.completos; tot.total += o.total; for (const k of K) tot[k] += o[k]
}
const pc = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—')
const fila = (n, o) => [n.padEnd(36), String(o.total).padStart(6), ...K.map((k) => pc(o[k], o.total).padStart(9))].join(' ')
console.log(['punto / día'.padEnd(36), 'pasos'.padStart(6), ...['cámara', 'algoritmo', 'deducido', 'fin proc.', 'falta'].map((x) => x.padStart(9))].join(' '))
for (const o of porDia) console.log(fila(o.dia + ` (${o.camiones} cam.)`, o))
console.log(fila('SEMANA', tot))
console.log('')
for (const [n, o] of Object.entries(porPunto).sort((a, b) => b[1].total - a[1].total)) console.log(fila(n, o))
console.log(`\ncamiones: ${tot.camiones} · con todos sus pasos: ${tot.completos} (${pc(tot.completos, tot.camiones)})`)
fs.writeFileSync(`outputs/demostracion_camaras/semana_${from}_${to}.json`, JSON.stringify({ porDia, porPunto, total: tot }, null, 1))
