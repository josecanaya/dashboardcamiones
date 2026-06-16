import { describe, expect, it } from 'vitest'
import {
  argentinaLocalParts,
  ensureArgentinaOffsetIso,
  formatArgentinaIsoFromMs,
  normalizeTimestampForExport,
  parseTimestampMs,
} from './etlTimestampNormalize'

describe('etlTimestampNormalize', () => {
  it('interpreta naive como hora Argentina (-03:00)', () => {
    const withOffset = parseTimestampMs('2026-06-04T19:14:33-03:00')
    const naive = parseTimestampMs('2026-06-04T19:14:33')
    expect(naive).toBe(withOffset)
  })

  it('fecha_tramo consistente con y sin offset', () => {
    const a = argentinaLocalParts('2026-06-05T10:40:56.056-03:00')
    const b = argentinaLocalParts('2026-06-05T10:40:56')
    expect(a?.fecha_tramo).toBe(b?.fecha_tramo)
    expect(a?.hora_inicio).toBe(b?.hora_inicio)
  })

  it('normalizeTimestampForExport agrega -03:00 a naive', () => {
    expect(normalizeTimestampForExport('2026-06-04T19:14:33')).toContain('-03:00')
  })

  it('ensureArgentinaOffsetIso no desplaza reloj naive (regresión UTC -3h)', () => {
    expect(ensureArgentinaOffsetIso('2026-06-05T15:00:00')).toBe('2026-06-05T15:00:00-03:00')
    const a = parseTimestampMs('2026-06-05T15:00:00')
    const b = parseTimestampMs('2026-06-05T17:00:00')
    expect((b - a) / 60000).toBe(120)
  })

  it('formatArgentinaIsoFromMs redondea ms UTC a AR', () => {
    const ms = parseTimestampMs('2026-06-04T19:14:33-03:00')
    expect(formatArgentinaIsoFromMs(ms)).toBe('2026-06-04T19:14:33-03:00')
  })
})
