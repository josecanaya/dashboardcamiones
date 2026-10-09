// Uso histórico de las volcables del puerto (VOLCABLE PTO 1–5) por mes, desde la planilla de movimientos (backup data/movimientos).
// Uso: node scripts/estado-planta/volcables-historico.cjs <salida.json> <mes1> <mes2> ...   (p. ej. 2026-08 2026-09)
// Criterio: plataforma VOLCABLE_PTO_N de la Terminal (soja R7 y la pata de puerto del pellet), dedupe por external_operation_id,
// sin patentes ficticias (/^(X+|P+|T+)$/), mes y día por la hora de ingreso al puerto (día operativo desde las 22 h).
const fs = require('fs'), path = require('path')
const [outPath, ...months] = process.argv.slice(2)
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'data', 'movimientos')
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const opDay = s => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}/.test(s || '')) return null; const h = +s.slice(11, 13); return h >= 22 ? shift(s.slice(0, 10), 1) : s.slice(0, 10) }
const seen = new Set(), R = []
for (const d of fs.readdirSync(DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
  const f = path.join(DIR, d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  const j = JSON.parse(fs.readFileSync(f)); const rows = Array.isArray(j) ? j : (j.rows || j.movimientos || [])
  for (const r of rows) {
    if (seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    const m = /^VOLCABLE_PTO_([1-5])$/.exec(r.platform_normalized || '')
    if (!m || /^(X+|P+|T+)$/.test(r.plate_normalized || '')) continue
    const day = opDay(r.external_ingreso_at) || opDay(r.external_salida_at)
    if (!day || !months.includes(day.slice(0, 7))) continue
    R.push({ v: 'V' + m[1], day, mes: day.slice(0, 7), pellet: /PELLET/.test(r.product_normalized || '') })
  }
}
const out = { criterio: 'planilla de movimientos, plataforma VOLCABLE PTO 1–5, día operativo del ingreso', meses: {} }
for (const mes of months) {
  const rows = R.filter(r => r.mes === mes), days = [...new Set(rows.map(r => r.day))].sort()
  const V = {}
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    const a = rows.filter(r => r.v === v), porDia = days.map(d => a.filter(r => r.day === d).length)
    V[v] = { descargas: a.length, soja: a.filter(r => !r.pellet).length, pellet: a.filter(r => r.pellet).length,
      share: rows.length ? Math.round(a.length / rows.length * 100) : 0, diasOperando: porDia.filter(x => x >= 20).length, porDia }
  }
  out.meses[mes] = { total: rows.length, dias: days.length, primerDia: days[0], ultimoDia: days[days.length - 1], volcables: V }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
for (const [m, x] of Object.entries(out.meses)) console.log(m, x.total, x.dias, x.primerDia, x.ultimoDia, Object.entries(x.volcables).map(([k, v]) => `${k} ${v.descargas} (${v.share} %, soja ${v.soja}, pellet ${v.pellet}, días ${v.diasOperando})`).join(' | '))
