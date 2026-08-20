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

  it('pellet Excel-first solo entra al bucket PELLET con evidencia Truckflow', () => {
    const excelCsv = [
      'external_operation_id,resolved_product,product_normalized,matched_journey_uids,evidence_count,match_quality',
      // Con evidencia → cuenta como pellet.
      'op-con,PELLETS GIRASOL,PELLETS GIRASOL,j1,1,EXTERNAL_MATCH_PROBABLE',
      // Sin evidencia (cámara no lo vio) → fuera del bucket pellet.
      'op-sin,PELLETS DE GIRASOL,PELLETS DE GIRASOL,,0,NO_TRUCKFLOW_EVIDENCE',
      // Pellet de soja sin evidencia → también fuera.
      'op-soja,PELLET DE SOJA,PELLET DE SOJA,,0,NO_TRUCKFLOW_EVIDENCE',
      // No-pellet sin evidencia → la regla no lo toca, sigue contando.
      'op-girasol,GIRASOL,GIRASOL,,0,NO_TRUCKFLOW_EVIDENCE',
    ].join('\n')
    const lookup = parseExcelFirstProductLookup(excelCsv)!
    // Solo el pellet con evidencia queda como producto PELLET.
    expect(lookup.byJourneyId.get('excel:op-con')).toBe('PELLETS GIRASOL')
    expect(lookup.byJourneyId.has('excel:op-sin')).toBe(false)
    expect(lookup.byJourneyId.has('excel:op-soja')).toBe(false)
    // La regla es específica de pellet: girasol sin evidencia sigue en su bucket.
    expect(lookup.byJourneyId.get('excel:op-girasol')).toBe('GIRASOL')
    expect(lookup.products).toEqual(['GIRASOL', 'PELLETS GIRASOL'])

    const entries = [
      { journeyId: 'excel:op-con' },
      { journeyId: 'excel:op-sin' },
      { journeyId: 'excel:op-soja' },
      { journeyId: 'excel:op-girasol' },
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    expect(plan.counts.PELLET).toBe(1)
    expect(plan.counts.GIRASOL).toBe(1)
    expect(plan.journeyIdsByProduct.get('PELLET')?.has('excel:op-con')).toBe(true)
    expect(plan.journeyIdsByProduct.get('PELLET')?.has('excel:op-sin')).toBe(false)
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
      'j5,PELLETS GIRASOL',
    ].join('\n')
    const lookup = parseJourneyProductLookup(csv)!
    const entries = [
      { journeyId: 'j1' },
      { journeyId: 'j2' },
      { journeyId: 'j3' },
      { journeyId: 'j4' },
      { journeyId: 'j5' },
      { journeyId: 'j6' }, // sin producto Excel → fuera del total
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    // "Todos" = unión de los 4 productos; j6 (sin producto) NO cuenta.
    expect(plan.counts.ALL).toBe(5)
    expect(plan.counts.SOJA).toBe(2)
    expect(plan.counts.GIRASOL).toBe(1)
    expect(plan.counts.ACEITE).toBe(1)
    expect(plan.counts.PELLET).toBe(1)
    // "PELLETS GIRASOL" es pellet, no girasol.
    expect(plan.counts.SOJA + plan.counts.GIRASOL + plan.counts.ACEITE + plan.counts.PELLET).toBe(plan.counts.ALL)
    expect(filterClassificationEntriesByJourneyIds(entries, plan.journeyIdsByProduct.get('SOJA'))).toHaveLength(2)
    expect(filterClassificationEntriesByJourneyIds(entries, plan.journeyIdsByProduct.get('ALL'))).toHaveLength(5)
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

  it('ACEITE excluye plantas Avellaneda y Renopack', () => {
    const excelCsv = [
      'external_operation_id,resolved_product,product_normalized,matched_journey_uids,evidence_count,match_quality,planta_normalized,planta_original',
      'op-av,ACEITE DE SOJA,ACEITE DE SOJA,j-av,1,EXTERNAL_MATCH_PROBABLE,AVELLANEDA,Planta AVELLANEDA',
      'op-rn,ACEITE DE SOJA,ACEITE DE SOJA,j-rn,1,EXTERNAL_MATCH_PROBABLE,RENOPACK,RENOPACK',
      'op-ok,ACEITE DE SOJA,ACEITE DE SOJA,j-ok,1,EXTERNAL_MATCH_PROBABLE,TERMINAL_EMBARQUE,SAN LORENZO',
    ].join('\n')
    const lookup = parseExcelFirstProductLookup(excelCsv)!
    expect(lookup.aceiteExcludedJourneyIds?.has('j-av')).toBe(true)
    expect(lookup.aceiteExcludedJourneyIds?.has('j-rn')).toBe(true)
    expect(lookup.aceiteExcludedJourneyIds?.has('excel:op-av')).toBe(true)
    expect(lookup.aceiteExcludedJourneyIds?.has('j-ok')).toBe(false)

    const entries = [
      { journeyId: 'j-av', site: 'AVELLANEDA', executiveCircuitCode: 'SL1' },
      { journeyId: 'j-rn', site: 'RENOPACK', executiveCircuitCode: 'SL1' },
      { journeyId: 'j-ok', site: 'TERMINAL_EMBARQUE', executiveCircuitCode: 'SL1' },
      {
        journeyId: 'excel:op-av',
        site: 'AVELLANEDA',
        executiveCircuitCode: 'SL3',
        committeeReason: 'EXCEL_PLATAFORMA:ACEITE DE SOJA@ACEITE:EXTERNAL_MATCH_EXACT',
      },
    ] as Parameters<typeof buildExecutiveProductFilterPlan>[0]
    const plan = buildExecutiveProductFilterPlan(entries, lookup)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('j-av')).toBe(false)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('j-rn')).toBe(false)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('excel:op-av')).toBe(false)
    expect(plan.journeyIdsByProduct.get('ACEITE')?.has('j-ok')).toBe(true)
    expect(plan.counts.ACEITE).toBe(1)
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
