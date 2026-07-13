import { describe, expect, it } from 'vitest'
import {
  enrichMovimientosWithTiemposEntrePasos,
  isInTiemposEntrePasosOverrideWindow,
  parseTiemposEntrePasosDateTimeCell,
  sheetHeadersLookLikeTiemposEntrePasos,
  shouldApplyTiemposEntrePasosBalanzaOverride,
} from './etlTiemposEntrePasos'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'

function baseMov(partial: Partial<ExternalMovimientoContratoNormalized>): ExternalMovimientoContratoNormalized {
  return {
    external_operation_id: 'CTG_1',
    source_file: 'MovimientosPorContrato_20260618.xlsx',
    source_date: '2026-06-18',
    planta_original: 'PLANTA SAN LORENZO',
    planta_normalized: 'RICARDONE',
    mov_original: 'I',
    mov: 'I',
    movement_type: 'INGRESO',
    movement_type_detail: 'I',
    patente_original: 'FMU968',
    plate_normalized: 'FMU968',
    contrato: '2000640',
    cliente_contrato: '',
    ingreso_id: '14435322',
    comprob: '',
    cp_remito: '',
    ctg: '1',
    cupo: '',
    entregado_por_a: '',
    localidad_proc_dest: '',
    fecha_ing_original: '',
    hora_ing_original: '',
    fecha_calado_original: '',
    hora_calado_original: '',
    fecha_sal_original: '',
    hora_sal_original: '',
    external_ingreso_at: '2026-06-18T22:13:00',
    external_calado_at: '',
    external_salida_at: '2026-06-19T00:01:00',
    cod_prod: '',
    producto_original: 'GIRASOL',
    product_normalized: 'GIRASOL',
    plataforma_original: 'VOLCABLE 1',
    platform_normalized: 'VOLCABLE_1',
    plataforma_manual: '',
    kgs_bruto: '',
    kgs_tara: '',
    kgs_neto: '',
    kgs_neto_neto: '',
    humedad: '',
    observaciones: '',
    observacion_calidad: '',
    es_de_vuelta_original: '',
    es_de_vuelta: false,
    normalization_warnings: '',
    ...partial,
  }
}

describe('etlTiemposEntrePasos', () => {
  it('detecta cabecera TiemposEntrePasos', () => {
    expect(
      sheetHeadersLookLikeTiemposEntrePasos(['NroIngreso', 'Patente', 'Balanza Entrada', 'Balanza Salida'])
    ).toBe(true)
  })

  it('parsea datetime y rechaza enteros en Balanza Salida', () => {
    const ok = parseTiemposEntrePasosDateTimeCell('18/06/2026 23:23', '2026-06-18')
    expect(ok.at).toMatch(/^2026-06-18T23:23/)
    expect(parseTiemposEntrePasosDateTimeCell(49, '2026-06-18').at).toBe('')
    expect(parseTiemposEntrePasosDateTimeCell(-5, '2026-06-18').at).toBe('')
  })

  it('enriquece movimiento por ingreso_id', () => {
    const mov = baseMov({})
    const enriched = enrichMovimientosWithTiemposEntrePasos([mov], [
      {
        nro_ingreso: '14435322',
        plate_normalized: 'FMU968',
        planta_original: 'PLANTA SAN LORENZO',
        planta_normalized: 'SAN_LORENZO',
        operacion: 'DESCARGA',
        contrato: '2000640',
        balanza_entrada_at: '2026-06-18T23:23:00',
        balanza_salida_at: '2026-06-19T00:05:00',
        source_file: 'TiemposEntrePasos_20260618.xlsx',
        source_date: '2026-06-18',
        normalization_warnings: '',
      },
    ])
    expect(enriched[0]?.tiempos_entre_pasos_match).toBe('INGRESO_ID')
    expect(enriched[0]?.external_sl_balanza_entrada_at).toBe('2026-06-18T23:23:00')
  })

  it('ventana override 17–21 jun', () => {
    expect(isInTiemposEntrePasosOverrideWindow('2026-06-18T08:00:00')).toBe(true)
    expect(isInTiemposEntrePasosOverrideWindow('2026-06-16T08:00:00')).toBe(false)
  })

  it('override R7 cuando hay match TEP en ventana', () => {
    expect(
      shouldApplyTiemposEntrePasosBalanzaOverride({
        external_sl_balanza_entrada_at: '2026-06-18T23:23:00',
        tiempos_entre_pasos_match: 'INGRESO_ID',
        truckflow_circuit_codes: 'R7',
      })
    ).toBe(true)
  })
})
