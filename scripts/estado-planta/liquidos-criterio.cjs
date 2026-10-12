// Líquidos según planilla con un criterio único: por PRODUCTO (familia), por PLANTA y por SENTIDO (ingreso = descarga, egreso = carga).
// No depende del circuito resuelto (R8/SL1/SL2/SL3), que mezcla plantas: p. ej. la glicerina de Terminal sale con R8, que es Ricardone.
// Uso: node scripts/estado-planta/liquidos-criterio.cjs <desde> <hasta> [salida.json]
//   VICENTIN_ROOT = raíz con data/movimientos (por defecto, la del repo).
// Fuente: data/movimientos/<día>/movimientos.json (nivel A), sin repetir external_operation_id. Día = día operativo del ingreso (desde las 22 h).
const fs = require('fs'), path = require('path')
const [desde, hasta, outPath] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..')
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 16) + ':00-03:00') : null)
const opDay = s => { const t = ts(s); return t == null ? null : new Date(t - 36e5).toISOString().slice(0, 10) } // hora AR + 2 h
const fake = p => !p || /^(.)\1+$/.test(p) || p.length < 6

// familia por producto; null = no es líquido
const FAM = [
  ['excluido:envasado', /ENVASADO/], ['excluido:agua', /^AGUA/], ['excluido:alcohol (Avellaneda)', /ALCOHOL/], ['excluido:gas industrial', /NITROGENO/],
  ['excluido:vinaza (Avellaneda)', /THIN STILLAGE/], ['excluido:sal glicerinosa', /SAL GLICERINOSA/],
  ['borras', /BORRA/], ['glicerina', /GLICERIN/], ['aceite', /^(ACEITE|AC |ACGIRASOL)/],
  ['insumos químicos', /METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO/], ['biodiésel', /BIODIESEL/], ['lecitina', /LECITINA/],
]
const famOf = prod => { for (const [f, re] of FAM) if (re.test(prod || '')) return f; return null }

const seen = new Set(), rows = []
for (let d = shift(desde, -1); d <= shift(hasta, 3); d = shift(d, 1)) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  const j = JSON.parse(fs.readFileSync(f)); const arr = Array.isArray(j) ? j : (j.rows || j.movimientos || Object.values(j))
  for (const r of arr) {
    if (!r || seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    const fam = famOf(r.product_normalized)
    if (!fam) continue
    const dia = opDay(r.external_ingreso_at)
    if (!dia || dia < desde || dia > hasta) continue
    const a = ts(r.external_ingreso_at), b = ts(r.external_salida_at)
    rows.push({ id: r.external_operation_id, dia, planta: r.planta_normalized, sentido: r.movement_type, fam, prod: r.product_normalized,
      plat: r.platform_normalized || '', patente: r.plate_normalized, ficticia: fake(r.plate_normalized), ingreso: r.external_ingreso_at, salida: r.external_salida_at,
      p2p: a != null && b != null && b > a ? (b - a) / 6e4 : null })
  }
}
const q = (v, p) => { if (!v.length) return null; const s = [...v].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) }
const agg = rs => { const v = rs.map(r => r.p2p).filter(x => x != null && x <= 2880); return { n: rs.length, conTiempo: v.length, media: v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null, mediana: q(v, 0.5) } }
const group = (rs, kf) => { const o = {}; for (const r of rs) (o[kf(r)] ??= []).push(r); return Object.fromEntries(Object.entries(o).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, agg(v)])) }
const dias = []; for (let d = desde; d <= hasta; d = shift(d, 1)) dias.push(d)
const dentro = rows.filter(r => !r.fam.startsWith('excluido') && !r.ficticia)
const nodo = dentro.filter(r => (r.planta === 'RICARDONE' || r.planta === 'TERMINAL_EMBARQUE') && (r.sentido === 'INGRESO' || r.sentido === 'EGRESO'))
const out = {
  desde, hasta, dias, criterio: 'producto líquido a granel (aceites, borras, glicerina, insumos químicos, biodiésel, lecitina); Ricardone y Terminal; ingresos y egresos por separado; día operativo del ingreso; sin patentes ficticias',
  total: agg(nodo),
  porPlantaSentido: group(nodo, r => `${r.planta} · ${r.sentido}`),
  porPlantaFamiliaSentido: group(nodo, r => `${r.planta} · ${r.fam} · ${r.sentido}`),
  porProducto: group(nodo, r => `${r.planta} · ${r.sentido} · ${r.prod}`),
  porDia: Object.fromEntries(dias.map(d => [d, Object.fromEntries(['RICARDONE', 'TERMINAL_EMBARQUE'].map(p => [p, Object.fromEntries(['INGRESO', 'EGRESO'].map(s => [s, nodo.filter(r => r.dia === d && r.planta === p && r.sentido === s).length]))]))])),
  renopack: group(dentro.filter(r => r.planta === 'RENOPACK'), r => `${r.sentido} · ${r.prod}`),
  otrasPlantas: group(dentro.filter(r => !['RICARDONE', 'TERMINAL_EMBARQUE', 'RENOPACK'].includes(r.planta)), r => `${r.planta} · ${r.sentido} · ${r.prod}`),
  otrosSentidos: group(dentro.filter(r => ['RICARDONE', 'TERMINAL_EMBARQUE'].includes(r.planta) && r.sentido !== 'INGRESO' && r.sentido !== 'EGRESO'), r => `${r.planta} · ${r.sentido} · ${r.prod}`),
  excluidos: group(rows.filter(r => r.fam.startsWith('excluido')), r => `${r.fam} · ${r.planta} · ${r.prod}`),
  ficticias: rows.filter(r => r.ficticia && !r.fam.startsWith('excluido')).length,
}
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(out, null, 1)); if (process.env.ROWS_OUT) fs.writeFileSync(process.env.ROWS_OUT, JSON.stringify(nodo)) }
console.log(JSON.stringify({ ...out, porProducto: undefined, porDia: undefined }, null, 1))
