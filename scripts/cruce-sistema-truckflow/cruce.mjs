/**
 * Cruce Sistema de camiones ↔ TruckFlow en los puntos clave (Preingreso, Ingreso, Calada, Balanza
 * de Ricardone y del puerto), con recuperación de lecturas sin patente o con patente mal leída.
 *
 * Etapas por movimiento y punto:
 *  1. exacta      — la cámara leyó la patente del camión (o del acoplado, en traseras).
 *  2. formato     — lectura con caracteres confundidos (B↔8, O↔0, S↔5…) que, forzada al formato
 *                   argentino (AAA999 / AA999AA), da la patente exacta.
 *  3. parecida    — lectura parecida (Levenshtein ponderado OCR ≥ 0,6) en la hora esperada del punto.
 *  4. por_hora    — lectura sin patente útil (vacía, cortada o inválida) que es la ÚNICA candidata
 *                   para el ÚNICO movimiento pendiente en la ventana de hora esperada del punto.
 *  5. sin_lectura — la cámara no vio nada atribuible.
 *
 * La hora esperada en cada punto se APRENDE de los cruces exactos: desfase contra el ingreso del
 * Sistema (≈ alta en Preingreso, ±2 min), el calado, la salida o la lectura en otro punto del mismo
 * viaje; se usa el ancla con menor dispersión que tenga el movimiento.
 *
 * Validación: se borran las patentes de una muestra de cruces exactos y se mide cuántas recupera
 * (bien / mal / nada = n).
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/cruce.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 * Salida: reportes/cruce-sistema-truckflow/<from>_<to>/ (resumen.json, movimientos.csv, recuperadas.csv,
 *         nunca-cruzaron.csv, fuera-del-sistema.csv)
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos, arDay, arIso, noCamion } from './sistema.mjs'
import { isValidPlate } from '../../server/plantState/plateIdentification.mjs'

const args = process.argv.slice(2)
const argOf = (k) => {
  const i = args.indexOf(k)
  return i >= 0 ? String(args[i + 1] ?? '') : ''
}
const MIN = 60_000

// ── Puntos clave ────────────────────────────────────────────────────────────────────────────────
export const PUNTOS = [
  { id: 'PRE', label: 'Preingreso Ricardone', front: /^RicPreIng(In|Eg)Fr$/, rear: /^RicPreIng(In|Eg)Tr$/ },
  { id: 'ING_RIC', label: 'Ingreso Ricardone', front: /^RicIngCamFrente$/, rear: /^RicIngCamTrasera$/ },
  { id: 'CAL_RIC', label: 'Calada Ricardone', front: /^RicCal(0\d|Liq)$/ },
  { id: 'BAL_ING_RIC', label: 'Balanza ingreso Ricardone', front: /^RicB\dIngreso$/ },
  { id: 'BAL_EGR_RIC', label: 'Balanza egreso Ricardone', front: /^RicB\dEgreso$/ },
  { id: 'ING_SL', label: 'Ingreso puerto', front: /^SLZIngCamFrente$/, rear: /^SLZIngCamTrasera$/ },
  { id: 'CAL_SL', label: 'Calada puerto', front: /^SLZCalado$/ },
  { id: 'BAL_ING_SL', label: 'Balanza ingreso puerto', front: /^SLZBalIngFte$/, rear: /^SLZBalIngTras$/ },
  { id: 'BAL_EGR_SL', label: 'Balanza egreso puerto', front: /^SLZBalSC[12]Fte$/, rear: /^SLZBalSC[12]Tras$/ },
]
const puntoDe = new Map()
const pointOf = (dev) => {
  if (puntoDe.has(dev)) return puntoDe.get(dev)
  let res = null
  for (const p of PUNTOS) {
    if (p.front.test(dev)) res = { id: p.id, rear: false }
    else if (p.rear?.test(dev)) res = { id: p.id, rear: true }
    if (res) break
  }
  puntoDe.set(dev, res)
  return res
}

// ── Patentes ────────────────────────────────────────────────────────────────────────────────────
const TO_DIGIT = { O: '0', D: '0', Q: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', G: '6', B: '8', A: '4' }
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B', 4: 'A', 7: 'T' }
/** Fuerza la lectura a los formatos argentinos (AAA999, AA999AA) cambiando solo confusiones OCR. */
function formatRepairs(read) {
  const out = []
  for (const mask of ['LLLDDD', 'LLDDDLL']) {
    if (read.length !== mask.length) continue
    let s = ''
    let ok = true
    for (let i = 0; i < mask.length && ok; i++) {
      const c = read[i]
      if (mask[i] === 'D') s += /\d/.test(c) ? c : (TO_DIGIT[c] ?? ((ok = false), c))
      else s += /[A-Z]/.test(c) ? c : (TO_LETTER[c] ?? ((ok = false), c))
    }
    if (ok && s !== read) out.push(s)
  }
  return out
}
/**
 * Pares que el LPR confunde en chapas gastadas o sucias (medidos en las lecturas de esta planta,
 * p. ej. GVD086→GVB886, THF483→IVF483), además de los clásicos 0/O, 8/B, 1/I, 5/S, 2/Z.
 */
