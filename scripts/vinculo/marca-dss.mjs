// Marca y color del DSS para los camiones con carta que tienen un paso de volcables de noche sin leer.
// El feed de TruckFlow no trae marca ni color (solo las alertas), así que esos camiones no tienen perfil y la segunda
// pasada de cobertura.mjs (marca de noche en volcables) no puede desempatar (EWH682, 06/11 05:20: «IAGQ17», Benz, era
// el camión y ganaba «VISF», Honda, por 6 min de horario). Por camión se piden al DSS 3 lecturas frontales propias
// (una consulta de datos cada una, sin fotos); la marca que se repite en 2 o más queda en el perfil. De noche el DSS
// discrepa entre lecturas del mismo camión (05/11: 25 de 85 con 2 lecturas; EWH682 «Chevrolet» en Pre ingreso y
// «Mercedes-Benz» en la calada).
// Uso: node scripts/vinculo/marca-dss.mjs DIA <cobertura.json>   → data/dss-marcas/<DIA>.json (se suma a lo que haya)
// Las consultas van de a una (server/dss-live.mjs espacia y reintenta los 429).
import '../../server/load-env.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'

const [day, cobFile] = process.argv.slice(2)
if (!day || !cobFile) { console.error('uso: node scripts/vinculo/marca-dss.mjs DIA <cobertura.json>'); process.exit(1) }
const H = 3600_000
const ATRIB = /^SLZVolcableC[1-5]$/i
const deNoche = (iso) => { const h = new Date(Date.parse(iso) - 3 * H).getUTCHours(); return h >= 18 || h < 7 }
// Frontales donde el camión se ve de frente y de cerca (la marca sale mejor).
const FRONTALES = /^(RicPreIngInFr|RicCal0\d|RicEgrCamFrente|SLZIngCamFrente|SLZBalIngFte|SLZBalSC[12]Fte|SLZSalidaC[12]Fte|RicIngCamFrente)$/i
const DSS_OFFSET_MS = 240_000 // el DSS marca 240 s menos que la hora del feed

// Hasta 3 lecturas frontales propias de cámaras distintas, de día primero (de noche la marca sale peor).
const propiasDe = (t) => {
  const propias = t.lecturas.filter((l) => l.fuente === 'feed' && FRONTALES.test(l.camara) && t.plates.includes(l.patente))
  propias.sort((a, b) => Number(deNoche(a.at)) - Number(deNoche(b.at)))
  const out = []
  for (const l of propias) if (out.length < 3 && !out.some((e) => e.camara === l.camara)) out.push(l)
  return out
}
const marcaNorm = (m) => { const s = String(m ?? '').toLowerCase(); if (!s || /unknown|unrecognized|null/.test(s)) return null; return /benz|mercedes/.test(s) ? 'mercedes' : s.replace(/[^a-z]/g, '') }
// El valor que aparece en 2 o más lecturas y más que cualquier otro; si no, ninguno.
const mayoria = (vals) => {
  const n = {}
  for (const v of vals) if (v) n[v] = (n[v] ?? 0) + 1
  const [a, b] = Object.entries(n).sort((x, y) => y[1] - x[1])
  return a && a[1] >= 2 && (!b || a[1] > b[1]) ? a[0] : null
}
const cob = JSON.parse(fs.readFileSync(cobFile, 'utf8'))
const outFile = path.join(process.cwd(), 'data', 'dss-marcas', `${day}.json`)
const cache = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {}
const pedir = cob.camiones.filter((t) => (t.huecos ?? []).some((h) => h.nodo === 'san_lorenzo:Plataformas Volcables' && deNoche(h.todas?.[0]?.at ?? `${day}T12:00:00Z`)) || (t.huecos ?? []).some((h) => (h.todas ?? []).some((c) => ATRIB.test(c.camara) && deNoche(c.at))))
const dss = createDssLiveRouter({ projectRoot: process.cwd() })
let consultas = 0, conMarca = 0
for (const t of pedir) {
  if (cache[t.plate]?.vistas?.length >= 3 || (cache[t.plate] && cache[t.plate].vistas.length >= propiasDe(t).length)) continue
  const elegidas = propiasDe(t)
  const vistas = cache[t.plate]?.vistas ?? []
  for (const l of elegidas) {
    if (vistas.some((v) => v.camara === l.camara && v.at === l.at)) continue
    try {
      consultas++
      const r = await dss.findVehicleCapture(l.camara, Date.parse(l.at) - DSS_OFFSET_MS, l.patente)
      if (r) vistas.push({ camara: l.camara, at: l.at, leyo: r.plate, marca: r.vehicleBrand, color: r.vehicleColor, tipo: r.vehicleCategory })
    } catch (e) { console.warn(`${t.plate} ${l.camara}: ${e.message}`) }
  }
  cache[t.plate] = { marca: mayoria(vistas.map((v) => marcaNorm(v.marca))), color: mayoria(vistas.map((v) => v.color)), vistas }
  if (cache[t.plate].marca) conMarca++
}
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(cache, null, 1))
console.log(`${day}: ${pedir.length} camiones con volcables de noche, ${consultas} consultas al DSS, ${conMarca} con marca nueva → ${path.relative(process.cwd(), outFile)}`)
process.exit(0)
