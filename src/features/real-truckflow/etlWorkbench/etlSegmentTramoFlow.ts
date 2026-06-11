import { recordsToCsv } from './etlCsv'

export type SegmentTramoFlowSlot = {
  slot: number
  label: string
  axisLabel: string
  fecha: string
  hour: number
  ingresos: number
  egresos: number
  /** Inventario inferido al cierre de la hora (ingresos − egresos acumulado, sin negativos). */
  camionesEnTramo: number
  saldoHorario: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function fechaFromIso(iso: string): string | null {
  const ts = Date.parse(String(iso ?? '').trim())
  if (!Number.isFinite(ts)) return null
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function hourFromIso(iso: string): number | null {
  const ts = Date.parse(String(iso ?? '').trim())
  if (!Number.isFinite(ts)) return null
  return new Date(ts).getHours()
}

function collectRowFechas(row: {
  timestamp_inicio: string
  timestamp_fin: string
  fecha_tramo?: string
}): string[] {
  const out: string[] = []
  const ft = String(row.fecha_tramo ?? '').trim()
  if (ft) out.push(ft)
  const fi = fechaFromIso(row.timestamp_inicio)
  const ff = fechaFromIso(row.timestamp_fin)
  if (fi) out.push(fi)
  if (ff) out.push(ff)
  return out
}

function resolveFechasOrdenadas(
  rows: Array<{ timestamp_inicio: string; timestamp_fin: string; fecha_tramo?: string }>,
  fechasHint: string[]
): string[] {
  const set = new Set<string>(fechasHint.map((f) => String(f ?? '').trim()).filter(Boolean))
  for (const r of rows) {
    for (const f of collectRowFechas(r)) set.add(f)
  }
  return [...set].sort()
}

function resolveFechaEnCalendario(
  iso: string,
  preferFecha: string | undefined,
  fechaToDayIdx: Map<string, number>
): string | null {
  const prefer = String(preferFecha ?? '').trim()
  const fromIso = fechaFromIso(iso)
  if (prefer && fechaToDayIdx.has(prefer)) return prefer
  if (fromIso && fechaToDayIdx.has(fromIso)) return fromIso
  return null
}

/** Flujo horario ingreso/egreso al tramo operativo (misma lógica que KPI 3 planta). */
export function computeSegmentTramoHourlyFlow(
  rows: Array<{ timestamp_inicio: string; timestamp_fin: string; fecha_tramo?: string }>,
  fechasHint: string[] = []
): SegmentTramoFlowSlot[] {
  if (!rows.length) return []

  const fechas = resolveFechasOrdenadas(rows, fechasHint)
  if (!fechas.length) return []

  const fechaToDayIdx = new Map(fechas.map((f, i) => [f, i]))
  const totalSlots = fechas.length * 24
  const bySlot = new Map<number, { ingresos: number; egresos: number }>()
  for (let s = 0; s < totalSlots; s++) bySlot.set(s, { ingresos: 0, egresos: 0 })

  const toSlot = (iso: string, preferFecha?: string) => {
    const isoTrim = String(iso ?? '').trim()
    if (!isoTrim || !Number.isFinite(Date.parse(isoTrim))) return -1
    const fecha = resolveFechaEnCalendario(isoTrim, preferFecha, fechaToDayIdx)
    if (!fecha) return -1
    const dayIdx = fechaToDayIdx.get(fecha)
    if (dayIdx === undefined) return -1
    const hour = hourFromIso(isoTrim)
    if (hour == null) return -1
    return dayIdx * 24 + hour
  }

  for (const r of rows) {
    const sIn = toSlot(r.timestamp_inicio, r.fecha_tramo)
    const finFecha = fechaFromIso(r.timestamp_fin) ?? undefined
    const sOut = toSlot(r.timestamp_fin, finFecha)
    if (sIn >= 0) bySlot.get(sIn)!.ingresos++
    if (sOut >= 0) bySlot.get(sOut)!.egresos++
  }

  const rawAcum: number[] = []
  let acum = 0
  for (let s = 0; s < totalSlots; s++) {
    const data = bySlot.get(s) ?? { ingresos: 0, egresos: 0 }
    acum += data.ingresos - data.egresos
    rawAcum.push(acum)
  }
  const minAcum = Math.min(...rawAcum)
  const offset = minAcum < 0 ? -minAcum : 0

  return Array.from({ length: totalSlots }, (_, s) => {
    const dayIdx = Math.floor(s / 24)
    const hour = s % 24
    const fecha = fechas[dayIdx] ?? ''
    const dd = fecha.length >= 10 ? fecha.slice(8, 10) : String(dayIdx + 1).padStart(2, '0')
    const mm = fecha.length >= 10 ? fecha.slice(5, 7) : ''
    const data = bySlot.get(s) ?? { ingresos: 0, egresos: 0 }
    const saldo = data.ingresos - data.egresos
    return {
      slot: s,
      label: fechas.length > 1 ? `${dd} ${pad2(hour)}` : `${pad2(hour)}`,
      axisLabel: hour === 0 && mm && fechas.length > 1 ? `${dd}/${mm}` : '',
      fecha,
      hour,
      ingresos: data.ingresos,
      egresos: data.egresos,
      camionesEnTramo: Math.max(0, rawAcum[s]! + offset),
      saldoHorario: saldo,
    }
  })
}

/** Cuántas filas no pudieron ubicarse en el calendario (debug / aviso UI). */
export function countSegmentTramoFlowPlacement(
  rows: Array<{ timestamp_inicio: string; timestamp_fin: string; fecha_tramo?: string }>,
  fechasHint: string[] = []
): { ingresosColocados: number; egresosColocados: number; filas: number } {
  if (!rows.length) return { ingresosColocados: 0, egresosColocados: 0, filas: 0 }
  const fechas = resolveFechasOrdenadas(rows, fechasHint)
  const fechaToDayIdx = new Map(fechas.map((f, i) => [f, i]))
  let ingresosColocados = 0
  let egresosColocados = 0
  for (const r of rows) {
    const inIso = String(r.timestamp_inicio ?? '').trim()
    const outIso = String(r.timestamp_fin ?? '').trim()
    if (
      inIso &&
      Number.isFinite(Date.parse(inIso)) &&
      resolveFechaEnCalendario(inIso, r.fecha_tramo, fechaToDayIdx)
    ) {
      ingresosColocados++
    }
    const finFecha = fechaFromIso(outIso) ?? undefined
    if (
      outIso &&
      Number.isFinite(Date.parse(outIso)) &&
      resolveFechaEnCalendario(outIso, finFecha, fechaToDayIdx)
    ) {
      egresosColocados++
    }
  }
  return { ingresosColocados, egresosColocados, filas: rows.length }
}

export function segmentTramoFlowMetrics(slots: SegmentTramoFlowSlot[]) {
  if (!slots.length) {
    return {
      picoEnTramo: 0,
      picoIngresos: 0,
      picoEgresos: 0,
      slotPicoEnTramo: 0,
      horaPicoEnTramo: '—',
      totalIngresos: 0,
      totalEgresos: 0,
    }
  }
  let picoEnTramo = 0
  let slotPicoEnTramo = 0
  let picoIngresos = 0
  let picoEgresos = 0
  let totalIngresos = 0
  let totalEgresos = 0
  for (const s of slots) {
    totalIngresos += s.ingresos
    totalEgresos += s.egresos
    if (s.camionesEnTramo > picoEnTramo) {
      picoEnTramo = s.camionesEnTramo
      slotPicoEnTramo = s.slot
    }
    if (s.ingresos > picoIngresos) picoIngresos = s.ingresos
    if (s.egresos > picoEgresos) picoEgresos = s.egresos
  }
  const peak = slots[slotPicoEnTramo]
  const horaPicoEnTramo =
    peak ?
      peak.fecha ?
        `${peak.fecha} ${pad2(peak.hour)}:00`
      : `${pad2(peak.hour)}:00`
    : '—'
  return {
    picoEnTramo,
    picoIngresos,
    picoEgresos,
    slotPicoEnTramo,
    horaPicoEnTramo,
    totalIngresos,
    totalEgresos,
  }
}

export function segmentTramoFlowCsv(slots: SegmentTramoFlowSlot[]): string {
  return recordsToCsv(
    [
      'fecha',
      'hora',
      'ingresos_tramo',
      'egresos_tramo',
      'camiones_en_tramo',
      'saldo_horario',
    ],
    slots.map((s) => ({
      fecha: s.fecha,
      hora: s.hour,
      ingresos_tramo: s.ingresos,
      egresos_tramo: s.egresos,
      camiones_en_tramo: s.camionesEnTramo,
      saldo_horario: s.saldoHorario,
    }))
  )
}
