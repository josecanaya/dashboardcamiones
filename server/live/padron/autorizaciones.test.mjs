import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAutorizaciones, validar } from './autorizaciones.mjs'
import { createVehiculosPermitidos } from './vehiculosPermitidos.mjs'

const memoria = () => {
  let guardado = []
  return { load: () => guardado, save: (l) => { guardado = l } }
}

describe('autorizaciones', () => {
  it('valida perfil, tipo y acceso', () => {
    expect(validar({ perfil: 'porteria', patente: 'ab 123 cd', acceso: 'ingreso' }).ok).toMatchObject({ patente: 'AB123CD', tipo: 'particular' })
    expect(validar({ perfil: 'porteria', patente: 'AB123CD' }).error).toBe('acceso inválido')
    for (const p of ['ABC123', 'AB123CD', '123ABC', 'A123BCD']) expect(validar({ perfil: 'porteria', patente: p, acceso: 'ingreso' }).ok).toBeTruthy()
    for (const p of ['ASDASDAS4', 'AB12CD', 'ABC1D23']) expect(validar({ perfil: 'porteria', patente: p, acceso: 'ingreso' }).error).toBe('patente inválida')
    expect(validar({ perfil: 'porteria', patente: 'ABC1D23', acceso: 'ingreso', extranjera: true }).ok.extranjera).toBe(true)
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', acoplado: 'XX', codProducto: '0887' }).error).toBe('patente de acoplado inválida')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', tipo: 'contratista' }).error).toMatch(/tipo/)
    expect(validar({ perfil: 'sin_carta', patente: 'AB123CD' }).error).toBe('perfil inválido')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', tipo: 'descarga', codProducto: '0711' }).ok.producto).toBe('METANOL')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', tipo: 'carga', codProducto: '0711' }).error).toBe('producto fuera de la lista')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', producto: 'cualquier cosa' }).error).toBe('producto fuera de la lista')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', codProducto: 'otros' }).error).toMatch(/aclarar/)
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', codProducto: 'otros', producto: 'Repuestos' }).ok.producto).toBe('Repuestos')
    expect(validar({ perfil: 'comercial', patente: 'AB123CD', codProducto: '0887', desde: '2026-11-03', hasta: '2026-11-01' }).error).toBe('fechas inválidas')
  })

  it('solo la vigente cuenta como Vehículo Permitido, chasis y acoplado', () => {
    const a = createAutorizaciones({ store: memoria() })
    a.crear({ perfil: 'comercial', tipo: 'descarga', codProducto: '0711', patente: 'AB123CD', acoplado: 'AC999ZZ', desde: '2026-11-02', hasta: '2026-11-04' }, 'ana')
    expect(a.lookup('AB123CD', '2026-11-03')).toMatchObject({ role: 'chasis', category: 'descarga_sin_carta' })
    expect(a.lookup('AC999ZZ', '2026-11-03')).toMatchObject({ role: 'acoplado', chasis: 'AB123CD' })
    expect(a.lookup('AB123CD', '2026-11-05')).toBeNull()
    const { ok } = a.crear({ perfil: 'porteria', acceso: 'zona_operativa', patente: 'AA111BB', desde: '2026-11-02', hasta: '2026-11-02' }, 'ana')
    a.anular(ok.id, 'beto')
    expect(a.lookup('AA111BB', '2026-11-02')).toBeNull()
    expect(a.get(ok.id).historial.map((h) => h.accion)).toEqual(['alta', 'anulada'])
  })

  it('el reconocedor la ve antes que la balanza', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'autoriz-'))
    mkdirSync(path.join(root, 'data', 'padron'), { recursive: true })
    writeFileSync(path.join(root, 'data', 'padron', 'vehiculos-permitidos.json'), JSON.stringify({ builtAt: new Date().toISOString(), entries: [{ plate: 'SZG666', role: 'chasis', category: 'agua' }] }))
    const aut = createAutorizaciones({ store: memoria() })
    aut.crear({ perfil: 'comercial', patente: 'SZG666', codProducto: '0887' }, 'ana')
    const vp = createVehiculosPermitidos({ projectRoot: root, autorizaciones: aut, log: {} })
    vp.start()
    expect(vp.lookup('SZG666').category).toBe('despacho')
    expect(vp.historico('SZG666').category).toBe('agua')
  })
})
