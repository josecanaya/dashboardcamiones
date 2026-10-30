// Cargas (EGRESO) de Ricardone y San Lorenzo contra las cartas ARCA (granos y derivados, cualquier sentido).
// Uso: node scripts/cruce-cartas-sin-carta/cruce-cargas.mjs salida.json
import fs from 'node:fs'
const [out] = process.argv.slice(2)
const a = JSON.parse(fs.readFileSync('data/arca/arca_consignment_notes.json', 'utf8'))
const byCtg = new Map(a.map(x => [x.ctg, x]))
const byPlate = new Map()
for (const x of a) {
  const t = Date.parse(x.departure_time?.$date || x.issue_time?.$date)
  for (const p of x.transport?.plates || []) {
    const k = p.replace(/\s/g, '').toUpperCase()
    if (!byPlate.has(k)) byPlate.set(k, [])
    byPlate.get(k).push({ t, x })
  }
}
const H = 3600e3
const tLoc = s => Date.parse(s + '-03:00')
// Una carga lleva la carta que se emite al salir: partida entre 24 h antes del ingreso y 48 h después de la salida.
function plateMatch(r) {
  const ti = tLoc(r.external_ingreso_at), ts = r.external_salida_at ? tLoc(r.external_salida_at) : ti
  for (const p of [r.plate_normalized, r.patente_acoplado].filter(Boolean))
    for (const c of byPlate.get(p.toUpperCase()) || []) if (c.t >= ti - 24 * H && c.t <= ts + 48 * H) return c.x
  return null
}
const PLATE = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/
const seen = new Map()
for (const d of fs.readdirSync('data/movimientos').filter(x => /^\d{4}-/.test(x) && x >= '2026-09-26' && x <= '2026-10-27')) {
  for (const r of JSON.parse(fs.readFileSync(`data/movimientos/${d}/movimientos.json`))) {
    if (r.movement_type !== 'EGRESO' || !['RICARDONE', 'TERMINAL_EMBARQUE'].includes(r.planta_normalized)) continue
    seen.set(r.external_operation_id, { ...r, src: r.source_file.startsWith('SGC') ? 'sgc' : 'excel', dia: (r.external_ingreso_at || '').slice(0, 10) })
  }
}
const rows = []
let calN = 0, calOk = 0
for (const r of seen.values()) {
  if (r.dia < '2026-09-28' || r.dia > '2026-10-25') continue
  let excl = null
  if (!PLATE.test(r.plate_normalized || '')) excl = 'patente no válida'
  else if (r.src === 'sgc' && (r.baja || /RECHAZ/i.test(r.condicion || ''))) excl = 'baja/rechazo'
  const num = /^\d{10,}$/.test(r.ctg || '')
  const m = plateMatch(r)
  if (num && byCtg.has(r.ctg)) { calN++; if (m) calOk++ }
  const cls = num && byCtg.has(r.ctg) ? 'carta_ctg' : m ? 'carta_patente' : num ? 'ctg_fuera_base' : 'sin_carta'
  const carta = (num && byCtg.get(r.ctg)) || m
  rows.push({ dia: r.dia, src: r.src, planta: r.planta_normalized, prod: r.product_normalized, pat: r.plate_normalized, aco: r.patente_acoplado || '', ctg: r.ctg, cls, excl,
    cartaTipo: carta ? carta.type_code : null, cartaDest: carta ? carta.destination?.cuit + '/' + carta.destination?.plant?.$numberLong : null,
    entregado: r.entregado_por_a || '', ing: r.external_ingreso_at, sal: r.external_salida_at, id: r.external_operation_id })
}
fs.writeFileSync(out, JSON.stringify(rows))
const c = {}; for (const r of rows) { const k = r.src + ' ' + r.cls + (r.excl ? ' EXCL' : ''); c[k] = (c[k] || 0) + 1 }
console.log(c, 'calibración patente vs CTG', calOk, '/', calN)
