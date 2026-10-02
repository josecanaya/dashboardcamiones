/**
 * Informe de reconocimiento por cámara: de los camiones que DEBÍAN pasar por cada punto según su
 * circuito, cuántos leyó la cámara. Día (06–18) vs noche (18–06), hora Argentina.
 *
 * Universo (denominador): movimientos del Excel (`excel_operations_with_truckflow` de las
 * ventanas guardadas) con fecha de salida dentro del rango y circuito ejecutivo resuelto.
 * Esperado: nodos con cámara del circuito en el modelo Nodo Sur (`nodoSur.generated.ts`).
 * Leído: evento crudo Truckflow de una cámara de ese nodo con la patente del movimiento (exacta u
 * OCR tolerante) dentro de [ingreso Excel − 45 min, salida Excel + 45 min] en hora operativa
 * (occurredAt + 206 min). La hora de un paso no leído se interpola entre los pasos leídos vecinos.
 *
 * Uso: npx tsx scripts/informe-reconocimiento-camaras.ts --from 2026-09-07 --to 2026-09-14
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { NODO_SUR_CIRCUITS, NODO_SUR_NODES, type NodoSurNode } from '../src/etl-core/domain/nodoSur'
import { isLikelyOcrPlateMatch } from '../src/services/circuitPlateOcr'
import { SENSOR_CLOCK_SKEW_MINUTES } from '../src/services/realEventOperationalTime'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const argOf = (k: string) => {
  const i = args.indexOf(k)
  return i >= 0 ? String(args[i + 1] ?? '') : ''
}
const FROM = argOf('--from')
const TO = argOf('--to')
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) {
  console.error('Uso: npx tsx scripts/informe-reconocimiento-camaras.ts --from YYYY-MM-DD --to YYYY-MM-DD')
  process.exit(1)
}
/**
 * Exclusiones operativas (`--exclusiones data/camaras-exclusiones-2026-09.json`): días completos
 * fuera del análisis y puntos fuera de servicio en un período [desde, hasta] (hasta null = abierto).
 * No se muestran en el informe: simplemente no entran al cálculo.
 */
type Exclusiones = { diasCompletos: string[]; puntos: { nodeId: string; desde: string; hasta: string | null }[] }
const EXCL: Exclusiones = (() => {
  const f = argOf('--exclusiones')
  if (!f) return { diasCompletos: [], puntos: [] }
  return JSON.parse(readFileSync(resolve(process.cwd(), f), 'utf8'))
})()
const diaExcluido = (day: string) => EXCL.diasCompletos.includes(day)
const puntoExcluido = (nodeId: string, day: string) =>
  diaExcluido(day) || EXCL.puntos.some((x) => x.nodeId === nodeId && day >= x.desde && (!x.hasta || day <= x.hasta))
const PAD_MS = 45 * 60_000
const DAY_START_H = 6
const NIGHT_START_H = 18
const FAKE_PLATE = /^(.)\1{5,}$/

const plateKey = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Excel trae hora de pared sin zona → Argentina (-03:00). */
const excelMs = (s: string) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const arHour = (ms: number) => new Date(ms - 3 * 3600_000).getUTCHours()
const arDay = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const franja = (ms: number) => {
  const h = arHour(ms)
  return h >= DAY_START_H && h < NIGHT_START_H ? 'dia' : 'noche'
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)

// ── Movimientos Excel (uniendo las ventanas guardadas que tocan el rango) ─────────────────────
type Mov = {
  id: string
  plate: string
  circuit: string
  platform: string
  ingMs: number
  salMs: number
  day: string
}
const windowsDir = join(root, 'runs/windows')
const windowDirs = readdirSync(windowsDir)
  .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(n))
  .filter((n) => {
    const [a, b] = n.split('_')
    return a! <= TO && b! >= FROM && a! <= b!
  })
  // Solo semanas calendario lunes→domingo (regla del repo: nada de ventanas ad-hoc solapadas).
  .filter((n) => {
    const [a, b] = n.split('_')
    return new Date(`${a}T12:00:00Z`).getUTCDay() === 1 && addDays(a!, 6) === b
  })
