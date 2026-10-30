/**
 * Informe de cámaras por SECTOR para los técnicos: de los camiones que pasaron SEGURO por un
 * sector, cuántos no tomó ninguna de sus cámaras. Día (06–18) vs noche (18–06), hora Argentina.
 *
 * Diferencia con `informe-reconocimiento-camaras.ts` (que mide contra el circuito): acá un paso
 * solo cuenta si hay prueba de que el camión estuvo ahí, para no culpar a una cámara por un camión
 * que nunca pasó (calles sin uso, circuito mal asignado, planta equivocada):
 *  - Ancla SGC (sistema de balanza, medido 27/10/2026): la salida del SGC es la pesada de egreso
 *    (balanza egreso −2 min en ambas plantas) y el ingreso de Ricardone es el portón (−4 min).
 *  - Balanzas de Ricardone = UN sector (B1, B2 y B3, ingreso y egreso): se usan en los dos sentidos
 *    (B2 Egreso lee el aceite que entra). Cada camión SGC de Ricardone pasa DOS veces: la pesada
 *    de entrada (entre el portón y la de salida) y la de salida (anclada a la salida SGC).
 *  - Resto de los sectores: el camión fue tomado por otra cámara ANTES y DESPUÉS en su recorrido
 *    (un acceso solo necesita una toma posterior en la planta; una salida, una anterior).
 * Tomado = la cámara leyó la patente (exacta u OCR) o registró, cerca de la hora del paso, una
 * captura sin dueño compatible con una mala lectura (patente inválida, corta o con 4 caracteres
 * seguidos en común), asignada uno a uno. Traseras: solo si tomaron el camión (el export no trae
 * sus lecturas buenas); el acoplado sale del SGC y, si falta, de la carta de porte ARCA.
 *
 * Uso: npx tsx scripts/informe-camaras-sectores.ts --from 2026-10-21 --to 2026-10-27 [--corte 12:00]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { NODO_SUR_CIRCUITS, NODO_SUR_NODES } from '../src/etl-core/domain/nodoSur'
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
const CORTE = argOf('--corte') || '24:00'
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO) || !/^\d\d:\d\d$/.test(CORTE)) {
  console.error('Uso: npx tsx scripts/informe-camaras-sectores.ts --from YYYY-MM-DD --to YYYY-MM-DD [--corte HH:MM]')
  process.exit(1)
}
const DAY_START_H = 6
const NIGHT_START_H = 18
const FAKE_PLATE = /^(.)\1{5,}$/
const MIN = 60_000
/** Ventana para buscar la toma de la cámara alrededor de la hora del paso. */
const WIN_MS = 30 * MIN
/** Pasos anclados al SGC: la hora es exacta, la ventana se achica. */
const WIN_ANCLA_MS = 12 * MIN

