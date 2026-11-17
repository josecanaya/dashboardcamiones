// Arma la entrada de scripts/seguridad-sin-registro/fotos.mjs para las visitas con huella de carga
// sin sistema (mismo-patron-CXV575.json): una lectura por cámara por visita (la primera), hora feed.
// Uso: node scripts/cruce-sistema-truckflow/fotos-entrada-huella.mjs <candidatos.json> <salida.json>
import { createReadStream, readFileSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { CACHE } from './lecturas.mjs'
import { arMs } from './sistema.mjs'

const [inFile, outFile] = process.argv.slice(2)
const cands = JSON.parse(readFileSync(inFile, 'utf8'))
const visitas = cands.flatMap((c) =>
  c.huellas.map((h) => ({ plate: c.p, dia: h.dia, t0: arMs(`${h.dia}T${h.primera}`), t1: arMs(`${h.dia}T${h.ultima}`) + 59_000 }))
)
const dias = new Set(visitas.map((v) => v.dia))
const plates = new Set(visitas.map((v) => v.plate))
const reads = []
await new Promise((ok) => {
  const rl = createInterface({ input: createReadStream(CACHE) })
  rl.on('line', (l) => {
    if (!dias.has(l.slice(8, 18))) return
    for (const [t, dev, plate] of JSON.parse(l).reads) if (plates.has(plate) && /^(Ric|SLZ)/.test(dev) && !/(Tr|Tras|Trasera)$/.test(dev)) reads.push({ t, dev, plate })
  })
  rl.on('close', ok)
})
const out = visitas.map((v) => {
  const rs = reads.filter((r) => r.plate === v.plate && r.t >= v.t0 && r.t <= v.t1).sort((a, b) => a.t - b.t)
  const porCam = new Map()
  for (const r of rs) if (!porCam.has(r.dev)) porCam.set(r.dev, r)
  return { dia: v.dia, plate: v.plate, pasos: [...porCam.values()].sort((a, b) => a.t - b.t).map((r) => ({ at: new Date(r.t).toISOString(), device: r.dev })) }
})
writeFileSync(outFile, JSON.stringify(out, null, 1))
console.log(out.length, 'visitas,', out.reduce((s, v) => s + v.pasos.length, 0), 'pasos')
