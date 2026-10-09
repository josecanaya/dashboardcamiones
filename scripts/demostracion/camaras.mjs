// Inventario solo con cámaras. Paso fundamental:
//   1. Una patente válida nueva en un punto de entrada crea una visita.
//   2. En cada punto se esperan los camiones cuyo último punto es el anterior de algún circuito.
//   3. Captura con la patente de un esperado (o de una visita abierta) → avanza ese camión.
//      Captura que no es de ningún esperado → camión nuevo, u error de lectura: ahí se desempata entre los
//      esperados con patente, color/marca/tipo y tiempo de espera (P ≥ 60 %).
//   4. Antes de deducir un paso faltante se buscan capturas sin dueño de ese punto entre las dos lecturas del
//      camión (corregido hacia atrás). Solo si no hay ninguna que encaje, el paso queda deducido.
// El Excel se usa solo al final, para contar los pasos que tenía que hacer cada camión de la muestra.
// Uso: node scripts/demostracion/camaras.mjs 2026-10-07 2,3
import fs from 'node:fs'
import path from 'node:path'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'
import { compareAttribute } from '../../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const DAY = process.argv[2] ?? '2026-10-07'
const QS = (process.argv[3] ?? '2,3').split(',').map(Number)
const THETA = 0.6
const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, ''))
const plateOf = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const arDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const localMs = (s) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const franja = (ms) => { const h = new Date(ms - 3 * 3600_000).getUTCHours(); return h >= 6 && h < 18 ? 'dia' : 'noche' }
const H8 = 8 * 3600_000, H12 = 12 * 3600_000
// Un camión puede pasar la noche en Ricardone entre un punto y el siguiente (R6: Calada 17 h → Balanza egreso 7–10 h).
// Solo en las playas de espera se puede esperar horas (y pasar la noche): Playa 1 (Pre ingreso → Calada), Calada →
// balanza, Playa 3 → balanza/volcable, y en San Lorenzo Ingreso → Balanza ingreso (Playa OSL). En el resto, 12 h.
const DESDE_PLAYA = new Set(['ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Playa 3', 'san_lorenzo:Ingreso'])
const ESPERA_LARGA = Number(process.env.ESPERA_LARGA_H ?? 20) * 3600_000
const esperaMax = (from) => (DESDE_PLAYA.has(from) ? ESPERA_LARGA : H12)
const EXCLUIDOS = new Set(['ricardone:Ingreso', 'ricardone:Balanza Ingreso'])

// ── Modelo de nodos ──
const model = json('docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const SAME = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
const frontNode = new Map()
for (const n of model.nodes) if (n.hasCamera) for (const d of n.devices ?? []) if (d !== 'SLZCalCam' && !frontNode.has(d.toLowerCase())) frontNode.set(d.toLowerCase(), SAME[n.id] ?? n.id)
// Los puntos sin cámara útil (Ingreso Ricardone caída, Balanza ingreso Ricardone mal apuntada) se saltean en el
// circuito: así Calada vuelve a ser el punto anterior de Playa 3 y de los volcables.
const SIN_CAMARA_UTIL = new Set(['ricardone:Ingreso', 'ricardone:Balanza Ingreso'])
const camNodes = (seq) => { const out = []; for (const raw of seq) { const id = SAME[raw] ?? raw; const n = nodeById.get(id); if (n?.hasCamera && !n.optional && !NO_MEDIBLES.has(id) && !SIN_CAMARA_UTIL.has(id) && !out.includes(id)) out.push(id) } return out }
const circuits = model.circuits.map((c) => ({ id: c.id, exp: camNodes(c.seq) })).filter((c) => c.exp.length)
const pred1 = new Map(), pred2 = new Map(), ENTRY = new Set()
const addTo = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v) }
for (const c of circuits) {
  ENTRY.add(c.exp[0])
  for (let i = 1; i < c.exp.length; i++) { addTo(pred1, c.exp[i], c.exp[i - 1]); if (i > 1) addTo(pred2, c.exp[i], c.exp[i - 2]) }
}
// Mientras la cámara de Ingreso Ricardone esté caída, Preingreso también es entrada.
ENTRY.add('ricardone:Pre ingreso')
const ACCESOS = new Set(['ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Salida 2', 'san_lorenzo:Ingreso', 'san_lorenzo:Egreso'])
// Parte de lo que lee cada cámara que no es un camión (tipo del DSS, toda la semana).
const noCamionCache = new Map()
const noCamionPorCamara = { get(dev) { if (!noCamionCache.size) for (const [d, list] of dss) { const n = list.length, o = list.filter((r) => /bus|van|pickup|sedan|suv/i.test(r.vehicleCategory ?? '')).length; noCamionCache.set(d, n ? o / n : 1) } return noCamionCache.get(dev) } }
const PROCESO = new Set(['ricardone:Calada', 'ricardone:Volcable 1', 'ricardone:Volcable 2', 'ricardone:Volcable Silo Keppler', 'ricardone:Celda 16', 'ricardone:Tolva de carga silo Chief', 'ricardone:Balanza Egreso', 'san_lorenzo:Plataformas Volcables', 'san_lorenzo:Carga / Descarga OSL', 'san_lorenzo:Carga/descarga'])
const NOT_TRUCK = /sedan|suv|pickup|van|car\b|motor|mpv|hatchback/i
const logical = (id) => { const n = nodeById.get(id); return n.plant === 'san_lorenzo' ? `SL_${n.code}` : n.code }
const pIni = json('server/plantState/data/pInicioNodos.json')
const pNuevo = (node, t) => pIni.nodes[logical(node)]?.pInicio?.[franja(t)] ?? 0.3

