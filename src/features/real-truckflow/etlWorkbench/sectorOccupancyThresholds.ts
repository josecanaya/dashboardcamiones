/** Umbral operativo por sector/tramo (camiones). Vacío = sin línea en gráfico. */
export type SectorOccupancyThresholdKey = {
  circuito: string
  sector: string
}

const DEFAULT_THRESHOLDS: Record<string, number> = {
  'R1|ingreso → preingreso': 25,
  'R1|preingreso → calada': 20,
  'R1|calada → balanza ingreso': 15,
  'R1|balanza ingreso → balanza egreso': 12,
  'R7|balanza SL → balanza egreso SL': 18,
  'SL1|ingreso → balanza SL': 22,
}

function normKey(circuito: string, sector: string): string {
  return `${String(circuito).trim().toUpperCase()}|${String(sector).trim().toLowerCase()}`
}

export function getSectorOccupancyThreshold(circuito: string, sector: string): number | null {
  const k = normKey(circuito, sector)
  for (const [pattern, v] of Object.entries(DEFAULT_THRESHOLDS)) {
    if (normKey(pattern.split('|')[0]!, pattern.split('|')[1]!) === k) return v
  }
  const loose = Object.entries(DEFAULT_THRESHOLDS).find(([p]) =>
    p.toLowerCase().startsWith(`${circuito.toLowerCase()}|`)
  )
  if (loose && sector.toLowerCase().includes('balanza')) return loose[1]
  return null
}
