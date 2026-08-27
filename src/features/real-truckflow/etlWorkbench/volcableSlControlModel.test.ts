import { describe, expect, it } from 'vitest'
import { buildExcelCameraComparativaReport } from './excelCameraComparativaWorkbench'
import type { MovimientoContratoLike } from './auditExcelMovimientosSource'
import { buildVolcableSlControlModel } from './volcableSlControlModel'

function volcableMov(ctg: string, plate: string, calleN: number): MovimientoContratoLike {
  return {
    external_operation_id: `CTG_${ctg}`,
    ctg,
    plate_normalized: plate,
    platform_normalized: `VOLCABLE_PTO_${calleN}`,
    plataforma_original: `Volcable PTO ${calleN}`,
    planta_normalized: 'TERMINAL_EMBARQUE',
    planta_original: 'Terminal Embarque',
    mov: '',
    movement_type: 'INGRESO',
    movement_type_detail: '',
    external_ingreso_at: '2026-06-10T08:00:00-03:00',
    external_salida_at: '2026-06-10T18:00:00-03:00',
    source_date: '2026-06-10',
  }
}

describe('buildVolcableSlControlModel', () => {
  it('separa por calle los leídos por cámara de los que no registró', () => {
    const movimientos = [
      volcableMov('1', 'LEI111', 1), // lo lee la cámara de calle 1
      volcableMov('2', 'NOL222', 1), // no lo lee ninguna cámara volcable
    ]
    const report = buildExcelCameraComparativaReport({
      movimientos,
      events: [
        { truckPlate: 'LEI111', deviceCode: 'RicIngCamFrente', createdAt: '2026-06-10T09:00:00-03:00' },
        { truckPlate: 'LEI111', deviceCode: 'SLZVolcableC1', createdAt: '2026-06-10T15:00:00-03:00' },
        { truckPlate: 'NOL222', deviceCode: 'RicIngCamFrente', createdAt: '2026-06-10T09:00:00-03:00' },
      ] as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    const r7 = report.circuits.find((c) => c.circuitCode === 'R7') ?? null
    const model = buildVolcableSlControlModel(r7, movimientos, {
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })

    expect(model.totalExcel).toBe(2)
    expect(model.leidosCamara).toBe(1)
    expect(model.noLeidos).toBe(1)

    const calle1 = model.calles.find((c) => c.calle === 'Volcable 1')!
    expect(calle1).toBeTruthy()
    expect(calle1.device).toBe('SLZVolcableC1')
    expect(calle1.totalExcel).toBe(2)
    expect(calle1.leidosCamara).toBe(1)
    expect(calle1.noLeidos).toBe(1)
    // El no leído aparece en la muestra para control DSS.
    expect(calle1.noLeidosSample.map((r) => r.patente)).toContain('NOL222')
  })

  it('sin R7 no hay lecturas de cámara (todo no leído)', () => {
    const movimientos = [volcableMov('9', 'ZZZ999', 4)]
    const model = buildVolcableSlControlModel(null, movimientos, {
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    expect(model.totalExcel).toBe(1)
    expect(model.leidosCamara).toBe(0)
    expect(model.calles[0]?.calle).toBe('Volcable 4')
  })
})
