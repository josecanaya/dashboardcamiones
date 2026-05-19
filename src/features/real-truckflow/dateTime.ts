/** Helpers para selector local “Período de trabajo” (misma convención que export Power BI). */

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function toIsoLocalDateTime(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  const hh = String(value.getHours()).padStart(2, '0')
  const mm = String(value.getMinutes()).padStart(2, '0')
  const ss = String(value.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

export function parseLocalPeriodStart(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = (timeStr || '00:00').split(':')
  const hh = Number(parts[0]) || 0
  const mm = Number(parts[1]) || 0
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0)
}

export function parseLocalPeriodEnd(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const parts = (timeStr || '23:59').split(':')
  const hh = Number(parts[0]) || 0
  const mm = Number(parts[1]) || 0
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, 59, 999)
}
