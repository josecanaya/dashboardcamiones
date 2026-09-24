/**
 * Modelo de actividad por cámara/calle: los MISMOS números que muestra `CaladaCamerasPanel`
 * (calada Ricardone sólidos/líquidos, calada SL, volcables, silos, celda 16, aceites),
 * extraídos del componente a un módulo puro para que el exportador del informe de logística
 * los reuse sin duplicar reglas de negocio.
 *
 * Reglas conservadas tal cual estaban en el panel (no se cambió ningún cálculo):
 * - La hora de pared Argentina sale del `timestamp` crudo, no de las columnas horneadas.
 * - `splitExcelVsCamera` (volcable SL): la verdad del conteo son las filas del Excel; los
 *   camiones que solo vio la cámara se reportan aparte y NO se suman.
 * - `hourlyTrucksExcludeCameras` (calada: `RicCalLiq`): excluye el journey completo de la
 *   serie horaria.
 * - Horas propias de cada calle como denominador del promedio/hora.
 *
 * Ver [[volcable-sl-calles-panel]] y [[calada-panel-hora-y-producto]].
 */
import { argentinaLocalParts } from '../../../etl-core/domain/timestamps'
import type { CaladaCameraEventRow } from './etlCaladaCameraActivity'

/**
 * Cuartos de turno de la operación (hora local Argentina). Ventanas de 6 h: Q1 22–04
 * (cruza medianoche), Q2 04–10, Q3 10–16, Q4 16–22. Definición única del proyecto,
 * compartida con `operationalTurno`.
 */
export const CUARTOS_TURNO = [
  { id: 'q1', label: '22–04', start: 22, end: 4 },
  { id: 'q2', label: '04–10', start: 4, end: 10 },
  { id: 'q3', label: '10–16', start: 10, end: 16 },
  { id: 'q4', label: '16–22', start: 16, end: 22 },
] as const

export type CuartoTurnoId = (typeof CUARTOS_TURNO)[number]['id']

/** Cuarto de turno para una hora entera (0–23). El último cuarto cruza medianoche. */
export function cuartoFromHour(h: number): CuartoTurnoId {
  for (const c of CUARTOS_TURNO) {
    const dentro = c.start <= c.end ? h >= c.start && h < c.end : h >= c.start || h < c.end
    if (dentro) return c.id
  }
  return CUARTOS_TURNO[0].id
}

/** Fecha y hora de pared Argentina desde el `timestamp` crudo, o null si no se puede parsear. */
export function localPartsOf(r: CaladaCameraEventRow): { fecha: string; hh: string } | null {
  const ts = String(r.timestamp ?? '').trim()
  if (!ts) return null
  const p = argentinaLocalParts(ts)
  return p ? { fecha: p.fecha_tramo, hh: p.hora_inicio.slice(0, 2) } : null
}

/** Día calendario Argentina de la fila, robusto a la zona del host. */
export function localDayOf(r: CaladaCameraEventRow): string {
  return localPartsOf(r)?.fecha ?? String(r.fecha ?? '').trim()
}

/**
 * Clave de la ventana horaria (`YYYY-MM-DDTHH`), en hora de pared Argentina. Se deriva del
 * `timestamp` crudo; solo si falta se cae a las columnas horneadas.
 */
export function hourBucketOf(r: CaladaCameraEventRow): string {
  const parts = localPartsOf(r)
  if (parts) return `${parts.fecha}T${parts.hh}`
  const iso = String(r.intervalo_hora ?? '').trim()
  if (iso.length >= 13) return iso.slice(0, 13)
  const fecha = String(r.fecha ?? '').trim()
  const hora = String(r.hora ?? '').trim()
  return fecha && hora ? `${fecha}T${hora.slice(0, 2)}` : ''
}

/** `2026-07-20T08` → `20/07 08h`. */
export function hourBucketLabel(bucket: string): string {
  return `${bucket.slice(8, 10)}/${bucket.slice(5, 7)} ${bucket.slice(11, 13)}h`
}

/**
 * ¿La fila viene del Excel (INGRESO por plataforma) o solo de la cámara? En volcable SL el
 * conteo real son las filas Excel (`excel:` / `excel-vol:`).
 */
export function isExcelSourcedRow(r: CaladaCameraEventRow): boolean {
  return /^excel(-vol)?:/i.test(String(r.journey_id ?? ''))
}

const WD = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

export type DayBarItem = {
  fecha: string
  label: string
  weekday: string
  total: number
}

