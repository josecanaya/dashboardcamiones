/** Un enlace de la barra lateral. */
export type NavLeaf = { to: string; label: string }
/** Subgrupo dentro de una sección (p. ej. Indicadores bajo Estadísticas). */
export type NavGroup = { title: string; items: NavLeaf[] }
/** Un grupo de enlaces con título; puede tener items planos o subgroups. */
export type NavSection = {
  title: string
  items?: NavLeaf[]
  groups?: NavGroup[]
}

/**
 * Sectores del producto. Las pantallas analíticas cuelgan de Estadísticas
 * (Indicadores / Reportes / Datos y proceso). Plant Home es el index.
 */
export const PRODUCT_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'En vivo' },
      { to: '/herramientas/editor-plano', label: 'Editar plano' },
    ],
  },
  {
    title: 'Estadísticas',
    groups: [
      {
        title: 'Indicadores',
        items: [
          { to: '/estadisticas/indicadores/tiempos', label: 'KPI tiempos' },
          { to: '/estadisticas/indicadores/calada', label: 'Calada' },
          { to: '/estadisticas/indicadores/descargas', label: 'Descargas' },
          { to: '/estadisticas/indicadores/anomalias', label: 'Anomalías' },
        ],
      },
      {
        title: 'Reportes',
        items: [
          { to: '/estadisticas/reportes/resumen', label: 'Resumen ejecutivo' },
          { to: '/estadisticas/reportes/calibracion', label: 'Calibración' },
          { to: '/estadisticas/reportes/liquidos', label: 'Líquidos S10' },
          { to: '/estadisticas/reportes/transile-interno', label: 'Transile interno' },
          { to: '/estadisticas/reportes/transile-externo', label: 'Transile externo' },
          { to: '/estadisticas/reportes/base-datos', label: 'Base de datos' },
        ],
      },
      {
        title: 'Datos',
        items: [
          { to: '/estadisticas/datos', label: 'Datos' },
        ],
      },
    ],
  },
]

/** Rutas viejas → nuevas (links guardados / bookmarks). */
export const LEGACY_ROUTE_REDIRECTS: { from: string; to: string }[] = [
  { from: '/inicio', to: '/' },
  { from: '/kpi/tiempos', to: '/estadisticas/indicadores/tiempos' },
  { from: '/kpi/calada', to: '/estadisticas/indicadores/calada' },
  { from: '/kpi/descargas', to: '/estadisticas/indicadores/descargas' },
  { from: '/seguridad', to: '/estadisticas/indicadores/anomalias' },
  { from: '/calibracion', to: '/estadisticas/reportes/calibracion' },
  { from: '/liquidos', to: '/estadisticas/reportes/liquidos' },
  { from: '/transile-interno', to: '/estadisticas/reportes/transile-interno' },
  { from: '/transile-externo', to: '/estadisticas/reportes/transile-externo' },
  { from: '/base-datos', to: '/estadisticas/reportes/base-datos' },
  { from: '/extraccion', to: '/estadisticas/datos?vista=extraccion-avanzada' },
  { from: '/analisis-local', to: '/estadisticas/datos?vista=analisis-avanzado' },
  { from: '/estadisticas/datos/extraccion', to: '/estadisticas/datos?vista=extraccion-avanzada' },
  { from: '/estadisticas/datos/analisis-local', to: '/estadisticas/datos?vista=analisis-avanzado' },
  { from: '/transform', to: '/estadisticas/reportes/resumen' },
  { from: '/estadisticas/datos/transform', to: '/estadisticas/reportes/resumen' },
]
