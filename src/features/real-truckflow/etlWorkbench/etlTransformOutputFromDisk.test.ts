import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadTransformOutputFromRun } from './etlTransformOutputFromDisk'
import { getRunSummary, listRunTables, fetchRunTable } from '../api/etlRunCacheApi'
vi.mock('../api/etlRunCacheApi', () => ({ getRunSummary:vi.fn(), listRunTables:vi.fn(), fetchRunTable:vi.fn() }))
describe('Hidratación de KPI persistido', () => {
  beforeEach(() => {
    vi.mocked(getRunSummary).mockResolvedValue({runId:'test',manifest:{rulesVersion:'v17'},stats:{kpiTiemposBuilt:true,segmentTiming:{legs:2}}})
    vi.mocked(listRunTables).mockResolvedValue(['segment_timing_legs'])
  })
  it('reconstruye índices aunque stats solo tenga contadores', async () => {
    vi.mocked(fetchRunTable).mockResolvedValue({headers:[],rows:[10,20].map((duration,i)=>({executive_circuit_code:'R5',journey_id:String(i),plate:'ABC123',from_logical:'PREINGRESO',to_logical:'CALADA',duration_min:duration}))})
    const output=await loadTransformOutputFromRun('test')
    expect(output.stats.segmentTiming?.legs).toHaveLength(2)
    expect(output.stats.segmentTiming?.circuitCodes).toEqual(['R5'])
    expect(output.stats.segmentTiming?.aggregates.find(a => a.transitionKey === 'PREINGRESO→CALADA')?.stats.count).toBe(2)
  })
  it('un esquema incompatible no se presenta como ausencia de datos', async () => {
    vi.mocked(fetchRunTable).mockResolvedValue({headers:[],rows:[{foo:1}]})
    await expect(loadTransformOutputFromRun('test')).rejects.toThrow('incompatible')
  })
  it('sin tabla no afirma que el KPI esté construido', async () => {
    vi.mocked(listRunTables).mockResolvedValue([])
    expect((await loadTransformOutputFromRun('test')).stats.kpiTiemposBuilt).toBe(false)
  })
})
