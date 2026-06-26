import { describe, expect, it } from 'vitest'
import {
  buildExcelCameraMatrix,
  summarizeExcelCameraMatrix,
  summarizeRouteRecognition,
  extractCtgFromOperationId,
} from './auditExcelCameraMatrix'

describe('auditExcelCameraMatrix R1', () => {
  it('marca balanza egreso con RicB2Egreso y RicB3Egreso', () => {
    const rows = buildExcelCameraMatrix(
      'R1',
      [
        {
          operationId: 'CTG_7',
          ctg: '7',
          plate: 'XX999YY',
          executiveCircuitCode: 'R1',
          externalIngresoAt: '2026-06-10T08:00:00',
          externalSalidaAt: '2026-06-10T12:00:00',
        },
      ],
      [
        {
          truckPlate: 'XX999YY',
          deviceCode: 'RicB3Egreso',
          sectorCode: 'RICARDONE_BALANZA',
          createdAt: '2026-06-10T10:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('marca balanza y celda16 en ventana R1', () => {
    const rows = buildExcelCameraMatrix(
      'R1',
      [
        {
          operationId: 'CTG_99',
          ctg: '99',
          plate: 'AA111BB',
          executiveCircuitCode: 'R1',
          externalIngresoAt: '2026-06-10T08:00:00',
          externalSalidaAt: '2026-06-10T12:00:00',
        },
      ],
      [
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
        {
          truckPlate: 'AA111BB',
          deviceCode: 'RicC16Descarga1',
          sectorCode: 'RICARDONE_CELDA_16',
          createdAt: '2026-06-10T10:30:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.ingreso).toBe(true)
    expect(rows[0]!.captures.balanza_ingreso).toBe(true)
    expect(rows[0]!.captures.celda16_descarga).toBe(true)
    expect(rows[0]!.captures.preingreso).toBe(false)
    const sum = summarizeExcelCameraMatrix('R1', rows)
    expect(sum.find((s) => s.key === 'celda16_descarga')!.captured).toBe(1)
  })

  it('balanza egreso con occurredAt en ventana y createdAt fuera', () => {
    const rows = buildExcelCameraMatrix(
      'R5',
      [
        {
          operationId: 'CTG_1',
          ctg: '1',
          plate: 'EPL048',
          executiveCircuitCode: 'R5',
          externalIngresoAt: '2026-06-12T06:00:00',
          externalSalidaAt: '2026-06-12T18:00:00',
        },
      ],
      [
        {
          truckPlate: 'EPL048',
          deviceCode: 'RicB1Ingreso',
          sectorCode: 'RICARDONE_BALANZA',
          createdAt: '2026-06-12T08:00:00-03:00',
          occurredAt: '2026-06-12T08:00:00-03:00',
        },
        {
          truckPlate: 'EPL048',
          deviceCode: 'RicB2Egreso',
          sectorCode: 'RICARDONE_BALANZA',
          createdAt: '2026-06-20T08:00:00-03:00',
          occurredAt: '2026-06-12T09:30:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.balanza_ingreso).toBe(true)
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('balanza egreso desde alerta con patente en payload', () => {
    const rows = buildExcelCameraMatrix(
      'R5',
      [
        {
          operationId: 'CTG_2',
          ctg: '2',
          plate: 'AA111BB',
          executiveCircuitCode: 'R5',
          externalIngresoAt: '2026-06-12T08:00:00',
          externalSalidaAt: '2026-06-12T12:00:00',
        },
      ],
      [
        {
          truckPlate: 'AA111BB',
          deviceCode: 'RicB1Ingreso',
          sectorCode: 'RICARDONE_BALANZA',
          occurredAt: '2026-06-12T08:10:00-03:00',
        },
      ],
      {
        alerts: [
          {
            deviceCode: 'RicB2Egreso',
            sectorCode: 'RICARDONE_BALANZA',
            occurredAt: '2026-06-12T09:00:00-03:00',
            payload: { plate: 'AA111BB', normalizedPlate: 'AA111BB' },
          },
        ],
      }
    )
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('balanza egreso sin patente en evento pero mismo journeyUid que ingreso', () => {
    const rows = buildExcelCameraMatrix(
      'R1',
      [
        {
          operationId: 'CTG_77',
          ctg: '77',
          plate: 'AA111BB',
          executiveCircuitCode: 'R1',
          externalIngresoAt: '2026-06-10T08:00:00',
          externalSalidaAt: '2026-06-10T12:00:00',
        },
      ],
      [
        {
          journeyUid: 'j-77',
          truckPlate: 'AA111BB',
          deviceCode: 'RicB1Ingreso',
          sectorCode: 'RICARDONE_BALANZA',
          createdAt: '2026-06-10T09:00:00-03:00',
        },
        {
          journeyUid: 'j-77',
          truckPlate: '',
          deviceCode: 'RicB1Egreso',
          sectorCode: 'RICARDONE_BALANZA',
          createdAt: '2026-06-10T10:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.balanza_ingreso).toBe(true)
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('balanza egreso con patente solo en rawTruckPlate (OCR crudo)', () => {
    const rows = buildExcelCameraMatrix(
      'R6',
      [
        {
          operationId: 'CTG_3',
          ctg: '3',
          plate: 'AA702TR',
          executiveCircuitCode: 'R6',
          externalIngresoAt: '2026-06-12T08:00:00',
          externalSalidaAt: '2026-06-12T12:00:00',
        },
      ],
      [
        {
          truckPlate: '',
          normalizedPlate: '',
          rawTruckPlate: 'AA702TR',
          deviceCode: 'RicB3Egreso',
          sectorCode: 'RICARDONE_BALANZA',
          occurredAt: '2026-06-12T09:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('balanza egreso con OCR fuzzy vs Excel', () => {
    const rows = buildExcelCameraMatrix(
      'R5',
      [
        {
          operationId: 'CTG_4',
          ctg: '4',
          plate: 'AA702TR',
          executiveCircuitCode: 'R5',
          externalIngresoAt: '2026-06-12T08:00:00',
          externalSalidaAt: '2026-06-12T12:00:00',
        },
      ],
      [
        {
          truckPlate: 'AA7O2TR',
          deviceCode: 'RicB2Egreso',
          sectorCode: 'RICARDONE_BALANZA',
          occurredAt: '2026-06-12T09:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })

  it('balanza egreso desde alerta con payload JSON string', () => {
    const rows = buildExcelCameraMatrix(
      'R1',
      [
        {
          operationId: 'CTG_8',
          ctg: '8',
          plate: 'BB333CC',
          executiveCircuitCode: 'R1',
          externalIngresoAt: '2026-06-10T08:00:00',
          externalSalidaAt: '2026-06-10T12:00:00',
        },
      ],
      [],
      {
        alerts: [
          {
            deviceCode: 'RicB1Egreso',
            sectorCode: 'RICARDONE_BALANZA',
            occurredAt: '2026-06-10T10:00:00-03:00',
            payload: JSON.stringify({ plate: 'BB333CC' }),
          },
        ],
      }
    )
    expect(rows[0]!.captures.balanza_egreso).toBe(true)
  })
})

describe('auditExcelCameraMatrix R5', () => {
  it('marca volcable en ventana R5', () => {
    const rows = buildExcelCameraMatrix(
      'R5',
      [
        {
          operationId: 'CTG_5',
          ctg: '5',
          plate: 'VV222CC',
          executiveCircuitCode: 'R5',
          externalIngresoAt: '2026-06-10T08:00:00',
          externalSalidaAt: '2026-06-10T12:00:00',
        },
      ],
      [
        {
          truckPlate: 'VV222CC',
          deviceCode: 'RicVolcable1',
          sectorCode: 'RICARDONE_VOLCABLE_1',
          createdAt: '2026-06-10T10:00:00-03:00',
        },
      ]
    )
    expect(rows[0]!.captures.volcable).toBe(true)
    expect(rows[0]!.captures.ingreso).toBe(false)
  })
})

describe('auditExcelCameraMatrix R7', () => {
  it('extrae CTG', () => {
    expect(extractCtgFromOperationId('CTG_10132837785')).toBe('10132837785')
  })

  it('cuenta reconocidos en >= 4 puntos R7', () => {
    const rows = buildExcelCameraMatrix(
      'R7',
      [
        {
          operationId: 'CTG_1',
          ctg: '1',
          plate: 'ABC123',
          executiveCircuitCode: 'R7',
          externalIngresoAt: '2026-06-10T20:00:00',
          externalSalidaAt: '2026-06-11T00:00:00',
        },
        {
          operationId: 'CTG_2',
          ctg: '2',
          plate: 'ZZZ999',
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
          deviceCode: 'RicPreIngInFr',
          sectorCode: 'RICARDONE_PREINGRESO',
          createdAt: '2026-06-10T20:35:00-03:00',
        },
        {
          truckPlate: 'ABC123',
          deviceCode: 'RicCal01',
          sectorCode: 'RICARDONE_CALADA',
          createdAt: '2026-06-10T20:40:00-03:00',
        },
        {
          truckPlate: 'ABC123',
          deviceCode: 'RicEgrCamFrente',
          sectorCode: 'RICARDONE_EGRESO_CAMIONES',
          createdAt: '2026-06-10T21:00:00-03:00',
        },
        {
          truckPlate: 'ABC123',
          deviceCode: 'SLZIngCamFrente',
          sectorCode: 'PUERTO_SAN_LORENZO_INGRESO',
          createdAt: '2026-06-10T22:00:00-03:00',
        },
      ]
    )
    const rec = summarizeRouteRecognition('R7', rows, 4)
    expect(rec.recognizedCount).toBe(1)
    expect(rec.total).toBe(2)
  })
})
