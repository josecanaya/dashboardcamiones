/**
 * Pruebas del modelo de actividad por cámara/calle.
 *
 * Este módulo se extrajo de `CaladaCamerasPanel` para que el informe de logística reuse los
 * mismos números. Las pruebas fijan las reglas que el panel ya aplicaba, para que el informe
 * y la pantalla no se separen.
 */
import { describe, expect, it } from 'vitest'
import {
  buildCameraActivityModel,
  buildDayBarsFromJourneySets,
  cuartoFromHour,
  hourBucketOf,
  isExcelSourcedRow,
  localDayOf,
} from './etlCameraActivityModel'
import type { CaladaCameraEventRow } from './etlCaladaCameraActivity'

function ev(o: Partial<CaladaCameraEventRow>): CaladaCameraEventRow {
  return {
    journey_id: 'j1',
    patente: 'AAA111',
    producto: 'SOJA',
    circuito: 'R7',
    camara: 'RicCal01',
    timestamp: '2026-09-10T08:30:00.000-03:00',
    fecha: '2026-09-10',
    hora: '08:30',
    intervalo_hora: '2026-09-10T08:00:00',
    franja_operativa: 'Mañana',
    ...o,
  } as CaladaCameraEventRow
}

describe('hora y día de pared Argentina', () => {
  it('deriva la ventana horaria del timestamp crudo, no de las columnas horneadas', () => {
    // Columnas horneadas mal (corrida vieja en otra zona): mandan el timestamp.
    const r = ev({ timestamp: '2026-09-10T23:10:00.000-03:00', fecha: '1999-01-01', hora: '05:00' })
    expect(hourBucketOf(r)).toBe('2026-09-10T23')
    expect(localDayOf(r)).toBe('2026-09-10')
  })

  it('cae a las columnas horneadas solo si falta el timestamp', () => {
    expect(hourBucketOf(ev({ timestamp: '', intervalo_hora: '2026-09-11T07:00:00' }))).toBe(
      '2026-09-11T07'
    )
  })
})

describe('cuartos de turno', () => {
  it('Q1 cruza la medianoche (22–04)', () => {
    expect(cuartoFromHour(22)).toBe('q1')
    expect(cuartoFromHour(23)).toBe('q1')
    expect(cuartoFromHour(0)).toBe('q1')
    expect(cuartoFromHour(3)).toBe('q1')
  })

  it('el resto de las franjas son directas', () => {
    expect(cuartoFromHour(4)).toBe('q2')
    expect(cuartoFromHour(10)).toBe('q3')
    expect(cuartoFromHour(16)).toBe('q4')
    expect(cuartoFromHour(21)).toBe('q4')
  })
})

describe('conteo por calle', () => {
  it('cuenta camiones distintos, no eventos', () => {
    const m = buildCameraActivityModel([
      ev({ journey_id: 'a', camara: 'RicCal01' }),
      ev({ journey_id: 'a', camara: 'RicCal01', timestamp: '2026-09-10T09:30:00.000-03:00' }),
      ev({ journey_id: 'b', camara: 'RicCal01' }),
    ])
    const calle = m.perCamera.find((c) => c.camara === 'RicCal01')!
    expect(calle.camiones).toBe(2)
    expect(calle.eventos).toBe(3)
    expect(m.totals.trucks).toBe(2)
  })

  it('usa las horas propias de cada calle como denominador del promedio', () => {
    const m = buildCameraActivityModel([
      ev({ journey_id: 'a', camara: 'RicCal01', timestamp: '2026-09-10T08:00:00.000-03:00' }),
      ev({ journey_id: 'b', camara: 'RicCal01', timestamp: '2026-09-10T09:00:00.000-03:00' }),
    ])
    const calle = m.perCamera.find((c) => c.camara === 'RicCal01')!
    expect(calle.activeHours).toBe(2)
    expect(calle.truckHours).toBe(2)
  })
})

