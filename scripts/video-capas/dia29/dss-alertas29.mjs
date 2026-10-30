// Busca en el DSS, una por una, las capturas del 29/10 que quedaron en alerta sin marca ni tipo.
// Hora real de cámara = hora operativa − 240 s (server/dssPhotoLookup.mjs).
import fs from 'node:fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
await import('file:///' + R + 'server/load-env.mjs')
const { createDssLiveRouter } = await import('file:///' + R + 'server/dss-live.mjs')
const here = (f) => new URL(f, import.meta.url)
const caps = JSON.parse(fs.readFileSync(here('./capturas-todas.json'), 'utf8'))
const alg = JSON.parse(fs.readFileSync(here('./dia29-alg.json'), 'utf8'))
const attrs = JSON.parse(fs.readFileSync(here('./attrs29.json'), 'utf8'))
const alertPlates = new Set(Object.entries(alg.trucks).filter(([, v]) => v.layer === 'al4').map(([p]) => p))
const need = caps.filter((c) => alertPlates.has(c.plate) && !c.brand && !(attrs[c.plate] && attrs[c.plate].liviano + attrs[c.plate].camion > 0))
console.log('patentes en alerta', alertPlates.size, '· capturas a buscar', need.length, '· patentes', new Set(need.map((c) => c.plate)).size)
const dss = createDssLiveRouter({ projectRoot: R })
if (!dss.isDssConfigured()) { console.error('DSS no configurado'); process.exit(1) }
const outFile = here('./dss-alertas29.json')
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {}
let i = 0
for (const c of need) {
  const k = `${c.dev}|${c.t}`
  if (out[k] !== undefined) continue
  try {
    const r = await dss.findVehicleCapture(c.dev, c.t - 240_000, c.plate)
    out[k] = r ? { plate: c.plate, dssPlate: r.plate, brand: r.vehicleBrand ?? null, color: r.vehicleColor ?? null, category: r.vehicleCategory ?? null } : null
  } catch (e) { console.log('error', c.dev, c.plate, e.message); if (/sesi|session|401|403/i.test(e.message)) break }
  if (++i % 20 === 0) { fs.writeFileSync(outFile, JSON.stringify(out)); console.log(i, '/', need.length) }
}
fs.writeFileSync(outFile, JSON.stringify(out))
const got = Object.values(out).filter(Boolean)
console.log('encontradas', got.length, 'de', Object.keys(out).length, '· con tipo', got.filter((x) => x.category).length)
process.exit(0)
