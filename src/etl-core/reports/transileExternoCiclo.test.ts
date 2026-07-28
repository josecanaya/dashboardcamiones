import { describe, expect, it } from 'vitest'
import {
  buildTransileExternoReport,
  classifyTransileExternoProduct,
  detectDeVueltaHeader,
  isPelletExcelProduct,
  resolvePelletCeldaIndexFromPlatform,
  resolvePelletCircuit,
} from './transileExternoCiclo'
import type { ExternalMovimientoContratoNormalized } from '../domain/contractMovements.types'

function mov(
  partial: Partial<ExternalMovimientoContratoNormalized>
): ExternalMovimientoContratoNormalized {
  return {
    external_operation_id: 'op',
    source_file: 'file.xlsx',
    source_date: '2026-06-10',
    planta_original: 'Ricardone',
    planta_normalized: 'RICARDONE',
    mov_original: 'I',
    mov: 'I',
    movement_type: 'INGRESO',
    movement_type_detail: 'I',
    patente_original: 'AB123CD',
    plate_normalized: 'AB123CD',
    contrato: '',
    cliente_contrato: '',
    ingreso_id: '',
    comprob: '',
    cp_remito: '',
    ctg: '',
    cupo: '',
    entregado_por_a: '',
    localidad_proc_dest: '',
    fecha_ing_original: '',
    hora_ing_original: '',
    fecha_calado_original: '',
    hora_calado_original: '',
    fecha_sal_original: '',
    hora_sal_original: '',
    external_ingreso_at: '2026-06-10T08:00:00',
    external_calado_at: '',
    external_salida_at: '2026-06-10T10:00:00',
    cod_prod: '',
    producto_original: 'SOJA',
    product_normalized: 'SOJA',
    plataforma_original: '',
    platform_normalized: '',
    plataforma_manual: '',
    kgs_bruto: '',
    kgs_tara: '',
    kgs_neto: '',
    kgs_neto_neto: '',
    humedad: '',
    observaciones: '',
    observacion_calidad: '',
    es_de_vuelta_original: 'SI',
    es_de_vuelta: true,
    normalization_warnings: '',
    external_sl_balanza_entrada_at: '',
    external_sl_balanza_salida_at: '',
    tiempos_entre_pasos_source_file: '',
    tiempos_entre_pasos_match: '',
    ...partial,
  }
}

describe('classifyTransileExternoProduct', () => {
  it('SOJA → R26 (asignado unívoco)', () => {
    const c = classifyTransileExternoProduct('SOJA')
    expect(c.family).toBe('SOJA')
    expect(c.candidates).toEqual(['R26'])
    expect(c.assigned).toBe('R26')
  })

  it('GIRASOL → R27/R28 (candidatos, sin asignar)', () => {
    const c = classifyTransileExternoProduct('GIRASOL')
    expect(c.family).toBe('GIRASOL')
    expect(c.candidates).toEqual(['R27', 'R28'])
    expect(c.assigned).toBe('')
  })

  it('PELLET DE SOJA → PELLET (prioridad sobre SOJA)', () => {
    const c = classifyTransileExternoProduct('PELLET DE SOJA')
    expect(c.family).toBe('PELLET')
    expect(c.candidates).toEqual(['R30', 'R31', 'R32'])
  })

  it('PELLET + Celda 09 → R30 asignado', () => {
    const c = classifyTransileExternoProduct('PELLET', 'Tolva Celda 09')
    expect(c.family).toBe('PELLET')
    expect(c.assigned).toBe('R30')
  })

  it('producto no reconocido → sin familia', () => {
    expect(classifyTransileExternoProduct('MAIZ').family).toBe('')
  })
})

describe('detectDeVueltaHeader', () => {
  it('detecta "De La Vuelta" (nombre real del Excel)', () => {
    expect(detectDeVueltaHeader(['Patente', 'Producto', 'De La Vuelta'])).toBe('De La Vuelta')
  })

  it('detecta variantes con sufijo', () => {
    expect(detectDeVueltaHeader(['Es de vuelta (S/N)'])).toBe('Es de vuelta (S/N)')
  })

  it('no confunde con columnas de código de vuelta', () => {
    expect(detectDeVueltaHeader(['Codigo Vuelta', 'Patente'])).toBe('')
  })

  it('vacío si no hay columna de vuelta', () => {
    expect(detectDeVueltaHeader(['Patente', 'Producto'])).toBe('')
  })
})

