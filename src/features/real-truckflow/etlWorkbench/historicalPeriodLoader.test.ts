import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historicalWeeks, loadHistoricalPeriod, validHistoricalRange } from './historicalPeriodLoader'
import { listWindows, resolveWindow, requestRunEtl } from '../api/etlRunCacheApi'
import { loadTransformOutputFromRun } from './etlTransformOutputFromDisk'

vi.mock('../api/etlRunCacheApi', () => ({ listWindows: vi.fn(), resolveWindow: vi.fn(), requestRunEtl: vi.fn() }))
vi.mock('./etlTransformOutputFromDisk', () => ({ loadTransformOutputFromRun: vi.fn() }))
const week = { from: '2026-09-07', to: '2026-09-13', runId: 'week', rulesVersion: 'v1', createdAt: '', stale: false }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listWindows).mockResolvedValue([week])
  vi.mocked(resolveWindow).mockResolvedValue({ ...week, inputHash: '', currentRulesVersion: 'v1' })
  vi.mocked(loadTransformOutputFromRun).mockResolvedValue({ csv: {}, tables: {}, stats: {}, rulesVersion: 'v1' } as never)
})

describe('período histórico compartido', () => {
  it('rechaza fechas imposibles y rangos invertidos', () => {
    expect(validHistoricalRange({ from: '2026-02-30', to: '2026-03-01' })).toBe(false)
    expect(validHistoricalRange({ from: '2026-09-15', to: '2026-09-14' })).toBe(false)
    expect(() => historicalWeeks({ from: '', to: '' })).toThrow()
  })
  it('procesa solo semanas lunes a domingo también al cruzar el año', () => {
    expect(historicalWeeks({ from: '2026-12-31', to: '2027-01-05' })).toEqual([
      { from: '2026-12-28', to: '2027-01-03' }, { from: '2027-01-04', to: '2027-01-10' },
    ])
  })
  it('reutiliza una corrida vigente sin ejecutar el ETL', async () => {
    const result = await loadHistoricalPeriod(week)
    expect(result.output).not.toBeNull()
    expect(result.usedRunIds).toEqual(['week'])
    expect(requestRunEtl).not.toHaveBeenCalled()
  })
  it('no hidrata un período incompleto ni presenta cifras parciales', async () => {
    const result = await loadHistoricalPeriod({ from: week.from, to: '2026-09-14' })
    expect(result.coverage.missingDays).toEqual(['2026-09-14'])
    expect(result.output).toBeNull()
    expect(loadTransformOutputFromRun).not.toHaveBeenCalled()
    expect(requestRunEtl).not.toHaveBeenCalled()
  })
  it('verifica inputs obsoletos aunque la lista diga vigente', async () => {
    vi.mocked(resolveWindow).mockResolvedValue({ ...week, stale: true, inputHash: '', currentRulesVersion: 'v2' })
    const result = await loadHistoricalPeriod(week)
    expect(result.staleWindows).toHaveLength(1)
    expect(result.output).toBeNull()
  })
  it('procesa la semana faltante y nunca crea un rango ad hoc', async () => {
    vi.mocked(listWindows).mockResolvedValueOnce([]).mockResolvedValue([week])
    vi.mocked(resolveWindow).mockResolvedValueOnce(null).mockResolvedValue({ ...week, inputHash: '', currentRulesVersion: 'v1' })
    await loadHistoricalPeriod(week, { processMissing: true })
    expect(requestRunEtl).toHaveBeenCalledExactlyOnceWith(week.from, week.to, { force: false })
  })
  it('propaga un error de red sin declararlo falta de datos', async () => {
    vi.mocked(listWindows).mockRejectedValue(new Error('Sin conexión'))
    await expect(loadHistoricalPeriod(week)).rejects.toThrow('Sin conexión')
    expect(requestRunEtl).not.toHaveBeenCalled()
  })
})
