// Baja del DSS todas las capturas (patente, confianza, hora real, URLs de foto) de unas cámaras en un rango.
// Uso: node scripts/estado-planta/dss-capturas-camaras.mjs <salida.json> <desde ISO hora real> <hasta ISO hora real> <cámaras,coma>
// Hora real de cámara: la hora operativa del feed es esta + 240 s (server/dssPhotoLookup.mjs).
import '../../server/load-env.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'

const [out, desde, hasta, devs] = process.argv.slice(2)
if (!out || !desde || !hasta || !devs) {
  console.error('uso: dss-capturas-camaras.mjs <salida.json> <desde> <hasta> <cámaras,coma>')
  process.exit(1)
}
const dss = createDssLiveRouter({ projectRoot: path.resolve(import.meta.dirname, '..', '..') })
if (!dss.isDssConfigured()) {
  console.error('DSS no configurado (.env)')
  process.exit(1)
}
const from = Date.parse(desde), to = Date.parse(hasta)
const res = {}
for (const dev of devs.split(',')) {
  res[dev] = []
  // de a 6 h: el DSS pagina por rango y así cada pedido trae pocas páginas
  for (let a = from; a < to; a += 6 * 3600e3) {
    const b = Math.min(to, a + 6 * 3600e3)
    for (let page = 1; ; page++) {
      const rows = await dss.listVehicleCaptures(dev, a, b, 100, page)
      res[dev].push(...rows)
      if (rows.length < 100) break
    }
  }
  console.log(dev, res[dev].length)
}
fs.writeFileSync(out, JSON.stringify({ desde, hasta, capturas: res }, null, 1))
process.exit(0)
