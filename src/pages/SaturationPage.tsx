/**
 * Vista ejecutiva: episodios de saturación por sector, heatmap y contexto operativo.
 */

import { useMemo, useRef, useState } from 'react'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { useHistoricalPageData } from '../hooks/useHistoricalPageData'
import { useSaturationAnalysis, type SaturationPeriodPreset } from '../hooks/useSaturationAnalysis'
import type { SaturationGranularity } from '../services/saturationAnalytics'
import { getSectorCapacityByPlant, hasSectorCapacityData } from '../config/sectorCapacityByPlant'
import { getSectorDisplayName } from '../config/sectorDisplayNames'
import type { SectorSaturationSummary } from '../services/saturationAnalytics'
import { ChartExportButtons } from '../components/charts/ChartExportButtons'
import { SaturationExecutiveHeader } from '../components/saturation/SaturationExecutiveHeader'
import { SaturationSummaryCards } from '../components/saturation/SaturationSummaryCards'
import { SaturationOccupancyChart } from '../components/saturation/SaturationOccupancyChart'
import { SaturationWeekOccupancyLines } from '../components/saturation/SaturationWeekOccupancyLines'
import { SectorSaturationSummaryTable } from '../components/saturation/SectorSaturationSummaryTable'

export interface SaturationPageProps {
  siteId: SiteId
  onChangeSite: (id: SiteId) => void
}

function sectorSummaryCsvRow(siteId: SiteId, s: SectorSaturationSummary): Record<string, unknown> {
  const cap = getSectorCapacityByPlant(siteId)?.[s.sectorId]
  return {
    sector: s.sectorId,
    nombre_funcion: getSectorDisplayName(siteId, s.sectorId),
    capacidad_maxima: cap ?? '',
    franja_critica: s.criticalBandLabel,
    max_exceso: s.maxExcess,
    estado: s.status,
  }
}

export function SaturationPage({ siteId, onChangeSite }: SaturationPageProps) {
  const { historicalTrips } = useLogisticsOps()
  const [periodPreset, setPeriodPreset] = useState<SaturationPeriodPreset>('last_week')
  const [granularity, setGranularity] = useState<SaturationGranularity>('hour')
  const panelRef = useRef<HTMLDivElement>(null)
  const sectoresSaturadosRef = useRef<HTMLDivElement>(null)

  const effectiveView = periodPreset === 'last_day' ? 'day' : periodPreset === 'last_week' ? 'week' : 'month'
  const { effectiveDate, refData } = useHistoricalPageData({
    historicalTrips,
    siteId,
    effectiveView,
    periodPreset,
    drilledWeek: null,
    drilledDay: null,
    selectedDate: '',
    query: '',
  })

  const refFecha = refData?.refFecha ?? effectiveDate
  const analysis = useSaturationAnalysis(historicalTrips, siteId, refFecha, periodPreset, granularity)

  const plantName = SITES.find((s) => s.id === siteId)?.name ?? siteId

  const filteredTripsForPanel = useMemo(() => {
    if (!analysis) return []
    const { rangeStartMs, rangeEndMs } = analysis
    return historicalTrips.filter((t) => {
      if (t.siteId !== siteId) return false
      const t1 = new Date(t.egresoAt).getTime()
      const t0 = new Date(t.ingresoAt).getTime()
      return t1 > rangeStartMs && t0 < rangeEndMs
    })
  }, [historicalTrips, siteId, analysis])

  const collapsedSectors = useMemo(() => {
    if (!analysis) return []
    return analysis.summaries.filter((s) => s.episodeCount > 0).map((s) => s.sectorId)
  }, [analysis])

  const csvExport = useMemo(() => {
    if (!analysis) return []
    const rows: Record<string, unknown>[] = []
    for (const s of analysis.summaries) {
      rows.push(sectorSummaryCsvRow(siteId, s))
    }
    for (const c of analysis.heatmapCells) {
      rows.push({
        tipo: 'celda',
        sector: c.sectorId,
        bucket: c.bucketIndex,
        ocupacion: c.occupancy,
        capacidad: c.capacity ?? '',
        utilizacion_pct: c.utilization != null ? Math.round(c.utilization * 100) : '',
        banda: c.band,
      })
    }
    return rows
  }, [analysis, siteId])

  if (!hasSectorCapacityData(siteId)) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-medium">Sin datos de capacidad por sector</p>
        <p className="mt-1 text-sm">Avellaneda no tiene referencias de densidad (DENSIDAD CAMARAS). Elegí Ricardone o San Lorenzo.</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white"
            onClick={() => onChangeSite('ricardone')}
          >
            Ricardone
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white"
            onClick={() => onChangeSite('san_lorenzo')}
          >
            San Lorenzo
          </button>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        No hay datos en el período seleccionado.
      </div>
    )
  }

  return (
    <ChartExportButtons
      fullPanelRef={panelRef}
      fullExportFilename="saturacion_panel"
      filenamePrefix="saturacion"
      csvData={csvExport}
      meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
      title="Saturación por sector"
      size="xs"
    >
      <div ref={panelRef} className="relative mx-auto max-w-[1600px] space-y-4 pb-8 pt-8">
        <SaturationExecutiveHeader
          siteId={siteId}
          onSiteChange={onChangeSite}
          periodPreset={periodPreset}
          onPeriodChange={setPeriodPreset}
          granularity={granularity}
          onGranularityChange={setGranularity}
        />

        <SaturationSummaryCards result={analysis} />

        {/* Central: Episodios de saturación en el tiempo */}
        <ChartExportButtons
          filenamePrefix="saturacion_episodios_tiempo"
          csvData={csvExport}
          meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
          title="Episodios de saturación en el tiempo"
        >
          <SaturationWeekOccupancyLines result={analysis} />
        </ChartExportButtons>

        {/* Sectores saturados: ocupación vs capacidad solo para los que colapsaron — exportables todos juntos */}
        {collapsedSectors.length > 0 && (
          <ChartExportButtons
            fullPanelRef={sectoresSaturadosRef}
            fullExportFilename="saturacion_sectores_saturados"
            filenamePrefix="saturacion_sectores_saturados"
            csvData={analysis.summaries.filter((s) => s.episodeCount > 0).map((s) => sectorSummaryCsvRow(siteId, s))}
            meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
            title="Sectores saturados"
          >
            <div ref={sectoresSaturadosRef} className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">Sectores saturados</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {collapsedSectors.map((sectorId) => (
                  <SaturationOccupancyChart
                    key={sectorId}
                    siteId={siteId}
                    sectorId={sectorId}
                    result={analysis}
                    granularity={granularity}
                    trips={filteredTripsForPanel}
                    height={180}
                  />
                ))}
              </div>
            </div>
          </ChartExportButtons>
        )}

        {/* Tabla resumen — exportable por separado */}
        <ChartExportButtons
          filenamePrefix="saturacion_tabla_resumen"
          csvData={analysis.summaries.map((s) => sectorSummaryCsvRow(siteId, s))}
          meta={{ plant: plantName, period: `${effectiveView} ${effectiveDate}` }}
          title="Resumen por sector"
        >
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Resumen por sector</h3>
            <SectorSaturationSummaryTable
              siteId={siteId}
              summaries={analysis.summaries}
              selectedSectorId={null}
              onSelectSector={() => {}}
            />
          </div>
        </ChartExportButtons>
      </div>
    </ChartExportButtons>
  )
}
