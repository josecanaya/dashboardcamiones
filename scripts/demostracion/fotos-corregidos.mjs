// Baja del DSS (vía el servidor local) la foto de cada captura corregida y una foto buena del mismo camión.
// Uso: node scripts/demostracion/fotos-corregidos.mjs outputs/demostracion_camaras/2026-10-07_Q2Q3.json
import fs from 'node:fs'
import path from 'node:path'
const src = process.argv[2]
const API = 'http://127.0.0.1:8787/api/truckflow/camera-captures'
const out = path.join(path.dirname(src), 'fotos')
fs.mkdirSync(out, { recursive: true })
const { porCamion } = JSON.parse(fs.readFileSync(src, 'utf8'))
async function photo(device, tFeed, plate, name) {
  const r = await fetch(`${API}/find?device=${encodeURIComponent(device)}&at=${encodeURIComponent(tFeed)}&plate=${encodeURIComponent(plate ?? '')}`).then((x) => x.json())
  const cap = r.capture
  if (!cap?.sceneFile) return { ok: false, motivo: r.error ?? 'sin foto en el DSS' }
  const img = await fetch(`${API}/image?file=${encodeURIComponent(cap.sceneFile)}`)
  if (!img.ok) return { ok: false, motivo: `imagen HTTP ${img.status}` }
  const file = path.join(out, `${name}.jpg`)
  fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()))
  let plateFile = null
  if (cap.plateFile) { const pi = await fetch(`${API}/image?file=${encodeURIComponent(cap.plateFile)}`); if (pi.ok) { plateFile = path.join(out, `${name}_patente.jpg`); fs.writeFileSync(plateFile, Buffer.from(await pi.arrayBuffer())) } }
  return { ok: true, file, plateFile, dss: { leyo: cap.plate, confianza: cap.confidence, color: cap.vehicleColor, marca: cap.vehicleBrand, tipo: cap.vehicleCategory } }
}
const casos = []
let i = 0
for (const c of porCamion) {
  for (const p of c.pasos) {
    if (p.estado !== 'corregido') continue
    const refs = c.pasos.filter((x) => x.estado === 'camara' && x.device).sort((a, b) => Math.abs(Date.parse(a.t) - Date.parse(p.t)) - Math.abs(Date.parse(b.t) - Date.parse(p.t)))
    const id = `c${String(++i).padStart(2, '0')}`
    const cap = await photo(p.device, p.tFeed, p.leyo, `${id}_captura`)
    let ref = { ok: false, motivo: 'sin lectura buena del camión' }
    for (const r of refs.slice(0, 3)) { ref = await photo(r.device, r.tFeed, c.plate, `${id}_referencia`); if (ref.ok) { ref.paso = r; break } }
    casos.push({ id, camion: c.plate, circuito: c.circuito, punto: p.node, hora: p.t, camara: p.device, leyo: p.leyo, metodo: p.atras ? 'buscado antes de deducir' : 'al pasar', captura: cap, referencia: ref })
    console.log(id, c.plate, p.node, p.leyo, cap.ok ? 'foto' : cap.motivo, '|', ref.ok ? `ref ${ref.paso.node}` : ref.motivo)
  }
}
fs.writeFileSync(path.join(path.dirname(src), 'corregidos-fotos.json'), JSON.stringify(casos, null, 1) + '\n')
