/**
 * Fuente única de datos para la página Histórico Operacional.
 *
 * ORIGEN: /mock-data/live/{planta}/historico_recorridos.json
 * - ricardone: /mock-data/live/ricardone/historico_recorridos.json
 * - san_lorenzo: /mock-data/live/san_lorenzo/historico_recorridos.json
 * - avellaneda: /mock-data/live/avellaneda/historico_recorridos.json
 *
 * Los datos se cargan vía LogisticsOpsContext -> loadLogisticsSnapshot -> getHistoricalTrips
 * y se filtran por planta (siteId), vista (día/semana/mes) y período.
 */

import { useMemo } from 'react'
import type { SiteId } from '../domain/sites'
import type { HistoricalTrip } from '../domain/logistics'

export type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

export type EffectiveView = 'day' | 'week' | 'month'

interface UseHistoricalPageDataParams {
  historicalTrips: HistoricalTrip[]
  siteId: SiteId
  effectiveView: EffectiveView
  periodPreset: PeriodPreset
  drilledWeek: number | null
  drilledDay: number | null
  selectedDate: string
  query: string
}

export function useHistoricalPageData({
  historicalTrips,
  siteId,
  effectiveView,
  periodPreset,
  drilledWeek,
  drilledDay,
  selectedDate,
  query,
}: UseHistoricalPageDataParams) {
  const refData = useMemo(() => {
    const siteTrips = historicalTrips.filter((trip) => trip.siteId === siteId)
    const maxEgreso = siteTrips.length > 0
      ? Math.max(...siteTrips.map((t) => new Date(t.egresoAt).getTime()))
      : Date.now()
    const refDate = new Date(maxEgreso)
    const refFecha = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, '0')}-${String(refDate.getUTCDate()).padStart(2, '0')}`
    return { maxEgreso, refDate, refFecha }
  }, [historicalTrips, siteId])

  const effectiveDate = selectedDate || refData.refFecha

  const rows = useMemo(() => {
    const siteTrips = historicalTrips.filter((trip) => trip.siteId === siteId)
    const dayMs = 24 * 60 * 60 * 1000
    const [selY, selM] = effectiveDate.split('-').map(Number)
    const selDateMs = new Date(effectiveDate + 'T12:00:00Z').getTime()
    const monthEndMs = new Date(selY, selM, 0).getTime()

    const passesFilter = (trip: (typeof siteTrips)[0]) => {
      const fecha = trip.fecha ?? `${new Date(trip.egresoAt).getUTCFullYear()}-${String(new Date(trip.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(trip.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (selDateMs - tripDateMs) / dayMs
      const daysDiffFromMonthEnd = (monthEndMs - tripDateMs) / dayMs

      if (effectiveView === 'day') {
        if (periodPreset === 'last_day') return fecha === effectiveDate
        if (periodPreset === 'last_week' && drilledDay) {
          return daysDiff >= drilledDay - 1 && daysDiff < drilledDay
        }
        if (periodPreset === 'last_month' && drilledWeek !== null && drilledDay !== null) {
          const weekStart = (4 - drilledWeek) * 7
          return daysDiffFromMonthEnd >= weekStart + drilledDay - 1 && daysDiffFromMonthEnd < weekStart + drilledDay
        }
        return fecha === effectiveDate
      }
      if (effectiveView === 'week') {
        if (periodPreset === 'last_month' && drilledWeek !== null) {
          const weekStart = (4 - drilledWeek) * 7
          return daysDiffFromMonthEnd >= weekStart && daysDiffFromMonthEnd < weekStart + 7
        }
        return daysDiff >= 0 && daysDiff <= 6
      }
      const [tripY, tripM] = fecha.split('-').map(Number)
      return tripY === selY && tripM === selM
    }

    return siteTrips
      .filter(passesFilter)
      .filter((trip) => !query || trip.plate.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => new Date(b.egresoAt).getTime() - new Date(a.egresoAt).getTime())
  }, [historicalTrips, siteId, effectiveView, periodPreset, drilledWeek, drilledDay, query, effectiveDate])

  const enrichedRows = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      catalogCode: row.catalogCode ?? row.circuitoFinal,
      catalogName: row.catalogName ?? 'Sin catálogo',
      cir: row.cir ?? 'N/A',
      vue: row.vue ?? 'N/A',
      descripcion: row.descripcion ?? 'Sin descripción disponible',
    }))
  }, [rows])

  return { rows, enrichedRows, refData, effectiveDate }
}
