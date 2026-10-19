/**
 * Recorrido por cámaras de camiones sin chapa (o con la patente en papel), usando a sus vecinos.
 *
 * El camión sin chapa entra en fila con otros que sí se leen. En Preingreso se toman los camiones
 * del Sistema leídos justo antes y justo después de él (misma planta de destino y producto), y en
 * cada punto del circuito el camión sin chapa tiene que pasar entre las lecturas de esos vecinos.
 * En ese intervalo se piden al DSS las capturas sin patente válida (vacía, cortada o el logo del
 * camión) o con su patente exacta (papel en el parabrisas), y se bajan sus fotos para elegir a ojo.
 *
 * Ancla en Preingreso: la captura sin patente de RicPreIngInFr más cercana al ingreso del Sistema
 * − 4,5 min (la cámara pasa ~4–5 min antes del alta), o la indicada con --ancla PATENTE=HH:MM:SS.
 *
 * Uso: node --env-file=.env --max-old-space-size=8192 scripts/cruce-sistema-truckflow/recorrido-dss.mjs PATENTE… [--desde 2026-07-01] [--ancla AB688RB=16:33:55]
 * Salida: reportes/cruce-sistema-truckflow/recorridos/<patente>/<AAAAMMDDHHMM>/{recorrido.json, *.jpg}
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos } from './sistema.mjs'

const args = process.argv.slice(2)
const flag = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []))
const DESDE = flag('--desde')[0] ?? '2026-07-01'
const ANCLAS = Object.fromEntries(flag('--ancla').map((x) => x.split('=')))
const PATENTES = args.filter((a, i) => /^[A-Z0-9]{6,7}$/.test(a) && !String(args[i - 1]).startsWith('--'))
const MIN = 60_000
const FEED_LAG = 240_000
/** Puntos de frente en el orden del recorrido (Ricardone → puerto). */
const PUNTOS = [
  ['Preingreso', ['RicPreIngInFr']],
  // La cámara de Ingreso queda en el portón, ~3 min ANTES de Preingreso: se busca hacia atrás.
  ['Ingreso Ricardone', ['RicIngCamFrente']],
  ['Calada Ricardone', ['RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05', 'RicCal06', 'RicCalLiq']],
  ['Balanza ingreso Ricardone', ['RicB1Ingreso', 'RicB2Ingreso', 'RicB3Ingreso']],
  ['Playa 3', ['RicS6Playa3']],
  ['Celda 16', ['RicC16Descarga1', 'RicC16Descarga2']],
  ['Silo Keppler', ['RicS7DescLinea1', 'RicS7DescLinea2']],
  ['Volcables Ricardone', ['RicVolcable1', 'RicVolcable2']],
  ['Balanza egreso Ricardone', ['RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso']],
  ['Egreso Ricardone', ['RicEgrCamFrente']],
  ['Ingreso puerto', ['SLZIngCamFrente']],
  ['Balanza ingreso puerto', ['SLZBalIngFte']],
  ['Volcables puerto', ['SLZVolcableC1', 'SLZVolcableC2', 'SLZVolcableC3', 'SLZVolcableC4', 'SLZVolcableC5', 'SLZDescCam']],
  ['Balanza egreso puerto', ['SLZBalSC1Fte', 'SLZBalSC2Fte']],
  ['Salida puerto', ['SLZSalidaC1Fte', 'SLZSalidaC2Fte']],
]
/**
 * Ventanas fijadas por la salida del Sistema, en minutos: la salida es la pasada por la balanza de
 * egreso (±1 min, medido en 65 mil cruces exactos); la salida física y los volcables quedan cerca.
 */
const VENTANA_SALIDA = {
  TERMINAL_EMBARQUE: { 'Balanza ingreso puerto': [-240, -15], 'Volcables puerto': [-90, -3], 'Balanza egreso puerto': [-4, 2], 'Salida puerto': [0, 20] },
  RICARDONE: { 'Volcables Ricardone': [-150, -3], 'Balanza egreso Ricardone': [-4, 2], 'Egreso Ricardone': [0, 20] },
}
/**
 * Ventanas por tiempo de tramo desde la pasada por Calada elegida (minutos), medidas en los cruces
 * exactos: Ingreso puerto = calada + 24 min (p25–p75 20–34); balanza de ingreso Ricardone = calada + 10 (7–15).
 */
