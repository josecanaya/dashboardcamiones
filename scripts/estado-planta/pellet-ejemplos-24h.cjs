// Camiones de pellet que cargaron 5 veces en 24 h: línea de tiempo viaje por viaje para responder «más de 15 h seguidas».
// Uso: node scripts/estado-planta/pellet-ejemplos-24h.cjs <pellet-viajes.json> <pellet-por-patente.json> <salida.json>
// Cada viaje: Ricardone = ingreso → salida de la planilla; puerto = ingreso SLZ → salida SLZ de cámaras; ruta = el resto hasta el
// ingreso siguiente a Ricardone. Si el puerto no tiene lectura, se toma ingreso SLZ = salida Ricardone + 17 min y salida SLZ =
// ingreso siguiente − 22 min (traslados medios del operativo).
const fs = require('fs')
const [vPath, pPath, outPath] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(vPath)), P = JSON.parse(fs.readFileSync(pPath))
const H = 3600000, M = 60000
const ts = s => Date.parse(String(s).slice(0, 19) + '-03:00')
const out = []
for (const r of P.camiones.filter(r => r.max24hViajes >= 5)) {
  const V = D.planilla.filter(v => v.p === r.patente).map(v => ({ a: ts(v.ingreso), b: ts(v.salida) })).sort((x, y) => x.a - y.a)
  const C = D.camaras.filter(c => c.p === r.patente)
  let bi = 0, best = 0
  for (let i = 0; i < V.length; i++) { let j = i; while (j + 1 < V.length && V[j + 1].a - V[i].a < 24 * H) j++; if (j - i + 1 > best) { best = j - i + 1; bi = i } }
  const W = V.slice(bi, bi + best)
  let leidos = 0
  const viajes = W.map((v, k) => {
    const c = C.find(c => c.balE >= v.a - 30 * M && c.balE <= v.b + 60 * M) || {}
    const next = W[k + 1]?.a
    const slI = c.slI && c.slI > v.b ? c.slI : v.b + 17 * M
    let slS = c.slS && c.slS > slI ? c.slS : (next ? next - 22 * M : null)
    if (!slS) slS = slI + 194 * M + 18 * M
    if (c.slI && c.slS) leidos++
    return { ric: [v.a, v.b], ida: [v.b, slI], puerto: [slI, slS], vuelta: next ? [slS, next] : null }
  })
  const ini = W[0].a, fin = viajes[viajes.length - 1].puerto[1]
  const sum = k => viajes.reduce((s, v) => s + (v[k] ? (v[k][1] - v[k][0]) / M : 0), 0)
  out.push({ patente: r.patente, viajes: best, ini, fin, horas: +((fin - ini) / H).toFixed(1), leidosPuerto: leidos,
    minRicardone: Math.round(sum('ric')), minRuta: Math.round(sum('ida') + sum('vuelta')), minPuerto: Math.round(sum('puerto')), flete: best * 180000, viajesDetalle: viajes })
}
out.sort((a, b) => b.leidosPuerto - a.leidosPuerto || b.horas - a.horas)
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
const f = t => new Date(t - 3 * H).toISOString().slice(5, 16).replace('T', ' ')
for (const o of out) console.log(o.patente, o.viajes, f(o.ini), '→', f(o.fin), o.horas, 'h', 'leídos', o.leidosPuerto, 'ric', o.minRicardone, 'ruta', o.minRuta, 'puerto', o.minPuerto)
