/**
 * Motor de cálculo de KPIs operativos.
 * Funciones reutilizables para estadía, variabilidad, flujo, densidad.
 */

import type { HistoricalTrip, OperationalAlert } from '../domain/logistics'
import type { SiteId } from '../domain/sites'
import {
  mean,
  median,
  mode,
  min,
  max,
  std,
  coefficientOfVariation,
  p5,
  p90,
  p95,
  percentile,
  iqr,
  classifyOutlier,
  detectOutliersZScore,
} from '../utils/stats'
import { getShiftForHour, getHourFromIso, OPERATIONAL_SHIFTS } from '../config/operationalShifts'
import { clampDurationMinutes, UMBRAL_FUERA_RANGO_STD } from '../config/durationBounds'
import { getSectorCapacityByPlant } from '../config/sectorCapacityByPlant'

export interface StayTimeStats {
  count: number
  mean: number
  median: number
  mode: number
  min: number
  max: number
  std: number
  p5: number
  p90: number
  p95: number
  q1: number
  q3: number
  iqr: number
  cv: number
  /** Umbral operativo: media + UMBRAL_FUERA_RANGO_STD * std (en horas) */
  umbralFueraRango: number
  /** Cantidad de camiones fuera de rango */
  countFueraRango: number
  /** Porcentaje de camiones fuera de rango */
  pctFueraRango: number
  /** Distancia entre moda y mediana (abs) */
  distanciaModaMediana: number
}

export function computeStayTimeStats(
  durations: number[],
  umbralStdMultiplier: number = UMBRAL_FUERA_RANGO_STD
): StayTimeStats {
  if (durations.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      mode: 0,
      min: 0,
      max: 0,
      std: 0,
      p5: 0,
      p90: 0,
      p95: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      cv: 0,
      umbralFueraRango: 0,
      countFueraRango: 0,
      pctFueraRango: 0,
      distanciaModaMediana: 0,
    }
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const m = mean(durations)
  const s = std(durations)
  const med = median(durations)
  const mod = mode(durations)
  const umbral = m + umbralStdMultiplier * s
  const fueraRango = durations.filter((d) => d > umbral)

  return {
    count: durations.length,
    mean: m,
    median: med,
    mode: mod,
    min: min(durations),
    max: max(durations),
    std: s,
    p5: p5(durations),
    p90: p90(durations),
    p95: p95(durations),
    q1: percentile(sorted, 25),
    q3: percentile(sorted, 75),
    iqr: iqr(durations),
    cv: coefficientOfVariation(durations),
    umbralFueraRango: umbral,
    countFueraRango: fueraRango.length,
    pctFueraRango: durations.length > 0 ? (fueraRango.length / durations.length) * 100 : 0,
    distanciaModaMediana: Math.abs(mod - med),
  }
}

export interface VariabilityStats {
  std: number
  cv: number
  outlierIndices: number[]
  normalCount: number
  altoDesvioCount: number
  outlierCount: number
  extremoCount: number
}

export function computeVariabilityStats(durations: number[]): VariabilityStats {
  if (durations.length < 2) {
    return { std: 0, cv: 0, outlierIndices: [], normalCount: durations.length, altoDesvioCount: 0, outlierCount: 0, extremoCount: 0 }
  }
  const m = mean(durations)
  const s = std(durations)
  const outlierIndices = detectOutliersZScore(durations)
  const counts = { normal: 0, alto_desvio: 0, outlier: 0, extremo: 0 }
  for (const v of durations) {
    const z = s > 0 ? (v - m) / s : 0
    counts[classifyOutlier(z)]++
  }
  return {
    std: s,
    cv: coefficientOfVariation(durations),
    outlierIndices,
    normalCount: counts.normal,
    altoDesvioCount: counts.alto_desvio,
    outlierCount: counts.outlier,
    extremoCount: counts.extremo,
  }
}

export interface HourlyFlow {
  hour: number
  ingresos: number
  egresos: number
  /** Camiones simultáneos (inferido: acumulado ingresos - egresos) */
  simultaneos: number
  /** Saldo horario: ingresos - egresos */
  saldoHorario: number
}

