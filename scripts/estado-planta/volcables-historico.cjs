// Uso histórico de las volcables del puerto (VOLCABLE PTO 1–5) por mes, desde la planilla de movimientos (backup data/movimientos).
// Uso: node scripts/estado-planta/volcables-historico.cjs <salida.json> <mes1> <mes2> ...   (p. ej. 2026-08 2026-09)
// Criterio: plataforma VOLCABLE_PTO_N de la Terminal (soja R7 y la pata de puerto del pellet), dedupe por external_operation_id,
// sin patentes ficticias (/^(X+|P+|T+)$/), mes y día por la hora de ingreso al puerto (día operativo desde las 22 h).
// Filas de la balanza SGC (VOLCABLE_PTO_SGC, sin calle): la calle sale de la cámara SLZVolcableC1–C5 que leyó la patente
// (o el acoplado: las traseras lo leen) entre el ingreso y la salida; la más leída. Sin lectura → `sinCalle` del mes.
const fs = require('fs'), path = require('path')
const [outPath, ...months] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'data', 'movimientos')
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const opDay = s => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}/.test(s || '')) return null; const h = +s.slice(11, 13); return h >= 22 ? shift(s.slice(0, 10), 1) : s.slice(0, 10) }
const SKEW = 206 * 60000, MARGIN = 15 * 60000
const plateKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const localMs = s => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s || '') ? Date.parse(String(s).slice(0, 19).padEnd(19, ':00') + '-03:00') : null)
const camByPlate = new Map(), camDays = new Set()
function loadVolcableReads(day) {
  if (camDays.has(day)) return
  camDays.add(day)
  const f = path.join(ROOT, 'data', 'truckflow', day, 'event-list.json')
  if (!fs.existsSync(f)) return
  for (const e of JSON.parse(fs.readFileSync(f)).records || []) {
    const m = /^SLZVolcableC([1-5])$/.exec(e.deviceCode || '')
    if (!m) continue
    const p = plateKey(e.truckPlate), t = Date.parse(e.occurredAt) + SKEW
    if (p.length < 6 || Number.isNaN(t)) continue
    if (!camByPlate.has(p)) camByPlate.set(p, [])
    camByPlate.get(p).push({ t, v: 'V' + m[1] })
  }
}
function calleFromCameras(r) {
  const a = localMs(r.external_ingreso_at), b = localMs(r.external_salida_at) ?? a
  if (a == null) return null
  for (let d = shift(String(r.external_ingreso_at).slice(0, 10), -1); d <= shift(String(r.external_salida_at || r.external_ingreso_at).slice(0, 10), 1); d = shift(d, 1)) loadVolcableReads(d)
  const n = {}
  for (const p of new Set([plateKey(r.plate_normalized), plateKey(r.patente_acoplado)].filter(x => x.length >= 6)))
    for (const x of camByPlate.get(p) || []) if (x.t >= a - MARGIN && x.t <= b + MARGIN) n[x.v] = (n[x.v] || 0) + 1
  const best = Object.entries(n).sort((x, y) => y[1] - x[1])[0]
  return best ? best[0] : null
}
const seen = new Set(), R = []
for (const d of fs.readdirSync(DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
  const f = path.join(DIR, d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  const j = JSON.parse(fs.readFileSync(f)); const rows = Array.isArray(j) ? j : (j.rows || j.movimientos || [])
  for (const r of rows) {
    if (seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    const m = /^VOLCABLE_PTO_([1-5]|SGC)$/.exec(r.platform_normalized || '')
    if (!m || /^(X+|P+|T+)$/.test(r.plate_normalized || '')) continue
    const day = opDay(r.external_ingreso_at) || opDay(r.external_salida_at)
    if (!day || !months.includes(day.slice(0, 7))) continue
    const sgc = m[1] === 'SGC'
    R.push({ v: sgc ? calleFromCameras(r) : 'V' + m[1], sgc, day, mes: day.slice(0, 7), pellet: /PELLET/.test(r.product_normalized || '') })
  }
}
const out = { criterio: 'planilla de movimientos, plataforma VOLCABLE PTO 1–5, día operativo del ingreso; filas de la balanza SGC con la calle de la cámara de volcable', meses: {} }
for (const mes of months) {
  const all = R.filter(r => r.mes === mes), rows = all.filter(r => r.v), days = [...new Set(all.map(r => r.day))].sort()
  const V = {}
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    const a = rows.filter(r => r.v === v), porDia = days.map(d => a.filter(r => r.day === d).length)
    V[v] = { descargas: a.length, soja: a.filter(r => !r.pellet).length, pellet: a.filter(r => r.pellet).length,
      share: rows.length ? Math.round(a.length / rows.length * 100) : 0, diasOperando: porDia.filter(x => x >= 20).length, porDia }
  }
  const sg = all.filter(r => r.sgc)
  out.meses[mes] = { total: rows.length, sinCalle: all.length - rows.length, balanzaSgc: { filas: sg.length, conCalleCamara: sg.filter(r => r.v).length }, dias: days.length, primerDia: days[0], ultimoDia: days[days.length - 1], volcables: V }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
for (const [m, x] of Object.entries(out.meses)) console.log(m, x.total, `sin calle ${x.sinCalle}`, `SGC ${x.balanzaSgc.conCalleCamara}/${x.balanzaSgc.filas}`, x.dias, x.primerDia, x.ultimoDia, Object.entries(x.volcables).map(([k, v]) => `${k} ${v.descargas} (${v.share} %, soja ${v.soja}, pellet ${v.pellet}, días ${v.diasOperando})`).join(' | '))
