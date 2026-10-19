/**
 * Segunda pasada para camiones sin chapa / con papel: ventanas por punto ancladas en los horarios del
 * Sistema de camiones (calado y salida del Excel, ingreso), con los desfases medidos en desfases-anclas.json
 * (p05−2 a p95+2 min del ancla más estrecha, tope 45 min). En volcables se pide solo la cámara de su
 * plataforma (VOLCABLE_PTO_3 → SLZVolcableC3).
 *
 * Baja TODAS las capturas del DSS del intervalo que no sean otra patente válida (vacías, cortadas, el logo
 * del camión, su patente o una parecida), hasta 12 por punto, más cerca del centro primero.
 *
 * Uso: node --env-file=.env --max-old-space-size=8192 scripts/cruce-sistema-truckflow/recorrido-anclas.mjs PATENTE…
 * Salida: reportes/cruce-sistema-truckflow/recorridos/<patente>/<AAAAMMDDHHMM>/anclas/{anclas.json, *.jpg}
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { OUT_DIR } from './lecturas.mjs'
import { loadMovimientos } from './sistema.mjs'
import { camaraPlataforma } from './desfases-anclas.mjs'

const args = process.argv.slice(2)
const PATENTES = args.filter((a) => /^[A-Z0-9]{6,7}$/.test(a))
const MIN = 60_000
const POR_PUNTO = 12
const D = JSON.parse(readFileSync(join(OUT_DIR, 'desfases-anclas.json'), 'utf8'))
const DEVS = {
  'Ingreso Ricardone': ['RicIngCamFrente'],
  Preingreso: ['RicPreIngInFr'],
  'Calada Ricardone': ['RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05', 'RicCal06'],
  'Balanza ingreso Ricardone': ['RicB1Ingreso', 'RicB2Ingreso', 'RicB3Ingreso'],
  'Playa 3': ['RicS6Playa3'],
  'Balanza egreso Ricardone': ['RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso'],
  'Egreso Ricardone': ['RicEgrCamFrente'],
  'Ingreso puerto': ['SLZIngCamFrente'],
  'Balanza ingreso puerto': ['SLZBalIngFte'],
  'Descarga plataforma': null,
  'Balanza egreso puerto': ['SLZBalSC1Fte', 'SLZBalSC2Fte'],
  'Salida puerto': ['SLZSalidaC1Fte', 'SLZSalidaC2Fte'],
}
/** Puntos que recorre cada destino. */
const RUTA = {
  TERMINAL_EMBARQUE: ['Ingreso Ricardone', 'Preingreso', 'Calada Ricardone', 'Egreso Ricardone', 'Ingreso puerto', 'Balanza ingreso puerto', 'Descarga plataforma', 'Balanza egreso puerto', 'Salida puerto'],
  RICARDONE: ['Ingreso Ricardone', 'Preingreso', 'Calada Ricardone', 'Balanza ingreso Ricardone', 'Playa 3', 'Descarga plataforma', 'Balanza egreso Ricardone', 'Egreso Ricardone'],
}
const VALID = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2})$/
const hora = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const CONF = new Set(['0O', '0D', '8B', '1I', '5S', '2Z', '6G', '4A', 'DB', '80', 'MN', 'HM', 'UV', 'IT', 'CG'].flatMap((p) => [p, p[1] + p[0]]))
function parecido(r, p) {
  if (!r || r.length < 4) return 0
  let prev = Array.from({ length: p.length + 1 }, (_, j) => j * 0.6)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i * 0.6]
    for (let j = 1; j <= p.length; j++) cur[j] = Math.min(prev[j - 1] + (r[i - 1] === p[j - 1] ? 0 : CONF.has(r[i - 1] + p[j - 1]) ? 0.3 : 1), prev[j] + 0.6, cur[j - 1] + 0.6)
    prev = cur
  }
  return Math.max(0, 1 - prev[p.length] / p.length)
}
const CAMIONES = Object.fromEntries(JSON.parse(readFileSync(join(OUT_DIR, 'fichas-sin-chapa', 'camiones.json'), 'utf8')).map((c) => [c.patente, c]))