// ── Capturas frontales: feed + las que solo están en el DSS, con color/marca/tipo ──
const dss = new Map()
{
  let row = 0
  // Las dos semanas: así el primer día arranca con los camiones que ya estaban en planta.
  for (const f of ['data/dss-export/2026-09-24_30/capturas.csv', 'data/dss-export/2026-10-01_07/capturas.csv']) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').trim().split(/\r?\n/)
    const head = lines[0].split(',')
    for (const l of lines.slice(1)) {
      const v = l.split(','), r = Object.fromEntries(head.map((h, i) => [h, v[i]]))
      const t = Date.parse(`${r.hora_camara.replace(' ', 'T')}-03:00`) + 240_000
      const k = r.camara.toLowerCase()
      if (!dss.has(k)) dss.set(k, [])
      dss.get(k).push({ row: row++, device: r.camara, t, plate: plateOf(r.patente), vehicleColor: r.color, vehicleBrand: r.marca, vehicleCategory: r.tipo })
    }
  }
  for (const l of dss.values()) l.sort((a, b) => a.t - b.t)
}
const dssAt = (dev, t, plate) => {
  let best = null
  for (const r of dss.get(dev.toLowerCase()) ?? []) {
    if (r.t < t - 5000) continue
    if (r.t > t + 5000) break
    const s = (r.plate === plate ? 0 : 10_000) + Math.abs(r.t - t)
    if (!best || s < best.s) best = { ...r, s }
  }
  return best
}
// Traseras: leen la patente de atrás (a veces el acoplado). Siguen a un camión que ya está, o abren visita (AF308AY,
// EFQ775, PPG613: solo los vio la trasera de Balanza ingreso SL). Si la patente no es de la flota puede ser un
// acoplado: la visita queda pasiva, junta lecturas exactas pero no compite por lecturas mal hechas.
const TRASERAS = new Map([['slzbalingtras', 'san_lorenzo:Balanza Ingreso']])
const nodoDe = (dev) => frontNode.get(dev) ?? TRASERAS.get(dev)
const START = Date.parse(`${addDays(DAY, -1)}T00:00:00-03:00`)
// Hasta el mediodía siguiente: los que entran a la noche hacen sus pasos después de las 0 h (LLA258, UUU110, EAR164).
const END = Date.parse(`${addDays(DAY, 1)}T12:00:00-03:00`)
const caps = []
const usedDss = new Set()
for (const d of [addDays(DAY, -1), DAY, addDays(DAY, 1)]) {
  const f = `data/truckflow/${d}/event-list.json`
  if (!fs.existsSync(path.join(root, f))) continue
  const o = json(f)
  for (const e of Array.isArray(o) ? o : o.records ?? []) {
    if (e.inferred || e.manualCorrection || e.eventCategory !== 'physical') continue
    const node = nodoDe(String(e.deviceCode ?? '').toLowerCase())
    const t = getEventLiveInstantMs(e)
    if (!node || !Number.isFinite(t) || t < START || t > END) continue
    const plate = plateOf(e.normalizedPlate || e.truckPlate)
    const a = dssAt(e.deviceCode, t, plate)
    if (a) usedDss.add(a.row)
    caps.push({ node, device: e.deviceCode, t, plate, attrs: a, trasera: TRASERAS.has(String(e.deviceCode).toLowerCase()) })
  }
}
for (const [dev, list] of dss) {
  const node = nodoDe(dev)
  if (!node) continue
  for (const r of list) if (!usedDss.has(r.row) && r.t >= START && r.t <= END) caps.push({ node, device: r.device, t: r.t, plate: r.plate, attrs: r, trasera: TRASERAS.has(dev) })
}
caps.sort((a, b) => a.t - b.t)
// La misma patente en el mismo punto a menos de 2 min es la misma pasada.
const lastAt = new Map()
// Cámaras que no miran lo que dice el modelo (Balanza ingreso Ricardone apunta al acceso, reloj en 2036;
// la frontal de Ingreso Ricardone está caída): sus capturas no entran.
const CAMARAS_FUERA = new Set(['ricb1ingreso', 'ricb2ingreso', 'ricb3ingreso', 'ricingcamfrente'])
// Forma de patente: 3 a 7 caracteres y al menos un número (AUTOTEK o BW71CA40 son texto de carrocería).
const formaPatente = (pl) => pl.length >= 3 && pl.length <= 7 && /\d/.test(pl)
const descartadas = { camara: 0, forma: 0 }
const stream0 = caps.filter((c) => { if (CAMARAS_FUERA.has(String(c.device).toLowerCase())) { descartadas.camara++; return false } if (!formaPatente(c.plate)) { descartadas.forma++; return false } return true })
const stream = stream0.filter((c) => { const k = `${c.node}|${c.plate}`; const p = lastAt.get(k); lastAt.set(k, c.t); return !(p != null && c.t - p < 120_000 && isValidPlate(c.plate)) })

// ── Tiempo de tramo A → N, medido con lecturas buenas consecutivas de la misma patente (peso, no filtro) ──
const BIN = 2 * 60_000, NB = Math.ceil(H8 / BIN)
const gapHist = new Map()
{
  const last = new Map()
  for (const c of stream) {
    if (!isValidPlate(c.plate)) continue
    const l = last.get(c.plate)
    if (l && l.node !== c.node && c.t - l.t < H8 && (pred1.get(c.node)?.has(l.node) || pred2.get(c.node)?.has(l.node))) {
      const k = `${l.node}>${c.node}`
      if (!gapHist.has(k)) gapHist.set(k, new Array(NB).fill(0))
      gapHist.get(k)[Math.min(NB - 1, Math.floor((c.t - l.t) / BIN))]++
    }
    last.set(c.plate, c)
  }
}
const hz = new Map()
// Playa 3 es zona de espera: cuánto lleva ahí no dice cuándo sale (s01 RKU685, s07). El tiempo no desempata.
const ESPERA = new Set(['ricardone:Playa 3'])
function timeWeight(from, to, e) {
  if (ESPERA.has(from)) return e < 0 ? 0 : e <= H12 ? 1 : 0.1 // pasada la noche sigue abierta, pero pesa menos
  const k = `${from}>${to}`
  if (!hz.has(k)) {
    const hist = gapHist.get(k), n = hist ? hist.reduce((a, b) => a + b, 0) : 0
    const h = new Array(NB).fill(1 / NB)
    let cut = 4 * 3600_000
    if (n >= 8) {
      let acc = 0
      for (let i = 0; i < NB; i++) { acc += hist[i]; if (acc >= 0.99 * n) { cut = (i + 1) * BIN * 1.5 + 10 * 60_000; break } }
      const sm = hist.map((_, i) => (hist[Math.max(0, i - 1)] + hist[i] + hist[Math.min(NB - 1, i + 1)]) / 3 + n * 0.001)
      const tot = sm.reduce((a, b) => a + b, 0)
      let surv = 1
      for (let i = 0; i < NB; i++) { const f = sm[i] / tot; h[i] = f / Math.max(surv, 1e-6); surv -= f }
    }
    h.cut = cut
    hz.set(k, h)
  }
  const h = hz.get(k)
  if (e < 0) return 0
  // Fantasma: ya pasó sin ser leído. En una playa puede seguir esperando (la visita sigue abierta hasta 20 h y la
  // lectura exacta la encuentra), pero una lectura mal leída no se le asigna: si no, los fantasmas roban (FKZ258).
  return h[Math.min(NB - 1, Math.floor(e / BIN))] * (e > h.cut ? 0.002 : 1)
}