const VENTANA_CALADA = {
  TERMINAL_EMBARQUE: { 'Egreso Ricardone': [2, 30], 'Ingreso puerto': [12, 45] },
  RICARDONE: { 'Balanza ingreso Ricardone': [3, 30] },
}
/** Marca del camión vista en las fotos (el DSS la detecta mal de noche). */
const MARCAS = { AB688RB: ['Volvo'], KTH925: ['Iveco'], RGP363: ['Scania'], DDD727: ['Scania'], AH439OV: ['Foton'], TRO957: ['Iveco'], GQQ158: ['Mercedes-Benz'], EOV644: ['Mercedes-Benz'], AB723QC: ['Scania'] }
const VALID = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2})$/
const hora = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
const FAMILIA = (p) => (/SOJA/.test(p) ? 'soja' : /GIRASOL/.test(p) && !/ACEITE|AC /.test(p) ? 'girasol' : /PELLET/.test(p) ? 'pellet' : p)

const dss = createDssLiveRouter({ projectRoot: resolve(import.meta.dirname, '../..') })
if (!dss.isDssConfigured()) throw new Error('DSS no configurado: correr con node --env-file=.env')
const reads = loadReads()
const byPlate = new Map()
for (const r of reads) if (r.plate) (byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)
const movs = loadMovimientos()
const visitas = movs.filter((m) => PATENTES.includes(m.plate) && hora(m.ing).slice(0, 10) >= DESDE)
console.error(`${visitas.length} visitas de ${PATENTES.join(', ')}`)

/** Parecido 0–1 entre una lectura y la patente (Levenshtein con confusiones LPR a 0,3). */
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
/** Baja la foto de escena de cada captura y devuelve su ficha. */
async function bajar(caps, dir) {
  const out = []
  for (const c of caps) {
    const f = { camara: c.camara, hora: hora(c.t), at: c.at, lectura: c.plate, marca: c.vehicleBrand, color: c.vehicleColor, tipo: c.vehicleCategory, foto: null }
    if (c.scenePicture) {
      const name = `${hora(c.t).slice(11).replace(/:/g, '')}_${c.camara}_${c.plate || 'vacia'}.jpg`
      try {
        if (!existsSync(join(dir, name))) writeFileSync(join(dir, name), (await dss.fetchPicture(c.scenePicture)).buf)
        f.foto = name
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e)
      }
    }
    out.push(f)
  }
  return out
}

async function listar(devs, a, b) {
  const out = []
  for (const dev of devs)
    for (let page = 1; page < 20; page++) {
      let caps = []
      try {
        caps = await dss.listVehicleCaptures(dev, a, b, 100, page)
      } catch (e) {
        console.error(`DSS ${dev} ${hora(a)}–${hora(b).slice(11)} pág. ${page}: ${e instanceof Error ? e.message : e}`)
      }
      // El DSS a veces ignora la página y repite la primera: se corta al ver repetidos.
      const nuevas = caps.filter((c) => !out.some((o) => o.camara === dev && o.at === c.at && o.plate === c.plate))
      out.push(...nuevas.map((c) => ({ ...c, camara: dev, t: Date.parse(c.at) })))
      if (caps.length < 100 || !nuevas.length) break
    }
  return out.sort((x, y) => x.t - y.t)
}

