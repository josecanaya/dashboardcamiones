import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAlertStore, isAlert, layerTrail } from './alertStore.mjs'

const item = (extra = {}) => ({ fragmentKey: 'f1', readPlate: 'TGO035', validFormat: true, node: 'S2', nodeLabel: 'Calada', deviceCode: 'RicCal03', at: '2026-10-29T13:00:00.000Z', level: 'provisorio', rule: null, candidates: [{ plate: 'TSO035', similarity: 0.83 }], ...extra })

describe('alertas', () => {
  it('es alerta lo abierto tras la corrección y lo que no figura en ningún registro; no la base de no camiones ni lo decidido', () => {
    expect(isAlert(item())).toBe(true)
    expect(isAlert(item({ level: 'fuera_sistema', rule: 'fuera_sistema' }))).toBe(true)
    expect(isAlert(item({ level: 'fuera_sistema', rule: 'no_camion' }))).toBe(false)
    expect(isAlert(item({ level: 'casi_seguro', rule: 'cuenta', assignedPlate: 'TSO035' }))).toBe(false)
    expect(isAlert(item({ decision: { action: 'confirm', plate: 'TSO035' } }))).toBe(false)
  })

  it('el paso por cada capa queda escrito', () => {
    const t = layerTrail(item({ ia: { plate: null, confidence: 0.9, seenPlate: 'TSO035', patenteVista: { texto: 'la IA lee TSO035: figura en carta de porte 1023' } } }))
    expect(t.capa2).toContain('no figura en Vehículos Permitidos ni en una carta')
    expect(t.algoritmo).toContain('TSO035 (83 %)')
    expect(t.ia).toContain('lee TSO035 (figura en carta de porte 1023)')
  })

  it('se guarda por día y queda como resuelta cuando una capa la identifica', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'alertas-'))
    const store = createAlertStore({ projectRoot: root, log: {} })
    expect(store.update('ricardone', [item()], '2026-10-29T13:01:00Z')).toBe(1)
    expect(store.list('ricardone', '2026-10-29')).toMatchObject({ open: 1, resolved: 0 })
    store.update('ricardone', [item({ level: 'casi_seguro', rule: 'ia_imagen', assignedPlate: 'TSO035' })], '2026-10-29T13:05:00Z')
    const r = store.list('ricardone', '2026-10-29')
    expect(r).toMatchObject({ open: 0, resolved: 1 })
    expect(r.alertas[0].resolved).toMatchObject({ by: 'ia_imagen', plate: 'TSO035' })
    const disk = JSON.parse(readFileSync(path.join(root, 'data', 'alertas', '2026-10-29.json'), 'utf8'))
    expect(disk.alertas).toHaveLength(1)
  })
})