const plateKey = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const wallMs = (s: string) => (s ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}-03:00`) : NaN)
const arHour = (ms: number) => new Date(ms - 3 * 3600_000).getUTCHours()
const arDay = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const arHm = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')
const franja = (ms: number) => (arHour(ms) >= DAY_START_H && arHour(ms) < NIGHT_START_H ? 'dia' : 'noche')
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const LIMITE_MS = CORTE === '24:00' ? wallMs(`${addDays(TO, 1)}T00:00:00`) : wallMs(`${TO}T${CORTE}:00`)

// ── Sectores: nodos del modelo Nodo Sur, con las balanzas de Ricardone unidas ─────────────────
type Sector = { id: string; plant: 'ricardone' | 'san_lorenzo'; label: string; front: string[]; rear: string[] }
const BAL_RIC = 'ricardone:Balanzas'
/** Puntos sin denominador posible (criterio de planta, 30/09): calada SL y Renova (SLZTK400). */
const NO_MEDIBLES = new Set(['san_lorenzo:Calada', 'san_lorenzo:Carga/Descarga Renova'])
/** Recepción Silo Chief descarga en S7, como Keppler (01/10). */
const NODO_DESCARGA_REAL: Record<string, string> = { 'ricardone:Volcable Silo Chief': 'ricardone:Volcable Silo Keppler' }
const CAMARAS_INEXISTENTES = new Set(['SLZCalCam'])
const sectors = new Map<string, Sector>()
for (const n of NODO_SUR_NODES) {
  if (!n.hasCamera || n.optional || NO_MEDIBLES.has(n.id)) continue
  const isBal = n.id === 'ricardone:Balanza Ingreso' || n.id === 'ricardone:Balanza Egreso'
  const id = isBal ? BAL_RIC : n.id
  const s = sectors.get(id) ?? { id, plant: n.plant as Sector['plant'], label: isBal ? 'Balanzas' : n.label, front: [], rear: [] }
  for (const d of n.devices) if (!CAMARAS_INEXISTENTES.has(d) && !s.front.includes(d)) s.front.push(d)
  for (const d of n.rearDevices) if (!s.rear.includes(d)) s.rear.push(d)
  sectors.set(id, s)
}
const sectorsByDevice = new Map<string, { sector: Sector; rear: boolean }[]>()
for (const s of sectors.values())
  for (const [list, rear] of [[s.front, false], [s.rear, true]] as const)
    for (const d of list) {
      if (!sectorsByDevice.has(d)) sectorsByDevice.set(d, [])
      sectorsByDevice.get(d)!.push({ sector: s, rear })
    }

// ── Movimientos SGC (circuito de las corridas guardadas; acoplado y baja del SGC) ─────────────
type Mov = { id: string; plate: string; acoplado: string; planta: string; circuit: string; product: string; ingMs: number; salMs: number }
const NODO_SUR_PLANTAS = new Set(['RICARDONE', 'TERMINAL_EMBARQUE'])
const sgcById = new Map<string, Record<string, unknown>>()
for (let d = addDays(FROM, -2); d <= addDays(TO, 1); d = addDays(d, 1)) {
  const f = join(root, 'data/movimientos', d, 'movimientos.json')
  if (!existsSync(f)) continue
  for (const r of JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>[]) sgcById.set(String(r.external_operation_id), r)
}
/** Carta de porte ARCA: chasis → acoplado (respaldo si el SGC no trae acoplado). */
const acopladoCarta = new Map<string, string>()
{
  const f = join(root, 'data/arca/arca_consignment_notes.json')
  if (existsSync(f)) {
    const raw = JSON.parse(readFileSync(f, 'utf8'))
    for (const c of (Array.isArray(raw) ? raw : (raw.records ?? [])) as { transport?: { plates?: string[] } }[]) {
      const [ch, ac] = (c.transport?.plates ?? []).map(plateKey)
      if (ch && ac) acopladoCarta.set(ch, ac)
    }
  }
}
const movs: Mov[] = []
const descartados = { otraPlanta: 0, ficticia: 0, baja: 0, fueraDeCorte: 0 }
const runIds: string[] = []
const seen = new Set<string>()
for (const w of readdirSync(join(root, 'runs/windows')).filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(n))) {
  const [a, b] = w.split('_')
  if (!(a! <= TO && b! >= FROM) || new Date(`${a}T12:00:00Z`).getUTCDay() !== 1 || addDays(a!, 6) !== b) continue
  const f = join(root, 'runs/windows', w, 'tables/excel_operations_with_truckflow.json')
  if (!existsSync(f)) continue
  runIds.push(w)
  for (const r of (JSON.parse(readFileSync(f, 'utf8')) as { rows: Record<string, unknown>[] }).rows) {
    const id = String(r.external_operation_id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    const ingMs = wallMs(String(r.external_ingreso_at ?? ''))
    const salMs = wallMs(String(r.external_salida_at ?? ''))
    if (!Number.isFinite(salMs) || arDay(salMs) < FROM || salMs > LIMITE_MS) {
      if (Number.isFinite(salMs) && salMs > LIMITE_MS && arDay(salMs) <= TO) descartados.fueraDeCorte++
      continue
    }
    const planta = String(r.planta_normalized ?? '').toUpperCase()
    if (!NODO_SUR_PLANTAS.has(planta)) {
      descartados.otraPlanta++
      continue
    }
    const plate = plateKey(r.plate_normalized)
    if (!plate || FAKE_PLATE.test(plate)) {
      descartados.ficticia++
      continue
    }
    const sgc = sgcById.get(id) ?? {}
    if (sgc.baja === true || /RECHAZ/i.test(String(sgc.condicion ?? ''))) {
      descartados.baja++
      continue
    }
    movs.push({
      id,
      plate,
      acoplado: plateKey(sgc.patente_acoplado) || acopladoCarta.get(plate) || '',
      planta,
      circuit: String(r.resolved_executive_circuit_code ?? '').trim().toUpperCase(),
      product: String(sgc.product_normalized ?? r.product_normalized ?? '').toUpperCase(),
      ingMs: Number.isFinite(ingMs) ? ingMs : salMs,
      salMs,
    })
  }
}

// ── Capturas crudas (eventos + alertas) ────────────────────────────────────────────────────────
type Cap = { t: number; plate: string; device: string; used: boolean }
const caps: Cap[] = []
const alertPlate = (a: Record<string, unknown>) => {
  let p: Record<string, unknown> = {}
  try {
    p = typeof a.payload === 'string' ? JSON.parse(a.payload) : ((a.payload as Record<string, unknown>) ?? {})
  } catch {
    /* payload no JSON */
  }
  return plateKey(p.normalizedPlate ?? p.plate) || plateKey(/Truck <([^>]+)>/.exec(String(a.description ?? ''))?.[1])
}
const loadArr = (file: string): Record<string, unknown>[] => {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
}
for (let d = addDays(FROM, -1); d <= addDays(TO, 1); d = addDays(d, 1)) {
  const f = join(root, 'data/truckflow', d, 'event-list.json')
  if (existsSync(f))
    for (const e of loadArr(f)) {
      let t = Date.parse(String(e.occurredAt ?? e.recordedAt ?? ''))
      const created = Date.parse(String(e.createdAt ?? ''))
      // occurredAt viene 206 min atrasado salvo en exports que ya traen hora de pared (= createdAt).
      if (Number.isFinite(t)) t += Number.isFinite(created) && Math.abs(created - t) < 60 * MIN ? 0 : SENSOR_CLOCK_SKEW_MINUTES * MIN
      else t = created
      if (Number.isFinite(t)) caps.push({ t, plate: plateKey(e.truckPlate ?? e.normalizedPlate), device: String(e.deviceCode ?? '').trim(), used: false })
    }
  const fa = join(root, 'data/truckflow', d, 'alert-list.json')
  if (existsSync(fa))
    for (const a of loadArr(fa)) {
      const t = Date.parse(String(a.createdAt ?? ''))
      const device = String(a.deviceCode ?? '').trim()
      if (Number.isFinite(t) && device) caps.push({ t, plate: alertPlate(a), device, used: false })
    }
}
{
  // El export repite el mismo evento entre días vecinos; el feed y la alerta, el mismo paso (≤5 s).
  caps.sort((a, b) => a.t - b.t)
  const keep: Cap[] = []
  const last = new Map<string, number>()
  for (const c of caps) {
    const k = `${c.device}|${c.plate}`
    if (c.t - (last.get(k) ?? -Infinity) <= 5000) continue
    last.set(k, c.t)
    keep.push(c)
  }
  caps.length = 0
  for (const c of keep) caps.push(c)
}
const capsByDevice = new Map<string, Cap[]>()
for (const c of caps) {
  if (!capsByDevice.has(c.device)) capsByDevice.set(c.device, [])
  capsByDevice.get(c.device)!.push(c)
}
const samePlate = (want: string, got: string) => !!want && !!got && (want === got || isLikelyOcrPlateMatch(want, got))
const sharesRun = (a: string, b: string, k: number) => {
  for (let i = 0; i + k <= a.length; i++) if (b.includes(a.slice(i, i + k))) return true
  return false
}
/** Lecturas con la patente del camión en los dispositivos dados, en [from, to]. */
const readsOf = (devices: string[], plate: string, from: number, to: number) => {
  const out: Cap[] = []
  for (const d of devices) for (const c of capsByDevice.get(d) ?? []) if (c.t >= from && c.t <= to && samePlate(plate, c.plate)) out.push(c)
  return out.sort((a, b) => a.t - b.t)
}

// ── Pasos esperados por camión ────────────────────────────────────────────────────────────────
type Paso = {
  movId: string
  plate: string
  acoplado: string
  circuit: string
  sector: Sector
  /** Orden del sector en el recorrido del camión. */
  idx: number
  /** Hora exacta por SGC (pasos anclados) o NaN. */
  ancla: number
  /** Ventana de búsqueda [from, to]. */
  from: number
  to: number
  t: number
  leido: boolean
  tomado: boolean
  confirmado: boolean
  pasada?: 'entrada' | 'salida'
  traseraTomada: Record<string, boolean>
}
const pasos: Paso[] = []
const pathOf = (circuit: string) => {
  const c = NODO_SUR_CIRCUITS.find((x) => x.id === circuit)
  const out: Sector[] = []
  for (const raw of c?.nodes ?? []) {
    const id = NODO_DESCARGA_REAL[raw] ?? raw
    const sid = id === 'ricardone:Balanza Ingreso' || id === 'ricardone:Balanza Egreso' ? BAL_RIC : id
    const s = sectors.get(sid)
    if (s && out[out.length - 1] !== s && !out.includes(s)) out.push(s)
  }
  return out
}
const VISITA_PAD = 4 * 3600_000
for (const m of movs) {
  // Recorrido: el del circuito; las balanzas de Ricardone solo si el SGC pesó en Ricardone.
  const path = pathOf(m.circuit).filter((s) => s.id !== BAL_RIC)
  // Flota interna sin circuito (carga en Chief, 2–3 vueltas por día con UN registro SGC): la salida
  // SGC no es la hora de la pesada (lecturas 17–50 min antes, medido 27/10) → fuera de balanzas.
  if (m.planta === 'RICARDONE' && m.circuit) {
    const iCal = path.findIndex((s) => s.id === 'ricardone:Calada')
    path.splice(iCal >= 0 ? iCal + 1 : path.filter((s) => s.plant === 'ricardone').length, 0, sectors.get(BAL_RIC)!)
  }
  // Las balanzas SL solo pesan camiones del SGC de Terminal.
  const ruta = path
    .filter((s) => m.planta === 'TERMINAL_EMBARQUE' || !/^san_lorenzo:Balanza/.test(s.id))
    // Líquidos SL2/SL3 pesan en la balanza de líquidos: solo la mitad pasa por la de egreso (27/10).
    .filter((s) => !(s.id === 'san_lorenzo:Balanza Egreso' && /^SL[23]$/.test(m.circuit)))
    // Agua industrial y nitrógeno no cargan en OSL ni en la plataforma de líquidos.
    .filter((s) => !(/^san_lorenzo:Carga/.test(s.id) && /AGUA|NITROGENO/.test(m.product)))
  const vFrom = m.ingMs - VISITA_PAD
  const vTo = m.salMs + VISITA_PAD
  ruta.forEach((s, idx) => {
    const base = { movId: m.id, plate: m.plate, acoplado: m.acoplado, circuit: m.circuit || '(sin circuito)', sector: s, idx, leido: false, tomado: false, confirmado: false, traseraTomada: {} }
    if (s.id === BAL_RIC) {
      // Dos pesadas: la de salida anclada al SGC; la de entrada entre el portón y la de salida.
      pasos.push({ ...base, ancla: m.salMs, from: m.salMs - WIN_ANCLA_MS, to: m.salMs + WIN_ANCLA_MS, t: m.salMs, pasada: 'salida' })
      pasos.push({ ...base, ancla: NaN, from: m.ingMs, to: m.salMs - 15 * MIN, t: NaN, pasada: 'entrada' })
      return
    }
    let ancla = NaN
    if (s.id === 'san_lorenzo:Balanza Egreso' && m.planta === 'TERMINAL_EMBARQUE') ancla = m.salMs - 2 * MIN
    if (s.id === 'san_lorenzo:Egreso' && m.planta === 'TERMINAL_EMBARQUE') ancla = m.salMs + 1 * MIN
    if (s.id === 'ricardone:Ingreso' && m.planta === 'RICARDONE') ancla = m.ingMs - 4 * MIN
    pasos.push({ ...base, ancla, from: Number.isFinite(ancla) ? ancla - WIN_ANCLA_MS : vFrom, to: Number.isFinite(ancla) ? ancla + WIN_ANCLA_MS : vTo, t: ancla })
  })
}

// Lectura de cada paso: la más cercana al ancla, o la primera de la ventana de la visita.
const byMov = new Map<string, Paso[]>()
for (const p of pasos) {
  if (!byMov.has(p.movId)) byMov.set(p.movId, [])
  byMov.get(p.movId)!.push(p)
}
for (const ps of byMov.values()) {
  for (const p of ps) {
    const r = readsOf(p.sector.front, p.plate, p.from, p.to)
    if (!r.length) continue
    const pick = Number.isFinite(p.ancla) ? r.sort((a, b) => Math.abs(a.t - p.ancla) - Math.abs(b.t - p.ancla))[0]! : r[0]!
    // La pesada de entrada no puede usar la misma lectura que la de salida.
    if (p.pasada === 'entrada') {
      const sal = ps.find((x) => x.sector === p.sector && x.pasada === 'salida')
      const ok = r.filter((c) => !sal?.leido || Math.abs(c.t - sal.t) > 10 * MIN)
      if (!ok.length) continue
      p.t = ok[0]!.t
    } else p.t = pick.t
    p.leido = true
    p.tomado = true
    pick.used = true
  }
  // Hora de los pasos sin lectura: entre los vecinos leídos del recorrido.
  const ordered = [...ps].sort((a, b) => a.idx - b.idx || (a.pasada === 'entrada' ? -1 : 1))
  ordered.forEach((p, i) => {
    if (Number.isFinite(p.t)) return
    const prev = ordered.slice(0, i).reverse().find((x) => Number.isFinite(x.t))
    const next = ordered.slice(i + 1).find((x) => Number.isFinite(x.t))
    p.t = prev && next ? (prev.t + next.t) / 2 : (prev?.t ?? next?.t ?? NaN) + (prev ? 10 * MIN : next ? -10 * MIN : 0)
  })
  // Confirmación de paso (prueba de que el camión estuvo en el sector).
  const tomadoEn = (pred: (x: Paso) => boolean) => ordered.some((x) => x.leido && pred(x))
  for (const p of ordered) {
    if (Number.isFinite(p.ancla) || p.leido) {
      p.confirmado = true
      continue
    }
    if (p.pasada === 'entrada') {
      p.confirmado = true // el SGC registró la pesada de entrada en Ricardone
      continue
    }
    const samePlant = ordered.filter((x) => x.sector.plant === p.sector.plant)
    const first = samePlant[0]?.idx === p.idx
    const last = samePlant[samePlant.length - 1]?.idx === p.idx
    const enPlanta = (x: Paso) => x.sector.plant === p.sector.plant
    // Acceso: visto después dentro de la planta. Salida: visto antes dentro de la planta. Resto: antes y después.
    if (first) p.confirmado = tomadoEn((x) => x.idx > p.idx && enPlanta(x))
    else if (last) p.confirmado = tomadoEn((x) => x.idx < p.idx && enPlanta(x))
    else p.confirmado = tomadoEn((x) => x.idx < p.idx) && tomadoEn((x) => x.idx > p.idx)
  }
}

const confirmados0 = () => pasos.filter((p) => p.confirmado && Number.isFinite(p.t))
// Captura con patente mala (sin dueño) cerca del paso: la cámara tomó el camión aunque no lo leyó.
{
  const pendientes = pasos.filter((p) => p.confirmado && !p.tomado && Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
  for (const p of pendientes) {
    const win = Number.isFinite(p.ancla) ? WIN_ANCLA_MS : WIN_MS
    // La pesada de entrada no tiene hora: vale cualquier captura entre el portón y la pesada de salida.
    const lo = p.pasada === 'entrada' ? p.from : p.t - win
    const hi = p.pasada === 'entrada' ? p.to : p.t + win
    let best: Cap | null = null
    for (const d of p.sector.front)
      for (const c of capsByDevice.get(d) ?? []) {
        if (c.used || c.t < lo || c.t > hi) continue
        if (!(!c.plate || c.plate.length < 6 || sharesRun(c.plate, p.plate, 4))) continue
        if (!best || Math.abs(c.t - p.t) < Math.abs(best.t - p.t)) best = c
      }
    if (best) {
      best.used = true
      p.tomado = true
    }
  }
}

/**
 * Traseras: el export solo trae sus ALERTAS (patente inválida, cola sin journey, acoplado que no
 * coincide); las lecturas buenas quedan dentro del journey y no salen. No hay % de lectura: se mide
 * si tomaron el camión (alguna captura sin dueño cerca del paso, la más cercana, uno a uno).
 */
for (const p of confirmados0().sort((a, b) => a.t - b.t)) {
  for (const d of p.sector.rear) {
    let best: Cap | null = null
    for (const c of capsByDevice.get(d) ?? []) {
      if (c.used || Math.abs(c.t - p.t) > (Number.isFinite(p.ancla) ? WIN_ANCLA_MS : WIN_MS)) continue
      if (c.plate && c.plate.length >= 6 && /\d/.test(c.plate) && !samePlate(p.acoplado, c.plate) && !sharesRun(c.plate, p.acoplado, 4)) continue
      if (!best || Math.abs(c.t - p.t) < Math.abs(best.t - p.t)) best = c
    }
    if (best) best.used = true
    p.traseraTomada[d] = !!best
  }
}

// ── Agregados ─────────────────────────────────────────────────────────────────────────────────
type Agg = { pasaron: number; tomados: number; leidos: number; noTomados: number }
const agg = (ps: Paso[]): Agg & { pctTomados: number | null; pctLeidos: number | null } => {
  const a = { pasaron: ps.length, tomados: ps.filter((p) => p.tomado).length, leidos: ps.filter((p) => p.leido).length, noTomados: ps.filter((p) => !p.tomado).length }
  return { ...a, pctTomados: a.pasaron ? Math.round((100 * a.tomados) / a.pasaron) : null, pctLeidos: a.pasaron ? Math.round((100 * a.leidos) / a.pasaron) : null }
}
const DESDE_MS = wallMs(`${FROM}T00:00:00`)
const confirmados = pasos.filter((p) => p.confirmado && Number.isFinite(p.t) && p.t >= DESDE_MS)
const days: string[] = []
for (let d = FROM; d <= TO; d = addDays(d, 1)) days.push(d)
const report = [...sectors.values()]
  .map((s) => {
    const ps = confirmados.filter((p) => p.sector === s)
    const sinPrueba = pasos.filter((p) => p.sector === s && !p.confirmado).length
    const porHora = Array.from({ length: 24 }, (_, h) => {
      const x = ps.filter((p) => arHour(p.t) === h)
      return { h, pasaron: x.length, noTomados: x.filter((p) => !p.tomado).length }
    })
    const traseras = Object.fromEntries(
      s.rear.map((d) => {
        const x = ps.filter((p) => d in p.traseraTomada)
        const f = (fr: string) => {
          const y = x.filter((p) => franja(p.t) === fr)
          return { pasaron: y.length, tomados: y.filter((p) => p.traseraTomada[d]).length }
        }
        return [d, { pasaron: x.length, tomados: x.filter((p) => p.traseraTomada[d]).length, dia: f('dia'), noche: f('noche') }]
      })
    )
    const lecturasPorCamara = Object.fromEntries(
      s.front.map((d) => [d, Object.fromEntries(days.map((day) => [day, (capsByDevice.get(d) ?? []).filter((c) => arDay(c.t) === day && c.t <= LIMITE_MS).length]))])
    )
    return {
      sector: s.id,
      planta: s.plant,
      nombre: s.label,
      camaras: s.front,
      camarasTraseras: s.rear,
      sinPruebaDePaso: sinPrueba,
      total: agg(ps),
      dia: agg(ps.filter((p) => franja(p.t) === 'dia')),
      noche: agg(ps.filter((p) => franja(p.t) === 'noche')),
      ...(s.id === BAL_RIC
        ? { pesadaEntrada: agg(ps.filter((p) => p.pasada === 'entrada')), pesadaSalida: agg(ps.filter((p) => p.pasada === 'salida')) }
        : {}),
      porDia: Object.fromEntries(
        days.map((d) => [d, { dia: agg(ps.filter((p) => arDay(p.t) === d && franja(p.t) === 'dia')), noche: agg(ps.filter((p) => arDay(p.t) === d && franja(p.t) === 'noche')) }])
      ),
      porHora,
      traseras,
      lecturasPorCamara,
      noTomados: ps
        .filter((p) => !p.tomado)
        .sort((a, b) => a.t - b.t)
        .map((p) => ({ hora: arHm(p.t), patente: p.plate, acoplado: p.acoplado, circuito: p.circuit, pasada: p.pasada ?? null, ancladoSgc: Number.isFinite(p.ancla) })),
    }
  })
  .filter((r) => r.total.pasaron > 0)

const out = {
  generadoEn: new Date().toISOString(),
  rango: { from: FROM, to: TO, corte: CORTE },
  runIds,
  criterio: {
    paso: 'Confirmado por ancla SGC (salida = pesada de egreso, ingreso Ricardone = portón) o por otra cámara antes y después en el recorrido',
    tomado: 'Lectura de la patente (exacta u OCR) o captura sin dueño compatible con mala lectura cerca del paso',
    traseras: 'Solo si tomaron el camión: el export no trae las lecturas buenas de las traseras, solo sus alertas',
    franja: `Día ${DAY_START_H}:00–${NIGHT_START_H}:00 · Noche ${NIGHT_START_H}:00–${DAY_START_H}:00`,
  },
  universo: { camiones: movs.length, descartados, pasosEsperados: pasos.length, pasosConfirmados: confirmados.length },
  sectores: report,
}
const outDir = join(root, 'reportes/camaras', `${FROM}_${TO}`)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'sectores.json'), JSON.stringify(out, null, 2), 'utf8')
writeFileSync(
  join(outDir, 'sectores-no-tomados.csv'),
  ['planta,sector,hora,patente,acoplado,circuito,pasada,anclado_sgc', ...report.flatMap((r) => r.noTomados.map((x) => [r.planta, r.nombre, x.hora, x.patente, x.acoplado, x.circuito, x.pasada ?? '', x.ancladoSgc].join(',')))].join('\n'),
  'utf8'
)

console.log(`Corridas ${runIds.join(', ')} · camiones ${movs.length} · descartados`, descartados, `· pasos ${pasos.length} → confirmados ${confirmados.length}`)
for (const r of report) {
  const f = (a: Agg & { pctTomados: number | null; pctLeidos: number | null }) => `${a.pctTomados}% tom (${a.noTomados} sin tomar/${a.pasaron}) lee ${a.pctLeidos}%`
  console.log(`${r.planta.padEnd(11)} ${r.nombre.padEnd(24)} ${f(r.total)} | día ${f(r.dia)} | noche ${f(r.noche)} | sin prueba ${r.sinPruebaDePaso}`)
  for (const [d, v] of Object.entries(r.traseras)) console.log(`   trasera ${d}: tomó ${v.tomados}/${v.pasaron} (día ${v.dia.tomados}/${v.dia.pasaron} noche ${v.noche.tomados}/${v.noche.pasaron})`)
}
console.log(`→ ${outDir}`)
