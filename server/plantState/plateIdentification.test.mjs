import { describe, expect, it } from 'vitest'
import {
  applyIdentifications,
  circuitWeights,
  expectedNodes,
  identifyFragments,
  nodeModelCatalog,
  plateSimilarity,
} from './plateIdentification.mjs'

const catalog = nodeModelCatalog()

/** Evento del feed con la hora de pared ya corregida (occurredAt = pared − 206 min). */
function ev(plate, uid, sectorCode, deviceCode, wallIso) {
  const occurred = new Date(Date.parse(wallIso) - 206 * 60_000).toISOString()
  return { journeyUid: uid, truckPlate: plate, normalizedPlate: plate, sectorCode, deviceCode, occurredAt: occurred, recordedAt: occurred }
}

describe('plateSimilarity', () => {
  it('perdona confusiones típicas y letras perdidas', () => {
    expect(plateSimilarity('KMO254', 'KWO254')).toBeGreaterThanOrEqual(0.65)
    expect(plateSimilarity('AAA00', 'AAA000')).toBeGreaterThanOrEqual(0.85)
    expect(plateSimilarity('AA4628X', 'AA462BX')).toBeGreaterThan(0.9)
  })
  it('no acepta lecturas de menos de 4 caracteres', () => {
    expect(plateSimilarity('BY5', 'BYZ572')).toBe(0)
  })
})

describe('peso de circuitos en vivo', () => {
  it('las últimas 24 h mandan sobre el histórico', () => {
    const w = circuitWeights({ R5: 40 }, { R7: 0.8, R5: 0.05 })
    expect(w.R5).toBeGreaterThan(w.R7)
  })
  it('Preingreso → Calada espera Salida 2 en R7', () => {
    const exp = expectedNodes(['S1', 'S2'], catalog, circuitWeights({}, { R7: 0.8 }))
    expect(exp.reachable.S3).toBeGreaterThan(0.5)
  })
})

describe('identifyFragments', () => {
  const now = Date.parse('2026-09-08T12:00:00-03:00')
  const base = [
    ev('AAA000', 'j1', '2-S1', 'RicPreIngInFr', '2026-09-08T11:00:00-03:00'),
    ev('AAA000', 'j1', '2-S2', 'RicCal03', '2026-09-08T11:20:00-03:00'),
  ]

  it('lectura reparable en el nodo esperado → casi seguro y se reescribe', () => {
    const events = [...base, ev('AAA00', 'j2', '2-S3', 'RicEgrCamFrente', '2026-09-08T11:40:00-03:00')]
    const r = identifyFragments(events, now, { catalog })
    const it0 = r.items.find((i) => i.readPlate === 'AAA00')
    expect(it0.level).toBe('casi_seguro')
    expect(it0.assignedPlate).toBe('AAA000')
    const out = applyIdentifications(events, r.items)
    expect(out.filter((e) => e.truckPlate === 'AAA000')).toHaveLength(3)
  })

  it('lectura ilegible queda pendiente y la confirma operaciones', () => {
    const events = [...base, ev('XC4', 'j3', '2-S3', 'RicEgrCamFrente', '2026-09-08T11:40:00-03:00')]
    const pend = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'XC4')
    expect(pend.level).toBe('pendiente')
    const decided = identifyFragments(events, now, {
      catalog,
      decisions: { [pend.fragmentKey]: { action: 'confirm', plate: 'AAA000', journeyUid: 'j1' } },
    }).items.find((i) => i.readPlate === 'XC4')
    expect(decided.level).toBe('confirmado')
    expect(decided.assignedPlate).toBe('AAA000')
  })
})