export function computeHourlyFlow(trips: HistoricalTrip[], siteId?: SiteId): HourlyFlow[] {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  const byHour = new Map<number, { ingresos: number; egresos: number }>()
  for (let h = 0; h < 24; h++) byHour.set(h, { ingresos: 0, egresos: 0 })
  for (const t of filtered) {
    const hIn = Math.floor(getHourFromIso(t.ingresoAt))
    const hOut = Math.floor(getHourFromIso(t.egresoAt))
    byHour.get(hIn)!.ingresos++
    byHour.get(hOut)!.egresos++
  }
  // Primera pasada: acumulado bruto (ingresos - egresos) por hora
  const rawAcum: number[] = []
  let acum = 0
  for (let h = 0; h < 24; h++) {
    const data = byHour.get(h) ?? { ingresos: 0, egresos: 0 }
    acum += data.ingresos - data.egresos
    rawAcum.push(acum)
  }
  // Offset para que camiones en planta nunca sea negativo (inventario inicial implícito)
  const minAcum = Math.min(...rawAcum)
  const offset = minAcum < 0 ? -minAcum : 0
  return Array.from({ length: 24 }, (_, h) => {
    const data = byHour.get(h) ?? { ingresos: 0, egresos: 0 }
    return {
      hour: h,
      ingresos: data.ingresos,
      egresos: data.egresos,
      simultaneos: Math.max(0, rawAcum[h]! + offset),
      saldoHorario: data.ingresos - data.egresos,
    }
  })
}

export interface HourlyFlowWeekSlot {
  slot: number
  label: string
  day: number
  hour: number
  camionesEnPlanta: number
  ingresos: number
  egresos: number
  saldoHorario: number
}

/** Flujo hora por hora para toda la semana (168 slots). refDateMs = inicio del día más reciente. */
export function computeHourlyFlowWeek(
  trips: HistoricalTrip[],
  refDateMs: number,
  siteId?: SiteId
): HourlyFlowWeekSlot[] {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  const dayMs = 24 * 60 * 60 * 1000
  const bySlot = new Map<number, { ingresos: number; egresos: number }>()
  for (let s = 0; s < 168; s++) bySlot.set(s, { ingresos: 0, egresos: 0 })

  const toSlot = (iso: string, isEgreso: boolean) => {
    const d = new Date(iso)
    const fecha = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
    const daysDiff = (refDateMs - tripDateMs) / dayMs
    if (daysDiff < 0 || daysDiff > 6) return -1
    const dayIdx = Math.floor(6 - daysDiff)
    const h = d.getUTCHours()
    return dayIdx * 24 + h
  }

  for (const t of filtered) {
    const sIn = toSlot(t.ingresoAt, false)
    const sOut = toSlot(t.egresoAt, true)
    if (sIn >= 0) bySlot.get(sIn)!.ingresos++
    if (sOut >= 0) bySlot.get(sOut)!.egresos++
  }

  const rawAcum: number[] = []
  let acum = 0
  for (let s = 0; s < 168; s++) {
    const data = bySlot.get(s) ?? { ingresos: 0, egresos: 0 }
    acum += data.ingresos - data.egresos
    rawAcum.push(acum)
  }
  const minAcum = Math.min(...rawAcum)
  const offset = minAcum < 0 ? -minAcum : 0

  return Array.from({ length: 168 }, (_, s) => {
    const day = Math.floor(s / 24) + 1
    const hour = s % 24
    const data = bySlot.get(s) ?? { ingresos: 0, egresos: 0 }
    const saldo = data.ingresos - data.egresos
    return {
      slot: s,
      label: `D${day} ${String(hour).padStart(2, '0')}`,
      day,
      hour,
      camionesEnPlanta: Math.max(0, rawAcum[s]! + offset),
      ingresos: data.ingresos,
      egresos: data.egresos,
      saldoHorario: saldo,
    }
  })
}

export interface FlowSaturationMetrics {
  picoEnPlanta: number
  horasSobreUmbral: number
  /** P90 de camiones en planta: nivel alto habitual (no el pico máximo) */
  p90CamionesEnPlanta: number
  /** % del tiempo sobre saturación (horasSobreUmbral / totalHoras * 100). Útil para comparar semanas. */
  pctTiempoSobreSaturacion: number
  picoDeLlegadas: number
  /** Máximo de egresos por hora. Permite comparar cuánto máximo puede evacuar la planta. */
  picoDeEgresos: number
  /** Saldo horario máximo (ingresos - egresos). Brecha máxima ingreso-egreso. */
  saldoHorarioMaximo: number
  horaDelPico: string
  tiempoRecuperacionHoras: number | null
  slotPico: number
  /** Horas con ingresos > egresos (planta acumulando) */
  horasConSaldoPositivo: number
  /** Relación egresos/ingresos. 1.00 = evacúa lo que recibe; <1 = acumula; >1 = drena backlog */
  relacionEgresosIngresos: number
  /** Cantidad de veces que la serie atravesó el umbral de alerta (subiendo o bajando) */
  crucesUmbralAlerta: number
  /** Cantidad de veces que la serie atravesó el umbral de saturación (subiendo o bajando) */
  crucesUmbralSaturacion: number
}

