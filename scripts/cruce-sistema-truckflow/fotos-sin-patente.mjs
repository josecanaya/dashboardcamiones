/**
 * Camiones del Sistema que las cámaras nunca leyeron: ¿pasaron SIN CHAPA (papel con el número)?
 *
 * Para cada visita se piden al DSS todas las capturas de Preingreso Ricardone (RicPreIngInFr y
 * RicPreIngEgFr) alrededor del ingreso del Sistema y se bajan las que el DSS registró SIN patente
 * (plateNo vacío o de menos de 4 caracteres): la cámara vio el vehículo pero no encontró una chapa.
 * Esas capturas no llegan a TruckFlow. El ingreso del Sistema cae ±2 min de la pasada
 * (hora real de cámara = ingreso − ~4 min); la ventana es de −10 a +2 min.
 *
 * Usa el DSS directo (no el server): node --env-file=.env ...
 * Uso: node --env-file=.env scripts/cruce-sistema-truckflow/fotos-sin-patente.mjs [--desde 2026-08-10]
 * Salida: reportes/cruce-sistema-truckflow/sin-patente/{index.json, fotos/<semana>/*.jpg}
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { OUT_DIR } from './lecturas.mjs'
import { arMs } from './sistema.mjs'

const args = process.argv.slice(2)
const DESDE = args.includes('--desde') ? args[args.indexOf('--desde') + 1] : '2026-08-10'
const MIN = 60_000
const DEVICES = ['RicPreIngInFr', 'RicPreIngEgFr']
const dss = createDssLiveRouter({ projectRoot: resolve(import.meta.dirname, '../..') })
if (!dss.isDssConfigured()) {
  console.error('DSS no configurado: correr con node --env-file=.env')
  process.exit(1)
}
const ROOT = join(OUT_DIR, 'sin-patente')
mkdirSync(ROOT, { recursive: true })
const J = JSON.parse(readFileSync(join(OUT_DIR, 'nunca-leidos-semanal.json'), 'utf8'))
const targets = []
for (const s of J.semanas) {
  if (s.semana.slice(0, 10) < DESDE) continue
  for (const c of s.camiones) {
    if (c.lecturasEnTodoElPeriodo) continue
    c.altas.forEach((alta, i) => targets.push({ semana: s.semana, patente: c.patente, acoplado: c.acoplado, planta: c.planta, producto: c.producto, tipo: c.tipo, alta, salida: c.salidas?.[i] ?? '' }))
  }
}
const idxFile = join(ROOT, 'index.json')
const done = new Map((existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : []).map((x) => [`${x.patente}|${x.alta}`, x]))
console.error(`visitas a revisar: ${targets.length}`)
const hhmmss = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const out = []
for (const tg of targets) {
  const key = `${tg.patente}|${tg.alta}`
  if (done.has(key) && !done.get(key).error) {
    out.push(done.get(key))
    continue
  }
  const ing = arMs(tg.alta.replace(' ', 'T'))
  const rec = { ...tg, capturas: 0, sinPatente: [] }
  try {
    const caps = []
    for (const dev of DEVICES) caps.push(...(await dss.listVehicleCaptures(dev, ing - 10 * MIN, ing + 2 * MIN)))
    rec.capturas = caps.length
    rec.patentesLeidas = caps.filter((c) => c.plate.length >= 4).map((c) => `${c.plate}@${hhmmss(c.at).slice(11)}`)
    // Sin chapa detectada: más cerca de la hora esperada de cámara (ingreso − 4 min) primero.
    const sin = caps.filter((c) => c.plate.length < 4 && c.scenePicture).sort((a, b) => Math.abs(Date.parse(a.at) - (ing - 4 * MIN)) - Math.abs(Date.parse(b.at) - (ing - 4 * MIN)))
    const dir = join(ROOT, 'fotos', tg.semana)
    mkdirSync(dir, { recursive: true })
    for (const c of sin.slice(0, 3)) {
      const hora = hhmmss(c.at)
      const f = { camara: c.device, hora, lectura: c.plate, tipo: c.vehicleCategory, color: c.vehicleColor, marca: c.vehicleBrand, difMin: Math.round((Date.parse(c.at) - ing) / MIN) }
      try {
        const { buf } = await dss.fetchPicture(c.scenePicture)
        const name = `${tg.patente}_${hora.slice(5).replace(/[- :]/g, '')}_${c.device}.jpg`
        writeFileSync(join(dir, name), buf)
        f.escena = `fotos/${tg.semana}/${name}`
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e)
      }
      rec.sinPatente.push(f)
    }
  } catch (e) {
    rec.error = e instanceof Error ? e.message : String(e)
  }
  out.push(rec)
  console.log(`${tg.alta} ${tg.patente.padEnd(8)} capturas ${rec.capturas} · sin chapa ${rec.sinPatente.length}${rec.error ? ' · ERROR ' + rec.error : ''}`)
  writeFileSync(idxFile, JSON.stringify(out, null, 1))
}
writeFileSync(idxFile, JSON.stringify(out, null, 1))
console.error(`listo: ${out.length} visitas, ${out.filter((x) => x.sinPatente.some((f) => f.escena)).length} con captura sin chapa`)
process.exit(0)
