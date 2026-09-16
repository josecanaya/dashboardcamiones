import { describe, expect, it } from 'vitest'
import { LEGACY_ROUTE_REDIRECTS, PRODUCT_SECTIONS } from './sectors'

describe('acceso al resumen ejecutivo sin pantalla Transform', () => {
  const links = PRODUCT_SECTIONS.flatMap(section => [
    ...(section.items ?? []), ...(section.groups ?? []).flatMap(group => group.items),
  ])
  it('presenta un único informe ejecutivo y retira Transform de la navegación', () => {
    expect(links.filter(link => link.to === '/estadisticas/reportes/resumen')).toEqual([
      { to: '/estadisticas/reportes/resumen', label: 'Resumen ejecutivo' },
    ])
    expect(links.some(link => /transform/i.test(link.label) || link.to.endsWith('/transform'))).toBe(false)
  })
  it('mantiene ambos accesos antiguos como redirecciones directas al informe', () => {
    for (const from of ['/transform', '/estadisticas/datos/transform']) {
      expect(LEGACY_ROUTE_REDIRECTS.find(route => route.from === from)?.to).toBe('/estadisticas/reportes/resumen')
    }
    expect(LEGACY_ROUTE_REDIRECTS.some(route => route.from === '/estadisticas/reportes/resumen')).toBe(false)
  })
})

describe('flujo Datos único (R08)', () => {
  const links = PRODUCT_SECTIONS.flatMap(section => [
    ...(section.items ?? []), ...(section.groups ?? []).flatMap(group => group.items),
  ])
  it('deja un solo enlace Datos en la navegación', () => {
    const dataLinks = links.filter(l => l.to.startsWith('/estadisticas/datos'))
    expect(dataLinks).toEqual([{ to: '/estadisticas/datos', label: 'Datos' }])
  })
  it('no expone Extracción, Análisis local ni Transform como enlaces del sidebar', () => {
    expect(links.some(l => /extracci[oó]n|an[aá]lisis local|transform/i.test(l.label))).toBe(false)
    expect(links.some(l => /\/datos\/(extraccion|analisis-local|transform)$/.test(l.to))).toBe(false)
  })
  it('mapea las URLs viejas a Datos con vista=avanzada, sin bucles ni duplicados', () => {
    const redirectMap = new Map<string, string>()
    for (const r of LEGACY_ROUTE_REDIRECTS) {
      expect(redirectMap.has(r.from)).toBe(false)
      expect(r.from).not.toBe(r.to)
      redirectMap.set(r.from, r.to)
    }
    expect(redirectMap.get('/extraccion')).toBe('/estadisticas/datos?vista=extraccion-avanzada')
    expect(redirectMap.get('/analisis-local')).toBe('/estadisticas/datos?vista=analisis-avanzado')
    expect(redirectMap.get('/estadisticas/datos/extraccion')).toBe('/estadisticas/datos?vista=extraccion-avanzada')
    expect(redirectMap.get('/estadisticas/datos/analisis-local')).toBe('/estadisticas/datos?vista=analisis-avanzado')
  })
})
