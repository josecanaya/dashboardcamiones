import { describe, expect, it } from 'vitest'
import { parseVerdict } from './claudeVision.mjs'
import { applyVisionVerdict, checkSeenPlate } from './seenPlate.mjs'
import { cameraBackground, cosine, vehicleVector } from './vectorBase.mjs'

describe('respuesta de Claude', () => {
  it('JSON con texto o bloque de código alrededor', () => {
    expect(parseVerdict('Listo:\n```json\n{"eleccion": "b", "confianza": 0.9, "patente_vista": "roq 011", "confianza_patente": 0.8, "tipo": "Camion", "motivo": "mismo calco"}\n```')).toEqual({ eleccion: 'B', confianza: 0.9, patente: 'ROQ011', confianzaPatente: 0.8, tipo: 'camion', motivo: 'mismo calco' })
  })
  it('«ninguno» no elige a nadie; la confianza queda entre 0 y 1', () => {
    expect(parseVerdict('{"eleccion":"ninguno","confianza":1.4,"motivo":"x"}')).toMatchObject({ eleccion: null, confianza: 1 })
  })
  it('sin JSON: null', () => {
    expect(parseVerdict('no puedo ver las imágenes')).toBeNull()
  })
})

describe('patente que ve la IA', () => {
  const item = { readPlate: 'TGO035', at: '2026-10-28T15:59:00-03:00' }
  const padron = { at: (p) => (p === 'TSO035' ? { source: 'carta', ctg: '1013', role: 'chasis', chasis: 'TSO035' } : null) }
  const balanza = { truckAt: (p) => p === 'TSO035', isKnown: () => false }

  it('vuelve a buscarse en la capa 2, la balanza y las cámaras', () => {
    const r = checkSeenPlate({ seenPlate: 'tso 035', plate: 'ISD035' }, item, { padron, balanza, plantPlates: new Set(['TSO035']) })
    expect(r).toMatchObject({ plate: 'TSO035', capa2Label: 'carta de porte 1013', balanza: 'en_planta', enPlanta: true, igualAElegida: false })
    expect(r.texto).toContain('figura en carta de porte 1013')
  })
  it('igual a la leída: estar en las cámaras no cuenta; sin patente válida no hay sugerencia', () => {
    const r = checkSeenPlate({ seenPlate: 'TGO035' }, item, { plantPlates: new Set(['TGO035']) })
    expect(r).toMatchObject({ igualALeida: true, enPlanta: false })
    expect(r.texto).toContain('no figura en ninguna base')
    expect(checkSeenPlate({ seenPlate: '' }, item)).toBeNull()
  })
})

describe('la IA se aplica sola', () => {
  const at = '2026-10-28T15:59:00-03:00'
  const occ = (iso) => new Date(Date.parse(iso) - 206 * 60_000).toISOString()
  const events = [{ journeyUid: 'tso', truckPlate: 'TSO035', normalizedPlate: 'TSO035', deviceCode: 'RicCal03', occurredAt: occ('2026-10-28T15:30:00-03:00') }]
  const caso = (ia, extra = {}) => ({ fragmentKey: 'f', readPlate: 'TGO035', at, level: 'provisorio', decision: null, ia, ...extra })
  const pv = (capa2) => ({ plate: 'TSO035', capa2, capa2Label: capa2 ? 'carta de porte 1013' : null })
  const carta = { source: 'carta', ctg: '1013', role: 'chasis', chasis: 'TSO035' }

  it('patente vista en la carta y confianza ≥ 0,4: se suma al viaje de esa patente', () => {
    const r = applyVisionVerdict(caso({ seenPlateConfidence: 0.45, patenteVista: pv(carta) }), events)
    expect(r).toMatchObject({ level: 'casi_seguro', rule: 'ia_imagen', assignedPlate: 'TSO035', assignedJourneyUid: 'tso' })
  })
  it('no se aplica: confianza baja, fuera de la capa 2, máquina o decisión de operaciones', () => {
    expect(applyVisionVerdict(caso({ seenPlateConfidence: 0.3, patenteVista: pv(carta) }), events)).toBeNull()
    expect(applyVisionVerdict(caso({ seenPlateConfidence: 0.9, patenteVista: pv(null) }), events)).toBeNull()
    expect(applyVisionVerdict(caso({ seenPlateConfidence: 0.9, vehicleType: 'maquinaria', patenteVista: pv(carta) }), events)).toBeNull()
    expect(applyVisionVerdict(caso({ seenPlateConfidence: 0.9, patenteVista: pv(carta) }, { decision: { action: 'review' } }), events)).toBeNull()
  })
  it('sin chapa leída, la elección por foto se aplica si el camión tenía este paso pendiente (IHRU293 → HPQ293)', () => {
    const hpq = { plate: 'HPQ293', journeyUid: 'hpq', inventory: { status: 'expected' }, padron: 'carta de porte 10135837833', inBalanza: true }
    const ilegible = (ia, cands = [hpq]) => ({ fragmentKey: 'f', readPlate: 'IHRU293', at, level: 'pendiente', decision: null, candidates: cands, ia: { plate: 'HPQ293', seenPlate: null, vehicleType: 'camion', confidence: 0.62, patenteVista: null, ...ia } })
    expect(applyVisionVerdict(ilegible({}), [])).toMatchObject({ level: 'casi_seguro', rule: 'ia_imagen', assignedPlate: 'HPQ293', assignedJourneyUid: 'hpq' })
    expect(applyVisionVerdict(ilegible({ confidence: 0.58 }), [])).toBeNull()
    expect(applyVisionVerdict(ilegible({ vehicleType: 'liviano' }), [])).toBeNull()
    expect(applyVisionVerdict(ilegible({}, [{ ...hpq, inventory: { status: 'consumed' } }]), [])).toBeNull()
    expect(applyVisionVerdict(ilegible({}, []), [])).toBeNull()
  })
  it('acoplado de una carta: se asigna al chasis', () => {
    const r = applyVisionVerdict(caso({ seenPlateConfidence: 0.8, patenteVista: { ...pv({ source: 'carta', ctg: '9', role: 'acoplado', chasis: 'TSO035' }), plate: 'AA111BB' } }), events)
    expect(r.assignedPlate).toBe('TSO035')
  })
})

describe('vector del vehículo', () => {
  const unit = (i, d = 4) => Array.from({ length: d }, (_, k) => (k === i ? 1 : 0))
  it('los parches iguales al fondo de la cámara no pesan', () => {
    // Parche 0 = fondo, parche 1 = el camión.
    const bg = cameraBackground([[unit(0), unit(2)], [unit(0), unit(3)]])
    const v = vehicleVector([unit(0), unit(1)], bg)
    expect(cosine(v, unit(1))).toBeGreaterThan(0.99)
    expect(cosine(vehicleVector([unit(0), unit(1)]), unit(1))).toBeLessThan(0.8)
  })
})
