import { describe, expect, it } from 'vitest'
import {
  buildR7CameraMatrix,
  extractCtgFromOperationId,
  summarizeR7CameraMatrix,
} from './auditR7ExcelCameraMatrix'

describe('auditR7ExcelCameraMatrix', () => {
  it('extrae CTG desde external_operation_id', () => {
    expect(extractCtgFromOperationId('CTG_10132837785')).toBe('10132837785')
  })

  it('marca SI/NO por patente en ventana', () => {
    const rows = buildR7CameraMatrix(
      [
        {
          operationId: 'CTG_1',
          ctg: '1',
          plate: 'ABC123',
          executiveCircuitCode: 'R7',
          externalIngresoAt: '2026-06-10T20:00:00',
          externalSalidaAt: '2026-06-11T00:00:00',
        },
      ],
      [
        {
          truckPlate: 'ABC123',
          deviceCode: 'RicIngCamFrente',
          sectorCode: 'RICARDONE_INGRESO_CAMIONES',
          createdAt: '2026-06-10T20:30:00-03:00',
        },
        {
          truckPlate: 'ABC123',
          deviceCode: 'SLZBalIngFte',
          sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
          createdAt: '2026-06-10T22:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.ingreso).toBe(true)
    expect(rows[0]!.captures.balanza_ingreso_slz).toBe(true)
    expect(rows[0]!.captures.preingreso).toBe(false)
    const sum = summarizeR7CameraMatrix(rows)
    expect(sum.find((s) => s.key === 'ingreso')!.captured).toBe(1)
  })
})