/** Camiones distintos (`journey_id`) por día calendario, desde filas con `localDay` + `journeyId`. */
export function buildDayBarsFromJourneySets(
  entries: { localDay: string; journeyId: string }[]
): DayBarItem[] {
  const byDay = new Map<string, Set<string>>()
  for (const { localDay, journeyId } of entries) {
    if (!localDay || !journeyId) continue
    const s = byDay.get(localDay) ?? new Set<string>()
    s.add(journeyId)
    byDay.set(localDay, s)
  }
  return [...byDay.keys()].sort().map((fecha) => ({
    fecha,
    label: fecha.slice(-2),
    weekday: WD[new Date(`${fecha}T00:00:00`).getDay()] ?? '',
    total: byDay.get(fecha)!.size,
  }))
}

export type PerCameraRow = {
  camara: string
  camiones: number
  eventos: number
  picoPorHora: number
  picoLabel: string
  /** Suma de camiones distintos por hora: numerador del promedio/hora. */
  truckHours: number
  /** Horas propias de la calle: denominador del promedio/hora. */
  activeHours: number
}

export type HourConcurrencyRow = {
  bucket: string
  label: string
  camaras_activas: number
  camiones: number
}

export type TrucksPerHourRow = { bucket: string; label: string; camiones: number }

export type TurnoUsageRow = {
  id: CuartoTurnoId
  label: string
  promedioCalles: number
  horas: number
}

export type CameraActivityTotals = {
  trucks: number
  cams: number
  peakCams: number
  peakCamsLabel: string
  /** Pico de camiones en una hora. */
  peakTrucks: number
  /** Hora del pico. */
  peakTrucksLabel: string
  avgTrucksPerHour: number
  medianTrucksPerHour: number
}

export type CameraActivityOptions = {
  /**
   * Volcable SL: separar «Excel» vs «solo cámara». Los conteos principales usan solo las
   * filas Excel y además fija el orden numérico de las calles.
   */
  splitExcelVsCamera?: boolean
  /** Cámaras cuyos camiones se excluyen de la serie horaria (calada: `RicCalLiq`). */
  hourlyTrucksExcludeCameras?: string[]
}

export type CameraActivityModel = {
  /** Filas que alimentan todos los conteos principales. */
  baseRows: CaladaCameraEventRow[]
  perCamera: PerCameraRow[]
  concurrency: HourConcurrencyRow[]
  /** Horas con actividad en el período (denominador común de los promedios/hora). */
  periodHours: number
  trucksPerHour: TrucksPerHourRow[]
  turnoUsage: TurnoUsageRow[]
  totals: CameraActivityTotals
  /** Camiones que solo vio la cámara, por calle (vacío sin split). */
  camOnlyByCamera: Map<string, number>
  camOnlyTotal: number
}

/** Por cámara: camiones distintos, eventos, pico de camiones en una hora y hora del pico. */
export function buildPerCamera(
  baseRows: CaladaCameraEventRow[],
  splitSource: boolean
): PerCameraRow[] {
  const byCam = new Map<
    string,
    { trucks: Set<string>; events: number; perBucket: Map<string, Set<string>> }
  >()
  for (const r of baseRows) {
    const c = byCam.get(r.camara) ?? { trucks: new Set<string>(), events: 0, perBucket: new Map() }
    c.trucks.add(r.journey_id)
    c.events++
    byCam.set(r.camara, c)
    const key = hourBucketOf(r)
    if (!key) continue
    const b = c.perBucket.get(key) ?? new Set<string>()
    b.add(r.journey_id)
    c.perBucket.set(key, b)
  }
  const rowsOut = [...byCam.entries()].map(([camara, c]) => {
    let picoPorHora = 0
    let picoBucket = ''
    for (const [bucket, s] of c.perBucket) {
      if (s.size > picoPorHora) {
        picoPorHora = s.size
        picoBucket = bucket
      }
    }
    return {
      camara,
      camiones: c.trucks.size,
      eventos: c.events,
      picoPorHora,
      picoLabel: picoBucket ? hourBucketLabel(picoBucket) : '',
      truckHours: [...c.perBucket.values()].reduce((a, s) => a + s.size, 0),
      activeHours: c.perBucket.size,
    }
  })
  if (splitSource) {
    const num = (s: string) => {
      const m = s.match(/(\d+)/)
      return m ? Number(m[1]) : Number.POSITIVE_INFINITY
    }
    rowsOut.sort((a, b) => num(a.camara) - num(b.camara) || a.camara.localeCompare(b.camara))
  } else {
    rowsOut.sort((a, b) => b.camiones - a.camiones || a.camara.localeCompare(b.camara))
  }
  return rowsOut
}

/**
 * Construye el modelo completo de actividad a partir de las filas ya filtradas por circuito
 * y por día. Es la única implementación: la usan el panel del dashboard y el exportador.
 */