function countThresholdCrossings(
  slots: Array<{ camionesEnPlanta: number }>,
  umbral: number
): number {
  let crossings = 0
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1]!.camionesEnPlanta
    const curr = slots[i]!.camionesEnPlanta
    const prevAbove = prev >= umbral
    const currAbove = curr >= umbral
    if (prevAbove !== currAbove) crossings += 1
  }
  return crossings
}

export function computeFlowSaturationMetrics(
  slots: Array<{ camionesEnPlanta: number; ingresos: number; egresos: number; saldoHorario?: number; hour?: number; slot?: number; label?: string }>,
  umbralSaturacion: number,
  umbralAlerta?: number
): FlowSaturationMetrics {
  if (slots.length === 0) {
    return {
      picoEnPlanta: 0,
      horasSobreUmbral: 0,
      p90CamionesEnPlanta: 0,
      pctTiempoSobreSaturacion: 0,
      picoDeLlegadas: 0,
      picoDeEgresos: 0,
      saldoHorarioMaximo: 0,
      horaDelPico: '—',
      tiempoRecuperacionHoras: null,
      slotPico: 0,
      horasConSaldoPositivo: 0,
      relacionEgresosIngresos: 0,
      crucesUmbralAlerta: 0,
      crucesUmbralSaturacion: 0,
    }
  }

  let picoEnPlanta = 0
  let slotPico = 0
  let picoDeLlegadas = 0
  let picoDeEgresos = 0
  let saldoHorarioMaximo = 0
  let horasSobreUmbral = 0
  let horasConSaldoPositivo = 0
  let totalIngresos = 0
  let totalEgresos = 0
  const valoresCamionesEnPlanta: number[] = []

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!
    valoresCamionesEnPlanta.push(s.camionesEnPlanta)
    if (s.camionesEnPlanta > picoEnPlanta) {
      picoEnPlanta = s.camionesEnPlanta
      slotPico = i
    }
    if (s.ingresos > picoDeLlegadas) picoDeLlegadas = s.ingresos
    if (s.egresos > picoDeEgresos) picoDeEgresos = s.egresos
    totalIngresos += s.ingresos
    totalEgresos += s.egresos
    const saldo = s.saldoHorario ?? s.ingresos - s.egresos
    if (saldo > saldoHorarioMaximo) saldoHorarioMaximo = saldo
    if (s.camionesEnPlanta > umbralSaturacion) horasSobreUmbral += 1
    if (saldo > 0) horasConSaldoPositivo += 1
  }

  const p90CamionesEnPlanta = p90(valoresCamionesEnPlanta)
  const totalHoras = slots.length
  const pctTiempoSobreSaturacion = totalHoras > 0 ? (horasSobreUmbral / totalHoras) * 100 : 0
  const relacionEgresosIngresos = totalIngresos > 0 ? totalEgresos / totalIngresos : 0

  const picoSlot = slots[slotPico]
  const horaDelPico = picoSlot?.label
    ? (picoSlot.label.includes(' ') ? picoSlot.label : `${picoSlot.label}:00`)
    : (picoSlot?.hour != null ? `${String(picoSlot.hour).padStart(2, '0')}:00` : '—')

  let tiempoRecuperacionHoras: number | null = null
  let inEpisode = false
  let episodeStart = -1
  let maxEpisodeDuration = 0
  for (let i = 0; i < slots.length; i++) {
    const above = slots[i]!.camionesEnPlanta > umbralSaturacion
    if (above && !inEpisode) {
      inEpisode = true
      episodeStart = i
    } else if (!above && inEpisode) {
      inEpisode = false
      const duration = i - episodeStart
      if (duration > maxEpisodeDuration) maxEpisodeDuration = duration
    }
  }
  if (inEpisode) {
    const duration = slots.length - episodeStart
    if (duration > maxEpisodeDuration) maxEpisodeDuration = duration
  }
  if (maxEpisodeDuration > 0) tiempoRecuperacionHoras = maxEpisodeDuration

  const crucesUmbralSaturacion = countThresholdCrossings(slots, umbralSaturacion)
  const crucesUmbralAlerta = umbralAlerta != null ? countThresholdCrossings(slots, umbralAlerta) : 0

  return {
    picoEnPlanta,
    horasSobreUmbral,
    p90CamionesEnPlanta,
    pctTiempoSobreSaturacion,
    picoDeLlegadas,
    picoDeEgresos,
    saldoHorarioMaximo,
    horaDelPico,
    tiempoRecuperacionHoras,
    slotPico,
    horasConSaldoPositivo,
    relacionEgresosIngresos,
    crucesUmbralAlerta,
    crucesUmbralSaturacion,
  }
}

