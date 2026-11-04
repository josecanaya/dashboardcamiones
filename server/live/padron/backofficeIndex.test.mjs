import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBackofficeIndex, entradasBackoffice } from './backofficeIndex.mjs'
import { createVehiculosPermitidos } from './vehiculosPermitidos.mjs'

const col = (docs) => ({ find: () => ({ toArray: async () => docs }) })

describe('bases del back office en la capa 2', () => {
  it('un acoplado aceptado se lee como su chasis y la categoría sale de la base', () => {
    const e = entradasBackoffice('sin_carta', [
      { _id: 'AB123CD', rol: 'chasis', categoria: 'carga', decision: { estado: 'si', categoria: null } },
      { _id: 'AC999ZZ', rol: 'acoplado', categoria: 'carga', balanza: { pares: [{ patente: 'AB123CD', viajes: 9 }] }, decision: { estado: 'si' } },
    ])
    expect(e.get('AB123CD')).toMatchObject({ role: 'chasis', category: 'despacho' })
    expect(e.get('AC999ZZ')).toMatchObject({ role: 'acoplado', chasis: 'AB123CD' })
    expect(entradasBackoffice('particulares', [{ _id: 'OCB815', decision: { categoria: 'camion' } }]).get('OCB815').category).toBe('servicio')
  })

  it('Vehículos Permitidos los encuentra antes que la balanza; los de granos rechazados quedan marcados', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'backoffice-'))
    mkdirSync(path.join(root, 'data', 'padron'), { recursive: true })
    writeFileSync(path.join(root, 'data', 'padron', 'backoffice-descartados.json'), JSON.stringify({ entries: [{ base: 'particulares', patente: 'OAV421', motivo: 'camion_granos' }] }))
    writeFileSync(path.join(root, 'data', 'padron', 'vehiculos-permitidos.json'), JSON.stringify({ builtAt: new Date().toISOString(), entries: [{ plate: 'SZG666', role: 'chasis', category: 'agua' }] }))
    const padronDb = {
      particulares: { vehiculos: col([{ _id: 'SZG666', decision: { categoria: 'agua' } }, { _id: 'IMH787', decision: { categoria: 'particular' } }]) },
      sin_carta: { vehiculos: col([{ _id: 'RUK692', rol: 'chasis', categoria: 'descarga', decision: {} }]) },
    }
    const bo = createBackofficeIndex({ padronDb, projectRoot: root, log: {} })
    await bo.start()
    const vp = createVehiculosPermitidos({ projectRoot: root, backoffice: bo, log: {} })
    vp.start()
    expect(vp.lookup('IMH787')).toMatchObject({ category: 'particular', sources: ['backoffice'] })
    expect(vp.lookup('RUK692').category).toBe('descarga_sin_carta')
    expect(vp.lookup('SZG666').sources).toEqual(['backoffice'])
    expect(vp.lookup('OAV421')).toBeNull()
    expect(bo.esCamionDeGranos('OAV421')).toBe(true)
  })
})
