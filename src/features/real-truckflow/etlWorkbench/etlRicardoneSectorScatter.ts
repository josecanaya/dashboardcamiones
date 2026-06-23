/**
 * KPI dispersión por sectores Ricardone compartidos entre circuitos (no filtro por R*).
 */

import { computeStayTimeStats, type StayTimeStats } from '../../../services/analyticsKpi'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'
import { isWithinSegmentScatterDisplayMax } from './etlSegmentScatterByDay'
import { formatTransitionLabel, type SegmentLeg, type SegmentTimingIndex } from './etlSegmentTiming'
import { productMatchesExecutiveSampleFilter, PRODUCT_FILTER_ALL } from './etlProductFilter'

export type RicardoneCrossCircuitSector = {
  id: string
  fromCode: string
  toCode: string
  label: string
  description: string
}

/** Tramos Ricardone comunes a muchos circuitos ejecutivos. */
export const RICARDONE_CROSS_CIRCUIT_SECTORS: readonly RicardoneCrossCircuitSector[] = [
  {
    id: 'preingreso_calada',
    fromCode: 'PREINGRESO',
    toCode: 'CALADA',
    label: formatTransitionLabel('PREINGRESO', 'CALADA'),
    description:
      'Sector calada: desde preingreso hasta calada Ricardone. Aplica a R1, R5, R6, R7, R3, R4, etc.',
  },
  {
    id: 'balanza_estadia',
    fromCode: 'BALANZA_INGRESO',
    toCode: 'BALANZA_EGRESO',
    label: formatTransitionLabel('BALANZA_INGRESO', 'BALANZA_EGRESO'),
    description:
      'Estadía en balanza Ricardone (ingreso → egreso). Compartida por recepciones y rutas que pasan por balanza antes de plataforma o egreso.',
  },
] as const

export function filterScatterByDayForSector(
  rows: SegmentScatterByDayRow[],
  fromCode: string,
  toCode: string,
  productFilter?: string
): SegmentScatterByDayRow[] {
  const from = String(fromCode).trim()
  const to = String(toCode).trim()
  return rows.filter((r) => {
    if (r.segment_from !== from || r.segment_to !== to) return false
    if (productFilter && productFilter !== PRODUCT_FILTER_ALL) {
      if (!productMatchesExecutiveSampleFilter(r.producto, productFilter)) return false
    }
    return (
      isWithinSegmentScatterDisplayMax(r.duracion_minutos) &&
      Number.isFinite(r.duracion_minutos) &&
      r.duracion_minutos > 0
    )
  })
}

export function legsForCrossCircuitSector(
  index: Pick<SegmentTimingIndex, 'legs'> | null | undefined,
  fromCode: string,
  toCode: string
): SegmentLeg[] {
  if (!index?.legs?.length) return []
  return index.legs.filter((l) => l.fromCode === fromCode && l.toCode === toCode)
}

export type CrossCircuitSectorSummary = {
  sector: RicardoneCrossCircuitSector
  operationCount: number
  uniquePatentes: number
  circuitBreakdown: Array<{ circuito: string; count: number }>
  stats: StayTimeStats
  durationsMinutes: number[]
}

export function summarizeCrossCircuitSectorFromScatter(
  allRows: SegmentScatterByDayRow[],
  sector: RicardoneCrossCircuitSector,
  productFilter?: string
): CrossCircuitSectorSummary {
  const rows = filterScatterByDayForSector(
    allRows,
    sector.fromCode,
    sector.toCode,
    productFilter
  )
  const durationsMinutes = rows.map((r) => r.duracion_minutos)
  const byCircuit = new Map<string, number>()
  const plates = new Set<string>()
  const journeys = new Set<string>()
  for (const r of rows) {
    const c = String(r.circuito ?? '').trim() || '—'
    byCircuit.set(c, (byCircuit.get(c) ?? 0) + 1)
    if (r.patente) plates.add(r.patente)
    if (r.journey_id) journeys.add(r.journey_id)
  }
  const circuitBreakdown = [...byCircuit.entries()]
    .map(([circuito, count]) => ({ circuito, count }))
    .sort((a, b) => b.count - a.count)

  return {
    sector,
    operationCount: journeys.size || rows.length,
    uniquePatentes: plates.size,
    circuitBreakdown,
    stats: computeStayTimeStats(durationsMinutes),
    durationsMinutes,
  }
}
