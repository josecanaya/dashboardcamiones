// Métricas de la semana SOLO con cámaras (sin Excel de movimientos). Misma regla para las dos semanas.
// Uso: node --max-old-space-size=4096 scripts/estado-planta/metricas-camaras.cjs <salida.json> [prev_from] [cur_from]
//   prev_from / cur_from = primer día (jueves) de cada semana de comité; por defecto 2026-09-17 y 2026-09-24.
// Hora operativa = occurredAt + 206 min. Los circuitos se arman por secuencia de cámaras por patente:
//   R29 (transile) = carga en silo → calada → egreso → volcable puerto
//   Girasol (R5/R6) = calada → volcable 1/2 de Ricardone
//   Soja R7        = calada → (egreso) → volcable puerto, sin carga en silo antes
//   Líquidos       = calle líquida (RicCalLiq) sin carga en silo después
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..', 'data', 'truckflow') + '/'
const SKEW = 206 * 60000
const H = 3600000
const AR = 3 * H
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const prevFrom = process.argv[3] || '2026-09-17'
const curFrom = process.argv[4] || '2026-09-24'
const W = { prev: [], cur: [] }
for (let i = 0; i < 7; i++) { W.prev.push(addDays(prevFrom, i)); W.cur.push(addDays(curFrom, i)) }
const files = []
for (let d = addDays(prevFrom, -2); d <= addDays(curFrom, 7); d = addDays(d, 1)) files.push(d)

