import { describe, expect, it } from 'vitest'
import {
  resolveExecutiveCircuitForExcelOperation,
  type ExcelOperationExecutiveCircuitInput,
} from './etlCircuitClassificationIndex'

/**
 * SL3 (descarga de aceite en Renova) sólo debe asignarse si el camión pasó por la
 * cámara Renova SLZTK400. Sin esa evidencia, no se clasifica como aceite Renova.
 */
function aceiteRenovaInput(
  over: Partial<ExcelOperationExecutiveCircuitInput> = {}
): ExcelOperationExecutiveCircuitInput {
  return {
    product_normalized: 'ACEITE',
    platform_normalized: '',
    plataforma_original: '',
    plate_normalized: 'AB123CD',
    planta_normalized: 'TERMINAL_EMBARQUE',
    movement_type: 'INGRESO',
    mov: 'I',
    source_date: '2026-08-01',
    resolved_circuit_family: 'LIQUIDO',
    match_quality: 'EXTERNAL_MATCH_EXACT',
    route_quality: '',
    evidence_count: 3,
    truckflow_observed_sequence_combined: '',
    truckflow_circuit_codes: '',
    truckflow_device_sequence_combined: '',
    observaciones: 'Descarga RENOVA',
    observacion_calidad: '',
    ...over,
  }
}

describe('SL3 requiere cámara Renova SLZTK400', () => {
  it('sin lectura SLZTK400 no se clasifica SL3', () => {
    expect(resolveExecutiveCircuitForExcelOperation(aceiteRenovaInput())).not.toBe('SL3')
  })

  it('con SLZTK400 en la secuencia de dispositivos se clasifica SL3', () => {
    const out = resolveExecutiveCircuitForExcelOperation(
      aceiteRenovaInput({
        truckflow_device_sequence_combined: 'SLZIngCamFrente>SLZTK400>SLZBalSC1Fte',
      })
    )
    expect(out).toBe('SL3')
  })

  it('con SLZTK400 en la secuencia observada se clasifica SL3', () => {
    const out = resolveExecutiveCircuitForExcelOperation(
      aceiteRenovaInput({ truckflow_observed_sequence_combined: 'SL_INGRESO>SLZTK400' })
    )
    expect(out).toBe('SL3')
  })

  it('plataforma aceite explícita (OSL) no depende de SLZTK400', () => {
    const out = resolveExecutiveCircuitForExcelOperation(
      aceiteRenovaInput({ platform_normalized: 'ACEITE_OSL', plataforma_original: 'ACEITE OSL' })
    )
    expect(out).toBe('SL1')
  })
})
