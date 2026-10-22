// Camiones y toneladas netas por período (uno por comité) y producto, de la planilla / balanza (data/movimientos).
// Uso: node scripts/estado-planta/toneladas-periodos.cjs <serie-comites.json> <desde actual> <hasta actual> <salida.json>
// Mismo criterio que el resto del comité: sin repetir external_operation_id, sin patentes ficticias, día operativo del
// ingreso (desde las 22 h), solo Ricardone y Terminal.
const fs = require('fs'), path = require('path')
const [serieF, desde, hasta, outF] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..')
const SC = JSON.parse(fs.readFileSync(serieF, 'utf8'))
const PER = SC.comites.map(c => ({ comite: c.comite, desde: c.desde, hasta: c.hasta, dias: c.dias }))
  .concat([{ comite: 'Hoy', desde, hasta, dias: Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1 }])
const opDay = s => new Date(Date.parse(String(s).slice(0, 16) + ':00-03:00') - 36e5).toISOString().slice(0, 10)
// grupos que se informan: planta · sentido · familia
const GRUPOS = [
  ['soja', 'Soja a la Terminal', r => r.planta_normalized === 'TERMINAL_EMBARQUE' && r.movement_type === 'INGRESO' && /SOJA$/.test(r.product_normalized)],
  ['r29', 'Soja de silos al puerto (R29)', r => r.planta_normalized === 'RICARDONE' && r.movement_type === 'EGRESO' && /SOJA$/.test(r.product_normalized)],
  ['girasol', 'Girasol a Ricardone', r => r.planta_normalized === 'RICARDONE' && r.movement_type === 'INGRESO' && r.product_normalized === 'GIRASOL'],
  ['pellet', 'Pellet al puerto', r => r.planta_normalized === 'TERMINAL_EMBARQUE' && r.movement_type === 'INGRESO' && /PELLET/.test(r.product_normalized)],
  ['liquidos', 'Líquidos cargados en la Terminal', r => r.planta_normalized === 'TERMINAL_EMBARQUE' && r.movement_type === 'EGRESO' && /^(ACEITE|AC |ACGIRASOL)|GLICERIN|BORRA/.test(r.product_normalized)],
  ['aceiteRic', 'Aceite descargado en Ricardone', r => r.planta_normalized === 'RICARDONE' && r.movement_type === 'INGRESO' && /^(ACEITE|AC |ACGIRASOL)/.test(r.product_normalized) && !/ENVASADO/.test(r.product_normalized)],
]
const out = PER.map(p => ({ ...p, grupos: Object.fromEntries(GRUPOS.map(([k]) => [k, { camiones: 0, toneladas: 0 }])) }))
const seen = new Set()
const porDia = {}   // camiones por día operativo y grupo, para los gráficos del mes
for (const d of fs.readdirSync(path.join(ROOT, 'data', 'movimientos')).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
  if (d < PER[0].desde || d > PER[PER.length - 1].hasta.replace(/\d\d$/, m => String(+m + 3).padStart(2, '0'))) continue
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    if (seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    const pl = r.plate_normalized || ''
    if (pl.length < 6 || new Set(pl).size === 1 || !r.external_ingreso_at) continue
    const dd = opDay(r.external_ingreso_at)
    const p = out.find(x => dd >= x.desde && dd <= x.hasta)
    if (!p) continue
    for (const [k, , fn] of GRUPOS) if (fn(r)) { p.grupos[k].camiones++; p.grupos[k].toneladas += (+r.kgs_neto || 0) / 1000; ((porDia[dd] ??= {})[k] = (porDia[dd][k] || 0) + 1) }
  }
}
for (const p of out) for (const g of Object.values(p.grupos)) g.toneladas = Math.round(g.toneladas)
const total = Object.fromEntries(GRUPOS.map(([k]) => [k, { camiones: out.reduce((s, p) => s + p.grupos[k].camiones, 0), toneladas: out.reduce((s, p) => s + p.grupos[k].toneladas, 0) }]))
fs.writeFileSync(outF, JSON.stringify({ criterio: 'data/movimientos sin repetir operación ni patentes ficticias, día operativo del ingreso; toneladas netas', etiquetas: Object.fromEntries(GRUPOS.map(([k, l]) => [k, l])), periodos: out, total, porDia }, null, 1))
console.log(JSON.stringify(total))
