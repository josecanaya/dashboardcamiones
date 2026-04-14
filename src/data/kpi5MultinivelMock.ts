import type { Kpi5MultinivelView } from '../lib/kpi5Multinivel.utils'

/** Datos de ejemplo para demos / pruebas del donut multinivel KPI 5. */
export const MOCK_KPI5_MULTINIVEL_VIEW: Kpi5MultinivelView = {
  totalRecorridos: 1080,
  totalValidos: 1000,
  totalAnomalos: 80,
  validados: 820,
  variaciones: 180,
  anomalousByProduct: [
    { product: 'Maíz', count: 32, color: '#5C2A24' },
    { product: 'Soja', count: 28, color: '#7A3A32' },
    { product: 'Girasol', count: 20, color: '#955045' },
  ],
  completosByDestino: [
    { destino: 'Celda 16', count: 260, color: '#C5E3C3' },
    { destino: 'Silos Kepler', count: 210, color: '#9DC99A' },
    { destino: 'Silos CHIEF', count: 180, color: '#6FA06E' },
    { destino: 'Silo Australiano', count: 170, color: '#356A3A' },
  ],
  insight: {
    kind: 'destino_frecuente',
    text: 'Destino más frecuente (completos): Celda 16',
    destinoNombre: 'Celda 16',
  },
}
