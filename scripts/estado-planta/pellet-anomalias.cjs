// Anomalías del transile de pellet: qué cámaras leyeron a cada camión fuera del circuito esperado, tiempos fuera de rango y pesos.
// Uso: node --max-old-space-size=6144 scripts/estado-planta/pellet-anomalias.cjs <datos.json de pellet-calesita> <salida.json>
// Circuito esperado: pre-ingreso Ricardone → calle líquida → Playa 3 → balanza egreso → egreso Ricardone → ingreso SLZ → balanza SLZ
// → volcable 4 → salida SLZ → (vuelta) pre-ingreso Ricardone.
const fs = require('fs'), path = require('path')
const [inPath, outPath] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(inPath))
const ROOT = path.join(__dirname, '..', '..')
const M = 60000, H = 3600000, SKEW = 206 * M
const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const f = t => new Date(t - 3 * H).toISOString().slice(5, 16).replace('T', ' ')
const plates = new Set(D.viajesDet.map(v => v.p)), byP = {}, seen = new Set()
for (let d = shift(D.desde, -1); d <= shift(D.hasta, 1); d = shift(d, 1)) {
  const p_ = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(p_)) continue
  for (const e of JSON.parse(fs.readFileSync(p_)).records) {
    const p = (e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plates.has(p)) continue
    const t = Date.parse(e.occurredAt) + SKEW, k = p + '|' + e.deviceCode + '|' + Math.round(t / 1000)
    if (!Number.isFinite(t) || seen.has(k)) continue
    seen.add(k); (byP[p] ??= []).push({ t, dev: e.deviceCode })
  }
}
for (const L of Object.values(byP)) L.sort((a, b) => a.t - b.t)
const ESPERADO = /^(RicPreIngInFr|RicPreIngEgFr|RicIngCamFrente|RicCalLiq|RicS6Playa3|RicB[123](Ingreso|Egreso)|RicEgrCamFrente|SLZIngCamFrente|SLZBalIngFte|SLZVolcableC4|SLZSalidaC[12]Fte|SLZTK400)$/
const R = { fueraDeCircuito: [], volcableNoV4: [], interplantaLarga: [], regresoLargo: [], ricLargo: [], puertoLargo: [], kilos: [], devicesFuera: {} }
const byPlate = {}
for (const v of D.viajesDet) (byPlate[v.p] ??= []).push(v)
for (const [p, V] of Object.entries(byPlate)) {
  V.sort((a, b) => a.a - b.a)
  const L = byP[p] || []
  V.forEach((v, k) => {
    const ini = v.cam.pre && v.cam.pre < v.a ? v.cam.pre : v.a - 30 * M
    const fin = (v.cam.slS ?? v.ib ?? v.b) + 5 * M
    const raros = L.filter(e => e.t >= ini && e.t <= fin && !ESPERADO.test(e.dev))
    for (const e of raros) R.devicesFuera[e.dev] = (R.devicesFuera[e.dev] || 0) + 1
    if (raros.length) R.fueraDeCircuito.push({ p, carga: f(v.a), devs: [...new Set(raros.map(e => e.dev))].join(','), horas: raros.map(e => f(e.t)).join(' ') })
    if (v.cam.volcCam && v.cam.volcCam !== 'V4') R.volcableNoV4.push({ p, carga: f(v.a), volc: v.cam.volcCam })
    // interplanta: salida Ricardone (planilla) → ingreso puerto (planilla)
    if (v.ia && (v.ia - v.b) / M > 40) {
      const enMedio = L.filter(e => e.t > v.b && e.t < v.ia).map(e => e.dev)
      R.interplantaLarga.push({ p, salidaRic: f(v.b), ingresoSL: f(v.ia), min: Math.round((v.ia - v.b) / M), camarasEnMedio: [...new Set(enMedio)].join(',') })
    }
    const nx = V[k + 1]
    const finPuerto = v.cam.slS ?? v.ib
    if (nx && finPuerto) { const g = (nx.a - finPuerto) / M; if (g > 60 && g < 360) R.regresoLargo.push({ p, salidaSL: f(finPuerto), siguienteIngresoRic: f(nx.a), min: Math.round(g), camarasEnMedio: [...new Set(L.filter(e => e.t > finPuerto && e.t < nx.a).map(e => e.dev))].join(',') }) }
    if (v.t.ricPlanilla > 180) R.ricLargo.push({ p, carga: f(v.a), min: v.t.ricPlanilla })
    if (v.t.puertoPlanilla > 480) R.puertoLargo.push({ p, ingreso: v.ia ? f(v.ia) : null, min: v.t.puertoPlanilla })
  })
}
R.kilos = D.kilos.filter(k => Math.abs(k.dif) > 200).map(k => ({ p: k.p, salida: f(k.salida), kgRic: k.kgRic, kgPuerto: k.kgPuerto, dif: k.dif, taraRic: k.taraRic, taraPuerto: k.taraPuerto }))
// interplanta: distribución
const ip = D.viajesDet.filter(v => v.ia).map(v => (v.ia - v.b) / M)
R.interplantaDist = { n: ip.length, media: Math.round(ip.reduce((a, b) => a + b, 0) / ip.length), mas30: ip.filter(x => x > 30).length, mas40: ip.filter(x => x > 40).length, mas60: ip.filter(x => x > 60).length, negativos: ip.filter(x => x < 0).length }
fs.writeFileSync(outPath, JSON.stringify(R, null, 1))
console.log('cámaras fuera del circuito', JSON.stringify(R.devicesFuera))
console.log('viajes con lecturas fuera del circuito', R.fueraDeCircuito.length)
console.log('volcable no V4', R.volcableNoV4.length, 'interplanta', JSON.stringify(R.interplantaDist))
console.log('interplanta >40', R.interplantaLarga.length, JSON.stringify(R.interplantaLarga.slice(0, 12)))
console.log('regreso >60 min', R.regresoLargo.length, JSON.stringify(R.regresoLargo.slice(0, 10)))
console.log('Ricardone >180', R.ricLargo.length, JSON.stringify(R.ricLargo.slice(0, 8)), 'puerto >480', R.puertoLargo.length, JSON.stringify(R.puertoLargo.slice(0, 8)))
console.log('fuera de circuito (muestra)', JSON.stringify(R.fueraDeCircuito.slice(0, 15)))
