/** Un enlace de la barra lateral. */
export type NavLeaf = { to: string; label: string }
/** Un grupo de enlaces con título. */
export type NavSection = { title: string; items: NavLeaf[] }

/** Sectores del producto. Cada uno es una ruta por dominio. */
export const PRODUCT_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [{ to: '/inicio', label: 'Inicio' }],
  },
  {
    title: 'Datos',
    items: [
      { to: '/extraccion', label: 'Extracción' },
      { to: '/analisis-local', label: 'Análisis local' },
    ],
  },
  {
    title: 'Proceso',
    items: [{ to: '/transform', label: 'Transform' }],
  },
  {
    title: 'KPIs',
    items: [
      { to: '/kpi/tiempos', label: 'KPI tiempos' },
      { to: '/kpi/calada', label: 'Calada' },
      { to: '/kpi/descargas', label: 'Descargas' },
    ],
  },
  {
    title: 'Seguridad',
    items: [{ to: '/seguridad', label: 'Anomalías' }],
  },
  {
    title: 'Reportes',
    items: [
      { to: '/calibracion', label: 'Calibración cámaras' },
      { to: '/liquidos', label: 'Líquidos S10' },
      { to: '/transile-interno', label: 'Transile interno' },
      { to: '/transile-externo', label: 'Transile externo' },
      { to: '/base-datos', label: 'Base de datos' },
    ],
  },
]
