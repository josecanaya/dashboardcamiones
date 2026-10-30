// Qué vio la cámara en las capturas del 29/10 que quedaron sin patente útil: tipo, marca, patente del DSS y URLs de foto.
import fs from 'node:fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
await import('file:///' + R + 'server/load-env.mjs')
const { createDssLiveRouter } = await import('file:///' + R + 'server/dss-live.mjs')
const here = (f) => new URL(f, import.meta.url)
const d = JSON.parse(fs.readFileSync(here('./dia29-alg.json'), 'utf8'))
const raw = JSON.parse(fs.readFileSync(here('./capturas-todas.json'), 'utf8'))
const readOf = new Map(raw.map((c) => [`${c.dev}|${c.t}`, c.plate]))
const need = d.caps.filter((c) => c.l === 'nr')
const outFile = here('./dss-nr29.json')
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {}
const dss = createDssLiveRouter({ projectRoot: R })
let i = 0
for (const c of need) {
  const k = `${c.d}|${c.t}`
  if (out[k] !== undefined) continue
  try {
    const r = await dss.findVehicleCapture(c.d, c.t - 240_000, readOf.get(k) || undefined)
    out[k] = r ? { read: readOf.get(k) ?? '', dssPlate: r.plate, tipo: r.vehicleCategory ?? null, marca: r.vehicleBrand ?? null, color: r.vehicleColor ?? null, conf: r.confidence, scene: r.scenePicture, plateImg: r.platePicture, nodo: c.n, hora: new Date(c.t - 3 * 3600e3).toISOString().slice(11, 16) } : null
  } catch (e) { console.log('error', c.d, e.message) }
  if (++i % 50 === 0) { fs.writeFileSync(outFile, JSON.stringify(out)); console.log(i, '/', need.length) }
}
fs.writeFileSync(outFile, JSON.stringify(out))
const v = Object.values(out)
const cat = {}; for (const x of v) { const k = x ? (x.tipo ?? 'sin tipo') : 'no está en el DSS'; cat[k] = (cat[k] || 0) + 1 }
console.log('capturas', need.length, JSON.stringify(cat))
console.log('con patente del DSS', v.filter((x) => x?.dssPlate).length)
process.exit(0)
