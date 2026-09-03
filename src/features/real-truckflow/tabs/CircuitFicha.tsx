import { useEffect, useMemo, useState } from 'react'
import {
  FRANJA_HORARIA_COLORS,
  FRANJA_HORARIA_ORDER,
  type FranjaHoraria,
} from '../etlWorkbench/etlSegmentScatterByDay'
import { SCATTER_DAY_FILTER_ALL } from '../etlWorkbench/etlSegmentScatterByDay'
import { ComportamientoPorDiaBar } from '../components/ComportamientoPorDiaBar'

/**
 * Ficha visual de un circuito: plano, comportamiento por día, línea de tiempo
 * continua por tramo (grosor ∝ duración), bandas horarias Q1–Q4 y tabla de
 * detalle desplegable. Es 100% presentación: todos los números llegan por props
 * ya calculados en KpiTiemposTab (agregados de tramos + resumen por cuarto).
 */

/** Paleta de tramos (cinta continua). Se cicla si hay más tramos que colores. */
const TRAMO_PALETTE = [
  '#2563eb', '#ef4444', '#22c55e', '#a855f7', '#f59e0b',
  '#14b8a6', '#1e293b', '#ec4899', '#16a34a', '#0891b2',
]

const BAND_RANGE: Record<FranjaHoraria, string> = {
  Q1: '22:00 – 04:00',
  Q2: '04:00 – 10:00',
  Q3: '10:00 – 16:00',
  Q4: '16:00 – 22:00',
}

export type FichaTramo = {
  key: string
  label: string
  mean: number
  count: number
  min: number
  max: number
  std: number
}

export type FichaDayBar = {
  fecha: string
  label: string
  weekday: string
  total: number
}

export type FichaBand = {
  q: FranjaHoraria
  camiones: number
  mean: number | null
}

export type CircuitFichaProps = {
  circuitCode: string
  circuitLabel: string
  product?: string
  groupLabel: string
  pathLabel: string
  tramos: FichaTramo[]
  totalMin: number
  totalTrucks: number
  bands: FichaBand[]
  dayBars: FichaDayBar[]
  selectedDay: string
  onSelectDay: (day: string) => void
  franjaFilter: FranjaHoraria | null
  onFranjaFilter: (f: FranjaHoraria | null) => void
  periodLabel: string
  /** Imagen del render de planta del circuito (opcional; placeholder si falta). */
  planoSrc?: string
  /** Clic en un tramo (barra de tiempos o tarjeta de tramo). Recibe la clave del tramo. */
  onSelectTramo?: (tramoKey: string) => void
}

