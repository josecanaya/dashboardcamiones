// Histórico de operativos de pellet (transile de pellet de girasol Ricardone → puerto) desde el backup
// de movimientos: viajes, camiones (patentes distintas), toneladas (viajes × 30 y netas), horas y
// viajes por camión por día. Transile = planta RICARDONE, EGRESO, PELLETS GIRASOL, entregado a "PUERTO".
// Uso: node scripts/estado-planta/pellet-historico.cjs <salida.json>
const fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..', 'data', 'movimientos')
const H = 3600000
// Operativos cortados por semana de comité (rótulo = fecha del comité; ciclo publicado en ese comité)
const OPS = [
  { id: 'jun-jul', desde: '2026-06-30', hasta: '2026-07-04', comite: null, ciclo: null },
  { id: 'jul', desde: '2026-07-08', hasta: '2026-07-15', comite: null, ciclo: null },
  { id: '28/8', desde: '2026-08-18', hasta: '2026-08-22', comite: '28/8', ciclo: 396 },
  { id: '4/9', desde: '2026-08-28', hasta: '2026-09-02', comite: '4/9', ciclo: 381 },
  { id: '11/9', desde: '2026-09-03', hasta: '2026-09-05', comite: '11/9', ciclo: 392 },
  { id: '18/9', desde: '2026-09-14', hasta: '2026-09-15', comite: '18/9', ciclo: 263 },
  { id: '2/10', desde: '2026-09-24', hasta: '2026-09-30', comite: '2/10', ciclo: null },
]
const seen = new Set(), R = []
for (const d of fs.readdirSync(ROOT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
  const f = path.join(ROOT, d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const x of JSON.parse(fs.readFileSync(f))) {
    if (seen.has(x.external_operation_id)) continue
    seen.add(x.external_operation_id)
    if (x.planta_normalized !== 'RICARDONE' || x.movement_type !== 'EGRESO') continue
    if (!/PELLETS GIRASOL/.test(x.product_normalized || '') || !/PUERTO/.test(x.entregado_por_a || '')) continue
    if (/^(.)\1+$/.test(x.plate_normalized || '')) continue
    R.push(x)
  }
}
const dayOf = x => (x.external_salida_at || x.external_ingreso_at || '').slice(0, 10)
const out = OPS.map(o => {
  const rows = R.filter(x => dayOf(x) >= o.desde && dayOf(x) <= o.hasta)
  const plates = new Set(rows.map(x => x.plate_normalized))
  const marks = rows.flatMap(x => [x.external_ingreso_at, x.external_salida_at]).filter(Boolean).map(s => Date.parse(s + '-03:00')).sort((a, b) => a - b)
  const bloques = []
  for (const t of marks) { const b = bloques[bloques.length - 1]; if (!b || t - b.fin > 4 * H) bloques.push({ ini: t, fin: t }); else b.fin = t }
  const porDia = {}
  for (const x of rows) ((porDia[dayOf(x)] ??= {})[x.plate_normalized] = (porDia[dayOf(x)][x.plate_normalized] || 0) + 1)
  const vpd = Object.values(porDia).flatMap(m => Object.values(m))
  return {
    ...o, viajes: rows.length, camiones: plates.size, dias: Object.keys(porDia).length,
    toneladas30: rows.length * 30, toneladasNetas: Math.round(rows.reduce((s, x) => s + (+x.kgs_neto || 0), 0) / 1000),
    horas: +bloques.reduce((s, b) => s + (b.fin - b.ini) / H, 0).toFixed(1), tandas: bloques.length,
    viajesPorCamion: +(rows.length / (plates.size || 1)).toFixed(1),
    viajesPorCamionDia: +(vpd.reduce((a, b) => a + b, 0) / (vpd.length || 1)).toFixed(1), maxViajesCamionDia: Math.max(0, ...vpd),
    toneladasPorHora: bloques.length ? Math.round(rows.length * 30 / bloques.reduce((s, b) => s + (b.fin - b.ini) / H, 0)) : null,
  }
})
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1))
console.table(out.map(o => ({ op: o.id, desde: o.desde, hasta: o.hasta, viajes: o.viajes, camiones: o.camiones, dias: o.dias, t30: o.toneladas30, horas: o.horas, 'v/cam/dia': o.viajesPorCamionDia, max: o.maxViajesCamionDia, 't/h': o.toneladasPorHora, ciclo: o.ciclo })))
