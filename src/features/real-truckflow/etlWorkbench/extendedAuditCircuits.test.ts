import { describe, expect, it } from 'vitest'
import { buildExcelCameraComparativaReport } from './excelCameraComparativaWorkbench'
import type { MovimientoContratoLike } from './auditExcelMovimientosSource'
import { buildCalibrationDashboardModel } from './cameraCalibrationDashboardModel'

function baseMov(over: Partial<MovimientoContratoLike>): MovimientoContratoLike {
  return {
    external_operation_id: 'CTG_0',
    ctg: '0',
    plate_normalized: 'AAA000',
    platform_normalized: '',
    plataforma_original: '',
    planta_normalized: '',
    planta_original: '',
    mov: '',
    movement_type: '',
    movement_type_detail: '',
    external_ingreso_at: '2026-08-14T08:00:00-03:00',
    external_salida_at: '2026-08-14T18:00:00-03:00',
    source_date: '2026-08-14',
    product_normalized: '',
    producto_original: '',
    observaciones: '',
    observacion_calidad: '',
    es_de_vuelta: false,
    ...over,
  }
}

describe('circuitos ampliados en calibración', () => {
  it('R30 (pellet transile): arma la matriz con volcable SL y calada líquidos', () => {
    const mov = baseMov({
      external_operation_id: 'CTG_301',
      ctg: '301',
      plate_normalized: 'PEL301',
      platform_normalized: 'CELDA_09',
      plataforma_original: 'Celda 09',
      planta_normalized: 'TERMINAL_EMBARQUE',
      planta_original: 'Terminal Embarque',
      product_normalized: 'PELLET',
    })
    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: [
        { truckPlate: 'PEL301', deviceCode: 'RicIngCamFrente', createdAt: '2026-08-14T09:00:00-03:00' },
        { truckPlate: 'PEL301', deviceCode: 'RicCalLiq', createdAt: '2026-08-14T09:30:00-03:00' },
        { truckPlate: 'PEL301', deviceCode: 'SLZIngCamFrente', createdAt: '2026-08-14T14:00:00-03:00' },
        { truckPlate: 'PEL301', deviceCode: 'SLZVolcableC1', createdAt: '2026-08-14T15:00:00-03:00' },
      ] as never,
      fromDay: '2026-08-14',
      toDay: '2026-08-14',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R30')
    expect(c).toBeTruthy()
    const dash = buildCalibrationDashboardModel(c!)
    expect(dash.circuitCameraLabels).toContain('Descarga volcable SL')
    expect(dash.circuitCameraLabels).toContain('Calada líquidos')
    const row = c!.calibration.detailRows.find((r) => r.patente === 'PEL301')!
    expect(row.captures['volcable_slz']).toBe(true)
    expect(row.captures['calada_liq']).toBe(true)
    expect(row.captures['ingreso']).toBe(true)
  })

  it('R8 (aceite recepción): usa calada líquidos, no CALADA de sólido', () => {
    const mov = baseMov({
      external_operation_id: 'CTG_800',
      ctg: '800',
      plate_normalized: 'ACE800',
      platform_normalized: 'ACEITE',
      plataforma_original: 'Aceite',
      planta_normalized: 'RICARDONE',
      planta_original: 'Ricardone',
      product_normalized: 'ACEITE DE SOJA',
    })
    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: [
        { truckPlate: 'ACE800', deviceCode: 'RicIngCamFrente', createdAt: '2026-08-14T09:00:00-03:00' },
        { truckPlate: 'ACE800', deviceCode: 'RicCalLiq', createdAt: '2026-08-14T09:30:00-03:00' },
      ] as never,
      fromDay: '2026-08-14',
      toDay: '2026-08-14',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R8')
    expect(c).toBeTruthy()
    const dash = buildCalibrationDashboardModel(c!)
    expect(dash.hitoRows.some((h) => h.hito === 'calada_liq')).toBe(true)
    expect(dash.hitoRows.some((h) => h.hito === 'calada')).toBe(false)
    const row = c!.calibration.detailRows.find((r) => r.patente === 'ACE800')!
    expect(row.captures['calada_liq']).toBe(true)
  })
})
