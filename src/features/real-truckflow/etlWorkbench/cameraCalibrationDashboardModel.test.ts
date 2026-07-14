import { describe, expect, it } from 'vitest'
import { buildExcelCameraComparativaReport } from './excelCameraComparativaWorkbench'
import type { MovimientoContratoLike } from './auditExcelMovimientosSource'
import {
  buildCalibrationDashboardModel,
  captureEstadoFromPct,
  hitoOperativoLabel,
  deviceOperativoLabel,
} from './cameraCalibrationDashboardModel'

describe('cameraCalibrationDashboardModel', () => {
  it('mapea labels operativos', () => {
    expect(hitoOperativoLabel('balanza_ingreso')).toBe('Balanza ingreso')
    expect(deviceOperativoLabel('RicIngCamFrente')).toBe('Ingreso Ricardone')
  })

  it('estado por umbrales', () => {
    expect(captureEstadoFromPct(90)).toBe('OK')
    expect(captureEstadoFromPct(75)).toBe('Revisar')
    expect(captureEstadoFromPct(50)).toBe('Crítico')
  })

  it('construye dashboard desde circuito', () => {
    const mov: MovimientoContratoLike = {
      external_operation_id: 'CTG_99',
      ctg: '99',
      plate_normalized: 'ABC123',
      platform_normalized: 'CELDA_16',
      plataforma_original: 'CELDA 16',
      planta_normalized: 'RICARDONE',
      planta_original: 'RICARDONE',
      mov: '',
      movement_type: '',
      movement_type_detail: '',
      external_ingreso_at: '2026-06-10T08:00:00-03:00',
      external_salida_at: '2026-06-10T18:00:00-03:00',
      source_date: '2026-06-10',
    }
    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: [
        {
          truckPlate: 'ABC123',
          deviceCode: 'RicIngCamFrente',
          createdAt: '2026-06-10T09:00:00-03:00',
        },
      ] as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R1')
    expect(c).toBeTruthy()
    const dash = buildCalibrationDashboardModel(c!)
    expect(dash.hitoRows.length).toBeGreaterThan(0)
    expect(dash.brief.parrafos.length).toBeGreaterThan(0)
    expect(dash.pointDepth.total).toBe(1)
    expect(dash.hitoRows.some((h) => h.hito === 'balanza_egreso_slz')).toBe(false)
  })

  it('excluye balanza egreso SL de conclusiones R7', () => {
    const mov: MovimientoContratoLike = {
      external_operation_id: 'CTG_77',
      ctg: '77',
      plate_normalized: 'XYZ999',
      platform_normalized: 'VOLCABLE_PTO_3',
      plataforma_original: 'Volcable PTO 3',
      planta_normalized: 'TERMINAL_EMBARQUE',
      planta_original: 'Terminal Embarque',
      mov: '',
      movement_type: '',
      movement_type_detail: '',
      external_ingreso_at: '2026-06-10T08:00:00-03:00',
      external_salida_at: '2026-06-10T18:00:00-03:00',
      source_date: '2026-06-10',
    }
    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: [
        {
          truckPlate: 'XYZ999',
          deviceCode: 'RicIngCamFrente',
          createdAt: '2026-06-10T09:00:00-03:00',
        },
        {
          truckPlate: 'XYZ999',
          deviceCode: 'SLZBalSC1Fte',
          createdAt: '2026-06-10T15:00:00-03:00',
        },
      ] as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R7')
    expect(c).toBeTruthy()
    expect(c!.summaries.some((s) => s.key === 'balanza_egreso_slz')).toBe(true)
    const dash = buildCalibrationDashboardModel(c!)
    expect(dash.hitoRows.some((h) => h.hito === 'balanza_egreso_slz')).toBe(false)
    expect(dash.stackedBars.some((h) => h.hito === 'balanza_egreso_slz')).toBe(false)
    expect(dash.topProblems.some((p) => p.hito === 'balanza_egreso_slz')).toBe(false)
    expect(dash.brief.parrafos.join(' ')).toMatch(/sin balanza egreso SL/i)
  })
})
