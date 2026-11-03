import { describe, it, expect } from 'vitest'
import { ensamblarPasos } from './pasos.mjs'

const SKEW = 206 * 60_000
/** Evento con hora operativa `hhmmss` del 03/11 (el feed guarda occurredAt sin el skew). */
const ev = (id, device, sector, plate, hhmmss, extra = {}) => ({
  id,
  journeyUid: extra.journeyUid ?? `j-${id}`,
  deviceCode: device,
  sectorCode: sector,
  truckPlate: plate,
  normalizedPlate: plate,
  occurredAt: new Date(Date.parse(`2026-11-03T${hhmmss}-03:00`) - SKEW).toISOString(),
  ...extra,
})
const vw = { brand: 'Volkswagen', color: 'White' }

describe('ensamblador de pasos', () => {
  it('I91 ×5 en Silo Keppler es un solo paso, aparte de NKU970 que entró 11 min antes', () => {
    const events = [
      ev(1, 'RicS7DescLinea1', '2-S7', 'NKU970', '10:20:01', { attributes: { brand: 'Naveco' } }),
      ...['10:31:12', '10:32:03', '10:33:13', '10:34:01', '10:34:49'].map((h, i) =>
        ev(`a${i}`, 'RicS7DescLinea1', '2-S7', 'I91', h, { journeyUid: `alert-${i}`, fromAlert: 'LPR_MALFUNCTION', attributes: vw })
      ),
    ]
    const r = ensamblarPasos(events)
    expect(r.pasos).toHaveLength(2)
    const i91 = r.pasos.find((p) => p.plate === 'I91')
    expect(i91.captures).toBe(5)
    // Las cinco quedan en el viaje de la primera: un solo fragmento para el reconocedor.
    expect(new Set(r.events.filter((e) => e.fromAlert).map((e) => e.journeyUid))).toEqual(new Set(['alert-0']))
    expect(r.events.find((e) => e.id === 1).journeyUid).toBe('j-1')
  })

  it('la trasera va con la única frontal del nodo y queda como acoplado', () => {
    const r = ensamblarPasos([
      ev(1, 'RicIngCamFrente', '2-S0', 'ABC123', '09:00:00'),
      ev(2, 'RicIngCamTrasera', '2-S0', 'AB123CD', '09:00:16'),
    ])
    expect(r.pasos).toHaveLength(1)
    expect(r.pasos[0].acoplado).toBe('AB123CD')
    const rear = r.events.find((e) => e.id === 2)
    expect(rear.journeyUid).toBe('j-1')
    expect(rear.truckPlate).toBe('ABC123')
    expect(rear.pasoReadPlate).toBe('AB123CD')
  })

  it('dos camiones en fila: cada trasera va con su frontal, en orden', () => {
    const r = ensamblarPasos([
      ev(1, 'RicEgrCamFrente', '2-S3', 'ABC123', '09:00:00'),
      ev(2, 'RicEgrCamFrente', '2-S3', 'XYZ789', '09:00:20'),
      ev(3, 'RicEgrCamTraser', '2-S3', 'AB123CD', '09:00:27', { fromAlert: 'LPR_MALFUNCTION' }),
      ev(4, 'RicEgrCamTraser', '2-S3', 'AC456EF', '09:00:49', { fromAlert: 'LPR_MALFUNCTION' }),
    ])
    expect(r.pasos).toHaveLength(2)
    expect(r.pasos.find((p) => p.plate === 'ABC123').acoplado).toBe('AB123CD')
    expect(r.pasos.find((p) => p.plate === 'XYZ789').acoplado).toBe('AC456EF')
  })

  it('una trasera que llega 3 min después no es del camión: no se junta', () => {
    const r = ensamblarPasos([
      ev(1, 'RicIngCamFrente', '2-S0', 'ABC123', '09:00:00'),
      ev(2, 'RicIngCamTrasera', '2-S0', 'AB123CD', '09:03:00', { fromAlert: 'UNMATCHED_TAIL_OBSERVATION' }),
    ])
    expect(r.pasos).toHaveLength(2)
  })

  it('frontal ilegible y acoplado de una carta leído atrás: el paso se ancla en el acoplado', () => {
    const events = [
      ev(1, 'RicIngCamFrente', '2-S0', 'K9', '09:00:00', { journeyUid: 'alert-1', fromAlert: 'LPR_MALFUNCTION' }),
      ev(2, 'RicIngCamTrasera', '2-S0', 'AB123CD', '09:00:15', { journeyUid: 'alert-2', fromAlert: 'LPR_MALFUNCTION' }),
    ]
    const r = ensamblarPasos(events, { acopladoChasis: (p) => (p === 'AB123CD' ? 'KAP262' : null) })
    expect(r.pasos).toHaveLength(1)
    expect(r.pasos[0].plate).toBe('AB123CD')
    expect(r.events.find((e) => e.id === 1).journeyUid).toBe('alert-2')
    // Sin carta, la patente de atrás puede ser la del camión que sigue en la cola: ancla la frontal.
    expect(ensamblarPasos(events).pasos[0].plate).toBe('K9')
  })

  it('captura vacía en el mismo segundo que la buena: es el mismo disparo y la trasera va con la buena', () => {
    const r = ensamblarPasos([
      ev(1, 'SLZIngCamFrente', '1-S0', 'GLM592', '08:47:33'),
      ev(2, 'SLZIngCamFrente', '1-S0', '', '08:47:33', { journeyUid: 'alert-2', fromAlert: 'LPR_MALFUNCTION' }),
      ev(3, 'SLZIngCamTrasera', '1-S0', 'HERMAN', '08:48:22', { journeyUid: 'alert-3', fromAlert: 'LPR_MALFUNCTION' }),
    ])
    expect(r.pasos).toHaveLength(1)
    expect(r.pasos[0].plate).toBe('GLM592')
  })

  it('dos ilegibles seguidas sin marca no se juntan: pueden ser dos camiones de la cola', () => {
    const r = ensamblarPasos([
      ev(1, 'RicS7DescLinea1', '2-S7', 'I91', '10:31:00', { fromAlert: 'LPR_MALFUNCTION' }),
      ev(2, 'RicS7DescLinea1', '2-S7', 'K7', '10:32:00', { fromAlert: 'LPR_MALFUNCTION' }),
    ])
    expect(r.pasos).toHaveLength(2)
  })

  it('una ilegible de otra marca no se suma al camión que estaba en la cámara', () => {
    const r = ensamblarPasos([
      ev(1, 'RicS7DescLinea1', '2-S7', 'NKU970', '10:30:00', { attributes: { brand: 'Naveco' } }),
      ev(2, 'RicS7DescLinea1', '2-S7', 'I91', '10:31:00', { fromAlert: 'LPR_MALFUNCTION', attributes: vw }),
    ])
    expect(r.pasos).toHaveLength(2)
  })
})