/** Métricas de ingreso para KPI "Ingresos vs Egresos" — enfocado en presión de entrada y backlog. */
export interface IngresoKpiMetrics {
  /** 1. Pico de llegadas: max(ingresos_por_hora) */
  picoDeLlegadas: number
  /** Momento exacto del pico (ej: D2 05:00) */
  momentoPicoLlegadas: string
  /** Slot index del pico */
  slotPicoLlegadas: number
  /** 2. Ventana pico: día con más ingresos (ventana 24h) */
  ventanaPicoValor: number
  /** Día con más ingresos (ej: D3, Martes) */
  ventanaPicoDia: string
  /** Índice del primer slot del día (para sombrear en gráfico) */
  ventanaPicoSlotStart: number
  /** Índice del último slot del día */
  ventanaPicoSlotEnd: number
  /** 3. Franja crítica: día + franja de 8h con más llegadas */
  franjaCriticaNombre: string
  /** Total de camiones en esa franja */
  franjaCriticaValor: number
  /** Promedio camiones/h en la franja crítica */
  franjaCriticaPromedioPorHora: number
  /** Promedio general: camiones/h en todo el período */
  promedioIngresosPorHora: number
  /** 4. Backlog generado: mayor aumento neto de camiones en planta durante episodio con saldo positivo */
  backlogGenerado: number
  /** Intervalo donde se produjo el backlog */
  backlogIntervalo: string
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

/** Franjas de 8 horas para franja crítica de ingreso. */
const FRANJAS_8H: Array<{ start: number; end: number; label: string }> = [
  { start: 0, end: 8, label: '00:00–08:00' },
  { start: 8, end: 16, label: '08:00–16:00' },
  { start: 16, end: 24, label: '16:00–24:00' },
]

export function computeIngresoKpiMetrics(
  slots: Array<{
    ingresos: number
    egresos: number
    camionesEnPlanta: number
    saldoHorario?: number
    hour?: number
    day?: number
    label?: string
    slot?: number
  }>,
  refFecha: string
): IngresoKpiMetrics {
  const empty: IngresoKpiMetrics = {
    picoDeLlegadas: 0,
    momentoPicoLlegadas: '—',
    slotPicoLlegadas: 0,
    ventanaPicoValor: 0,
    ventanaPicoDia: '—',
    ventanaPicoSlotStart: 0,
    ventanaPicoSlotEnd: 0,
    franjaCriticaNombre: '—',
    franjaCriticaValor: 0,
    franjaCriticaPromedioPorHora: 0,
    promedioIngresosPorHora: 0,
    backlogGenerado: 0,
    backlogIntervalo: '—',
  }
  if (slots.length === 0) return empty

  // 1. Pico de llegadas
  let picoDeLlegadas = 0
  let slotPicoLlegadas = 0
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]!.ingresos > picoDeLlegadas) {
      picoDeLlegadas = slots[i]!.ingresos
      slotPicoLlegadas = i
    }
  }
  const picoSlot = slots[slotPicoLlegadas]
  const momentoPicoLlegadas = picoSlot?.label
    ? (picoSlot.label.includes(' ') ? `${picoSlot.label}:00` : `${picoSlot.label}:00`)
    : picoSlot?.hour != null
      ? `${String(picoSlot.hour).padStart(2, '0')}:00`
      : '—'

  // 2. Ventana pico: día con más ingresos (ventana 24h)
  let ventanaPicoValor = 0
  let ventanaPicoDia = '—'
  let ventanaPicoSlotStart = 0
  let ventanaPicoSlotEnd = 0
  const hasDay = slots.some((s) => s.day != null)
  if (hasDay) {
    const byDay = new Map<number, { total: number; startIdx: number; endIdx: number }>()
    for (let i = 0; i < slots.length; i++) {
      const d = slots[i]!.day ?? 1
      const prev = byDay.get(d)
      if (!prev) {
        byDay.set(d, { total: slots[i]!.ingresos, startIdx: i, endIdx: i })
      } else {
        byDay.set(d, {
          total: prev.total + slots[i]!.ingresos,
          startIdx: prev.startIdx,
          endIdx: i,
        })
      }
    }
    let maxTotal = 0
    let bestDay = 0
    for (const [day, v] of byDay) {
      if (v.total > maxTotal) {
        maxTotal = v.total
        bestDay = day
      }
    }
    if (bestDay > 0) {
      const v = byDay.get(bestDay)!
      ventanaPicoValor = v.total
      ventanaPicoSlotStart = v.startIdx
      ventanaPicoSlotEnd = v.endIdx
      const refDate = new Date(refFecha + 'T12:00:00Z')
      const targetDate = new Date(refDate)
      targetDate.setUTCDate(targetDate.getUTCDate() - (7 - bestDay))
      ventanaPicoDia = `${DIAS_SEMANA[targetDate.getUTCDay()]} (D${bestDay})`
    }
  } else {
    // Sin día (last_day o last_month): total del período
    const total = slots.reduce((s, x) => s + x.ingresos, 0)
    ventanaPicoValor = total
    ventanaPicoSlotStart = 0
    ventanaPicoSlotEnd = slots.length - 1
    ventanaPicoDia = slots.length === 24 ? 'Día' : 'Período'
  }

  // 3. Franja crítica: día + franja de 8h con más llegadas
  const hasDayForFranja = slots.some((s) => s.day != null)
  let franjaCriticaNombre = '—'
  let franjaCriticaValor = 0
  let franjaCriticaPromedioPorHora = 0

  if (hasDayForFranja) {
    const byFranja = new Map<string, { total: number; horas: number }>()
    for (const s of slots) {
      const day = s.day ?? 1
      const hour = s.hour ?? 0
      const franja = FRANJAS_8H.find((f) => hour >= f.start && hour < f.end)
      if (!franja) continue
      const key = `${day}-${franja.start}`
      const prev = byFranja.get(key) ?? { total: 0, horas: 0 }
      byFranja.set(key, { total: prev.total + s.ingresos, horas: prev.horas + 1 })
    }
    let maxTotal = 0
    let bestKey = ''
    for (const [key, v] of byFranja) {
      if (v.total > maxTotal) {
        maxTotal = v.total
        bestKey = key
      }
    }
    if (bestKey) {
      const [dayStr, startStr] = bestKey.split('-')
      const dayNum = parseInt(dayStr!, 10)
      const startH = parseInt(startStr!, 10)
      const franja = FRANJAS_8H.find((f) => f.start === startH)
      const v = byFranja.get(bestKey)!
      const refDate = new Date(refFecha + 'T12:00:00Z')
      const targetDate = new Date(refDate)
      targetDate.setUTCDate(targetDate.getUTCDate() - (7 - dayNum))
      const diaNombre = DIAS_SEMANA[targetDate.getUTCDay()]
      franjaCriticaNombre = `${diaNombre} ${franja?.label ?? ''}`
      franjaCriticaValor = v.total
      franjaCriticaPromedioPorHora = v.horas > 0 ? v.total / v.horas : 0
    }
  } else {
    const byFranja = new Map<number, { total: number; horas: number }>()
    for (const s of slots) {
      const hour = s.hour ?? 0
      const franja = FRANJAS_8H.find((f) => hour >= f.start && hour < f.end)
      if (!franja) continue
      const prev = byFranja.get(franja.start) ?? { total: 0, horas: 0 }
      byFranja.set(franja.start, { total: prev.total + s.ingresos, horas: prev.horas + 1 })
    }
    let maxTotal = 0
    let bestFranja: (typeof FRANJAS_8H)[number] | null = null
    let bestV: { total: number; horas: number } | null = null
    for (const [start, v] of byFranja) {
      if (v.total > maxTotal) {
        maxTotal = v.total
        bestFranja = FRANJAS_8H.find((f) => f.start === start) ?? null
        bestV = v
      }
    }
    if (maxTotal > 0 && bestFranja && bestV) {
      franjaCriticaNombre = bestFranja.label
      franjaCriticaValor = bestV.total
      franjaCriticaPromedioPorHora = bestV.horas > 0 ? bestV.total / bestV.horas : 0
    }
  }

  // Promedio general: camiones/h en todo el período
  const totalIngresos = slots.reduce((s, x) => s + x.ingresos, 0)
  const promedioIngresosPorHora = slots.length > 0 ? totalIngresos / slots.length : 0

  // 4. Backlog generado: episodios donde ingresos > egresos sostenidamente
  // backlog = camionesEnPlanta[fin] - camionesEnPlanta[inicio]
  let backlogGenerado = 0
  let backlogStartIdx = -1
  let backlogEndIdx = -1
  let inAcum = false
  let acumStartIdx = -1
  let acumStartPlanta = 0

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!
    const saldo = s.saldoHorario ?? s.ingresos - s.egresos
    if (saldo > 0 && !inAcum) {
      inAcum = true
      acumStartIdx = i
      acumStartPlanta = s.camionesEnPlanta
    } else if (saldo <= 0 && inAcum) {
      inAcum = false
      // Fin del episodio: último slot con saldo positivo es i-1
      const endSlot = slots[i - 1]
      const plantaFin = endSlot?.camionesEnPlanta ?? s.camionesEnPlanta
      const delta = plantaFin - acumStartPlanta
      if (delta > backlogGenerado) {
        backlogGenerado = delta
        backlogStartIdx = acumStartIdx
        backlogEndIdx = i - 1
      }
    }
  }
  if (inAcum) {
    const lastSlot = slots[slots.length - 1]!
    const delta = lastSlot.camionesEnPlanta - acumStartPlanta
    if (delta > backlogGenerado) {
      backlogGenerado = delta
      backlogStartIdx = acumStartIdx
      backlogEndIdx = slots.length - 1
    }
  }

  // Fallback: si no hay episodios claros, usar max saldo acumulado positivo en ventana
  if (backlogGenerado <= 0) {
    let maxSaldoAcum = 0
    let acum = 0
    for (let i = 0; i < slots.length; i++) {
      const saldo = slots[i]!.saldoHorario ?? slots[i]!.ingresos - slots[i]!.egresos
      acum += saldo
      if (acum > maxSaldoAcum) {
        maxSaldoAcum = acum
        backlogStartIdx = 0
        backlogEndIdx = i
      }
    }
    backlogGenerado = maxSaldoAcum
  }

  const backlogIntervalo =
    backlogStartIdx >= 0 && backlogEndIdx >= 0
      ? `${slots[backlogStartIdx]?.label ?? '—'} a ${slots[backlogEndIdx]?.label ?? '—'}`
      : '—'

  return {
    picoDeLlegadas,
    momentoPicoLlegadas,
    slotPicoLlegadas,
    ventanaPicoValor,
    ventanaPicoDia,
    ventanaPicoSlotStart,
    ventanaPicoSlotEnd,
    franjaCriticaNombre,
    franjaCriticaValor,
    franjaCriticaPromedioPorHora,
    promedioIngresosPorHora,
    backlogGenerado,
    backlogIntervalo,
  }
}

