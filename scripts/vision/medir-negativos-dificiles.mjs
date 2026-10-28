/**
 * Negativos difíciles para Claude Opus: pares de fotos de camiones DISTINTOS (patentes confirmadas
 * que no se parecen) que la base vectorial ve más parecidos, sobre todo en la misma cámara
 * (dos Mercedes blancos en la misma balanza). Lo correcto es «ninguno».
 *
 *   node scripts/vision/medir-negativos-dificiles.mjs [--n 20] [--conc 3]
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { decideByImage } from '../../server/live/vision/claudeVision.mjs'
import { cosine, embedImage } from '../../server/live/vision/vectorBase.mjs'
import { plateSimilarity } from '../../server/plantState/plateIdentification.mjs'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const N = Number(arg('n', 20))
const CONC = Number(arg('conc', 3))

const photos = []
for (const f of execSync('find data/identification-evidence -name manifest.json').toString().trim().split('\n')) {
  const m = JSON.parse(readFileSync(f, 'utf8'))
  if (m.decision?.action !== 'confirm') continue
  const dir = path.dirname(f)
  const realOf = { captura: m.decision.plate, referencia: m.photos?.referencia?.plate === m.decision.plate ? m.decision.plate : null }
  for (const role of ['captura', 'referencia']) {
    const s = m.saved?.[role]
    if (!realOf[role] || !s?.sceneFile || !existsSync(path.join(dir, s.sceneFile))) continue
    photos.push({ plate: realOf[role], device: m.photos[role]?.device, scene: path.join(dir, s.sceneFile), plateCrop: s.plateFile ? path.join(dir, s.plateFile) : null })
  }
}
for (const p of photos) p.cls = (await embedImage(p.scene)).cls
const neg = []
for (let i = 0; i < photos.length; i++) {
  for (let j = i + 1; j < photos.length; j++) {
    const a = photos[i]
    const b = photos[j]
    if (plateSimilarity(a.plate, b.plate) >= 0.6) continue
    neg.push({ a, b, sim: cosine(a.cls, b.cls), sameCamera: a.device === b.device })
  }
}
// Una vez por patente, los más parecidos primero.
neg.sort((x, y) => y.sim - x.sim)
const used = new Set()
const sample = []
for (const n of neg) {
  if (sample.length >= N) break
  if (used.has(n.a.plate) || used.has(n.b.plate)) continue
  used.add(n.a.plate)
  used.add(n.b.plate)
  sample.push(n)
}
console.log(`${photos.length} fotos; ${sample.length} negativos difíciles (${sample.filter((s) => s.sameCamera).length} en la misma cámara), parecido vectorial ${sample.at(-1)?.sim.toFixed(3)}–${sample[0]?.sim.toFixed(3)}`)

const results = []
let next = 0
async function worker() {
  while (next < sample.length) {
    const s = sample[next++]
    try {
      const r = await decideByImage({ scene: s.a.scene, plate: s.a.plateCrop, label: s.a.device }, [{ id: s.b.plate, images: [{ scene: s.b.scene, plate: s.b.plateCrop, label: s.b.device }] }])
      const ok = r.choice === null
      results.push({ a: s.a.plate, b: s.b.plate, sim: s.sim, sameCamera: s.sameCamera, ok, confidence: r.confidence, reason: r.reason, costUsd: r.costUsd })
      console.log(`${ok ? 'ok ' : 'MAL'} ${s.a.plate} vs ${s.b.plate} (vector ${s.sim.toFixed(2)}${s.sameCamera ? ', misma cámara' : ''}) → ${r.choice ? 'mismo' : 'otro'} ${r.confidence} · ${r.reason}`)
    } catch (e) {
      results.push({ a: s.a.plate, b: s.b.plate, error: e instanceof Error ? e.message : String(e) })
      console.log(`ERR ${s.a.plate} vs ${s.b.plate}: ${e instanceof Error ? e.message : e}`)
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
const done = results.filter((r) => !r.error)
const summary = {
  medidos: done.length,
  correctos: `${done.filter((r) => r.ok).length}/${done.length}`,
  // Errores que se aplicarían solos con cada umbral.
  erroresAutomaticos: [0.7, 0.8, 0.9].map((th) => ({ umbral: th, errores: done.filter((r) => !r.ok && r.confidence >= th).length })),
  costoUsd: done.reduce((s, r) => s + (r.costUsd ?? 0), 0),
}
console.log(summary)
mkdirSync('outputs/vision', { recursive: true })
writeFileSync(`outputs/vision/negativos-dificiles-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify({ summary, results }, null, 2))
