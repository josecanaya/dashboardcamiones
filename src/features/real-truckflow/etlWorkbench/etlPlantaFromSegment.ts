/**
 * Inferencia de planta a partir del tramo (función pura, sin dependencias).
 *
 * Vive en un módulo leaf para cortar el ciclo
 * `etlSectorOccupancy30min ↔ etlSegmentScatterByDay`: el scatter solo necesitaba esta
 * función, mientras que la ocupación necesita el tipo de fila del scatter.
 *
 * `etlSectorOccupancy30min` la re-exporta para no romper imports existentes.
 */
export function inferPlantaFromSegment(circuito: string, segmentFrom: string): string {
  const from = String(segmentFrom ?? '').trim()
  if (from.startsWith('SL_')) return 'SAN_LORENZO'
  if (circuito === 'SL1' || circuito === 'R7') {
    return from.startsWith('SL_') ? 'SAN_LORENZO' : 'RICARDONE'
  }
  return 'RICARDONE'
}