const movs = new Map<string, Mov>()
const sinCircuito = { total: 0 }
let fake = 0
/** Solo plantas del Nodo Sur: Avellaneda (R1 Celda 171) figura en el Excel pero no tiene estas cámaras. */
const NODO_SUR_PLANTAS = new Set(['RICARDONE', 'TERMINAL_EMBARQUE'])
const otraPlanta: Record<string, number> = {}
const runIds: string[] = []
const rulesVersions = new Set<string>()
for (const w of windowDirs) {
  const f = join(windowsDir, w, 'tables/excel_operations_with_truckflow.json')
  if (!existsSync(f)) continue
  runIds.push(w)
  try {
    rulesVersions.add(JSON.parse(readFileSync(join(windowsDir, w, 'manifest.json'), 'utf8')).rulesVersion)
  } catch {
    /* sin manifest */
  }
  const t = JSON.parse(readFileSync(f, 'utf8')) as { rows: Record<string, unknown>[] }
  for (const r of t.rows) {
    const id = String(r.external_operation_id ?? '')
    if (!id || movs.has(id)) continue
    const ingMs = excelMs(String(r.external_ingreso_at ?? ''))
    const salMs = excelMs(String(r.external_salida_at ?? ''))
    const refMs = Number.isFinite(salMs) ? salMs : ingMs
    if (!Number.isFinite(refMs)) continue
    const day = arDay(refMs)
    if (day < FROM || day > TO) continue
    if (diaExcluido(day) || (Number.isFinite(ingMs) && diaExcluido(arDay(ingMs)))) continue
    const planta = String(r.planta_normalized ?? '').trim().toUpperCase()
    if (!NODO_SUR_PLANTAS.has(planta)) {
      otraPlanta[planta || '(vacía)'] = (otraPlanta[planta || '(vacía)'] ?? 0) + 1
      continue
    }
    const plate = plateKey(r.plate_normalized)
    if (!plate || FAKE_PLATE.test(plate)) {
      fake++
      continue
    }
    const circuit = String(r.resolved_executive_circuit_code ?? '').trim().toUpperCase()
    if (!circuit) {
      sinCircuito.total++
      continue
    }
    movs.set(id, {
      id,
      plate,
      circuit,
      platform: String(r.resolved_platform ?? r.platform_normalized ?? '').trim().toUpperCase(),
      ingMs: Number.isFinite(ingMs) ? ingMs : salMs,
      salMs: Number.isFinite(salMs) ? salMs : ingMs,
      day,
    })
  }
}

