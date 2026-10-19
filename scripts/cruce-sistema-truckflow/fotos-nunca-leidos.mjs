/**
 * Fotos de los camiones del Sistema cuya patente las cámaras NUNCA leyeron en todo el período:
 * se busca la pasada por Preingreso Ricardone más cercana a la hora de ingreso del Sistema y se
 * baja del DSS la foto de escena y el recorte de la patente.
 *
 * Candidatas: lecturas de RicPreIngInFr / RicPreIngEgFr entre 4 min antes y 3 min después del
 * ingreso (el alta cae ±2 min de la pasada), salvo las que son la patente exacta de otro camión
 * del Sistema en planta. Se bajan las 2 más cercanas.
 *
 * Requiere el server local (http://127.0.0.1:8787) con el DSS configurado.
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/fotos-nunca-leidos.mjs [--desde 2026-08-10]
 * Salida: reportes/cruce-sistema-truckflow/fotos-nunca-leidos/{index.json, <semana>/*.jpg}
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos, arMs } from './sistema.mjs'

const API = process.env.API || 'http://127.0.0.1:8787'
const args = process.argv.slice(2)
const DESDE = args.includes('--desde') ? args[args.indexOf('--desde') + 1] : '2026-08-10'
const MIN = 60_000
const POR_CAMION = 2
const DEVICES = new Set(['RicPreIngInFr', 'RicPreIngEgFr'])
const outRoot = join(OUT_DIR, 'fotos-nunca-leidos')
mkdirSync(outRoot, { recursive: true })

const J = JSON.parse(readFileSync(join(OUT_DIR, 'nunca-leidos-semanal.json'), 'utf8'))
const targets = []
for (const s of J.semanas) {
  if (s.semana.slice(0, 10) < DESDE) continue
  for (const c of s.camiones) {
    if (c.lecturasEnTodoElPeriodo) continue
    c.altas.forEach((alta, i) => targets.push({ semana: s.semana, ...c, alta, salida: c.salidas?.[i] ?? '' }))
  }
}
console.error(`camiones a buscar: ${targets.length}`)

const reads = loadReads().filter((r) => DEVICES.has(r.dev))
const movs = loadMovimientos()
const plateActive = new Map()
for (const m of movs) for (const p of [m.plate, m.acoplado]) if (p) (plateActive.get(p) ?? plateActive.set(p, []).get(p)).push(m)
const esDeOtro = (plate, t, self) =>
  (plateActive.get(plate) ?? []).some((m) => m.plate !== self && t >= m.ing - 60 * MIN && t <= (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN))

const idxFile = join(outRoot, 'index.json')
const prev = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : []
const done = new Map(prev.map((x) => [`${x.patente}|${x.alta}`, x]))
const getJson = async (url) => (await fetch(url)).json()

const out = []
for (const tg of targets) {
  const key = `${tg.patente}|${tg.alta}`
  const old = done.get(key)
  if (old && old.fotos.some((f) => f.escena) && !old.fotos.some((f) => f.error)) {
    out.push(old)
    continue
  }
  const ing = arMs(tg.alta.replace(' ', 'T'))
  const cand = reads
    .filter((r) => r.t >= ing - 4 * MIN && r.t <= ing + 3 * MIN && !(r.plate && esDeOtro(r.plate, r.t, tg.patente)))
    .sort((a, b) => Math.abs(a.t - ing) - Math.abs(b.t - ing))
  // Una pasada llega repetida (evento + alertas): se queda con una por segundo y cámara.
  const pasadas = []
  for (const r of cand) if (!pasadas.some((p) => p.dev === r.dev && Math.abs(p.t - r.t) < 3000)) pasadas.push(r)
  const rec = { ...tg, fotos: [] }
  const dir = join(outRoot, tg.semana)
  mkdirSync(dir, { recursive: true })
  for (const r of pasadas.slice(0, POR_CAMION)) {
    const at = new Date(r.t).toISOString()
    const foto = { camara: r.dev, lecturaTruckflow: r.plate || '(vacía)', alerta: r.code, horaCamara: new Date(r.t - 240_000 - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' '), difSeg: Math.round((r.t - 240_000 - ing) / 1000) }
    try {
      const f = await getJson(`${API}/api/truckflow/camera-captures/find?device=${r.dev}&at=${encodeURIComponent(at)}&plate=${encodeURIComponent(r.plate)}`)
      if (f.error) foto.error = f.error
      if (f.found) {
        foto.lecturaDss = f.capture.plate
        foto.confianza = f.capture.confidence
        foto.color = f.capture.vehicleColor
        foto.marca = f.capture.vehicleBrand
        foto.tipo = f.capture.vehicleCategory
        const hh = foto.horaCamara.slice(5, 19).replace(/[- :]/g, '')
        for (const [kind, k] of [['sceneFile', 'escena'], ['plateFile', 'patente']]) {
          const file = f.capture[kind]
          if (!file) continue
          const img = await fetch(`${API}/api/truckflow/camera-captures/image?file=${file}`)
          if (!img.ok) {
            foto.error = `foto ${k}: HTTP ${img.status}`
            continue
          }
          const name = `${tg.patente}_${hh}_${r.dev}_${k}.jpg`
          writeFileSync(join(dir, name), Buffer.from(await img.arrayBuffer()))
          foto[k] = `${tg.semana}/${name}`
        }
      } else if (!foto.error) foto.error = 'el DSS no tiene esa captura'
    } catch (e) {
      foto.error = e instanceof Error ? e.message : String(e)
    }
    rec.fotos.push(foto)
  }
  if (!pasadas.length) rec.sinPasada = true
  out.push(rec)
  console.log(`${tg.alta} ${tg.patente.padEnd(8)} ${rec.sinPasada ? 'sin pasada en Preingreso' : rec.fotos.map((f) => `${f.lecturaTruckflow}${f.escena ? ' ✓' : ' ✗ ' + (f.error ?? '')}`).join(' · ')}`)
  writeFileSync(idxFile, JSON.stringify(out, null, 1))
}
writeFileSync(idxFile, JSON.stringify(out, null, 1))
console.error(`listo: ${out.length} camiones, ${out.filter((x) => x.fotos.some((f) => f.escena)).length} con foto`)
