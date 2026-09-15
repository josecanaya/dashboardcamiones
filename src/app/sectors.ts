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
    items: [{ to: '/', label: 'En vivo' }],
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
          { to: '/estadisticas/reportes/calibracion', label: 'Calibración' },
          { to: '/estadisticas/reportes/liquidos', label: 'Líquidos S10' },
          { to: '/estadisticas/reportes/transile-interno', label: 'Transile interno' },
          { to: '/estadisticas/reportes/transile-externo', label: 'Transile externo' },
          { to: '/estadisticas/reportes/base-datos', label: 'Base de datos' },
        ],
      },
      {
        title: 'Datos y proceso',
        items: [
          { to: '/estadisticas/datos/extraccion', label: 'Extracción' },
          { to: '/estadisticas/datos/analisis-local', label: 'Análisis local' },
          { to: '/estadisticas/datos/transform', label: 'Transform ETL' },
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
  { from: '/extraccion', to: '/estadisticas/datos/extraccion' },
  { from: '/analisis-local', to: '/estadisticas/datos/analisis-local' },
  { from: '/transform', to: '/estadisticas/datos/transform' },
]
