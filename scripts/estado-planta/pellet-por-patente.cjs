// Operativo de pellet camión por camión: viajes, jornadas, horas seguidas y en qué se fue el tiempo de cada viaje.
// Uso: node scripts/estado-planta/pellet-por-patente.cjs <pellet-viajes.json> <salida.json> <salida.csv>
//   pellet-viajes.json = TRIPS_OUT de pellet-operativo.cjs (planilla viaje por viaje + horarios de cámara de cada viaje).
// Jornada = viajes seguidos del camión sin un corte de más de 6 h entre la salida de Ricardone y el ingreso siguiente
// (lo normal entre viaje y viaje es 2–5 h: ir al puerto, descargar y volver). Fin de jornada = salida del puerto del último
// viaje (cámara) o, si no se leyó, salida de Ricardone + 3 h 45 m (interplanta + puerto medios).
// Tiempo de cada viaje (cámaras): Ricardone = pre-ingreso → balanza egreso (fila, carga, pesada); manejando = balanza egreso →
// ingreso SLZ + salida SLZ → pre-ingreso siguiente; fila del puerto = ingreso SLZ → llegada a la volcable; descarga y salida = volcable → salida SLZ.
const fs = require('fs')
const [inPath, outJson, outCsv] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(inPath))
const H = 3600000, M = 60000, CORTE = 6 * H, PUERTO_FALLBACK = 225 * M, FLETE = 180000
const ts = s => Date.parse(String(s).slice(0, 19) + '-03:00')
const mins = (a, b, cap) => (a && b && b > a && (b - a) / M <= cap ? (b - a) / M : null)
const fmt = t => new Date(t - 3 * H).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1')
const byP = {}
for (const v of D.planilla) if (v.ingreso && v.salida) (byP[v.p] ??= { viajes: [], cam: [] }).viajes.push({ a: ts(v.ingreso), b: ts(v.salida), dia: v.dia })
for (const c of D.camaras) if (byP[c.p]) byP[c.p].cam.push(c)
const rows = []
for (const [p, X] of Object.entries(byP)) {
  X.viajes.sort((x, y) => x.a - y.a); X.cam.sort((x, y) => x.balE - y.balE)
  // cámara del viaje: balanza egreso entre el ingreso y 1 h después de la salida de Ricardone
  for (const v of X.viajes) v.c = X.cam.find(c => c.balE >= v.a - 30 * M && c.balE <= v.b + 60 * M) || null
  const J = []
  let cur = null
  for (const v of X.viajes) {
    if (!cur || v.a - cur.ultSalRic > CORTE) { cur = { ini: Math.min(v.a, v.c?.pre || v.a), viajes: [], ultSalRic: v.b }; J.push(cur) }
    cur.viajes.push(v); cur.ultSalRic = Math.max(cur.ultSalRic, v.b)
  }
  for (const j of J) { const u = j.viajes[j.viajes.length - 1]; j.fin = u.c?.slS && u.c.slS > u.b ? u.c.slS : u.b + PUERTO_FALLBACK; j.horas = (j.fin - j.ini) / H }
  const t = { ric: [], manejo: [], fila: [], desc: [] }
  for (const v of X.viajes) {
    const c = v.c; if (!c) continue
    const r = mins(c.pre, c.balE, 600), m1 = mins(c.balE, c.slI, 90), m2 = mins(c.slS, c.back, 120), f = mins(c.slI, c.slV, 720), d = mins(c.slV, c.slS, 180)
    if (r != null) t.ric.push(r); if (m1 != null) t.manejo.push(m1 + (m2 ?? 22)); if (f != null) t.fila.push(f); if (d != null) t.desc.push(d)
  }
  const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
  const jmax = J.reduce((a, b) => (b.horas > a.horas ? b : a))
  const horasJ = J.reduce((s, j) => s + j.horas, 0)
  const vueltaMed = [avg(t.ric), avg(t.manejo), avg(t.fila), avg(t.desc)]
  const vuelta = vueltaMed.every(x => x != null) ? vueltaMed.reduce((a, b) => a + b, 0) : null
  // máximo de cargas en 24 h móviles y la mayor separación entre dos cargas dentro de esas 24 h (una vuelta normal = 5–6 h)
  const L = X.viajes.map(v => v.a); let best = 0, bi = 0
  for (let i = 0; i < L.length; i++) { let j = i; while (j + 1 < L.length && L[j + 1] - L[i] < 24 * H) j++; if (j - i + 1 > best) { best = j - i + 1; bi = i } }
  let gapMax = 0; for (let k = bi + 1; k < bi + best; k++) gapMax = Math.max(gapMax, (L[k] - L[k - 1]) / H)
  rows.push({
    max24hViajes: best, max24hDesde: fmt(L[bi]), max24hHasta: fmt(X.viajes[bi + best - 1].b), max24hEntreCargasHoras: +gapMax.toFixed(1),
    patente: p, viajes: X.viajes.length, dias: new Set(X.viajes.map(v => v.dia)).size, conCamara: X.viajes.filter(v => v.c).length,
    jornadas: J.length, horasJornadas: +horasJ.toFixed(1), jornadaMaxHoras: +jmax.horas.toFixed(1), jornadaMaxViajes: jmax.viajes.length,
    jornadaMaxDesde: fmt(jmax.ini), jornadaMaxHasta: fmt(jmax.fin), jornadasMas12h: J.filter(j => j.horas > 12).length, jornadasMas15h: J.filter(j => j.horas > 15).length,
    minRicardone: vueltaMed[0], minManejando: vueltaMed[1], minFilaPuerto: vueltaMed[2], minDescargaSalida: vueltaMed[3], minVuelta: vuelta,
    pctFilaPuerto: vuelta ? Math.round(vueltaMed[2] / vuelta * 100) : null, pctManejando: vuelta ? Math.round(vueltaMed[1] / vuelta * 100) : null,
    flete: X.viajes.length * FLETE, fletePorHora: Math.round(X.viajes.length * FLETE / horasJ),
    jornadasDetalle: J.map(j => ({ desde: fmt(j.ini), hasta: fmt(j.fin), horas: +j.horas.toFixed(1), viajes: j.viajes.length })),
  })
}
rows.sort((a, b) => b.viajes - a.viajes || b.jornadaMaxHoras - a.jornadaMaxHoras)
// totales del operativo
const all = { ric: 0, manejo: 0, fila: 0, desc: 0, n: 0 }
for (const r of rows) if (r.minVuelta) { all.ric += r.minRicardone * r.conCamara; all.manejo += r.minManejando * r.conCamara; all.fila += r.minFilaPuerto * r.conCamara; all.desc += r.minDescargaSalida * r.conCamara; all.n += r.conCamara }
const J = rows.flatMap(r => r.jornadasDetalle)
const tot = {
  camiones: rows.length, viajes: rows.reduce((s, r) => s + r.viajes, 0), jornadas: J.length,
  horasCamion: Math.round(rows.reduce((s, r) => s + r.horasJornadas, 0)),
  vueltaMedia: { ricardone: Math.round(all.ric / all.n), manejando: Math.round(all.manejo / all.n), filaPuerto: Math.round(all.fila / all.n), descargaSalida: Math.round(all.desc / all.n), viajesMedidos: all.n },
  jornadasMas12h: J.filter(j => j.horas > 12).length, jornadasMas15h: J.filter(j => j.horas > 15).length,
  camionesConJornadaMas15h: rows.filter(r => r.jornadasMas15h).length,
  camionesPorMax24h: rows.reduce((o, r) => (o[r.max24hViajes] = (o[r.max24hViajes] || 0) + 1, o), {}),
  cincoCargas24hSinCorte: rows.filter(r => r.max24hViajes >= 5 && r.max24hEntreCargasHoras <= 7).length,
  jornadasPorViajes: Object.fromEntries([...new Set(J.map(j => j.viajes))].sort((a, b) => a - b).map(n => { const h = J.filter(j => j.viajes === n).map(j => j.horas); return [n, { jornadas: h.length, horasMedia: +(h.reduce((a, b) => a + b, 0) / h.length).toFixed(1) }] })),
}
const vm = tot.vueltaMedia, vt = vm.ricardone + vm.manejando + vm.filaPuerto + vm.descargaSalida
tot.vueltaMedia.total = vt
tot.pct = { ricardone: Math.round(vm.ricardone / vt * 100), manejando: Math.round(vm.manejando / vt * 100), filaPuerto: Math.round(vm.filaPuerto / vt * 100), descargaSalida: Math.round(vm.descargaSalida / vt * 100) }
tot.flete = tot.viajes * FLETE
tot.fletePagadoEnFilaPuerto = Math.round(tot.flete * vm.filaPuerto / vt)
fs.writeFileSync(outJson, JSON.stringify({ totales: tot, camiones: rows }, null, 1))
const cols = ['patente', 'viajes', 'dias', 'max24hViajes', 'max24hDesde', 'max24hHasta', 'max24hEntreCargasHoras', 'jornadas', 'horasJornadas', 'jornadaMaxHoras', 'jornadaMaxViajes', 'jornadaMaxDesde', 'jornadaMaxHasta', 'jornadasMas12h', 'jornadasMas15h', 'minRicardone', 'minManejando', 'minFilaPuerto', 'minDescargaSalida', 'minVuelta', 'pctFilaPuerto', 'pctManejando', 'flete', 'fletePorHora', 'conCamara']
fs.writeFileSync(outCsv, '﻿' + cols.join(';') + '\n' + rows.map(r => cols.map(c => String(r[c] ?? '').replace('.', ',')).join(';')).join('\n'))
console.log(JSON.stringify(tot, null, 1))
console.log(cols.slice(0, 18).join(' | '))