const dss = createDssLiveRouter({ projectRoot: resolve(import.meta.dirname, '../..') })
if (!dss.isDssConfigured()) throw new Error('DSS no configurado: correr con node --env-file=.env')
async function listar(devs, a, b) {
  const out = []
  for (const dev of devs)
    for (let page = 1; page < 20; page++) {
      let caps = []
      try {
        caps = await dss.listVehicleCaptures(dev, a, b, 100, page)
      } catch (e) {
        console.error(`DSS ${dev}: ${e instanceof Error ? e.message : e}`)
      }
      const nuevas = caps.filter((c) => !out.some((o) => o.camara === dev && o.at === c.at && o.plate === c.plate))
      out.push(...nuevas.map((c) => ({ ...c, camara: dev, t: Date.parse(c.at) })))
      if (caps.length < 100 || !nuevas.length) break
    }
  return out
}

const movs = loadMovimientos()
for (const m of movs.filter((x) => PATENTES.includes(x.plate))) {
  const tag = hora(m.ing).replace(/[- :]/g, '').slice(0, 12)
  const dir = join(OUT_DIR, 'recorridos', m.plate, tag, 'anclas')
  mkdirSync(dir, { recursive: true })
  const logos = CAMIONES[m.plate]?.logos ?? []
  // Otras patentes del Sistema en planta en esa visita: una lectura parecida a otra es de ese camión.
  const fin = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
  const otras = [...new Set(movs.filter((o) => o.plate !== m.plate && o.ing <= fin && (Number.isFinite(o.sal) ? o.sal : o.ing + 14 * 60 * MIN) >= m.ing - 60 * MIN).map((o) => o.plate))]
  const deOtro = (lec) => (lec && lec.length >= 4 ? Math.max(0, ...otras.map((o) => parecido(lec, o))) : 0)
  const anclas = { ing: m.ing, calado: m.calado, sal: m.sal }
  const res = { patente: m.plate, ingreso: hora(m.ing), calado: Number.isFinite(m.calado) ? hora(m.calado) : '', salida: Number.isFinite(m.sal) ? hora(m.sal) : '', plataforma: m.plataforma, producto: m.producto, planta: m.planta, puntos: [] }
  for (const punto of RUTA[m.planta] ?? []) {
    const devs = DEVS[punto] ?? camaraPlataforma(m.plataforma)
    if (!devs) continue
    let best = null
    for (const [k, a] of Object.entries(anclas)) {
      const o = D[`${m.planta}|${punto}|${k}`]
      if (!o || !Number.isFinite(a)) continue
      const ancho = o.p95 - o.p05
      if (!best || ancho < best.ancho) best = { k, a, o, ancho }
    }
    if (!best) continue
    let a = best.a + (best.o.p05 - 2) * MIN
    let b = best.a + (best.o.p95 + 2) * MIN
    const c = best.a + best.o.p50 * MIN
    if (b - a > 45 * MIN) (a = Math.max(a, c - 22 * MIN)), (b = Math.min(b, c + 23 * MIN))
    const caps = (await listar(devs, a, b)).filter((x) => x.plate === m.plate || parecido(x.plate, m.plate) >= 0.6 || logos.some((l) => x.plate.includes(l)) || (!VALID.test(x.plate) && deOtro(x.plate) < 0.7))
    const orden = (x) => (x.plate === m.plate ? -3 : parecido(x.plate, m.plate) >= 0.6 ? -2 : logos.some((l) => x.plate.includes(l)) ? -1 : 0) * 1e12 + Math.abs(x.t - c)
    caps.sort((x, y) => orden(x) - orden(y))
    const cand = []
    for (const x of caps.slice(0, POR_PUNTO)) {
      const f = { camara: x.camara, hora: hora(x.t), lectura: x.plate, marca: x.vehicleBrand, color: x.vehicleColor, tipo: x.vehicleCategory, foto: null }
      if (x.scenePicture) {
        const name = `${hora(x.t).slice(11).replace(/:/g, '')}_${x.camara}_${x.plate || 'vacia'}.jpg`
        try {
          if (!existsSync(join(dir, name))) writeFileSync(join(dir, name), (await dss.fetchPicture(x.scenePicture)).buf)
          f.foto = name
        } catch (e) {
          f.error = e instanceof Error ? e.message : String(e)
        }
      }
      cand.push(f)
    }
    res.puntos.push({ punto, ancla: best.k, ventana: [hora(a).slice(11), hora(b).slice(11)], centro: hora(c).slice(11), camaras: devs, total: caps.length, candidatas: cand })
  }
  writeFileSync(join(dir, 'anclas.json'), JSON.stringify(res, null, 1))
  console.log(`${m.plate} ${res.ingreso.slice(0, 16)}: ${res.puntos.map((p) => `${p.punto} ${p.candidatas.length}`).join(' · ')}`)
}
process.exit(0)
