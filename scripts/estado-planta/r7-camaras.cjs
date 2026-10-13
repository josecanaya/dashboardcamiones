// Soja R7 (Ricardone → San Lorenzo) SOLO con cámaras, por patente, sin depender de las cámaras de volcables del puerto.
// Viaje = calada sólida de Ricardone → egreso de Ricardone → ingreso a San Lorenzo (≤ 90 min) → salida de San Lorenzo,
// sin carga de silo antes (transile R29) ni volcable de Ricardone después (girasol). La volcable del puerto se registra si se leyó.
// metricas-camaras.cjs exige la lectura de la volcable del puerto para armar el viaje: desde el 09/10 la V5 casi no lee y el conteo se cae.
// Si hay planilla del rango (data/movimientos), calibra por día operativo contra las operaciones R7 de la planilla.
// Uso: node --max-old-space-size=4096 scripts/estado-planta/r7-camaras.cjs <desde> <hasta> <salida.json>
//   VICENTIN_ROOT = raíz con data/truckflow y data/movimientos. Hora operativa = occurredAt + 206 min; día operativo desde las 22 h.
const fs = require('fs'), path = require('path')
const [from, to, outPath] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..')
const SKEW = 206 * 60000, H = 3600000, AR = 3 * H, MIN = 60000
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const calDay = t => new Date(t - AR).toISOString().slice(0, 10)
const opDay = t => calDay(t + 2 * H)
const hour = t => new Date(t - AR).getUTCHours()
const quarter = t => { const h = hour(t); return h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4' }
const fake = p => !p || p.length < 6 || /^(.)\1+$/.test(p)

const seen = new Set(), byP = {}
for (let d = addDays(from, -1); d <= addDays(to, 1); d = addDays(d, 1)) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (fake(p)) continue
    ;(byP[p] ??= []).push({ t: Date.parse(e.occurredAt) + SKEW, dev: e.deviceCode })
  }
}
const is = {
  ing: d => d === 'RicIngCamFrente', pre: d => d === 'RicPreIngInFr', cal: d => /^RicCal0\d$/.test(d), egr: d => d === 'RicEgrCamFrente',
  silo: d => /^(RicS7Carga|RicS8CargaLinea[12])$/.test(d), volcR: d => /^RicVolcable[12]$/.test(d),
  slI: d => d === 'SLZIngCamFrente', slB: d => d === 'SLZBalIngFte', slV: d => /^SLZVolcableC\d$/.test(d), slS: d => /^SLZSalidaC[12]Fte$/.test(d),
}
const m = (a, b, cap) => (a != null && b != null && b > a && (b - a) / MIN <= cap ? (b - a) / MIN : null)
const dias = []; for (let d = from; d <= to; d = addDays(d, 1)) dias.push(d)
const trips = []
for (const [p, L] of Object.entries(byP)) {
  L.sort((a, b) => a.t - b.t)
  let lastCal = -Infinity
  for (let i = 0; i < L.length; i++) {
    if (!is.cal(L[i].dev)) continue
    const tc = L[i].t
    if (tc - lastCal < 2 * H) { lastCal = tc; continue }   // un calado = primera lectura separada > 2 h de la anterior
    lastCal = tc
    let pre = null, ing = null, silo = false
    for (let j = i - 1; j >= 0 && tc - L[j].t < 10 * H; j--) {
      const d = L[j].dev
      if (is.slS(d) || is.egr(d)) break
      if (is.silo(d)) { silo = true; break }
      if (is.pre(d)) { pre = L[j].t; if (j > 0 && is.ing(L[j - 1].dev) && L[j].t - L[j - 1].t < 30 * MIN) ing = L[j - 1].t; break }
    }
    if (silo) continue
    let egr = null, slI = null, slB = null, slV = null, volc = null, slS = null, bad = false
    for (let j = i + 1; j < L.length && L[j].t - tc < 14 * H; j++) {
      const d = L[j].dev
      if (!egr) {
        if (is.volcR(d)) { bad = true; break }
        if (is.cal(d) && L[j].t - tc >= 2 * H) break
        if (is.egr(d)) egr = L[j].t
        continue
      }
      if (is.pre(d) || is.cal(d)) break                     // volvió a Ricardone
      if (is.slI(d) && !slI && !slS) slI = L[j].t
      if (is.slB(d) && !slB && !slS) slB = L[j].t
      if (is.slV(d) && !slV && !slS) { slV = L[j].t; volc = 'V' + d.slice(-1) }
      if (is.slS(d) && (slI || slB || slV)) { slS = L[j].t; break }
    }
    if (bad || !egr) continue
    const llega = slI ?? slB
    if (!llega || llega - egr > 90 * MIN) continue          // no fue al puerto
    const t0 = pre ?? tc
    trips.push({ p, day: opDay(t0), q: quarter(t0), volc,
      ingreso: m(ing, pre, 60), playa1: m(pre, tc, 600), salida: m(tc, egr, 180), interplanta: m(egr, llega, 90),
      playaOsl: m(slI, slB, 600), descarga: m(slB, slV, 480), egreso: m(slV, slS, 180),
      ric: m(pre, egr, 720), sl: m(llega, slS, 900), total: m(pre, slS, 1440) })
  }
}
const KEYS = ['ingreso', 'playa1', 'salida', 'interplanta', 'playaOsl', 'descarga', 'egreso', 'ric', 'sl', 'total']
const stat = rows => Object.fromEntries(KEYS.map(k => { const v = rows.map(r => r[k]).filter(x => x != null); return [k, { mean: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, n: v.length }] }))
const inW = trips.filter(t => dias.includes(t.day))
const out = {
  desde: from, hasta: to, metodo: 'cámaras por patente: calada sólida → egreso Ricardone → ingreso SLZ (≤ 90 min) → salida SLZ; sin silo antes ni volcable de Ricardone',
  viajes: inW.length, porDia: Object.fromEntries(dias.map(d => [d, inW.filter(t => t.day === d).length])),
  cuartos: Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4'].map(q => [q, dias.map(d => inW.filter(t => t.day === d && t.q === q).length)])),
  porVolcable: inW.reduce((o, t) => { const k = t.volc || 'sin lectura'; o[k] = (o[k] || 0) + 1; return o }, {}),
  volcablePorDia: Object.fromEntries(dias.map(d => [d, inW.filter(t => t.day === d).reduce((o, t) => { const k = t.volc || 'sin lectura'; o[k] = (o[k] || 0) + 1; return o }, {})])),
  tramos: stat(inW),
  tramosDia: Object.fromEntries(dias.map(d => [d, stat(inW.filter(t => t.day === d))])),
}
// calibración: operaciones R7 de la planilla = TERMINAL · INGRESO · SOJA por volcable del puerto, día operativo del ingreso
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 16) + ':00-03:00') : null)
const seenOp = new Set(), r7 = []
for (let d = addDays(from, -1); d <= addDays(to, 3); d = addDays(d, 1)) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const r of JSON.parse(fs.readFileSync(f))) {
    if (seenOp.has(r.external_operation_id)) continue
    seenOp.add(r.external_operation_id)
    if (r.planta_normalized !== 'TERMINAL_EMBARQUE' || r.movement_type !== 'INGRESO' || r.product_normalized !== 'SOJA' || !/^VOLCABLE_PTO/.test(r.platform_normalized || '')) continue
    const a = ts(r.external_ingreso_at); if (a == null) continue
    r7.push({ p: r.plate_normalized, day: opDay(a), volc: 'V' + r.platform_normalized.slice(-1) })
  }
}
if (r7.some(x => dias.includes(x.day))) {
  const w = r7.filter(x => dias.includes(x.day))
  out.calibracion = { planillaR7: w.length, planillaPorDia: Object.fromEntries(dias.map(d => [d, w.filter(x => x.day === d).length])), camaraPorDia: out.porDia,
    planillaPorVolcable: w.reduce((o, x) => (o[x.volc] = (o[x.volc] || 0) + 1, o), {}),
    nota: 'Operaciones R7 de la planilla = TERMINAL · INGRESO · SOJA con plataforma VOLCABLE_PTO_n, por día operativo del ingreso.' }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, tramosDia: undefined, volcablePorDia: undefined, cuartos: undefined }))
