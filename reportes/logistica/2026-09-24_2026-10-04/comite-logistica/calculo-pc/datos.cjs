// Junta las cifras del comité 24/09–04/10 (cálculo hecho en la PC de la oficina, con todas las cámaras y planillas).
// Uso (desde la raíz del repo): node reportes/logistica/2026-09-24_2026-10-04/comite-logistica/calculo-pc/datos.cjs
// Escribe ../datos.json, que lee scripts/estado-planta/gen_comite_logistica_rango.py.
// Fuentes: paquete revision-002 (corridas 2026-09-21_2026-09-27 y 2026-09-28_2026-10-04 reprocesada el 05/10, v17) y,
// en esta carpeta: extras.json (extras.cjs sobre excel_operations_with_truckflow compuesta), metricas-camaras.json,
// pellet-operativo.json, pellet-historico.json, pellet-escenarios.json, liquidos-tramos.json.
const fs = require('fs'), path = require('path')
const AQUI = __dirname, BASE = path.join(AQUI, '..'), ROOT = path.join(AQUI, '..', '..', '..', '..', '..')
const J = f => JSON.parse(fs.readFileSync(path.join(AQUI, f)))
const PAQ = 'reportes/logistica/2026-09-24_2026-10-04/revision-002/paquete.json'
const PX = JSON.parse(fs.readFileSync(path.join(ROOT, PAQ)))
const X7 = J('extras-24-30.json'), XX = J('extras.json'), M = J('metricas-camaras.json'), PO = J('pellet-operativo.json'), PH = J('pellet-historico.json'), LT = J('liquidos-tramos.json')
const OPS = J('excel_ops_compuesta.json').rows

// girasol: publicado 17–23/09 (comité 25/09) + variación medida por cámaras (mismo método las dos semanas)
const g = M.circuitos.cur.gir.tiempos, gp = M.circuitos.prev.gir.tiempos
const GPUB = { ing: 3, p1: 78, pb: 13, ap3: 10, desc: 105, tara: 19 }
const GI = { ing: GPUB.ing, p1: GPUB.p1 + g.p1.mean - gp.p1.mean, pb: GPUB.pb, ap3: GPUB.ap3 + 2,
  desc: GPUB.desc + g.descarga.mean - gp.descarga.mean, tara: GPUB.tara + g.tara.mean - gp.tara.mean }
GI.total = GI.ing + GI.p1 + GI.pb + GI.ap3 + GI.desc + GI.tara
GI.cam = { cur: { p1: g.p1, descarga: g.descarga, tara: g.tara }, prev: { p1: gp.p1, descarga: gp.descarga, tara: gp.tara } }
// octubre (01–04/10) por separado, ponderado por camiones por día
{ const G = M.circuitos.cur.gir, W = G.porDia, T = G.tiemposDia, o = {}; let n = 0
  for (let i = 7; i < W.length; i++) n += W[i]
  for (const k of ['p1', 'descarga', 'tara']) { let s = 0, w = 0; for (let i = 7; i < W.length; i++) if (T[i][k] != null) { s += T[i][k] * W[i]; w += W[i] } o[k] = w ? Math.round(s / w) : null }
  GI.cam.oct = { n, ...o } }

// pellet: dos tandas (se corta con más de 36 h sin movimientos)
const H = 3600000
const bl = PO.planilla.bloques.map(b => ({ ...b, ini: Date.parse(b.inicio.replace(' ', 'T') + ':00-03:00'), fin: Date.parse(b.fin.replace(' ', 'T') + ':00-03:00') }))
const tandas = []
for (const b of bl) { const t = tandas[tandas.length - 1]; if (t && b.ini - t.fin <= 36 * H) { t.fin = b.fin; t.horas += b.horas; t.bloques.push(b) } else tandas.push({ ini: b.ini, fin: b.fin, horas: b.horas, bloques: [b] }) }
const pel = OPS.filter(x => /^R3[012]$/.test(x.resolved_executive_circuit_code || '') && !/^(.)\1+$/.test(x.plate_normalized || ''))
const fmt = t => new Date(t - 3 * H).toISOString().slice(0, 16).replace('T', ' ')
const pool = (arr, k) => { let s = 0, n = 0; for (const d of arr) { const v = d.tramos[k]; if (v && v.mean != null) { s += v.mean * v.n; n += v.n } } return n ? Math.round(s / n) : null }
const TANDAS = tandas.map(t => {
  const desde = fmt(t.ini).slice(0, 10), hasta = fmt(t.fin).slice(0, 10)
  const rows = pel.filter(x => x.source_date >= desde && x.source_date <= hasta)
  const dias = Object.keys(PO.camaras.porDia).filter(d => d >= desde && d <= hasta).map(d => PO.camaras.porDia[d])
  return { inicio: fmt(t.ini), fin: fmt(t.fin), horas: +t.horas.toFixed(1), viajes: rows.length, camiones: new Set(rows.map(x => x.plate_normalized)).size,
    toneladas30: rows.length * 30, ciclo: pool(dias, 'ciclo'), ric: pool(dias, 'ric'), sl: pool(dias, 'sl'), playaOsl: pool(dias, 'playaOsl'), descarga: pool(dias, 'descarga'),
    viajesPorCamion: +(rows.length / new Set(rows.map(x => x.plate_normalized)).size).toFixed(1) }
})
const pc = PO.camaras
const ph = PH.map(o => o.id === 'actual' ? { ...o, ciclo: pc.periodo.ciclo.mean, tandas: TANDAS.length } : o)