// ── Eventos crudos ─────────────────────────────────────────────────────────────────────────────
type Ev = { t: number; plate: string; device: string; sector: string; src: 'evento' | 'alerta' }
const events: Ev[] = []
const eventsByDeviceDay = new Map<string, number>()
/** LPR_MALFUNCTION: la cámara vio un vehículo pero la patente no es válida (lectura fallida). */
const lprFailByDeviceDay = new Map<string, { dia: number; noche: number }>()
const alertPlate = (a: Record<string, unknown>) => {
  let p: Record<string, unknown> = {}
  try {
    p = typeof a.payload === 'string' ? JSON.parse(a.payload) : ((a.payload as Record<string, unknown>) ?? {})
  } catch {
    /* payload no JSON */
  }
  const fromPayload = plateKey(p.normalizedPlate ?? p.plate)
  if (fromPayload) return fromPayload
  return plateKey(/Truck <([^>]+)>/.exec(String(a.description ?? ''))?.[1])
}
for (let d = addDays(FROM, -1); d <= addDays(TO, 1); d = addDays(d, 1)) {
  const f = join(root, 'data/truckflow', d, 'event-list.json')
  if (!existsSync(f)) continue
  const loadArr = (file: string): Record<string, unknown>[] => {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
  }
  // Días del export roto (27/08→02/09, journeyUid null): `event-list.json` quedó recortado y el
  // export completo está en `event-list.raw.json`. Para contar lecturas no hace falta journeyUid.
  let arr = loadArr(f)
  const fRaw = join(root, 'data/truckflow', d, 'event-list.raw.json')
  if (existsSync(fRaw)) {
    const rawArr = loadArr(fRaw)
    if (rawArr.length > arr.length) arr = rawArr
  }
  for (const e of arr) {
    const phys = String(e.occurredAt ?? e.recordedAt ?? '')
    let t = Date.parse(phys)
    const created = Date.parse(String(e.createdAt ?? ''))
    // occurredAt normal viene 206 min atrasado; en el export roto ya viene en hora de pared (= createdAt).
    const yaEnHoraDePared = Number.isFinite(created) && Math.abs(created - t) < 60 * 60_000
    if (Number.isFinite(t)) t += yaEnHoraDePared ? 0 : SENSOR_CLOCK_SKEW_MINUTES * 60_000
    else t = created
    if (!Number.isFinite(t)) continue
    const device = String(e.deviceCode ?? '').trim()
    const ev: Ev = { t, plate: plateKey(e.truckPlate ?? e.normalizedPlate), device, sector: String(e.sectorCode ?? '').trim(), src: 'evento' }
    events.push(ev)
  }
  // Alertas: lecturas reales de cámara que no entraron a un journey (traseras sin journey, ruta
  // inválida, inicio inválido) + fallas LPR. Solo traen createdAt (≈ reloj de pared).
  const fa = join(root, 'data/truckflow', d, 'alert-list.json')
  if (!existsSync(fa)) continue
  const rawA = JSON.parse(readFileSync(fa, 'utf8'))
  const arrA: Record<string, unknown>[] = Array.isArray(rawA) ? rawA : (rawA.value ?? rawA.records ?? [])
  for (const a of arrA) {
    const t = Date.parse(String(a.createdAt ?? ''))
    if (!Number.isFinite(t)) continue
    const device = String(a.deviceCode ?? '').trim()
    if (!device) continue
    if (a.alertCode === 'LPR_MALFUNCTION' && arDay(t) >= FROM && arDay(t) <= TO) {
      const k = `${device}|${arDay(t)}`
      const f = lprFailByDeviceDay.get(k) ?? { dia: 0, noche: 0 }
      f[franja(t)]++
      lprFailByDeviceDay.set(k, f)
    }
    events.push({ t, plate: alertPlate(a), device, sector: String(a.sectorCode ?? '').trim(), src: 'alerta' })
  }
}
// El export trae el mismo evento repetido entre días vecinos: dedupe por (t, device, patente).
{
  const seen = new Set<string>()
  const uniq = events.filter((e) => {
    const k = `${e.t}|${e.device}|${e.plate}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  events.length = 0
  for (const e of uniq) events.push(e)
  for (const e of events) {
    const k = `${e.device}|${arDay(e.t)}`
    eventsByDeviceDay.set(k, (eventsByDeviceDay.get(k) ?? 0) + 1)
  }
}
events.sort((a, b) => a.t - b.t)
const times = events.map((e) => e.t)
const lowerBound = (x: number) => {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (times[m]! < x) lo = m + 1
    else hi = m
  }
  return lo
}

// ── Modelo: cámara → nodos ─────────────────────────────────────────────────────────────────────
const nodesByDevice = new Map<string, Set<string>>()
const nodesByFeed = new Map<string, Set<string>>()
for (const n of NODO_SUR_NODES) {
  for (const d of [...n.devices, ...n.rearDevices]) {
    const k = d.toLowerCase()
    if (!nodesByDevice.has(k)) nodesByDevice.set(k, new Set())
    nodesByDevice.get(k)!.add(n.id)
  }
  if (n.feedCode && n.hasCamera) {
    if (!nodesByFeed.has(n.feedCode)) nodesByFeed.set(n.feedCode, new Set())
    nodesByFeed.get(n.feedCode)!.add(n.id)
  }
}
const nodeById = new Map(NODO_SUR_NODES.map((n) => [n.id, n]))
const eventNodes = (e: Ev) => nodesByDevice.get(e.device.toLowerCase()) ?? nodesByFeed.get(e.sector.toUpperCase()) ?? new Set<string>()
const isRear = (n: NodoSurNode, device: string) => n.rearDevices.some((d) => d.toLowerCase() === device.toLowerCase())

/** Nodos con cámara del circuito, en orden, sin repetir (R13/SL4 calan dos veces: se evalúa 1). */
/**
 * Puntos que no se pueden medir contra el circuito (criterio de planta, 30/09/2026):
 * - Calada SL: todavía no hay forma de saber qué camión tiene que ir a calado líquido.
 * - Renova (SLZTK400): cámara de apoyo en la entrada de Renova; confirma que pasó un camión, no es paso obligado.
 */
const PUNTOS_NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
/**
 * La recepción en Silo Chief descarga en S7, el mismo volcable que Keppler (confirmado por planta,
 * 01/10/2026): las cámaras S8 son de la línea de CARGA. Se mide contra el nodo de S7.
 */
const NODO_DESCARGA_REAL: Record<string, string> = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
/** Cámaras que figuran en el modelo pero no existen en planta. */
const CAMARAS_INEXISTENTES = new Set(['SLZCalCam'])
const frontDevices = (n: NodoSurNode) => n.devices.filter((d) => !CAMARAS_INEXISTENTES.has(d))

function expectedNodes(circuit: string, platform: string): NodoSurNode[] {
  const c = NODO_SUR_CIRCUITS.find((x) => x.id === circuit)
  if (!c) return []
  const out: NodoSurNode[] = []
  for (const rawId of c.nodes) {
    const id = NODO_DESCARGA_REAL[rawId] ?? rawId
    const n = nodeById.get(id)
    if (!n?.hasCamera || n.optional) continue
    if (PUNTOS_NO_MEDIBLES.has(n.id)) continue
    if (out.some((o) => o.id === n.id)) continue
    // Plataformas volcables SL: solo camiones con plataforma VOLCABLE_PTO_n en el Excel.
    if (n.id === 'san_lorenzo:Plataformas Volcables' && !/^VOLCABLE_PTO_\d/.test(platform)) continue
    out.push(n)
  }
  return out
}
/** Calle SL conocida por Excel (VOLCABLE_PTO_3 → SLZVolcableC3). */
const slLaneDevice = (platform: string) => {
  const m = /^VOLCABLE_PTO_(\d)/.exec(platform)
  return m ? `SLZVolcableC${m[1]}` : null
}

// ── Evaluación por movimiento × nodo esperado ─────────────────────────────────────────────────
type Obs = {
  movId: string
  plate: string
  circuit: string
  day: string
  nodeId: string
  read: boolean
  readExact: boolean
  readRearOnly: boolean
  /** Lectura frontal solo vía alerta (no entró al journey). */
  readAlertOnly: boolean
  t: number
  devicesRead: string[]
  laneDevice: string | null
}
const observations: Obs[] = []
const circuitsSinModelo = new Map<string, number>()
for (const m of movs.values()) {
  const exp = expectedNodes(m.circuit, m.platform)
  if (!exp.length) {
    circuitsSinModelo.set(m.circuit, (circuitsSinModelo.get(m.circuit) ?? 0) + 1)
    continue
  }
  const from = Math.min(m.ingMs, m.salMs) - PAD_MS
  const to = Math.max(m.ingMs, m.salMs) + PAD_MS
  const hits = new Map<string, { t: number; exact: boolean; devices: Set<string>; front: boolean; frontEvent: boolean }>()
  for (let i = lowerBound(from); i < events.length && events[i]!.t <= to; i++) {
    const e = events[i]!
    if (!e.plate) continue
    const exact = e.plate === m.plate
    if (!exact && !isLikelyOcrPlateMatch(m.plate, e.plate)) continue
    for (const nid of eventNodes(e)) {
      const n = nodeById.get(nid)!
      const front = !isRear(n, e.device)
      const frontEvent = front && e.src === 'evento'
      const h = hits.get(nid)
      if (!h) hits.set(nid, { t: e.t, exact: front && exact, devices: new Set([e.device]), front, frontEvent })
      else {
        h.devices.add(e.device)
        if (front) h.exact ||= exact
        if (front && !h.front) h.t = e.t
        h.front ||= front
        h.frontEvent ||= frontEvent
      }
    }
  }
  const rows: Obs[] = exp.map((n) => {
    const h = hits.get(n.id)
    return {
      movId: m.id,
      plate: m.plate,
      circuit: m.circuit,
      day: m.day,
      nodeId: n.id,
      read: !!h?.front,
      readExact: !!h?.front && h.exact,
      readRearOnly: !!h && !h.front,
      readAlertOnly: !!h?.front && !h.frontEvent,
      t: h ? h.t : NaN,
      devicesRead: h ? [...h.devices].sort() : [],
      laneDevice: n.id === 'san_lorenzo:Plataformas Volcables' ? slLaneDevice(m.platform) : null,
    }
  })
  // Hora del paso no leído: interpolación entre vecinos leídos; sin vecinos → Excel ingreso→salida.
  rows.forEach((r, i) => {
    if (Number.isFinite(r.t)) return
    let p = i - 1
    while (p >= 0 && !Number.isFinite(rows[p]!.t)) p--
    let q = i + 1
    while (q < rows.length && !Number.isFinite(rows[q]!.t)) q++
    const tp = p >= 0 ? rows[p]!.t : m.ingMs
    const tq = q < rows.length ? rows[q]!.t : m.salMs
    const ip = p >= 0 ? p : -1
    const iq = q < rows.length ? q : rows.length
    r.t = tp + ((tq - tp) * (i - ip)) / (iq - ip)
  })
  for (const r of rows) if (!puntoExcluido(r.nodeId, arDay(r.t))) observations.push(r)
}

// ── Agregados ─────────────────────────────────────────────────────────────────────────────────
type Agg = { esperados: number; leidos: number; exactos: number; soloTrasera: number; soloAlerta: number }
const emptyAgg = (): Agg => ({ esperados: 0, leidos: 0, exactos: 0, soloTrasera: 0, soloAlerta: 0 })
const add = (a: Agg, o: Obs) => {
  a.esperados++
  if (o.read) a.leidos++
  if (o.readExact) a.exactos++
  if (o.readRearOnly) a.soloTrasera++
  if (o.readAlertOnly) a.soloAlerta++
}
const pct = (a: Agg) => (a.esperados ? Math.round((a.leidos / a.esperados) * 1000) / 10 : null)

/** Días con movimientos evaluados (sin los excluidos): el Excel puede cortar antes que el rango pedido. */
const allDays = [...new Set([...movs.values()].map((m) => m.day))].filter((d) => !diaExcluido(d)).sort()
const nodeDeviceOf = (dv: string) => NODO_SUR_NODES.find((n) => n.devices.includes(dv) || n.rearDevices.includes(dv))
const lprFor = (dv: string, days: string[]) => {
  const n = nodeDeviceOf(dv)
  const acc = { dia: 0, noche: 0 }
  for (const d of days) {
    if (n && puntoExcluido(n.id, d)) continue
    const f = lprFailByDeviceDay.get(`${dv}|${d}`)
    if (f) {
      acc.dia += f.dia
      acc.noche += f.noche
    }
  }
  return acc
}

function buildReport(observations: Obs[], days: string[]) {
const nodeOrder = NODO_SUR_NODES.filter((n) => observations.some((o) => o.nodeId === n.id))
const puntos = nodeOrder.map((n) => {
  const obs = observations.filter((o) => o.nodeId === n.id)
  const total = emptyAgg()
  const dia = emptyAgg()
  const noche = emptyAgg()
  const porDia: Record<string, { dia: Agg; noche: Agg }> = {}
  const circuitos: Record<string, number> = {}
  const deviceReads: Record<string, number> = {}
  for (const d of days) porDia[d] = { dia: emptyAgg(), noche: emptyAgg() }
  for (const o of obs) {
    add(total, o)
    const fr = franja(o.t)
    add(fr === 'dia' ? dia : noche, o)
    const dk = arDay(o.t)
    if (porDia[dk]) add(porDia[dk]![fr], o)
    circuitos[o.circuit] = (circuitos[o.circuit] ?? 0) + 1
    if (o.read) for (const dv of o.devicesRead) deviceReads[dv] = (deviceReads[dv] ?? 0) + 1
  }
  const eventosPorCamaraDia = Object.fromEntries(
    [...frontDevices(n), ...n.rearDevices].map((dv) => [
      dv,
      Object.fromEntries(days.filter((d) => !puntoExcluido(n.id, d)).map((d) => [d, eventsByDeviceDay.get(`${dv}|${d}`) ?? 0])),
    ])
  )
  const fallasLpr = Object.fromEntries([...frontDevices(n), ...n.rearDevices].map((dv) => [dv, lprFor(dv, days)]))
  return {
    nodeId: n.id,
    planta: n.plant,
    punto: n.label,
    codigo: n.code,
    camarasFrontales: frontDevices(n),
    camarasTraseras: n.rearDevices,
    total: { ...total, pct: pct(total) },
    dia: { ...dia, pct: pct(dia) },
    noche: { ...noche, pct: pct(noche) },
    porDia: Object.fromEntries(
      Object.entries(porDia).map(([d, v]) => [d, { dia: { ...v.dia, pct: pct(v.dia) }, noche: { ...v.noche, pct: pct(v.noche) } }])
    ),
    circuitos,
    lecturasPorCamara: deviceReads,
    lecturasCrudasPorCamaraDia: eventosPorCamaraDia,
    fallasLprPorCamara: fallasLpr,
  }
})

/**
 * Por cámara individual: solo donde el camión DEBE pasar por esa cámara puntual — nodos de un
 * carril (frente y trasera de Ingreso/Egreso, Playa 3, Volcable 1/2) y calles del volcable SL
 * (la calle sale del Excel). En nodos de varios carriles sin dato de carril (calada, balanzas)
 * no hay denominador por cámara: se reporta el punto y la participación de cada cámara.
 * Traseras excluidas: leen la patente del acoplado (≠ patente chasis del Excel).
 */
const camaras: {
  camara: string
  tipo: 'frontal' | 'trasera'
  nodeId: string
  punto: string
  planta: string
  total: Agg & { pct: number | null }
  dia: Agg & { pct: number | null }
  noche: Agg & { pct: number | null }
  fallasLpr: { dia: number; noche: number }
}[] = []
for (const n of nodeOrder) {
  const obs = observations.filter((o) => o.nodeId === n.id)
  const perDevice: { dev: string; tipo: 'frontal' | 'trasera'; subset: Obs[] }[] = []
  if (n.id === 'san_lorenzo:Plataformas Volcables') {
    for (const dev of n.devices.filter((d) => /^SLZVolcableC\d$/.test(d)))
      perDevice.push({ dev, tipo: 'frontal', subset: obs.filter((o) => o.laneDevice === dev) })
  } else if (n.devices.length === 1) {
    perDevice.push({ dev: n.devices[0]!, tipo: 'frontal', subset: obs })
  }
  // Traseras fuera: leen la patente del acoplado, no la del chasis que trae el Excel.
  for (const { dev, tipo, subset } of perDevice) {
    const total = emptyAgg()
    const dia = emptyAgg()
    const noche = emptyAgg()
    for (const o of subset) {
      const hit = o.devicesRead.includes(dev)
      const oo = { ...o, read: hit, readExact: hit && o.readExact, readRearOnly: false, readAlertOnly: hit && tipo === 'frontal' && o.readAlertOnly }
      add(total, oo)
      add(franja(o.t) === 'dia' ? dia : noche, oo)
    }
    camaras.push({
      camara: dev,
      tipo,
      nodeId: n.id,
      punto: n.label,
      planta: n.plant,
      total: { ...total, pct: pct(total) },
      dia: { ...dia, pct: pct(dia) },
      noche: { ...noche, pct: pct(noche) },
      fallasLpr: lprFor(dev, days),
    })
  }
}

/** Por camión (movimiento): cuántos puntos esperados leyó y cuántas cámaras frontales distintas. */
const porMovimiento = new Map<string, { circuit: string; esperados: number; puntos: number; camaras: Set<string> }>()
for (const o of observations) {
  const m = porMovimiento.get(o.movId) ?? { circuit: o.circuit, esperados: 0, puntos: 0, camaras: new Set<string>() }
  m.esperados++
  if (o.read) {
    m.puntos++
    const n = nodeById.get(o.nodeId)!
    for (const dv of o.devicesRead) if (!isRear(n, dv)) m.camaras.add(dv)
  }
  porMovimiento.set(o.movId, m)
}
const camionesLeidos = (() => {
  const mk = () => ({ total: 0, algunPunto: 0, alMenos3Puntos: 0, algunaCamara: 0, alMenos3Camaras: 0, todosLosPuntos: 0, distribucionPuntos: {} as Record<number, number> })
  const all = mk()
  const byCircuit: Record<string, ReturnType<typeof mk>> = {}
  for (const m of porMovimiento.values()) {
    for (const a of [all, (byCircuit[m.circuit] ??= mk())]) {
      a.total++
      if (m.puntos >= 1) a.algunPunto++
      if (m.puntos >= 3) a.alMenos3Puntos++
      if (m.camaras.size >= 1) a.algunaCamara++
      if (m.camaras.size >= 3) a.alMenos3Camaras++
      if (m.puntos === m.esperados) a.todosLosPuntos++
      a.distribucionPuntos[m.puntos] = (a.distribucionPuntos[m.puntos] ?? 0) + 1
    }
  }
  return { ...all, porCircuito: byCircuit }
})()
return { dias: days, puntos, camaras, camionesLeidos }
}

const full = buildReport(observations, allDays)
const { puntos, camaras, camionesLeidos } = full

/** Semanas calendario lunes→domingo; el universo de cada una = movimientos con salida en la semana. */
const mondayOf = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  return addDays(day, -((dow + 6) % 7))
}
const semanas = [...new Set(allDays.map(mondayOf))].sort().map((lunes) => {
  const domingo = addDays(lunes, 6)
  const days = allDays.filter((d) => d >= lunes && d <= domingo)
  const r = buildReport(observations.filter((o) => o.day >= lunes && o.day <= domingo), days)
  return { lunes, domingo, desde: days[0], hasta: days[days.length - 1], ...r }
})

const circuitosUniverso: Record<string, number> = {}
for (const m of movs.values()) circuitosUniverso[m.circuit] = (circuitosUniverso[m.circuit] ?? 0) + 1

const out = {
  generadoEn: new Date().toISOString(),
  rango: { from: FROM, to: TO },
  runIds,
  rulesVersions: [...rulesVersions],
  criterio: {
    universo: 'Movimientos Excel (excel_operations_with_truckflow) con salida en el rango y circuito ejecutivo',
    esperado: 'Nodos con cámara del circuito según modelo Nodo Sur',
    leido: 'Evento de cámara frontal del nodo con la patente (exacta u OCR) en [ingreso−45min, salida+45min]',
    franja: `Día ${DAY_START_H}:00–${NIGHT_START_H}:00 · Noche ${NIGHT_START_H}:00–${DAY_START_H}:00 (hora Argentina)`,
  },
  universo: {
    movimientosEvaluados: [...movs.values()].filter((m) => !circuitsSinModelo.has(m.circuit)).length,
    movimientosSinCircuito: sinCircuito.total,
    patentesFicticiasExcluidas: fake,
    otraPlantaExcluidos: otraPlanta,
    circuitosSinModelo: Object.fromEntries(circuitsSinModelo),
    porCircuito: circuitosUniverso,
    eventosCrudos: events.length,
  },
  diasAnalizados: allDays,
  camionesLeidos,
  puntos,
  camaras,
  semanas,
}

const outDir = join(root, 'reportes/camaras', `${FROM}_${TO}`)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'reconocimiento-camaras.json'), JSON.stringify(out, null, 2), 'utf8')
const csv = [
  'planta,punto,codigo,esperados,leidos,pct,esperados_dia,leidos_dia,pct_dia,esperados_noche,leidos_noche,pct_noche,solo_trasera',
  ...puntos.map((p) =>
    [p.planta, p.punto, p.codigo, p.total.esperados, p.total.leidos, p.total.pct, p.dia.esperados, p.dia.leidos, p.dia.pct, p.noche.esperados, p.noche.leidos, p.noche.pct, p.total.soloTrasera].join(',')
  ),
].join('\n')
writeFileSync(join(outDir, 'reconocimiento-puntos.csv'), csv, 'utf8')
const csvCam = [
  'camara,tipo,planta,punto,esperados,leidos,pct,esperados_dia,leidos_dia,pct_dia,esperados_noche,leidos_noche,pct_noche',
  ...camaras.map((c) =>
    [c.camara, c.tipo, c.planta, c.punto, c.total.esperados, c.total.leidos, c.total.pct, c.dia.esperados, c.dia.leidos, c.dia.pct, c.noche.esperados, c.noche.leidos, c.noche.pct].join(',')
  ),
].join('\n')
writeFileSync(join(outDir, 'reconocimiento-camaras.csv'), csvCam, 'utf8')

console.log(`Ventanas: ${runIds.join(', ')} (${[...rulesVersions].join(', ')})`)
console.log(`Movimientos evaluados: ${out.universo.movimientosEvaluados} · sin circuito ${sinCircuito.total} · ficticias ${fake} · otra planta`, otraPlanta)
console.log('Circuitos sin modelo:', out.universo.circuitosSinModelo)
console.log('Por circuito:', circuitosUniverso)
for (const p of puntos)
  console.log(
    `${p.planta.padEnd(11)} ${String(p.punto).padEnd(24)} ${String(p.total.leidos).padStart(5)}/${String(p.total.esperados).padEnd(5)} ${String(p.total.pct).padStart(5)}% | día ${p.dia.pct}% (${p.dia.esperados}) | noche ${p.noche.pct}% (${p.noche.esperados}) | solo tras ${p.total.soloTrasera} | solo alerta ${p.total.soloAlerta}`
  )
console.log('--- por cámara ---')
for (const c of camaras)
  console.log(`${c.camara.padEnd(18)} ${c.tipo.padEnd(8)} ${String(c.total.leidos).padStart(5)}/${String(c.total.esperados).padEnd(5)} ${c.total.pct}% | día ${c.dia.pct}% | noche ${c.noche.pct}% | LPR falla ${c.fallasLpr.dia}/${c.fallasLpr.noche}`)
console.log('--- camiones ---')
console.log(JSON.stringify({ ...camionesLeidos, porCircuito: undefined }))
for (const w of semanas) {
  const t = w.puntos.reduce((a, p) => ({ e: a.e + p.total.esperados, l: a.l + p.total.leidos }), { e: 0, l: 0 })
  const d = w.puntos.reduce((a, p) => ({ e: a.e + p.dia.esperados, l: a.l + p.dia.leidos }), { e: 0, l: 0 })
  const nn = w.puntos.reduce((a, p) => ({ e: a.e + p.noche.esperados, l: a.l + p.noche.leidos }), { e: 0, l: 0 })
  const c = w.camionesLeidos
  console.log(`sem ${w.desde}→${w.hasta}: camiones ${c.total} · alguna ${c.algunPunto} · ≥3 ${c.alMenos3Puntos} | pasos ${Math.round((t.l / t.e) * 100)}% día ${Math.round((d.l / d.e) * 100)}% noche ${Math.round((nn.l / nn.e) * 100)}%`)
}
console.log(`→ ${outDir}`)
