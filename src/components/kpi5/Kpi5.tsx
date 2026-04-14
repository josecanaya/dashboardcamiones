import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { HistoricalTrip } from '../../domain/logistics'
import { getSite, type SiteId } from '../../domain/sites'
import {
  KPI5_PRODUCT_FILTER_TODOS,
  KPI5_SEGURIDAD_CHART_COLORS,
  KPI5_TONELADAS_POR_CAMION_ANOMALO,
  buildKpi5ProductFilterOptions,
  computeKpi5SecurityView,
} from '../../lib/kpi5.utils'
import { computeKpi5MultinivelView } from '../../lib/kpi5Multinivel.utils'
import { exportChartAsPng, safeExportFilename } from '../../utils/chartExport'
import Kpi5MultinivelDonut from './Kpi5MultinivelDonut'
import Kpi5MultinivelSummaryCard from './Kpi5MultinivelSummaryCard'

const OUTER = 108
const INNER = 56

const fmtEnteroEs = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

function productLabel(filter: string): string {
  return filter === KPI5_PRODUCT_FILTER_TODOS ? 'Todos los productos' : filter
}

interface Kpi5Props {
  siteId: SiteId
  trips: HistoricalTrip[]
  periodLabel: string
}

export default function Kpi5({ siteId, trips, periodLabel }: Kpi5Props) {
  const plantLabel = getSite(siteId)?.name ?? siteId
  const exportRef = useRef<HTMLDivElement>(null)
  const exportMultinivelRef = useRef<HTMLDivElement>(null)

  const productOptions = useMemo(() => buildKpi5ProductFilterOptions(trips), [trips])
  const [productFilter, setProductFilter] = useState(KPI5_PRODUCT_FILTER_TODOS)

  useEffect(() => {
    if (!productOptions.includes(productFilter)) {
      setProductFilter(KPI5_PRODUCT_FILTER_TODOS)
    }
  }, [productOptions, productFilter])

  const security = useMemo(
    () =>
      computeKpi5SecurityView(
        trips,
        productOptions.includes(productFilter) ? productFilter : KPI5_PRODUCT_FILTER_TODOS,
        KPI5_TONELADAS_POR_CAMION_ANOMALO
      ),
    [trips, productFilter, productOptions]
  )

  const pieTotal = useMemo(
    () => security.clasificacionPie.reduce((s, d) => s + d.value, 0),
    [security.clasificacionPie]
  )

  const resolvedProductFilter = productOptions.includes(productFilter)
    ? productFilter
    : KPI5_PRODUCT_FILTER_TODOS

  const productoNombre = productLabel(resolvedProductFilter)
  const colorAnomalias = KPI5_SEGURIDAD_CHART_COLORS.anomalos

  const multinivel = useMemo(
    () => computeKpi5MultinivelView(trips, resolvedProductFilter, siteId),
    [trips, resolvedProductFilter, siteId]
  )

  const metaExport = useCallback(
    (title: string) => ({
      title,
      plant: plantLabel,
      period: periodLabel,
      generatedAt: new Date().toLocaleString('es-AR'),
    }),
    [plantLabel, periodLabel]
  )

  const handleExportPng = useCallback(async () => {
    await exportChartAsPng(
      exportRef.current,
      safeExportFilename(`kpi5_seguridad_${siteId}`, 'png'),
      metaExport("KPI's de seguridad — anomalías y caminos"),
      2
    )
  }, [siteId, metaExport])

  const handleExportMultinivelPng = useCallback(async () => {
    await exportChartAsPng(
      exportMultinivelRef.current,
      safeExportFilename(`kpi5_multinivel_${siteId}`, 'png'),
      metaExport('KPI 5 — validez y operación'),
      2
    )
  }, [siteId, metaExport])

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExportPng}
          className="rounded-full border border-slate-200/90 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
        >
          Exportar PNG
        </button>
      </div>

      <div
        ref={exportRef}
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]"
      >
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            KPI 5 · {plantLabel} · {periodLabel}
          </p>
          <div role="tablist" aria-label="Producto" className="mt-4 flex flex-wrap gap-1.5">
            {productOptions.map((p) => {
              const active = p === resolvedProductFilter
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setProductFilter(p)}
                  className={
                    active
                      ? 'rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm'
                      : 'rounded-lg border border-transparent px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                  }
                >
                  {p}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-0 p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-start md:divide-x md:divide-slate-200">
          <div className="flex min-h-[280px] flex-col items-center justify-center border-b border-slate-200 pb-8 md:border-b-0 md:pb-0 md:pr-10 lg:pr-14">
            {pieTotal === 0 ? (
              <p className="text-center text-sm text-slate-400">Sin datos en el período.</p>
            ) : (
              <div className="flex w-full max-w-[300px] flex-col items-center">
                <div className="relative h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={security.clasificacionPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={INNER}
                        outerRadius={OUTER}
                        paddingAngle={2}
                        stroke="#ffffff"
                        strokeWidth={2}
                        cornerRadius={4}
                        isAnimationActive
                      >
                        {security.clasificacionPie.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                          fontSize: 12,
                        }}
                        formatter={(value: number | undefined) =>
                          value != null ? [`${fmtEnteroEs(value)}`, 'Recorridos'] : ['', '']
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="max-w-[9rem] text-center text-lg font-semibold tracking-tight text-slate-700">
                      {productoNombre}
                    </span>
                  </div>
                </div>
                <ul className="mt-4 w-full max-w-[320px] space-y-1.5 text-left text-[11px] leading-snug text-slate-600">
                  <li className="flex gap-2">
                    <span
                      className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: KPI5_SEGURIDAD_CHART_COLORS.completos }}
                      aria-hidden
                    />
                    <span>
                      Circuitos completo:{' '}
                      <span className="font-semibold tabular-nums text-slate-800">
                        {fmtEnteroEs(security.viajesCompletos)}
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span
                      className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: KPI5_SEGURIDAD_CHART_COLORS.variaciones }}
                      aria-hidden
                    />
                    <span>
                      Variaciones operativas:{' '}
                      <span className="font-semibold tabular-nums text-slate-800">
                        {fmtEnteroEs(security.viajesVariaciones)}
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span
                      className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: KPI5_SEGURIDAD_CHART_COLORS.anomalos }}
                      aria-hidden
                    />
                    <span>
                      Anomalías:{' '}
                      <span className="font-semibold tabular-nums text-slate-800">
                        {fmtEnteroEs(security.viajesAnomalos)}
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center pt-8 md:pt-0 md:pl-10 lg:pl-14">
            <div className="space-y-6">
              <p className="text-base font-bold text-slate-700">Anomalías en investigación:</p>

              <div>
                <p className="text-sm text-slate-500">Producto:</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{productoNombre}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Carga total en situación anómala:</p>
                <p
                  className="mt-2 text-3xl font-bold tracking-tight sm:text-[2rem]"
                  style={{ color: colorAnomalias }}
                >
                  {fmtEnteroEs(security.toneladasAnomalas)}{' '}
                  <span className="text-2xl font-bold sm:text-[1.65rem]">Toneladas</span>
                </p>
              </div>

              <div className="mt-6 space-y-1.5 text-xs text-slate-500">
                <p>
                  <span className="text-slate-500">Completos:</span>{' '}
                  <span className="font-medium tabular-nums text-slate-700">
                    {fmtEnteroEs(security.viajesCompletos)} camiones
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Variaciones operativas:</span>{' '}
                  <span className="font-medium tabular-nums text-slate-700">
                    {fmtEnteroEs(security.viajesVariaciones)} camiones
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={exportMultinivelRef}
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]"
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              KPI 5 · Validez y operación · {plantLabel} · {periodLabel}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Misma lógica multinivel; lectura ejecutiva con foco en carga anómala y desglose a la
              izquierda.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportMultinivelPng}
            className="shrink-0 self-start rounded-full border border-slate-200/90 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 sm:self-center"
          >
            Exportar PNG
          </button>
        </div>
        <div className="grid gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] lg:items-start lg:gap-12">
          <div className="min-w-0 border-slate-100 pb-2 lg:border-r lg:pr-10 lg:pt-2">
            <Kpi5MultinivelDonut data={multinivel} viewSize={208} />
          </div>
          <Kpi5MultinivelSummaryCard
            productLabel={productoNombre}
            toneladasAnomalas={security.toneladasAnomalas}
            viajesValidos={security.viajesCompletos + security.viajesVariaciones}
            completos={security.viajesCompletos}
            variaciones={security.viajesVariaciones}
            anomalos={security.viajesAnomalos}
            toneladasColor={colorAnomalias}
            insight={multinivel.insight}
          />
        </div>
      </div>
    </div>
  )
}
