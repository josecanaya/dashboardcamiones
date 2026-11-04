import { describe, it, expect } from 'vitest'
import { finalSteps, loteModel, readL, reconstructLote, FRAG } from './loteCore.mjs'
import { applyLoteToItems, buildLiveLote, loteTruckSteps, samePassCaptures } from './loteLive.mjs'

const T0 = Date.parse('2026-10-15T10:00:00-03:00')
const min = (n) => T0 + n * 60_000
const LM = loteModel()
const R7 = LM.expectedNodes('R7')
const cap = (node, t, plate) => ({ node, rear: false, device: 'x', t, plate, attrs: null })
const member = (plate, ing) => ({ id: plate, plate, circuit: 'R7', ing, sal: NaN, exp: [...R7], vStart: ing - 20 * 60_000, vEnd: ing + 12 * 3600_000, inSample: true })

describe('núcleo del lote', () => {
  it('distancia de edición: una letra cambiada pesa mucho más que un fragmento', () => {
    expect(readL('AAA11', 'AAA111')).toBeGreaterThan(500 * FRAG)
    expect(readL('ZZZZ', 'AAA111')).toBe(FRAG)
  })

  it('reconstruye la captura dudosa del único camión con el paso pendiente y deduce el paso sin captura', () => {
    const lote = [member('AAA111', min(0)), member('BBB222', min(180))]
    const caps = [
      cap('ricardone:Ingreso', min(0), 'AAA111'),
      // Pre ingreso sin lectura → deducido; Calada mal leída → reconstruida.
      cap('ricardone:Calada', min(30), 'AAA11'),
      cap('ricardone:Salida 2', min(60), 'AAA111'),
    ]
    reconstructLote({ caps, lote, known: new Set(), start: min(-60), end: min(600), inDay: () => true, inOtrosDay: () => true })
    const [a] = lote
    expect(caps[1].lote).toMatchObject({ via: 'reconstruida', member: a })
    expect(a.status.get('ricardone:Calada')).toMatchObject({ via: 'reconstruida' })
    const st = Object.fromEntries(R7.map((n, i) => [n, finalSteps(a, caps, min(120))[i]]))
    expect(st['ricardone:Ingreso']).toBe('camara')
    expect(st['ricardone:Pre ingreso']).toBe('deducida')
    expect(st['ricardone:Calada']).toBe('reconstruida')
    // Visita abierta: lo que sigue a Salida 2 todavía no pasó.
    expect(st['san_lorenzo:Ingreso']).toBe('pendiente')
  })

  it('un camión fuera de su visita no entra al universo', () => {
    const lote = [member('BBB222', min(180))]
    const caps = [cap('ricardone:Ingreso', min(0), 'BBB22')]
    reconstructLote({ caps, lote, known: new Set(), start: min(-60), end: min(600), inDay: () => true, inOtrosDay: () => true })
    expect(caps[0].lote.via).toBe('sin_candidato')
  })
})

describe('lote en vivo', () => {
  const ev = (id, device, t, plate, journeyUid = `j-${plate}`) => ({ id, journeyUid, deviceCode: device, sectorCode: '', truckPlate: plate, normalizedPlate: plate, occurredAt: new Date(t - 206 * 60_000).toISOString(), eventCategory: 'physical' })
  /** Balanza todavía sin la visita (SGC con demora), pero el camión vino otras veces. */
  const BZ = { visits: [], isKnown: () => true, platesAt: () => [] }
  const events = [
    ev(1, 'RicIngCamFrente', min(0), 'AAA111'),
    ev(2, 'RicPreIngInFr', min(2), 'AAA111'),
    ev(3, 'RicCal03', min(30), 'AAA11', 'frag-1'),
    ev(4, 'RicEgrCamFrente', min(60), 'AAA111'),
  ]

  it('camión con lectura de ingreso entra al lote y la lectura dudosa queda casi_seguro por la regla «lote»', () => {
    const lote = buildLiveLote({ events, nowMs: min(90), balanza: BZ })
    expect(lote.lote.map((m) => [m.plate, m.source])).toEqual([['AAA111', 'camara']])
    const items = [{ fragmentKey: 'frag-1', readPlate: 'AAA11', level: 'pendiente', candidates: [], decision: null, rule: null }]
    applyLoteToItems(items, lote, 'ricardone')
    expect(items[0]).toMatchObject({ level: 'casi_seguro', assignedPlate: 'AAA111', assignedJourneyUid: 'j-AAA111', rule: 'lote' })
  })

  it('el paso repetido como alerta (feed + alertas vacías) es una sola captura y comparte el veredicto', () => {
    const alert = (id, t, plate) => ({ ...ev(id, 'RicCal03', t, plate, id), fromAlert: 'INVALID_ROUTE' })
    // Paso de AAA111 por calada: feed mal leído + dos alertas vacías del mismo segundo.
    const evs = [...events, alert('alert-1', min(30), ''), alert('alert-2', min(30), '')]
    const lote = buildLiveLote({ events: evs, nowMs: min(90), balanza: BZ })
    expect(lote.caps.filter((c) => c.node === 'ricardone:Calada' && !c.samePassAs)).toHaveLength(1)
    for (const k of ['frag-1', 'alert-1', 'alert-2']) {
      const items = [{ fragmentKey: k, readPlate: '', level: 'pendiente', candidates: [], decision: null, rule: null }]
      applyLoteToItems(items, lote, 'ricardone')
      expect(items[0]).toMatchObject({ assignedPlate: 'AAA111', rule: 'lote' })
    }
  })

  it('dos patentes válidas distintas en el mismo segundo son dos pasos', () => {
    expect(samePassCaptures([cap('ricardone:Calada', min(0), 'AAA111'), cap('ricardone:Calada', min(0) + 1000, 'BBB222')])).toHaveLength(2)
  })

  it('no pisa una decisión de operaciones', () => {
    const lote = buildLiveLote({ events, nowMs: min(90), balanza: BZ })
    const items = [{ fragmentKey: 'frag-1', readPlate: 'AAA11', level: 'rechazado', candidates: [], decision: { action: 'reject' }, rule: 'operaciones' }]
    applyLoteToItems(items, lote, 'ricardone')
    expect(items[0].level).toBe('rechazado')
  })

})
