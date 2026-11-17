// Viajes Ricardone → puerto (cámaras) cruzados con la carta de porte (ARCA) de cada viaje.
// Uso: node scripts/cruce-cartas-camaras/viajes-sin-carta.mjs DESDE HASTA cartas1.json [cartas2.json ...]
// Viaje = lectura de egreso de Ricardone (RicEgrCamFrente o balanza de egreso) seguida de ingreso al puerto (SLZIngCamFrente)
// dentro de 3 h. Hora de cámara = occurredAt + 206 min (hora operativa); las cartas vienen en UTC.
// Para cada viaje busca una carta de la patente (camión o acoplado) que estuviera vigente:
//   con_carta      emitida antes de salir de Ricardone (+5 min) y confirmada/cerrada después de llegar
//   carta_en_viaje emitida entre la salida de Ricardone y la llegada al puerto (+10 min)
//   sin_carta      ninguna carta vigente; se informa si después apareció una (emitida más tarde)
import fs from 'node:fs'
import path from 'node:path'

const [desde, hasta, ...archivos] = process.argv.slice(2)
const ROOT = path.resolve(import.meta.dirname, '../..')
const MIN = 60_000
const OFFSET = 206 * MIN
const dias = []
for (let t = Date.parse(desde + 'T12:00Z') - 864e5; t <= Date.parse(hasta + 'T12:00Z') + 864e5; t += 864e5) dias.push(new Date(t).toISOString().slice(0, 10))

const lecturas = new Map()   // patente → [{t, dev}]
for (const d of dias) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).records ?? []) {
    const dev = r.deviceCode ?? ''
    if (!r.truckPlate || !/^(RicEgrCamFrente|RicB\dEgreso|SLZIngCamFrente)$/.test(dev)) continue
    const t = Date.parse(r.occurredAt) + OFFSET
    if (!lecturas.has(r.truckPlate)) lecturas.set(r.truckPlate, [])
    lecturas.get(r.truckPlate).push({ t, dev })
  }
}
const cartas = new Map()
for (const a of archivos) for (const n of JSON.parse(fs.readFileSync(a, 'utf8'))) for (const p of n.plates ?? []) {
  if (!cartas.has(p)) cartas.set(p, [])
  if (!cartas.get(p).some((m) => m.ctg === n.ctg)) cartas.get(p).push(n)
}
const ini = Date.parse(desde + 'T00:00:00-03:00'), fin = Date.parse(hasta + 'T23:59:59-03:00')
const hm = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')
const viajes = []
for (const [pat, rs] of lecturas) {
  rs.sort((a, b) => a.t - b.t)
  for (let i = 0; i < rs.length; i++) {
    if (rs[i].dev === 'SLZIngCamFrente' || rs[i].t < ini || rs[i].t > fin) continue
    // última lectura de egreso antes del ingreso al puerto (un camión puede leerse dos veces al salir)
    let j = i
    while (j + 1 < rs.length && rs[j + 1].dev !== 'SLZIngCamFrente') j++
    const ing = rs[j + 1]
    if (!ing || ing.t - rs[j].t > 3 * 3600e3) { i = j; continue }
    const tE = rs[j].t, tI = ing.t
    const cs = cartas.get(pat) ?? []
    const vigente = cs.find((n) => Date.parse(n.issued) <= tE + 5 * MIN && Date.parse(n.stateSince) >= tI - 30 * MIN && n.stateCode !== 'AN')
    const enViaje = cs.find((n) => Date.parse(n.issued) > tE + 5 * MIN && Date.parse(n.issued) <= tI + 10 * MIN)
    const despues = cs.filter((n) => Date.parse(n.issued) > tI + 10 * MIN && Date.parse(n.issued) < tI + 12 * 3600e3).sort((a, b) => a.issued.localeCompare(b.issued))[0]
    const estado = vigente ? 'con_carta' : enViaje ? 'carta_en_viaje' : 'sin_carta'
    const n = vigente ?? enViaje ?? despues
    viajes.push({ patente: pat, egreso: hm(tE), ingresoPuerto: hm(tI), min: Math.round((tI - tE) / MIN), egresoCamara: rs[j].dev, estado,
      ctg: n?.ctg ?? '', grano: n?.grain ?? '', tipo: n?.typeCode ?? '', emitida: n ? hm(Date.parse(n.issued)) : '', salidaDeclarada: n ? hm(Date.parse(n.departure)) : '',
      cartaPosterior: !vigente && !enViaje && despues ? `${despues.ctg} emitida ${hm(Date.parse(despues.issued))}` : '', cartasDeLaPatente: cs.length })
    i = j + 1
  }
}
viajes.sort((a, b) => a.egreso.localeCompare(b.egreso))
const out = path.join(ROOT, 'reportes', 'cruce-cartas-camaras', `viajes-ric-puerto_${desde}_${hasta}.json`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(viajes, null, 1))
const cuenta = viajes.reduce((m, v) => ((m[v.estado] = (m[v.estado] ?? 0) + 1), m), {})
console.log(`viajes Ricardone → puerto ${desde}..${hasta}: ${viajes.length}`, JSON.stringify(cuenta), out)
