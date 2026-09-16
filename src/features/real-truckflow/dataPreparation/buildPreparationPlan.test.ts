import { describe, expect, it } from 'vitest'
import { buildPreparationPlan } from './buildPreparationPlan'
import { historicalWeeks } from '../etlWorkbench/historicalPeriodLoader'
import { enumerateDays } from '../etlWorkbench/etlComposeRuns'
import type { SavedWindow } from '../api/etlRunCacheApi'
import type { SourceDay } from './types'

const savedWindow = (from: string, to: string, runId = `run:${from}:${to}`): SavedWindow => ({
  from,
  to,
  runId,
  rulesVersion: 'etl_transform_v16',
  createdAt: '2026-01-01T00:00:00.000Z',
  stale: false,
})

/** Día fuente todo disponible (eventos+alertas), para no disparar descargas de más. */
const availableDay = (day: string): SourceDay => ({
  day,
  events: { state: 'available', count: 10, fetchedAt: '2026-01-01T00:00:00.000Z' },
  alerts: { state: 'available', count: 1, fetchedAt: '2026-01-01T00:00:00.000Z' },
})

const excelCoverageFor = (from: string, to: string) => enumerateDays(from, to).map((day) => ({ day, rows: 5 }))

describe('buildPreparationPlan', () => {
  it('vigente exacto: sólo load, sin download/process', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', '2026-03-08').map(availableDay),
      savedRuns: [savedWindow(range.from, range.to)],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    expect(result.usesFullyCachedCoverage).toBe(true)
    expect(result.steps).toEqual([{ key: `load:${range.from}:${range.to}`, kind: 'load', from: range.from, to: range.to }])
  })

  it('vigente compuesto: dos corridas que cubren el rango → sólo load', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', '2026-03-08').map(availableDay),
      savedRuns: [savedWindow('2026-03-02', '2026-03-04'), savedWindow('2026-03-05', '2026-03-08')],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    expect(result.usesFullyCachedCoverage).toBe(true)
    expect(result.steps).toEqual([{ key: `load:${range.from}:${range.to}`, kind: 'load', from: range.from, to: range.to }])
  })

  it('hueco (semana faltante entera): downloads de todos los días + 1 process + load', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' } // lunes a domingo
    const result = buildPreparationPlan({
      range,
      sourceDays: [],
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    const downloads = result.steps.filter((s) => s.kind === 'download')
    const processes = result.steps.filter((s) => s.kind === 'process')
    const loads = result.steps.filter((s) => s.kind === 'load')
    // 7 días de la semana + arrastre del domingo previo (2026-03-01).
    expect(downloads).toHaveLength(8)
    expect(downloads[0]).toMatchObject({ from: '2026-03-01' })
    expect(downloads.map((d) => d.from)).toEqual([...downloads.map((d) => d.from)].sort())
    expect(processes).toEqual([{ key: 'process:2026-03-02:2026-03-08', kind: 'process', from: '2026-03-02', to: '2026-03-08' }])
    expect(loads).toEqual([{ key: `load:${range.from}:${range.to}`, kind: 'load', from: range.from, to: range.to }])
    // Orden fijo: downloads primero, luego process, luego load.
    expect(result.steps.map((s) => s.kind)).toEqual([
      ...Array(8).fill('download'),
      'process',
      'load',
    ])
  })

  it('stale: savedRuns vacío (ya filtrado afuera) → planea process', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', '2026-03-08').map(availableDay),
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    expect(result.steps.some((s) => s.kind === 'process')).toBe(true)
    expect(result.usesFullyCachedCoverage).toBe(false)
  })

  it('fuente parcial → download del día', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const sourceDays = enumerateDays('2026-03-01', '2026-03-08').map(availableDay)
    const partialIdx = sourceDays.findIndex((d) => d.day === '2026-03-04')
    sourceDays[partialIdx] = { ...sourceDays[partialIdx], events: { state: 'partial', count: 3, fetchedAt: null } }
    const result = buildPreparationPlan({
      range,
      sourceDays,
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    const downloads = result.steps.filter((s) => s.kind === 'download')
    expect(downloads).toEqual([{ key: 'download:2026-03-04', kind: 'download', from: '2026-03-04', to: '2026-03-04', note: 'Actualizar eventos y alertas del día' }])
  })

  it('fuente error → download del día + limitación textual', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const sourceDays = enumerateDays('2026-03-01', '2026-03-08').map(availableDay)
    const errorIdx = sourceDays.findIndex((d) => d.day === '2026-03-06')
    sourceDays[errorIdx] = { ...sourceDays[errorIdx], alerts: { state: 'error', count: null, fetchedAt: null } }
    const result = buildPreparationPlan({
      range,
      sourceDays,
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    const downloads = result.steps.filter((s) => s.kind === 'download')
    expect(downloads.map((d) => d.from)).toContain('2026-03-06')
    expect(result.limitations.some((l) => l.includes('2026-03-06'))).toBe(true)
  })

  it('arrastre de domingo: si el rango empieza lunes, el domingo previo se considera para descarga', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' } // lunes
    const sourceDays = enumerateDays('2026-03-02', '2026-03-08').map(availableDay) // sin el domingo previo
    const result = buildPreparationPlan({
      range,
      sourceDays,
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    const downloads = result.steps.filter((s) => s.kind === 'download')
    expect(downloads.map((d) => d.from)).toContain('2026-03-01')
  })

  it('cruce de año (2025-12-29 a 2026-01-04): semanas canónicas correctas', () => {
    const range = { from: '2025-12-29', to: '2026-01-04' }
    const expectedWeeks = historicalWeeks(range)
    const result = buildPreparationPlan({
      range,
      sourceDays: [],
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, range.to),
      lastCompleteDay: '2026-01-10',
      excelIncompleteAcknowledged: false,
    })
    const processes = result.steps.filter((s) => s.kind === 'process')
    expect(processes.map((p) => ({ from: p.from, to: p.to }))).toEqual(
      expectedWeeks.map((w) => ({ from: w.from, to: w.to }))
    )
  })

  it('semana abierta hasta ayer: process con to = último día canónico, limitación de semana en curso', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' } // semana completa, pero "hoy" cae en el medio
    const lastCompleteDay = '2026-03-05'
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', lastCompleteDay).map(availableDay),
      savedRuns: [],
      excelCoverage: excelCoverageFor(range.from, lastCompleteDay),
      lastCompleteDay,
      excelIncompleteAcknowledged: false,
    })
    const processes = result.steps.filter((s) => s.kind === 'process')
    expect(processes).toEqual([{ key: 'process:2026-03-02:2026-03-05', kind: 'process', from: '2026-03-02', to: '2026-03-05' }])
    expect(result.limitations).toContain('Semana en curso · datos hasta 2026-03-05')
    // Nada de días futuros (03-06..03-08) en downloads.
    const downloads = result.steps.filter((s) => s.kind === 'download')
    expect(downloads.some((d) => d.from > lastCompleteDay)).toBe(false)
  })

  it('futuro puro: steps vacío y limitación explícita', () => {
    const result = buildPreparationPlan({
      range: { from: '2026-04-01', to: '2026-04-07' },
      sourceDays: [],
      savedRuns: [],
      excelCoverage: [],
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    expect(result.steps).toEqual([])
    expect(result.limitations).toEqual(['El rango solicitado es futuro; no hay datos que preparar'])
    expect(result.missingExcelDays).toEqual([])
  })

  it('Excel desconocido sin ack → requiresExcelDecision true', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', '2026-03-08').map(availableDay),
      savedRuns: [savedWindow(range.from, range.to)],
      excelCoverage: [],
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: false,
    })
    expect(result.requiresExcelDecision).toBe(true)
    expect(result.missingExcelDays.length).toBeGreaterThan(0)
  })

  it('Excel desconocido con ack → requiresExcelDecision false y limitación registrada', () => {
    const range = { from: '2026-03-02', to: '2026-03-08' }
    const result = buildPreparationPlan({
      range,
      sourceDays: enumerateDays('2026-03-01', '2026-03-08').map(availableDay),
      savedRuns: [savedWindow(range.from, range.to)],
      excelCoverage: [],
      lastCompleteDay: '2026-03-15',
      excelIncompleteAcknowledged: true,
    })
    expect(result.requiresExcelDecision).toBe(false)
    expect(result.limitations.some((l) => l.startsWith('Cobertura Excel incompleta'))).toBe(true)
  })
})