const fake = /^(.)\1+$/
const seen = new Set()
const E = []
for (const d of files) {
  const f = ROOT + d + '/event-list.json'
  if (!fs.existsSync(f)) continue
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (p.length < 6 || fake.test(p)) continue
    const t = Date.parse(e.occurredAt) + SKEW
    if (Number.isNaN(t)) continue
    E.push({ p, t, dev: e.deviceCode })
  }
}
const local = t => new Date(t - AR) // campos UTC = hora Argentina
const calDay = t => local(t).toISOString().slice(0, 10)
const hour = t => local(t).getUTCHours()
const opDay = t => calDay(t + 2 * H) // día operativo arranca 22:00
const quarter = t => { const h = hour(t); return h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4' }

const is = {
  pre: d => d === 'RicPreIngInFr',
  ing: d => d === 'RicIngCamFrente',
  cal: d => /^RicCal0\d$/.test(d),
  liq: d => d === 'RicCalLiq',
  p3: d => d === 'RicS6Playa3',
  balIng: d => /^RicB[123]Ingreso$/.test(d),
  balEgr: d => /^RicB[123]Egreso$/.test(d),
  silo: d => /^(RicS7Carga|RicS8CargaLinea[12])$/.test(d),
  siloDesc: d => /^RicS7DescLinea/.test(d),
  volcRic: d => /^RicVolcable[12]$/.test(d),
  egr: d => d === 'RicEgrCamFrente',
  slIng: d => d === 'SLZIngCamFrente',
  slBal: d => d === 'SLZBalIngFte',
  slVolc: d => /^SLZVolcableC[1-5]$/.test(d),
  slSal: d => /^SLZSalidaC[12]Fte$/.test(d),
  slCal: d => d === 'SLZCalado',
  slLiq: d => /^SLZBalLiq/.test(d),
}

// ---------- sectores: camiones distintos por día calendario y horas activas ----------
const SECT = {
  ingresoRic: is.pre, caladaRic: is.cal, caladaLiq: is.liq, volcRic1: d => d === 'RicVolcable1', volcRic2: d => d === 'RicVolcable2',
  playa3: is.p3, silosCarga: is.silo, silosDesc: is.siloDesc, egresoRic: is.egr, balanzaSL: is.slBal, caladaSL: is.slCal,
  volcSL: is.slVolc, salidaSL: is.slSal, aceiteSL: is.slLiq,
}
const sectors = {}; const byCalle = {}; const hourly = {}; const activeH = {}
const add = (o, k, v) => ((o[k] ??= new Set()).add(v))
for (const e of E) {
  const d = calDay(e.t)
  for (const [k, f] of Object.entries(SECT)) if (f(e.dev)) {
    add(sectors[k] ??= {}, d, e.p)
    add(hourly[k] ??= {}, d + '|' + hour(e.t), e.p)
  }
  let m
  if ((m = e.dev.match(/^RicCal0(\d)$/))) add(byCalle['RC' + m[1]] ??= {}, d, e.p)
  if ((m = e.dev.match(/^SLZVolcableC(\d)$/))) add(byCalle['V' + m[1]] ??= {}, d, e.p)
}
const count = (o, ds) => ds.map(d => (o && o[d] ? o[d].size : 0))

// ---------- circuitos por patente ----------
const byP = {}
for (const e of E) (byP[e.p] ??= []).push(e)
const trips = { r7: [], r29: [], gir: [], liq: [] }
const min = (a, b) => (a != null && b != null && b >= a ? (b - a) / 60000 : null)
for (const [p, L] of Object.entries(byP)) {
  L.sort((a, b) => a.t - b.t)
  const prevOf = (i, pred, maxMin, stop) => { for (let j = i - 1; j >= 0; j--) { if (L[i].t - L[j].t > maxMin * 60000) return null; if (stop && stop(L[j].dev)) return null; if (pred(L[j].dev)) return L[j].t } return null }
  const nextOf = (from, i, pred, maxMin, stop) => { for (let j = i + 1; j < L.length; j++) { if (L[j].t < from) continue; if (L[j].t - from > maxMin * 60000) return null; if (stop && stop(L[j].dev)) return null; if (pred(L[j].dev)) return L[j].t } return null }
  const firstAfter = (from, pred, maxMin) => { for (const x of L) { if (x.t < from) continue; if (x.t - from > maxMin * 60000) return null; if (pred(x.dev)) return x.t } return null }
  // calados: primera lectura separada > 2 h de la anterior
  let lastCal = -Infinity
  for (let i = 0; i < L.length; i++) {
    if (!is.cal(L[i].dev)) continue
    const tc = L[i].t
    if (tc - lastCal < 2 * H) { lastCal = tc; continue }
    lastCal = tc
    const notCal = d => is.cal(d)
    const egr = nextOf(tc, i, is.egr, 600, notCal)
    const volcG = nextOf(tc, i, is.volcRic, 600, notCal)
    const volcS = nextOf(tc, i, is.slVolc, 720, notCal)
    const silo = prevOf(i, is.silo, 600, notCal)
    if (silo) {
      if (!volcS) continue
      // transile: ingreso → calle líquida → Playa 3 → silo → balanza egreso → calada → egreso → puerto
      const iS = L.findIndex(x => x.t === silo)
      const pre = prevOf(iS, is.pre, 600, notCal)
      const liq = prevOf(iS, is.liq, 600, notCal)
      const p3 = prevOf(iS, is.p3, 600, notCal)
      const be = nextOf(silo, iS, is.balEgr, 300, notCal)
      const sIng = egr ? firstAfter(egr, is.slIng, 120) : null
      const sBal = egr ? firstAfter(egr, is.slBal, 720) : null
      const sal = firstAfter(volcS, is.slSal, 240)
      const okI = sIng && sIng < volcS ? sIng : null, okB = sBal && sBal < volcS ? sBal : null
      trips.r29.push({ p, day: opDay(pre ?? silo), q: quarter(pre ?? silo),
        preLiq: liq && pre && liq > pre ? min(pre, liq) : null, liqP3: liq && p3 && p3 > liq ? min(liq, p3) : null,
        p3Silo: p3 ? min(p3, silo) : null, siloBal: be && be < tc ? min(silo, be) : null, balCal: be && be < tc ? min(be, tc) : null,
        siloCal: min(silo, tc), calEgr: egr ? min(tc, egr) : null, puente: egr && okI ? min(egr, okI) : null,
        osl: okI && okB && okB > okI ? min(okI, okB) : null, balVolc: okB ? min(okB, volcS) : null, volcSal: sal ? min(volcS, sal) : null,
        egrVolc: egr ? min(egr, volcS) : null, ric: pre && egr ? min(pre, egr) : null, ciclo: pre && sal ? min(pre, sal) : null })
      continue
    }
    const pre = prevOf(i, is.pre, 600, notCal)
    if (volcG && (!egr || volcG < egr)) {
      const bi = nextOf(tc, i, is.balIng, 240, notCal)
      const p3 = nextOf(tc, i, is.p3, 600, notCal)
      const be = firstAfter(volcG, is.balEgr, 180)
      const okBi = bi && bi < volcG ? bi : null
      const okP3 = p3 && p3 < volcG ? p3 : null
      trips.gir.push({ p, day: opDay(pre ?? tc), q: quarter(pre ?? tc), v: L.find(x => x.t === volcG && is.volcRic(x.dev)).dev.endsWith('1') ? 'R5' : 'R6',
        p1: pre ? min(pre, tc) : null, pbruto: okBi ? min(tc, okBi) : null, accP3: okBi && okP3 && okP3 > okBi ? min(okBi, okP3) : null,
        descarga: okP3 ? min(okP3, volcG) : null, tara: be ? min(volcG, be) : null, calVolc: min(tc, volcG),
        total: pre && be ? min(pre, be) : null })
      continue
    }
    if (volcS) {
      const sIng = egr ? firstAfter(egr, is.slIng, 120) : null
      const sBal = firstAfter(egr ?? tc, is.slBal, 720)
      const sal = firstAfter(volcS, is.slSal, 240)
      const okI = sIng && sIng < volcS ? sIng : null, okB = sBal && sBal < volcS ? sBal : null
      trips.r7.push({ p, day: opDay(pre ?? tc), q: quarter(pre ?? tc), volc: L.find(x => x.t === volcS && is.slVolc(x.dev)).dev,
        conEgreso: !!egr, p1: pre ? min(pre, tc) : null, calEgr: egr ? min(tc, egr) : null,
        puente: egr && okI ? min(egr, okI) : null, osl: okI && okB && okB > okI ? min(okI, okB) : null,
        balVolc: okB ? min(okB, volcS) : null, volcSal: sal ? min(volcS, sal) : null, egrVolc: egr ? min(egr, volcS) : null,
        total: pre && sal ? min(pre, sal) : null, ric: pre && egr ? min(pre, egr) : null, sl: okI && sal ? min(okI, sal) : null })
    }
  }
  // líquidos: calle líquida sin carga en silo en las 8 h siguientes
  let lastL = -Infinity
  for (let i = 0; i < L.length; i++) {
    if (!is.liq(L[i].dev)) continue
    const tl = L[i].t
    if (tl - lastL < 3 * H) { lastL = tl; continue }
    lastL = tl
    if (nextOf(tl, i, is.silo, 480, is.cal)) continue
    const pre = prevOf(i, is.pre, 600)
    const egr = nextOf(tl, i, is.egr, 900, is.liq)
    trips.liq.push({ p, day: opDay(pre ?? tl), total: pre && egr ? min(pre, egr) : null })
  }
}

const CAPS = { p1: 480, calEgr: 120, puente: 60, osl: 600, balVolc: 360, volcSal: 120, egrVolc: 720, total: 1440, ric: 600, sl: 900,
  pbruto: 120, accP3: 240, descarga: 600, tara: 120, calVolc: 720, preLiq: 240, liqP3: 240, p3Silo: 720, siloBal: 240, balCal: 240,
  siloCal: 600, ciclo: 1440 }
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const stat = (rows, k) => { const v = rows.map(r => r[k]).filter(x => x != null && x >= 0 && x <= CAPS[k]); return { mean: v.length ? Math.round(mean(v)) : null, n: v.length } }
const out = { semanas: W, sectores: {}, calles: {}, horas: {}, horasActivas: {}, circuitos: {} }
for (const w of Object.keys(W)) {
  out.sectores[w] = {}; out.calles[w] = {}; out.horas[w] = {}; out.horasActivas[w] = {}
  for (const k of Object.keys(SECT)) out.sectores[w][k] = count(sectors[k], W[w])
  for (const k of Object.keys(byCalle).sort()) out.calles[w][k] = count(byCalle[k], W[w])
  for (const k of Object.keys(SECT)) {
    const h = Array(24).fill(0); let act = 0
    for (const d of W[w]) for (let i = 0; i < 24; i++) { const n = hourly[k]?.[d + '|' + i]?.size || 0; h[i] += n; if (n) act++ }
    out.horas[w][k] = h; out.horasActivas[w][k] = act
  }
  const o = out.circuitos[w] = {}
  for (const c of Object.keys(trips)) {
    const rows = trips[c].filter(r => W[w].includes(r.day))
    const keys = Object.keys(CAPS).filter(k => rows.some(r => k in r))
    o[c] = {
      total: rows.length,
      porDia: W[w].map(d => rows.filter(r => r.day === d).length),
      cuartos: Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4'].map(q => [q, W[w].map(d => rows.filter(r => r.day === d && r.q === q).length)])),
      tiempos: Object.fromEntries(keys.map(k => [k, stat(rows, k)])),
      tiemposDia: W[w].map(d => { const rr = rows.filter(r => r.day === d); return Object.fromEntries(keys.map(k => [k, stat(rr, k).mean])) }),
    }
    if (c === 'gir') o[c].porVolcable = { R5: rows.filter(r => r.v === 'R5').length, R6: rows.filter(r => r.v === 'R6').length }
    if (c === 'r7') o[c].porVolcable = Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, rows.filter(r => r.volc.endsWith(String(n))).length]))
  }
}
fs.writeFileSync(process.argv[2] || 'metricas-camaras.json', JSON.stringify(out, null, 1))
for (const w of ['prev', 'cur']) {
  console.log('=====', w, W[w][0])
  for (const [k, v] of Object.entries(out.sectores[w])) console.log(' ', k.padEnd(11), v.join(' '), '=', v.reduce((a, b) => a + b, 0), 'h', out.horasActivas[w][k])
  for (const [k, v] of Object.entries(out.calles[w])) console.log(' ', k.padEnd(11), v.join(' '), '=', v.reduce((a, b) => a + b, 0))
  for (const c of Object.keys(trips)) { const x = out.circuitos[w][c]; console.log(' ', c, x.total, x.porDia.join(' '), Object.entries(x.tiempos).map(([k, v]) => k + ':' + v.mean + '/' + v.n).join(' ')) }
}