const out = {
  days: PX.periodo.days, paquete: PAQ, fuentes: PX.fuentes, extras: XX, extras2430: X7, girasol: GI,
  pelletOperativo: PO, pelletHistorico: ph, pelletTandas: TANDAS, pelletEscenarios: 'calculo-pc/pellet-escenarios.json',
  liquidosTramos: LT,
  // SL1: dónde se caló cada carga (scripts/estado-planta/sl1-calada.cjs)
  sl1Calada: J('sl1-calada.json').grupos,
  // SL1 por tipo de movimiento: E = carga (egreso), I = descarga (ingreso), todos los productos de la plataforma ACEITE OSL
  sl1Mov: (() => { const sh = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
    const od = s => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}/.test(s || '')) return null; return +s.slice(11, 13) >= 22 ? sh(s.slice(0, 10), 1) : s.slice(0, 10) }
    const seen = new Set(), o = {}
    for (const r of OPS) { if (seen.has(r.external_operation_id) || r.resolved_executive_circuit_code !== 'SL1' || /AGUA/.test(r.product_normalized || '') || /^(.)+$/.test(r.plate_normalized || '')) continue; seen.add(r.external_operation_id)
      if (!PX.periodo.days.includes(od(r.external_ingreso_at))) continue
      const k = r.movement_type === 'EGRESO' ? 'carga' : 'descarga', x = (o[k] ??= { n: 0, p2p: [], productos: {} }); x.n++
      x.productos[r.product_normalized] = (x.productos[r.product_normalized] || 0) + 1
      const a = Date.parse(r.external_ingreso_at), b = Date.parse(r.external_salida_at); if (b > a) x.p2p.push((b - a) / 6e4) }
    for (const x of Object.values(o)) x.p2p = Math.round(x.p2p.reduce((s, v) => s + v, 0) / x.p2p.length)
    return o })(),
  volcablesHistorico: J('volcables-historico.json'),
  // Transile R29 por día, medido por patente: Ricardone = pre-ingreso → egreso; San Lorenzo = egreso → salida del puerto sin el traslado
  r29Dia: { ric: M.circuitos.cur.r29.tiemposDia.map(d => d.ric), sl: M.circuitos.cur.r29.tiemposDia.map(d => d.egrVolc != null && d.volcSal != null ? d.egrVolc - (d.puente || 0) + d.volcSal : null), n: M.circuitos.cur.r29.porDia },
  // San Lorenzo por día, medido por patente con cámaras (ingreso SLZ → salida SLZ de cada camión de soja R7)
  r7Dia: { sl: M.circuitos.cur.r7.tiemposDia.map(d => d.sl), n: M.circuitos.cur.r7.porDia, periodo: M.circuitos.cur.r7.tiempos.sl },
  r29: { tramos: M.circuitos.cur.r29.tiempos, nota: 'Sin transile R29 del 30/09 al 04/10 (planilla): tramos medidos por cámaras del 24 al 29/09.' },
  calculo: 'calculo-pc (PC de la oficina, 05/10)',
}
fs.writeFileSync(path.join(BASE, 'datos.json'), JSON.stringify(out, null, 1))
console.log('GI', JSON.stringify(GI)); console.log('tandas', JSON.stringify(TANDAS)); console.log('PH actual', JSON.stringify(ph[ph.length - 1]))
