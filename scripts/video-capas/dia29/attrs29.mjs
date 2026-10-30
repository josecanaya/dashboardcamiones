import fs from 'fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const { alertAttributes } = await import('file:///' + R + 'server/plantState/alertReads.mjs')
const P = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const L = (f) => { if (!fs.existsSync(R + f)) return []; const r = JSON.parse(fs.readFileSync(R + f, 'utf8')); return Array.isArray(r) ? r : (r.value ?? r.records ?? []) }
const votes = {}
for (const d of ['2026-10-28', '2026-10-29', '2026-10-30']) for (const a of L(`data/truckflow/${d}/alert-list.json`)) {
  let p = {}; try { p = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload ?? {} } catch {}
  const plate = P(p.plate); if (!plate) continue
  const at = alertAttributes(a); if (!at) continue
  const v = (votes[plate] ??= { liviano: 0, camion: 0, cats: {} }); if (at.vehicleClass) v[at.vehicleClass]++; if (at.category) v.cats[at.category] = (v.cats[at.category] || 0) + 1
}
// DSS parcial (19:50–23:59)
const dss = fs.readFileSync(new URL('./dss-29-parcial.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','))
for (const r of dss) { const plate = P(r[2]), tipo = r[8]; const v = (votes[plate] ??= { liviano: 0, camion: 0, cats: {} }); v.cats['dss:' + tipo] = (v.cats['dss:' + tipo] || 0) + 1; if (/Car|SUV|Pickup|MPV|Van|Motor/i.test(tipo)) v.liviano++; else if (/Truck|Bus/i.test(tipo)) v.camion++ }
fs.writeFileSync(new URL('./attrs29.json', import.meta.url), JSON.stringify(votes))
const d = JSON.parse(fs.readFileSync(new URL('./dia29-alg.json', import.meta.url), 'utf8'))
const al = Object.entries(d.trucks).filter(([, v]) => v.layer === 'al4')
let liv = 0, cam = 0, none = 0; for (const [p] of al) { const v = votes[p]; if (!v || v.liviano + v.camion === 0) none++; else if (v.liviano > v.camion) liv++; else cam++ }
console.log('alerta', al.length, 'liviano', liv, 'camion', cam, 'sin dato', none)
console.log(al.filter(([p]) => votes[p] && votes[p].camion >= votes[p].liviano && votes[p].camion > 0).slice(0, 30).map(([p, v]) => p + '(' + v.n + ')' + JSON.stringify(votes[p].cats)).join('\n'))