// Saltear una cámara resta, pero no anula: con pocos datos de ese tramo, el peso de tiempo no puede quedar en 0.
const SKIP_FLOOR = 0.02

// ── Desempate: patente (frecuencia medida de cada cantidad de cambios), color/marca/tipo ──
// FRAG: chance de un fragmento concreto (hay decenas de millones de textos posibles); queda por debajo de 3 cambios.
const MAL = 0.45, PK = { 1: 0.08, 2: 0.05, 3: 0.03 }, FRAG = (MAL * 0.83) / 1e8
const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
const combos = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r }
// 4 cambios o más: igual se premia la parte en común, en orden (s04 AC89799 → AC889HD comparte AC89), sin pasar a 3 cambios.
const lcsStr = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length] }
const readL = (read, real) => { if (read === real) return 1 - MAL; const k = editDist(read, real); if (k >= 4 || !PK[k]) { const m = lcsStr(read, real); return FRAG * (m >= 3 ? 10 ** (2 * m / Math.max(read.length, real.length)) : 1) } return Math.max(FRAG, (MAL * PK[k]) / (combos(real.length, k) * 20 ** k)) }
const mode = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
// Tipo medido (atributos-lr.mjs, 24/09–07/10): el DSS confunde camión con colectivo/camioneta tanto en el mismo
// camión como entre camiones distintos (28 % vs 26 %): ese cruce no es evidencia, pesa como un tipo distinto (0,86), no 0,3.
const lrTipo = (a, b) => { const r = compareAttribute('tipo', a, b); return r.result === 'distinto' ? 0.86 : r.lr }
const lrAttrs = (a, v) => (!a || !v.attrs ? 1 : compareAttribute('color', a.vehicleColor, mode(v.attrs.vehicleColor)).lr * compareAttribute('marca', a.vehicleBrand, mode(v.attrs.vehicleBrand)).lr * lrTipo(a.vehicleCategory, mode(v.attrs.vehicleCategory)))

// «Otro vehículo»: un camión nuevo, o un vehículo conocido (flota de septiembre o visita de estos días)
// al que la lectura se parece más que a los candidatos.
const flota = new Set(json('server/plantState/data/flotaPatentes.json').plates)
const known = new Set(flota)
{ const nodesOf = new Map(); for (const c of stream) if (isValidPlate(c.plate)) { if (!nodesOf.has(c.plate)) nodesOf.set(c.plate, new Set()); nodesOf.get(c.plate).add(c.node) } for (const [pl, ns] of nodesOf) if (ns.size >= 2) known.add(pl) }
const knownList = [...known]
function otroVehiculo(read, candidatos, p0, node) {
  // Patente válida: si es de la flota, un camión nuevo con esa patente es posible (46 % de los camiones del 07/10 son
  // de la flota). Si nunca se vio, un camión nuevo tendría que traer justo esa entre ~1 millón de patentes de la época:
  // es más probable que sea un esperado leído mal (s12 IGP699 = GFP699, s10 TPF310 ≈ FPF313).
  const base = isValidPlate(read) ? (1 - MAL) * (known.has(read) ? 0.46 / 3489 : 0.54 / 1e6) : FRAG
  let best = 0
  // Solo en un acceso puede aparecer un vehículo conocido que nadie esperaba. Adentro de la planta tendría que
  // haber entrado sin que lo lea nadie: eso ya lo mide p0 (s18 MWC21 = MWG720 en Playa 3, s02 SX149 = TSX149).
  if (read && read.length >= 5 && ACCESOS.has(node)) for (const x of knownList) if (!candidatos.has(x) && Math.abs(x.length - read.length) <= 2) { const l = readL(read, x); if (l > best) best = l }
  // Un vehículo conocido que no espera este paso pesa menos que uno que lo espera, pero no se ignora.
  return p0 * Math.max(base, 0.3 * best)
}

// Fragmento: la lectura no se parece a la patente del candidato (4 cambios o más, o 3 caracteres).
const esFragmento = (read, plate) => read.length <= 3 || editDist(read, plate) >= 4
// Un fragmento solo se asigna en una cámara de proceso con pocos autos, con un candidato claro por tiempo
// (70 % del peso o más) y la misma marca en la captura y en el camión.
// También vale si el tiempo empata pero es el único candidato con esa marca (s05: BTB128, único Mercedes).
function fragmentoPermitido(c, v, pesoTiempo, otros = [], post = 0) {
  if (!PROCESO.has(c.node) || (noCamionPorCamara.get(String(c.device).toLowerCase()) ?? 1) > 0.1) return false
  // Comparte 3 caracteres en orden con la patente y gana con 80 % o más: es parte de su patente (s19 L30524 = AE305ZA).
  const comun = lcsStr(c.plate, v.plate)
  if (comun >= 4 || (post >= 0.8 && comun >= 3)) return true // s04 AC89799 = AC889HD comparte AC89
  const marca = c.attrs?.vehicleBrand, suya = mode(v.attrs.vehicleBrand)
  if (!marca || /unrecognized|unknown/i.test(marca) || marca !== suya) return false
  // Única = todos los demás candidatos tienen una marca conocida y distinta. Marca desconocida no descarta a nadie.
  const unica = otros.every((o) => o === v || (mode(o.attrs.vehicleBrand) && mode(o.attrs.vehicleBrand) !== marca))
  // Sin ningún carácter en común, la marca única sola no alcanza: erró 2 de 3 (s03 KINV0, s06 CCA14; acertó A005 → BTB128).
  return pesoTiempo >= 0.7 || (unica && comun >= 2)
}

