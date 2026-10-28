import { describe, expect, it } from 'vitest'
import { padronCartas } from './padronCartas.mjs'
import { identifyFragments, nodeModelCatalog } from './plateIdentification.mjs'
import { buildBalanzaRegistry } from './balanzaRegistry.mjs'
import { alertAttributes, withAlertAttributes } from './alertReads.mjs'

const catalog = nodeModelCatalog()
const ev = (plate, uid, sectorCode, deviceCode, wallIso) => {
  const occurred = new Date(Date.parse(wallIso) - 206 * 60_000).toISOString()
  return { journeyUid: uid, truckPlate: plate, normalizedPlate: plate, sectorCode, deviceCode, occurredAt: occurred, recordedAt: occurred }
}
/** Padrón mínimo con la misma interfaz que server/live/padron (lookup por chasis o acoplado). */
const fakePadron = (notes) => ({ lookup: (p) => notes.filter((n) => n.plates.includes(p)) })
const carta = (ctg, plates, extra = {}) => ({ ctg, plates, direction: 'entra', turnDay: '2026-10-28', stateCode: 'AC', ...extra })

describe('padronCartas (capa 2)', () => {
  const t = Date.parse('2026-10-28T11:00:00-03:00')
  const pz = padronCartas(fakePadron([carta('1', ['AB123CD', 'AE762LY']), carta('2', ['MFY738', 'XX111YY'], { stateCode: 'AN' }), carta('3', ['OLD100', 'OLD200'], { turnDay: '2026-10-20' })]))

  it('chasis y acoplado de una carta vigente', () => {
    expect(pz.at('AB123CD', t)).toMatchObject({ ctg: '1', role: 'chasis' })
    expect(pz.at('ae-762 ly', t)).toMatchObject({ ctg: '1', role: 'acoplado', chasis: 'AB123CD' })
  })
  it('anuladas y de turnos lejanos no cuentan', () => {
    expect(pz.at('MFY738', t)).toBeNull()
    expect(pz.at('OLD100', t)).toBeNull()
  })
})

