/**
 * Cuartos operativos del día (hora Argentina). Ventanas [inicio, fin) de 6 h.
 * Q1 (22–04) cruza medianoche. Definición única del proyecto: la comparte el filtro de
 * banda horaria del scatter KPI y el panel Calada.
 */

export type Turno = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'unknown'

export const TURNOS_OPERATIVOS = ['Q1', 'Q2', 'Q3', 'Q4'] as const satisfies readonly Exclude<
  Turno,
  'unknown'
>[]

export function turnoLabel(turno: Turno): string {
  switch (turno) {
    case 'Q1':
      return 'Q1 (22–04)'
    case 'Q2':
      return 'Q2 (04–10)'
    case 'Q3':
      return 'Q3 (10–16)'
    case 'Q4':
      return 'Q4 (16–22)'
    default:
      return '—'
  }
}

function hourArgentina(iso: string): number | null {
  const s = String(iso ?? '').trim()
  if (!s) return null
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(t))
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  return Number.isFinite(h) ? h : null
}

/** Asigna cuarto a partir de la hora entera local (0–23). */
export function turnoFromHour(hour: number): Turno {
  if (!Number.isFinite(hour)) return 'unknown'
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 4 && h < 10) return 'Q2'
  if (h >= 10 && h < 16) return 'Q3'
  if (h >= 16 && h < 22) return 'Q4'
  return 'Q1' // 22, 23, 0, 1, 2, 3
}

/** Asigna cuarto según instante en America/Argentina/Buenos_Aires. */
export function turnoFromIso(iso: string): Turno {
  const h = hourArgentina(iso)
  if (h === null) return 'unknown'
  return turnoFromHour(h)
}

export function turnoForMovimiento(salidaAt?: string, ingresoAt?: string): Turno {
  const sal = String(salidaAt ?? '').trim()
  if (sal) return turnoFromIso(sal)
  const ing = String(ingresoAt ?? '').trim()
  if (ing) return turnoFromIso(ing)
  return 'unknown'
}

/** Colores de dispersión KPI (Q1 noche → Q4 tarde). */
export const TURNO_SCATTER_COLORS: Record<Exclude<Turno, 'unknown'>, string> = {
  Q1: '#dc2626',
  Q2: '#2563eb',
  Q3: '#f97316',
  Q4: '#16a34a',
}

export const TURNO_SCATTER_WINDOWS: Record<
  Exclude<Turno, 'unknown'>,
  { desde: string; hasta: string }
> = {
  Q1: { desde: '22:00', hasta: '04:00' },
  Q2: { desde: '04:00', hasta: '10:00' },
  Q3: { desde: '10:00', hasta: '16:00' },
  Q4: { desde: '16:00', hasta: '22:00' },
}

/** @deprecated Usar turnoFromIso — alias histórico en tests. */
export function dayNightLabelFromIso(iso: string): Turno {
  return turnoFromIso(iso)
}

export type DayNight = Turno
