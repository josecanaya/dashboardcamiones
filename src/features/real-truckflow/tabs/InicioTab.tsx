import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'
import { executiveSampleProductLabel } from '../etlWorkbench/etlProductFilter'
import { useExecutiveProductBreakdown } from '../etlWorkbench/useExecutiveProductBreakdown'

/**
 * Inicio: entrada por producto. Los conteos por producto usan la MISMA fuente canónica que la
 * pestaña Transform (chips «Producto (muestra)»): recorridos clasificados con producto Excel
 * (ver {@link useExecutiveProductBreakdown}), NO los movimientos crudos del Excel. Al clickear un
 * producto se abre su transform (`/producto/<id>`).
 */

/** Paleta por producto (clases literales para que Tailwind las conserve). */
const ACCENT: Record<string, { text: string; bg: string; bar: string }> = {
  SOJA: { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  GIRASOL: { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' },
  ACEITE: { text: 'text-orange-600', bg: 'bg-orange-50', bar: 'bg-orange-500' },
  PELLET: { text: 'text-sky-600', bg: 'bg-sky-50', bar: 'bg-sky-500' },
}
const FALLBACK_ACCENT = { text: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500' }

function fmt(n: number): string {
  return n.toLocaleString('es-AR')
}

export function InicioTab() {
  const wb = useEtlWorkbenchOptional()
  const navigate = useNavigate()
  const tr = wb?.transformResult
  const breakdown = useExecutiveProductBreakdown(tr)

  const cobertura = breakdown.total ? Math.round((breakdown.conProducto / breakdown.total) * 1000) / 10 : 0
  const coberturaTxt = String(cobertura).replace('.', ',')

  const excelRows = useMemo(() => {
    const csv = tr?.csv.excel_operations_with_truckflow
    if (!csv?.trim()) return [] as Record<string, string>[]
    return parseCsvToRecords(csv).rows
  }, [tr?.csv.excel_operations_with_truckflow])

  const period = useMemo(() => {
    const dayCount = (from: string, to: string) => {
      const a = Date.parse(`${from}T00:00:00`)
      const b = Date.parse(`${to}T00:00:00`)
      return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) + 1 : 0
    }
    const days = wb?.loadSummary?.daysDetected ?? []
    if (days.length) {
      const from = days[0]!
      const to = days[days.length - 1]!
      return { label: from === to ? from : `${from} → ${to}`, count: days.length }
    }
    if (wb?.composedRange) {
      const { from, to } = wb.composedRange
      return { label: from === to ? from : `${from} → ${to}`, count: dayCount(from, to) }
    }
    let from = ''
    let to = ''
    for (const r of excelRows) {
      const d = String(r.external_ingreso_at ?? r.truckflow_first_seen_at ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      if (!from || d < from) from = d
      if (!to || d > to) to = d
    }
    if (!from) return { label: '—', count: 0 }
    return { label: from === to ? from : `${from} → ${to}`, count: dayCount(from, to) }
  }, [wb?.loadSummary?.daysDetected, wb?.composedRange, excelRows])

  const openProduct = (bucket: string) => {
    navigate(`/producto/${bucket.toLowerCase()}`)
  }

  // Estado vacío / aún construyendo la clasificación.
  if (!tr) {
    return (
      <section className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Inicio</h2>
          <p className="mt-1 text-sm text-slate-600">Entrada por producto</p>
        </div>
        <div className="rounded-3xl border border-violet-200 bg-violet-50 px-6 py-8 text-center">
          <p className="text-sm text-violet-950">
            Todavía no hay datos cargados. Andá a <strong>Análisis local</strong>, cargá un período y corré{' '}
            <strong>Transform</strong> para ver el volumen y la muestra por producto.
          </p>
          <button
            type="button"
            onClick={() => navigate('/analisis-local')}
            className="mt-4 rounded-xl bg-violet-700 px-5 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-800"
          >
            Ir a Análisis local
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      {/* Encabezado + período */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inicio</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Entrada por producto · elegí un producto para abrir su transform
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
            <path d="M3 9h18M8 2.8v3.4M16 2.8v3.4" />
          </svg>
          {period.label}
          {period.count ? <span className="text-violet-400">· {period.count} días</span> : null}
        </div>
      </div>

      {/* Hero: recorridos del período + muestra con producto */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Recorridos del período
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[76px] font-bold leading-[0.86] tracking-tight text-slate-900">
              {fmt(breakdown.total)}
            </span>
            <span className="text-lg font-semibold text-slate-500">recorridos</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
            Recorridos evaluables del período según la clasificación ejecutiva. La muestra por producto son
            los que tienen producto Excel resuelto.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Muestra con producto</div>
              <div className="mt-1 text-3xl font-bold text-slate-900">{fmt(breakdown.conProducto)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cobertura</div>
              <div className="mt-1 text-3xl font-bold text-violet-700">{coberturaTxt}%</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-500"
              style={{ width: `${cobertura}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {fmt(breakdown.sinProducto)} recorridos sin producto Excel (cobertura faltante)
          </p>
        </div>
      </div>

      {/* Etiqueta de sección */}
      <div className="flex items-center gap-4 pt-1">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Entrar por producto</span>
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] text-slate-400">
          {breakdown.perProduct.length} productos · clic para abrir el transform
        </span>
      </div>

      {/* Tarjetas por producto */}
      {breakdown.perProduct.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-6 text-sm text-slate-600">
          {breakdown.ready
            ? 'La corrida no tiene recorridos con producto Excel resuelto.'
            : 'Calculando la clasificación por producto…'}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {breakdown.perProduct.map((p) => {
            const a = ACCENT[p.key] ?? FALLBACK_ACCENT
            const share = breakdown.conProducto ? Math.round((p.count / breakdown.conProducto) * 100) : 0
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => openProduct(p.key)}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                <span className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900">{executiveSampleProductLabel(p.key)}</span>
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 13l2-7h11l3 4h2v3" />
                      <circle cx="7.5" cy="17.5" r="1.8" />
                      <circle cx="17" cy="17.5" r="1.8" />
                      <path d="M9.5 17.5h5.5" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-5xl font-bold leading-none tracking-tight text-slate-900">{fmt(p.count)}</span>
                  <span className="text-xs font-semibold text-slate-500">recorridos</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{share}% de la muestra</span>
                  <span className={a.text}>{executiveSampleProductLabel(p.key)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${share}%` }} />
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="text-[11px] text-slate-400">Producto de la muestra ejecutiva</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${a.text}`}>
                    Abrir transform
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.1"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pie: muestra total */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">Muestra total con producto</span>
        <div className="flex items-center gap-5">
          <span className="text-base font-bold text-slate-900">{fmt(breakdown.conProducto)} recorridos</span>
          <span className="h-4 w-px bg-slate-200" />
          <span className="text-sm font-bold text-emerald-600">{coberturaTxt}% del período</span>
        </div>
      </div>
    </section>
  )
}
