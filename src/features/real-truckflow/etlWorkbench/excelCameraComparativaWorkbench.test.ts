import { describe, it, expect } from 'vitest'
import { buildExcelCameraComparativaReport } from './excelCameraComparativaWorkbench'
import type { MovimientoContratoLike } from './auditExcelMovimientosSource'

describe('excelCameraComparativaWorkbench', () => {
  it('resume captura por hito vs total Excel R1', () => {
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
      external_ingreso_at: '2026-06-10T08:00:00',
      external_salida_at: '2026-06-10T18:00:00',
      source_date: '2026-06-10',
    }
    const events = [
      {
        truckPlate: 'ABC123',
        normalizedPlate: 'ABC123',
        deviceCode: 'RicIngCamFrente',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        createdAt: '2026-06-10T09:00:00-03:00',
      },
      {
        truckPlate: 'ABC123',
        normalizedPlate: 'ABC123',
        deviceCode: 'RicB1Ingreso',
        sectorCode: 'RICARDONE_BALANZA',
        createdAt: '2026-06-10T10:00:00-03:00',
      },
    ]

    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: events as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })

    const r1 = report.circuits.find((c) => c.circuitCode === 'R1')
    expect(r1?.excelCamiones).toBe(1)
    const ingreso = r1?.summaries.find((s) => s.key === 'ingreso')
    expect(ingreso?.captured).toBe(1)
    expect(ingreso?.total).toBe(1)
    expect(ingreso?.captureRatePct).toBe(100)
  })
})
