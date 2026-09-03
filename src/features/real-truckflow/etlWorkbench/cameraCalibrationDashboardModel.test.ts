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

  it('incluye balanza egreso SL en conclusiones R7 (cámara reparada)', () => {
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
    expect(dash.hitoRows.some((h) => h.hito === 'balanza_egreso_slz')).toBe(true)
    expect(dash.stackedBars.some((h) => h.hito === 'balanza_egreso_slz')).toBe(true)
    // Ya no se excluye del brief: la cámara volvió al informe.
    expect(dash.brief.parrafos.join(' ')).not.toMatch(/sin balanza egreso SL/i)
  })

  it('incluye la cámara volcable SL como hito de R7 y la reconoce', () => {
    const mov: MovimientoContratoLike = {
      external_operation_id: 'CTG_55',
      ctg: '55',
      plate_normalized: 'VOL555',
      platform_normalized: 'VOLCABLE_PTO_2',
      plataforma_original: 'Volcable PTO 2',
      planta_normalized: 'TERMINAL_EMBARQUE',
      planta_original: 'Terminal Embarque',
      mov: '',
      movement_type: 'INGRESO',
      movement_type_detail: '',
      external_ingreso_at: '2026-06-10T08:00:00-03:00',
      external_salida_at: '2026-06-10T18:00:00-03:00',
      source_date: '2026-06-10',
    }
    const report = buildExcelCameraComparativaReport({
      movimientos: [mov],
      events: [
        { truckPlate: 'VOL555', deviceCode: 'RicIngCamFrente', createdAt: '2026-06-10T09:00:00-03:00' },
        { truckPlate: 'VOL555', deviceCode: 'SLZVolcableC2', createdAt: '2026-06-10T15:00:00-03:00' },
      ] as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R7')!
    const dash = buildCalibrationDashboardModel(c)
    // volcable SL es un hito de R7 y cuenta como cámara del circuito.
    expect(dash.hitoRows.some((h) => h.hito === 'volcable_slz')).toBe(true)
    expect(dash.circuitCameraLabels).toContain('Descarga volcable SL')
    // El camión fue reconocido por la cámara de calle SLZVolcableC2.
    const row = c.calibration.detailRows.find((r) => r.patente === 'VOL555')!
    expect(row.captures['volcable_slz']).toBe(true)
  })

  it('agrupa camiones por profundidad de reconocimiento (TODAS / TODAS−k)', () => {
    const mkMov = (ctg: string, plate: string): MovimientoContratoLike => ({
      external_operation_id: `CTG_${ctg}`,
      ctg,
      plate_normalized: plate,
      platform_normalized: 'VOLCABLE_PTO_1',
      plataforma_original: 'Volcable PTO 1',
      planta_normalized: 'TERMINAL_EMBARQUE',
      planta_original: 'Terminal Embarque',
      mov: '',
      movement_type: 'INGRESO',
      movement_type_detail: '',
      external_ingreso_at: '2026-06-10T08:00:00-03:00',
      external_salida_at: '2026-06-10T18:00:00-03:00',
      source_date: '2026-06-10',
    })
    const report = buildExcelCameraComparativaReport({
      movimientos: [mkMov('1', 'AAA111'), mkMov('2', 'BBB222')],
      events: [
        // AAA111: sólo lo ve el ingreso → muchas cámaras faltan.
        { truckPlate: 'AAA111', deviceCode: 'RicIngCamFrente', createdAt: '2026-06-10T09:00:00-03:00' },
        // BBB222: lo ve ingreso + volcable → una cámara menos faltante que AAA111.
        { truckPlate: 'BBB222', deviceCode: 'RicIngCamFrente', createdAt: '2026-06-10T09:00:00-03:00' },
        { truckPlate: 'BBB222', deviceCode: 'SLZVolcableC1', createdAt: '2026-06-10T15:00:00-03:00' },
      ] as never,
      fromDay: '2026-06-10',
      toDay: '2026-06-10',
    })
    const c = report.circuits.find((x) => x.circuitCode === 'R7')!
    const dash = buildCalibrationDashboardModel(c)

    // La suma de camiones por bucket = total del circuito.
    const suma = dash.recognitionDepthBuckets.reduce((a, b) => a + b.camiones, 0)
    expect(suma).toBe(dash.excelCamiones)
    // Siempre existe el grupo "TODAS".
    expect(dash.recognitionDepthBuckets.some((b) => b.label === 'TODAS')).toBe(true)
    // Cada camión de un bucket tiene exactamente `faltan` cámaras sin registrar.
    for (const b of dash.recognitionDepthBuckets) {
      for (const t of b.trucks) {
        expect(t.camarasFaltan.length).toBe(b.faltan)
        expect(t.capturadas + t.faltan).toBe(t.total)
        expect(t.total).toBe(dash.circuitCameraCount)
      }
    }
  })
})
