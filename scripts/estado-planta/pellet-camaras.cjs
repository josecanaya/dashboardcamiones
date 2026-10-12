// Pellet de girasol (transile Ricardone → volcables del puerto) SOLO con cámaras, sin planilla.
// Viaje = balanza de egreso de Ricardone (RicB1/2/3Egreso) con Playa 3 o calle líquida antes y sin calada sólida, carga de silo ni volcable de Ricardone
// entre el pre-ingreso y el puerto, seguido de lecturas del puerto (balanza SLZ, volcable o salida SLZ) en las 12 h siguientes.
// Es la misma secuencia que pellet-operativo.cjs, pero sobre TODAS las patentes (allá se filtraba por las patentes de la planilla).
// Si hay planilla para el rango (data/movimientos), calibra: egresos de pellet de la planilla contra viajes de cámara.
// Uso: node --max-old-space-size=4096 scripts/estado-planta/pellet-camaras.cjs <desde> <hasta> <salida.json>
//   VICENTIN_ROOT = raíz con data/truckflow y data/movimientos (por defecto, la del repo). Hora operativa = occurredAt + 206 min.
const fs = require('fs'), path = require('path')
const [from, to, outPath] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..')
const SKEW = 206 * 60000, H = 3600000, AR = 3 * H
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const calDay = t => new Date(t - AR).toISOString().slice(0, 10)
const hour = t => new Date(t - AR).getUTCHours()
const quarter = t => { const h = hour(t); return h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4' }
const fake = p => p.length < 6 || /^(.)\1+$/.test(p)

const seen = new Set(), byP = {}, diasConEventos = []
for (let d = addDays(from, -1); d <= addDays(to, 1); d = addDays(d, 1)) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  diasConEventos.push(d)
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (fake(p)) continue
    ;(byP[p] ??= []).push({ t: Date.parse(e.occurredAt) + SKEW, dev: e.deviceCode })
  }
}
const is = {
  ing: d => d === 'RicIngCamFrente', pre: d => d === 'RicPreIngInFr', liq: d => d === 'RicCalLiq', p3: d => d === 'RicS6Playa3',
  balE: d => /^RicB[123]Egreso$/.test(d), silo: d => /^(RicS7Carga|RicS8CargaLinea[12])$/.test(d), cal: d => /^RicCal0\d$/.test(d),
  volcR: d => /^RicVolcable[12]$/.test(d),
  slI: d => d === 'SLZIngCamFrente', slB: d => d === 'SLZBalIngFte', slV: d => /^SLZVolcableC\d$/.test(d), slS: d => /^SLZSalidaC[12]Fte$/.test(d),
}
const ini = Date.parse(from + 'T00:00:00-03:00'), fin = Date.parse(addDays(to, 1) + 'T00:00:00-03:00')
const m = (a, b, cap) => (a != null && b != null && b > a && (b - a) / 60000 <= cap ? (b - a) / 60000 : null)
const trips = []
for (const [p, L] of Object.entries(byP)) {
  L.sort((a, b) => a.t - b.t)
  for (let i = 0; i < L.length; i++) {
    const e = L[i]
    if (!is.balE(e.dev) || e.t < ini || e.t >= fin) continue
    if (i > 0 && is.balE(L[i - 1].dev) && e.t - L[i - 1].t < 30 * 60000) continue
    let pre = null, liq = null, p3 = null, bad = false
    for (let j = i - 1; j >= 0 && e.t - L[j].t < 10 * H; j--) {
      const d = L[j].dev
      if (is.silo(d) || is.cal(d) || is.volcR(d)) { bad = true; break }
      if (is.slS(d) || is.balE(d)) break
      if (is.p3(d)) p3 = L[j].t
      if (is.liq(d)) liq = L[j].t
      if (is.pre(d)) { pre = L[j].t; break }
    }
    if (bad || !(p3 || liq)) continue   // Playa 3 o calle líquida: con solo Playa 3 se pierde 1 de cada 4 viajes
    let slI = null, slB = null, slV = null, slS = null, back = null, volc = null
    for (let j = i + 1; j < L.length && L[j].t - e.t < 12 * H; j++) {
      const d = L[j].dev
      if (is.cal(d) || is.silo(d)) { bad = true; break }
      if (is.pre(d) || is.balE(d)) { if (slS) back = L[j].t; break }
      if (is.slI(d) && !slI) slI = L[j].t
      if (is.slB(d) && !slB) slB = L[j].t
      if (is.slV(d) && !slV) { slV = L[j].t; volc = 'V' + d.slice(-1) }
      if (is.slS(d)) slS = L[j].t
    }
    if (bad || !(slV || slB || slS)) continue
    const p3x = p3 && (!liq || p3 > liq) ? p3 : null
    trips.push({ p, day: calDay(e.t), q: quarter(pre ?? e.t), t: e.t, volc, conLiq: !!liq,
      playa1: m(pre, liq, 240), ptara: m(liq ?? pre, p3x, 120), carga: m(p3x ?? liq ?? pre, e.t, 480), interplanta: m(e.t, slI, 60),
      playaOsl: m(slI, slB, 480), descarga: m(slB ?? slI, slV, 360), salida: m(slV, slS, 120),
      ric: m(pre, e.t, 600), sl: m(slI ?? e.t, slS, 720), ciclo: m(pre, slS, 1200), vuelta: m(slS, back, 180) })
  }
}
const KEYS = ['playa1', 'ptara', 'carga', 'interplanta', 'playaOsl', 'descarga', 'salida', 'ric', 'sl', 'ciclo', 'vuelta']
const stat = rows => Object.fromEntries(KEYS.map(k => { const v = rows.map(r => r[k]).filter(x => x != null); return [k, { mean: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length }] }))
const dias = []; for (let d = from; d <= to; d = addDays(d, 1)) dias.push(d)
// bloques de actividad (corte con más de 4 h sin viajes): tandas del operativo y sus horas
const tt = trips.map(t => t.t).sort((a, b) => a - b), bloques = []
for (const t of tt) { const b = bloques[bloques.length - 1]; if (!b || t - b.fin > 4 * H) bloques.push({ ini: t, fin: t, viajes: 1 }); else { b.fin = t; b.viajes++ } }
const fmt = t => new Date(t - AR).toISOString().slice(0, 16).replace('T', ' ')
const out = {
  desde: from, hasta: to, diasConEventos, metodo: 'cámaras por patente (sin planilla)',
  viajes: trips.length, camiones: new Set(trips.map(t => t.p)).size, conCalleLiquida: trips.filter(t => t.conLiq).length,
  porVolcable: trips.reduce((o, t) => (t.volc && (o[t.volc] = (o[t.volc] || 0) + 1), o), {}),
  viajesDia: Object.fromEntries(dias.map(d => [d, trips.filter(t => t.day === d).length])),
  camionesDia: Object.fromEntries(dias.map(d => [d, new Set(trips.filter(t => t.day === d).map(t => t.p)).size])),
  bloques: bloques.map(b => ({ inicio: fmt(b.ini), fin: fmt(b.fin), horas: +((b.fin - b.ini) / H).toFixed(1), viajes: b.viajes })),
  tramos: stat(trips),
  tramosDia: Object.fromEntries(dias.map(d => [d, stat(trips.filter(t => t.day === d))])),
}
// calibración contra la planilla, si existe para el rango
const seenOp = new Set(), X = []
for (let d = addDays(from, -1); d <= addDays(to, 3); d = addDays(d, 1)) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const r of JSON.parse(fs.readFileSync(f))) {
    if (seenOp.has(r.external_operation_id)) continue
    seenOp.add(r.external_operation_id)
    if (r.planta_normalized !== 'RICARDONE' || r.movement_type !== 'EGRESO' || !/PELLETS GIRASOL/.test(r.product_normalized || '') || fake(r.plate_normalized || '')) continue
    const s = r.external_salida_at; if (!/^\d{4}-\d{2}-\d{2}T/.test(s || '')) continue
    const t = Date.parse(s.slice(0, 16) + ':00-03:00'); if (t < ini || t >= fin) continue
    X.push({ p: r.plate_normalized, t, day: calDay(t) })
  }
}
if (X.length) {
  // viaje de cámara ↔ egreso de la planilla: misma patente, balanza egreso y salida de Ricardone a ±90 min
  const used = new Set(); let ok = 0
  for (const c of trips) { const k = X.findIndex((x, i) => !used.has(i) && x.p === c.p && Math.abs(x.t - c.t) <= 90 * 60000); if (k >= 0) { used.add(k); ok++ } }
  out.calibracion = { planillaEgresosPellet: X.length, planillaPorDia: Object.fromEntries(dias.map(d => [d, X.filter(x => x.day === d).length])),
    camaraViajes: trips.length, emparejados: ok, recall: +(ok / X.length).toFixed(3), precision: trips.length ? +(ok / trips.length).toFixed(3) : null,
    nota: 'Egresos de pellet de girasol de Ricardone en la planilla, por día calendario de la salida (incluye despachos a terceros que no van al puerto).' }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, tramosDia: undefined }, null, 1))