export interface SectorDensity {
  sectorId: string
  /**
   * Máximo de camiones estimados en el sector al mismo instante (ocupación simultánea).
   * Se calcula solapando intervalos de estadía por sector en el tiempo.
   */
  peakConcurrent: number
  /**
   * Viajes que pasaron por el sector al menos una vez en el período (no es ocupación simultánea).
   */
  count: number
  avgDurationMinutes: number
  alertCount: number
  /** Capacidad máxima según DENSIDAD CAMARAS (null si planta sin datos). */
  capacityCap: number | null
  /** true si peakConcurrent >= capacityCap. */
  saturated: boolean
}

/** Intervalos [start,end) en ms donde el camión está en un sector (estimado). Exportado para saturación por episodios. */
export function tripToSectorIntervals(t: HistoricalTrip): Array<{ sector: string; start: number; end: number }> {
  const sectors =
    t.secuenciaSectores && t.secuenciaSectores.length > 0
      ? t.secuenciaSectores
      : t.secuenciaCamaras?.map((c) => c.replace('CAM_', 'S')) ?? []
  if (sectors.length === 0) return []

  const t0 = new Date(t.ingresoAt).getTime()
  const t1 = new Date(t.egresoAt).getTime()
  let durationMs = t1 - t0
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    const dm = clampDurationMinutes(t.durationMinutes ?? 0)
    durationMs = dm * 60_000
  }
  if (durationMs <= 0) return []

  const tm = t.sectorTimesMinutes
  let weights: number[]
  if (tm && Object.keys(tm).length > 0) {
    const raw = sectors.map((s) => Math.max(0, tm[s] ?? 0))
    const sumKnown = raw.reduce((a, w) => a + w, 0)
    const zeros = raw.filter((w) => w === 0).length
    if (sumKnown > 0 && zeros > 0) {
      const fill = sumKnown / Math.max(1, raw.length - zeros)
      weights = raw.map((w) => (w > 0 ? w : fill))
    } else if (sumKnown > 0) {
      weights = raw
    } else {
      weights = sectors.map(() => 1)
    }
    const sw = weights.reduce((a, w) => a + w, 0)
    if (sw <= 0) weights = sectors.map(() => 1)
  } else {
    weights = sectors.map(() => 1)
  }

  const wsum = weights.reduce((a, w) => a + w, 0)
  const out: Array<{ sector: string; start: number; end: number }> = []
  let cursor = t0
  for (let i = 0; i < sectors.length; i++) {
    const segMs = (weights[i]! / wsum) * durationMs
    const sector = sectors[i]!
    if (sector && segMs > 0) {
      out.push({ sector, start: cursor, end: cursor + segMs })
    }
    cursor += segMs
  }
  return out
}

