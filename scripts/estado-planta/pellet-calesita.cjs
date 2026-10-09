// Calesita de pellet de girasol (transile Ricardone → puerto): cruce planilla de salida de Ricardone con la entrada al puerto,
// kilos de las dos balanzas, tiempos por tramo con cámaras, volcable de descarga y jornadas por camión.
// Uso: node --max-old-space-size=6144 scripts/estado-planta/pellet-calesita.cjs <desde> <hasta> <salida.json>
// Fuentes: data/movimientos/<día>/movimientos.json (planilla; pata de puerto = INGRESO Terminal VOLCABLE PTO, id CTG_x#SLVOLC_IN)
// y data/truckflow/<día>/event-list.json (cámaras, hora operativa = occurredAt + 206 min).
const fs = require('fs'), path = require('path')
const [desde, hasta, outPath] = process.argv.slice(2)
const ROOT = path.join(__dirname, '..', '..')
const M = 60000, H = 3600000, SKEW = 206 * M
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 19) + '-03:00') : null)
const fake = p => /^(X+|P+|T+)$/.test(p || '') || /^(.)\1+$/.test(p || '')
const calDay = t => new Date(t - 3 * H).toISOString().slice(0, 10)

// ---- planilla
const seen = new Set(), E = [], I = []
for (let d = shift(desde, -1); d <= shift(hasta, 2); d = shift(d, 1)) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  const j = JSON.parse(fs.readFileSync(f)); const rows = Array.isArray(j) ? j : (j.rows || j.movimientos || [])
  for (const r of rows) {
    if (seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    if (!/PELLETS GIRASOL/.test(r.product_normalized || '') || fake(r.plate_normalized)) continue
    const x = { id: r.external_operation_id, p: r.plate_normalized, ctg: r.ctg && r.ctg !== '0' ? r.ctg : null, a: ts(r.external_ingreso_at), b: ts(r.external_salida_at),
      kg: +r.kgs_neto || 0, bruto: +r.kgs_bruto || 0, tara: +r.kgs_tara || 0, plat: r.platform_normalized || '', destino: r.entregado_por_a || '' }
    if (r.planta_normalized === 'RICARDONE' && r.movement_type === 'EGRESO') E.push(x)
    else if (r.planta_normalized === 'TERMINAL_EMBARQUE' && r.movement_type === 'INGRESO' && /VOLCABLE/.test(x.plat)) I.push(x)
  }
}
const inP = t => { const d = calDay(t); return d >= desde && d <= hasta }
const EP = E.filter(x => x.a && inP(x.a) && (/PUERTO/i.test(x.destino) || (x.ctg && I.some(i => i.ctg === x.ctg))))
// emparejar: mismo CTG; si no, misma patente con ingreso al puerto entre 0 y 6 h después de la salida de Ricardone
const usados = new Set(), pares = []
for (const e of EP.sort((a, b) => a.a - b.a)) {
  let i = e.ctg ? I.find(i => i.ctg === e.ctg && !usados.has(i.id)) : null
  if (!i) i = I.filter(i => i.p === e.p && !usados.has(i.id) && i.a >= e.b - 30 * M && i.a - e.b <= 6 * H).sort((x, y) => x.a - y.a)[0]
  if (i) usados.add(i.id)
  pares.push({ e, i: i || null, por: i ? (e.ctg && i.ctg === e.ctg ? 'ctg' : 'patente') : null })
}

// ---- cámaras por patente
const plates = new Set(EP.map(x => x.p)), byP = {}, seenE = new Set()
for (let d = shift(desde, -1); d <= shift(hasta, 1); d = shift(d, 1)) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const ev of JSON.parse(fs.readFileSync(f)).records) {
    const p = (ev.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plates.has(p)) continue
    const t = Date.parse(ev.occurredAt) + SKEW, k = p + '|' + ev.deviceCode + '|' + Math.round(t / 1000)
    if (!Number.isFinite(t) || seenE.has(k)) continue
    seenE.add(k); (byP[p] ??= []).push({ t, dev: ev.deviceCode })
  }
}
for (const L of Object.values(byP)) L.sort((a, b) => a.t - b.t)
const is = { pre: d => d === 'RicPreIngInFr', liq: d => d === 'RicCalLiq', p3: d => d === 'RicS6Playa3', balE: d => /^RicB[123]Egreso$/.test(d),
  slI: d => d === 'SLZIngCamFrente', slB: d => d === 'SLZBalIngFte', slV: d => /^SLZVolcableC\d$/.test(d), slS: d => /^SLZSalidaC[12]Fte$/.test(d) }
