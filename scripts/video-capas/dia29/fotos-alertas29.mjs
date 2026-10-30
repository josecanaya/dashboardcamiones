// Una foto de escena del DSS por patente en alerta (29/10), para ver si es camión, tractor, moto o persona.
import fs from 'node:fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
await import('file:///' + R + 'server/load-env.mjs')
const { createDssLiveRouter } = await import('file:///' + R + 'server/dss-live.mjs')
const here = (f) => new URL(f, import.meta.url)
const d = JSON.parse(fs.readFileSync(here('./dia29-alg.json'), 'utf8'))
const dir = here('./fotos-alertas/'); fs.mkdirSync(dir, { recursive: true })
const byPlate = new Map()
for (const c of d.caps.filter((c) => c.l === 'al4')) byPlate.set(c.p, [...(byPlate.get(c.p) ?? []), c])
const dss = createDssLiveRouter({ projectRoot: R })
const meta = {}
for (const [plate, cs] of byPlate) {
  if (fs.existsSync(new URL(`${plate}.jpg`, dir))) continue
  // frontal primero; si una captura no tiene foto, prueba la siguiente
  for (const c of [...cs].sort((a, b) => /Tr(as|aser)?$/i.test(a.d) - /Tr(as|aser)?$/i.test(b.d))) {
    try {
      const r = await dss.findVehicleCapture(c.d, c.t - 240_000, plate)
      if (!r?.scenePicture) continue
      const pic = await dss.fetchPicture(r.scenePicture)
      const buf = pic?.buf
      if (!buf || !buf.length) continue
      fs.writeFileSync(new URL(`${plate}.jpg`, dir), buf)
      meta[plate] = { dev: c.d, nodo: c.n, dss: r.plate, tipo: r.vehicleCategory ?? null, marca: r.vehicleBrand ?? null, lecturas: cs.length }
      break
    } catch (e) { console.log(plate, e.message) }
  }
}
fs.writeFileSync(here('./fotos-alertas/meta.json'), JSON.stringify(meta, null, 1))
console.log('fotos', fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length, 'de', byPlate.size)
process.exit(0)