const CONFUSABLE = new Set(
  ['0O', '0D', '0Q', '8B', '1I', '1L', '5S', '2Z', '6G', '4A', 'MN', 'UV', 'VY', 'HM', 'EF', 'CG', 'DB', '80', '86', '38', 'PF', 'RB', 'PR', 'IT', 'MW', 'NH', 'UO', 'VW', 'KX', 'QO', 'CO', 'UD', '7T', '71', 'J1', 'IL', 'HI', 'EB', 'ZT']
    .flatMap((p) => [p, p[1] + p[0]])
)
/** Levenshtein ponderado: confusión LPR 0,3 · otra sustitución 1 · borrado/inserción 0,6 (`gapReal` = costo de saltear un carácter de la patente real). */
function editCost(a, b, gapReal = 0.6) {
  const n = a.length
  const m = b.length
  let prev = Array.from({ length: m + 1 }, (_, j) => j * gapReal)
  for (let i = 1; i <= n; i++) {
    const cur = [i * 0.6]
    for (let j = 1; j <= m; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : CONFUSABLE.has(a[i - 1] + b[j - 1]) ? 0.3 : 1
      cur[j] = Math.min(prev[j - 1] + sub, prev[j] + 0.6, cur[j - 1] + gapReal)
    }
    prev = cur
  }
  return prev[m]
}
/** Parecido 0–1 de una lectura (aunque sea un fragmento) con una patente real. */
function plateScore(read, real) {
  if (!read || !real) return 0
  if (read === real) return 1
  if (read.length >= 6) return Math.max(0, 1 - editCost(read, real) / real.length)
  if (read.length < 3) return 0
  // Fragmento (lectura cortada, EK935 de EKR935): los caracteres que faltan de la patente no cuestan;
  // vale menos cuanto más corto.
  const cost = editCost(read, real, 0)
  return Math.max(0, (1 - cost / read.length) * (0.45 + 0.05 * read.length))
}

// ── Carga ───────────────────────────────────────────────────────────────────────────────────────
console.error('cargando lecturas…')
const allReads = loadReads()
const movsAll = loadMovimientos()
const tfFrom = arDay(allReads[0].t)
const tfTo = arDay(allReads.at(-1).t)
const FROM = argOf('--from') || arDay(movsAll[0].ing)
const TO = argOf('--to') || tfTo
const sistemaPlates = new Set(movsAll.flatMap((m) => [m.plate, m.acoplado].filter(Boolean)))
const movs = movsAll.filter((m) => arDay(m.ing) >= FROM && arDay(m.ing) <= TO && arDay(m.ing) >= tfFrom && arDay(m.ing) <= tfTo)
// Ventana de visita: desde 60 min antes del ingreso hasta 30 min después de la salida (o 14 h).
for (const m of movs) {
  m.ws = m.ing - 60 * MIN
  m.we = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
  m.hits = {} // punto → {t, read, how, score}
}
console.error(`movimientos ${movs.length} (${FROM} → ${TO}), lecturas ${allReads.length}`)

// Lecturas en puntos clave, con índice por punto y hora.
const reads = []
for (const r of allReads) {
  const p = pointOf(r.dev)
  if (!p) continue
  reads.push({ ...r, punto: p.id, rear: p.rear, owner: null })
}
const readsByPoint = new Map(PUNTOS.map((p) => [p.id, []]))
for (const r of reads) readsByPoint.get(r.punto).push(r)
const lowerBound = (arr, t) => {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}
const readsIn = (punto, a, b) => {
  const arr = readsByPoint.get(punto)
  const out = []
  for (let i = lowerBound(arr, a); i < arr.length && arr[i].t <= b; i++) out.push(arr[i])
  return out
}