/** Máximo número de intervalos solapados (ocupación simultánea). */
function maxConcurrentOverlapping(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0
  type Ev = [number, number]
  const ev: Ev[] = []
  for (const iv of intervals) {
    if (iv.end <= iv.start) continue
    ev.push([iv.start, 1])
    ev.push([iv.end, -1])
  }
  if (ev.length === 0) return 0
  ev.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  let cur = 0
  let max = 0
  for (const [, d] of ev) {
    cur += d
    if (cur > max) max = cur
  }
  return max
}

export function computeSectorDensity(
  trips: HistoricalTrip[],
  alerts: OperationalAlert[],
  siteId?: SiteId
): SectorDensity[] {
  const capacityMap = siteId ? getSectorCapacityByPlant(siteId) : null

  const filteredTrips = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  const filteredAlerts = siteId ? alerts.filter((a) => a.siteId === siteId) : alerts
  const alertBySector = new Map<string, number>()
  for (const a of filteredAlerts) {
    const s = a.sectorId ?? 'N/A'
    alertBySector.set(s, (alertBySector.get(s) ?? 0) + 1)
  }

  const intervalsBySector = new Map<string, Array<{ start: number; end: number }>>()
  const tripsThrough = new Map<string, { count: number; totalDur: number }>()

  for (const t of filteredTrips) {
    const intervals = tripToSectorIntervals(t)
    const dur = clampDurationMinutes(t.durationMinutes ?? 0)
    const seenInTrip = new Set<string>()
    for (const iv of intervals) {
      const list = intervalsBySector.get(iv.sector) ?? []
      list.push({ start: iv.start, end: iv.end })
      intervalsBySector.set(iv.sector, list)
      if (!seenInTrip.has(iv.sector)) {
        seenInTrip.add(iv.sector)
        const prev = tripsThrough.get(iv.sector) ?? { count: 0, totalDur: 0 }
        tripsThrough.set(iv.sector, { count: prev.count + 1, totalDur: prev.totalDur + dur })
      }
    }
  }

  const sectorIds = new Set<string>([...intervalsBySector.keys(), ...tripsThrough.keys(), ...alertBySector.keys()])

  return Array.from(sectorIds)
    .filter((id) => id !== 'N/A')
    .map((sectorId) => {
      const ivs = intervalsBySector.get(sectorId) ?? []
      const peakConcurrent = maxConcurrentOverlapping(ivs)
      const tt = tripsThrough.get(sectorId) ?? { count: 0, totalDur: 0 }
      const capacityCap = capacityMap?.[sectorId] ?? null
      const saturated = capacityCap != null && peakConcurrent >= capacityCap
      return {
        sectorId,
        peakConcurrent,
        count: tt.count,
        avgDurationMinutes: tt.count > 0 ? tt.totalDur / tt.count : 0,
        alertCount: alertBySector.get(sectorId) ?? 0,
        capacityCap,
        saturated,
      }
    })
    .filter((row) => row.peakConcurrent > 0 || row.count > 0 || row.alertCount > 0)
    .sort((a, b) => b.peakConcurrent - a.peakConcurrent)
}

