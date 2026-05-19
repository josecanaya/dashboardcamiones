/** Utilidades de rango semanal (lunes–domingo, hora local). */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatLocalDateIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Lunes 00:00 de la semana que contiene `ref` (hora local). */
export function mondayOfWeekContaining(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const dow = d.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return d
}

export function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + days)
  return out
}

export type WeekRange = { startDate: string; endDate: string; label: string }

export function weekRangeFromMonday(monday: Date): WeekRange {
  const sunday = addCalendarDays(monday, 6)
  return {
    startDate: formatLocalDateIso(monday),
    endDate: formatLocalDateIso(sunday),
    label: `${formatLocalDateIso(monday)} → ${formatLocalDateIso(sunday)}`,
  }
}

export function thisCalendarWeekRange(ref = new Date()): WeekRange {
  return weekRangeFromMonday(mondayOfWeekContaining(ref))
}

export function previousCalendarWeekRange(ref = new Date()): WeekRange {
  const thisMon = mondayOfWeekContaining(ref)
  return weekRangeFromMonday(addCalendarDays(thisMon, -7))
}
