import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Kpi5MultinivelArcSlice, Kpi5MultinivelView } from '../../lib/kpi5Multinivel.utils'
import {
  KPI5_MULTINIVEL_COLORS,
  buildKpi5MultinivelArcSlices,
  kpi5MultinivelAnnularPath,
} from '../../lib/kpi5Multinivel.utils'
import { KPI5_SEGURIDAD_CHART_COLORS } from '../../lib/kpi5.utils'

const fmtEntero = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(n)

const DEFAULT_VIEW = 208

function LegendRow({
  swatch,
  label,
  value,
  labelClassName,
}: {
  swatch: string
  label: ReactNode
  value: number | string
  /** Destino más frecuente u otro énfasis */
  labelClassName?: string
}) {
  const valStr = typeof value === 'number' ? fmtEntero(value) : value
  return (
    <li className="flex items-center gap-2.5 py-0.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]"
        style={{ backgroundColor: swatch }}
        aria-hidden
      />
      <span
        className={['min-w-0 flex-1 leading-snug text-slate-600', labelClassName].filter(Boolean).join(' ')}
      >
        {label}
      </span>
      <span className="shrink-0 tabular-nums font-semibold text-slate-800">{valStr}</span>
    </li>
  )
}

function strokeForRing(ring: Kpi5MultinivelArcSlice['ring']): number {
  if (ring === 'principal') return 1.75
  if (ring === 'destino_completo') return 1.3
  if (ring === 'validacion') return 1.65
  return 1.55
}

interface Kpi5MultinivelDonutProps {
  data: Kpi5MultinivelView
  /** @deprecated El centro del donut queda vacío (sin etiqueta) */
  centerLabel?: string
  viewSize?: number
}

export default function Kpi5MultinivelDonut({ data, viewSize = DEFAULT_VIEW }: Kpi5MultinivelDonutProps) {
  const cx = viewSize / 2
  const cy = viewSize / 2
  const wrapRef = useRef<HTMLDivElement>(null)

  const slices = useMemo(() => buildKpi5MultinivelArcSlices(viewSize, data), [data, viewSize])

  const [hover, setHover] = useState<{
    slice: Kpi5MultinivelArcSlice
    index: number
    x: number
    y: number
  } | null>(null)

  const clearHover = useCallback(() => setHover(null), [])

  const onPathMove = useCallback(
    (slice: Kpi5MultinivelArcSlice, index: number, clientX: number, clientY: number) => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setHover({ slice, index, x: clientX - r.left + 12, y: clientY - r.top + 12 })
    },
    []
  )

  if (data.totalRecorridos <= 0) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-10">
        <p className="text-center text-sm text-slate-500">Sin recorridos para este filtro.</p>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative flex w-full min-w-0 flex-col gap-6">
      <svg
        width="100%"
        height="auto"
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="mx-auto max-w-[min(100%,260px)] shrink-0 select-none self-center"
        role="img"
        aria-label="Donut multinivel: válidos, anómalos por producto y completos por destino"
      >
        <title>
          Distribución de recorridos: anómalos por producto, válidos por variaciones y completos, y
          destinos en completos
        </title>
        {slices.map((s, i) => (
          <path
            key={`${s.ring}-${i}-${s.a0.toFixed(4)}`}
            d={kpi5MultinivelAnnularPath(cx, cy, s.rInner, s.rOuter, s.a0, s.a1)}
            fill={s.color}
            stroke="#ffffff"
            strokeWidth={strokeForRing(s.ring)}
            strokeLinejoin="round"
            className="cursor-default transition-opacity duration-150"
            style={{ opacity: hover && hover.index !== i ? 0.48 : 1 }}
            onMouseEnter={(e) => onPathMove(s, i, e.clientX, e.clientY)}
            onMouseMove={(e) => onPathMove(s, i, e.clientX, e.clientY)}
            onMouseLeave={clearHover}
          />
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-2 text-[11px] text-slate-700 shadow-md backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y }}
        >
          <p className="font-semibold text-slate-800">{hover.slice.tipoLabel}</p>
          <p className="mt-0.5 text-slate-600">{hover.slice.detalleLabel}</p>
          <p className="mt-1 tabular-nums text-slate-700">
            Cantidad: <span className="font-medium">{fmtEntero(hover.slice.cantidad)}</span>
          </p>
          <p className="tabular-nums text-slate-600">
            Sobre total correspondiente:{' '}
            <span className="font-medium">{fmtPct(hover.slice.pctPadre)}%</span>
          </p>
        </div>
      )}

      <div
        className="w-full rounded-xl border border-slate-100/90 bg-white px-4 py-3.5 text-[11px] leading-snug text-slate-600 shadow-sm sm:px-5"
        aria-label="Leyenda compacta"
      >
        <div className="grid w-full grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 sm:items-start">
          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-2 font-semibold text-slate-800">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: KPI5_MULTINIVEL_COLORS.ring1.anomalos }}
                aria-hidden
              />
              Anómalos
            </p>
            <ul className="list-none space-y-1 pl-0">
              {data.anomalousByProduct.length === 0 ? (
                <LegendRow
                  swatch={KPI5_MULTINIVEL_COLORS.ring1.anomalos}
                  label="Sin desglose por producto"
                  value="—"
                />
              ) : (
                data.anomalousByProduct.map((p) => (
                  <LegendRow key={p.product} swatch={p.color} label={p.product} value={p.count} />
                ))
              )}
            </ul>
          </div>

          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-2 font-semibold text-slate-800">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: KPI5_MULTINIVEL_COLORS.ring1.validos }}
                aria-hidden
              />
              Válidos
            </p>
            <ul className="list-none space-y-1 pl-0">
              <LegendRow
                swatch={KPI5_SEGURIDAD_CHART_COLORS.variaciones}
                label="Variaciones operativas"
                value={data.variaciones}
              />
              <LegendRow
                swatch={KPI5_SEGURIDAD_CHART_COLORS.completos}
                label="Completos"
                value={data.validados}
              />
              {data.completosByDestino.length > 0 && (
                <ul className="mt-1.5 list-none space-y-1 border-l border-slate-200/80 pl-3">
                  {data.completosByDestino.map((d, idx) => (
                    <LegendRow
                      key={d.destino}
                      swatch={d.color}
                      label={d.destino}
                      value={d.count}
                      labelClassName={idx === 0 ? 'font-bold text-emerald-700' : undefined}
                    />
                  ))}
                </ul>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
