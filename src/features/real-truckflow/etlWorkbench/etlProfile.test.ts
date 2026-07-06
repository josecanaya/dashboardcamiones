import { describe, expect, it, vi } from 'vitest'
import { createEtlProfiler, isEtlProfileEnabled } from './etlProfile'

describe('etlProfile', () => {
  it('isEtlProfileEnabled respeta ETL_PROFILE', () => {
    const prev = process.env.ETL_PROFILE
    process.env.ETL_PROFILE = 'true'
    expect(isEtlProfileEnabled()).toBe(true)
    process.env.ETL_PROFILE = prev
  })

  it('acumula spans y no-op cuando está deshabilitado', async () => {
    const off = createEtlProfiler(false)
    const v = await off.span('x', () => 42)
    expect(v).toBe(42)
    expect(off.getSpans()).toEqual([])

    const on = createEtlProfiler(true)
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    await on.span('alpha', async () => {
      await new Promise((r) => setTimeout(r, 2))
      return 1
    })
    on.mark('beta', 5)
    on.end()
    expect(on.getSpans().some((s) => s.name === 'alpha' && s.durationMs >= 0)).toBe(true)
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('[ETL PROFILE]'))).toBe(true)
    logSpy.mockRestore()
  })
})
