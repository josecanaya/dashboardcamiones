import { useMemo } from 'react'
import type { HistoricalTrip } from '../domain/logistics'
import type { SiteId } from '../domain/sites'
import {
  getSaturationRangeMs,
  runSaturationAnalysis,
  type SaturationGranularity,
  type SaturationAnalysisResult,
} from '../services/saturationAnalytics'

export type SaturationPeriodPreset = 'last_day' | 'last_week' | 'last_month'

export function useSaturationAnalysis(
  trips: HistoricalTrip[],
  siteId: SiteId,
  refFecha: string,
  periodPreset: SaturationPeriodPreset,
  granularity: SaturationGranularity
): SaturationAnalysisResult | null {
  const refDateMs = new Date(refFecha + 'T12:00:00Z').getTime()
  const dayMs = 24 * 60 * 60 * 1000

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (t.siteId !== siteId) return false
      const fecha =
        t.fecha ??
        `${new Date(t.egresoAt).getUTCFullYear()}-${String(new Date(t.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(t.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs
      if (periodPreset === 'last_day') return fecha === refFecha
      if (periodPreset === 'last_week') return daysDiff >= 0 && daysDiff <= 6
      return daysDiff >= 0 && daysDiff <= 30
    })
  }, [trips, siteId, refFecha, refDateMs, dayMs, periodPreset])

  return useMemo(() => {
    const { rangeStartMs, rangeEndMs } = getSaturationRangeMs(refFecha, periodPreset)
    return runSaturationAnalysis({
      trips: filteredTrips,
      siteId,
      rangeStartMs,
      rangeEndMs,
      granularity,
    })
  }, [filteredTrips, siteId, refFecha, periodPreset, granularity])
}
