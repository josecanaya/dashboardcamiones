import { describe, expect, it } from 'vitest'
import {
  filterClassificationEntriesByProduct,
  parseJourneyProductLookup,
  PRODUCT_FILTER_ALL,
  journeyIdsForProduct,
} from './etlProductFilter'

describe('etlProductFilter', () => {
  const csv = [
    'journey_uid,plate_normalized,product_normalized',
    'j1,AA111,SOJA',
    'j2,BB222,MAIZ',
    'j3,CC333,',
  ].join('\n')

  it('parsea productos del merge', () => {
    const lookup = parseJourneyProductLookup(csv)
    expect(lookup?.products).toEqual(['MAIZ', 'SOJA'])
    expect(lookup?.byJourneyId.get('j1')).toBe('SOJA')
  })

  it('filtra entries por producto', () => {
    const lookup = parseJourneyProductLookup(csv)!
    const entries = [
      { journeyId: 'j1', plate: 'AA111' },
      { journeyId: 'j2', plate: 'BB222' },
    ] as Parameters<typeof filterClassificationEntriesByProduct>[0]
    const f = filterClassificationEntriesByProduct(entries, lookup, 'SOJA')
    expect(f).toHaveLength(1)
    expect(f[0]!.journeyId).toBe('j1')
  })

  it('ALL no filtra', () => {
    const lookup = parseJourneyProductLookup(csv)!
    const entries = [{ journeyId: 'j1' }, { journeyId: 'j2' }] as Parameters<
      typeof filterClassificationEntriesByProduct
    >[0]
    expect(filterClassificationEntriesByProduct(entries, lookup, PRODUCT_FILTER_ALL)).toHaveLength(2)
  })

  it('journeyIdsForProduct', () => {
    const lookup = parseJourneyProductLookup(csv)!
    expect([...journeyIdsForProduct(lookup, 'MAIZ')]).toEqual(['j2'])
  })
})