// Patentes del Sistema activas a cada hora (para saber si una lectura «es de otro»).
const movsByPlate = new Map()
for (const m of movs)
  for (const p of [m.plate, m.acoplado]) {
    if (!p) continue
    if (!movsByPlate.has(p)) movsByPlate.set(p, [])
    movsByPlate.get(p).push(m)
  }
const ownersOf = (plate, t) => (movsByPlate.get(plate) ?? []).filter((m) => t >= m.ws && t <= m.we)

// ── 1. Exacta ───────────────────────────────────────────────────────────────────────────────────
const setHit = (m, r, how, score) => {
  const prev = m.hits[r.punto]
  if (prev && prev.rank <= RANK[how] && !(prev.rank === RANK[how] && prev.score < score)) return false
  if (prev?.read) prev.read.owner = null
  m.hits[r.punto] = { t: r.t, read: r, how, score, rank: RANK[how] }
  r.owner = m
  return true
}
/** Nivel permitido en el punto (sin validación, o durante ella, todos). */
const NIVELES_OK = new Map()
const habilitado = (punto, how) => !NIVELES_OK.size || NIVELES_OK.get(punto)?.has(how)
const RANK = { exacta: 0, formato: 1, parecida: 2, por_hora: 3, otra_patente: 4 }
/** Asignaciones solo por hora: exigen ser la única lectura para el único movimiento pendiente. */
const UNICA = new Set(['por_hora', 'otra_patente'])
/** Accesos: la hora del Sistema (alta en Preingreso) los ubica con ±2–5 min. */
const ACCESOS = new Set(['PRE', 'ING_RIC', 'ING_SL'])
for (const r of reads) {
  if (!r.plate) continue
  const own = ownersOf(r.plate, r.t)
  if (!own.length) continue
  // Si la patente tiene dos movimientos abiertos (ingreso + egreso del mismo viaje), se queda con el
  // de ingreso más cercano anterior.
  const m = own.sort((a, b) => Math.abs(r.t - a.ing) - Math.abs(r.t - b.ing))[0]
  r.exactOwner = m
  const prev = m.hits[r.punto]
  // En un mismo punto, la lectura exacta más cercana a la hora del ingreso + mediana se fija después;
  // por ahora se guarda la primera.
  if (!prev) setHit(m, r, 'exacta', 1)
}
const exactas = movs.filter((m) => Object.keys(m.hits).length).length
console.error(`exactas: ${exactas} movimientos con ≥1 punto`)

// ── Aprendizaje de desfases ─────────────────────────────────────────────────────────────────────
// Ancla: 'ing' | 'calado' | 'sal' | 'P:<punto>' (lectura exacta en otro punto del mismo movimiento).
const anchorsOf = (m) => {
  const a = { ing: m.ing }
  if (Number.isFinite(m.calado)) a.calado = m.calado
  if (Number.isFinite(m.sal)) a.sal = m.sal
  for (const [p, h] of Object.entries(m.hits)) a[`P:${p}`] = h.t
  return a
}
const quant = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]
function learnOffsets() {
  const raw = {}
  for (const m of movs) {
    const exact = Object.entries(m.hits).filter(([, h]) => h.how === 'exacta')
    if (!exact.length) continue
    const anc = anchorsOf(m)
    for (const [p, h] of exact)
      for (const [k, t] of Object.entries(anc)) {
        if (k === `P:${p}`) continue
        const key = `${p}|${m.planta}|${k}`
        ;(raw[key] ??= []).push((h.t - t) / MIN)
      }
  }
  const model = {}
  for (const [key, arr] of Object.entries(raw)) {
    if (arr.length < 40) continue
    const s = arr.sort((a, b) => a - b)
    const p05 = quant(s, 0.05)
    const p25 = quant(s, 0.25)
    const p50 = quant(s, 0.5)
    const p75 = quant(s, 0.75)
    const p95 = quant(s, 0.95)
    model[key] = { n: s.length, p05, p25, p50, p75, p95, spread: Math.max(1, p95 - p05) }
  }
  return model
}
const OFFSETS = learnOffsets()

