import type { Kpi5MultinivelInsight } from '../../lib/kpi5Multinivel.utils'

const fmtEntero = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

interface Kpi5MultinivelSummaryCardProps {
  productLabel: string
  toneladasAnomalas: number
  viajesValidos: number
  completos: number
  variaciones: number
  anomalos: number
  toneladasColor: string
  insight: Kpi5MultinivelInsight | null
}

export default function Kpi5MultinivelSummaryCard({
  productLabel,
  toneladasAnomalas,
  viajesValidos,
  completos,
  variaciones,
  anomalos,
  toneladasColor,
  insight,
}: Kpi5MultinivelSummaryCardProps) {
  return (
    <div className="flex h-full flex-col justify-center rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-7 py-8 shadow-inner">
      <p className="text-base font-bold text-slate-700">Anomalías en investigación</p>

      <div className="mt-5">
        <p className="text-xs font-medium text-slate-500">Producto:</p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{productLabel}</p>
      </div>

      <div className="mt-8">
        <p
          className="text-[1.65rem] font-bold leading-none tracking-tight sm:text-[1.85rem]"
          style={{ color: toneladasColor }}
        >
          {fmtEntero(toneladasAnomalas)}{' '}
          <span className="text-xl font-semibold sm:text-2xl">Toneladas</span>
        </p>
        <p className="mt-2 text-xs text-slate-500">Carga total en situación anómala</p>
      </div>

      <p className="mt-8 text-sm font-medium tabular-nums text-slate-800">
        {fmtEntero(viajesValidos)} viajes válidos
      </p>

      <div className="mt-4 space-y-1.5 text-xs text-slate-600">
        <p>
          <span className="text-slate-500">Completos:</span>{' '}
          <span className="font-medium tabular-nums text-slate-800">{fmtEntero(completos)}</span>
        </p>
        <p>
          <span className="text-slate-500">Variaciones operativas:</span>{' '}
          <span className="font-medium tabular-nums text-slate-800">{fmtEntero(variaciones)}</span>
        </p>
        <p>
          <span className="text-slate-500">Anómalos:</span>{' '}
          <span className="font-medium tabular-nums text-slate-800">{fmtEntero(anomalos)}</span>
        </p>
      </div>

      {insight && (
        <div className="mt-6 border-t border-slate-100 pt-4 text-[10px] leading-snug text-slate-500">
          {insight.kind === 'destino_frecuente' && insight.destinoNombre ? (
            <p>
              Destino más frecuente (completos):{' '}
              <span className="font-bold text-emerald-700">{insight.destinoNombre}</span>
            </p>
          ) : (
            <p>{insight.text}</p>
          )}
        </div>
      )}
    </div>
  )
}