describe('volcable SL: la verdad del conteo es el Excel', () => {
  const rows = [
    ev({ journey_id: 'excel:CTG_1', camara: 'Volcable 2' }),
    ev({ journey_id: 'excel-vol:CTG_2', camara: 'Volcable 1' }),
    // Visto solo por cámara: NO se suma a los camiones recibidos.
    ev({ journey_id: 'raw-uid-3', camara: 'Volcable 2' }),
  ]

  it('reconoce las filas de origen Excel', () => {
    expect(isExcelSourcedRow(rows[0]!)).toBe(true)
    expect(isExcelSourcedRow(rows[1]!)).toBe(true)
    expect(isExcelSourcedRow(rows[2]!)).toBe(false)
  })

  it('con split, los camiones solo-cámara se reportan aparte y no se suman', () => {
    const m = buildCameraActivityModel(rows, { splitExcelVsCamera: true })
    expect(m.totals.trucks).toBe(2)
    expect(m.camOnlyTotal).toBe(1)
    expect(m.camOnlyByCamera.get('Volcable 2')).toBe(1)
  })

  it('sin split se cuenta todo, como en calada', () => {
    const m = buildCameraActivityModel(rows)
    expect(m.totals.trucks).toBe(3)
    expect(m.camOnlyTotal).toBe(0)
  })

  it('con split ordena las calles por número, no por volumen', () => {
    const m = buildCameraActivityModel(
      [
        ev({ journey_id: 'excel:1', camara: 'Volcable 3' }),
        ev({ journey_id: 'excel:2', camara: 'Volcable 1' }),
        ev({ journey_id: 'excel:3', camara: 'Volcable 1' }),
      ],
      { splitExcelVsCamera: true }
    )
    expect(m.perCamera.map((c) => c.camara)).toEqual(['Volcable 1', 'Volcable 3'])
  })
})

describe('exclusión de la serie horaria', () => {
  it('saca el journey completo si tocó una cámara excluida (calada líquida)', () => {
    const m = buildCameraActivityModel(
      [
        ev({ journey_id: 'liq', camara: 'RicCalLiq' }),
        // El mismo camión también pasó por una calle normal: igual queda fuera.
        ev({ journey_id: 'liq', camara: 'RicCal01' }),
        ev({ journey_id: 'solido', camara: 'RicCal01' }),
      ],
      { hourlyTrucksExcludeCameras: ['RicCalLiq'] }
    )
    // La tabla por calle sigue contando los dos camiones…
    expect(m.totals.trucks).toBe(2)
    // …pero la serie horaria excluye al que tocó la cámara líquida.
    expect(m.trucksPerHour.reduce((a, h) => a + h.camiones, 0)).toBe(1)
  })
})

describe('tarjetas del período', () => {
  it('pico y hora del pico salen de la serie horaria', () => {
    const m = buildCameraActivityModel([
      ev({ journey_id: 'a', timestamp: '2026-09-10T08:10:00.000-03:00' }),
      ev({ journey_id: 'b', timestamp: '2026-09-10T08:20:00.000-03:00' }),
      ev({ journey_id: 'c', timestamp: '2026-09-10T09:10:00.000-03:00' }),
    ])
    expect(m.totals.peakTrucks).toBe(2)
    expect(m.totals.peakTrucksLabel).toBe('10/09 08h')
    expect(m.periodHours).toBe(2)
    // Promedio = suma de camiones por hora / horas con actividad (no total / horas).
    expect(m.totals.avgTrucksPerHour).toBe(1.5)
  })
})

describe('barras por día', () => {
  it('cuenta camiones distintos por día', () => {
    const bars = buildDayBarsFromJourneySets([
      { localDay: '2026-09-10', journeyId: 'a' },
      { localDay: '2026-09-10', journeyId: 'a' },
      { localDay: '2026-09-10', journeyId: 'b' },
      { localDay: '2026-09-11', journeyId: 'c' },
    ])
    expect(bars.map((b) => [b.fecha, b.total])).toEqual([
      ['2026-09-10', 2],
      ['2026-09-11', 1],
    ])
  })
})