function fmt(v: number): string {
  return v.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

export function CircuitFicha(props: CircuitFichaProps) {
  const {
    circuitCode, circuitLabel, product, tramos, totalMin, totalTrucks,
    bands, dayBars, selectedDay, onSelectDay, franjaFilter, onFranjaFilter, planoSrc, onSelectTramo,
  } = props

  // Imagen del render por circuito: se puede cargar desde el disco y persiste en localStorage
  // (una imagen por código de circuito). `planoSrc` (prop) tiene prioridad si se pasa.
  const storageKey = `kpi-plano:${circuitCode}`
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  useEffect(() => {
    if (planoSrc) {
      setImgSrc(planoSrc)
      return
    }
    try {
      setImgSrc(localStorage.getItem(storageKey))
    } catch {
      setImgSrc(null)
    }
  }, [storageKey, planoSrc])

  const onPickImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!url) return
      setImgSrc(url)
      try {
        localStorage.setItem(storageKey, url)
      } catch {
        /* cuota de localStorage superada: la imagen queda solo en memoria */
      }
    }
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImgSrc(null)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* noop */
    }
  }

  const maxMean = useMemo(() => Math.max(1, ...tramos.map((t) => t.mean)), [tramos])
  const allDays = selectedDay === SCATTER_DAY_FILTER_ALL
  const hours = totalMin > 0 ? `≈ ${Math.floor(totalMin / 60)} h ${Math.round(totalMin % 60)} m` : '—'

  return (
    <div className="space-y-4">
      {/* Header band */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center rounded-2xl bg-emerald-800 text-sm font-black text-white" style={{ height: 52, width: 52 }}>
              NV
            </div>
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Circuito</div>
              <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
                {circuitCode}
                {product ? (
                  <>
                    {' '}
                    <span className="font-semibold text-slate-300">·</span>{' '}
                    <span className="text-violet-700">{product}</span>
                  </>
                ) : null}
              </h2>
              {circuitLabel && circuitLabel !== circuitCode ? (
                <div className="mt-0.5 text-sm text-slate-600">{circuitLabel}</div>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2.5">
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
              {tramos.length} tramos
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {allDays ? props.periodLabel : `Día ${selectedDay}`}
            </span>
          </div>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-gradient-to-r from-blue-600 via-emerald-500 to-lime-400" />
      </div>

      {/* Plano (arriba: identifica el circuito) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Plano del recorrido — {circuitCode}
          </h3>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100">
              {imgSrc ? 'Cambiar imagen' : 'Cargar imagen del render'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onPickImage(f)
                  e.target.value = ''
                }}
              />
            </label>
            {imgSrc ? (
              <button
                type="button"
                onClick={clearImage}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                Quitar
              </button>
            ) : null}
          </div>
        </div>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={`Plano del circuito ${circuitCode}`}
            className="mt-3.5 w-full rounded-2xl border border-slate-200"
          />
        ) : (
          <div
            className="mt-3.5 flex min-h-[300px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300"
            style={{ background: 'repeating-linear-gradient(45deg,#f8fafc,#f8fafc 12px,#f1f5f9 12px,#f1f5f9 24px)' }}
          >
            <div className="px-6 text-center text-slate-400">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.6" className="mx-auto mb-2.5 block">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="8.5" cy="9.5" r="1.6" />
                <path d="M21 16l-5-5L5 20" />
              </svg>
              <div className="text-[15px] font-bold text-slate-500">
                Render de {circuitCode}{product ? ` · ${product}` : ''}
              </div>
              <div className="mt-0.5 text-[12.5px]">imagen isométrica del recorrido (una por circuito)</div>
            </div>
          </div>
        )}
      </div>

      <ComportamientoPorDiaBar
        dayBars={dayBars}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        hint="camiones por día · clic para filtrar toda la ficha"
      />

      {/* Línea de tiempo continua (sin encabezado: la barra de tiempos medios es autoexplicativa) */}
      <div className="rounded-3xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex items-stretch" style={{ gap: 0 }}>
          {tramos.map((t, i) => {
            const color = TRAMO_PALETTE[i % TRAMO_PALETTE.length]!
            const flex = Math.max(4, t.mean)
            const mw = t.mean >= 60 ? 66 : 52
            const h = Math.round(10 + (t.mean / maxMean) * 24)
            const radius =
              i === 0 ? '8px 0 0 8px' : i === tramos.length - 1 ? '0 8px 8px 0' : '0'
            return (
              <div
                key={t.key}
                role={onSelectTramo ? 'button' : undefined}
                tabIndex={onSelectTramo ? 0 : undefined}
                onClick={onSelectTramo ? () => onSelectTramo(t.key) : undefined}
                onKeyDown={
                  onSelectTramo
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectTramo(t.key)
                        }
                      }
                    : undefined
                }
                title={onSelectTramo ? 'Ver el tramo (cámaras o dispersión)' : undefined}
                className={`flex flex-col rounded-lg text-center transition ${
                  onSelectTramo ? 'cursor-pointer hover:bg-slate-50' : ''
                }`}
                style={{ flex: `${flex} 1 0`, minWidth: mw }}
              >
                <div className="min-h-[34px] px-1">
                  <div className="text-xs font-bold text-slate-900">{t.label.split('→')[0]?.trim()}</div>
                  <div className="text-[10.5px] text-slate-400">{t.label}</div>
                </div>
                <div className="flex h-9 items-center">
                  <div style={{ width: '100%', height: h, background: color, borderRadius: radius }} />
                </div>
                <div className="mt-1 text-[19px] font-extrabold tabular-nums" style={{ color }}>
                  {t.count > 0 ? Math.round(t.mean) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totales */}
        <div className="mt-6 flex flex-wrap gap-4">
          <div className="min-w-[220px] flex-1 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-6 py-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-violet-300">Tiempo total puerta-a-puerta</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[42px] font-black leading-none tabular-nums text-violet-700">{totalMin > 0 ? Math.round(totalMin) : '—'}</span>
              <span className="text-base font-bold text-violet-300">min</span>
              <span className="ml-1.5 text-[13px] text-slate-400">{hours}</span>
            </div>
          </div>
          <div className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">Total de camiones</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[42px] font-black leading-none tabular-nums text-slate-900">{totalTrucks.toLocaleString('es-AR')}</span>
              <span className="ml-1.5 text-[13px] text-slate-400">
                {allDays ? 'movimientos del período' : `movimientos del día ${selectedDay}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bandas horarias Q1–Q4 */}
      <div className="rounded-3xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Ingresos por banda horaria</h3>
          <span className="text-xs text-slate-400">cuartos del día · clic para resaltar</span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" style={{ marginTop: 18 }}>
          {FRANJA_HORARIA_ORDER.map((q) => {
            const band = bands.find((b) => b.q === q)
            const camiones = band?.camiones ?? 0
            const mean = band?.mean ?? null
            const color = FRANJA_HORARIA_COLORS[q]
            const sel = franjaFilter === q
            const clip = 'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)'
            return (
              <button
                key={q}
                type="button"
                onClick={() => onFranjaFilter(sel ? null : q)}
                className="text-left"
                style={{ background: color, clipPath: clip, padding: 3, boxShadow: sel ? `0 0 0 3px ${color}55` : 'none' }}
              >
                <div style={{ background: '#fff', clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)', padding: '16px 18px 18px' }}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[15px] font-extrabold text-white"
                      style={{ minWidth: 40, background: color }}
                    >
                      {q}
                    </span>
                    <span className="text-[12.5px] font-semibold text-slate-600">{BAND_RANGE[q]}</span>
                  </div>
                  <div className="mt-4 text-right">
                    <span className="text-[26px] font-black tabular-nums" style={{ color }}>{camiones.toLocaleString('es-AR')}</span>
                    <span className="text-xs font-bold" style={{ color }}> camiones</span>
                  </div>
                  <div className="mt-0.5 text-right text-[11px] text-slate-400">
                    tiempo medio <b className="text-slate-500">{mean != null ? `${fmt(mean)} min` : '—'}</b>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tramos (a lo ancho) */}
      <div className="rounded-3xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <h3 className="mb-3.5 text-sm font-bold uppercase tracking-wide text-slate-700">Los tramos del circuito</h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {tramos.map((t, i) => {
            const color = TRAMO_PALETTE[i % TRAMO_PALETTE.length]!
            return (
              <div
                key={t.key}
                role={onSelectTramo ? 'button' : undefined}
                tabIndex={onSelectTramo ? 0 : undefined}
                onClick={onSelectTramo ? () => onSelectTramo(t.key) : undefined}
                onKeyDown={
                  onSelectTramo
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectTramo(t.key)
                        }
                      }
                    : undefined
                }
                title={onSelectTramo ? 'Ver el tramo (cámaras o dispersión)' : undefined}
                className={`flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 transition ${
                  onSelectTramo ? 'cursor-pointer hover:bg-slate-50 hover:shadow-sm' : ''
                }`}
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <span className="w-14 flex-none text-[11.5px] font-extrabold text-slate-400">TRAMO {i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-900">{t.label.split('→')[0]?.trim()}</div>
                  <div className="text-[11px] text-slate-500">{t.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalle por tramo (tabla secundaria, desplegable) */}
      <details className="group rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-6 py-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="-rotate-90 transition-transform group-open:rotate-0">
            <path d="M6 9l6 6 6-6" />
          </svg>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Detalle por tramo (tabla)</h3>
          <span className="text-[11.5px] text-slate-400">secundario · clic para desplegar</span>
        </summary>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-6 py-2.5">Tramo</th>
                <th className="px-3.5 py-2.5 text-right">N</th>
                <th className="px-3.5 py-2.5 text-right">Media</th>
                <th className="px-3.5 py-2.5 text-right">Mín</th>
                <th className="px-3.5 py-2.5 text-right">Máx</th>
                <th className="px-6 py-2.5 text-right">σ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-700">
              {tramos.map((t, i) => {
                const color = TRAMO_PALETTE[i % TRAMO_PALETTE.length]!
                const has = t.count > 0
                return (
                  <tr key={t.key} className="border-b border-slate-100">
                    <td className="px-6 py-2 font-semibold">
                      <span style={{ color }}>●</span> {t.label}
                    </td>
                    <td className="px-3.5 py-2 text-right">{t.count || '—'}</td>
                    <td className="px-3.5 py-2 text-right font-bold">{has ? fmt(t.mean) : '—'}</td>
                    <td className="px-3.5 py-2 text-right">{has ? fmt(t.min) : '—'}</td>
                    <td className="px-3.5 py-2 text-right">{has ? fmt(t.max) : '—'}</td>
                    <td className="px-6 py-2 text-right text-slate-400">{has ? fmt(t.std) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
