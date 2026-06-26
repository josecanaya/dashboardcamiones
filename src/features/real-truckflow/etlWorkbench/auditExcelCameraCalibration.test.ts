import { describe, expect, it } from 'vitest'
import {
  buildExcelCameraMatrixDetailed,
  buildCameraCalibrationReport,
  classifyRecognitionSegment,
  dayNightLabelFromIso,
} from './auditExcelCameraCalibration'

describe('auditExcelCameraCalibration', () => {
  it('clasifica turnos en hora Argentina', () => {
    expect(dayNightLabelFromIso('2026-06-10T10:00:00-03:00')).toBe('08_14')
    expect(dayNightLabelFromIso('2026-06-10T22:00:00-03:00')).toBe('20_02')
  })

  it('segmenta reconocido / parcial / no', () => {
    expect(classifyRecognitionSegment(4, 4)).toBe('reconocido')
    expect(classifyRecognitionSegment(2, 4)).toBe('parcial')
    expect(classifyRecognitionSegment(0, 4)).toBe('no_reconocido')
  })

  it('detalle incluye device por hito y segmento', () => {
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
        truckPlate: 'AA111BB',
        deviceCode: 'RicIngCamFrente',
        sectorCode: 'RICARDONE_INGRESO_CAMIONES',
        createdAt: '2026-06-10T08:10:00-03:00',
      },
      {
        truckPlate: 'AA111BB',
        deviceCode: 'RicB1Ingreso',
        sectorCode: 'RICARDONE_BALANZA',
        createdAt: '2026-06-10T09:00:00-03:00',
      },
    ]
    const rows = buildExcelCameraMatrixDetailed('R1', mov, events, { minRoutePoints: 4 })
    expect(rows[0]!.dayNight).toBe('08_14')
    expect(rows[0]!.recognitionSegment).toBe('parcial')
    expect(rows[0]!.devicesByStep.ingreso).toContain('RicIngCamFrente')
    const report = buildCameraCalibrationReport('R1', mov, events, { minRoutePoints: 4 })
    expect(report.recognitionByDayNight.some((r) => r.recognitionSegment === 'parcial')).toBe(true)
    expect(report.deviceByStep.some((d) => d.deviceCode === 'RicIngCamFrente')).toBe(true)
  })
})
