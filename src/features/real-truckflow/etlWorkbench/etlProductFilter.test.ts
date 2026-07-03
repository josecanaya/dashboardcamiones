import { describe, expect, it } from 'vitest'
import {
  filterClassificationEntriesByProduct,
  filterClassificationEntriesByJourneyIds,
  buildExecutiveProductFilterPlan,
  parseExcelFirstProductLookup,
  parseJourneyProductLookup,
  resolveAnalysisProductLookup,
  PRODUCT_FILTER_ALL,
  productMatchesExecutiveSampleFilter,
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

  it('parseExcelFirstProductLookup desde matched_journey_uids', () => {
    const excelCsv = [
      'external_operation_id,resolved_product,product_normalized,matched_journey_uids,evidence_count,match_quality',
      'op1,SOJA,SOJA,j1|j2,1,EXTERNAL_MATCH_PROBABLE',
      'op2,MAIZ,MAIZ,j3,1,EXTERNAL_MATCH_PROBABLE',
    ].join('\n')
    const lookup = parseExcelFirstProductLookup(excelCsv)
    expect(lookup?.products).toEqual(['MAIZ', 'SOJA'])
    expect(lookup?.byJourneyId.get('j1')).toBe('SOJA')
    expect(lookup?.byJourneyId.get('op1')).toBe('SOJA')
    expect(lookup?.byJourneyId.get('op2')).toBe('MAIZ')
    expect(lookup?.byJourneyId.get('j3')).toBe('MAIZ')
  })

  it('resolveAnalysisProductLookup prefiere Excel-first', () => {
    const excelCsv = [
      'resolved_product,matched_journey_uids,evidence_count,match_quality',
      'SOJA,j1,1,EXTERNAL_MATCH_PROBABLE',
    ].join('\n')
    const mergedCsv = [
      'journey_uid,product_normalized',
      'j1,MAIZ',
    ].join('\n')
    const lookup = resolveAnalysisProductLookup({
      excel_operations_with_truckflow: excelCsv,
      merged_truckflow_movimientos: mergedCsv,
    })
    expect(lookup?.byJourneyId.get('j1')).toBe('SOJA')
  })

  it('ACEITE incluye AC GIRASOL OLEICO y aceites girasol', () => {
    expect(productMatchesExecutiveSampleFilter('AC GIRASOL OLEICO', 'ACEITE')).toBe(true)
    expect(productMatchesExecutiveSampleFilter('ACEITE GIRASOL CRUDO', 'ACEITE')).toBe(true)
    expect(productMatchesExecutiveSampleFilter('GIRASOL', 'ACEITE')).toBe(false)
  })

  it('buildExecutiveProductFilterPlan cuenta en un solo paso', () => {
    const csv = [
      'journey_uid,product_normalized',
      'j1,SOJA',
      'j2,SOJA',
      'j3,GIRASOL',
      'j4,ACEITE DE SOJA',
    ].join('\n')
    const lookup = parseJourneyProductLookup(csv)!
    const entries = [
      { journeyId: 'j1' },
      { journeyId: 'j2' },
      { journeyId: 'j3' },
      { journeyId: 'j4' },
      { journeyId: 'j5' },
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    expect(plan.counts.ALL).toBe(5)
    expect(plan.counts.SOJA).toBe(2)
    expect(plan.counts.GIRASOL).toBe(1)
    expect(plan.counts.ACEITE).toBe(1)
    expect(filterClassificationEntriesByJourneyIds(entries, plan.journeyIdsByProduct.get('SOJA'))).toHaveLength(2)
  })

  it('ACEITE no cuenta journeys matriz R7 aunque el merge traiga producto líquido', () => {
    const lookup = parseJourneyProductLookup('journey_uid,product_normalized\nj-r7,ACEITE GIRASOL')!
    const entries = [
      {
        journeyId: 'j-r7',
        plate: 'GFL685',
        executiveCircuitCode: 'R7',
        committeeReason: 'RUTA_RIC_SAN_LORENZO_DEDUCIDA',
      },
      {
        journeyId: 'excel:CTG',
        plate: 'GFL685',
        executiveCircuitCode: 'SL2',
        committeeReason: 'EXCEL_PLATAFORMA:ACEITE@ACEITE_PTO:EXTERNAL_MATCH_EXACT',
      },
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    expect(plan.counts.ACEITE).toBe(1)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('j-r7')).toBe(false)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('excel:CTG')).toBe(true)
  })

  it('prioriza producto del committeeReason Excel sobre lookup erróneo (GIRASOL vs SOJA)', () => {
    const lookup = parseJourneyProductLookup('journey_uid,product_normalized\nj1,SOJA\nj2,SOJA')!
    const entries = [
      {
        journeyId: 'j1',
        committeeReason: 'EXCEL_PLATAFORMA:GIRASOL@VOLCABLE_1:EXTERNAL_MATCH_PROBABLE',
      },
      { journeyId: 'j2', committeeReason: 'EXCEL_PLATAFORMA:SOJA@VOLCABLE_1:EXTERNAL_MATCH_STRICT' },
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    expect(plan.counts.GIRASOL).toBe(1)
    expect(plan.counts.SOJA).toBe(1)
    expect(filterClassificationEntriesByProduct(entries, lookup, 'GIRASOL')).toHaveLength(1)
    expect(filterClassificationEntriesByProduct(entries, lookup, 'GIRASOL')[0]!.journeyId).toBe('j1')
    expect(filterClassificationEntriesByProduct(entries, lookup, 'SOJA')).toHaveLength(1)
    expect(filterClassificationEntriesByProduct(entries, lookup, 'SOJA')[0]!.journeyId).toBe('j2')
  })
})
