// Mide las reconstrucciones del lote contra el cruce Sistema ↔ cámaras (patente del Sistema = verdad).
import { readFileSync } from 'fs'
import { join } from 'path'
const [loteFile, cruceDir] = process.argv.slice(2)
const csv = (f) => { const [h, ...rows] = readFileSync(join(cruceDir, f), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/); const c = h.split(','); return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [c[i], v]))) }
const movs = new Map(csv('movimientos.csv').map((m) => [m.id, m]))
const pts = csv('por-punto.csv').filter((r) => r.como !== 'exacta' && r.como !== 'sin_lectura' && r.lectura_camara)
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00-03:00')
const from = Math.min(...[...movs.values()].map((m) => ms(m.ingreso)))
const L = JSON.parse(readFileSync(loteFile, 'utf8'))
const out = { coincide: 0, distinto: 0, cruce_sin_asignar: 0 }, mal = []
const usados = new Set()
for (const c of L.porCamion) for (const p of c.pasosDetalle) {
  if (p.estado !== 'reconstruida' || p.prueba) continue
  const t = Date.parse(p.t)
  if (t < from - 3600e3) continue
  const hit = pts.find((r) => r.camara === p.device && r.lectura_camara === p.read && Math.abs(ms(r.hora_camara) - t) <= 3 * 60e3)
  if (!hit) { out.cruce_sin_asignar++; continue }
  usados.add(hit)
  const real = movs.get(hit.id)?.patente
  if (real === c.plate) out.coincide++
  else { out.distinto++; mal.push(`${p.t.slice(5, 16)} ${p.device} leyó ${p.read}: lote ${c.plate} · cruce ${real} (${hit.como})`) }
}
// Lecturas que el cruce recupera y el lote no asignó a nadie
const lote = new Set(L.porCamion.flatMap((c) => c.pasosDetalle.filter((p) => p.estado === 'reconstruida' && !p.prueba).map((p) => `${p.device}|${p.read}|${Math.round(Date.parse(p.t) / 180e3)}`)))
const noTomadas = pts.filter((r) => !usados.has(r)).length
console.log('reconstrucciones del lote (semana del cruce):', out, '· de las que el cruce también asignó, iguales:', ((100 * out.coincide) / Math.max(1, out.coincide + out.distinto)).toFixed(1) + '%')
console.log('lecturas recuperadas por el cruce que el lote no reconstruyó:', noTomadas, 'de', pts.length)
mal.forEach((m) => console.log('  ✗', m))
