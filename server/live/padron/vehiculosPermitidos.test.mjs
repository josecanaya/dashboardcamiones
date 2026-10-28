import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildVehiculosPermitidos, categoryOf } from './vehiculosPermitidos.mjs'

const mov = (plate, cod, extra = {}) => ({ external_operation_id: `${plate}-${cod}-${Math.random()}`, plate_normalized: plate, patente_acoplado: '', cod_prod: cod, producto_original: '', external_ingreso_at: '2026-10-20T10:00:00', ...extra })

describe('vehiculosPermitidos', () => {
  it('categorías por código de producto', () => {
    expect(categoryOf('0780')).toBe('agua')
    expect(categoryOf('0872')).toBe('residuos')
    expect(categoryOf('0821')).toBe('biomasa')
    expect(categoryOf('0711')).toBe('insumos')
  })

  it('arma la lista sin granos ni derivados, con acoplados y el registro local', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'permitidos-'))
    mkdirSync(path.join(root, 'data', 'movimientos', '2026-10-20'), { recursive: true })
    mkdirSync(path.join(root, 'data', 'truck-registry'), { recursive: true })
    writeFileSync(path.join(root, 'data', 'movimientos', '2026-10-20', 'movimientos.json'), JSON.stringify([
      mov('SZG666', '0780'),
      mov('FEA810', '0872', { patente_acoplado: 'AC111BB' }),
      mov('AAA111', '0301'),
      mov('AAA222', '0235'),
      mov('BBB333', '9999', { observaciones: 'CTO PARA INGRESAR LOS CAMIONES Q SE EQUIVOCAN DE PTA' }),
      mov('XXXXXX', '0780'),
    ]))
    writeFileSync(path.join(root, 'data', 'truck-registry', 'registry.json'), JSON.stringify({ entries: [{ plate: 'AB367UR', category: 'vehiculo_particular', active: true }] }))
    const doc = await buildVehiculosPermitidos(root)
    const by = Object.fromEntries(doc.entries.map((e) => [e.plate, e]))
    expect(Object.keys(by).sort()).toEqual(['AB367UR', 'AC111BB', 'FEA810', 'SZG666'])
    expect(by.AC111BB).toMatchObject({ role: 'acoplado', chasis: 'FEA810', category: 'residuos' })
    expect(by.AB367UR.sources).toEqual(['registro'])
    expect(JSON.parse(readFileSync(path.join(root, 'data', 'padron', 'vehiculos-permitidos.json'), 'utf8')).entries).toHaveLength(4)
  })
})
