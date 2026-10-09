// Baja del DSS (vía el server local, /api/truckflow/camera-captures) las fotos de lecturas puntuales de un camión.
// Uso: node scripts/estado-planta/fotos-dss.cjs <patente> <desde ISO> <hasta ISO> <carpeta salida> [dispositivos separados por coma]
// Busca en data/truckflow/<día>/event-list.json las lecturas de la patente en el rango (hora operativa = occurredAt + 206 min)
// y para cada una pide al DSS la captura (escena y patente). No guarda nada si el DSS no la encuentra.
const fs = require('fs'), path = require('path')
const [plate, desde, hasta, outDir, devsArg] = process.argv.slice(2)
const API = process.env.API || 'http://127.0.0.1:8787'
const ROOT = path.join(__dirname, '..', '..')
const SKEW = 206 * 60000
const a = Date.parse(desde), b = Date.parse(hasta)
const devs = devsArg ? new Set(devsArg.split(',')) : null
const days = new Set()
for (let t = a - 864e5; t <= b + 864e5; t += 864e5) days.add(new Date(t - 3 * 3600e3).toISOString().slice(0, 10))
const evs = []
for (const d of days) {
  const f = path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
  if (!fs.existsSync(f)) continue
  for (const e of JSON.parse(fs.readFileSync(f)).records) {
    if ((e.truckPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '') !== plate) continue
    const t = Date.parse(e.occurredAt) + SKEW
    if (t < a || t > b || (devs && !devs.has(e.deviceCode))) continue
    if (!evs.some(x => x.dev === e.deviceCode && Math.abs(x.t - t) < 2000)) evs.push({ t, dev: e.deviceCode, read: e.truckPlate })
  }
}
evs.sort((x, y) => x.t - y.t)
fs.mkdirSync(outDir, { recursive: true })
;(async () => {
  const out = []
  for (const e of evs) {
    const at = new Date(e.t).toISOString()
    const hh = new Date(e.t - 3 * 3600e3).toISOString().slice(5, 16).replace('T', '_').replace(':', '')
    const r = await (await fetch(`${API}/api/truckflow/camera-captures/find?device=${encodeURIComponent(e.dev)}&at=${encodeURIComponent(at)}&plate=${plate}`)).json()
    const rec = { plate, device: e.dev, horaOperativa: hh, found: r.found, error: r.error, capture: r.capture ? { plate: r.capture.plate, confidence: r.capture.confidence, color: r.capture.vehicleColor, marca: r.capture.vehicleBrand, tipo: r.capture.vehicleCategory, at: r.capture.at } : null }
    for (const kind of ['sceneFile', 'plateFile']) {
      const file = r.capture?.[kind]
      if (!file) continue
      const img = await fetch(`${API}/api/truckflow/camera-captures/image?file=${file}`)
      if (!img.ok) { rec[kind + 'Error'] = img.status; continue }
      const ext = (img.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg'
      const name = `${plate}_${hh}_${e.dev}_${kind === 'sceneFile' ? 'escena' : 'patente'}.${ext}`
      fs.writeFileSync(path.join(outDir, name), Buffer.from(await img.arrayBuffer()))
      rec[kind] = name
    }
    out.push(rec)
    console.log(hh, e.dev, r.found ? 'OK ' + (r.capture?.plate || '') : 'sin foto ' + (r.error || ''))
  }
  fs.writeFileSync(path.join(outDir, `${plate}_fotos.json`), JSON.stringify(out, null, 1))
})()
