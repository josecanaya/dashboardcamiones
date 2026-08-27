import { describe, expect, it } from 'vitest'
import {
  buildSanLorenzoVolcableEvents,
  filterVolcableSlIngresoMovimientos,
  isSanLorenzoPelletVolcableIngresoLeg,
  sanLorenzoVolcableCalleFromDevice,
  sanLorenzoVolcableCalleFromPlatform,
  type VolcableIngresoMovimientoLike,
} from './etlSanLorenzoVolcableActivity'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'

function ev(deviceCode: string, occurredAt: string): RealJourneyEventDto {
  return { deviceCode, occurredAt } as RealJourneyEventDto
}

function journey(partial: {
  journeyUid: string
  plate?: string
  circuit: string
  events: RealJourneyEventDto[]
}): ClassifiedJourneyForTiming {
  return {
    journey: {
      journeyUid: partial.journeyUid,
      normalizedPlate: partial.plate ?? 'AB123CD',
      plate: partial.plate ?? 'AB123CD',
      events: partial.events,
    } as unknown as ClassifiedJourneyForTiming['journey'],
    executiveCircuitCode: partial.circuit,
    committeeGroup: 'COMPLETOS',
  } as ClassifiedJourneyForTiming
}

const mov = (o: Partial<VolcableIngresoMovimientoLike>): VolcableIngresoMovimientoLike => ({
  movement_type: 'INGRESO',
  ...o,
})

describe('helpers de calle volcable SL', () => {
  it('cámara SLZVolcableC1–C5 → «Volcable N»', () => {
    expect(sanLorenzoVolcableCalleFromDevice('SLZVolcableC3')).toBe('Volcable 3')
    expect(sanLorenzoVolcableCalleFromDevice('SLZCalado')).toBeNull()
    expect(sanLorenzoVolcableCalleFromDevice('RicVolcable1')).toBeNull()
  })
  it('plataforma Excel VOLCABLE_PTO_N → «Volcable N» (misma etiqueta que la cámara)', () => {
    expect(sanLorenzoVolcableCalleFromPlatform('VOLCABLE_PTO_3')).toBe('Volcable 3')
    expect(sanLorenzoVolcableCalleFromPlatform('VOLCABLE PTO 5')).toBe('Volcable 5')
    expect(sanLorenzoVolcableCalleFromPlatform('VOLCABLE_1')).toBeNull() // Ricardone
    expect(sanLorenzoVolcableCalleFromPlatform('')).toBeNull()
  })
})

describe('filterVolcableSlIngresoMovimientos (solo filas INGRESO con VOLCABLE PTO)', () => {
  it('se queda con las I de volcable e ignora egresos y no-volcable', () => {
    const list = filterVolcableSlIngresoMovimientos([
      // Pata EGRESO Ricardone (sin plataforma) — se ignora.
      mov({ movement_type: 'EGRESO', plate_normalized: 'VJG112', plataforma_original: '', product_normalized: 'PELLETS GIRASOL' }),
      // Pata INGRESO SL — dice la calle.
      mov({ plate_normalized: 'VJG112', plataforma_original: 'VOLCABLE PTO 4', product_normalized: 'PELLETS GIRASOL', external_ingreso_at: '2026-08-20T18:07:00-03:00' }),
      // INGRESO que no es volcable → se ignora.
      mov({ plate_normalized: 'ZZZ999', plataforma_original: 'ACEITE_PTO', product_normalized: 'ACEITE', external_ingreso_at: '2026-08-20T10:00:00-03:00' }),
    ])
    expect(list).toHaveLength(1)
    expect(list[0]!.plate_normalized).toBe('VJG112')
  })
})

