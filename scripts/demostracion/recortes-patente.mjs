// Baja el recorte de la patente (plateFile del DSS) de cada captura de una página de dudas.
// Uso: SIM=dudas1 node scripts/demostracion/recortes-patente.mjs
import fs from 'node:fs'
import path from 'node:path'
const dir = 'outputs/demostracion_camaras/' + (process.env.SIM ?? 'dudas1')
const API = 'http://127.0.0.1:8787/api/truckflow/camera-captures'
const casos = JSON.parse(fs.readFileSync(path.join(dir, 'casos.json'), 'utf8'))
let n = 0
async function crop(x, name) {
  for (let i = 0; i < 3; i++) { try { return await crop1(x, name) } catch { await new Promise((r) => setTimeout(r, 1500)) } }
}
async function crop1(x, name) {
  if (!x?.foto || x.recorte) return
  const r = await fetch(`${API}/find?device=${x.dev}&at=${new Date(Date.parse(x.t) + 240000).toISOString()}&plate=${encodeURIComponent(x.leyo)}`).then((r) => r.json())
  if (!r.capture?.plateFile) return
  const img = await fetch(`${API}/image?file=${encodeURIComponent(r.capture.plateFile)}`)
  if (!img.ok) return
  fs.writeFileSync(path.join(dir, name + '_pl.jpg'), Buffer.from(await img.arrayBuffer())); x.recorte = name + '_pl.jpg'; n++
}
for (const c of casos) { await crop(c.referencia, c.id + '_ref'); let j = 0; for (const k of c.candidatos) await crop(k, `${c.id}_c${++j}`) }
fs.writeFileSync(path.join(dir, 'casos.json'), JSON.stringify(casos, null, 1) + '\n')
console.log('recortes', n)
