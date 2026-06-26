/** Turnos operativos (hora Argentina). Ventanas [inicio, fin). 20–02 cruza medianoche. */

export type Turno = '02_08' | '08_14' | '14_20' | '20_02' | 'unknown'

export const TURNOS_OPERATIVOS: readonly Turno[] = ['02_08', '08_14', '14_20', '20_02']

export function turnoLabel(turno: Turno): string {
  switch (turno) {
    case '02_08':
      return '02–08'
    case '08_14':
      return '08–14'
    case '14_20':
      return '14–20'
    case '20_02':
      return '20–02'
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

/** Asigna turno según instante en America/Argentina/Buenos_Aires. */
export function turnoFromIso(iso: string): Turno {
  const h = hourArgentina(iso)
  if (h === null) return 'unknown'
  if (h >= 2 && h < 8) return '02_08'
  if (h >= 8 && h < 14) return '08_14'
  if (h >= 14 && h < 20) return '14_20'
  return '20_02'
}

export function turnoForMovimiento(salidaAt?: string, ingresoAt?: string): Turno {
  const sal = String(salidaAt ?? '').trim()
  if (sal) return turnoFromIso(sal)
  const ing = String(ingresoAt ?? '').trim()
  if (ing) return turnoFromIso(ing)
  return 'unknown'
}

/** Colores de dispersión KPI (misma paleta que antes: azul → naranja → verde → rojo). */
export const TURNO_SCATTER_COLORS: Record<Exclude<Turno, 'unknown'>, string> = {
  '02_08': '#2563eb',
  '08_14': '#f97316',
  '14_20': '#16a34a',
  '20_02': '#dc2626',
}

export const TURNO_SCATTER_WINDOWS: Record<
  Exclude<Turno, 'unknown'>,
  { desde: string; hasta: string }
> = {
  '02_08': { desde: '02:00', hasta: '08:00' },
  '08_14': { desde: '08:00', hasta: '14:00' },
  '14_20': { desde: '14:00', hasta: '20:00' },
  '20_02': { desde: '20:00', hasta: '02:00' },
}

/** @deprecated Usar turnoFromIso — alias histórico en tests. */
export function dayNightLabelFromIso(iso: string): Turno {
  return turnoFromIso(iso)
}

export type DayNight = Turno