// ── Pasada hacia adelante ──
const visits = []
const openByPlate = new Map()
const pool = [] // capturas sin dueño, para buscarlas antes de deducir
const decisiones = [] // cada captura que no era de una visita abierta, con los camiones que esperaban
function newVisit(plate, c) {
  const v = { id: visits.length, plate, path: [], last: null, lastT: c.t, attrs: { vehicleColor: {}, vehicleBrand: {}, vehicleCategory: {} } }
  visits.push(v)
  openByPlate.set(plate, v)
  return v
}
function step(v, c, via) {
  v.path.push({ node: c.node, t: c.t, via: c.plate === v.plate ? 'camara' : via, read: c.plate, device: c.device })
  v.last = c.node
  v.lastT = c.t
  if (c.attrs) for (const k of Object.keys(v.attrs)) { const x = c.attrs[k]; if (x && !/unknown|unrecognized/i.test(x)) v.attrs[k][x] = (v.attrs[k][x] ?? 0) + 1 }
}
const visited = (v, node) => v.path.some((p) => p.node === node)
// Si el paso salteado es Playa 3 (espera), pudo haber esperado horas ahí sin ser leído: el tiempo no desempata (s02 TSX149).
const saltaEspera = (from, to) => [...ESPERA].some((w) => pred1.get(w)?.has(from) && pred1.get(to)?.has(w))
// Pasar de una planta a la otra exige ser leído en el primer punto con cámara: no se saltea (CMF111, camión
// interno de San Lorenzo, terminaba «llegando» a Calada Ricardone con una lectura CS5111).
const planta = (id) => id.split(':')[0]
const SALIDAS = new Set(['ricardone:Salida 2', 'ricardone:Salida 1', 'san_lorenzo:Egreso'])
// Lectura mal hecha de 6 caracteres o más que se repite igual en 2 puntos distintos: es la patente de ese camión
// leída siempre igual de mal (AA842K0, AE949O0); puede abrir visita aunque no se haya leído la entrada.
// Con 3 números o más: SCAN14 es el logo de Scania leído en dos cámaras, no una patente.
const consistente = new Set()
{ const ns = new Map(); for (const c of stream) if (c.plate.length >= 6 && !isValidPlate(c.plate) && (c.plate.match(/[0-9]/g) ?? []).length >= 3) { if (!ns.has(c.plate)) ns.set(c.plate, new Set()); ns.get(c.plate).add(c.node) } for (const [pl, n] of ns) if (n.size >= 2) consistente.add(pl) }
function expected(N, t) {
  const out = []
  for (const v of openByPlate.values()) {
    if (v.pasiva || t - v.lastT > esperaMax(v.last) || visited(v, N) || !v.last) continue
    const w = pred1.get(N)?.has(v.last) ? timeWeight(v.last, N, t - v.lastT) : pred2.get(N)?.has(v.last) && planta(v.last) === planta(N) ? 0.25 * (saltaEspera(v.last, N) ? 1 : Math.max(timeWeight(v.last, N, t - v.lastT), SKIP_FLOOR)) : 0
    if (w > 0) out.push({ v, w })
  }
  return out
}
let corregidosAdelante = 0
let doblesDescartadas = 0
let sinIdentificar = 0
const NN_NODOS = new Set(['ricardone:Pre ingreso', 'ricardone:Calada', 'san_lorenzo:Ingreso'])
// RicPreIngEgFr mira la calle de salida de Pre ingreso: ahí pasan los que se van, no los que entran.
const NN_FUERA = new Set(['ricpreingegfr'])
const ultimaPorCamara = new Map()
let relecturas = 0
for (const c of stream) {
  const valid = isValidPlate(c.plate)
  const tPrevia = ultimaPorCamara.get(c.device); ultimaPorCamara.set(c.device, c.t); ultimaPorCamara.set(c.device + '|prev', tPrevia)
  // Una lectura mal hecha pero de 6 caracteres o más que abrió visita en la entrada se sigue por el mismo texto
  // (AC57SJ leída igual en 6 cámaras; AF523F0 por AF523FD).
  let v = valid || c.plate.length >= 6 ? openByPlate.get(c.plate) : null
  if (v && c.t - v.lastT > esperaMax(v.last)) v = null
  // Vuelta nueva: la misma patente vuelve a un punto de entrada después de haber salido, de haber pasado por ese
  // mismo punto, o desde un acceso. Los camiones de líquidos hacen 2 o 3 viajes por día (EAR164, UUU110).
  if (v && ENTRY.has(c.node) && v.path.length && v.last !== c.node && c.t - v.lastT > 30 * 60_000 && (ACCESOS.has(v.last) || visited(v, c.node) || v.path.some((p) => SALIDAS.has(p.node)))) v = null
  if (c.trasera) {
    if (v && !visited(v, c.node)) step(v, c, 'camara')
    else if (!v && valid) { const nv = newVisit(c.plate, c); step(nv, c, 'camara'); if (!flota.has(c.plate)) nv.pasiva = true }
    continue
  }
  if (v && !visited(v, c.node)) { step(v, c, 'camara'); continue }
  if (v) continue // relectura del mismo paso
  // Relectura con un carácter distinto: el mismo punto leyó hace 10 min o menos una patente a 1 cambio (s17 ENW930/FNW930).
  if (valid && !openByPlate.has(c.plate) && [...openByPlate.values()].some((o) => o.last === c.node && c.t - o.lastT <= 10 * 60_000 && editDist(c.plate, o.plate) === 1)) { relecturas++; continue }
  // Auto o camioneta según el DSS, salvo que la patente sea de un camión de la flota: de 15 a 18 h el DSS ve «Sedan»
  // a los camiones de frente en Pre ingreso (SFN197, TSX149, BBU070, RNA350… el 06/10).
  if (ACCESOS.has(c.node) && c.attrs && NOT_TRUCK.test(c.attrs.vehicleCategory ?? '') && !(valid && flota.has(c.plate))) continue
  // Captura doble: un camión ya identificado en este punto hace 2 min o menos (la segunda lee techo o cabina).
  let doble = null
  // Solo si la lectura no se parece a ningún camión que esperaba este paso (es texto de techo o cabina).
  const parecida = !valid && expected(c.node, c.t).some((x) => editDist(c.plate, x.v.plate) <= 3)
  if (!valid && !parecida) for (const ov of openByPlate.values()) if (ov.path.some((p) => p.device === c.device && Math.abs(c.t - p.t) <= 60_000)) { doble = ov; break }
  if (doble) { doblesDescartadas++; decisiones.push({ t: c.t, tFeed: new Date(c.t).toISOString(), node: c.node, device: c.device, leyo: c.plate, doble: doble.plate, elegido: null, candidatos: [] }); continue }
  // No es de una visita abierta: ¿es un esperado leído mal, o un vehículo nuevo?
  // La lectura contenida literal en la patente (4 caracteres o más seguidos) le gana al tiempo: el tiempo solo desempata
  // (s12 H043 = GIH043 llevaba 456 min y el tiempo le daba 0). En orden pero salteado no alcanza: F258 ≠ FKZ258.
  const E0 = expected(c.node, c.t), wMax = Math.max(0, ...E0.map((x) => x.w))
  const E = E0.map((x) => ({ v: x.v, w: c.plate.length >= 4 && x.v.plate.includes(c.plate) ? Math.max(x.w, 0.3 * wMax) : x.w }))
  const ws = E.reduce((a, x) => a + x.w, 0)
  const p0 = pNuevo(c.node, c.t)
  const scored = E.map((x) => ({ v: x.v, s: ((1 - p0) * x.w) / Math.max(ws, 1e-9) * readL(c.plate, x.v.plate) * lrAttrs(c.attrs, x.v) }))
  const nuevo = otroVehiculo(c.plate, new Set(E.map((x) => x.v.plate)), p0, c.node)
  const tot = scored.reduce((a, x) => a + x.s, 0) + nuevo
  const best = scored.sort((a, b) => b.s - a.s)[0]
  if (scored.length) decisiones.push({ t: c.t, tFeed: new Date(c.t).toISOString(), node: c.node, device: c.device, leyo: c.plate, attrs: c.attrs ? { color: c.attrs.vehicleColor, marca: c.attrs.vehicleBrand, tipo: c.attrs.vehicleCategory } : null,
    otro: tot ? nuevo / tot : 1, elegido: best && tot && best.s / tot >= THETA && (!esFragmento(c.plate, best.v.plate) || fragmentoPermitido(c, best.v, (E.find((e) => e.v === best.v)?.w ?? 0) / Math.max(ws, 1e-9), E.filter((e) => e.w / Math.max(ws, 1e-9) >= 0.05).map((e) => e.v), best.s / tot)) ? best.v.plate : null,
    proceso: PROCESO.has(c.node) && (noCamionPorCamara.get(String(c.device).toLowerCase()) ?? 1) <= 0.1, noCamionCamara: noCamionPorCamara.get(String(c.device).toLowerCase()) ?? null,
    candidatos: scored.slice(0, 6).map((x) => { const lp = x.v.path.at(-1); const tw = E.find((e) => e.v === x.v).w / Math.max(ws, 1e-9); return { plate: x.v.plate, ultimo: lp.node, ultimoT: new Date(lp.t).toISOString(), ultimoDevice: lp.device, esperaMin: Math.round((c.t - lp.t) / 60000), pesoTiempo: tw, p: tot ? x.s / tot : 0, attrs: { color: mode(x.v.attrs.vehicleColor), marca: mode(x.v.attrs.vehicleBrand), tipo: mode(x.v.attrs.vehicleCategory) }, lrAttr: lrAttrs(c.attrs, x.v) } }) })
  const okFrag = best && (!esFragmento(c.plate, best.v.plate) || fragmentoPermitido(c, best.v, (E.find((e) => e.v === best.v)?.w ?? 0) / Math.max(ws, 1e-9), E.filter((e) => e.w / Math.max(ws, 1e-9) >= 0.05).map((e) => e.v), tot ? best.s / tot : 0))
  if (best && tot && best.s / tot >= THETA && okFrag) { step(best.v, c, 'corregido'); corregidosAdelante++; continue }
  // En la entrada también una patente vieja a la que le falta un carácter (JCC33 = JCC633, UG720 = UWG720).
  if (valid || (c.plate.length >= 6 && (ENTRY.has(c.node) || consistente.has(c.plate))) || (ENTRY.has(c.node) && c.plate.length === 5 && /^[A-Z]{2,3}[0-9]{2,3}$/.test(c.plate))) { const nv = newVisit(c.plate, c); step(nv, c, 'camara'); if (!valid && c.plate.length === 5) nv.pasiva = true; continue } // corta: pasiva (CAN14 es el logo de Scania) // camión nuevo (o que entró sin ser leído)
  // Camión sin identificar: en la entrada (Pre ingreso, Calada, Ingreso SL) una captura de camión que nadie se llevó
  // y que no es la segunda foto del mismo paso es un camión que entró, aunque la patente sea ilegible (revisión a ojo
  // 09/10: 16 de 23 faltantes eran así: E18, SL32, AVEC0, MIG0…). Queda pasiva: no le roba capturas a nadie.
  const previa = ultimaPorCamara.get(c.device + '|prev')
  if (NN_NODOS.has(c.node) && !NN_FUERA.has(String(c.device).toLowerCase()) && c.plate.length >= 3 && !NOT_TRUCK.test(c.attrs?.vehicleCategory ?? '') && !(previa != null && c.t - previa <= 90_000)) {
    const nv = newVisit(`NN:${c.plate}:${c.t}`, c); step(nv, c, 'camara'); nv.pasiva = true; nv.nn = true; sinIdentificar++
    pool.push({ ...c, orphan: nv }) // si es el hueco de otro camión, se la lleva ese
  } else pool.push(c)
}

