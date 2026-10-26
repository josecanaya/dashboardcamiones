// Fotos del DSS para el recorrido completo de los camiones rechazados en la balanza del puerto (comité de seguridad).
// Uso: node scripts/estado-planta/fotos-recorridos.cjs <carpeta comite-seguridad>
// Lee <carpeta>/datos.json → balanza.pasadosKg[].visitas[].items (device + at de cada paso, de comite-seguridad-deteccion.ts),
// pide cada escena al DSS vía el server local (/api/truckflow/camera-captures) y deja
// <carpeta>/fotos/recorridos/<PATENTE>/<hhmm>_<device>.jpg y <carpeta>/fotos/recorridos/fotos.json. Reintenta: la VPN al DSS se corta.
const fs = require('fs'), path = require('path')
const dir = path.resolve(process.argv[2] || '.')
const API = process.env.API || 'http://127.0.0.1:8787'
const D = JSON.parse(fs.readFileSync(path.join(dir, 'datos.json'), 'utf8'))
const out = path.join(dir, 'fotos', 'recorridos')
const indexFile = path.join(out, 'fotos.json')
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function pedir(it) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await (await fetch(`${API}/api/truckflow/camera-captures/find?device=${encodeURIComponent(it.device)}&at=${encodeURIComponent(it.at)}&plate=${encodeURIComponent(it.leyo || '')}`)).json()
      if (r.found && r.capture?.sceneFile) {
        const img = await fetch(`${API}/api/truckflow/camera-captures/image?file=${r.capture.sceneFile}`)
        if (img.ok) return { buf: Buffer.from(await img.arrayBuffer()), plate: r.capture.plate }
      }
      if (!r.error || !/red|network|socket|TLS/i.test(r.error)) return null   // el DSS no tiene la captura: no reintentar
    } catch { /* server o red: reintentar */ }
    await sleep(1500 * (i + 1))
  }
  return null
}
;(async () => {
  let ok = 0, falta = 0
  // rechazados en la balanza, interplanta, dos calles y los vehículos sin sistema que traen recorrido (fichas)
  const casos = [...(D.balanza?.pasadosKg ?? []), ...(D.interplanta ?? []), ...(D.dosCalles ?? []), ...(D.camionetas?.lista ?? [])].filter((x) => x.visitas?.length)
  // + una o dos fotos de cada vehículo liviano (ficha «Vehículos Permitidos»)
  for (const x of D.camionetas?.lista ?? []) if (x.fotos?.length) casos.push({ patente: x.patente, visitas: [{ items: x.fotos.map((f) => ({ ...f, punto: f.device, leyo: x.patente })) }] })
  for (const x of casos) {
    fs.mkdirSync(path.join(out, x.patente), { recursive: true })
    for (const v of x.visitas) for (const it of v.items) {
      const key = `${x.patente}|${it.device}|${it.at}`
      if (index[key] && fs.existsSync(path.join(out, index[key].archivo))) { ok++; continue }
      const r = await pedir(it)
      if (!r) { falta++; console.log('sin foto', x.patente, it.hora, it.punto, it.device); continue }
      const archivo = path.join(x.patente, `${it.hora.replace(':', '')}_${it.device}.jpg`)
      fs.writeFileSync(path.join(out, archivo), r.buf)
      index[key] = { archivo, patente: x.patente, punto: it.punto, hora: it.hora, leyoDss: r.plate || '' }
      ok++
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 1))
    }
  }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1))
  console.log(`fotos: ${ok} · sin foto: ${falta} · ${indexFile}`)
})()
