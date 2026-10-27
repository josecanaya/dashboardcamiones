// Simulador del vínculo: un lote de camiones con carta por orden de llegada y, para cada paso que la cámara no
// tomó directo, las lecturas libres de ese punto con foto, el puntaje del algoritmo y lo que eligió.
// El usuario corrige en la página (scripts/vinculo/simulador-server.mjs guarda correcciones.json).
// Uso: node scripts/vinculo/simulador.mjs DESDE HASTA LLEGADA_DESDE_ISO [N=25]
//   lee reportes/vinculo/<desde>_<hasta>/cobertura.json y baja fotos del DSS vía el server local (:8787)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [FROM = '2026-10-19', TO = '2026-10-25', START = '2026-10-20T23:38:00Z', N = '25'] = process.argv.slice(2)
const API = process.env.API ?? 'http://127.0.0.1:8787'
const PER_HUECO = 8
const dir = path.join(process.cwd(), 'reportes/vinculo', `${FROM}_${TO}`)
const out = path.join(dir, 'simulador')
fs.mkdirSync(path.join(out, 'fotos'), { recursive: true })
const r = JSON.parse(fs.readFileSync(path.join(dir, 'cobertura.json'), 'utf8'))
const lote = r.camiones.map((t) => ({ ...t, llegada: t.lecturas.map((l) => l.at).sort()[0] }))
  .filter((t) => t.llegada >= START).sort((a, b) => a.llegada.localeCompare(b.llegada)).slice(0, Number(N))

// Foto de una lectura (escena y recorte de patente), guardada en fotos/ con nombre estable.
async function foto(camara, at, patente) {
  const id = crypto.createHash('sha1').update(`${camara}|${at}|${patente}`).digest('hex').slice(0, 12)
  const meta = path.join(out, 'fotos', `${id}.json`)
  if (fs.existsSync(meta)) return JSON.parse(fs.readFileSync(meta, 'utf8'))
  const rec = { id, escena: null, patente: null, dss: null }
  try {
    const j = await (await fetch(`${API}/api/truckflow/camera-captures/find?device=${encodeURIComponent(camara)}&at=${encodeURIComponent(at)}&plate=${encodeURIComponent(patente)}`)).json()
    if (j.capture) {
      rec.dss = { patente: j.capture.plate, marca: j.capture.vehicleBrand, color: j.capture.vehicleColor, tipo: j.capture.vehicleCategory, confianza: j.capture.confidence, difSeg: Math.round(j.capture.diffMs / 1000) }
      for (const [k, f] of [['escena', j.capture.sceneFile], ['patente', j.capture.plateFile]]) {
        if (!f) continue
        const img = await fetch(`${API}/api/truckflow/camera-captures/image?file=${f}`)
        if (!img.ok) continue
        const file = `${id}_${k}.jpg`
        fs.writeFileSync(path.join(out, 'fotos', file), Buffer.from(await img.arrayBuffer()))
        rec[k] = file
      }
    }
  } catch (e) {
    rec.error = e instanceof Error ? e.message : String(e)
  }
  fs.writeFileSync(meta, JSON.stringify(rec))
  return rec
}

const casos = []
let n = 0
for (const t of lote) {
  // Foto de referencia: lecturas exactas del camión (una por punto, frontales primero).
  const buenas = t.lecturas.filter((l) => l.clase === 'carta').sort((a, b) => a.at.localeCompare(b.at))
  const refs = []
  for (const l of buenas) if (!refs.some((x) => x.nodo === l.nodo) && refs.length < 3) refs.push({ ...l, foto: await foto(l.camara, l.at, l.patente) })
  const huecos = []
  for (const h of t.huecos ?? []) {
    const cands = []
    for (const c of h.todas.slice(0, PER_HUECO)) { cands.push({ ...c, foto: await foto(c.camara, c.at, c.patente) }); n++ }
    huecos.push({ ...h, todas: cands })
  }
  casos.push({ ctg: t.ctg, patentes: t.plates, circuito: t.circuit, llegada: t.llegada, status: t.status, lecturas: t.lecturas, referencias: refs, huecos })
  process.stdout.write(`\r${casos.length}/${lote.length} camiones · ${n} candidatas`)
}
fs.writeFileSync(path.join(out, 'casos.json'), JSON.stringify({ desde: FROM, hasta: TO, llegadaDesde: START, casos }, null, 1))
console.log(`\n→ ${path.relative(process.cwd(), out)}/casos.json`)
