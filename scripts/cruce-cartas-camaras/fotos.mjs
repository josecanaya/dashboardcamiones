/**
 * Fotos DSS de los camiones de sospechosos.json: hasta 3 pasadas por camión (las de zona más adentro
 * primero, solo cámaras de frente), la captura del DSS con la patente más parecida en ±4 min.
 *
 * Uso: node --env-file=.env scripts/cruce-cartas-camaras/fotos.mjs --desde 2026-09-29 [--hasta …]
 *  → reportes/cruce-cartas-camaras/<desde>_<hasta>/fotos/<patente>_<hhmm>_<camara>.jpg + fotos.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { arMs } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined)
const desde = arg('--desde')
const hasta = arg('--hasta') ?? desde
const dir = join(root, 'reportes/cruce-cartas-camaras', `${desde}_${hasta}`)
const fotosDir = join(dir, 'fotos')
mkdirSync(fotosDir, { recursive: true })
const dss = createDssLiveRouter({ projectRoot: root })
if (!dss.isDssConfigured()) throw new Error('DSS no configurado: correr con node --env-file=.env')

const MIN = 60_000
const NIVEL = { operativa: 3, acceso: 2, porteria: 1 }
const comunes = (a, b) => [...a].filter((ch, i) => b[i] === ch).length
const hhmmss = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const sospechosos = JSON.parse(readFileSync(join(dir, 'sospechosos.json'), 'utf8'))
const out = []
for (const s of sospechosos) {
  const pasadas = s.pasadas
    .filter((p) => !/Tr(as|aser)?$|Trasera|Tr$/.test(p.camara))
    .sort((a, b) => NIVEL[b.zona] - NIVEL[a.zona])
    .slice(0, 3)
  const rec = { patente: s.patente, fotos: [] }
  for (const p of pasadas) {
    const t = arMs(`${s.primera.slice(0, 10)}T${p.hora}:00`)
    try {
      const caps = await dss.listVehicleCaptures(p.camara, t - 4 * MIN, t + 4 * MIN)
      const best = caps.filter((c) => c.scenePicture).sort((a, b) => comunes(s.patente, b.plate) - comunes(s.patente, a.plate) || Math.abs(Date.parse(a.at) - t) - Math.abs(Date.parse(b.at) - t))[0]
      if (!best) {
        rec.fotos.push({ camara: p.camara, lugar: p.lugar, hora: p.hora, error: 'sin captura en DSS' })
        continue
      }
      const hora = hhmmss(best.at)
      const name = `${s.patente}_${hora.slice(11, 16).replace(':', '')}_${p.camara}.jpg`
      if (!existsSync(join(fotosDir, name))) writeFileSync(join(fotosDir, name), (await dss.fetchPicture(best.scenePicture)).buf)
      rec.fotos.push({ camara: p.camara, lugar: p.lugar, hora, leida: best.plate, tipo: best.vehicleCategory, color: best.vehicleColor, marca: best.vehicleBrand, archivo: `fotos/${name}` })
    } catch (e) {
      rec.fotos.push({ camara: p.camara, lugar: p.lugar, hora: p.hora, error: e instanceof Error ? e.message : String(e) })
    }
  }
  out.push(rec)
  console.log(`${s.patente.padEnd(8)} ${rec.fotos.map((f) => `${f.lugar} ${f.error ? '✗ ' + f.error : (f.leida || '(vacía)')}`).join(' · ')}`)
  writeFileSync(join(dir, 'fotos.json'), JSON.stringify(out, null, 1))
}
process.exit(0)
