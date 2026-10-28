import { describe, expect, it } from 'vitest'
import { LEGACY_ROUTE_REDIRECTS, PRODUCT_SECTIONS } from './sectors'

const links = PRODUCT_SECTIONS.flatMap(section => [
  ...(section.items ?? []), ...(section.groups ?? []).flatMap(group => group.items),
])

describe('navegación', () => {
  it('deja solo En vivo, Simulación y Datos', () => {
    expect(links).toEqual([
      { to: '/', label: 'En vivo' },
      { to: '/simulacion', label: 'Simulación' },
      { to: '/datos', label: 'Datos' },
    ])
  })
  it('el editor del plano vive dentro de Datos', () => {
    expect(LEGACY_ROUTE_REDIRECTS.find(r => r.from === '/herramientas/editor-plano')?.to).toBe('/datos?vista=plano')
  })
  it('redirecciones sin bucles ni duplicados', () => {
    const seen = new Set<string>()
    for (const r of LEGACY_ROUTE_REDIRECTS) {
      expect(seen.has(r.from)).toBe(false)
      expect(r.from).not.toBe(r.to)
      seen.add(r.from)
    }
  })
})
