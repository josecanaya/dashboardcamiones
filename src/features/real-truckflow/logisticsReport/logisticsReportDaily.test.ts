import { describe, expect, it } from 'vitest'
import {
  buildDailyAnomalias,
  buildDailyDemorados,
  buildDailyMovimientos,
  productGroupOf,
} from './logisticsReportDaily'

describe('buildDailyMovimientos', () => {
  const rows = [
    { source_date: '2026-09-23', plate_normalized: 'AA123BB', movement_type: 'INGRESO', resolved_product: 'SOJA', kgs_neto: '30000', planta_normalized: 'RICARDONE', platform_normalized: 'VOLCABLE_1', external_ingreso_at: '2026-09-22T23:10:00', external_salida_at: '2026-09-23T04:20:00' },
    { source_date: '2026-09-23', plate_normalized: 'AC456DD', movement_type: 'EGRESO', resolved_product: 'ACEITE CRUDO DE SOJA', kgs_neto: '28000', planta_normalized: 'TERMINAL_EMBARQUE', platform_normalized: '', external_ingreso_at: '2026-09-23T10:05:00', external_salida_at: '2026-09-23T12:40:00' },
    { source_date: '2026-09-23', plate_normalized: 'XXXXXX', movement_type: 'INGRESO', resolved_product: 'SOJA' },
    { source_date: '2026-09-22', plate_normalized: 'AE789FF', movement_type: 'INGRESO', resolved_product: 'SOJA' },
  ]

  it('cuenta solo el Excel del día y saca las patentes ficticias', () => {
    const m = buildDailyMovimientos(rows, '2026-09-23')
    expect(m.total).toBe(2)
    expect(m.ingresos).toBe(1)
    expect(m.egresos).toBe(1)
    expect(m.porProducto.SOJA).toBe(1)
    expect(m.kgNetos).toBe(58000)
    expect(m.kgPorProducto.ACEITE).toBe(28000)
    expect(m.porPlanta).toEqual({ RICARDONE: 1, TERMINAL_EMBARQUE: 1 })
    expect(m.porPlataforma).toEqual({ VOLCABLE_1: 1 })
    // El ingreso del día anterior no cuenta en la curva de ingresos del día.
    expect(m.ingresosPorHora.reduce((a, b) => a + b, 0)).toBe(1)
    expect(m.ingresosPorHora[10]).toBe(1)
    expect(m.salidasPorHora[4]).toBe(1)
    expect(m.salidasPorHora[12]).toBe(1)
    expect(m.missing).toBe(false)
  })

  it('sin tabla es faltante, no cero', () => {
    expect(buildDailyMovimientos(undefined, '2026-09-23').missing).toBe(true)
  })

  it('agrupa productos con la regla de la muestra ejecutiva', () => {
    expect(productGroupOf('SOJA')).toBe('SOJA')
    expect(productGroupOf('MAIZ')).toBe('MAIZ')
    expect(productGroupOf('DDG BURLANDA SECA DE MAIZ SIN SOLUBLES')).toBe('OTROS')
    expect(productGroupOf('HARINA DE ALGO QUE NO EXISTE')).toBe('OTROS')
  })
})

describe('buildDailyAnomalias', () => {
  const base = { anomaly_kind: 'BEHAVIORAL', executive_circuit_code: 'R7', detected_sequence: 'INGRESO>EGRESO' }
  const rows = [
    { ...base, plate: 'AA111AA', anomaly_kind_reason: 'PLATAFORMA_DISTINTA_A_DECLARADA', first_event_at: '2026-09-23T10:00:00-03:00' },
    // Mismo camión y regla, otro ciclo: una sola tarjeta.
    { ...base, plate: 'AA111AA', anomaly_kind_reason: 'PLATAFORMA_DISTINTA_A_DECLARADA', first_event_at: '2026-09-23T15:00:00-03:00' },
    // Ingreso ≥ 22 h del día anterior = día operativo siguiente.
    { ...base, plate: 'BB222BB', anomaly_kind_reason: 'SL_RIC_2H_CICLO_COMPLETO_NO_PELLET', first_event_at: '2026-09-22T23:10:00-03:00' },
    // R6 solo cuenta en el R7 de grano.
    { ...base, plate: 'CC333CC', anomaly_kind_reason: 'RIC_SL_MAS30M_SIN_CALADA_SL', executive_circuit_code: 'R8', first_event_at: '2026-09-23T08:00:00-03:00' },
    // Cobertura de cámara no es conducta.
    { ...base, plate: 'DD444DD', anomaly_kind: 'DATA_COVERAGE', anomaly_kind_reason: 'SECUENCIA_INCOMPLETA', first_event_at: '2026-09-23T08:00:00-03:00' },
    // Patente de servicio del registro.
    { ...base, plate: 'EE555EE', anomaly_kind_reason: 'CARGA_LUEGO_DESCARGA', first_event_at: '2026-09-23T09:00:00-03:00' },
    // Otro día.
    { ...base, plate: 'FF666FF', anomaly_kind_reason: 'CARGA_LUEGO_DESCARGA', first_event_at: '2026-09-23T22:30:00-03:00' },
  ]

  it('aplica día operativo, dedupe por patente y las exclusiones del panel', () => {
    const a = buildDailyAnomalias(rows, '2026-09-23', new Set(['EE555EE']))
    // Orden natural de código: R2 antes que R11.
    expect(a.casos.map((c) => [c.code, c.plate])).toEqual([
      ['R2-b', 'BB222BB'],
      ['R11', 'AA111AA'],
    ])
    expect(a.excluidasRegistro).toBe(1)
    expect(a.porRegla.map((r) => [r.code, r.count])).toEqual([
      ['R11', 1],
      ['R2', 1],
    ])
  })
})

describe('buildDailyDemorados', () => {
  it('lista los legs sobre el umbral del tramo, del día, de mayor a menor', () => {
    const legs = [
      { journey_id: 'j1', plate: 'AA111AA', executive_circuit_code: 'R7', from_logical: 'CALADA', to_logical: 'EGRESO', duration_min: '45.2' },
      { journey_id: 'j2', plate: 'BB222BB', executive_circuit_code: 'R7', from_logical: 'CALADA', to_logical: 'EGRESO', duration_min: '90' },
      { journey_id: 'j3', plate: 'CC333CC', executive_circuit_code: 'R7', from_logical: 'CALADA', to_logical: 'EGRESO', duration_min: '12' },
      { journey_id: 'j4', plate: 'DD444DD', executive_circuit_code: 'R7', from_logical: 'CALADA', to_logical: 'EGRESO', duration_min: '80' },
    ]
    const dayOf = new Map([
      ['j1', '2026-09-23'],
      ['j2', '2026-09-23'],
      ['j3', '2026-09-23'],
      ['j4', '2026-09-22'],
    ])
    const d = buildDailyDemorados(legs, dayOf, '2026-09-23').find((x) => x.tramo === 'CALADA→EGRESO')
    expect(d?.umbralMin).toBe(30)
    expect(d?.casos.map((c) => [c.plate, c.minutos])).toEqual([
      ['BB222BB', 90],
      ['AA111AA', 45],
    ])
  })
})