for (const m of visitas) {
  const tag = hora(m.ing).replace(/[- :]/g, '').slice(0, 12)
  const dir = join(OUT_DIR, 'recorridos', m.plate, tag)
  if (existsSync(join(dir, 'recorrido.json')) && !args.includes('--rehacer')) continue
  mkdirSync(dir, { recursive: true })
  const fin = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 20 * MIN
  // 1. Ancla en Preingreso (hora real de cámara).
  const pre = await listar(['RicPreIngInFr'], m.ing - 12 * MIN, m.ing + 3 * MIN)
  let ancla = null
  const fija = ANCLAS[m.plate]
  if (fija) ancla = pre.find((c) => hora(c.t).endsWith(fija) && hora(c.t).slice(0, 10) === hora(m.ing).slice(0, 10))
  ancla ??= pre.find((c) => c.plate === m.plate)
  ancla ??= pre.filter((c) => !VALID.test(c.plate)).sort((x, y) => Math.abs(x.t - (m.ing - 4.5 * MIN)) - Math.abs(y.t - (m.ing - 4.5 * MIN)))[0]
  // Sin captura en Preingreso (cámara caída): se sigue desde la hora esperada de paso.
  ancla ??= { camara: 'RicPreIngInFr', t: m.ing - 4.5 * MIN, at: new Date(m.ing - 4.5 * MIN).toISOString(), plate: '', sinCaptura: true }
  // 2. En cada punto, en orden: vecinos = camiones del Sistema (mismo destino y familia) leídos en el
  // punto anterior justo antes y justo después de la pasada elegida. Se re-anclan en cada punto.
  const rec = { patente: m.plate, ingreso: hora(m.ing), salida: Number.isFinite(m.sal) ? hora(m.sal) : '', producto: m.producto, planta: m.planta, ancla: { camara: ancla.camara, hora: hora(ancla.t), lectura: ancla.plate }, puntos: [] }
  const marcas = new Set(MARCAS[m.plate] ?? [])
  let calada = null
  const a0 = () => prev.t + MIN
  let prev = { punto: 'Preingreso', devs: new Set(['RicPreIngInFr']), t: ancla.t }
  const otras = [...new Set(movs.filter((o) => o.plate !== m.plate && o.ing <= fin && (Number.isFinite(o.sal) ? o.sal : o.ing + 14 * 60 * MIN) >= m.ing - 60 * MIN).map((o) => o.plate))]
  const deOtro = (lec) => (lec && lec.length >= 4 ? Math.max(0, ...otras.map((o) => parecido(lec, o))) : 0)
  const lecturaEn = (plate, devSet, desde, hasta) => (byPlate.get(plate) ?? []).filter((x) => devSet.has(x.dev) && x.t - FEED_LAG >= desde && x.t - FEED_LAG <= hasta).sort((a, b) => a.t - b.t)[0]
  for (const [punto, devs] of PUNTOS) {
    const devSet = new Set(devs)
    if (punto === 'Preingreso') {
      const f = ancla.sinCaptura ? [] : await bajar([ancla], dir)
      rec.puntos.push(ancla.sinCaptura ? { punto, estado: 'sin_captura', vecinos: [] } : { punto, elegida: f[0], candidatas: f, vecinos: [] })
      continue
    }
    // Vecinos en el punto anterior: hasta 3 antes y 3 después de la pasada elegida (±20 min).
    const vec = []
    for (const o of movs) {
      if (o.plate === m.plate || o.planta !== m.planta || FAMILIA(o.producto) !== FAMILIA(m.producto) || Math.abs(o.ing - m.ing) > 6 * 60 * MIN) continue
      const r = lecturaEn(o.plate, prev.devs, prev.t - 20 * MIN, prev.t + 20 * MIN)
      if (r) vec.push({ m: o, t0: r.t - FEED_LAG })
    }
    const sel = [...vec.filter((v) => v.t0 < prev.t).sort((a, b) => b.t0 - a.t0).slice(0, 3), ...vec.filter((v) => v.t0 >= prev.t).sort((a, b) => a.t0 - b.t0).slice(0, 3)]
    const tiempos = []
    for (const v of sel) {
      const r = lecturaEn(v.m.plate, devSet, v.t0 - 30 * MIN, v.t0 + 8 * 60 * MIN)
      if (r) tiempos.push({ plate: v.m.plate, t: r.t - FEED_LAG })
    }
    const haciaAtras = punto === 'Ingreso Ricardone'
    // Lecturas propias en TruckFlow: la patente exacta o una parecida (AB688R6 por AB688RB).
    const propias = reads
      .filter((x) => devSet.has(x.dev) && x.t - FEED_LAG >= (haciaAtras ? ancla.t - 20 * MIN : prev.t - 30 * MIN) && x.t <= (haciaAtras ? ancla.t + FEED_LAG : fin) && (x.plate === m.plate || parecido(x.plate, m.plate) >= 0.7))
      .map((x) => x.t - FEED_LAG)
    if (tiempos.length < 2 && !propias.length && !(Number.isFinite(m.sal) && VENTANA_SALIDA[m.planta]?.[punto]) && !(calada && VENTANA_CALADA[m.planta]?.[punto])) {
      rec.puntos.push({ punto, estado: 'fuera_del_recorrido', vecinos: tiempos.map((x) => `${x.plate}@${hora(x.t).slice(11)}`) })
      continue
    }
    const ts = tiempos.map((x) => x.t).sort((a, b) => a - b)
    const porSalida = Number.isFinite(m.sal) ? VENTANA_SALIDA[m.planta]?.[punto] : null
    const porCalada = calada ? VENTANA_CALADA[m.planta]?.[punto] : null
    // Intervalo: entre el vecino de antes más temprano y el de después más tardío; la mediana manda si se dispersan.
    const med = ts.length ? ts[Math.floor(ts.length / 2)] : propias[0]
    let a = haciaAtras ? Math.min(...ts, ...propias) - 4 * MIN : Math.max(prev.t, Math.min(...ts, ...propias) - 4 * MIN)
    let b = Math.max(...ts, ...propias) + 4 * MIN
    if (b - a > 60 * MIN) (a = Math.max(prev.t, med - 30 * MIN)), (b = med + 30 * MIN)
    if (b <= a + MIN) b = a + 30 * MIN // los vecinos pasaron antes que la pasada elegida: se mira la media hora siguiente
    if (Number.isFinite(m.sal) && !porSalida) b = Math.min(b, m.sal - 2 * MIN) // todo lo intermedio es antes de la salida
    if (porCalada) (a = calada + porCalada[0] * MIN), (b = calada + porCalada[1] * MIN)
    if (porSalida) (a = Math.max(a0(), m.sal + porSalida[0] * MIN)), (b = m.sal + porSalida[1] * MIN)
    if (b <= a) b = a + 20 * MIN    // Fuera: patentes válidas (otros camiones) y lecturas parecidas a OTRO camión del Sistema en planta.
    const caps = (await listar(devs, a, b)).filter((c) => c.plate === m.plate || parecido(c.plate, m.plate) >= 0.6 || (!VALID.test(c.plate) && deOtro(c.plate) < 0.7))
    const centro = propias[0] ?? med
    // Orden: patente exacta > parecida > misma marca que el camión (según el DSS) > la más cercana al centro.
    const centroP = porSalida ? m.sal + ((porSalida[0] + porSalida[1]) / 2) * MIN : porCalada ? calada + ((porCalada[0] + porCalada[1]) / 2) * MIN : centro
    const orden = (c) => (c.plate === m.plate ? -3 : parecido(c.plate, m.plate) >= 0.6 ? -2 : c.vehicleBrand && marcas.has(c.vehicleBrand) ? -1 : 0) * 1e12 + Math.abs(c.t - centroP)
    const cand = await bajar(caps.sort((x, y) => orden(x) - orden(y)).slice(0, 6), dir)
    const elegida = cand[0]
    rec.puntos.push({ punto, intervalo: [hora(a).slice(11), hora(b).slice(11)], vecinos: tiempos.map((x) => `${x.plate}@${hora(x.t).slice(11)}`), elegida, candidatas: cand })
    if (elegida && !haciaAtras) prev = { punto, devs: devSet, t: Date.parse(elegida.at) }
    if (elegida && punto === 'Calada Ricardone') calada = Date.parse(elegida.at)
    // Marca del camión: la que el DSS dio en una pasada con su patente (exacta o parecida).
    for (const c of cand) if (c.marca && (c.lectura === m.plate || parecido(c.lectura, m.plate) >= 0.6)) marcas.add(c.marca)
  }
  writeFileSync(join(dir, 'recorrido.json'), JSON.stringify(rec, null, 1))
  console.log(`${m.plate} ${hora(m.ing)}: ancla ${rec.ancla.hora.slice(11)} «${rec.ancla.lectura}», puntos: ${rec.puntos.filter((p) => p.elegida).map((p) => `${p.punto} ${p.elegida.hora.slice(11)} «${p.elegida.lectura}»`).join(' → ')}`)
}
process.exit(0)