/** Ventana de hora esperada del movimiento en el punto: el ancla disponible de menor dispersión. */
function expectedWindow(m, punto) {
  let best = null
  for (const [k, t] of Object.entries(anchorsOf(m))) {
    if (k === `P:${punto}`) continue
    const o = OFFSETS[`${punto}|${m.planta}|${k}`]
    if (!o) continue
    if (!best || o.spread < best.o.spread) best = { k, t, o }
  }
  if (!best) return null
  // Nunca antes de 60 min del ingreso ni después del fin de visita.
  // Margen de 1,5 min: el Sistema guarda la hora al minuto.
  const a = Math.max(m.ws, best.t + (best.o.p05 - 1.5) * MIN)
  const b = Math.min(m.we, best.t + (best.o.p95 + 1.5) * MIN)
  if (b < a) return null
  return { a, b, center: best.t + best.o.p50 * MIN, scale: Math.max(1, (best.o.p75 - best.o.p25) / 1.35) * MIN, anchor: best.k }
}
/** Probabilidad (0–1) de que el movimiento pase por el punto, según los cruces exactos del mismo producto. */
const passRate = (() => {
  const c = {}
  for (const m of movs) {
    if (!Object.keys(m.hits).length) continue
    const k = `${m.planta}|${m.producto}|${m.mov}`
    c[k] ??= { n: 0 }
    c[k].n++
    for (const p of Object.keys(m.hits)) c[k][p] = (c[k][p] ?? 0) + 1
  }
  return (m, p) => {
    const x = c[`${m.planta}|${m.producto}|${m.mov}`]
    return x && x.n >= 20 ? (x[p] ?? 0) / x.n : 0.5
  }
})()

// ── 2–4. Recuperación ───────────────────────────────────────────────────────────────────────────
/** Lectura libre: nadie del Sistema con esa patente exacta estaba en planta. Traseras pegadas a una frontal = acoplado. */
const isFree = (r) => !r.owner && !r.exactOwner
const devPoint = (dev) => pointOf(dev)?.id ?? dev
const timesByPlate = new Map()
for (const r of allReads) {
  if (!r.plate || r.plate.length < 6) continue
  if (!timesByPlate.has(r.plate)) timesByPlate.set(r.plate, [])
  timesByPlate.get(r.plate).push(r)
}
/** La misma patente leída en OTRO punto dentro de ±8 h: es un vehículo real, no un error de lectura. */
const seenElsewhere = (r, plate) => (timesByPlate.get(plate) ?? []).some((x) => Math.abs(x.t - r.t) <= 8 * 60 * MIN && devPoint(x.dev) !== r.punto)
const pairedRear = (r) => r.rear && readsIn(r.punto, r.t - 90_000, r.t + 90_000).some((x) => !x.rear && x !== r)

