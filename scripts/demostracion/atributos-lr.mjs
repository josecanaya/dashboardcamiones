// Mide cuánto vale cada atributo del DSS (color, marca, tipo) para decir «es el mismo camión».
// Mismo camión = la misma patente válida leída por dos cámaras distintas el mismo día.
// Distinto = dos patentes distintas leídas el mismo día en cámaras de proceso.
// LR coincide = P(coincide | mismo) / P(coincide | distinto); LR distinto = P(no coincide | mismo) / P(no coincide | distinto).
// Uso: node scripts/demostracion/atributos-lr.mjs [capturas.csv ...]
import fs from 'node:fs'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['data/dss-export/2026-09-24_30/capturas.csv', 'data/dss-export/2026-10-01_07/capturas.csv']
const NOAUTO = /sedan|suv|pickup|van|bus|car|motor/i
const known = (x) => x && !/unrecognized|unknown/i.test(x) ? x : null
const rows = []
for (const f of files) {
  const [head, ...lines] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/)
  const h = head.split(',')
  const ix = (k) => h.indexOf(k)
  for (const l of lines) {
    const c = l.split(',')
    const plate = c[ix('patente')]
    if (!isValidPlate(plate)) continue
    rows.push({ cam: c[ix('camara')], plate, day: c[ix('hora_camara')].slice(0, 10), hour: Number(c[ix('hora_camara')].slice(11, 13)), color: known(c[ix('color')]), marca: known(c[ix('marca')]), tipo: known(c[ix('tipo')]) })
  }
}
// Camiones: patentes que alguna vez el DSS clasificó como camión y nunca como auto en la mayoría.
const tipoCount = new Map()
for (const r of rows) if (r.tipo) { const m = tipoCount.get(r.plate) ?? { t: 0, a: 0 }; NOAUTO.test(r.tipo) ? m.a++ : m.t++; tipoCount.set(r.plate, m) }
const truck = (p) => { const m = tipoCount.get(p); return m && m.t > m.a }
const byPD = new Map()
for (const r of rows) if (truck(r.plate)) { const k = r.plate + '|' + r.day; if (!byPD.has(k)) byPD.set(k, []); byPD.get(k).push(r) }

const TRUCKT = /truck/i
const cross = { same: [0, 0], diff: [0, 0] }
const stats = { color: { same: [0, 0], diff: [0, 0] }, marca: { same: [0, 0], diff: [0, 0] }, tipo: { same: [0, 0], diff: [0, 0] } }
const add = (kind, which, a, b) => {
  if (kind === 'tipo' && a.tipo && b.tipo && a.tipo !== b.tipo) cross[which][TRUCKT.test(a.tipo) !== TRUCKT.test(b.tipo) ? 0 : 1]++
  if (!a[kind] || !b[kind]) return; stats[kind][which][a[kind] === b[kind] ? 0 : 1]++ }
// Mismo camión: un par por cámara distinta (primera lectura de cada cámara).
const sameDay = new Map()
for (const [k, list] of byPD) {
  const perCam = new Map(); for (const r of list) if (!perCam.has(r.cam)) perCam.set(r.cam, r)
  const u = [...perCam.values()]
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) for (const kind of Object.keys(stats)) add(kind, 'same', u[i], u[j])
  const day = k.split('|')[1]; if (!sameDay.has(day)) sameDay.set(day, []); sameDay.get(day).push(u)
}
// Distintos: pares de camiones del mismo día, en cámaras distintas (muestra fija).
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
for (const [, trucks] of sameDay) for (let n = 0; n < trucks.length * 20; n++) {
  const a = trucks[Math.floor(rnd() * trucks.length)], b = trucks[Math.floor(rnd() * trucks.length)]
  if (a === b) continue
  const x = a[Math.floor(rnd() * a.length)], y = b[Math.floor(rnd() * b.length)]
  if (x.cam === y.cam) continue
  for (const kind of Object.keys(stats)) add(kind, 'diff', x, y)
}
const out = {}
for (const [kind, s] of Object.entries(stats)) {
  const pS = s.same[0] / (s.same[0] + s.same[1]), pD = s.diff[0] / (s.diff[0] + s.diff[1])
  out[kind] = { paresMismo: s.same[0] + s.same[1], coincideMismo: +pS.toFixed(3), coincideDistinto: +pD.toFixed(3), lrCoincide: +(pS / pD).toFixed(2), lrDistinto: +((1 - pS) / (1 - pD)).toFixed(2) }
}
{ const pS = cross.same[0] / (stats.tipo.same[0] + stats.tipo.same[1]), pD = cross.diff[0] / (stats.tipo.diff[0] + stats.tipo.diff[1]); out.tipoCruzado = { paresMismo: cross.same[0], coincideMismo: +pS.toFixed(3), coincideDistinto: +pD.toFixed(3), lrCoincide: null, lrDistinto: +(pS / pD).toFixed(2) } }
console.table(out)
fs.writeFileSync('outputs/demostracion_camaras/atributos-lr.json', JSON.stringify({ generatedAt: new Date().toISOString(), files, criterio: 'mismo = misma patente válida, mismo día, cámaras distintas; distinto = patentes distintas mismo día', ...out }, null, 2))
