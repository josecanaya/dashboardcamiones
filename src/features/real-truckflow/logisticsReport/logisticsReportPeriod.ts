/**
 * Período efectivo del informe de logística.
 *
 * El informe habitual es **jueves → miércoles**, pero las corridas se guardan como semanas
 * calendario **lunes → domingo**. El paquete usa SIEMPRE el período exacto seleccionado por
 * el usuario: los días fuera del rango se descartan aunque la corrida los contenga.
 *
 * Los gráficos de la plantilla rotulan los días por nombre (Jueves…Miércoles), así que hace
 * falta el mapa nombre → fecha. Un período que no sea de 7 días jueves→miércoles se marca
 * `atipico`: la plantilla no tiene dónde ponerlo y esos gráficos quedan pendientes en vez de
 * rellenarse con días corridos.
 */
import { enumerateDays } from '../etlWorkbench/etlOperationalDay'

/** Nombres tal como los rotula la plantilla (columna A de las hojas de gráficos). */
export const WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

/** Orden de los días en la plantilla del informe estándar. */
export const REPORT_WEEKDAY_ORDER = [
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
] as const

export function weekdayNameOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return WEEKDAY_NAMES[d.getUTCDay()] ?? ''
}

export type ReportPeriod = {
  from: string
  to: string
  /** Días exactos del período, en orden. */
  days: string[]
  /** Cantidad de días del período. */
  dayCount: number
  /** Semana completa jueves→miércoles (7 días). */
  standardThursdayToWednesday: boolean
  /**
   * **Semana en curso**: arranca jueves pero todavía no llegó al miércoles. Es el caso
   * habitual durante la semana (P07: «el viernes hago solo jueves, el martes hago del
   * jueves al lunes»), y el informe semanal se va completando día a día (P02). NO es un
   * período atípico: los días que ya están se ubican en su lugar de la plantilla y los que
   * faltan quedan pendientes, sin rellenarse con cero.
   */
  partialWeekInProgress: boolean
  /**
   * `true` solo si el período no arranca jueves o excede la semana. Ahí sí hay que
   * identificarlo como atípico (decisión P01).
   */
  atypical: boolean
  /**
   * Nombre de día → fecha, para los días presentes. Vacío si el período es atípico: la
   * plantilla rotula por nombre y no hay forma de ubicar días que no son de la semana.
   */
  dayByWeekday: Map<string, string>
  /** Días de la semana estándar que el período todavía no cubre. */
  missingWeekdays: string[]
}

export function buildReportPeriod(from: string, to: string): ReportPeriod {
  const days = enumerateDays(from, to)
  const startsThursday = weekdayNameOf(from) === 'Jueves'
  const standard = days.length === 7 && startsThursday && weekdayNameOf(to) === 'Miércoles'
  const partial = !standard && startsThursday && days.length >= 1 && days.length < 7

  const dayByWeekday = new Map<string, string>()
  if (standard || partial) for (const d of days) dayByWeekday.set(weekdayNameOf(d), d)

  return {
    from,
    to,
    days,
    dayCount: days.length,
    standardThursdayToWednesday: standard,
    partialWeekInProgress: partial,
    atypical: !standard && !partial,
    dayByWeekday,
    missingWeekdays: REPORT_WEEKDAY_ORDER.filter((w) => !dayByWeekday.has(w)),
  }
}

/** `2026-09-10` → `10/09`. */
export function shortDate(day: string): string {
  return day.length >= 10 ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : day
}

/** Etiqueta de período para la portada/índice: `10/09 al 16/09/2026`. */
export function periodLabel(period: ReportPeriod): string {
  if (!period.from || !period.to) return ''
  return `${shortDate(period.from)} al ${shortDate(period.to)}/${period.to.slice(0, 4)}`
}
