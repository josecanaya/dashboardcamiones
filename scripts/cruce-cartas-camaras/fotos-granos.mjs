/**
 * Una foto DSS por camión de granos sin carta (granos-revisados.json, clases sospechoso y
 * grano_con_sistema_sin_carta): la primera pasada por calada/volcable, captura con la patente más parecida.
 *
 * Uso: node --env-file=.env scripts/cruce-cartas-camaras/fotos-granos.mjs 2026-09-28_2026-10-04 …
 *  → <carpeta>/fotos-granos/<patente>_<MMDD-hhmm>_<camara>.jpg + fotos-granos.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { arMs } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const dss = createDssLiveRouter({ projectRoot: root })
if (!dss.isDssConfigured()) throw new Error('DSS no configurado: correr con node --env-file=.env')
const MIN = 60_000
const comunes = (a, b) => [...a].filter((ch, i) => b[i] === ch).length
const local = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')

for (const w of process.argv.slice(2)) {
  const dir = join(root, 'reportes/cruce-cartas-camaras', w)
  const fdir = join(dir, 'fotos-granos')
  mkdirSync(fdir, { recursive: true })
  const granos = JSON.parse(readFileSync(join(dir, 'granos-revisados.json'), 'utf8')).filter((g) => ['sospechoso', 'grano_con_sistema_sin_carta'].includes(g.clase))
  const out = []
  for (const g of granos) {
    // enGrano trae «hh:mm cámara» del período; el día sale de la visita (si la hora es menor que la de
    // entrada, la pasada fue al día siguiente).
    const [hora, camara] = g.enGrano[0].split(' ')
    let dia = g.visita.desde.slice(0, 10)
    if (hora < g.visita.desde.slice(11)) dia = g.visita.hasta.slice(0, 10)
    const t = arMs(`${dia}T${hora}:00`)
    const rec = { ...g, foto: null }
    try {
      const caps = await dss.listVehicleCaptures(camara, t - 6 * MIN, t + 3 * MIN)
      const best = caps.filter((c) => c.scenePicture).sort((a, b) => comunes(g.patente, b.plate) - comunes(g.patente, a.plate))[0]
      if (best) {
        const h = local(best.at)
        const name = `${g.patente}_${h.slice(5, 16).replace(/[- :]/g, '')}_${camara}.jpg`
        if (!existsSync(join(fdir, name))) writeFileSync(join(fdir, name), (await dss.fetchPicture(best.scenePicture)).buf)
        rec.foto = { archivo: `fotos-granos/${name}`, hora: h, camara, leida: best.plate }
      }
    } catch (e) {
      rec.error = e instanceof Error ? e.message : String(e)
    }
    out.push(rec)
    console.log(`${w} ${g.patente.padEnd(8)} ${rec.foto ? rec.foto.hora + ' ' + camara + ' leída ' + rec.foto.leida : '✗ ' + (rec.error ?? 'sin captura')}`)
    writeFileSync(join(dir, 'fotos-granos.json'), JSON.stringify(out, null, 1))
  }
}
process.exit(0)
