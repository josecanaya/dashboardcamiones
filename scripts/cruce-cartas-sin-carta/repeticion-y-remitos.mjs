// Camiones sin carta del deck (Ric+SL, solo productos): ¿siempre las mismas patentes? ¿traen remito / remito Renova?
import fs from 'node:fs'
const [rowsFile, cargasFile, rawFile, out] = process.argv.slice(2)
const raw = JSON.parse(fs.readFileSync(rawFile))
// oleico y para refinar: con carta de derivados según el Excel (en SGC, por producto)
const EXC_D = ['ACGIRASOL OLEICO', 'ACEITE GIRASOL PARA REFINAR', 'PRODUCTOS VARIOS', 'ESCORIA', 'RESIDUOS ORG', 'GAS OIL', 'AGUA INDUSTRIAL']
const KEEP_C = ['ACEITE GIRASOL REFINADO', 'ACEITE SOJA CRUDO DESGOMADO', 'GLICERINA REFINADA', 'BORRA DE ACSOJA REFINADO', 'GLICERINA', 'BORRA ACEITE GIRASOL REFINADO', 'BORRA ACEITE GIRASOL', 'GLICERINA SUBSTANDARD', 'CASCARA DE SOJA PELLETEADA', 'CASCARA DE GIRASOL', 'ACIDOS GRASOS GIRASOL']
const desc = JSON.parse(fs.readFileSync(rowsFile)).filter(r => r.cat === 'sin carta' && r.planta !== 'RENOPACK' && !EXC_D.includes(r.prod)).map(r => ({ ...r, tipo: 'descarga' }))
const carg = JSON.parse(fs.readFileSync(cargasFile)).filter(r => !r.excl && r.cls === 'sin_carta' && KEEP_C.includes(r.prod)).map(r => ({ ...r, tipo: 'carga' }))
const all = [...desc, ...carg]
// ingreso_id de cada movimiento
const ingId = new Map()
for (const d of fs.readdirSync('data/movimientos').filter(x => /^\d{4}-/.test(x) && x >= '2026-09-26' && x <= '2026-10-27'))
  for (const r of JSON.parse(fs.readFileSync(`data/movimientos/${d}/movimientos.json`))) ingId.set(r.external_operation_id, String(r.ingreso_id))
const nz = v => v != null && String(v).trim() !== '' && String(v).trim() !== '0'
for (const r of all) {
  const x = r.src === 'excel' ? raw[ingId.get(r.id)] : null
  r.rawOk = !!x; r.remRenova = x && nz(x.rr) ? String(x.rr) : ''; r.cpRemito = x && nz(x.cp) ? String(x.cp) : ''; r.comprob = x && nz(x.comp) ? String(x.comp) : ''
}
const grp = (arr, f) => arr.reduce((m, r) => { const k = f(r); (m[k] ??= []).push(r); return m }, {})
const res = []
for (const [k, R] of Object.entries(grp(all, r => r.tipo + '|' + r.prod))) {
  const pats = grp(R, r => r.pat)
  const counts = Object.values(pats).map(a => a.length).sort((a, b) => b - a)
  const top = Object.entries(pats).sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([p, a]) => `${p} ${a.length}`)
  const rep = Object.values(pats).filter(a => a.length >= 2)
  const xl = R.filter(r => r.src === 'excel')
  res.push({ tipo: k.split('|')[0], prod: k.split('|')[1], viajes: R.length, patentes: Object.keys(pats).length, viajesDeRepetidas: rep.reduce((s, a) => s + a.length, 0), patentesRepetidas: rep.length, top,
    excel: xl.length, rawOk: xl.filter(r => r.rawOk).length, conRemitoRenova: xl.filter(r => r.remRenova).length, conCpRemito: xl.filter(r => r.cpRemito).length, conComprob: xl.filter(r => r.comprob).length,
    ejRemRenova: [...new Set(xl.map(r => r.remRenova).filter(Boolean))].slice(0, 3), ejCp: [...new Set(xl.map(r => r.cpRemito).filter(Boolean))].slice(0, 3) })
}
res.sort((a, b) => a.tipo.localeCompare(b.tipo) || b.viajes - a.viajes)
const pAll = grp(all, r => r.pat)
const tot = { viajes: all.length, patentes: Object.keys(pAll).length, patentes5mas: Object.values(pAll).filter(a => a.length >= 5).length, viajesDe5mas: Object.values(pAll).filter(a => a.length >= 5).reduce((s, a) => s + a.length, 0),
  unaVez: Object.values(pAll).filter(a => a.length === 1).length, multiProducto: Object.entries(pAll).filter(([, a]) => new Set(a.map(r => r.prod)).size > 1).map(([p, a]) => p + ':' + [...new Set(a.map(r => r.tipo + ' ' + r.prod))].join('/')).slice(0, 15) }
fs.writeFileSync(out, JSON.stringify({ tot, res }, null, 1))
fs.writeFileSync(out.replace(/\.json$/, '.csv'), ['tipo,dia,fuente,planta,producto,patente,remito_renova,cp_remito,comprob'].concat(all.map(r => [r.tipo, r.dia, r.src, r.planta, r.prod, r.pat, r.remRenova, r.cpRemito, r.comprob].join(','))).join('\n'))
console.log(JSON.stringify(tot, null, 1)); for (const r of res) console.log(JSON.stringify(r))
// Por tipo: cuánto del total hacen las patentes que vuelven (≥2) y las de flota (≥5)
for (const t of ['descarga', 'carga']) {
  const R = all.filter(r => r.tipo === t), P = grp(R, r => r.pat), v = Object.values(P)
  const n2 = v.filter(a => a.length >= 2), n5 = v.filter(a => a.length >= 5)
  console.log(t, 'viajes', R.length, 'patentes', v.length, '>=2', n2.length, n2.reduce((s, a) => s + a.length, 0), '>=5', n5.length, n5.reduce((s, a) => s + a.length, 0),
    'excel', R.filter(r => r.src === 'excel').length, 'remRenova', R.filter(r => r.remRenova).length, 'cp', R.filter(r => r.cpRemito).length, 'comprob', R.filter(r => r.comprob).length)
}
