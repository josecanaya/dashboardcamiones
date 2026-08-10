import { describe, expect, it } from 'vitest'
import {
  buildQuarterCircuitSummary,
  buildSegmentScatterByDayRows,
  resolveFranjaHoraria,
} from './etlSegmentScatterByDay'
import { FRANJA_HORARIA_ORDER } from './etlSegmentScatterByDay'

describe('resolveFranjaHoraria', () => {
  it('cuartos Q1 22–04 · Q2 04–10 · Q3 10–16 · Q4 16–22', () => {
    expect(resolveFranjaHoraria('2026-05-29T03:00:00-03:00')).toBe('Q1')
    expect(resolveFranjaHoraria('2026-05-29T07:30:00-03:00')).toBe('Q2')
    expect(resolveFranjaHoraria('2026-05-29T08:00:00-03:00')).toBe('Q2')
    expect(resolveFranjaHoraria('2026-05-29T11:30:00-03:00')).toBe('Q3')
    expect(resolveFranjaHoraria('2026-05-29T14:00:00-03:00')).toBe('Q3')
    expect(resolveFranjaHoraria('2026-05-29T17:45:00-03:00')).toBe('Q4')
    expect(resolveFranjaHoraria('2026-05-29T20:00:00-03:00')).toBe('Q4')
    expect(resolveFranjaHoraria('2026-05-29T23:30:00-03:00')).toBe('Q1')
    expect(resolveFranjaHoraria('2026-05-29T01:00:00-03:00')).toBe('Q1')
  })
})

describe('buildSegmentScatterByDayRows', () => {
  it('asigna turno por inicio del tramo', () => {
    const rows = buildSegmentScatterByDayRows([
      {
        journey_id: 'j1',
        patente: 'ABC123',
        producto: 'SOJA',
        circuito: 'R1',
        segment_from: 'BALANZA_INGRESO',
        segment_to: 'BALANZA_EGRESO',
        timestamp_inicio: '2026-05-29T09:00:00-03:00',
        timestamp_fin: '2026-05-29T10:00:00-03:00',
        duracion_minutos: 60,
        estado_ejecutivo: 'VALIDO',
      },
    ])
    expect(rows[0]!.franja_horaria).toBe('Q2')
  })
})

describe('buildQuarterCircuitSummary', () => {
  it('día operativo desde las 22:00: cuenta en el día siguiente Q1 y descarta ingresos previos', () => {
    const summary = buildQuarterCircuitSummary(
      [
        // A: ingreso 26 a las 23:30 (≥22:00) → día operativo 27, Q1. Puerta a puerta 23:30 → 02:00 = 150 min.
        { ingresoExcelAt: '2026-07-26T23:30:00-03:00', salidaExcelAt: '2026-07-27T02:00:00-03:00' },
        // B: ingreso 26 a las 15:00 (< 22:00) → día operativo 26 < período → DESCARTADO.
        { ingresoExcelAt: '2026-07-26T15:00:00-03:00', salidaExcelAt: '2026-07-27T09:00:00-03:00' },
        // C: cámara 27 05:00 → Q2; puerta a puerta Excel 04:30 → 06:00 = 90 min.
        {
          ingresoCameraAt: '2026-07-27T05:00:00-03:00',
          ingresoExcelAt: '2026-07-27T04:30:00-03:00',
          salidaExcelAt: '2026-07-27T06:00:00-03:00',
        },
        // D: sin ninguna hora de ingreso → no ubicable.
        { salidaExcelAt: '2026-07-27T09:00:00-03:00' },
      ],
      { periodStartDay: '2026-07-27' }
    )
    expect(summary.total).toBe(2)
    expect(summary.descartadasPeriodoAnterior).toBe(1)
    expect(summary.sinIngreso).toBe(1)
    expect(summary.porCuarto.Q1.camiones).toBe(1)
    expect(summary.porCuarto.Q1.tiempoMedioMin).toBe(150)
    expect(summary.porCuarto.Q2.camiones).toBe(1)
    expect(summary.porCuarto.Q2.tiempoMedioMin).toBe(90)
    const suma = FRANJA_HORARIA_ORDER.reduce((n, q) => n + summary.porCuarto[q].camiones, 0)
    expect(suma).toBe(summary.total)
  })

  it('selectedDay compara contra el día operativo (ingreso 22:00 del día previo → primer día)', () => {
    const ops = [{ ingresoExcelAt: '2026-07-26T23:30:00-03:00' }]
    expect(
      buildQuarterCircuitSummary(ops, { periodStartDay: '2026-07-27', selectedDay: '2026-07-27' }).total
    ).toBe(1)
    expect(
      buildQuarterCircuitSummary(ops, { periodStartDay: '2026-07-27', selectedDay: '2026-07-28' }).total
    ).toBe(0)
  })
})