export interface CrossAnalytic {
  dimension1: string
  dimension2: string
  value: number
  count: number
}

/** Duración promedio por planta y circuito. */
export function crossDurationByPlantCircuit(trips: HistoricalTrip[]): CrossAnalytic[] {
  const byKey = new Map<string, { sum: number; count: number }>()
  for (const t of trips) {
    const key = `${t.siteId}|${t.circuitoFinal ?? t.catalogCode ?? 'N/A'}`
    const dur = clampDurationMinutes(t.durationMinutes ?? 0)
    const prev = byKey.get(key) ?? { sum: 0, count: 0 }
    byKey.set(key, { sum: prev.sum + dur, count: prev.count + 1 })
  }
  return Array.from(byKey.entries()).map(([k, data]) => {
    const [dimension1, dimension2] = k.split('|')
    return {
      dimension1: dimension1!,
      dimension2: dimension2!,
      value: data.count > 0 ? data.sum / data.count : 0,
      count: data.count,
    }
  })
}

/** Duración promedio por hora de ingreso — para gráfico legible. */
export function avgDurationByHour(trips: HistoricalTrip[], siteId?: SiteId): Array<{ hour: number; avgMinutes: number; count: number }> {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  const byHour = new Map<number, number[]>()
  for (let h = 0; h < 24; h++) byHour.set(h, [])
  for (const t of filtered) {
    const h = Math.floor(getHourFromIso(t.ingresoAt))
    const dur = clampDurationMinutes(t.durationMinutes ?? 0)
    byHour.get(h)!.push(dur)
  }
  return Array.from({ length: 24 }, (_, h) => {
    const durs = byHour.get(h) ?? []
    const avg = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0
    return { hour: h, avgMinutes: avg, count: durs.length }
  })
}

