// SL1 (egresos de aceite de la Terminal): dónde se caló cada camión, Ricardone o San Lorenzo, pegando cámaras por patente + horario.
// Uso: node --max-old-space-size=6144 scripts/estado-planta/sl1-calada.cjs <excel_ops_compuesta.json> <salida.json> <d1> ... <dn>
// Calada San Lorenzo = lectura SLZCalado entre 1 h antes del ingreso y la salida de la planilla.
// Calada Ricardone   = lectura en una calle de calada de Ricardone (RicCalLiq / RicCal0x) en las 8 h previas al ingreso a la Terminal.
const fs = require('fs'), path = require('path')
const [opsPath, outPath, ...days] = process.argv.slice(2)
const ROOT = path.join(__dirname, '..', '..')
const H = 3600000, SKEW = 206 * 60000
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 19) + '-03:00') : null)
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const opDay = s => { if (!s) return null; const h = +s.slice(11, 13); return h >= 22 ? shift(s.slice(0, 10), 1) : s.slice(0, 10) }
const PROD = /ACEITE|BORRA|GLICERINA|LECITINA|GOMA|ACIDO.? GRASO|METANOL|METILATO/, EXC = /ENVASADO|AGUA/
const T = JSON.parse(fs.readFileSync(opsPath))
const seen = new Set(), OPS = []
for (const r of T.rows) {
  if (seen.has(r.external_operation_id)) continue
  seen.add(r.external_operation_id)
  if (r.resolved_executive_circuit_code !== 'SL1' || r.movement_type !== 'EGRESO' || /AGUA/.test(r.product_normalized || '')) continue   // cargas de SL1
  const d = opDay(r.external_ingreso_at)
  if (!days.includes(d) || /^(.)\1+$/.test(r.plate_normalized || '')) continue
  OPS.push({ ...r, _d: d, ini: ts(r.external_ingreso_at), fin: ts(r.external_salida_at) })
}
const plates = new Set(OPS.map(o => o.plate_normalized))
const byP = {}, seenE = new Set()
for (let d = shift(days[0], -1); d <= shift(days[days.length - 1], 1); d = shift(d, 1)) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plates.has(p)) continue
    const t = Date.parse(e.occurredAt) + SKEW
    const k = p + '|' + e.deviceCode + '|' + Math.round(t / 1000)
    if (!Number.isFinite(t) || seenE.has(k)) continue
    seenE.add(k)
    ;(byP[p] ??= []).push({ t, dev: e.deviceCode })
  }
}
const isRicCal = d => /^RicCal(Liq|0\d)/.test(d)
const st = v => { const s = [...v].sort((a, b) => a - b); return { n: v.length, media: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null } }
const G = { sl: [], ric: [], ambas: [], sinLectura: [] }
const devRic = {}
for (const o of OPS) {
  const ev = byP[o.plate_normalized] || []
  const sl = o.ini && o.fin && ev.some(e => e.dev === 'SLZCalado' && e.t >= o.ini - H && e.t <= o.fin)
  const ricEv = o.ini ? ev.filter(e => isRicCal(e.dev) && e.t >= o.ini - 8 * H && e.t <= o.ini) : []
  for (const e of ricEv) devRic[e.dev] = (devRic[e.dev] || 0) + 1
  const ric = ricEv.length > 0
  const g = sl && ric ? 'ambas' : sl ? 'sl' : ric ? 'ric' : 'sinLectura'
  G[g].push({ plate: o.plate_normalized, dia: o._d, producto: o.product_normalized, p2p: o.ini && o.fin ? Math.round((o.fin - o.ini) / 60000) : null,
    ricAntes: ric ? Math.round((o.ini - Math.max(...ricEv.map(e => e.t))) / 60000) : null })
}
const out = { dias: days, operaciones: OPS.length, devRicardone: devRic, grupos: {} }
for (const [k, a] of Object.entries(G)) out.grupos[k] = { n: a.length, p2p: st(a.map(x => x.p2p).filter(x => x != null)), ricAntes: st(a.map(x => x.ricAntes).filter(x => x != null)),
  porDia: days.map(d => a.filter(x => x.dia === d).length), productos: a.reduce((m, x) => (m[x.producto] = (m[x.producto] || 0) + 1, m), {}), patentes: a.map(x => x.plate) }
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
for (const [k, v] of Object.entries(out.grupos)) console.log(k, v.n, 'p2p', JSON.stringify(v.p2p), 'ricAntes', JSON.stringify(v.ricAntes), v.porDia.join('/'))
console.log('cámaras Ricardone', JSON.stringify(devRic))
