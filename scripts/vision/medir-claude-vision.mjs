/**
 * Mide a Claude Opus comparando imagen contra imagen con las decisiones de operaciones que guardaron
 * fotos (data/identification-evidence): captura + referencia, y lo que decidió el operador.
 *   mismo vehículo  = confirmó la patente de la referencia
 *   otro vehículo   = confirmó otra patente que no se parece a la de la referencia
 * Si confirmó otra patente parecida (ESI808 con referencia EST808) suele ser el mismo camión con la
 * referencia mal leída: no sirve de etiqueta y queda afuera.
 *
 *   node scripts/vision/medir-claude-vision.mjs [--n 40] [--conc 3] [--model opus]
 * Resultado en outputs/vision/medicion-<fecha>.json
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { decideByImage } from '../../server/live/vision/claudeVision.mjs'
import { plateSimilarity } from '../../server/plantState/plateIdentification.mjs'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const N = Number(arg('n', 40))
const CONC = Number(arg('conc', 3))
const MODEL = arg('model', 'opus')
const ROOT = 'data/identification-evidence'

const cases = []
for (const f of execSync(`find ${ROOT} -name manifest.json`).toString().trim().split('\n')) {
  const m = JSON.parse(readFileSync(f, 'utf8'))
  const dir = path.dirname(f)
  const ref = m.photos?.referencia
  if (m.decision?.action !== 'confirm' || !ref?.plate || !m.saved?.captura || !m.saved?.referencia) continue
  const img = (role, kind) => (m.saved[role]?.[kind] && existsSync(path.join(dir, m.saved[role][kind])) ? path.join(dir, m.saved[role][kind]) : null)
  cases.push({
    dir, site: m.site, fragmentKey: m.fragmentKey, read: m.photos.captura?.plate, refPlate: ref.plate, decided: m.decision.plate,
    same: ref.plate === m.decision.plate,
    ambiguous: ref.plate !== m.decision.plate && plateSimilarity(ref.plate, m.decision.plate) >= 0.6,
    capture: { scene: img('captura', 'sceneFile'), plate: img('captura', 'plateFile'), label: m.photos.captura?.device },
    reference: { scene: img('referencia', 'sceneFile'), plate: img('referencia', 'plateFile'), label: ref.device },
  })
}
const ambiguous = cases.filter((c) => c.ambiguous).length
cases.splice(0, cases.length, ...cases.filter((c) => !c.ambiguous))
console.log(`${ambiguous} casos con la referencia mal leída quedan afuera`)
// Muestra balanceada: todos los «otro vehículo» que entren y el resto «mismo».
const diff = cases.filter((c) => !c.same)
const same = cases.filter((c) => c.same)
const sample = [...diff.slice(0, Math.ceil(N / 2)), ...same.slice(0, N - Math.min(diff.length, Math.ceil(N / 2)))]
console.log(`${cases.length} casos con captura y referencia (${same.length} mismo, ${diff.length} otro); se miden ${sample.length} con ${MODEL}`)

const results = []
let next = 0
async function worker() {
  while (next < sample.length) {
    const c = sample[next++]
    const t0 = Date.now()
    try {
      const r = await decideByImage(c.capture, [{ id: c.refPlate, images: [c.reference] }], { model: MODEL })
      const saysSame = r.choice === c.refPlate
      results.push({ ...c, saysSame, confidence: r.confidence, reason: r.reason, costUsd: r.costUsd, ms: Date.now() - t0, ok: saysSame === c.same })
      console.log(`${saysSame === c.same ? 'ok ' : 'MAL'} ${c.read} vs ${c.refPlate} (op: ${c.same ? 'mismo' : 'otro'}) → ${saysSame ? 'mismo' : 'otro'} ${r.confidence} · ${r.reason}`)
    } catch (e) {
      results.push({ ...c, error: e instanceof Error ? e.message : String(e) })
      console.log(`ERR ${c.read} vs ${c.refPlate}: ${e instanceof Error ? e.message : e}`)
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker))

const done = results.filter((r) => !r.error)
const rate = (xs) => (xs.length ? `${xs.filter((r) => r.ok).length}/${xs.length}` : '-')
const summary = {
  model: MODEL, at: new Date().toISOString(), medidos: done.length, errores: results.length - done.length,
  aciertos: rate(done), mismo: rate(done.filter((r) => r.same)), otro: rate(done.filter((r) => !r.same)),
  // Lo que se aplicaría solo: dice «mismo» con confianza alta.
  automaticas: [0.7, 0.8, 0.9].map((th) => {
    const auto = done.filter((r) => r.saysSame && r.confidence >= th)
    return { umbral: th, decide: auto.length, errores: auto.filter((r) => !r.same).length }
  }),
  costoUsd: done.reduce((s, r) => s + (r.costUsd ?? 0), 0),
  segundosPromedio: Math.round(done.reduce((s, r) => s + r.ms, 0) / Math.max(1, done.length) / 1000),
}
console.log(summary)
mkdirSync('outputs/vision', { recursive: true })
const out = `outputs/vision/medicion-${summary.at.slice(0, 16).replace(/[:T]/g, '-')}.json`
writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
console.log(`→ ${out}`)
