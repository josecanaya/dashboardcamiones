// Operativo de pellet (transile R30/31/32 Ricardone → volcables San Lorenzo): tramos por cámara,
// viajes por camión y por día (planilla), toneladas (viajes × 30), horas del operativo y patentes.
// Uso: node --max-old-space-size=4096 scripts/estado-planta/pellet-operativo.cjs <desde> <hasta> <salida.json> <run1> [<run2> ...]
// Viaje de pellet por cámara (patente de la planilla): pre-ingreso → (calle líquida) → Playa 3 → balanza egreso
// cargado → ingreso SLZ → balanza SLZ → volcable → salida SLZ, sin carga de silo ni calada sólida en el medio.
const fs = require('fs'), path = require('path')
const [from, to, outPath, ...runs] = process.argv.slice(2)
const ROOT = path.join(__dirname, '..', '..')
const SKEW = 206 * 60000, H = 3600000, AR = 3 * H
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const calDay = t => new Date(t - AR).toISOString().slice(0, 10)
const hour = t => new Date(t - AR).getUTCHours()
const quarter = t => { const h = hour(t); return h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4' }
const opDay = t => calDay(t + 2 * H)

// --- planilla
const seenOp = new Set(); const X = []
for (const r of runs) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', 'windows', r, 'tables', 'excel_operations_with_truckflow.json')))
  for (const x of j.rows || j) {
    if (seenOp.has(x.external_operation_id)) continue
    seenOp.add(x.external_operation_id)
    if (!/PELLET/i.test(x.product_normalized) || !/R3[012]/.test(x.resolved_executive_circuit_code || '')) continue
    if (/^(.)\1+$/.test(x.plate_normalized)) continue
    if (x.source_date < from || x.source_date > to) continue
    X.push(x)
  }
}
const plates = new Set(X.map(x => x.plate_normalized))
const days = [...new Set(X.map(x => x.source_date))].sort()
const viajesDia = Object.fromEntries(days.map(d => [d, X.filter(x => x.source_date === d).length]))
const patentesDia = Object.fromEntries(days.map(d => [d, new Set(X.filter(x => x.source_date === d).map(x => x.plate_normalized)).size]))
const porCamionDia = {}
for (const x of X) { const k = x.source_date; ((porCamionDia[k] ??= {})[x.plate_normalized] = (porCamionDia[k][x.plate_normalized] || 0) + 1) }
const viajesPorCamion = {}
for (const x of X) viajesPorCamion[x.plate_normalized] = (viajesPorCamion[x.plate_normalized] || 0) + 1
// horas del operativo: bloques continuos (corte si hay > 4 h sin movimientos de pellet)
const marks = X.flatMap(x => [x.external_ingreso_at, x.external_salida_at]).filter(Boolean).map(s => Date.parse(s + '-03:00')).sort((a, b) => a - b)
const bloques = []
for (const t of marks) {
  const b = bloques[bloques.length - 1]
  if (!b || t - b.fin > 4 * H) bloques.push({ ini: t, fin: t }); else b.fin = t
}
const fmt = t => new Date(t - AR).toISOString().slice(0, 16).replace('T', ' ')
const kgReal = X.reduce((s, x) => s + (+x.kgs_neto || 0), 0)

