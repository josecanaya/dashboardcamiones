import { describe, expect, it } from 'vitest'
import { parseDssReferenceCsv } from './dssReferenceCsv'

describe('parseDssReferenceCsv', () => {
  it('parsea metric_key y dss_count', () => {
    const { metrics, errors } = parseDssReferenceCsv(
      'metric_key,dss_count\ningreso_frontal,100\njourneys,120\n'
    )
    expect(errors).toEqual([])
    expect(metrics.ingreso_frontal).toBe(100)
    expect(metrics.journeys).toBe(120)
  })
})
