// Una foto del DSS (escena + recorte de patente) por patente de una lista del cruce con el SGC, vía el
// servidor en vivo (GET /api/truckflow/camera-captures/find e /image). Prueba los pasos guardados en `fotos`
// hasta encontrar una captura. Uso: node scripts/fotos-pasos-dss.mjs 2026-11-02 ["fuera del SGC"] [salida.json]
// El segundo argumento es una expresión regular sobre `quien` (ej. "^(lectura parecida|parecido dudoso|fuera del SGC)").
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const day = process.argv[2] ?? '2026-11-02'
const quien = process.argv[3] ?? 'fuera del SGC'
const API = (process.env.LOCAL_API ?? 'http://127.0.0.1:8787') + '/api/truckflow'
const dir = path.join(root, 'reportes', 'reconocimiento-pasos', day)
const out = path.join(dir, 'fotos')
fs.mkdirSync(out, { recursive: true })
const cruce = JSON.parse(fs.readFileSync(path.join(dir, 'cruce-sgc.json'), 'utf8'))
const filtro = new RegExp(quien)
const salida = process.argv[4] ?? 'fotos.json'
const filas = cruce.filas.filter((f) => filtro.test(f.quien) && f.lista === 'sin registro')

async function bajar(file, dest) {
  const r = await fetch(`${API}/camera-captures/image?file=${file}`)
  if (!r.ok) return false
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
  return true
}

const res = []
for (const f of filas) {
  let hit = null
  for (const m of f.fotos ?? []) {
    const q = new URLSearchParams({ device: m.device, at: m.at, plate: m.read ?? f.patente })
    try {
      const j = await (await fetch(`${API}/camera-captures/find?${q}`)).json()
      if (j.found && j.capture?.sceneFile) { hit = { ...m, capture: j.capture }; break }
    } catch {}
  }
  const row = { patente: f.patente, pasos: f.pasos, plantas: f.plantas, recorrido: f.recorrido, primero: f.primero, ultimo: f.ultimo, quien: f.quien, sgc: f.sgc, foto: null }
  if (hit) {
    const c = hit.capture
    const escena = `${f.patente}-escena.jpg`
    const patente = `${f.patente}-patente.jpg`
    const okE = await bajar(c.sceneFile, path.join(out, escena))
    const okP = c.plateFile ? await bajar(c.plateFile, path.join(out, patente)) : false
    row.foto = { device: hit.device, at: hit.at, leyo: c.plate ?? null, confianza: c.confidence ?? null, tipo: c.vehicleType ?? c.category ?? null, marca: c.brand ?? c.vehicleBrand ?? null, color: c.color ?? c.vehicleColor ?? null, escena: okE ? escena : null, recorte: okP ? patente : null }
  }
  res.push(row)
  process.stdout.write(hit ? '.' : 'x')
}
fs.writeFileSync(path.join(dir, salida), JSON.stringify({ dia: day, quien, filas: res }, null, 1))
console.log(`\n${res.filter((r) => r.foto?.escena).length} de ${res.length} con foto → ${out}`)