const first = (L, f, a, b) => L.find(x => f(x.dev) && x.t >= a && x.t <= b)
const last = (L, f, a, b) => [...L].reverse().find(x => f(x.dev) && x.t >= a && x.t <= b)
const mm = (a, b, cap) => (a != null && b != null && b >= a && (b - a) / M <= cap ? Math.round((b - a) / M) : null)
for (const pr of pares) {
  const { e, i } = pr, L = byP[e.p] || []
  const pre = first(L, is.pre, e.a - 90 * M, e.b), liq = first(L, is.liq, (pre?.t ?? e.a - 90 * M), e.b), p3 = first(L, is.p3, (liq?.t ?? pre?.t ?? e.a - 90 * M), e.b + 15 * M)
  const balE = last(L, is.balE, e.a - 30 * M, e.b + 20 * M)
  const ventFin = i ? i.b + 60 * M : e.b + 8 * H
  const slI = first(L, is.slI, e.b - 10 * M, ventFin), slB = first(L, is.slB, (slI?.t ?? e.b), ventFin), slV = first(L, is.slV, (slB?.t ?? slI?.t ?? e.b), ventFin)
  const slS = first(L, is.slS, (slV?.t ?? slB?.t ?? slI?.t ?? e.b), ventFin)
  const c = { pre: pre?.t, liq: liq?.t, p3: p3?.t, balE: balE?.t, slI: slI?.t, slB: slB?.t, slV: slV?.t, slS: slS?.t, volcCam: slV ? 'V' + slV.dev.slice(-1) : null }
  pr.cam = c
  // tiempos: Ricardone y puerto por planilla; tramos por cámara
  pr.t = {
    ricPlanilla: mm(e.a, e.b, 720), puertoPlanilla: i ? mm(i.a, i.b, 720) : null, interplanta: i ? mm(e.b, i.a, 240) : null,
    playa1: mm(c.pre, c.liq, 240), accesoP3: mm(c.liq ?? c.pre, c.p3, 120), carga: mm(c.p3 ?? c.liq ?? c.pre, c.balE, 480), ric: mm(c.pre, c.balE, 600),
    interCam: mm(c.balE, c.slI, 90), playaOsl: mm(c.slI, c.slB, 480), descarga: mm(c.slB ?? c.slI, c.slV, 360), salida: mm(c.slV, c.slS, 120), sl: mm(c.slI, c.slS, 720),
  }
}
// vuelta: salida del puerto → siguiente ingreso a Ricardone del mismo camión
const porP = {}
for (const pr of pares) (porP[pr.e.p] ??= []).push(pr)
for (const L of Object.values(porP)) { L.sort((a, b) => a.e.a - b.e.a); L.forEach((pr, k) => { const nx = L[k + 1]; const fin = pr.cam.slS ?? pr.i?.b; pr.t.vuelta = nx && fin ? mm(fin, nx.cam.pre ?? nx.e.a, 180) : null }) }

// ---- resúmenes
const st = k => { const v = pares.map(p => p.t[k]).filter(x => x != null); return { n: v.length, media: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null } }
const TR = ['playa1', 'accesoP3', 'carga', 'ric', 'interCam', 'playaOsl', 'descarga', 'salida', 'sl', 'vuelta', 'ricPlanilla', 'puertoPlanilla', 'interplanta']
const dias = [...new Set(pares.map(p => calDay(p.e.a)))].sort()
const kgs = pares.filter(p => p.i).map(p => ({ p: p.e.p, ctg: p.e.ctg, dia: calDay(p.e.a), salida: p.e.b, kgRic: p.e.kg, kgPuerto: p.i.kg, dif: p.i.kg - p.e.kg, brutoRic: p.e.bruto, brutoPuerto: p.i.bruto, taraRic: p.e.tara, taraPuerto: p.i.tara, por: p.por }))
const out = {
  desde, hasta, viajes: pares.length, conPuerto: pares.filter(p => p.i).length, porCTG: pares.filter(p => p.por === 'ctg').length, camiones: plates.size,
  kgRic: EP.reduce((s, x) => s + x.kg, 0), kgPuerto: pares.filter(p => p.i).reduce((s, p) => s + p.i.kg, 0),
  sinPuerto: pares.filter(p => !p.i).map(p => ({ p: p.e.p, ctg: p.e.ctg, ingreso: p.e.a, kg: p.e.kg })),
  puertoSinRicardone: I.filter(i => inP(i.a) && !usados.has(i.id)).map(i => ({ p: i.p, ctg: i.ctg, ingreso: i.a, kg: i.kg })),
  tramos: Object.fromEntries(TR.map(k => [k, st(k)])),
  porDia: Object.fromEntries(dias.map(d => { const r = pares.filter(p => calDay(p.e.a) === d); const s = k => { const v = r.map(p => p.t[k]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }
    return [d, { viajes: r.length, camiones: new Set(r.map(p => p.e.p)).size, ric: s('ric') ?? s('ricPlanilla'), sl: s('sl') ?? s('puertoPlanilla'), ricPlanilla: s('ricPlanilla'), puertoPlanilla: s('puertoPlanilla'), playaOsl: s('playaOsl'), descarga: s('descarga'), carga: s('carga') }] })),
  volcablePlanilla: pares.filter(p => p.i).reduce((o, p) => (o[p.i.plat] = (o[p.i.plat] || 0) + 1, o), {}),
  volcableCamara: pares.reduce((o, p) => (p.cam.volcCam && (o[p.cam.volcCam] = (o[p.cam.volcCam] || 0) + 1), o), {}),
  kilos: kgs,
  viajesDet: pares.map(p => ({ p: p.e.p, ctg: p.e.ctg, a: p.e.a, b: p.e.b, ia: p.i?.a ?? null, ib: p.i?.b ?? null, kgRic: p.e.kg, kgPuerto: p.i?.kg ?? null, volc: p.i?.plat ?? null, volcCam: p.cam.volcCam, cam: p.cam, t: p.t })),
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
console.log('viajes', out.viajes, 'con puerto', out.conPuerto, 'por CTG', out.porCTG, 'camiones', out.camiones, 'kg Ric', out.kgRic, 'kg puerto', out.kgPuerto)
console.log('sin puerto', out.sinPuerto.length, 'puerto sin Ric', out.puertoSinRicardone.length)
console.log('tramos', Object.entries(out.tramos).map(([k, v]) => k + ':' + v.media + '/' + v.n).join(' '))
console.log('por día', JSON.stringify(out.porDia))
console.log('volcable planilla', JSON.stringify(out.volcablePlanilla), 'cámara', JSON.stringify(out.volcableCamara))
const d = kgs.map(k => k.dif); console.log('dif kg: media', Math.round(d.reduce((a, b) => a + b, 0) / d.length), 'min', Math.min(...d), 'max', Math.max(...d), '|dif|>80:', kgs.filter(k => Math.abs(k.dif) > 80).length, 'de', kgs.length)
