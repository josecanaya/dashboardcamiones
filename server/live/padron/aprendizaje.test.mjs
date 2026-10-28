import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCorregidos, buildNoCamiones, createAprendizaje, kindOf } from './aprendizaje.mjs'

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aprendizaje-'))
  mkdirSync(path.join(root, 'data', 'padron'), { recursive: true })
  const log = [
    { site: 'ricardone', fragmentKey: 'a', action: 'confirm', plate: 'JLQ557', readPlate: 'JLO557', deviceCode: 'RicCal03', decidedAt: '2026-10-20T10:00:00Z' },
    { site: 'ricardone', fragmentKey: 'b', action: 'confirm', plate: 'JLQ557', readPlate: 'JLO557', deviceCode: 'RicCal03', decidedAt: '2026-10-21T10:00:00Z' },
    // Confirmada y después limpiada: no enseña nada.
    { site: 'ricardone', fragmentKey: 'c', action: 'confirm', plate: 'AAA111', readPlate: 'AAA11', decidedAt: '2026-10-21T10:00:00Z' },
    { site: 'ricardone', fragmentKey: 'c', action: 'clear', decidedAt: '2026-10-21T11:00:00Z' },
    // Del algoritmo: nadie la verificó.
    { site: 'ricardone', fragmentKey: 'd', action: 'confirm', plate: 'BBB222', readPlate: 'BBB22', source: 'automatic_algorithm', decidedAt: '2026-10-21T10:00:00Z' },
    { site: 'ricardone', fragmentKey: 'e', action: 'confirm', plate: 'OJD501', readPlate: 'OJD501', decidedAt: '2026-10-22T10:00:00Z' },
    { site: 'ricardone', fragmentKey: 'f', action: 'confirm', plate: 'OJO501', readPlate: 'OJD501', decidedAt: '2026-10-22T10:00:00Z' },
    { site: 'san_lorenzo', fragmentKey: 'g', action: 'reject', source: 'automatic_relevance', relevance: { capture: { plate: 'AB220CD', vehicleCategory: 'Bus' } }, decidedAt: '2026-10-22T10:00:00Z' },
    { site: 'san_lorenzo', fragmentKey: 'h', action: 'reject', readPlate: 'ZZZ999', reason: 'No es un vehículo (falsa detección)', decidedAt: '2026-10-22T10:00:00Z' },
    { site: 'san_lorenzo', fragmentKey: 'i', action: 'reject', source: 'automatic_relevance', relevance: { capture: { plate: 'TRK123', vehicleCategory: 'Pickup' } }, decidedAt: '2026-10-22T10:00:00Z' },
  ]
  writeFileSync(path.join(root, 'data', 'plate-identification-log.jsonl'), log.map((l) => JSON.stringify(l)).join('\n'))
  writeFileSync(path.join(root, 'data', 'plant-state-manual-overrides.json'), JSON.stringify({ ricardone: { '924KHA': { action: 'remove', reason: 'Tractor o maquinaria', updatedAt: '2026-10-10T10:00:00Z' } } }))
  // TRK123 tiene movimientos de balanza: es un camión aunque una vez lo hayan descartado.
  writeFileSync(path.join(root, 'data', 'padron', 'vehiculos-permitidos.json'), JSON.stringify({ entries: [{ plate: 'TRK123', category: 'insumos' }] }))
  // Veredictos de la IA: una máquina y el caso «a» (JLO557), donde la IA dijo lo mismo que operaciones.
  mkdirSync(path.join(root, 'data', 'vision'), { recursive: true })
  writeFileSync(path.join(root, 'data', 'vision', 'veredictos.jsonl'), [
    { site: 'san_lorenzo', fragmentKey: 'm', readPlate: 'KOV00', vehicleType: 'maquinaria', plate: null, at: '2026-10-28T18:37:31Z' },
    { site: 'ricardone', fragmentKey: 'a', readPlate: 'JLO557', plate: null, seenPlate: 'JLQ557', at: '2026-10-20T09:00:00Z' },
    { site: 'ricardone', fragmentKey: 'b', readPlate: 'JLO557', plate: 'XXX999', at: '2026-10-21T09:00:00Z' },
  ].map((v) => JSON.stringify(v)).join('\n'))
  return root
}

describe('aprendizaje de operaciones', () => {
  it('corregidos: solo decisiones vigentes de operaciones, con la cámara', () => {
    const c = buildCorregidos(fixture())
    expect(c.pairs.find((x) => x.read === 'JLO557')).toMatchObject({ real: 'JLQ557', count: 2, devices: { RicCal03: 2 } })
    expect(c.pairs.some((x) => x.read === 'AAA11' || x.read === 'BBB22')).toBe(false)
    expect(c.real.map((r) => r.plate)).toEqual(['OJD501'])
    expect(c.pairs.find((x) => x.read === 'OJD501').readIsReal).toBe(true)
  })

  it('no camiones: quitas con motivo y descartes por tipo; sin falsas detecciones ni camiones de balanza', () => {
    const n = buildNoCamiones(fixture())
    expect(n.entries.find((e) => e.plate === '924KHA').kind).toBe('tractor_maquinaria')
    expect(n.entries.find((e) => e.plate === 'AB220CD').kind).toBe('colectivo')
    expect(n.entries.some((e) => e.plate === 'ZZZ999' || e.plate === 'TRK123')).toBe(false)
  })

  it('índices: un par donde la leída también es real no corrige', async () => {
    const a = createAprendizaje({ projectRoot: fixture(), log: {} })
    await a.rebuild()
    expect(a.corregidos.realOf('JLO557')[0].real).toBe('JLQ557')
    expect(a.corregidos.realOf('OJD501')).toEqual([])
    expect(a.corregidos.isReal('OJD501')).toBe(true)
    expect(a.noCamiones.lookup('924-KHA').kind).toBe('tractor_maquinaria')
  })

  it('la IA: sus máquinas van a no camiones y se mide contra operaciones', () => {
    const root = fixture()
    expect(buildNoCamiones(root).entries.find((e) => e.plate === 'KOV00')).toMatchObject({ kind: 'tractor_maquinaria', sources: { ia: 1 } })
    const c = buildCorregidos(root)
    expect(c.ia).toEqual({ confirmadas: 1, corregidas: 1 })
    expect(c.pairs.find((p) => p.read === 'JLO557')).toMatchObject({ confirmaIa: 1, corrigeIa: 1 })
  })

  it('tipo por motivo o categoría', () => {
    expect(kindOf('Auto particular / camioneta')).toBe('liviano')
    expect(kindOf('Medium Bus')).toBe('colectivo')
    expect(kindOf('Vehículo de servicio (agua, comida, prestadores)')).toBe('servicio')
    expect(kindOf('Large Truck')).toBeNull()
  })
})