describe('doble lectura en el mismo nodo', () => {
  it('otra cámara del nodo donde ya está el camión cuenta como esperado', () => {
    const now = Date.parse('2026-09-08T12:00:00-03:00')
    const events = [
      ev('MML273', 'k1', '1-S5', 'SLZBalSalFte', '2026-09-08T11:30:00-03:00'),
      ev('MML273', 'k1', '1-S7', 'SLZSalidaC1Fte', '2026-09-08T11:45:00-03:00'),
      ev('HHL273', 'k2', '1-S7', 'SLZSalidaC2Fte', '2026-09-08T11:46:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'HHL273')
    // Las dos son patentes válidas: no se sabe cuál leyó mal → decide operaciones.
    expect(it0.level).toBe('provisorio')
    expect(it0.assignedPlate).toBeNull()
    // Operaciones: la correcta es la leída (HHL273) → el viaje MML273 pasa a HHL273.
    const r = identifyFragments(events, now, {
      catalog,
      decisions: { [it0.fragmentKey]: { action: 'confirm', plate: 'HHL273', journeyUid: 'k1' } },
    })
    const fixed = applyIdentifications(events, r.items)
    expect(fixed.every((e) => e.truckPlate === 'HHL273')).toBe(true)
    expect(fixed.every((e) => e.journeyUid === 'k1')).toBe(true)
  })
})

describe('camión real sin ingreso leído', () => {
  it('patente válida leída igual en varios nodos no se manda a revisar', () => {
    const now = Date.parse('2026-09-08T12:00:00-03:00')
    const events = [
      ev('GNZ601', 'g1', '1-S1', 'SLZBalIngFte', '2026-09-08T10:00:00-03:00'),
      ev('GMO261', 'g2', '1-S2', 'SLZCalado', '2026-09-08T11:00:00-03:00'),
      ev('GMO261', 'g2', '1-S1', 'SLZBalIngFte', '2026-09-08T11:05:00-03:00'),
    ]
    const r = identifyFragments(events, now, { catalog })
    expect(r.items.find((i) => i.readPlate === 'GMO261')).toBeUndefined()
  })
})

describe('patente escrita a mano', () => {
  it('si el camión está en planta, la lectura se suma a su viaje', () => {
    const now = Date.parse('2026-09-08T12:00:00-03:00')
    const events = [
      ev('FMN123', 'f1', '2-S1', 'RicPreIngInFr', '2026-09-08T11:00:00-03:00'),
      ev('GLM5520', 'f2', '2-S3', 'RicEgrCamFrente', '2026-09-08T11:30:00-03:00'),
    ]
    const key = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'GLM5520').fragmentKey
    const r = identifyFragments(events, now, { catalog, decisions: { [key]: { action: 'confirm', plate: 'FMN123' } } })
    const it0 = r.items.find((i) => i.readPlate === 'GLM5520')
    expect(it0.assignedJourneyUid).toBe('f1')
    expect(it0.renameJourneyUid).toBeNull()
  })
})

describe('casos reales del 06/10 corregidos por operaciones', () => {
  const now = Date.parse('2026-10-06T14:00:00-03:00')

  it('una patente válida nunca se une sola a otra parecida (AB912RO no es AB912PO)', () => {
    const events = [
      ev('AB912PO', 'a1', '2-S1', 'RicPreIngInFr', '2026-10-06T12:00:00-03:00'),
      ev('AB912PO', 'a1', '2-S2', 'RicCal03', '2026-10-06T12:20:00-03:00'),
      ev('AB912RO', 'a2', '2-S4', 'RicB3Egreso', '2026-10-06T12:40:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'AB912RO')
    expect(it0.level).toBe('provisorio')
    expect(it0.assignedPlate).toBeNull()
  })

  it('ofrece el camión aunque su lectura buena llegue después (OQT40 → OQT140)', () => {
    const events = [
      ev('OQT40', 'o1', '1-S0', 'SLZIngCamFrente', '2026-10-06T11:12:00-03:00'),
      ev('OQT140', 'o2', '1-S1', 'SLZBalIngFte', '2026-10-06T11:40:00-03:00'),
      ev('OQT140', 'o2', '1-S5', 'SLZBalSC2Fte', '2026-10-06T12:30:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'OQT40')
    expect(it0.candidates[0].plate).toBe('OQT140')
    expect(it0.candidates[0].seenAfter).toBe(true)
  })

  it('busca candidatos en la otra planta (leído bien en Ricardone, mal en San Lorenzo)', () => {
    const ric = [
      ev('GFP699', 'g1', '2-S1', 'RicPreIngInFr', '2026-10-06T08:00:00-03:00'),
      ev('GFP699', 'g1', '2-S3', 'RicEgrCamFrente', '2026-10-06T08:10:00-03:00'),
    ]
    const sl = [ev('GFP6991', 'g2', '1-S1', 'SLZBalIngFte', '2026-10-06T08:40:00-03:00')]
    const it0 = identifyFragments(sl, now, { catalog, otherSiteEvents: ric }).items.find((i) => i.readPlate === 'GFP6991')
    expect(it0.candidates[0].plate).toBe('GFP699')
  })
})

describe('circuito del candidato si la lectura es suya', () => {
  it('un camión de Calada leído en Playa 3 no puede quedar como R7', () => {
    const now = Date.parse('2026-10-07T07:00:00-03:00')
    const events = [
      ev('TGT378', 't1', '2-S1', 'RicPreIngInFr', '2026-10-07T05:40:00-03:00'),
      ev('TGT378', 't1', '2-S2', 'RicCal04', '2026-10-07T06:01:00-03:00'),
      ev('TGL378', 't2', '2-S6', 'RicS6Playa3', '2026-10-07T06:20:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'TGL378')
    const c = it0.candidates.find((x) => x.plate === 'TGT378')
    expect(c.circuit).not.toBe('R7')
    expect(c.recentReads[0].nodeLabel).toBe('Calada')
  })
})

describe('universo conocido y doble lectura (08/10)', () => {
  const now = Date.parse('2026-10-08T12:00:00-03:00')

  it('lectura ilegible cercana en otro carril: requiere comparación humana', () => {
    const events = [
      ev('AF566LP', 'l1', '1-S1', 'SLZBalIngFte', '2026-10-08T09:00:00-03:00'),
      ev('AF566LP', 'l1', '1-S7', 'SLZSalidaC2Fte', '2026-10-08T11:00:00-03:00'),
      ev('AF566L', 'l2', '1-S7', 'SLZSalidaC1Fte', '2026-10-08T11:00:30-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'AF566L')
    expect(it0.level).toBe('provisorio')
    expect(it0.assignedPlate).toBeNull()
    expect(it0.candidates[0].inventory.reason).toContain('Otro carril')
    expect(it0.candidates[0].twinSeconds).toBe(30)
  })

  it('ilegible casi igual a un camión del universo con una sola lectura: se aplica sola (NWZ3336 → NWZ336)', () => {
    const events = [
      ev('NWZ336', 'n1', '2-S1', 'RicPreIngInFr', '2026-10-08T10:00:00-03:00'),
      ev('NWZ3336', 'n2', '2-S2', 'RicCal03', '2026-10-08T10:20:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'NWZ3336')
    expect(it0.level).toBe('casi_seguro')
    expect(it0.assignedPlate).toBe('NWZ336')
  })

  it('una patente válida casi igual a un camión del universo no se corrige sola (MFY738 / MFY788)', () => {
    const events = [
      ev('MFY788', 'm1', '2-S1', 'RicPreIngInFr', '2026-10-08T10:00:00-03:00'),
      ev('MFY788', 'm1', '2-S2', 'RicCal03', '2026-10-08T10:20:00-03:00'),
      ev('MFY738', 'm2', '2-S3', 'RicEgrCamFrente', '2026-10-08T10:50:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'MFY738')
    expect(it0.level).toBe('provisorio')
    expect(it0.candidates[0].inUniverse).toBe(true)
  })

  it('los camiones del universo van primero; los de afuera siguen visibles', () => {
    const events = [
      // R7 en Calada: Salida 2 es su paso esperado.
      ev('ABC123', 'a1', '2-S1', 'RicPreIngInFr', '2026-10-08T10:00:00-03:00'),
      ev('ABC123', 'a1', '2-S2', 'RicCal03', '2026-10-08T10:20:00-03:00'),
      // Ya pasó por Salida 2 y la balanza de egreso: volver a Salida 2 no es un paso probable.
      ev('ABC128', 'a2', '2-S1', 'RicPreIngInFr', '2026-10-08T09:00:00-03:00'),
      ev('ABC128', 'a2', '2-S3', 'RicEgrCamFrente', '2026-10-08T09:40:00-03:00'),
      ev('ABC12', 'a3', '2-S3', 'RicEgrCamFrente', '2026-10-08T10:45:00-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'ABC12')
    expect(it0.candidates.map((c) => c.plate)).toEqual(expect.arrayContaining(['ABC123', 'ABC128']))
    expect(it0.candidates[0].plate).toBe('ABC123')
    expect(it0.candidates[0].inUniverse).toBe(true)
  })
})

describe('decisiones que no se pierden (bug 07–08/10)', () => {
  const now = Date.parse('2026-10-08T12:00:00-03:00')

  it('«la cámara leyó bien» en dos lecturas gemelas no se anulan entre sí (AG688FB)', () => {
    const events = [
      ev('AG688FD', 'g1', '1-S1', 'SLZBalIngFte', '2026-10-08T10:00:00-03:00'),
      ev('AG688FD', 'g1', '1-S2', 'SLZCalado', '2026-10-08T10:20:00-03:00'),
      ev('AG688FB', 'g2', '1-S5', 'SLZBalSC1Fte', '2026-10-08T10:50:00-03:00'),
      ev('AG688FB', 'g3', '1-S5', 'SLZBalSC2Fte', '2026-10-08T10:51:00-03:00'),
    ]
    const keys = identifyFragments(events, now, { catalog }).items.filter((i) => i.readPlate === 'AG688FB').map((i) => i.fragmentKey)
    expect(keys.length).toBe(2)
    const decisions = Object.fromEntries(keys.map((k, n) => [k, { action: 'confirm', plate: 'AG688FB', journeyUid: null, updatedAt: `2026-10-08T11:0${n}:00Z` }]))
    const items = identifyFragments(events, now, { catalog, decisions }).items.filter((i) => i.readPlate === 'AG688FB')
    expect(items.every((i) => i.level === 'confirmado' && i.assignedPlate === 'AG688FB')).toBe(true)
  })

  it('una corrección confirmada se sigue aplicando aunque el camión ya no esté en planta', () => {
    const events = [ev('ROL445', 'r2', '2-S3', 'RicEgrCamFrente', '2026-10-08T10:50:00-03:00')]
    const key = 'r2'
    const r = identifyFragments(events, now, { catalog, decisions: { [key]: { action: 'confirm', plate: 'RDL445', journeyUid: 'r1' } } })
    const it0 = r.items.find((i) => i.fragmentKey === key)
    expect(it0.level).toBe('confirmado')
    expect(applyIdentifications(events, r.items)[0].truckPlate).toBe('RDL445')
  })
})

describe('patente válida leída en el mismo nodo (08/10)', () => {
  const now = Date.parse('2026-10-08T12:00:00-03:00')

  it('AC297UX → AC297HX: misma balanza 15 min antes y el camión con dos lecturas se aplica sola', () => {
    const events = [
      ev('AC297HX', 'h1', '2-S1', 'RicPreIngInFr', '2026-10-08T09:50:00-03:00'),
      ev('AC297HX', 'h1', '2-S4', 'RicB3Ingreso', '2026-10-08T10:04:20-03:00'),
      ev('AC297UX', 'h2', '2-S4', 'RicB3Ingreso', '2026-10-08T10:19:16-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'AC297UX')
    expect(it0.level).toBe('casi_seguro')
    expect(it0.assignedPlate).toBe('AC297HX')
  })

  it('AH861QO → AH861QQ: con una sola lectura espera el veredicto del DSS y con él se aplica', () => {
    const events = [
      ev('AH861QQ', 'q1', '1-S10', 'RenDescFte', '2026-10-08T09:47:51-03:00'),
      ev('AH861QO', 'q2', '1-S10', 'RenDescFte', '2026-10-08T09:54:24-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'AH861QO')
    expect(it0.level).toBe('provisorio')
    expect(it0.evidenceEligible).toBe(true)
    const r = identifyFragments(events, now, { catalog, evidenceVerdicts: { [it0.fragmentKey]: { plate: 'AH861QQ', probability: 0.87 } } })
    const it1 = r.items.find((i) => i.readPlate === 'AH861QO')
    expect(it1.level).toBe('casi_seguro')
    expect(it1.assignedPlate).toBe('AH861QQ')
  })

  it('dos patentes válidas a segundos en el mismo nodo no se aplican ni con veredicto (no se sabe cuál es la buena)', () => {
    const events = [
      ev('MML273', 'k1', '1-S5', 'SLZBalSalFte', '2026-10-08T11:30:00-03:00'),
      ev('MML273', 'k1', '1-S7', 'SLZSalidaC1Fte', '2026-10-08T11:45:00-03:00'),
      ev('HHL273', 'k2', '1-S7', 'SLZSalidaC2Fte', '2026-10-08T11:45:40-03:00'),
    ]
    const it0 = identifyFragments(events, now, { catalog }).items.find((i) => i.readPlate === 'HHL273')
    expect(it0.evidenceEligible).toBe(false)
    const r = identifyFragments(events, now, { catalog, evidenceVerdicts: { [it0.fragmentKey]: { plate: 'MML273', probability: 0.95 } } })
    expect(r.items.find((i) => i.readPlate === 'HHL273').level).toBe('provisorio')
  })
})