/** Scatter: hora de ingreso vs duración (min). Datos clampeados 60–720 min. */
export function scatterDurationVsHour(trips: HistoricalTrip[], siteId?: SiteId): Array<{ hour: number; durationMinutes: number; plate: string }> {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  return filtered.map((t) => ({
    hour: getHourFromIso(t.ingresoAt),
    durationMinutes: clampDurationMinutes(t.durationMinutes ?? 0),
    plate: t.plate,
  }))
}

/** Serie temporal: promedio de estadía por día. */
export function dailyStayMean(trips: HistoricalTrip[], siteId?: SiteId): Array<{ date: string; meanMinutes: number; count: number }> {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  const byDate = new Map<string, number[]>()
  for (const t of filtered) {
    const fecha = t.fecha ?? `${new Date(t.egresoAt).getUTCFullYear()}-${String(new Date(t.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(t.egresoAt).getUTCDate()).padStart(2, '0')}`
    const dur = clampDurationMinutes(t.durationMinutes ?? 0)
    const arr = byDate.get(fecha) ?? []
    arr.push(dur)
    byDate.set(fecha, arr)
  }
  return Array.from(byDate.entries())
    .map(([date, durs]) => ({
      date,
      meanMinutes: durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0,
      count: durs.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Estadísticas por turno. */
export function statsByShift(trips: HistoricalTrip[], siteId?: SiteId): Array<{ shiftId: string; shiftLabel: string; stats: StayTimeStats }> {
  const filtered = siteId ? trips.filter((t) => t.siteId === siteId) : trips
  return OPERATIONAL_SHIFTS.map((shift) => {
    const durations = filtered
      .filter((t) => {
        const h = getHourFromIso(t.ingresoAt)
        const s = getShiftForHour(h)
        return s.id === shift.id
      })
      .map((t) => clampDurationMinutes(t.durationMinutes ?? 0))
    return {
      shiftId: shift.id,
      shiftLabel: shift.label,
      stats: computeStayTimeStats(durations),
    }
  })
}
