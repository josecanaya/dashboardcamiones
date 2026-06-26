import { describe, expect, it } from 'vitest'
import { turnoFromIso, turnoForMovimiento, turnoLabel } from './operationalTurno'

describe('operationalTurno', () => {
  it('asigna ventanas en hora Argentina', () => {
    expect(turnoFromIso('2026-06-10T03:00:00-03:00')).toBe('02_08')
    expect(turnoFromIso('2026-06-10T10:00:00-03:00')).toBe('08_14')
    expect(turnoFromIso('2026-06-10T15:00:00-03:00')).toBe('14_20')
    expect(turnoFromIso('2026-06-10T22:00:00-03:00')).toBe('20_02')
    expect(turnoFromIso('2026-06-10T01:00:00-03:00')).toBe('20_02')
  })

  it('prioriza salida sobre ingreso', () => {
    expect(
      turnoForMovimiento('2026-06-10T18:00:00-03:00', '2026-06-10T08:00:00-03:00')
    ).toBe('14_20')
  })

  it('etiquetas legibles', () => {
    expect(turnoLabel('08_14')).toBe('08–14')
  })
})
