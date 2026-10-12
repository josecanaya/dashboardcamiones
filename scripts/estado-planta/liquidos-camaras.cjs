// Líquidos SOLO con cámaras (sin planilla): visitas de camión a la zona de líquidos de Ricardone y de la Terminal San Lorenzo.
// Visita = lecturas de una patente en una planta separadas por menos de 4 h.
//   Ricardone: pre-ingreso + calle líquida o balanza 2, sin Playa 3, calada sólida, silo ni volcable de Ricardone, y sin descargar
//              ni ir a la Terminal en las 4 h siguientes (eso es pellet o soja).
//   Terminal:  entrada (SLZIngCamFrente o SLZBalIngFte) y alguna lectura de carga/descarga OSL (RenCargFte/RenDescFte), tanques (SLZTK400), balanza de líquidos (SLZBalLiq*)
//              o calada SL (SLZCalado), sin volcable del puerto y sin venir de cargar sólido en Ricardone (calada, Playa 3 o silo) en las 4 h previas.
// Si hay planilla del rango, calibra contra los movimientos de líquidos de liquidos-criterio.cjs (mismo criterio por producto):
// precisión = visitas de cámara que corresponden a un movimiento de líquidos de la planilla; cobertura = movimientos con visita.
// Uso: node --max-old-space-size=4096 scripts/estado-planta/liquidos-camaras.cjs <desde> <hasta> <salida.json>
//   VICENTIN_ROOT = raíz con data/truckflow y data/movimientos. Hora operativa = occurredAt + 206 min; día = día calendario de la primera lectura.
const fs = require('fs'), path = require('path')
const [from, to, outPath] = process.argv.slice(2)
const ROOT = process.env.VICENTIN_ROOT || path.join(__dirname, '..', '..')
const SKEW = 206 * 60000, H = 3600000, AR = 3 * H
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const calDay = t => new Date(t - AR).toISOString().slice(0, 10)
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
const plantOf = d => (/^Ric/.test(d) ? 'RIC' : /^(SLZ|Ren)/.test(d) ? 'TER' : null)
const has = (v, re) => v.ev.some(x => re.test(x.dev))
const ini = Date.parse(from + 'T00:00:00-03:00'), fin = Date.parse(addDays(to, 1) + 'T00:00:00-03:00')
const visitas = []
for (const [p, L] of Object.entries(byP)) {
  L.sort((a, b) => a.t - b.t)
  const V = []
  for (const e of L) {
    const pl = plantOf(e.dev); if (!pl) continue
    const v = V[V.length - 1]
    if (v && v.pl === pl && e.t - v.fin < 4 * H) { v.fin = e.t; v.ev.push(e) } else V.push({ p, pl, ini: e.t, fin: e.t, ev: [e] })
  }
  for (let i = 0; i < V.length; i++) {
    const v = V[i]
    if (v.ini < ini || v.ini >= fin) continue
    let liq = false
    if (v.pl === 'RIC') {
      const sig = has(v, /^RicPreIngInFr$/) && has(v, /^(RicCalLiq|RicB2Egreso)$/)
      const solido = has(v, /^(RicS6Playa3|RicCal0\d|RicS7Carga|RicS8CargaLinea[12]|RicVolcable[12])$/)
      const n = V[i + 1], alPuerto = n && n.pl === 'TER' && n.ini - v.fin < 4 * H
      liq = sig && !solido && !alPuerto
    } else {
      const entro = has(v, /^(SLZIngCamFrente|SLZBalIngFte)$/)
      const sig = entro && has(v, /^(RenCargFte|RenDescFte|SLZTK400|SLZBalLiq\w+|SLZCalado)$/)
      const volc = has(v, /^SLZVolcableC[1245]$/)
      const a = V[i - 1], deSolido = a && a.pl === 'RIC' && v.ini - a.fin < 4 * H && has(a, /^(RicS6Playa3|RicCal0\d|RicS7Carga|RicS8CargaLinea[12])$/)
      liq = sig && !volc && !deSolido
    }
    if (!liq) continue
    visitas.push({ p, pl: v.pl, ini: v.ini, fin: v.fin, day: calDay(v.ini), min: Math.round((v.fin - v.ini) / 60000),
      carga: has(v, /^RenCargFte$/), descarga: has(v, /^RenDescFte$/), devs: [...new Set(v.ev.map(x => x.dev))] })
  }
}
const dias = []; for (let d = from; d <= to; d = addDays(d, 1)) dias.push(d)
const out = {
  desde: from, hasta: to, metodo: 'cámaras por patente (sin planilla); visita = lecturas de una planta separadas por menos de 4 h',
  visitas: { RIC: visitas.filter(v => v.pl === 'RIC').length, TER: visitas.filter(v => v.pl === 'TER').length },
  porDia: Object.fromEntries(dias.map(d => [d, { RIC: visitas.filter(v => v.pl === 'RIC' && v.day === d).length, TER: visitas.filter(v => v.pl === 'TER' && v.day === d).length }])),
  terminalCargaDescarga: { carga: visitas.filter(v => v.carga).length, descarga: visitas.filter(v => v.descarga).length },
  porCamara: Object.fromEntries(['RIC', 'TER'].map(pl => [pl, visitas.filter(v => v.pl === pl).flatMap(v => v.devs).reduce((o, d) => (o[d] = (o[d] || 0) + 1, o), {})])),
}
// calibración contra la planilla (criterio por producto de liquidos-criterio.cjs), si existe
const LIQ = /BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA/
const famOf = prod => (/ENVASADO|^AGUA|SAL GLICERINOSA|NITROGENO/.test(prod || '') ? (/^AGUA/.test(prod) ? 'agua' : 'otro') : LIQ.test(prod || '') ? 'liquido' : 'otro')
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 16) + ':00-03:00') : null)
const seenOp = new Set(), X = []
for (let d = addDays(from, -1); d <= addDays(to, 3); d = addDays(d, 1)) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const r of JSON.parse(fs.readFileSync(f))) {
    if (seenOp.has(r.external_operation_id)) continue
    seenOp.add(r.external_operation_id)
    const pl = r.planta_normalized === 'RICARDONE' ? 'RIC' : r.planta_normalized === 'TERMINAL_EMBARQUE' ? 'TER' : null
    if (!pl || fake(r.plate_normalized)) continue
    const a = ts(r.external_ingreso_at), b = ts(r.external_salida_at) ?? a
    if (a == null) continue
    X.push({ p: r.plate_normalized, pl, a, b, fam: famOf(r.product_normalized), prod: r.product_normalized, mv: r.movement_type })
  }
}
const enRango = x => x.a >= ini && x.a < fin
if (X.some(x => enRango(x) && x.fam === 'liquido')) {
  const match = v => X.filter(x => x.p === v.p && x.pl === v.pl && x.a - H <= v.fin && x.b + H >= v.ini)
  const cal = { RIC: {}, TER: {} }
  for (const pl of ['RIC', 'TER']) {
    const vs = visitas.filter(v => v.pl === pl), o = cal[pl]
    o.visitasCamara = vs.length
    o.porFamiliaPlanilla = vs.reduce((acc, v) => { const m = match(v); const k = m.length ? (m.some(x => x.fam === 'liquido') ? 'liquido' : m[0].fam) : 'sin movimiento en planilla'; acc[k] = (acc[k] || 0) + 1; return acc }, {})
    o.precision = vs.length ? +((o.porFamiliaPlanilla.liquido || 0) / vs.length).toFixed(3) : null
    const mov = X.filter(x => x.pl === pl && x.fam === 'liquido' && enRango(x))
    const vistos = mov.filter(x => visitas.some(v => v.p === x.p && v.pl === pl && x.a - H <= v.fin && x.b + H >= v.ini))
    o.movimientosPlanilla = mov.length; o.conVisita = vistos.length; o.cobertura = mov.length ? +(vistos.length / mov.length).toFixed(3) : null
    o.porSentido = Object.fromEntries(['INGRESO', 'EGRESO'].map(s => [s, { planilla: mov.filter(x => x.mv === s).length, conVisita: vistos.filter(x => x.mv === s).length }]))
  }
  out.calibracion = cal
}
fs.writeFileSync(outPath, JSON.stringify({ ...out, detalle: visitas.map(v => ({ p: v.p, pl: v.pl, day: v.day, min: v.min, devs: v.devs })) }, null, 1))
console.log(JSON.stringify(out, null, 1))