// ── Circuito de cada visita: el del modelo que mejor explica sus puntos (en orden) ──
const lcs = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length] }
for (const v of visits) {
  const obs = v.path.map((p) => p.node)
  let best = null
  for (const c of circuits) { const k = lcs(obs, c.exp); const s = k * 10 - (c.exp.length - k) * 0.1; if (!best || s > best.s) best = { ...c, s } }
  v.circuit = best?.id ?? null
  v.exp = best?.exp ?? obs
}

// ── Antes de deducir: buscar la captura sin dueño entre las dos lecturas del camión ──
// Las visitas de una sola lectura válida en un punto interno, que nunca más aparecen, también son capturas a revisar.
for (const v of visits) if (v.path.length === 1 && !ENTRY.has(v.path[0].node) && !v.nn) { v.orphan = true; pool.push({ node: v.path[0].node, t: v.path[0].t, plate: v.plate, device: v.path[0].device, attrs: null, orphan: v }) }
const gapsOf = (v) => {
  const out = []
  const idx = v.exp.map((n) => v.path.find((p) => p.node === n)?.t ?? null)
  for (let i = 0; i < v.exp.length; i++) {
    if (idx[i] != null) continue
    let a = i - 1; while (a >= 0 && idx[a] == null) a--
    let b = i + 1; while (b < v.exp.length && idx[b] == null) b++
    if (a < 0 || b >= v.exp.length) continue // solo entre dos lecturas
    out.push({ v, node: v.exp[i], from: v.exp[a], to: v.exp[b], lo: idx[a], hi: idx[b] })
  }
  return out
}
let corregidosAtras = 0
for (let ronda = 0; ronda < 3; ronda++) {
  const gaps = visits.filter((v) => !v.orphan).flatMap(gapsOf)
  const byNode = new Map()
  for (const g of gaps) { if (!byNode.has(g.node)) byNode.set(g.node, []); byNode.get(g.node).push(g) }
  let cambios = 0
  for (const c of pool) {
    if (c.usada) continue
    const G = (byNode.get(c.node) ?? []).filter((g) => c.t > g.lo && c.t < g.hi && !visited(g.v, g.node))
    if (!G.length) continue
    const W = G.map((g) => ({ g, w: Math.max(timeWeight(g.from, g.node, c.t - g.lo), pred1.get(g.node)?.has(g.from) ? 0 : SKIP_FLOOR) }))
    const ws = W.reduce((a, x) => a + x.w, 0)
    if (!ws) continue
    const p0 = pNuevo(c.node, c.t)
    const sc = W.map((x) => ({ g: x.g, s: ((1 - p0) * x.w) / ws * readL(c.plate, x.g.v.plate) * lrAttrs(c.attrs, x.g.v) }))
    const otro = otroVehiculo(c.plate, new Set(G.map((g) => g.v.plate)), p0, c.node)
    const tot = sc.reduce((a, x) => a + x.s, 0) + otro
    const best = sc.sort((a, b) => b.s - a.s)[0]
    const okFragA = !esFragmento(c.plate, best.g.v.plate) || fragmentoPermitido(c, best.g.v, (W.find((x) => x.g === best.g)?.w ?? 0) / ws, W.filter((x) => x.w / ws >= 0.05).map((x) => x.g.v))
    if (best && best.s / tot >= THETA && okFragA) {
      best.g.v.path.push({ node: c.node, t: c.t, via: 'corregido', read: c.plate, device: c.device, atras: true })
      best.g.v.path.sort((a, b) => a.t - b.t)
      c.usada = true
      if (c.orphan) c.orphan.absorbed = true
      corregidosAtras++
      cambios++
    }
  }
  if (!cambios) break
}

