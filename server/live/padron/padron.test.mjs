/**
 * Tests del padrón del día: sentido de cada carta, índice por chasis y acoplado, foto y versión.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { arDay, createPadron, NODO_SUR_LOCALITY, shiftDay, VICENTIN_CUIT } from './padron.mjs'
import { normalizeNote } from './cartasSource.mjs'

const today = arDay()
const turno = day => `VIC123456${day.slice(8, 10)}${day.slice(5, 7)}${day.slice(2, 4)}`
const raw = (ctg, plates, { origin = '30000000000', originLoc = 1, dest = VICENTIN_CUIT, destLoc = NODO_SUR_LOCALITY, day = today } = {}) => ({
  ctg, arca_state_code: 'AC',
  departure_time: { $date: `${day}T12:00:00.000Z` },
  origin: { cuit: origin, locality_code: originLoc, plant: { $numberLong: '0' } },
  destination: { cuit: dest, locality_code: destLoc, plant: { $numberLong: '25567' } },
  transport: { plates, turn_code: turno(day), distance_km: 300 },
  load: { grain_code: 23 },
})

const silent = { info() {}, warn() {} }
const dirs = []
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }) })

function setup(notes) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'padron-'))
  dirs.push(root)
  let pending = notes
  const source = { kind: 'test', describe: () => 'test', fetchChanges: async () => { const n = pending; pending = null; return n && { full: true, notes: n.map(normalizeNote) } } }
  return { root, source, padron: createPadron({ projectRoot: root, source, syncMs: 3_600_000, log: silent }) }
}

describe('padrón del día', () => {
  it('clasifica externos, transiles internos y salidas; ignora lo que no es del Nodo Sur', async () => {
    const { padron } = setup([
      raw('1', ['AB123CD', 'XY987ZW']),
      raw('2', ['TRA001'], { origin: VICENTIN_CUIT, originLoc: NODO_SUR_LOCALITY }),
      raw('3', ['SAL001'], { origin: VICENTIN_CUIT, originLoc: NODO_SUR_LOCALITY, dest: '30111111111', destLoc: 5 }),
      raw('4', ['AVE001'], { destLoc: 15312 }),
    ])
    await padron.sync()
    expect(padron.byCtg('1').direction).toBe('entra')
    expect(padron.byCtg('2').direction).toBe('interno')
    expect(padron.byCtg('3').direction).toBe('sale')
    expect(padron.byCtg('4')).toBeNull()
    expect(padron.status().counts).toEqual({ entra: 1, interno: 1, sale: 1 })
  })

  it('encuentra por chasis o acoplado, con la patente escrita de cualquier forma', async () => {
    const { padron } = setup([raw('1', ['AB123CD', 'XY987ZW'])])
    await padron.sync()
    expect(padron.lookup('ab-123 cd').map(n => n.ctg)).toEqual(['1'])
    expect(padron.lookup('XY987ZW').map(n => n.ctg)).toEqual(['1'])
    expect(padron.lookup('ZZ000ZZ')).toEqual([])
  })

  it('deja afuera los turnos fuera de la ventana', async () => {
    const { padron } = setup([raw('viejo', ['OLD001'], { day: shiftDay(today, -30) }), raw('hoy', ['NEW001'])])
    await padron.sync()
    expect(padron.byCtg('viejo')).toBeNull()
    expect(padron.byCtg('hoy')).not.toBeNull()
  })

  it('sube la versión solo si cambió algo y un padrón nuevo arranca de la foto', async () => {
    const { root, source, padron } = setup([raw('1', ['AB123CD'])])
    expect(await padron.sync()).toBe(true)
    expect(await padron.sync()).toBe(false)
    expect(padron.status().version).toBe(1)
    const restarted = createPadron({ projectRoot: root, source, syncMs: 3_600_000, log: silent })
    restarted.start()
    restarted.stop()
    expect(restarted.lookup('AB123CD').map(n => n.ctg)).toEqual(['1'])
    expect(restarted.status().version).toBe(1)
  })
})