// --- cámaras
const files = []
for (let d = addDays(from, -1); d <= addDays(to, 1); d = addDays(d, 1)) files.push(d)
const seen = new Set(); const byP = {}
for (const d of files) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plates.has(p)) continue
    ;(byP[p] ??= []).push({ t: Date.parse(e.occurredAt) + SKEW, dev: e.deviceCode })
  }
}
const is = {
  ing: d => d === 'RicIngCamFrente', pre: d => d === 'RicPreIngInFr', liq: d => d === 'RicCalLiq', p3: d => d === 'RicS6Playa3',
  balE: d => /^RicB[123]Egreso$/.test(d), silo: d => /^(RicS7Carga|RicS8CargaLinea[12])$/.test(d), cal: d => /^RicCal0\d$/.test(d),
  slI: d => d === 'SLZIngCamFrente', slB: d => d === 'SLZBalIngFte', slV: d => /^SLZVolcableC\d$/.test(d), slS: d => /^SLZSalidaC[12]Fte$/.test(d),
}
const ini = Date.parse(from + 'T00:00:00-03:00'), fin = Date.parse(addDays(to, 1) + 'T04:00:00-03:00')
const trips = []
const m = (a, b, cap) => (a != null && b != null && b > a && (b - a) / 60000 <= cap ? (b - a) / 60000 : null)
for (const [p, L] of Object.entries(byP)) {
  L.sort((a, b) => a.t - b.t)
  for (let i = 0; i < L.length; i++) {
    const e = L[i]
    if (!is.balE(e.dev) || e.t < ini || e.t > fin) continue
    if (i > 0 && is.balE(L[i - 1].dev) && e.t - L[i - 1].t < 30 * 60000) continue
    // hacia atrás hasta el pre-ingreso del viaje
    let pre = null, ing = null, liq = null, p3 = null, bad = false
    for (let j = i - 1; j >= 0 && e.t - L[j].t < 10 * H; j--) {
      const d = L[j].dev
      if (is.silo(d) || is.cal(d) || is.slS(d) || is.balE(d)) { if (is.silo(d) || is.cal(d)) bad = true; break }
      if (is.p3(d) && !p3) p3 = L[j].t
      if (is.p3(d)) p3 = L[j].t
      if (is.liq(d)) liq = L[j].t
      if (is.pre(d)) { pre = L[j].t; if (j > 0 && is.ing(L[j - 1].dev) && L[j].t - L[j - 1].t < 30 * 60000) ing = L[j - 1].t; break }
    }
    if (bad) continue
    // hacia adelante: puerto
    let slI = null, slB = null, slV = null, slS = null, back = null, volc = null
    for (let j = i + 1; j < L.length && L[j].t - e.t < 12 * H; j++) {
      const d = L[j].dev
      if (is.cal(d) || is.silo(d)) { bad = true; break }
      if (is.pre(d) || is.balE(d)) { if (slS) back = L[j].t; break }
      if (is.slI(d) && !slI) slI = L[j].t
      if (is.slB(d) && !slB) slB = L[j].t
      if (is.slV(d) && !slV) { slV = L[j].t; volc = d.slice(-1) }
      if (is.slS(d)) slS = L[j].t
    }
    if (bad || !(slV || slB || slS)) continue
    const p3x = p3 && (!liq || p3 > liq) ? p3 : null
    trips.push({
      p, day: calDay(e.t), q: quarter(pre ?? e.t), conLiq: !!liq, volc,
      ingreso: m(ing, pre, 60), playa1: m(pre, liq, 240), ptara: m(liq ?? pre, p3x, 120), carga: m(p3x ?? liq ?? pre, e.t, 480),
      interplanta: m(e.t, slI, 60), playaOsl: m(slI, slB, 480), descarga: m(slB ?? slI, slV, 360), salida: m(slV, slS, 120),
      ric: m(pre, e.t, 600), sl: m(slI ?? e.t, slS, 720), ciclo: m(pre, slS, 1200), vuelta: m(slS, back, 180),
    })
  }
}
const KEYS = ['ingreso', 'playa1', 'ptara', 'carga', 'interplanta', 'playaOsl', 'descarga', 'salida', 'ric', 'sl', 'ciclo', 'vuelta']
const stat = rows => Object.fromEntries(KEYS.map(k => { const v = rows.map(r => r[k]).filter(x => x != null); return [k, { mean: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length }] }))
const out = {
  periodo: { from, to, dias: days },
  planilla: {
    viajes: X.length, patentes: plates.size, toneladas30: X.length * 30, toneladasReales: Math.round(kgReal / 1000),
    viajesDia, patentesDia,
    viajesPorCamionDia: Object.fromEntries(days.map(d => { const v = Object.values(porCamionDia[d] || {}); return [d, { prom: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), max: Math.max(...v) }] })),
    topCamiones: Object.entries(viajesPorCamion).sort((a, b) => b[1] - a[1]).slice(0, 10),
    bloques: bloques.map(b => ({ inicio: fmt(b.ini), fin: fmt(b.fin), horas: +((b.fin - b.ini) / H).toFixed(1) })),
    horasOperativo: +bloques.reduce((s, b) => s + (b.fin - b.ini) / H, 0).toFixed(1),
  },
  camaras: {
    viajes: trips.length, conCalleLiquida: trips.filter(t => t.conLiq).length, porVolcable: trips.reduce((o, t) => (t.volc && (o["V" + t.volc] = (o["V" + t.volc] || 0) + 1), o), {}),
    periodo: stat(trips),
    porDia: Object.fromEntries(days.map(d => { const r = trips.filter(t => t.day === d); return [d, { viajes: r.length, cuartos: Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4'].map(q => [q, r.filter(t => t.q === q).length])), tramos: stat(r) }] })),
  },
}
out.camaras.calleLiquidaPorOrden = (() => { const by = {}; for (const t of trips) (by[t.p + t.day] ??= []).push(t); const r = { primero: [0, 0], siguientes: [0, 0] }; for (const v of Object.values(by)) v.forEach((t, i) => { const k = i === 0 ? "primero" : "siguientes"; r[k][0]++; if (t.conLiq) r[k][1]++ }); return r })()
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
console.log("calle liquida [viajes, con calle]", JSON.stringify(out.camaras.calleLiquidaPorOrden))
console.log(JSON.stringify(out.planilla, null, 1))
console.log('camaras viajes', out.camaras.viajes, 'con calle liquida', out.camaras.conCalleLiquida)
console.log(Object.entries(out.camaras.periodo).map(([k, v]) => k + ':' + v.mean + '/' + v.n).join(' '))
for (const [d, v] of Object.entries(out.camaras.porDia)) console.log(d, v.viajes, JSON.stringify(v.cuartos), Object.entries(v.tramos).map(([k, s]) => k.slice(0, 5) + ':' + s.mean + '/' + s.n).join(' '))
