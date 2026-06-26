import { describe, expect, it } from 'vitest'
import { buildExcelCameraMatrixDetailed } from './auditExcelCameraCalibration'
import { buildMissedPlatesByCamera } from './auditExcelCameraMissedPlates'

describe('auditExcelCameraMissedPlates', () => {
  it('lista patente por camara cuando falla ingreso', () => {
    const mov = [
      {
        operationId: 'CTG_1',
        ctg: '1',
        plate: 'AA111BB',
        executiveCircuitCode: 'R1',
        externalIngresoAt: '2026-06-10T08:00:00-03:00',
        externalSalidaAt: '2026-06-10T12:00:00-03:00',
      },
    ]
    const events = [
      {
        truckPlate: 'ZZ999ZZ',
        deviceCode: 'RicIngCamFrente',
        createdAt: '2026-06-10T08:10:00-03:00',
      },
    ]
    const detail = buildExcelCameraMatrixDetailed('R1', mov, events, { minRoutePoints: 4 })
    expect(detail[0]!.captures.ingreso).toBe(false)
    const missed = buildMissedPlatesByCamera('R1', mov, events, detail)
    expect(missed.some((m) => m.patente === 'AA111BB' && m.stepKey === 'ingreso')).toBe(true)
    expect(missed.some((m) => m.deviceCode === 'RicIngCamFrente')).toBe(true)
  })
})