// ── Por eliminación: el que tenía que estar ahí en ese momento, aunque la lectura no diga nada ──
// Densidad medida del tiempo de tramo (no el hazard): cuánto se tarda típicamente de un punto al otro.
const densCache = new Map()
function densidad(from, to, e) {
  if (e <= 0) return 0
  const k = `${from}>${to}`
  if (!densCache.has(k)) {
    const hist = gapHist.get(k), n = hist ? hist.reduce((a, b) => a + b, 0) : 0
    densCache.set(k, n >= 8 ? hist.map((_, i) => ((hist[Math.max(0, i - 1)] + hist[i] + hist[Math.min(NB - 1, i + 1)]) / 3 + n * 0.001) / n) : null)
  }
  const d = densCache.get(k)
  if (!d) return e <= H8 ? 1 : 0
  return e > (NB - 1) * BIN ? d[NB - 1] * 0.1 : d[Math.floor(e / BIN)]
}
const densRel = (from, to, e) => { densidad(from, to, 1); const d = densCache.get(`${from}>${to}`); return d ? densidad(from, to, e) / Math.max(...d) : 1 }
const ELIM_NODOS = new Set(['san_lorenzo:Plataformas Volcables'])
// Calles 1 y 4: casi no se usan y sus capturas por eliminación caían en camiones de la calle 5 según el Excel (0 de 5):
// ven de costado la calle de al lado. No se usan para eliminar.
const ELIM_FUERA = new Set(['slzvolcablec1', 'slzvolcablec4'])
const libre = (c) => !c.usada && !NOT_TRUCK.test(c.attrs?.vehicleCategory ?? '') && !(c.orphan && !c.orphan.nn && isValidPlate(c.plate))
let porEliminacion = 0, entradaAtras = 0
// 1) Volcables SL: captura sin dueño en una calle → el camión que en ese momento tenía pendiente la descarga.
// APAGADO por defecto (ELIMINACION=1 para probar): con poco volumen acertaba la calle del Excel 49/49 (01–07/10), pero
// con volumen alto 47/66 y, endurecido, 5/9 (24–30/09): hay camiones descargando que no tenemos identificados.
for (let ronda = 0; process.env.ELIMINACION && ronda < 3; ronda++) {
  const gaps = visits.filter((v) => !v.orphan && !v.nn).flatMap(gapsOf).filter((g) => ELIM_NODOS.has(g.node))
  let cambios = 0
  for (const c of pool) {
    if (!libre(c) || !ELIM_NODOS.has(c.node) || ELIM_FUERA.has(String(c.device).toLowerCase())) continue
    const G = gaps.filter((g) => c.t > g.lo && c.t < g.hi && !visited(g.v, g.node))
    if (!G.length) continue
    // Tiempo desde el punto anterior y hasta el siguiente, y la marca del DSS (la única que discrimina: ×5,5 / ×0,25).
    const W = G.map((g) => ({ g, w: densidad(g.from, g.node, c.t - g.lo) * densidad(g.node, g.to, g.hi - c.t) * compareAttribute('marca', c.attrs?.vehicleBrand, mode(g.v.attrs.vehicleBrand)).lr }))
    const ws = W.reduce((a, x) => a + x.w, 0)
    const best = W.sort((a, b) => b.w - a.w)[0]
    // Único posible no alcanza: puede ser de un camión que no tenemos (26/09: 6 de 11 «únicos» caían en la calle
    // equivocada). Tiene que ser además un tiempo típico de los dos lados (25 % del máximo medido o más) y, si hay
    // varios, llevarse el 95 % del peso (con 0,80–0,95 acertaba 7 de 11; con 0,95 o más, 5 de 5).
    const tipico = densRel(best.g.from, best.g.node, c.t - best.g.lo) * densRel(best.g.node, best.g.to, best.g.hi - c.t) >= 0.25
    if (tipico && ws && best.w / ws >= 0.95) {
      best.g.v.path.push({ node: c.node, t: c.t, via: 'eliminacion', regla: G.length === 1 ? 'unico' : `tiempo ${(best.w / ws).toFixed(2)} de ${G.length}`, read: c.plate, device: c.device, atras: true })
      best.g.v.path.sort((a, b) => a.t - b.t)
      c.usada = true; if (c.orphan) c.orphan.absorbed = true
      porEliminacion++; cambios++
    }
  }
  if (!cambios) break
}
// 2) Entrada hacia atrás: el camión cuya primera lectura es después de la entrada (Calada, Balanza ingreso SL) toma
// la captura sin dueño de la entrada que mejor encaja con el tiempo típico hasta esa primera lectura, si la elección
// es mutua (esa captura lo elige a él y él a ella) y clara (60 % o más de cada lado).
{
  const faltaEntrada = visits.filter((v) => !v.orphan && !v.nn && v.exp?.length > 1 && !visited(v, v.exp[0]) && v.path.length).map((v) => { const p0 = v.path[0]; return { v, entrada: v.exp[0], primera: p0 } }).filter((x) => x.v.exp.includes(x.primera.node))
  const porEntrada = new Map()
  for (const f of faltaEntrada) { if (!porEntrada.has(f.entrada)) porEntrada.set(f.entrada, []); porEntrada.get(f.entrada).push(f) }
  for (const [entrada, F] of porEntrada) {
    // Candidatas: capturas sin dueño y visitas de una sola lectura en la entrada que nunca más aparecieron (la misma
    // pasada leída con otra patente: la visita quedó partida en dos). La patente parecida suma (readL).
    const solas = visits.filter((x) => !x.nn && !x.absorbed && x.path.length === 1 && x.path[0].node === entrada).map((x) => ({ node: entrada, t: x.path[0].t, plate: x.plate, device: x.path[0].device, attrs: null, sola: x }))
    const C = [...pool.filter((c) => libre(c) && c.node === entrada), ...solas]
    const M = F.map((f) => C.map((c) => (c.t < f.primera.t && c.sola !== f.v ? densidad(entrada, f.primera.node, f.primera.t - c.t) * Math.max(1, readL(c.plate, f.v.plate) / FRAG / 1e4) : 0)))
    const colSum = C.map((_, j) => F.reduce((a, _f, i) => a + M[i][j], 0))
    F.forEach((f, i) => {
      const rowSum = M[i].reduce((a, b) => a + b, 0)
      if (!rowSum) return
      let j = M[i].indexOf(Math.max(...M[i]))
      if (C[j].usada || M[i][j] / rowSum < 0.6 || M[i][j] / colSum[j] < 0.6) return
      f.v.path.unshift({ node: entrada, t: C[j].t, via: 'eliminacion', read: C[j].plate, device: C[j].device, atras: true })
      C[j].usada = true; if (C[j].orphan) C[j].orphan.absorbed = true; if (C[j].sola) C[j].sola.absorbed = C[j].sola.orphan = true
      entradaAtras++
    })
  }
}
console.log(`por eliminación: volcables ${porEliminacion} · entrada hacia atrás ${entradaAtras}`)
if (process.env.DEBUG_ELIM) { const fe = visits.filter((v) => !v.orphan && !v.nn && v.exp?.length > 1 && !visited(v, v.exp[0]) && v.path.length); const solas = visits.filter((v) => !v.nn && v.path.length === 1 && ENTRY.has(v.path[0].node)); const libresEnt = pool.filter((c) => !c.usada && ENTRY.has(c.node)); console.log('DEBUG sin entrada', fe.length, '· visitas de una sola lectura en la entrada', solas.length, '(válidas', solas.filter((v) => isValidPlate(v.plate)).length + ') · capturas libres en la entrada', libresEnt.length); const gv = visits.filter((v) => !v.orphan && !v.nn).flatMap(gapsOf).filter((g) => ELIM_NODOS.has(g.node)); const pv = pool.filter((c) => ELIM_NODOS.has(c.node)); console.log('DEBUG volcables: huecos', gv.length, '· capturas en pool', pv.length, '· libres', pv.filter((c) => !c.usada).length, '· con algún hueco', pv.filter((c) => !c.usada && gv.some((g) => c.t > g.lo && c.t < g.hi)).length, '· huecos por captura (media)', (pv.filter((c) => !c.usada).reduce((a, c) => a + gv.filter((g) => c.t > g.lo && c.t < g.hi).length, 0) / Math.max(1, pv.filter((c) => !c.usada).length)).toFixed(1)) }

