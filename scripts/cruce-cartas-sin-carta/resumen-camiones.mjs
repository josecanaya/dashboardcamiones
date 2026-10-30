// Resumen en camiones (sin agua industrial) para el artifact: por producto, semana, día y quién entrega.
import fs from 'node:fs'
const [rowsFile, out] = process.argv.slice(2)
const rows = JSON.parse(fs.readFileSync(rowsFile)).filter(r => r.prod !== 'AGUA INDUSTRIAL')
// Excel: CTG serie 300… = derivados (CPEDG). En SGC no hay CTG: esos dos aceites se asumen con carta por producto.
const CTG_PROD = new Set(['ACGIRASOL OLEICO', 'ACEITE GIRASOL PARA REFINAR'])
for (const r of rows) if (r.src === 'sgc' && r.cat === 'sin carta' && CTG_PROD.has(r.prod)) { r.cat = 'con CTG en Excel, fuera de base ARCA'; r.porProducto = true }
const days = [...new Set(rows.map(r => r.dia))].sort()
const weeks = [...new Set(rows.map(r => r.sem))].sort()
const dow = d => new Date(d + 'T12:00Z').getUTCDay()
const habiles = days.filter(d => dow(d) >= 1 && dow(d) <= 5)
const SC = rows.filter(r => r.cat === 'sin carta')
const byProd = {}
for (const r of SC) {
  const p = byProd[r.prod] ??= { prod: r.prod, n: 0, hab: 0, sem: {}, dia: {}, planta: {}, ent: {}, src: {} }
  p.n++; if (habiles.includes(r.dia)) p.hab++
  p.sem[r.sem] = (p.sem[r.sem] ?? 0) + 1; p.dia[r.dia] = (p.dia[r.dia] ?? 0) + 1
  p.planta[r.planta] = (p.planta[r.planta] ?? 0) + 1; p.src[r.src] = (p.src[r.src] ?? 0) + 1
  const e = (r.entregado || '').split('-')[0].trim() || '(sin dato)'; p.ent[e] = (p.ent[e] ?? 0) + 1
}
const cat = {}; for (const r of rows) { const k = r.cat + (r.porProducto ? ' (por producto)' : ''); cat[k] = (cat[k] ?? 0) + 1 }
const conCarta = {}; for (const r of rows.filter(r => r.cat !== 'sin carta')) conCarta[r.prod] = (conCarta[r.prod] ?? 0) + 1
const diario = days.map(d => ({ dia: d, dow: dow(d), src: rows.find(r => r.dia === d).src, total: rows.filter(r => r.dia === d).length, sin: SC.filter(r => r.dia === d).length }))
const res = { days, weeks, habiles: habiles.length, total: rows.length, sinCarta: SC.length, cat, conCarta, productos: Object.values(byProd).sort((a, b) => b.n - a.n), diario }
fs.writeFileSync(out, JSON.stringify(res, null, 1))
console.log(JSON.stringify({ ...res, diario: undefined, productos: res.productos.map(p => ({ prod: p.prod, n: p.n, dia: +(p.n / days.length).toFixed(2), hab: +(p.hab / habiles.length).toFixed(2), sem: p.sem, planta: p.planta, src: p.src, ent: Object.entries(p.ent).sort((a, b) => b[1] - a[1]).slice(0, 4) })) }, null, 1))
