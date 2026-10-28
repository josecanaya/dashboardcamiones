/** Un enlace de la barra lateral. */
export type NavLeaf = { to: string; label: string }
/** Subgrupo dentro de una sección. */
export type NavGroup = { title: string; items: NavLeaf[] }
/** Un grupo de enlaces con título; puede tener items planos o subgroups. */
export type NavSection = {
  title: string
  items?: NavLeaf[]
  groups?: NavGroup[]
}

/**
 * Sectores del producto. El análisis se hace con agentes sobre las corridas; la app
 * queda para operar en vivo, simular y preparar los datos (corridas + plano).
 */
export const PRODUCT_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'En vivo' },
      { to: '/simulacion', label: 'Simulación' },
      { to: '/datos', label: 'Datos' },
    ],
  },
]

/** Rutas viejas → nuevas (links guardados / bookmarks). Lo que no figura va a En vivo. */
export const LEGACY_ROUTE_REDIRECTS: { from: string; to: string }[] = [
  { from: '/inicio', to: '/' },
  { from: '/estadisticas/datos', to: '/datos' },
  { from: '/herramientas/editor-plano', to: '/datos?vista=plano' },
]