function recoverPoint(punto, { holdout = null, only = null } = {}) {
  const cands = [] // {m, r, how, score}
  for (const m of only ?? movs) {
    if (m.hits[punto] && !UNICA.has(m.hits[punto].how)) continue
    if (passRate(m, punto) < 0.15) continue
    const w = expectedWindow(m, punto)
    if (!w) continue
    for (const r of readsIn(punto, w.a, w.b)) {
      if (!isFree(r) || pairedRear(r)) continue
      const plate = holdout?.has(r) ? holdout.get(r) : r.plate
      const dt = (r.t - w.center) / w.scale
      const timeLik = Math.exp(-0.5 * dt * dt)
      let how = null
      let ps = 0
      const valida = isValidPlate(plate)
      if (plate && formatRepairs(plate).some((x) => x === m.plate || x === m.acoplado)) {
        how = 'formato'
        ps = 0.97
      } else {
        ps = Math.max(plateScore(plate, m.plate), plateScore(plate, m.acoplado))
        if (valida) {
          // Patente bien formada: o es un carácter confundido, o es OTRO vehículo. Si la misma patente
          // se lee en otra cámara del viaje, es un vehículo real (no un error de lectura).
          // Si se lee igual en otras cámaras puede ser la chapa gastada (FF→PP): vale solo si esa patente
          // nunca figuró en el Sistema.
          if (ps >= 0.8 && (!seenElsewhere(r, plate) || !sistemaPlates.has(plate))) how = 'parecida'
          else if (ACCESOS.has(punto) && ps < 0.8) how = 'otra_patente'
        } else if (ps >= 0.6) how = 'parecida'
        else if (!plate || plate.length < 6 || ps >= 0.25) how = 'por_hora'
      }
      if (!how) continue
      if (!habilitado(punto, how)) continue
      // Una lectura parecida a OTRA patente del Sistema en planta no es de este camión.
      if (plate && how !== 'formato') {
        const otra = competingPlate(plate, r.t, m)
        if (otra >= 0.6 && otra > ps + 0.05) continue
      }
      cands.push({ m, r, how, score: (UNICA.has(how) ? 0.3 : ps) * (0.3 + 0.7 * timeLik), timeLik })
    }
  }
  // Por hora: exige unicidad (una sola lectura para el movimiento y un solo movimiento para la lectura).
  const byM = new Map()
  const byR = new Map()
  for (const c of cands) {
    if (!byM.has(c.m)) byM.set(c.m, [])
    byM.get(c.m).push(c)
    if (!byR.has(c.r)) byR.set(c.r, [])
    byR.get(c.r).push(c)
  }
  const ok = cands.filter((c) => {
    if (!UNICA.has(c.how)) return true
    // La misma pasada llega repetida (evento + alertas, frente + otra cámara del punto): no es rival.
    const mismaPasada = (x) => Math.abs(x.r.t - c.r.t) <= 90_000 && (x.r.plate === c.r.plate || !x.r.plate || !c.r.plate)
    const others = byM.get(c.m).filter((x) => x !== c && !mismaPasada(x))
    const rivals = byR.get(c.r).filter((x) => x !== c)
    return c.timeLik >= 0.3 && others.every((x) => x.score * 3 < c.score) && rivals.every((x) => x.score * 3 < c.score)
  })
  ok.sort((a, b) => RANK[a.how] - RANK[b.how] || b.score - a.score)
  const out = []
  for (const c of ok) {
    if (c.r.owner) continue
    if (c.m.hits[punto] && c.m.hits[punto].rank <= RANK[c.how]) continue
    if (setHit(c.m, c.r, c.how, c.score)) out.push(c)
  }
  return out
}
const plateIndexCache = new Map()
/** Mejor parecido de la lectura con otra patente del Sistema que estaba en planta a esa hora. */
function competingPlate(plate, t, self) {
  const k = `${plate}|${Math.floor(t / (30 * MIN))}`
  let list = plateIndexCache.get(k)
  if (!list) {
    list = []
    for (const m of activeAt(t)) list.push(m)
    plateIndexCache.set(k, list)
  }
  let best = 0
  for (const m of list) {
    if (m === self || m.plate === self.plate) continue
    best = Math.max(best, plateScore(plate, m.plate), m.acoplado ? plateScore(plate, m.acoplado) : 0)
  }
  return best
}
const movsByIng = [...movs].sort((a, b) => a.ing - b.ing)
function activeAt(t) {
  const out = []
  let lo = 0
  let hi = movsByIng.length
  const from = t - 48 * 60 * MIN
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (movsByIng[mid].ing < from) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < movsByIng.length && movsByIng[i].ing <= t + 60 * MIN; i++) if (t >= movsByIng[i].ws && t <= movsByIng[i].we) out.push(movsByIng[i])
  return out
}

