import { describe, expect, it } from 'vitest'
import {
  daysFromStableWindowRunId,
  isEtlRunCoreTable,
  isLegacyTimestampRunId,
  isStableWindowRunId,
  stableWindowRunId,
  windowKeyFromDays,
} from './etlRunsLayout'

describe('etlRunsLayout', () => {
  it('arma runId estable from_to', () => {
    expect(stableWindowRunId('2026-07-13', '2026-07-20')).toBe('2026-07-13_2026-07-20')
    expect(windowKeyFromDays('2026-07-13', '2026-07-20')).toBe('2026-07-13..2026-07-20')
  })

  it('detecta ids estables vs legacy timestamp', () => {
    expect(isStableWindowRunId('2026-07-13_2026-07-20')).toBe(true)
    expect(isLegacyTimestampRunId('20260720-114323-6f854b')).toBe(true)
    expect(isStableWindowRunId('20260720-114323-6f854b')).toBe(false)
  })

  it('parsea días desde runId estable', () => {
    expect(daysFromStableWindowRunId('2026-07-13_2026-07-20')).toEqual({
      fromDay: '2026-07-13',
      toDay: '2026-07-20',
    })
  })

  it('allowlist núcleo incluye final_circuits y no front_events', () => {
    expect(isEtlRunCoreTable('final_circuits')).toBe(true)
    expect(isEtlRunCoreTable('debug_matrix_classification')).toBe(true)
    expect(isEtlRunCoreTable('front_events')).toBe(false)
    expect(isEtlRunCoreTable('lpr_merge_candidates')).toBe(false)
  })
})
