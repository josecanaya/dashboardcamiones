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
  })
})
