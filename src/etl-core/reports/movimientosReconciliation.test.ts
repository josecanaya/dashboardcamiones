import { describe, it, expect } from 'vitest'
import { reconcileMovimientos, movimientosReconciliationCsv, type ReconEntry } from './movimientosReconciliation'

const e = (plate: string, id: string): ReconEntry => ({ plate_normalized: plate, external_operation_id: id })

describe('reconcileMovimientos', () => {
  it('sano: emitido ≤ cargado por patente, sin fantasmas ni cross-patente', () => {
    const loaded = [e('AAA111', 'C1'), e('AAA111', 'C2'), e('BBB222', 'C3')]
    const emitted = [e('AAA111', 'C1'), e('BBB222', 'C3')] // cámaras perdieron C2
    const r = reconcileMovimientos(loaded, emitted)
    expect(r.ok).toBe(true)
    expect(r.violations).toHaveLength(0)
    expect(r.totalLoaded).toBe(3)
    expect(r.totalEmitted).toBe(2)
  })

  it('detecta violación: una patente emite más de lo cargado', () => {
    const loaded = [e('AAA111', 'C1')]
    const emitted = [e('AAA111', 'C1'), e('AAA111', 'C1-dup')]
    const r = reconcileMovimientos(loaded, emitted)
    expect(r.ok).toBe(false)
    expect(r.violations).toEqual([{ plate: 'AAA111', loaded: 1, emitted: 2, diff: 1 }])
  })

  it('detecta id fantasma emitido que no está en lo cargado', () => {
    const loaded = [e('AAA111', 'C1')]
    const emitted = [e('AAA111', 'C1'), e('AAA111', 'PHANTOM')]
    const r = reconcileMovimientos(loaded, emitted)
    expect(r.phantomEmittedIds).toContain('PHANTOM')
    expect(r.ok).toBe(false)
  })

  it('detecta id asignado a más de una patente (misasignación)', () => {
    const loaded = [e('AAA111', 'C1'), e('BBB222', 'C1')]
    const emitted = [e('AAA111', 'C1'), e('BBB222', 'C1')]
    const r = reconcileMovimientos(loaded, emitted)
    expect(r.crossPlateIds).toEqual([{ external_operation_id: 'C1', plates: ['AAA111', 'BBB222'] }])
    expect(r.ok).toBe(false)
  })

  it('filtro por rubro se aplica a ambos lados', () => {
    const loaded = [e('AAA111', 'ACEITE_1'), e('AAA111', 'GRANO_1')]
    const emitted = [e('AAA111', 'ACEITE_1'), e('AAA111', 'GRANO_1')]
    const soloAceite = (x: ReconEntry) => x.external_operation_id.startsWith('ACEITE')
    const r = reconcileMovimientos(loaded, emitted, soloAceite)
    expect(r.totalLoaded).toBe(1)
    expect(r.totalEmitted).toBe(1)
    expect(r.ok).toBe(true)
  })

  it('CSV lista violaciones primero con flag', () => {
    const loaded = [e('AAA111', 'C1'), e('BBB222', 'C2')]
    const emitted = [e('AAA111', 'C1'), e('AAA111', 'X'), e('BBB222', 'C2')]
    const csv = movimientosReconciliationCsv(reconcileMovimientos(loaded, emitted))
    const rows = csv.trim().split('\n')
    expect(rows[0]).toBe('plate,loaded,emitted,diff,flag')
    expect(rows[1]).toContain('AAA111,1,2,1,VIOLACION')
  })
})
