// Resumen en camiones de las cargas sin carta (solo productos; sin residuos, materiales ni agua).
import fs from 'node:fs'
const [inFile, out] = process.argv.slice(2)
const KEEP = ['ACEITE GIRASOL REFINADO', 'ACEITE SOJA CRUDO DESGOMADO', 'GLICERINA REFINADA', 'BORRA DE ACSOJA REFINADO', 'GLICERINA', 'BORRA ACEITE GIRASOL REFINADO', 'BORRA ACEITE GIRASOL', 'GLICERINA SUBSTANDARD', 'CASCARA DE SOJA PELLETEADA', 'CASCARA DE GIRASOL', 'ACIDOS GRASOS GIRASOL']
const all = JSON.parse(fs.readFileSync(inFile)).filter(r => !r.excl)
const W = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']
const wk = d => W.filter(x => x <= d).pop()
const hab = d => { const w = new Date(d + 'T12:00Z').getUTCDay(); return w >= 1 && w <= 5 }
const SC = all.filter(r => r.cls === 'sin_carta' && KEEP.includes(r.prod))
const prod = all.filter(r => KEEP.includes(r.prod) || ['PELLETS GIRASOL', 'SOJA', 'GIRASOL'].includes(r.prod))
const P = {}
for (const r of SC) {
  const p = P[r.prod] ??= { prod: r.prod, n: 0, h: 0, sem: {}, planta: {}, dias: new Set() }
  p.n++; if (hab(r.dia)) p.h++
  p.sem[wk(r.dia)] = (p.sem[wk(r.dia)] ?? 0) + 1; p.planta[r.planta] = (p.planta[r.planta] ?? 0) + 1; p.dias.add(r.dia)
}
const res = Object.values(P).sort((a, b) => b.n - a.n).map(p => ({ ...p, dias: p.dias.size, pd: +(p.n / 28).toFixed(2), ph: +(p.h / 20).toFixed(2), pf: +((p.n - p.h) / 8).toFixed(2), semanas: W.map(w => p.sem[w] ?? 0) }))
const tot = SC.length, th = SC.filter(r => hab(r.dia)).length
const conCarta = {}; for (const r of prod.filter(r => r.cls !== 'sin_carta')) conCarta[r.prod] = (conCarta[r.prod] ?? 0) + 1
const sinRow = {}; for (const r of prod) sinRow[r.prod] = (sinRow[r.prod] ?? 0) + 1
const summary = { tot, pd: +(tot / 28).toFixed(2), ph: +(th / 20).toFixed(2), pf: +((tot - th) / 8).toFixed(2), cargasProducto: prod.length, semanas: W.map(w => SC.filter(r => wk(r.dia) === w).length),
  planta: SC.reduce((m, r) => (m[r.planta] = (m[r.planta] ?? 0) + 1, m), {}), conCarta, productos: res }
fs.writeFileSync(out, JSON.stringify(summary, null, 1))
fs.writeFileSync(out.replace(/\.json$/, '_detalle.csv'), ['dia,fuente,planta,producto,patente,acoplado,ingreso,salida,id'].concat(SC.map(r => [r.dia, r.src, r.planta, r.prod, r.pat, r.aco, r.ing, r.sal, r.id].join(','))).join('\n'))
console.log(JSON.stringify({ ...summary, productos: res.map(p => [p.prod, p.n, p.pd, p.ph, p.pf, p.dias, p.semanas.join('/'), JSON.stringify(p.planta)].join(' ')) }, null, 1))
