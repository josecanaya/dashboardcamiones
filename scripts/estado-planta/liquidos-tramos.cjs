// Tiempos por tramo de líquidos pegando las cámaras a cada operación de la planilla (patente + ventana horaria).
// Uso: node --max-old-space-size=6144 scripts/estado-planta/liquidos-tramos.cjs <excel_ops_compuesta.json> <salida.json> <d1> ... <dn> [--perfil]
// Universo: mismo criterio de líquidos del comité (aceites, borras, glicerina, lecitina, goma, ácidos grasos, metanol, metilato;
// Universo: movimientos con circuito líquido resuelto (R8, SL1, SL2, SL3), Ricardone y Terminal, ingresos y egresos, día operativo del ingreso.
// SL1: los tramos se miden sobre las cargas (E); las descargas (I) se cuentan aparte.
const fs = require('fs'), path = require('path')
const args = process.argv.slice(2)
const PERFIL = args.includes('--perfil')
const [opsPath, outPath, ...days] = args.filter(a => a !== '--perfil')
const ROOT = path.join(__dirname, '..', '..')
const H = 3600000, AR = 3 * H, SKEW = 206 * 60000
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 19) + '-03:00') : null)
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const opDay = s => { if (!s) return null; const h = +s.slice(11, 13); return h >= 22 ? shift(s.slice(0, 10), 1) : s.slice(0, 10) }
const PROD = /ACEITE|BORRA|GLICERINA|LECITINA|GOMA|ACIDO.? GRASO|METANOL|METILATO/, EXC = /ENVASADO|AGUA/, PL = new Set(['RICARDONE', 'TERMINAL_EMBARQUE']), LQC = new Set(['R8', 'SL1', 'SL2', 'SL3'])
const T = JSON.parse(fs.readFileSync(opsPath))
const seen = new Set(), OPS = []
for (const r of T.rows) {
  if (seen.has(r.external_operation_id)) continue
  seen.add(r.external_operation_id)
  if (!LQC.has(r.resolved_executive_circuit_code) || /AGUA/.test(r.product_normalized || '') || !PL.has(r.planta_normalized) || !['INGRESO', 'EGRESO'].includes(r.movement_type)) continue
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
for (const L of Object.values(byP)) L.sort((a, b) => a.t - b.t)
const evOf = o => (byP[o.plate_normalized] || []).filter(e => o.ini && o.fin && e.t >= o.ini - H && e.t <= o.fin + H)

if (PERFIL) {
  for (const c of ['SL1', 'R8', 'SL2']) {
    const ops = OPS.filter(o => o.resolved_executive_circuit_code === c)
    const cnt = {}; let con = 0
    for (const o of ops) { const ev = evOf(o); if (ev.length) con++; for (const d of new Set(ev.map(e => e.dev))) cnt[d] = (cnt[d] || 0) + 1 }
    console.log(c, 'ops', ops.length, 'con lecturas', con, Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' '))
    const mv = {}; for (const o of ops) mv[o.movement_type + '|' + o.planta_normalized] = (mv[o.movement_type + '|' + o.planta_normalized] || 0) + 1
    console.log('   ', JSON.stringify(mv))
  }
  process.exit(0)
}

// Recorridos por circuito: secuencia de puntos (primer paso por cada uno dentro de la ventana de la operación)
const CIRC = {
  SL1: { nombre: 'SL1 · Terminal San Lorenzo', puntos: [
    ['Ingreso', d => d === 'SLZIngCamFrente'], ['Calada', d => d === 'SLZCalado'], ['Balanza ingreso', d => d === 'SLZBalIngFte'],
    ['Carga', d => /^(RenCargFte|RenDescFte)$/.test(d)], ['Egreso', d => /^SLZSalidaC[12]Fte$/.test(d)]] },
  R8: { nombre: 'R8 · Recepción líquida Ricardone', puntos: [
    ['Pre-ingreso', d => d === 'RicPreIngInFr' || d === 'RicIngCamFrente'], ['Calle líquida', d => d === 'RicCalLiq'], ['Balanza ingreso', d => /^RicB[123]Ingreso$/.test(d)],
    ['Balanza egreso', d => /^RicB[123]Egreso$/.test(d)], ['Egreso', d => d === 'RicEgrCamFrente']] },
}
const out = { dias: days, universo: OPS.length, circuitos: {} }
for (const [c, def] of Object.entries(CIRC)) {
  const ops = OPS.filter(o => o.resolved_executive_circuit_code === c && (c !== 'SL1' || o.movement_type === 'EGRESO'))
  const legs = def.puntos.slice(1).map((p, i) => ({ desde: def.puntos[i][0], hasta: p[0], v: [] }))
  const p2p = [], conCam = []
  for (const o of ops) {
    if (o.ini && o.fin && o.fin > o.ini) p2p.push((o.fin - o.ini) / 60000)
    const ev = evOf(o)
    if (!ev.length) continue
    conCam.push(o)
    // primer paso por cada punto, respetando el orden (cada punto después del anterior leído)
    const tp = []; let last = -Infinity
    for (const [, f] of def.puntos) { const e = ev.find(x => f(x.dev) && x.t >= last); tp.push(e ? e.t : null); if (e) last = e.t }
    for (let i = 1; i < tp.length; i++) if (tp[i - 1] != null && tp[i] != null) { const m = (tp[i] - tp[i - 1]) / 60000; if (m >= 0 && m <= 600) legs[i - 1].v.push(m) }
  }
  const st = v => { const s = [...v].sort((a, b) => a - b); return { n: v.length, media: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, mediana: v.length ? Math.round(s[s.length >> 1]) : null } }
  out.circuitos[c] = { nombre: def.nombre, operaciones: ops.length, conCamaras: conCam.length, puertaAPuerta: st(p2p),
    ingresos: ops.filter(o => o.movement_type === 'INGRESO').length, egresos: ops.filter(o => o.movement_type === 'EGRESO').length,
    tramos: legs.map(l => ({ desde: l.desde, hasta: l.hasta, ...st(l.v) })) }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
for (const [c, v] of Object.entries(out.circuitos)) {
  console.log(c, 'ops', v.operaciones, 'con cámaras', v.conCamaras, 'p2p', JSON.stringify(v.puertaAPuerta), 'ing/egr', v.ingresos, v.egresos)
  for (const t of v.tramos) console.log('   ', t.desde, '→', t.hasta, t.media, 'med', t.mediana, 'n', t.n)
}
// orden observado de las cámaras en SL1 (rango medio de cada cámara dentro de la operación)
if (process.env.ORDEN) {
  const rk = {}
  for (const o of OPS.filter(o => o.resolved_executive_circuit_code === 'SL1')) {
    const ev = evOf(o); const first = {}
    for (const e of ev) if (!(e.dev in first)) first[e.dev] = e.t
    const order = Object.entries(first).sort((a, b) => a[1] - b[1]).map(x => x[0])
    order.forEach((d, i) => { (rk[d] ??= []).push(i / Math.max(1, order.length - 1)) })
  }
  console.log(Object.entries(rk).filter(([, v]) => v.length > 20).map(([d, v]) => [d, (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), v.length]).sort((a, b) => a[1] - b[1]))
}
