import { useMemo, useRef, type RefObject } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { RealJourneyEventDto } from '../../services/realJourneyEvents.types'
import type { RealTruckflowQueryParams } from '../../services/realTruckflowApi'
import {
  filterTruckflowPhysicalPresentationEvents,
  inferVolumeChartMode,
  buildVolumeSeries,
  groupingCode,
  buildLowVolumeInsight,
  distinctNonEmptyDevices,
  distinctNonEmptySectors,
  topEntry,
  toBarItems,
} from '../../services/truckflowEventosPresentation'
import { ExecutiveMetricCard } from './ExecutiveMetricCard'
import { HorizontalBarChart } from './HorizontalBarChart'
import { exportChartAsPng, safeExportFilename } from '../../utils/chartExport'

function formatDt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

function formatDateOnly(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

type Props = {
  eventsFromApi: RealJourneyEventDto[]
  apiQuery: RealTruckflowQueryParams
  loading: boolean
}

export function EventosTruckflowPresentation(props: Props) {
  const { eventsFromApi, apiQuery, loading } = props
  const slide1Ref = useRef<HTMLDivElement>(null)
  const slide2Ref = useRef<HTMLDivElement>(null)

  const physical = useMemo(() => filterTruckflowPhysicalPresentationEvents(eventsFromApi), [eventsFromApi])

  const metrics = useMemo(() => {
    if (!physical.length) {
      return {
        total: 0,
        firstAt: '',
        lastAt: '',
        periodRange: '—',
        devices: 0,
        sectors: 0,
        volumeMode: 'hour' as const,
        volumeSeries: [] as ReturnType<typeof buildVolumeSeries>,
        bySector: new Map<string, number>(),
        byDevice: new Map<string, number>(),
        lowInsight: buildLowVolumeInsight([]),
        topSector: null as ReturnType<typeof topEntry>,
        topDevice: null as ReturnType<typeof topEntry>,
      }
    }
    const sorted = [...physical].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    const firstAt = sorted[0]!.occurredAt
    const lastAt = sorted[sorted.length - 1]!.occurredAt
    const periodRange = `${formatDateOnly(firstAt)} — ${formatDateOnly(lastAt)}`
    const volumeMode = inferVolumeChartMode(physical)
    const volumeSeries = buildVolumeSeries(physical, volumeMode)
    const bySector = groupingCode(physical, 'sectorCode')
    const byDevice = groupingCode(physical, 'deviceCode')
    return {
      total: physical.length,
      firstAt,
      lastAt,
      periodRange,
      devices: distinctNonEmptyDevices(physical),
      sectors: distinctNonEmptySectors(physical),
      volumeMode,
      volumeSeries,
      bySector,
      byDevice,
      lowInsight: buildLowVolumeInsight(physical),
      topSector: topEntry(bySector),
      topDevice: topEntry(byDevice),
    }
  }, [physical])

  const chartData = useMemo(() => metrics.volumeSeries.map((r) => ({ label: r.label, eventos: r.count })), [metrics.volumeSeries])

  const sectorBarItems = useMemo(
    () =>
      toBarItems(metrics.bySector, 22).map((i) => ({
        ...i,
        colorClass: 'bg-sky-500',
      })),
    [metrics.bySector],
  )
  const deviceBarItems = useMemo(
    () =>
      toBarItems(metrics.byDevice, 22).map((i) => ({
        ...i,
        colorClass: 'bg-emerald-500',
      })),
    [metrics.byDevice],
  )

  const queryHint =
    apiQuery.startDate && apiQuery.endDate
      ? `Consulta API: ${apiQuery.startDate} → ${apiQuery.endDate}`
      : 'Pulse «Cargar eventos» para traer datos de /journey-event/list'
  const ricardoneHint = 'Alcance: sólo Ricardone (sectorCode RICARDONE_*; sin Puerto San Lorenzo ni otros sitios).'

  const lowVolSummary =
    metrics.lowInsight.lowDeviceCount + metrics.lowInsight.lowSectorCount === 0
      ? 'Ningún sector/cámara en el cuartil inferior (P25) del volumen observado.'
      : `${metrics.lowInsight.lowDeviceCount} cámara${metrics.lowInsight.lowDeviceCount === 1 ? '' : 's'} y ${metrics.lowInsight.lowSectorCount} sector${metrics.lowInsight.lowSectorCount === 1 ? '' : 'es'} en cuartil inferior de volumen (revisión sugerida).`

  async function exportSlide(ref: RefObject<HTMLDivElement | null>, basename: string) {
    await exportChartAsPng(ref.current, safeExportFilename(basename, 'png'), undefined, 2, {
      excludeExportHide: true,
    })
  }

  return (
    <div className="space-y-10">
      {loading ? <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-2 text-sm text-sky-900 export-hide">Cargando eventos…</div> : null}

      {/* Diapositiva 1 */}
      <div ref={slide1Ref} className="rounded-3xl border border-slate-200/90 bg-[#fafbfc] p-8 shadow-sm">
        <div className="export-hide mb-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void exportSlide(slide1Ref, 'truckflow_eventos_diapo1_volumen')}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Descargar PNG — diapo 1
          </button>
        </div>

        <div className="mb-8 border-b border-slate-100 pb-6">
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Eventos Truckflow | Volumen recibido</h3>
          <p className="mt-2 text-xs text-slate-500">{queryHint}</p>
          <p className="mt-1 text-[11px] text-slate-500">{ricardoneHint}</p>
        </div>

        {!physical.length && !loading ? (
          <p className="text-sm text-slate-600">Sin eventos físicos cargados para visualizar.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <ExecutiveMetricCard label="Total eventos físicos" value={metrics.total.toLocaleString()} accent="blue" />
              <ExecutiveMetricCard label="Primer evento" value={formatDt(metrics.firstAt)} accent="slate" />
              <ExecutiveMetricCard label="Último evento" value={formatDt(metrics.lastAt)} accent="slate" />
              <ExecutiveMetricCard label="Período observado" value={metrics.periodRange} accent="slate" />
              <ExecutiveMetricCard
                label="Cámaras con eventos"
                value={metrics.devices.toLocaleString()}
                sub={<span className="text-[10px]">deviceCode no vacío</span>}
              />
              <ExecutiveMetricCard
                label="Sectores con eventos"
                value={metrics.sectors.toLocaleString()}
                sub={<span className="text-[10px]">sectorCode no vacío</span>}
              />
            </div>

            <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {metrics.volumeMode === 'day' ? 'Eventos por día' : 'Eventos por hora (bucket local)'}
              </div>
              <div className="h-[240px] w-full mt-4">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 48, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#64748b', fontSize: metrics.volumeMode === 'hour' ? 9 : 11 }}
                        interval={metrics.volumeMode === 'hour' && chartData.length > 16 ? Math.ceil(chartData.length / 14) : 0}
                        angle={metrics.volumeMode === 'hour' ? -35 : 0}
                        textAnchor={metrics.volumeMode === 'hour' ? 'end' : 'middle'}
                        height={metrics.volumeMode === 'hour' ? 54 : 32}
                      />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} width={44} />
                      <Bar dataKey="eventos" fill="#38bdf8" radius={[5, 5, 0, 0]} maxBarSize={metrics.volumeMode === 'day' ? 48 : 14} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Sin serie temporal.</div>
                )}
              </div>
            </div>

            <p className="mt-8 max-w-4xl text-sm leading-relaxed text-slate-600">
              La plataforma ya recibe eventos físicos reales desde cámaras instaladas. El primer análisis permite validar volumen, período disponible y
              continuidad de captura.
            </p>
          </>
        )}
      </div>

      {/* Diapositiva 2 */}
      <div ref={slide2Ref} className="rounded-3xl border border-slate-200/90 bg-[#fafbfc] p-8 shadow-sm">
        <div className="export-hide mb-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void exportSlide(slide2Ref, 'truckflow_eventos_diapo2_cobertura')}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Descargar PNG — diapo 2
          </button>
        </div>

        <div className="mb-8 border-b border-slate-100 pb-6">
          <h3 className="text-xl font-bold tracking-tight text-slate-900">Eventos Truckflow | Cobertura por cámara y sector</h3>
          <p className="mt-2 text-xs text-slate-500">{queryHint}</p>
          <p className="mt-1 text-[11px] text-slate-500">{ricardoneHint}</p>
        </div>

        {!physical.length && !loading ? (
          <p className="text-sm text-slate-600">Sin eventos físicos cargados para visualizar.</p>
        ) : (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <ExecutiveMetricCard
                accent="blue"
                label="Cámara con mayor volumen"
                value={metrics.topDevice ? `${metrics.topDevice.count.toLocaleString()} evt.` : '—'}
                sub={<span className="font-mono text-[11px]">{metrics.topDevice?.key ?? '—'}</span>}
              />
              <ExecutiveMetricCard
                accent="blue"
                label="Sector con mayor volumen"
                value={metrics.topSector ? `${metrics.topSector.count.toLocaleString()} evt.` : '—'}
                sub={<span className="font-mono text-[11px]">{metrics.topSector?.key ?? '—'}</span>}
              />
              <ExecutiveMetricCard
                accent="amber"
                label="Bajo volumen / validación"
                value={
                  metrics.lowInsight.lowDeviceCount + metrics.lowInsight.lowSectorCount === 0
                    ? '—'
                    : `${metrics.lowInsight.lowDeviceCount} · ${metrics.lowInsight.lowSectorCount}`
                }
                sub={<span className="text-[11px] leading-snug text-slate-600">{lowVolSummary}</span>}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <HorizontalBarChart items={sectorBarItems} title="Eventos por sectorCode" />
              <HorizontalBarChart items={deviceBarItems} title="Eventos por deviceCode" />
            </div>

            {(metrics.bySector.size > 22 || metrics.byDevice.size > 22) && (
              <p className="mt-3 text-[11px] text-slate-500">Cada gráfico muestra hasta 22 códigos ordenados por volumen.</p>
            )}

            <p className="mt-8 max-w-4xl text-sm leading-relaxed text-slate-600">
              El análisis por sector y cámara permite identificar qué puntos ya aportan información consistente y cuáles requieren validación o ajuste.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