// ── Contraste con el Excel: la muestra son los camiones que ingresaron en esos cuartos del día ──
const muestra = []
const seenOp = new Set()
for (const run of ['2026-09-21_2026-09-27', '2026-09-28_2026-10-04', '2026-10-05_2026-10-11']) {
  for (const r of json(`runs/windows/${run}/tables/excel_operations_with_truckflow.json`).rows) {
    const plate = plateOf(r.plate_normalized), ing = localMs(r.external_ingreso_at)
    if (!isValidPlate(plate) || !['RICARDONE', 'TERMINAL_EMBARQUE'].includes(r.planta_normalized) || !Number.isFinite(ing)) continue
    const base = Date.parse(`${DAY}T00:00:00-03:00`)
    const q = QS.find((q) => ing >= base + (-2 + (q - 1) * 6) * 3600_000 && ing < base + (4 + (q - 1) * 6) * 3600_000)
    if (!q || seenOp.has(r.external_operation_id)) continue
    seenOp.add(r.external_operation_id)
    const c = circuits.find((x) => x.id === r.resolved_executive_circuit_code)
    if (!c) continue
    muestra.push({ plate, q, ing, circuitExcel: c.id, exp: c.exp, plataforma: r.platform_normalized || null })
  }
}
const nombre = (v) => { if (v._n) return v._n; const k = {}; for (const p of v.path) if (isValidPlate(p.read)) k[p.read] = (k[p.read] ?? 0) + 1; return (v._n = Object.entries(k).sort((a, b) => b[1] - a[1])[0]?.[0] ?? v.plate) }
const porPunto = {}, porCamion = []
let nnUsados = 0
if (process.env.DEBUG_PLATE) for (const v of visits) if (v.plate === process.env.DEBUG_PLATE || v.path.some((p) => p.read === process.env.DEBUG_PLATE)) console.log('DEBUG', v.plate, v.orphan ? 'huérfana' : '', v.absorbed ? 'absorbida' : '', v.circuit, v.path.map((p) => p.node.split(':')[1] + '=' + p.read + '@' + new Date(p.t - 3 * 3600_000).toISOString().slice(5, 16)).join(' > '))
for (const m of muestra) {
  // La visita se llama como la patente válida que más leyeron las cámaras (no la primera: RKU605 era RKU685 leída
  // mal en Calada). Si el Excel no coincide con el nombre, vale otra lectura válida de la visita o 1 cambio.
  // La primera cámara puede ser horas antes del ingreso del Excel (espera afuera): se toma la visita más cercana.
  // Una visita de una sola lectura en un punto interno también es un camión (entró sin ser leído), salvo que esa
  // captura se la haya llevado otro camión al buscar antes de deducir (GCB347, CRO351).
  const enVentana = visits.filter((x) => !(x.orphan && x.absorbed) && x.path.some((p) => p.t >= m.ing - H12 && p.t <= m.ing + ESPERA_LARGA)).sort((a, b) => Math.min(...a.path.map((p) => Math.abs(p.t - m.ing))) - Math.min(...b.path.map((p) => Math.abs(p.t - m.ing))))
  let v = enVentana.find((x) => !x.nn && nombre(x) === m.plate) ?? enVentana.find((x) => !x.nn && x.path.some((p) => p.read === m.plate)) ?? enVentana.find((x) => !x.nn && editDist(nombre(x), m.plate) === 1)
  // Último recurso (solo para contrastar): el camión sin identificar que entró más cerca de la hora del Excel, ±40 min.
  // Desactivado por defecto: con decenas de sin identificar por día, la hora sola no dice cuál es (5 de 17 contra la
  // revisión a ojo). Los sin identificar cuentan como camiones que entraron, no como recuperados.
  if (!v && process.env.NN_MATCH) { v = visits.filter((x) => x.nn && !x.usadoNN && !(x.orphan && x.absorbed) && m.exp.includes(x.path[0].node) && Math.abs(x.path[0].t - 240_000 - m.ing) <= 40 * 60_000).sort((a, b) => m.exp.indexOf(a.path[0].node) - m.exp.indexOf(b.path[0].node) || Math.abs(a.path[0].t - m.ing) - Math.abs(b.path[0].t - m.ing))[0]; if (v) { v.usadoNN = true; nnUsados++; if (process.env.DEBUG_NN) console.log("NN", m.plate, "→", v.plate, new Date(v.path[0].t - 3 * 3600_000 - 240_000).toISOString().slice(5, 16), v.path[0].device) } }
  // El circuito del Excel se mantiene salvo que las cámaras lo contradigan.
  let exp = m.exp
  if (v) { const obs = v.path.map((p) => p.node); if (lcs(obs, exp) < new Set(obs).size && lcs(obs, v.exp) > lcs(obs, exp)) exp = v.exp }
  const at = exp.map((n) => v?.path.find((p) => p.node === n) ?? null)
  const firstI = at.findIndex(Boolean), lastI = at.map(Boolean).lastIndexOf(true)
  const estados = exp.map((n, i) => at[i] ? (at[i].via === 'camara' ? 'camara' : 'corregido') : lastI >= 0 && i < lastI ? 'deducido' : lastI >= 0 && i > lastI ? 'final' : 'falta')
  exp.forEach((n, i) => {
    if (EXCLUIDOS.has(n)) return
    const o = (porPunto[n] ??= { total: 0, camara: 0, corregido: 0, deducido: 0, final: 0, falta: 0 })
    o.total++
    o[estados[i]]++
  })
  porCamion.push({ plate: m.plate, q: m.q, plataforma: m.plataforma, circuito: exp === m.exp ? m.circuitExcel : `${v.circuit} (Excel ${m.circuitExcel})`, pasos: exp.map((n, i) => ({ node: n, estado: EXCLUIDOS.has(n) ? 'excluido' : estados[i], t: at[i] ? new Date(at[i].t - 240_000).toISOString() : null, tFeed: at[i] ? new Date(at[i].t).toISOString() : null, device: at[i]?.device, leyo: at[i]?.read, atras: at[i]?.atras, via: at[i]?.via, regla: at[i]?.regla })) })
}
const pc = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '—')
console.log(`Solo cámaras · muestra: ingresaron el ${DAY} en Q${QS.join(' y Q')} → ${muestra.length} camiones`)
console.log(`capturas descartadas: cámara mal apuntada ${descartadas.camara} · sin forma de patente ${descartadas.forma} · capturas dobles ${doblesDescartadas} · relecturas con 1 cambio ${relecturas}`)
console.log(`inventario armado con cámaras: ${visits.filter((v) => !v.orphan).length} visitas · corregidos al pasar: ${corregidosAdelante} · corregidos buscando antes de deducir: ${corregidosAtras} · capturas sin dueño: ${pool.filter((c) => !c.usada).length}`)
console.log('punto'.padEnd(34), 'total  cámara  corregido  deducido  final  falta   cámara%  completo%')
const T = { total: 0, camara: 0, corregido: 0, deducido: 0, final: 0, falta: 0 }
for (const [n, o] of Object.entries(porPunto).sort((a, b) => b[1].total - a[1].total)) {
  for (const k of Object.keys(T)) T[k] += o[k]
  console.log(n.padEnd(34), String(o.total).padStart(5), String(o.camara).padStart(7), String(o.corregido).padStart(10), String(o.deducido).padStart(9), String(o.final).padStart(6), String(o.falta).padStart(6), pc(o.camara, o.total).padStart(9), pc(o.total - o.falta, o.total).padStart(10))
}
console.log('TOTAL'.padEnd(34), String(T.total).padStart(5), String(T.camara).padStart(7), String(T.corregido).padStart(10), String(T.deducido).padStart(9), String(T.final).padStart(6), String(T.falta).padStart(6), pc(T.camara, T.total).padStart(9), pc(T.total - T.falta, T.total).padStart(10))
const completos = porCamion.filter((c) => c.pasos.every((p) => p.estado !== 'falta')).length
const soloCam = porCamion.filter((c) => c.pasos.every((p) => p.estado === 'camara' || p.estado === 'excluido')).length
console.log(`camiones: ${porCamion.length} · con todos sus pasos: ${completos} (${pc(completos, porCamion.length)}) · todos leídos por cámara: ${soloCam}`)
console.log(`camiones sin identificar abiertos en la entrada: ${sinIdentificar} · usados para un camión del Excel: ${nnUsados}`)
fs.mkdirSync(path.join(root, 'outputs/demostracion_camaras'), { recursive: true })
fs.writeFileSync(path.join(root, `outputs/demostracion_camaras/${DAY}_Q${QS.join('Q')}.json`), JSON.stringify({ dia: DAY, cuartos: QS, porPunto, porCamion, decisiones }, null, 1) + '\n')
