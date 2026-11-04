// Baja del DSS todas las capturas (patente, confianza, hora real, URLs de foto) de unas cámaras en un rango.
// Uso: node scripts/estado-planta/dss-capturas-camaras.mjs <salida.json> <desde ISO hora real> <hasta ISO hora real> <cámaras,coma>
// Hora real de cámara: la hora operativa del feed es esta + 240 s (server/dssPhotoLookup.mjs).
// Solo datos (patente, marca, color, tipo, hora y la URL de la foto): no baja imágenes.
// El DSS corta con 429 si se le pregunta seguido (el servidor 8787 comparte el límite): se reintenta con espera
// creciente y lo ya bajado queda en <salida.json> para retomar sin repetir cámaras.
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
const previo = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
const res = previo?.desde === desde && previo?.hasta === hasta ? previo.capturas : {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function pagina(dev, a, b, page) {
  for (let intento = 0; ; intento++) {
    try {
      return await dss.listVehicleCaptures(dev, a, b, 100, page)
    } catch (e) {
      if (!e?.rateLimited || intento >= 8) throw e
      await sleep(5000 * 2 ** Math.min(intento, 4))
    }
  }
}
for (const dev of devs.split(',')) {
  if (res[dev]) { console.log(dev, res[dev].length, '(ya bajada)'); continue }
  const filas = []
  // de a 6 h: el DSS pagina por rango y así cada pedido trae pocas páginas
  for (let a = from; a < to; a += 6 * 3600e3) {
    const b = Math.min(to, a + 6 * 3600e3)
    for (let page = 1; ; page++) {
      const rows = await pagina(dev, a, b, page)
      filas.push(...rows)
      if (rows.length < 100) break
    }
  }
  res[dev] = filas
  fs.writeFileSync(out, JSON.stringify({ desde, hasta, capturas: res }))
  console.log(dev, filas.length)
}
fs.writeFileSync(out, JSON.stringify({ desde, hasta, capturas: res }, null, 1))
process.exit(0)
