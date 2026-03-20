/**
 * Configuración de turnos operativos.
 * Centralizada para evitar valores rígidos en la lógica principal.
 */

export interface ShiftConfig {
  id: string
  label: string
  /** Hora de inicio (0-23) */
  startHour: number
  /** Hora de fin (0-23, puede ser < startHour si cruza medianoche) */
  endHour: number
}

/** Turnos por defecto. Editable según operación real. */
export const OPERATIONAL_SHIFTS: ShiftConfig[] = [
  { id: 'manana', label: 'Mañana', startHour: 6, endHour: 14 },
  { id: 'tarde', label: 'Tarde', startHour: 14, endHour: 22 },
  { id: 'noche', label: 'Noche', startHour: 22, endHour: 6 },
]

/** Determina el turno para una hora del día (0-23.99). */
export function getShiftForHour(hour: number): ShiftConfig {
  const h = hour % 24
  for (const shift of OPERATIONAL_SHIFTS) {
    if (shift.startHour <= shift.endHour) {
      if (h >= shift.startHour && h < shift.endHour) return shift
    } else {
      if (h >= shift.startHour || h < shift.endHour) return shift
    }
  }
  return OPERATIONAL_SHIFTS[0]!
}

/** Obtiene la hora decimal desde un timestamp ISO. */
export function getHourFromIso(iso: string): number {
  const d = new Date(iso)
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
}
