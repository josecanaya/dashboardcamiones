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
