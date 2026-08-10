import { describe, expect, it } from 'vitest'
import { turnoFromIso, turnoForMovimiento, turnoLabel } from './operationalTurno'

describe('operationalTurno', () => {
  it('asigna cuartos en hora Argentina (Q1 22–04 · Q2 04–10 · Q3 10–16 · Q4 16–22)', () => {
    expect(turnoFromIso('2026-06-10T03:00:00-03:00')).toBe('Q1')
    expect(turnoFromIso('2026-06-10T10:00:00-03:00')).toBe('Q3')
    expect(turnoFromIso('2026-06-10T15:00:00-03:00')).toBe('Q3')
    expect(turnoFromIso('2026-06-10T22:00:00-03:00')).toBe('Q1')
    expect(turnoFromIso('2026-06-10T01:00:00-03:00')).toBe('Q1')
    expect(turnoFromIso('2026-06-10T05:00:00-03:00')).toBe('Q2')
    expect(turnoFromIso('2026-06-10T18:00:00-03:00')).toBe('Q4')
  })

  it('prioriza salida sobre ingreso', () => {
    expect(
      turnoForMovimiento('2026-06-10T18:00:00-03:00', '2026-06-10T08:00:00-03:00')
    ).toBe('Q4')
  })

  it('etiquetas legibles', () => {
    expect(turnoLabel('Q3')).toBe('Q3 (10–16)')
  })
})