describe('reconocedor con el padrón de cartas', () => {
  const now = Date.parse('2026-10-28T12:00:00-03:00')

  it('el acoplado de una carta se suma al chasis aunque la balanza todavía no lo tenga', () => {
    const events = [
      ev('MDY035', 't1', '2-S1', 'RicPreIngInFr', '2026-10-28T10:00:00-03:00'),
      ev('MDY035', 't1', '2-S2', 'RicCal03', '2026-10-28T10:30:00-03:00'),
      ev('AE762LY', 'a1', '2-S2', 'RicCal03Tras', '2026-10-28T10:31:00-03:00'),
      ev('AE762LY', 'a1', '2-S3', 'RicSalida2', '2026-10-28T10:50:00-03:00'),
    ]
    const padron = padronCartas(fakePadron([carta('9', ['MDY035', 'AE762LY'])]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'AE762LY')
    expect(it0.rule).toBe('acoplado_carta')
    expect(it0.assignedPlate).toBe('MDY035')
    expect(it0.assignedJourneyUid).toBe('t1')
  })

  it('patente con carta: la cámara leyó bien y no se une a la parecida', () => {
    const events = [
      ev('MFY788', 'm1', '2-S1', 'RicPreIngInFr', '2026-10-28T11:00:00-03:00'),
      ev('MFY788', 'm1', '2-S2', 'RicCal03', '2026-10-28T11:20:00-03:00'),
      ev('MFY738', 'm2', '2-S3', 'RicSalida2', '2026-10-28T11:40:00-03:00'),
    ]
    const padron = padronCartas(fakePadron([carta('5', ['MFY738', 'AA000AA'])]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'MFY738')
    expect(it0.rule).toBe('carta_porte')
    expect(it0.assignedPlate).toBe('MFY738')
    expect(it0.padron.read).toMatchObject({ source: 'carta', ctg: '5', role: 'chasis' })
  })

  it('con carta, la cuenta no la corrige hacia el camión parecido de la balanza', () => {
    const events = [
      ev('MWG720', 'w1', '2-S1', 'RicPreIngInFr', '2026-10-28T11:00:00-03:00'),
      ev('MWC720', 'w2', '2-S2', 'RicCal03', '2026-10-28T11:20:00-03:00'),
    ]
    const balanza = buildBalanzaRegistry([{ plate: 'MWG720', ingresoMs: Date.parse('2026-10-28T11:01:00-03:00'), salidaMs: null }])
    const sinCarta = identifyFragments(events, now, { catalog, balanza }).items.find((i) => i.readPlate === 'MWC720')
    expect(sinCarta.assignedPlate).toBe('MWG720')
    const padron = padronCartas(fakePadron([carta('7', ['MWC720', 'AB111CD'])]))
    const conCarta = identifyFragments(events, now, { catalog, balanza, padron }).items.find((i) => i.readPlate === 'MWC720')
    expect(conCarta.assignedPlate).toBe('MWC720')
    expect(conCarta.rule).toBe('carta_porte')
  })

  it('la patente corregida vuelve a buscarse en el padrón', () => {
    const events = [
      ev('AAA000', 'j1', '2-S1', 'RicPreIngInFr', '2026-10-28T11:00:00-03:00'),
      ev('AAA000', 'j1', '2-S2', 'RicCal03', '2026-10-28T11:20:00-03:00'),
      ev('AAA00', 'j2', '2-S3', 'RicEgrCamFrente', '2026-10-28T11:40:00-03:00'),
    ]
    const padron = padronCartas(fakePadron([carta('8', ['AAA000', 'BBB000'])]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'AAA00')
    expect(it0.assignedPlate).toBe('AAA000')
    expect(it0.padron.assigned).toMatchObject({ ctg: '8', role: 'chasis' })
    expect(it0.candidates[0].padron).toBe('carta de porte 8')
  })
})

describe('Vehículos Permitidos antes que la carta', () => {
  const now = Date.parse('2026-10-28T12:00:00-03:00')
  const permitidos = (list) => ({ lookup: (p) => list.find((v) => v.plate === p) ?? null })

  it('se consulta primero y vale siempre (sin ventana de fechas)', () => {
    const pz = padronCartas(fakePadron([carta('1', ['SZG666', 'AB000CD'])]), permitidos([{ plate: 'SZG666', role: 'chasis', category: 'agua' }]))
    expect(pz.at('SZG666', Date.parse('2027-03-01T10:00:00-03:00'))).toMatchObject({ source: 'permitido', category: 'agua' })
    expect(pz.at('AB000CD', now)).toMatchObject({ source: 'carta', role: 'acoplado' })
  })

  it('camión de agua leído suelto en Salida 2: la cámara leyó bien, no es un caso', () => {
    const events = [
      ev('SZG666', 'w1', '2-S3', 'RicSalida2', '2026-10-28T11:40:00-03:00'),
      ev('SZG686', 'w2', '2-S1', 'RicPreIngInFr', '2026-10-28T11:00:00-03:00'),
      ev('SZG686', 'w2', '2-S2', 'RicCal03', '2026-10-28T11:20:00-03:00'),
    ]
    const padron = padronCartas(null, permitidos([{ plate: 'SZG666', role: 'chasis', category: 'agua' }]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'SZG666')
    expect(it0.rule).toBe('vehiculo_permitido')
    expect(it0.assignedPlate).toBe('SZG666')
    expect(it0.reason).toContain('Vehículos Permitidos (agua)')
  })

  it('el acoplado de un vehículo permitido se suma a su chasis', () => {
    const events = [
      ev('FEA810', 'r1', '2-S1', 'RicPreIngInFr', '2026-10-28T10:00:00-03:00'),
      ev('FEA810', 'r1', '2-S2', 'RicCal03', '2026-10-28T10:30:00-03:00'),
      ev('AC111BB', 'a1', '2-S2', 'RicCal03Tras', '2026-10-28T10:31:00-03:00'),
      ev('AC111BB', 'a1', '2-S3', 'RicSalida2', '2026-10-28T10:50:00-03:00'),
    ]
    const padron = padronCartas(null, permitidos([{ plate: 'AC111BB', role: 'acoplado', chasis: 'FEA810', category: 'residuos' }]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'AC111BB')
    expect(it0.rule).toBe('acoplado_permitido')
    expect(it0.assignedPlate).toBe('FEA810')
  })
})

describe('cada captura pasa por la capa 2', () => {
  const now = Date.parse('2026-10-28T12:00:00-03:00')
  const permitidos = (list) => ({ lookup: (p) => list.find((v) => v.plate === p) ?? null })

  it('recorrido con patente válida en varios nodos que no está en la capa 2: va a corrección', () => {
    const events = [
      ev('BDT263', 'b1', '2-S1', 'RicPreIngInFr', '2026-10-28T10:00:00-03:00'),
      ev('BDT263', 'b1', '2-S2', 'RicCal03', '2026-10-28T10:30:00-03:00'),
      ev('BDI263', 'x1', '2-S4', 'RicB3Ingreso', '2026-10-28T10:50:00-03:00'),
      ev('BDI263', 'x1', '2-S3', 'RicSalida2', '2026-10-28T11:20:00-03:00'),
    ]
    const padron = padronCartas(fakePadron([carta('3', ['BDT263', 'AA111BB'])]))
    const sin = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'BDI263')
    expect(sin).toBeUndefined()
    const con = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'BDI263')
    expect(con).toBeDefined()
    expect(con.candidates[0].plate).toBe('BDT263')
  })

  it('no está en la capa 2 ni se parece a nadie: alerta fuera del sistema con lo que vio la cámara', () => {
    const attributes = { category: 'Pickup', size: 'Light-duty', color: 'White', brand: 'Toyota', plateConfidence: 86, vehicleClass: 'liviano' }
    const events = [
      { ...ev('JUE083', 'p1', '2-S4', 'RicB3Ingreso', '2026-10-28T11:00:00-03:00'), attributes },
      ev('JUE083', 'p1', '2-S3', 'RicSalida2', '2026-10-28T11:10:00-03:00'),
    ]
    const padron = padronCartas(null, permitidos([]))
    const it0 = identifyFragments(events, now, { catalog, padron }).items.find((i) => i.readPlate === 'JUE083')
    expect(it0.level).toBe('fuera_sistema')
    expect(it0.reason).toContain('camioneta Toyota blanco')
    expect(it0.attributes.vehicleClass).toBe('liviano')
  })
})

describe('primer paso de la corrección: lo aprendido de operaciones', () => {
  const now = Date.parse('2026-10-28T12:00:00-03:00')
  const corregidos = (pairs, real = []) => ({ realOf: (r) => pairs.filter((p) => p.read === r), isReal: (p) => real.includes(p) })
  const noCamiones = (list) => ({ lookup: (p) => list.find((v) => v.plate === p) ?? null })

  it('lectura mala que operaciones ya llevó a un camión en planta: se corrige sola', () => {
    const events = [
      ev('JLQ557', 'j1', '2-S1', 'RicPreIngInFr', '2026-10-28T10:00:00-03:00'),
      ev('JLQ557', 'j1', '2-S2', 'RicCal03', '2026-10-28T10:30:00-03:00'),
      ev('JLO557', 'x1', '2-S3', 'RicSalida2', '2026-10-28T11:20:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog, corregidos: corregidos([{ read: 'JLO557', real: 'JLQ557', count: 2 }]) }).items.find((i) => i.readPlate === 'JLO557')
    expect(it0.rule).toBe('corregida_antes')
    expect(it0.assignedPlate).toBe('JLQ557')
  })

  it('patente que operaciones confirmó como real: no se corrige hacia la parecida', () => {
    const events = [
      ev('OJO501', 'o1', '2-S1', 'RicPreIngInFr', '2026-10-28T10:00:00-03:00'),
      ev('OJO501', 'o1', '2-S2', 'RicCal03', '2026-10-28T10:30:00-03:00'),
      ev('OJD501', 'd1', '2-S3', 'RicSalida2', '2026-10-28T11:20:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog, corregidos: corregidos([], ['OJD501']) }).items.find((i) => i.readPlate === 'OJD501')
    expect(it0.rule).toBe('confirmada_antes')
    expect(it0.assignedPlate).toBe('OJD501')
  })

  it('vehículo de la base de no camiones: fuera del sistema, salvo que la cámara vea un camión', () => {
    const at = '2026-10-28T11:20:00-03:00'
    const base = { catalog, noCamiones: noCamiones([{ plate: 'AE040HU', kind: 'liviano' }, { plate: '924KHA', kind: 'tractor_maquinaria' }]) }
    const liv = identifyFragments([ev('AE040HU', 'l1', '2-S3', 'RicSalida2', at)], now, base).items.find((i) => i.readPlate === 'AE040HU')
    expect(liv).toMatchObject({ level: 'fuera_sistema', rule: 'no_camion' })
    expect(liv.reason).toContain('auto o camioneta')
    const tr = identifyFragments([ev('924KHA', 't1', '2-S2', 'RicCal03', at)], now, base).items.find((i) => i.readPlate === '924KHA')
    expect(tr).toMatchObject({ level: 'fuera_sistema', rule: 'no_camion' })
    const camion = { category: 'MidTruck', size: 'Oversize', vehicleClass: 'camion' }
    const visto = identifyFragments([{ ...ev('AE040HU', 'l2', '2-S3', 'RicSalida2', at), attributes: camion }], now, base).items.find((i) => i.readPlate === 'AE040HU')
    expect(visto?.rule).not.toBe('no_camion')
  })
})

describe('atributos de las alertas', () => {
  const alert = (extra = {}) => ({
    id: 1, alertCode: 'INVALID_ROUTE', deviceCode: 'RicB3Ingreso', sectorCode: '2-S4', truckPlate: 'JUE083',
    payload: JSON.stringify({ normalizedPlate: 'JUE083', externalEventBody: { UTC: 1793197253, VehicleColor: 'Blue', VehicleBrand: 'Chevrolet', Object: { Confidence: 86 }, Vehicle: { Category: 'Pickup' }, TrafficCar: { VehicleSize: 'Light-duty' }, ...extra } }),
  })

  it('tipo, tamaño, color, marca y confianza; Unknown queda vacío', () => {
    expect(alertAttributes(alert())).toEqual({ category: 'Pickup', size: 'Light-duty', color: 'Blue', brand: 'Chevrolet', plateConfidence: 86, vehicleClass: 'liviano' })
    expect(alertAttributes(alert({ VehicleBrand: 'Unknown', Vehicle: { Category: 'MidTruck' }, TrafficCar: { VehicleSize: 'Oversize' } }))).toMatchObject({ brand: null, vehicleClass: 'camion' })
  })

  it('se suman a la lectura del feed de la misma cámara y patente', () => {
    const t = (1793197253 * 1000 + 3 * 3600_000 + 240_000) - 206 * 60_000
    const feed = { journeyUid: 'j', truckPlate: 'JUE083', deviceCode: 'RicB3Ingreso', occurredAt: new Date(t + 30_000).toISOString() }
    const other = { ...feed, deviceCode: 'RicSalida2' }
    const [a, b] = withAlertAttributes([feed, other], [alert()])
    expect(a.attributes).toMatchObject({ brand: 'Chevrolet' })
    expect(b.attributes).toBeUndefined()
  })
})
