// Datos de la página «Pellet camión por camión»: viajes de cada camión con horarios (planilla + cámaras) y totales por camión.
// Uso: node scripts/estado-planta/pellet-camiones-datos.cjs <pellet-viajes.json> <pellet-por-patente.json> <salida.json>
// Viaje: carga = ingreso → salida de Ricardone (planilla); puerto = ingreso → salida SLZ (cámaras). Si el puerto no se leyó:
// ingreso SLZ = salida Ricardone + 17 min; salida SLZ = carga siguiente − 22 min si la hay a menos de 8 h, si no + 212 min (medias).
const fs = require('fs')
const [vPath, pPath, outPath] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(vPath)), P = JSON.parse(fs.readFileSync(pPath))
const M = 60000, H = 3600000
const ts = s => Date.parse(String(s).slice(0, 19) + '-03:00')
const byP = {}
for (const v of D.planilla) (byP[v.p] ??= []).push({ a: ts(v.ingreso), b: ts(v.salida) })
const camiones = []
for (const [p, V] of Object.entries(byP)) {
  V.sort((x, y) => x.a - y.a)
  const C = D.camaras.filter(c => c.p === p)
  const viajes = V.map((v, k) => {
    const c = C.find(c => c.balE >= v.a - 30 * M && c.balE <= v.b + 60 * M) || {}
    const next = V[k + 1]?.a
    const leido = !!(c.slI && c.slS && c.slS > c.slI && c.slI > v.b)
    const slI = leido ? c.slI : v.b + 17 * M
    const slS = leido ? c.slS : (next && next - v.b < 8 * H ? next - 22 * M : slI + 212 * M)
    return { a: Math.round(v.a / M), b: Math.round(v.b / M), i: Math.round(slI / M), s: Math.round(Math.max(slS, slI + 10 * M) / M), l: leido ? 1 : 0 }
  })
  const porDia = {}
  for (const v of V) { const d = new Date(v.a - 3 * H).toISOString().slice(0, 10); porDia[d] = (porDia[d] || 0) + 1 }
  const r = P.camiones.find(x => x.patente === p) || {}
  const leidos = viajes.filter(v => v.l)
  camiones.push({
    p, viajes: V.length, dias: Object.keys(porDia).length, maxDia: Math.max(...Object.values(porDia)), porDia,
    max24: r.max24hViajes, horas: r.horasJornadas, jornadaMax: r.jornadaMaxHoras,
    minPuerto: leidos.length ? Math.round(leidos.reduce((s, v) => s + v.s - v.i, 0) / leidos.length) : null,
    minRic: Math.round(V.reduce((s, v) => s + (v.b - v.a) / M, 0) / V.length), minVuelta: r.minVuelta, leidos: leidos.length,
    viajesDet: viajes,
  })
}
camiones.sort((a, b) => b.viajes - a.viajes || b.max24 - a.max24 || a.p.localeCompare(b.p))
fs.writeFileSync(outPath, JSON.stringify({ totales: P.totales, camiones }))
console.log(camiones.length, camiones.slice(0, 5).map(c => c.p + ' ' + c.viajes + ' ' + c.minPuerto).join(', '))
