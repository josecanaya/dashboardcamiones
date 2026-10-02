import { describe, expect, it } from 'vitest'
import model from '../../../docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json'
import {
  feedSectorToLogicalCode,
  NODO_SUR_CIRCUITS,
  NODO_SUR_NODES,
  nodoSurCameraSequence,
  nodoSurCodeForEvent,
  nodoSurNodeForEvent,
} from './nodoSur'

describe('nodoSur — modelo de nodos como fuente única', () => {
  it('el módulo generado coincide con el modelo (correr node scripts/nodo-sur-sync.mjs)', () => {
    expect(NODO_SUR_NODES.map((n) => [n.id, n.code ?? '', n.hasCamera, n.devices.join(',')])).toEqual(
      model.nodes.map((n) => [n.id, n.code, n.hasCamera, n.devices.join(',')])
    )
    expect(NODO_SUR_CIRCUITS.map((c) => [c.id, c.nodes.join('>')])).toEqual(
      model.circuits.map((c) => [c.id, c.seq.join('>')])
    )
  })

  it('toda secuencia de circuito recorre nodos existentes', () => {
    const ids = new Set(NODO_SUR_NODES.map((n) => n.id))
    for (const c of NODO_SUR_CIRCUITS) for (const id of c.nodes) expect(ids.has(id), `${c.id}: ${id}`).toBe(true)
  })

  it('una cámara compartida entre nodos solo se comparte con el mismo código (S8 Silo Chief / Tolva)', () => {
    const seen = new Map<string, { id: string; code: string | null }>()
    for (const n of NODO_SUR_NODES) {
      for (const d of [...n.devices, ...n.rearDevices]) {
        const prev = seen.get(d)
        if (prev) expect(prev.code, `${d} en ${prev.id} y ${n.id}`).toBe(n.code)
        seen.set(d, { id: n.id, code: n.code })
      }
    }
    expect(nodoSurNodeForEvent({ sectorCode: '2-S8', deviceCode: 'RicS8CargaLinea2' })).toBeNull()
    expect(nodoSurCodeForEvent({ sectorCode: '', deviceCode: 'RicS8CargaLinea2' })).toBe('S8')
  })

  it('lee el sectorCode del feed', () => {
    expect(feedSectorToLogicalCode('2-S3')).toBe('S3')
    expect(feedSectorToLogicalCode('1-S10')).toBe('S10')
    expect(feedSectorToLogicalCode('RICARDONE_CALADA')).toBeNull()
  })

  it('la cámara resuelve el nodo aunque el código se comparta', () => {
    expect(nodoSurNodeForEvent({ sectorCode: '2-S4', deviceCode: 'RicB2Egreso' })?.id).toBe('ricardone:Balanza Egreso')
    expect(nodoSurNodeForEvent({ sectorCode: '2-S9', deviceCode: 'RicVolcable2' })?.id).toBe('ricardone:Volcable 2')
    expect(nodoSurNodeForEvent({ sectorCode: '2-S4', deviceCode: 'desconocida' })).toBeNull()
    expect(nodoSurNodeForEvent({ sectorCode: '1-S8', deviceCode: '' })?.id).toBe('san_lorenzo:Carga/Descarga Renova')
  })

  it('decisiones 29-09: Salida 1 sin cámara, Silo Chief S8, Playa OSL, R26–R32 por volcables, R35', () => {
    expect(NODO_SUR_NODES.find((n) => n.id === 'ricardone:Salida 1')?.hasCamera).toBe(false)
    expect(NODO_SUR_NODES.find((n) => n.id === 'ricardone:Volcable Silo Chief')?.code).toBe('S8')
    expect(NODO_SUR_NODES.some((n) => n.label === 'Playa volcables')).toBe(false)
    expect(nodoSurCameraSequence('R1')).toEqual(['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S4'])
    expect(nodoSurCameraSequence('R4')).toEqual(['S0', 'S1', 'S2', 'S4', 'S6', 'S8', 'S4'])
    for (const id of ['R7', 'R26', 'R27', 'R28', 'R29', 'R30', 'R31', 'R32']) {
      const c = NODO_SUR_CIRCUITS.find((x) => x.id === id)!
      expect(c.nodes.slice(-6), id).toEqual([
        'san_lorenzo:Ingreso',
        'san_lorenzo:Playa OSL',
        'san_lorenzo:Balanza Ingreso',
        'san_lorenzo:Plataformas Volcables',
        'san_lorenzo:Balanza Egreso',
        'san_lorenzo:Egreso',
      ])
      expect(c.nodes).toContain('ricardone:Salida 2')
    }
    const areas = Object.fromEntries(NODO_SUR_NODES.filter((n) => n.area).map((n) => [n.label, n.capacity]))
    expect(areas).toEqual({ 'Playa 1': 300, 'Playa demorado': 20, 'Playa 3': 100, 'Playa de salida': 4, 'Playa OSL': 150 })
    // Playa 1: todo circuito que pasa Preingreso → Calada espera ahí.
    for (const c of NODO_SUR_CIRCUITS) {
      const i = c.nodes.indexOf('ricardone:Pre ingreso')
      if (i >= 0) expect(c.nodes[i + 1], c.id).toBe('ricardone:Playa 1')
    }
    // Playa demorado es un desvío: no es paso de ningún circuito.
    expect(NODO_SUR_CIRCUITS.some((c) => c.nodes.includes('ricardone:Playa demorado'))).toBe(false)
    expect(nodoSurCameraSequence('R35')).toEqual(['S0', 'S1', 'S2', 'S3', 'S0', 'S1', 'S6', 'S5', 'S7'])
  })
})
