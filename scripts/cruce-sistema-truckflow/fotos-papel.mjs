/**
 * Fotos de los camiones candidatos a «patente en papel»: patentes del Sistema que ninguna cámara de
 * acceso leyó nunca, pero que alguna cámara alta (calada, Celda 16, volcables) sí leyó. Caso
 * confirmado: KTH925 (29/07), portapatente vacío y papel «KTH925» en el parabrisas.
 *
 * Por patente se baja del DSS (vía el server local) la foto de escena de hasta 2 lecturas, la más
 * reciente primero, para ver si lleva chapa o un papel.
 *
 * Requiere: papel-parabrisas.mjs corrido antes y el server local con DSS.
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/fotos-papel.mjs [--desde 2026-07-01]
 * Salida: reportes/cruce-sistema-truckflow/papel/{index.json, <patente>/*.jpg}
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'

const API = process.env.API || 'http://127.0.0.1:8787'
const args = process.argv.slice(2)
const DESDE = args.includes('--desde') ? args[args.indexOf('--desde') + 1] : '2026-07-01'
const ROOT = join(OUT_DIR, 'papel')
mkdirSync(ROOT, { recursive: true })
const cand = JSON.parse(readFileSync(join(OUT_DIR, 'papel-parabrisas.json'), 'utf8')).filter((x) => x.lecturasEnAccesos === 0 && x.visitas.some((v) => v.ingreso.slice(0, 10) >= DESDE))
console.error(`patentes candidatas: ${cand.length}`)
const want = new Set(cand.map((x) => x.patente))
const byPlate = new Map()
for (const r of loadReads()) if (want.has(r.plate)) (byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)
const hora = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const idxFile = join(ROOT, 'index.json')
const prev = new Map((existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : []).map((x) => [x.patente, x]))
const out = []
for (const c of cand) {
  const old = prev.get(c.patente)
  if (old?.fotos?.some((f) => f.escena)) {
    out.push({ ...old, visitas: c.visitas })
    continue
  }
  // Una lectura por cámara y pasada, la más reciente primero (eventos antes que alertas).
  const rs = (byPlate.get(c.patente) ?? []).sort((a, b) => b.t - a.t || (a.src === 'e' ? -1 : 1))
  const pas = []
  for (const r of rs) if (!pas.some((p) => p.dev === r.dev && Math.abs(p.t - r.t) < 120_000)) pas.push(r)
  const rec = { patente: c.patente, visitas: c.visitas, camaras: c.camarasQueLaLeen, fotos: [] }
  mkdirSync(join(ROOT, c.patente), { recursive: true })
  for (const r of pas.slice(0, 2)) {
    const f = { camara: r.dev, horaCamara: hora(r.t - 240_000) }
    try {
      const j = await (await fetch(`${API}/api/truckflow/camera-captures/find?device=${r.dev}&at=${encodeURIComponent(new Date(r.t).toISOString())}&plate=${c.patente}`)).json()
      if (j.found) {
        Object.assign(f, { lecturaDss: j.capture.plate, confianza: j.capture.confidence, marca: j.capture.vehicleBrand, color: j.capture.vehicleColor, tipo: j.capture.vehicleCategory })
        const img = await fetch(`${API}/api/truckflow/camera-captures/image?file=${j.capture.sceneFile}`)
        if (img.ok) {
          const name = `${r.dev}_${f.horaCamara.slice(5).replace(/[- :]/g, '')}.jpg`
          writeFileSync(join(ROOT, c.patente, name), Buffer.from(await img.arrayBuffer()))
          f.escena = `${c.patente}/${name}`
        } else f.error = `foto HTTP ${img.status}`
      } else f.error = j.error || 'el DSS no tiene esa captura'
    } catch (e) {
      f.error = e instanceof Error ? e.message : String(e)
    }
    rec.fotos.push(f)
  }
  out.push(rec)
  console.log(`${c.patente.padEnd(8)} ${rec.fotos.map((f) => `${f.camara} ${f.escena ? '✓' : '✗ ' + f.error}`).join(' · ')}`)
  writeFileSync(idxFile, JSON.stringify(out, null, 1))
}
writeFileSync(idxFile, JSON.stringify(out, null, 1))
console.error(`listo: ${out.length} patentes, ${out.filter((x) => x.fotos.some((f) => f.escena)).length} con foto`)
