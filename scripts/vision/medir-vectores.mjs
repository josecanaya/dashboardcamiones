/**
 * ¿Separa la base vectorial «mismo camión» de «otro»? Mismos pares que medir-claude-vision.mjs
 * (data/identification-evidence), tres variantes: imagen entera, parches sin pesar y parches pesados
 * contra el fondo de cada cámara (fondo armado con todas las fotos guardadas de esa cámara).
 *
 *   node scripts/vision/medir-vectores.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cameraBackground, cosine, embedImage, vehicleVector } from '../../server/live/vision/vectorBase.mjs'
import { plateSimilarity } from '../../server/plantState/plateIdentification.mjs'

const photos = new Map() // archivo → { device, emb }
const pairs = []
for (const f of execSync('find data/identification-evidence -name manifest.json').toString().trim().split('\n')) {
  const m = JSON.parse(readFileSync(f, 'utf8'))
  const dir = path.dirname(f)
  // Patente real de cada foto: la captura es de la confirmada; la referencia, de la suya si coincide.
  const realOf = { captura: m.decision?.action === 'confirm' ? m.decision.plate : null, referencia: m.photos?.referencia?.plate === m.decision?.plate ? m.decision.plate : null }
  for (const role of ['captura', 'referencia']) {
    const file = m.saved?.[role]?.sceneFile && path.join(dir, m.saved[role].sceneFile)
    if (file && existsSync(file)) photos.set(file, { device: m.photos[role]?.device ?? '?', plate: realOf[role] })
  }
  const ref = m.photos?.referencia
  if (m.decision?.action !== 'confirm' || !ref?.plate || !m.saved?.captura?.sceneFile || !m.saved?.referencia?.sceneFile) continue
  const same = ref.plate === m.decision.plate
  if (!same && plateSimilarity(ref.plate, m.decision.plate) >= 0.6) continue
  pairs.push({ a: path.join(dir, m.saved.captura.sceneFile), b: path.join(dir, m.saved.referencia.sceneFile), same, sameCamera: m.photos.captura?.device === ref.device })
}
// Negativos: fotos de dos camiones distintos (patentes confirmadas que no se parecen), misma cámara y distinta.
const known = [...photos].filter(([, p]) => p.plate)
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
for (const want of [true, false]) {
  let tries = 0, added = 0
  while (added < 150 && tries++ < 20000) {
    const [fa, pa] = known[Math.floor(rnd() * known.length)]
    const [fb, pb] = known[Math.floor(rnd() * known.length)]
    if (fa === fb || (pa.device === pb.device) !== want || plateSimilarity(pa.plate, pb.plate) >= 0.6) continue
    pairs.push({ a: fa, b: fb, same: false, sameCamera: want })
    added++
  }
}
console.log(`${photos.size} fotos, ${pairs.length} pares (${pairs.filter((p) => p.same).length} mismo)`)
let i = 0
for (const [file, p] of photos) {
  p.emb = await embedImage(file)
  if (++i % 50 === 0) console.log(`  ${i}/${photos.size}`)
}
const byDevice = new Map()
for (const p of photos.values()) byDevice.set(p.device, [...(byDevice.get(p.device) ?? []), p.emb.patches])
const bg = new Map([...byDevice].filter(([, l]) => l.length >= 5).map(([d, l]) => [d, cameraBackground(l)]))
console.log(`cámaras con fondo (≥5 fotos): ${bg.size} de ${byDevice.size}`)

/** AUC: probabilidad de que un par «mismo» puntúe más que uno «otro». */
function auc(scores) {
  const pos = scores.filter((s) => s.same).map((s) => s.v)
  const neg = scores.filter((s) => !s.same).map((s) => s.v)
  let w = 0
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0
  return pos.length && neg.length ? w / (pos.length * neg.length) : NaN
}
const variants = {
  imagen_entera: (pa, pb) => cosine(pa.emb.cls, pb.emb.cls),
  parches: (pa, pb) => cosine(vehicleVector(pa.emb.patches), vehicleVector(pb.emb.patches)),
  parches_sin_fondo: (pa, pb) => cosine(vehicleVector(pa.emb.patches, bg.get(pa.device)), vehicleVector(pb.emb.patches, bg.get(pb.device))),
}
for (const [name, fn] of Object.entries(variants)) {
  const scores = pairs.map((p) => ({ same: p.same, sameCamera: p.sameCamera, v: fn(photos.get(p.a), photos.get(p.b)) }))
  const mean = (xs) => (xs.length ? (xs.reduce((s, x) => s + x.v, 0) / xs.length).toFixed(3) : '-')
  console.log(`${name.padEnd(18)} AUC ${auc(scores).toFixed(3)} · misma cámara ${auc(scores.filter((s) => s.sameCamera)).toFixed(3)} · distinta ${auc(scores.filter((s) => !s.sameCamera)).toFixed(3)} · media mismo ${mean(scores.filter((s) => s.same))} / otro ${mean(scores.filter((s) => !s.same))}`)
}
