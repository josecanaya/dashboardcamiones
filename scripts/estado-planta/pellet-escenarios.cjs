// Escenarios del operativo de pellet: día por día de TODOS los operativos desde junio.
// Planilla (backup de movimientos): viajes y camiones por día. Cámaras: ciclo, Ricardone, puerto
// (Playa OSL + descarga) y volcables del puerto usadas por viaje.
// Uso: node --max-old-space-size=6144 scripts/estado-planta/pellet-escenarios.cjs <pellet-historico.json> <salida.json>
const fs = require('fs'), path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const H = 3600000, AR = 3 * H, SKEW = 206 * 60000
const OPS = JSON.parse(fs.readFileSync(process.argv[2]))
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const calDay = t => new Date(t - AR).toISOString().slice(0, 10)

// planilla
const seenOp = new Set(), R = []
for (const d of fs.readdirSync(path.join(ROOT, 'data', 'movimientos')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  const f = path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
  if (!fs.existsSync(f)) continue
  for (const x of JSON.parse(fs.readFileSync(f))) {
    if (seenOp.has(x.external_operation_id)) continue
    seenOp.add(x.external_operation_id)
    if (x.planta_normalized !== 'RICARDONE' || x.movement_type !== 'EGRESO' || !/PELLETS GIRASOL/.test(x.product_normalized || '') || !/PUERTO/.test(x.entregado_por_a || '')) continue
    if (/^(.)\1+$/.test(x.plate_normalized || '')) continue
    R.push(x)
  }
}
const dayOf = x => (x.external_salida_at || x.external_ingreso_at || '').slice(0, 10)

// eventos de cámara (el export recortado 27/08→02/09 se reemplaza por event-list.raw.json, ya en hora de pared)
function loadDay(d, plates, byP, seen) {
  const dir = path.join(ROOT, 'data', 'truckflow', d)
  if (!fs.existsSync(dir)) return
  const load = f => { if (!fs.existsSync(f)) return []; const j = JSON.parse(fs.readFileSync(f)); return Array.isArray(j) ? j : (j.records || j.value || []) }
  let arr = load(path.join(dir, 'event-list.json'))
  const raw = load(path.join(dir, 'event-list.raw.json'))
  if (raw.length > arr.length) arr = raw
  for (const e of arr) {
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plates.has(p)) continue
    let t = Date.parse(e.occurredAt || e.recordedAt || '')
    const c = Date.parse(e.createdAt || '')
    if (!Number.isFinite(t)) continue
    t += Number.isFinite(c) && Math.abs(c - t) < H ? 0 : SKEW
    const k = p + '|' + e.deviceCode + '|' + Math.round(t / 1000)
    if (seen.has(k)) continue
    seen.add(k)
    ;(byP[p] ??= []).push({ t, dev: e.deviceCode })
  }
}
const is = {
  pre: d => d === 'RicPreIngInFr' || d === 'RicIngCamFrente', liq: d => d === 'RicCalLiq', p3: d => d === 'RicS6Playa3',
  balE: d => /^RicB[123]Egreso$/.test(d), silo: d => /^(RicS7Carga|RicS8CargaLinea[12])$/.test(d), cal: d => /^RicCal0\d$/.test(d),
  slI: d => d === 'SLZIngCamFrente', slB: d => d === 'SLZBalIngFte', slV: d => /^SLZVolcableC\d$/.test(d), slS: d => /^SLZSalidaC[12]Fte$/.test(d),
}
const m = (a, b, cap) => (a != null && b != null && b > a && (b - a) / 60000 <= cap ? (b - a) / 60000 : null)
function tripsOf(byP, ini, fin) {
  const trips = []
  for (const [p, L] of Object.entries(byP)) {
    L.sort((a, b) => a.t - b.t)
    for (let i = 0; i < L.length; i++) {
      const e = L[i]
      if (!is.balE(e.dev) || e.t < ini || e.t > fin) continue
      if (i > 0 && is.balE(L[i - 1].dev) && e.t - L[i - 1].t < 30 * 60000) continue
      let pre = null, bad = false
      for (let j = i - 1; j >= 0 && e.t - L[j].t < 10 * H; j--) {
        const d = L[j].dev
        if (is.silo(d) || is.cal(d)) { bad = true; break }
        if (is.slS(d) || is.balE(d)) break
        if (is.pre(d)) { pre = L[j].t; break }
      }
      if (bad) continue
      let slI = null, slB = null, slV = null, slS = null, volc = null
      for (let j = i + 1; j < L.length && L[j].t - e.t < 12 * H; j++) {
        const d = L[j].dev
        if (is.cal(d) || is.silo(d)) { bad = true; break }
        if (is.pre(d) || is.balE(d)) break
        if (is.slI(d) && !slI) slI = L[j].t
        if (is.slB(d) && !slB) slB = L[j].t
        if (is.slV(d) && !slV) { slV = L[j].t; volc = 'V' + d.slice(-1) }
        if (is.slS(d)) slS = L[j].t
      }
      if (bad || !(slV || slB || slS)) continue
      const arr = slI ?? slB
      trips.push({ p, day: calDay(e.t), volc, ric: m(pre, e.t, 600), puerto: m(arr, slV, 600), ciclo: m(pre, slS, 1200), sl: m(arr, slS, 720) })
    }
  }
  return trips
}
const mean = a => { const v = a.filter(x => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null }
const dias = []
for (const o of OPS) {
  const rows = R.filter(x => dayOf(x) >= o.desde && dayOf(x) <= o.hasta)
  const plates = new Set(rows.map(x => x.plate_normalized))
  const byP = {}, seen = new Set()
  for (let d = addDays(o.desde, -1); d <= addDays(o.hasta, 1); d = addDays(d, 1)) loadDay(d, plates, byP, seen)
  const trips = tripsOf(byP, Date.parse(o.desde + 'T00:00:00-03:00'), Date.parse(addDays(o.hasta, 1) + 'T00:00:00-03:00'))
  for (const d of [...new Set(rows.map(dayOf))].sort()) {
    const rd = rows.filter(x => dayOf(x) === d)
    const marks = rd.flatMap(x => [x.external_ingreso_at, x.external_salida_at]).filter(Boolean).map(s => Date.parse(s + '-03:00')).sort((a, b) => a - b)
    const horas = marks.length ? (marks[marks.length - 1] - marks[0]) / H : 0
    const td = trips.filter(t => t.day === d)
    const vc = {}; for (const t of td) if (t.volc) vc[t.volc] = (vc[t.volc] || 0) + 1
    const totV = Object.values(vc).reduce((a, b) => a + b, 0)
    const volcables = Object.entries(vc).filter(([, n]) => n >= Math.max(5, totV * 0.15)).map(([k]) => k).sort()
    dias.push({ op: o.id, dia: d, viajes: rd.length, camiones: new Set(rd.map(x => x.plate_normalized)).size, horas: +horas.toFixed(1),
      viajesPorCamion: +(rd.length / new Set(rd.map(x => x.plate_normalized)).size).toFixed(1),
      viajesHora: horas >= 4 ? +(rd.length / horas).toFixed(1) : null,
      leidos: td.length, ciclo: mean(td.map(t => t.ciclo)), ric: mean(td.map(t => t.ric)), puerto: mean(td.map(t => t.puerto)), sl: mean(td.map(t => t.sl)),
      volcables, porVolcable: vc })
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(dias, null, 1))
console.table(dias.map(x => ({ op: x.op, dia: x.dia.slice(5), viajes: x.viajes, cam: x.camiones, h: x.horas, 'v/h': x.viajesHora, 'v/cam': x.viajesPorCamion, leidos: x.leidos, ciclo: x.ciclo, ric: x.ric, puerto: x.puerto, volc: x.volcables.join('+'), detalle: JSON.stringify(x.porVolcable) })))