describe('isSanLorenzoPelletVolcableIngresoLeg (pata I del pellet de la vuelta en volcable)', () => {
  it('true: mov I + VOLCABLE_PTO + de la vuelta + pellet (con variantes de producto)', () => {
    expect(
      isSanLorenzoPelletVolcableIngresoLeg(
        mov({ platform_normalized: 'VOLCABLE_PTO_4', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL' })
      )
    ).toBe(true)
    // flag original "SI" y producto con typo/variante (cáscara pelleteada) también cuenta.
    expect(
      isSanLorenzoPelletVolcableIngresoLeg(
        mov({ plataforma_original: 'VOLCABLE PTO 4', es_de_vuelta_original: 'SI', product_normalized: 'CASCARA DE SOJA PELLETEADA' })
      )
    ).toBe(true)
  })
  it('false: soja del puerto (no es de la vuelta ni pellet) — se cuenta como hasta ahora', () => {
    expect(
      isSanLorenzoPelletVolcableIngresoLeg(
        mov({ platform_normalized: 'VOLCABLE_PTO_5', es_de_vuelta: false, product_normalized: 'SOJA' })
      )
    ).toBe(false)
  })
  it('false: pellet de la vuelta pero EGRESO (la carga en Ricardone, no descarga en volcable)', () => {
    expect(
      isSanLorenzoPelletVolcableIngresoLeg(
        mov({ movement_type: 'EGRESO', platform_normalized: 'CARGA_SILO_11', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL' })
      )
    ).toBe(false)
  })
  it('false: pellet de la vuelta pero plataforma NO es volcable del puerto', () => {
    expect(
      isSanLorenzoPelletVolcableIngresoLeg(
        mov({ platform_normalized: 'VOLCABLE_1', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL' })
      )
    ).toBe(false)
  })
})

describe('buildSanLorenzoVolcableEvents (conteo = filas INGRESO, hora de cámara si la pasó)', () => {
  it('pata I pellet de la vuelta SIN cámara: cuenta en su VOLCABLE_PTO con hora del Excel', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [],
      volcableIngresoMovimientos: [
        mov({
          plate_normalized: 'CIE516',
          platform_normalized: 'VOLCABLE_PTO_4',
          es_de_vuelta: true,
          product_normalized: 'PELLETS GIRASOL',
          external_ingreso_at: '2026-08-18T20:23:00-03:00',
          ctg: '30034463291',
        }),
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 4')
    expect(rows[0]!.producto).toBe('PELLETS GIRASOL')
    expect(rows[0]!.hora.slice(0, 2)).toBe('20') // hora de descarga del Excel
    expect(rows[0]!.journey_id).toBe('excel:30034463291')
  })

  it('INGRESO + cámara: calle y producto del Excel, hora de la cámara', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j1', plate: 'AA1', circuit: 'R30', events: [ev('SLZVolcableC3', '2026-07-20T10:15:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [
        mov({ plate_normalized: 'AA1', platform_normalized: 'VOLCABLE_PTO_3', product_normalized: 'PELLETS GIRASOL', external_calado_at: '2026-07-20T09:00:00-03:00' }),
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 3')
    expect(rows[0]!.producto).toBe('PELLETS GIRASOL')
    expect(rows[0]!.hora.slice(0, 2)).toBe('10') // hora de la cámara, no del Excel (09)
    expect(rows[0]!.journey_id).toBe('j1')
  })

  it('mismo camión (patente), varios viajes el mismo día: cada CTG cuenta (journey_id distinto)', () => {
    // Una patente que descarga 3 veces el mismo día en el mismo volcable (3 CTG). El panel cuenta
    // journey_id distintos: los 3 viajes deben dar 3 filas con ids distintos, no colapsar a 1.
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        // Una sola pasada de cámara para esa patente+día (uid compartido si se usara el de cámara).
        journey({ journeyUid: 'jcam', plate: 'CIE516', circuit: 'R30', events: [ev('SLZVolcableC4', '2026-08-18T20:00:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [
        mov({ plate_normalized: 'CIE516', platform_normalized: 'VOLCABLE_PTO_4', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL', external_ingreso_at: '2026-08-18T08:00:00-03:00', ctg: 'CTG_A' }),
        mov({ plate_normalized: 'CIE516', platform_normalized: 'VOLCABLE_PTO_4', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL', external_ingreso_at: '2026-08-18T14:00:00-03:00', ctg: 'CTG_B' }),
        mov({ plate_normalized: 'CIE516', platform_normalized: 'VOLCABLE_PTO_4', es_de_vuelta: true, product_normalized: 'PELLETS GIRASOL', external_ingreso_at: '2026-08-18T20:30:00-03:00', ctg: 'CTG_C' }),
      ],
    })
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.journey_id)).size).toBe(3) // NO colapsan
    expect(rows.map((r) => r.journey_id).sort()).toEqual(['excel:CTG_A', 'excel:CTG_B', 'excel:CTG_C'])
    expect(rows.every((r) => r.camara === 'Volcable 4' && r.producto === 'PELLETS GIRASOL')).toBe(true)
  })

  it('INGRESO sin cámara volcable (ni journey): cuenta igual con hora de descarga del Excel', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [],
      volcableIngresoMovimientos: [
        mov({ plate_normalized: 'BB2', platform_normalized: 'VOLCABLE_PTO_5', product_normalized: 'SOJA', external_calado_at: '2026-07-20T11:30:00-03:00', ctg: '30099' }),
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 5')
    expect(rows[0]!.producto).toBe('SOJA')
    expect(rows[0]!.hora.slice(0, 2)).toBe('11') // hora de descarga del Excel
    expect(rows[0]!.journey_id).toBe('excel:30099') // id sintético estable
  })

  it('pellet solo cámara (plataforma Excel NO es VOLCABLE_PTO): calle de la cámara, producto del merge', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j3', circuit: 'R30', events: [ev('SLZVolcableC4', '2026-07-20T10:00:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [], // el pellet no está en VOLCABLE_PTO
      productByJourneyUid: new Map([['j3', 'PELLETS GIRASOL']]),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 4')
    expect(rows[0]!.producto).toBe('PELLETS GIRASOL')
  })

  it('cámara sin Excel ni producto → Sin dato (probable error)', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j3b', circuit: 'R30', events: [ev('SLZVolcableC2', '2026-07-20T10:00:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 2')
    expect(rows[0]!.producto).toBe('')
  })

  it('no cuenta dos veces: INGRESO + cámara de la misma patente/día = una fila', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j5', plate: 'EE5', circuit: 'R30', events: [ev('SLZVolcableC1', '2026-07-20T12:00:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [
        mov({ plate_normalized: 'EE5', platform_normalized: 'VOLCABLE_PTO_1', product_normalized: 'SOJA', external_calado_at: '2026-07-20T11:00:00-03:00' }),
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.camara).toBe('Volcable 1')
    expect(rows[0]!.hora.slice(0, 2)).toBe('12') // hora de la cámara
  })

  it('journey sin cámara volcable y sin movimiento INGRESO → no emite', () => {
    const rows = buildSanLorenzoVolcableEvents({
      classifiedJourneys: [
        journey({ journeyUid: 'j4', circuit: 'R7', events: [ev('SLZCalado', '2026-07-20T10:00:00-03:00')] }),
      ],
      volcableIngresoMovimientos: [],
    })
    expect(rows).toHaveLength(0)
  })
})
