import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { useExecutiveProductBreakdown } from '../etlWorkbench/useExecutiveProductBreakdown'
import {
  EXECUTIVE_SAMPLE_PRODUCTS,
  executiveSampleProductLabel,
} from '../etlWorkbench/etlProductFilter'
import {
  COMMITTEE_PIE_SLICE_ANOMALIAS,
  COMMITTEE_PIE_SLICE_COMPLETOS,
  COMMITTEE_PIE_SLICE_VARIACIONES,
} from '../etlWorkbench/etlCircuitClassificationIndex'
import { EXECUTIVE_CIRCUIT_MATRIX } from '../etlWorkbench/finalCircuitScoring'
import { CIRCUIT_CATALOG } from '../../../etl-core/domain/circuitCatalog'

/**
 * Transform por producto: mismo universo canónico que Inicio y la pestaña Transform
 * ({@link useExecutiveProductBreakdown}). Se filtra la clasificación a los recorridos del producto
 * y se muestran métricas de flujo, la clasificación ejecutiva (comité) y los circuitos del producto.
 * El detalle de anomalías vive en la (futura) pestaña Seguridad.
 */

const ACCENT: Record<string, { text: string; bg: string; bar: string; ring: string; grad: string }> = {
  SOJA: { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', ring: 'ring-emerald-200', grad: 'from-emerald-500' },
  GIRASOL: { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', ring: 'ring-amber-200', grad: 'from-amber-500' },
  ACEITE: { text: 'text-orange-600', bg: 'bg-orange-50', bar: 'bg-orange-500', ring: 'ring-orange-200', grad: 'from-orange-500' },
  PELLET: { text: 'text-sky-600', bg: 'bg-sky-50', bar: 'bg-sky-500', ring: 'ring-sky-200', grad: 'from-sky-500' },
}
const FALLBACK = { text: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500', ring: 'ring-violet-200', grad: 'from-violet-500' }

const BUCKET_LABELS = [
  { key: COMMITTEE_PIE_SLICE_COMPLETOS, color: 'bg-emerald-500', text: 'text-emerald-700' },
  { key: COMMITTEE_PIE_SLICE_VARIACIONES, color: 'bg-sky-500', text: 'text-sky-700' },
  { key: COMMITTEE_PIE_SLICE_ANOMALIAS, color: 'bg-rose-500', text: 'text-rose-700' },
]

function fmt(n: number): string {
  return n.toLocaleString('es-AR')
}

function circuitLabel(code: string): string {
  return EXECUTIVE_CIRCUIT_MATRIX[code]?.label ?? CIRCUIT_CATALOG[code]?.label ?? code
}

export function ProductoTransformTab() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult
  const breakdown = useExecutiveProductBreakdown(tr)

  const bucket = String(id ?? '').toUpperCase()
  const isValid = (EXECUTIVE_SAMPLE_PRODUCTS as readonly string[]).includes(bucket)
  const label = executiveSampleProductLabel(bucket)
  const a = ACCENT[bucket] ?? FALLBACK

  /** Recorridos del producto (mismo universo que el chip de la pestaña Transform). */
  const productEntries = useMemo(() => {
    const ids = breakdown.plan?.journeyIdsByProduct.get(bucket)
    if (!ids) return []
    return breakdown.index.entries.filter((e) => ids.has(e.journeyId))
  }, [breakdown.plan, breakdown.index, bucket])

  const bucketCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of productEntries) {
      const b = String(e.pieSliceLabel ?? '').trim() || '—'
      m.set(b, (m.get(b) ?? 0) + 1)
    }
    return m
  }, [productEntries])

  const circuits = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of productEntries) {
      const c = String(e.executiveCircuitCode ?? '').trim()
      if (!c) continue
      m.set(c, (m.get(c) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([code, count]) => ({ code, count, label: circuitLabel(code) }))
      .sort((x, y) => y.count - x.count)
  }, [productEntries])

  const total = productEntries.length
  const completos = bucketCounts.get(COMMITTEE_PIE_SLICE_COMPLETOS) ?? 0
  const anomalias = bucketCounts.get(COMMITTEE_PIE_SLICE_ANOMALIAS) ?? 0
  const completosPct = total ? Math.round((completos / total) * 100) : 0
  const share = breakdown.conProducto ? Math.round((total / breakdown.conProducto) * 100) : 0
  const maxCircuit = Math.max(1, ...circuits.map((c) => c.count))

  const metrics = [
    { label: 'Recorridos', value: fmt(total), unit: '' },
    { label: '% de la muestra', value: `${share}`, unit: '%' },
    { label: 'Circuitos', value: `${circuits.length}`, unit: 'activos' },
    { label: 'Completos', value: `${completosPct}`, unit: '%' },
    { label: 'Anomalías', value: fmt(anomalias), unit: '' },
  ]

  if (!tr) {
    return (
      <section className="space-y-4">
        <BackBar label={label} onBack={() => navigate('/inicio')} accent={a} />
        <div className="rounded-3xl border border-violet-200 bg-violet-50 px-6 py-8 text-center text-sm text-violet-950">
          Sin datos cargados. Cargá un período y corré <strong>Transform</strong> para ver el transform por producto.
        </div>
      </section>
    )
  }

  if (!isValid) {
    return (
      <section className="space-y-4">
        <BackBar label="Producto" onBack={() => navigate('/inicio')} accent={FALLBACK} />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-6 text-sm text-amber-950">
          Producto desconocido: <strong>{id}</strong>. Volvé a Inicio y elegí un producto.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <BackBar label={label} onBack={() => navigate('/inicio')} accent={a} />

      {/* Hero del producto */}
      <div className="flex flex-wrap items-end justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Recorridos · {label}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`text-[64px] font-bold leading-[0.86] tracking-tight ${a.text}`}>{fmt(total)}</span>
            <span className="text-sm font-semibold text-slate-500">recorridos con producto</span>
          </div>
        </div>
        <div className="min-w-[240px]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Participación en la muestra</span>
            <span className={a.text}>{share}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${share}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            de {fmt(breakdown.conProducto)} recorridos con producto del período
          </p>
        </div>
      </div>

      {/* Métricas de flujo */}
      <SectionLabel>Métricas de flujo</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m.label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900">{m.value}</span>
              {m.unit ? <span className="text-[11px] font-semibold text-slate-400">{m.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Circuitos del producto */}
        <div>
          <SectionLabel right={`${circuits.length} circuitos`}>Circuitos del producto</SectionLabel>
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {circuits.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                {breakdown.ready ? 'Sin circuitos para este producto.' : 'Calculando…'}
              </p>
            ) : (
              circuits.slice(0, 10).map((c) => (
                <div
                  key={c.code}
                  className="grid grid-cols-[64px_1fr_56px] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0"
                >
                  <span className={`inline-flex justify-center rounded-md px-2 py-0.5 text-xs font-bold ${a.bg} ${a.text}`}>
                    {c.code}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-slate-700">{c.label}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${(c.count / maxCircuit) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{fmt(c.count)}</span>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/kpi/tiempos')}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50"
          >
            Ver KPI tiempos completo
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        {/* Clasificación ejecutiva + Seguridad */}
        <div className="space-y-4">
          <div>
            <SectionLabel>Clasificación ejecutiva</SectionLabel>
            <div className="mt-2 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {BUCKET_LABELS.map((b) => {
                const count = bucketCounts.get(b.key) ?? 0
                const pct = total ? Math.round((count / total) * 100) : 0
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={`inline-flex items-center gap-2 ${b.text}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${b.color}`} />
                        {b.key}
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {fmt(count)} <span className="text-slate-400">· {pct}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${b.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Seguridad</SectionLabel>
            <div className="mt-2 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
                  <path d="M12 9v4M12 16v.5" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">{fmt(anomalias)} recorridos en anomalías</div>
                <div className="text-xs text-slate-500">El detalle se revisará en la pestaña Seguridad (próximamente).</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function BackBar({
  label,
  onBack,
  accent,
}: {
  label: string
  onBack: () => void
  accent: { text: string; bar: string }
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Inicio
        </button>
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${accent.bar}`} />
          <span className="text-base font-bold text-slate-900">{label}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">· transform</span>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{children}</span>
      <span className="h-px flex-1 bg-slate-200" />
      {right ? <span className="text-[11px] text-slate-400">{right}</span> : null}
    </div>
  )
}