// ── Validación: en una muestra de cruces exactos se borra o altera la patente leída ────────────
/** Un carácter cambiado por otro cualquiera (determinístico): simula una lectura mala que no es confusión OCR. */
const alterar = (plate, i) => {
  const pos = i % plate.length
  const pool = /\d/.test(plate[pos]) ? '0123456789' : 'ABCDEFGHJKLMNPRSTUVWXYZ'
  let c = pool[(i * 7 + 3) % pool.length]
  if (c === plate[pos]) c = pool[(i * 7 + 4) % pool.length]
  return plate.slice(0, pos) + c + plate.slice(pos + 1)
}
function validate() {
  const res = {}
  for (const modo of ['borrada', 'alterada'])
    for (const p of PUNTOS.map((x) => x.id)) {
      const sample = movs.filter((m) => m.hits[p]?.how === 'exacta' && !m.hits[p].read.rear).filter((_, i) => i % 25 === 0)
      const saved = sample.map((m) => ({ m, h: m.hits[p] }))
      const holdout = new Map()
      saved.forEach(({ m, h }, i) => {
        delete m.hits[p]
        h.read.owner = null
        h.read.exactOwnerSaved = h.read.exactOwner
        h.read.exactOwner = null
        holdout.set(h.read, modo === 'borrada' ? '' : alterar(h.read.plate, i))
      })
      // Todos los pendientes compiten (si no, «por hora» no ve rivales y la validación sale optimista).
      recoverPoint(p, { holdout, only: movs.filter((m) => !m.hits[p]) })
      const c = { n: saved.length, bien: 0, mal: 0, nada: 0 }
      for (const { m, h } of saved) {
        const got = m.hits[p]
        if (!got) c.nada++
        else if (got.read === h.read) c.bien++
        else c.mal++
      }
      for (const { m, h } of saved) {
        if (m.hits[p]?.read) m.hits[p].read.owner = null
        m.hits[p] = h
        h.read.owner = m
        h.read.exactOwner = h.read.exactOwnerSaved
      }
      for (const r of readsByPoint.get(p)) if (r.owner && r.owner.hits[p]?.read !== r) r.owner = null
      for (const m of movs) if (m.hits[p] && (m.hits[p].read.owner !== m || m.hits[p].how !== 'exacta')) delete m.hits[p]
      for (const r of readsByPoint.get(p)) if (r.owner && r.owner.hits[p]?.read !== r) r.owner = null
      ;(res[modo] ??= {})[p] = c
      console.error(`validación ${modo} ${p}: n=${c.n} bien=${c.bien} mal=${c.mal} nada=${c.nada}`)
    }
  return res
}
const validacion = args.includes('--sin-validacion') ? null : validate()
/**
 * Cada punto usa solo los niveles que pasaron la prueba a ciegas con ≥ 90 % de precisión:
 * «por hora» según la prueba de patente borrada; «parecida» según la de patente alterada.
 * (BAL_ING_SL por hora, por ejemplo, acertaba 2 de 69: llegan muchos camiones juntos.)
 */
const PRECISION_MIN = 0.9
const pasa = (c) => c && c.bien + c.mal >= 10 && c.bien / (c.bien + c.mal) >= PRECISION_MIN
if (validacion)
  for (const { id } of PUNTOS) {
    const ok = new Set(['exacta', 'formato'])
    if (pasa(validacion.borrada[id])) ok.add('por_hora').add('otra_patente')
    if (pasa(validacion.alterada[id])) ok.add('parecida')
    NIVELES_OK.set(id, ok)
    console.error(`niveles ${id}: ${[...ok].join(' ')}`)
  }
// La validación deja todo como estaba: solo cruces exactos.
for (const m of movs) for (const [p, h] of Object.entries(m.hits)) if (h.how !== 'exacta') delete m.hits[p]
for (const r of reads) if (r.owner && r.owner.hits[r.punto]?.read !== r) r.owner = null

// Dos vueltas: lo recuperado en un punto sirve de ancla para el siguiente.
for (let vuelta = 0; vuelta < 2; vuelta++)
  for (const p of PUNTOS) {
    const got = recoverPoint(p.id)
    console.error(`vuelta ${vuelta + 1} ${p.id}: +${got.length}`)
  }

// ── Estado por movimiento ───────────────────────────────────────────────────────────────────────
/** Lectura exacta de la patente en CUALQUIER otra cámara (volcables, salidas…) dentro de la visita. */
const exactaEnOtraCamara = (m) =>
  [m.plate, m.acoplado].some((p) => p && (timesByPlate.get(p) ?? []).some((x) => x.t >= m.ws && x.t <= m.we && !pointOf(x.dev)))
const RECUPERA = new Set(['formato', 'parecida', 'por_hora'])
for (const m of movs) {
  const hs = Object.values(m.hits)
  m.estado = hs.some((h) => h.how === 'exacta')
    ? 'cruzó'
    : hs.some((h) => RECUPERA.has(h.how))
      ? 'recuperado'
      : exactaEnOtraCamara(m)
        ? 'solo_otras_camaras'
        : hs.some((h) => h.how === 'otra_patente')
          ? 'patente_distinta'
          : 'nunca_cruzó'
}