export function buildCameraActivityModel(
  rows: CaladaCameraEventRow[],
  opts: CameraActivityOptions = {}
): CameraActivityModel {
  const splitSource = opts.splitExcelVsCamera === true
  const baseRows = splitSource ? rows.filter(isExcelSourcedRow) : rows

  const camOnlyByCamera = new Map<string, number>()
  let camOnlyTotal = 0
  if (splitSource) {
    const byCam = new Map<string, Set<string>>()
    const ids = new Set<string>()
    for (const r of rows) {
      if (isExcelSourcedRow(r)) continue
      const s = byCam.get(r.camara) ?? new Set<string>()
      s.add(r.journey_id)
      byCam.set(r.camara, s)
      ids.add(r.journey_id)
    }
    for (const [k, v] of byCam) camOnlyByCamera.set(k, v.size)
    camOnlyTotal = ids.size
  }

  const perCamera = buildPerCamera(baseRows, splitSource)

  const byBucket = new Map<string, { cams: Set<string>; trucks: Set<string> }>()
  for (const r of baseRows) {
    const key = hourBucketOf(r)
    if (!key) continue
    const b = byBucket.get(key) ?? { cams: new Set<string>(), trucks: new Set<string>() }
    b.cams.add(r.camara)
    b.trucks.add(r.journey_id)
    byBucket.set(key, b)
  }
  const concurrency: HourConcurrencyRow[] = [...byBucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, v]) => ({
      bucket,
      label: hourBucketLabel(bucket),
      camaras_activas: v.cams.size,
      camiones: v.trucks.size,
    }))
  const periodHours = concurrency.length

  const excluded = new Set(opts.hourlyTrucksExcludeCameras ?? [])
  const excludedTruckIds = new Set<string>()
  if (excluded.size) {
    for (const r of baseRows) if (excluded.has(r.camara)) excludedTruckIds.add(r.journey_id)
  }
  const perHour = new Map<string, Set<string>>()
  for (const r of baseRows) {
    if (excludedTruckIds.has(r.journey_id)) continue
    const key = hourBucketOf(r)
    if (!key) continue
    const s = perHour.get(key) ?? new Set<string>()
    s.add(r.journey_id)
    perHour.set(key, s)
  }
  const trucksPerHour: TrucksPerHourRow[] = [...perHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, trucks]) => ({
      bucket,
      label: hourBucketLabel(bucket),
      camiones: trucks.size,
    }))

  const acc = new Map<string, { sumCalles: number; horas: number }>()
  for (const c of concurrency) {
    const id = cuartoFromHour(Number(c.bucket.slice(11, 13)))
    const a = acc.get(id) ?? { sumCalles: 0, horas: 0 }
    a.sumCalles += c.camaras_activas
    a.horas += 1
    acc.set(id, a)
  }
  const turnoUsage: TurnoUsageRow[] = CUARTOS_TURNO.map((cuarto) => {
    const a = acc.get(cuarto.id)
    return {
      id: cuarto.id,
      label: cuarto.label,
      promedioCalles: a && a.horas ? a.sumCalles / a.horas : 0,
      horas: a?.horas ?? 0,
    }
  })

  const trucks = new Set(baseRows.map((r) => r.journey_id))
  const cams = new Set(baseRows.map((r) => r.camara))
  const peakCams = concurrency.reduce(
    (best, c) => (c.camaras_activas > best.camaras_activas ? c : best),
    { camaras_activas: 0, camiones: 0, label: '' }
  )
  const peakTrucks = concurrency.reduce((best, c) => (c.camiones > best.camiones ? c : best), {
    camaras_activas: 0,
    camiones: 0,
    label: '',
  })
  const sumTrucksPerHour = concurrency.reduce((a, c) => a + c.camiones, 0)
  const sortedTrucks = concurrency.map((c) => c.camiones).sort((a, b) => a - b)
  const medianTrucksPerHour = sortedTrucks.length
    ? sortedTrucks.length % 2
      ? sortedTrucks[(sortedTrucks.length - 1) / 2]!
      : (sortedTrucks[sortedTrucks.length / 2 - 1]! + sortedTrucks[sortedTrucks.length / 2]!) / 2
    : 0

  return {
    baseRows,
    perCamera,
    concurrency,
    periodHours,
    trucksPerHour,
    turnoUsage,
    totals: {
      trucks: trucks.size,
      cams: cams.size,
      peakCams: peakCams.camaras_activas,
      peakCamsLabel: peakCams.label,
      peakTrucks: peakTrucks.camiones,
      peakTrucksLabel: peakTrucks.label,
      avgTrucksPerHour: periodHours ? sumTrucksPerHour / periodHours : 0,
      medianTrucksPerHour,
    },
    camOnlyByCamera,
    camOnlyTotal,
  }
}

/** Barras por día de un conjunto de filas de actividad (camiones distintos por día). */
export function buildActivityDayBars(rows: CaladaCameraEventRow[]): DayBarItem[] {
  return buildDayBarsFromJourneySets(
    rows.map((r) => ({ localDay: localDayOf(r), journeyId: r.journey_id }))
  )
}