describe('buildTransileExternoReport', () => {
  it('sólo considera movimientos con es_de_vuelta', () => {
    const report = buildTransileExternoReport({
      movimientos: [
        mov({ external_operation_id: 'a', es_de_vuelta: true }),
        mov({ external_operation_id: 'b', es_de_vuelta: false }),
      ],
    })
    expect(report.summary.movimientos_de_vuelta).toBe(1)
    expect(report.operations).toHaveLength(1)
    expect(report.operations[0]!.external_operation_id).toBe('a')
  })

  it('agrupa por patente y cuenta ciclos + circuitos por producto', () => {
    const report = buildTransileExternoReport({
      movimientos: [
        mov({ external_operation_id: 'a', product_normalized: 'SOJA', external_ingreso_at: '2026-06-10T08:00:00' }),
        mov({ external_operation_id: 'b', product_normalized: 'GIRASOL', external_ingreso_at: '2026-06-10T12:00:00' }),
      ],
    })
    expect(report.summary.patentes_con_vuelta).toBe(1)
    expect(report.summary.operaciones_soja).toBe(1)
    expect(report.summary.operaciones_girasol).toBe(1)
    const session = report.sessions[0]!
    expect(session.return_operations).toBe(2)
    expect(session.circuitos).toBe('R26|R27|R28')
    expect(report.operations.map((o) => o.cycle_index)).toEqual([1, 2])
  })
})

describe('resolvePelletCircuit — de la vuelta vs despacho', () => {
  it('de la vuelta va a San Lorenzo: R30/R31/R32 según celda', () => {
    expect(resolvePelletCircuit({ esDeVuelta: true, platformHint: 'CELDA 09' }).assigned).toBe('R30')
    expect(resolvePelletCircuit({ esDeVuelta: true, platformHint: 'CELDA 10' }).assigned).toBe('R31')
    expect(resolvePelletCircuit({ esDeVuelta: true, platformHint: 'CARGA SILO 11' }).assigned).toBe('R32')
  })

  it('sin de la vuelta va a otro destino: despacho R13/R14/R15 según celda', () => {
    expect(resolvePelletCircuit({ esDeVuelta: false, platformHint: 'CELDA 09' }).assigned).toBe('R13')
    expect(resolvePelletCircuit({ esDeVuelta: false, platformHint: 'TOLVA 10' }).assigned).toBe('R14')
    expect(resolvePelletCircuit({ esDeVuelta: false, platformHint: 'CARGA SILO 11' }).assigned).toBe('R15')
  })

  it('sin celda usa el primer candidato de la familia y lo marca como no resuelto', () => {
    const despacho = resolvePelletCircuit({ esDeVuelta: false, platformHint: '' })
    expect(despacho.assigned).toBe('R13')
    expect(despacho.celdaResolved).toBe(false)
    expect(despacho.candidates).toEqual(['R13', 'R14', 'R15'])
    expect(despacho.flow).toBe('DESPACHO')

    const vuelta = resolvePelletCircuit({ esDeVuelta: true })
    expect(vuelta.assigned).toBe('R30')
    expect(vuelta.celdaResolved).toBe(false)
    expect(vuelta.flow).toBe('TRANSILE_EXTERNO')
  })

  it('reconoce SILO además de CELDA y TOLVA (el Excel escribe «CARGA SILO 11»)', () => {
    expect(resolvePelletCeldaIndexFromPlatform('CARGA SILO 11')).toBe(2)
    expect(resolvePelletCeldaIndexFromPlatform('CARGA_SILO_11')).toBe(2)
    expect(resolvePelletCeldaIndexFromPlatform('VOLCABLE 1')).toBe(-1)
    expect(resolvePelletCeldaIndexFromPlatform('')).toBe(-1)
  })

  it('cáscara de soja pelleteada y expeller son pellet', () => {
    expect(isPelletExcelProduct('CASCARA DE SOJA PELLETEADA')).toBe(true)
    expect(isPelletExcelProduct('PELLETS GIRASOL')).toBe(true)
    expect(isPelletExcelProduct('EXPELLER DE SOJA')).toBe(true)
    expect(isPelletExcelProduct('EXPELER GIRASOL')).toBe(true)
    expect(isPelletExcelProduct('SOJA')).toBe(false)
    expect(isPelletExcelProduct('GIRASOL')).toBe(false)
  })

  it('classifyTransileExternoProduct trata la cáscara pelleteada como PELLET, no SOJA', () => {
    expect(classifyTransileExternoProduct('CASCARA DE SOJA PELLETEADA').family).toBe('PELLET')
  })
})
