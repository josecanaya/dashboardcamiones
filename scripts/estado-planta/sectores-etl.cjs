// Sectores (calada, volcables, silos) desde las tablas de cámara del ETL, por día calendario.
// Uso: node scripts/estado-planta/sectores-etl.cjs <salida.json> <run1> <run2> ... -- <d1> ... <d7> [-- <d1'> ... <d7'>]
const fs = require('fs'), path = require('path')
const args = process.argv.slice(3)
const runs = args.slice(0, args.indexOf('--'))
const weeks = args.slice(args.indexOf('--') + 1).join(' ').split(' -- ').map(s => s.split(' '))
const T = ['calada_camera_events', 'calada_ricardone_liquid_events', 'calada_sl_camera_events', 'san_lorenzo_volcable_events', 'ricardone_silo_events', 'ricardone_volcable_events']
const rows = {}
for (const t of T) {
  const seen = new Set(); rows[t] = []
  for (const r of runs) {
    const f = path.join(__dirname, '..', '..', 'runs', 'windows', r, 'tables', t + '.json')
    const j = JSON.parse(fs.readFileSync(f)); const a = Array.isArray(j) ? j : j.rows
    for (const x of a) { const k = x.journey_id + '|' + x.camara + '|' + x.timestamp; if (seen.has(k)) continue; seen.add(k); rows[t].push(x) }
  }
}
const out = weeks.map(days => {
  const o = { days }
  for (const t of T) {
    const R = rows[t].filter(x => days.includes(x.fecha))
    const perDay = days.map(d => new Set(R.filter(x => x.fecha === d).map(x => x.journey_id)).size)
    const cams = {}
    for (const x of R) ((cams[x.camara] ??= {})[x.fecha] ??= new Set()).add(x.journey_id)
    const porCamara = Object.fromEntries(Object.entries(cams).map(([c, m]) => [c, days.map(d => (m[d] ? m[d].size : 0))]))
    const horas = new Set(R.map(x => x.intervalo_hora)).size
    const hourly = Array(24).fill(0)
    const hj = {}; for (const x of R) (hj[x.intervalo_hora] ??= new Set()).add(x.journey_id)
    let pico = { n: 0 }
    for (const [h, s] of Object.entries(hj)) { hourly[+h.slice(11, 13)] += s.size; if (s.size > pico.n) pico = { n: s.size, h } }
    o[t] = { semana: new Set(R.map(x => x.journey_id)).size, porDia: perDay, porCamara, horas, hourly, pico }
  }
  return o
})
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1))
for (const w of out) { console.log('==', w.days[0]); for (const t of T) console.log(t, w[t].semana, w[t].porDia.join(' '), 'h', w[t].horas, 'pico', JSON.stringify(w[t].pico), JSON.stringify(Object.fromEntries(Object.entries(w[t].porCamara).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)])))) }