// ── Salida ──────────────────────────────────────────────────────────────────────────────────────
const outDir = join(OUT_DIR, `${FROM}_${TO}`)
mkdirSync(outDir, { recursive: true })
const csv = (rows) => '﻿' + rows.map((r) => r.map((x) => (/[",;\n]/.test(String(x ?? '')) ? `"${String(x).replace(/"/g, '""')}"` : (x ?? ''))).join(',')).join('\n')
const KEY = PUNTOS.map((p) => p.id)
const ESTADOS = ['cruzó', 'recuperado', 'solo_otras_camaras', 'patente_distinta', 'nunca_cruzó']
const cuenta = (arr) => Object.fromEntries(ESTADOS.map((e) => [e, arr.filter((m) => m.estado === e).length]))
// Sin ninguna lectura exacta en puntos clave: lo que había que resolver.
const sinExactaClave = (m) => !Object.values(m.hits).some((h) => h.how === 'exacta')

const resumen = {
  generado: new Date().toISOString(),
  desde: FROM,
  hasta: TO,
  movimientos: movs.length,
  noCamionesExcluidos: noCamion.n,
  validacion,
  global: { ...cuenta(movs), sinExactaEnPuntosClave: movs.filter(sinExactaClave).length },
  porPunto: {},
  porMes: {},
  porPlanta: {},
  porProducto: {},
  offsets: OFFSETS,
}
for (const p of KEY) {
  const c = { label: PUNTOS.find((x) => x.id === p).label, esperados: 0, exacta: 0, formato: 0, parecida: 0, por_hora: 0, otra_patente: 0, sin_lectura: 0 }
  for (const m of movs) {
    if (passRate(m, p) < 0.5) continue
    c.esperados++
    c[m.hits[p]?.how ?? 'sin_lectura']++
  }
  resumen.porPunto[p] = c
}
const agrupa = (keyOf) => {
  const g = {}
  for (const m of movs) (g[keyOf(m)] ??= []).push(m)
  return Object.fromEntries(Object.entries(g).map(([k, arr]) => [k, { movimientos: arr.length, sinExactaEnPuntosClave: arr.filter(sinExactaClave).length, ...cuenta(arr) }]))
}
resumen.porMes = agrupa((m) => arDay(m.ing).slice(0, 7))
resumen.porPlanta = agrupa((m) => m.planta)
resumen.porProducto = agrupa((m) => m.producto)

const fmtHit = (h) => (h ? `${h.how}:${h.read.plate || '∅'}@${arIso(h.t).slice(11)}` : '')
writeFileSync(
  join(outDir, 'movimientos.csv'),
  csv([
    ['id', 'fuente', 'planta', 'mov', 'patente', 'acoplado', 'producto', 'plataforma', 'ingreso', 'salida', 'estado', ...KEY],
    ...movs.map((m) => [m.id, m.fuente, m.planta, m.mov, m.plate, m.acoplado, m.producto, m.plataforma, arIso(m.ing), arIso(m.sal), m.estado, ...KEY.map((p) => fmtHit(m.hits[p]))]),
  ])
)
const asignadas = []
for (const m of movs) for (const [p, h] of Object.entries(m.hits)) if (h.how !== 'exacta') asignadas.push({ m, p, h })
asignadas.sort((a, b) => a.h.t - b.h.t)
// Una fila por movimiento × punto con la cámara que leyó (para el informe cámara por cámara).
writeFileSync(
  join(outDir, 'por-punto.csv'),
  csv([
    ['id', 'planta', 'punto', 'como', 'camara', 'trasera', 'lectura_camara', 'hora_camara'],
    ...movs.flatMap((m) => KEY.map((p) => {
      const h = m.hits[p]
      if (!h) return [m.id, m.planta, p, 'sin_lectura', '', '', '', '']
      return [m.id, m.planta, p, h.how, h.read.dev, pointOf(h.read.dev)?.rear ? 'si' : '', h.read.plate, arIso(h.t)]
    })),
  ])
)
writeFileSync(
  join(outDir, 'recuperadas.csv'),
  csv([
    ['punto', 'como', 'score', 'patente_sistema', 'lectura_camara', 'camara', 'hora_camara', 'ingreso_sistema', 'producto', 'estado_mov', 'id', 'alerta', 'confianza_lpr', 'color', 'tipo'],
    ...asignadas.map(({ m, p, h }) => [p, h.how, h.score.toFixed(2), m.plate, h.read.plate || '(vacía)', h.read.dev, arIso(h.t), arIso(m.ing), m.producto, m.estado, m.id, h.read.code, h.read.conf ?? '', h.read.color, h.read.cat]),
  ])
)
// Correcciones listas para aplicar sobre las lecturas crudas (sin «otra_patente»: esa es para revisar).
writeFileSync(
  join(outDir, 'correcciones-patentes.json'),
  JSON.stringify(
    asignadas
      .filter(({ h }) => RECUPERA.has(h.how))
      .map(({ m, p, h }) => ({ hora: new Date(h.t).toISOString(), camara: h.read.dev, punto: p, lectura: h.read.plate, patente: m.plate, como: h.how, score: +h.score.toFixed(2), movimiento: m.id })),
    null,
    1
  )
)
const lecturasCerca = (m) =>
  ['PRE', 'ING_RIC', 'ING_SL']
    .flatMap((p) => readsIn(p, m.ing - 5 * MIN, m.ing + 5 * MIN).filter((r) => !r.rear))
    .map((r) => `${r.plate || '∅'}${r.owner ? `→${r.owner.plate}` : r.exactOwner ? `=${r.exactOwner.plate}` : ''}`)
    .join(' ')
writeFileSync(
  join(outDir, 'nunca-cruzaron.csv'),
  csv([
    ['id', 'fuente', 'planta', 'mov', 'patente', 'acoplado', 'producto', 'plataforma', 'ingreso', 'salida', 'estado', 'lectura_propuesta', 'lecturas_accesos_±5min'],
    ...movs
      .filter((m) => m.estado === 'nunca_cruzó' || m.estado === 'patente_distinta')
      .map((m) => {
        const op = Object.entries(m.hits).find(([, h]) => h.how === 'otra_patente')
        return [m.id, m.fuente, m.planta, m.mov, m.plate, m.acoplado, m.producto, m.plataforma, arIso(m.ing), arIso(m.sal), m.estado, op ? `${op[1].read.plate}@${op[0]} ${arIso(op[1].t).slice(11)}` : '', lecturasCerca(m)]
      }),
  ])
)
// Al revés: vehículos que las cámaras leyeron bien (misma patente en ≥2 puntos el mismo día) y que
// el Sistema no tiene en ningún momento del período.
const fuera = new Map()
const desdeMs = Date.parse(`${FROM}T03:00:00Z`)
const hastaMs = Date.parse(`${TO}T03:00:00Z`) + 86400_000
for (const r of allReads) {
  if (r.t < desdeMs || r.t > hastaMs || !isValidPlate(r.plate) || sistemaPlates.has(r.plate)) continue
  const p = pointOf(r.dev)
  if (p?.rear) continue
  const k = `${r.plate}|${arDay(r.t)}`
  const x = fuera.get(k) ?? { plate: r.plate, puntos: new Set(), lecturas: 0, ultima: r.t }
  x.puntos.add(p?.id ?? r.dev)
  x.lecturas++
  x.ultima = r.t
  fuera.set(k, x)
}
const fueraVisitas = [...fuera.values()].filter((x) => x.puntos.size >= 2)
const fueraPorPatente = new Map()
for (const v of fueraVisitas) {
  const x = fueraPorPatente.get(v.plate) ?? { plate: v.plate, dias: 0, accesos: 0, lecturas: 0, puntos: new Set(), ultima: 0 }
  x.dias++
  x.lecturas += v.lecturas
  for (const p of v.puntos) x.puntos.add(p)
  if (ACCESOS.has([...v.puntos].find((p) => ACCESOS.has(p)))) x.accesos++
  x.ultima = Math.max(x.ultima, v.ultima)
  fueraPorPatente.set(v.plate, x)
}
const fueraRows = [...fueraPorPatente.values()].sort((a, b) => b.dias - a.dias || b.lecturas - a.lecturas)
resumen.fueraDelSistema = { patentes: fueraRows.length, visitas: fueraVisitas.length, recurrentes3dias: fueraRows.filter((x) => x.dias >= 3).length }
writeFileSync(
  join(outDir, 'fuera-del-sistema.csv'),
  csv([['patente', 'dias', 'dias_por_acceso', 'lecturas', 'puntos', 'ultima'], ...fueraRows.map((x) => [x.plate, x.dias, x.accesos, x.lecturas, [...x.puntos].join(' '), arIso(x.ultima)])])
)
resumen.recuperadasPorTipo = {}
for (const { p, h } of asignadas) resumen.recuperadasPorTipo[`${p}|${h.how}`] = (resumen.recuperadasPorTipo[`${p}|${h.how}`] ?? 0) + 1
writeFileSync(join(outDir, 'resumen.json'), JSON.stringify(resumen, null, 2))
console.log(JSON.stringify({ global: resumen.global, fuera: resumen.fueraDelSistema }, null, 1))
for (const [k, v] of Object.entries(resumen.porPunto)) console.log(k, JSON.stringify(v))
console.error(`→ ${outDir}`)
