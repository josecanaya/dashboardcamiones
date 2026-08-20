import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
} from 'recharts'
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import { argentinaLocalParts } from '../../../etl-core/domain/timestamps'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  CALADA_CAMERA_EVENTS_HEADERS,
  type CaladaCameraEventRow,
} from '../etlWorkbench/etlCaladaCameraActivity'
import { safeExportFilename } from '../../../utils/chartExport'

const DAY_FILTER_ALL = '__ALL_DIAS__'

/**
 * Cuartos de turno de la operación de calada (hora local Argentina). Ventanas de 6 h: Q1 22–04
 * (cruza medianoche), Q2 04–10, Q3 10–16, Q4 16–22. Definición única del proyecto, compartida
 * con `operationalTurno` (mismos límites que el filtro de banda horaria del scatter KPI).
 */
const CUARTOS_TURNO = [
  { id: 'q1', label: '22–04', start: 22, end: 4 },
  { id: 'q2', label: '04–10', start: 4, end: 10 },
  { id: 'q3', label: '10–16', start: 10, end: 16 },
  { id: 'q4', label: '16–22', start: 16, end: 22 },
] as const

/** Cuarto de turno para una hora entera (0–23). El último cuarto cruza medianoche. */
function cuartoFromHour(h: number): (typeof CUARTOS_TURNO)[number]['id'] {
  for (const c of CUARTOS_TURNO) {
    const dentro = c.start <= c.end ? h >= c.start && h < c.end : h >= c.start || h < c.end
    if (dentro) return c.id
  }
  return CUARTOS_TURNO[0].id
}
const SIN_PRODUCTO = 'Sin dato'
/** Productos con columna propia en la matriz por calle; el resto se pliega en "Otros". */
const MAX_PRODUCT_COLUMNS = 6

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  )
}

function parseCaladaRows(csv: string | undefined): CaladaCameraEventRow[] {
  if (!csv?.trim()) return []
  const { rows } = parseCsvToRecords(csv)
  return rows as unknown as CaladaCameraEventRow[]
}

/**
 * Clave de la ventana horaria (`YYYY-MM-DDTHH`), en hora de pared Argentina. Se deriva del
 * `timestamp` crudo (trae el offset −03:00), no de `intervalo_hora`/`fecha`/`hora`: esas
 * columnas se hornearon con `getHours()` del host y en corridas viejas quedaron corridas si
 * el proceso no era UTC−3. `argentinaLocalParts` da la hora local correcta sin importar la
 * zona del runtime, así una corrida guardada se lee bien sin reprocesar. Solo si falta el
 * timestamp se cae a las columnas horneadas.
 */
function hourBucketOf(r: CaladaCameraEventRow): string {
  const parts = localPartsOf(r)
  if (parts) return `${parts.fecha}T${parts.hh}`
  const iso = String(r.intervalo_hora ?? '').trim()
  if (iso.length >= 13) return iso.slice(0, 13)
  const fecha = String(r.fecha ?? '').trim()
  const hora = String(r.hora ?? '').trim()
  return fecha && hora ? `${fecha}T${hora.slice(0, 2)}` : ''
}

/** Fecha y hora de pared Argentina desde el `timestamp` crudo, o null si no se puede parsear. */
function localPartsOf(r: CaladaCameraEventRow): { fecha: string; hh: string } | null {
  const ts = String(r.timestamp ?? '').trim()
  if (!ts) return null
  const p = argentinaLocalParts(ts)
  return p ? { fecha: p.fecha_tramo, hh: p.hora_inicio.slice(0, 2) } : null
}

/** Día calendario Argentina de la fila (para el filtro por día), robusto a la zona del host. */
function localDayOf(r: CaladaCameraEventRow): string {
  return localPartsOf(r)?.fecha ?? String(r.fecha ?? '').trim()
}

/** `2026-07-20T08` → `20/07 08h`. */
function hourBucketLabel(bucket: string): string {
  return `${bucket.slice(8, 10)}/${bucket.slice(5, 7)} ${bucket.slice(11, 13)}h`
}

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 } as const

export function CaladaCamerasPanel({
  csv,
  checkedCircuits,
  filterActive,
  periodLabel,
}: {
  csv: string | undefined
  /** Circuitos tildados en el checklist. */
  checkedCircuits: Set<string>
  /** True solo si el usuario acotó (no están todos tildados). Si es false, se muestra todo. */
  filterActive: boolean
  periodLabel: string
}) {
  const allRows = useMemo(() => parseCaladaRows(csv), [csv])
  const [selectedDay, setSelectedDay] = useState(DAY_FILTER_ALL)

  const dayOptions = useMemo(
    () => [...new Set(allRows.map((r) => localDayOf(r)))].filter(Boolean).sort(),
    [allRows]
  )

  const rows = useMemo(() => {
    let out = allRows
    // Solo filtra por circuito si el usuario acotó; así el default muestra toda la
    // actividad de calada, incluidos journeys sin circuito ejecutivo asignado.
    if (filterActive) out = out.filter((r) => checkedCircuits.has(r.circuito))
    if (selectedDay !== DAY_FILTER_ALL) out = out.filter((r) => localDayOf(r) === selectedDay)
    return out
  }, [allRows, checkedCircuits, filterActive, selectedDay])

  /** Por cámara: camiones distintos, eventos y pico de camiones en una hora. */
  const perCamera = useMemo(() => {
    const byCam = new Map<string, { trucks: Set<string>; events: number; perBucket: Map<string, Set<string>> }>()
    for (const r of rows) {
      const c = byCam.get(r.camara) ?? { trucks: new Set(), events: 0, perBucket: new Map() }
      c.trucks.add(r.journey_id)
      c.events++
      const key = hourBucketOf(r)
      const b = c.perBucket.get(key) ?? new Set<string>()
      b.add(r.journey_id)
      c.perBucket.set(key, b)
      byCam.set(r.camara, c)
    }
    return [...byCam.entries()]
      .map(([camara, c]) => ({
        camara,
        camiones: c.trucks.size,
        eventos: c.events,
        picoPorHora: Math.max(0, ...[...c.perBucket.values()].map((s) => s.size)),
        // Suma de camiones distintos por hora: numerador del promedio/hora (denominador =
        // horas del período, común a todas las calles, se divide en el render).
        truckHours: [...c.perBucket.values()].reduce((a, s) => a + s.size, 0),
      }))
      .sort((a, b) => b.camiones - a.camiones || a.camara.localeCompare(b.camara))
  }, [rows])

  /** Por hora: cámaras de calada activas en simultáneo y camiones que pasaron por calada. */
  const concurrency = useMemo(() => {
    const byBucket = new Map<string, { cams: Set<string>; trucks: Set<string> }>()
    for (const r of rows) {
      const key = hourBucketOf(r)
      if (!key) continue
      const b = byBucket.get(key) ?? { cams: new Set(), trucks: new Set() }
      b.cams.add(r.camara)
      b.trucks.add(r.journey_id)
      byBucket.set(key, b)
    }
    return [...byBucket.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        bucket,
        label: hourBucketLabel(bucket),
        camaras_activas: v.cams.size,
        camiones: v.trucks.size,
      }))
  }, [rows])

  /** Horas con actividad en el período (denominador común de los promedios/hora). */
  const periodHours = concurrency.length

  /**
   * Promedio de calles usadas por cuarto de turno (01–07, 07–13, 13–19, 19–01): media de
   * cámaras activas simultáneas sobre las horas de ese cuarto. Es el agregado del gráfico de
   * calles disponibles: dice cuántas de las N calles se usan en promedio en cada franja.
   */
  const turnoUsage = useMemo(() => {
    const acc = new Map<string, { sumCalles: number; horas: number }>()
    for (const c of concurrency) {
      const id = cuartoFromHour(Number(c.bucket.slice(11, 13)))
      const a = acc.get(id) ?? { sumCalles: 0, horas: 0 }
      a.sumCalles += c.camaras_activas
      a.horas += 1
      acc.set(id, a)
    }
    return CUARTOS_TURNO.map((cuarto) => {
      const a = acc.get(cuarto.id)
      return {
        id: cuarto.id,
        label: cuarto.label,
        promedioCalles: a && a.horas ? a.sumCalles / a.horas : 0,
        horas: a?.horas ?? 0,
      }
    })
  }, [concurrency])

  /**
   * Hora pico de camiones de cada día (el máximo de la serie por jornada). Se resalta en el
   * gráfico de camiones: sombra + punto verde. Empates dentro del día resaltan ambas horas.
   * `bandStart`/`bandEnd` son las labels que la sombra usa como bordes: en una escala de
   * bandas (categórica) el borde izquierdo de una categoría es el borde derecho de la
   * anterior, así que sombrear `label`→`labelSiguiente` cubre exactamente esa columna. En la
   * última hora de la serie no hay siguiente, así que la sombra cae hacia la anterior.
   */
  const dayPeaks = useMemo(() => {
    const bestIdxByDay = new Map<string, number>()
    concurrency.forEach((c, i) => {
      if (c.camiones <= 0) return
      const day = c.bucket.slice(0, 10)
      const cur = bestIdxByDay.get(day)
      if (cur === undefined || c.camiones > concurrency[cur]!.camiones) bestIdxByDay.set(day, i)
    })
    return [...bestIdxByDay.values()]
      .sort((a, b) => a - b)
      .map((i) => {
        const c = concurrency[i]!
        const next = concurrency[i + 1]
        const prev = concurrency[i - 1]
        return {
          label: c.label,
          camiones: c.camiones,
          bandStart: c.label,
          bandEnd: (next ?? prev ?? c).label,
        }
      })
  }, [concurrency])

  const totals = useMemo(() => {
    const trucks = new Set(rows.map((r) => r.journey_id))
    const cams = new Set(rows.map((r) => r.camara))
    const peakCams = concurrency.reduce(
      (best, c) => (c.camaras_activas > best.camaras_activas ? c : best),
      { camaras_activas: 0, camiones: 0, label: '' }
    )
    const peakTrucks = concurrency.reduce(
      (best, c) => (c.camiones > best.camiones ? c : best),
      { camaras_activas: 0, camiones: 0, label: '' }
    )
    // Promedio de camiones/hora: media de la serie horaria (altura media de la curva azul),
    // sobre las horas con actividad del período.
    const sumTrucksPerHour = concurrency.reduce((a, c) => a + c.camiones, 0)
    const avgTrucksPerHour = periodHours ? sumTrucksPerHour / periodHours : 0
    return {
      trucks: trucks.size,
      cams: cams.size,
      peakCams: peakCams.camaras_activas,
      peakCamsLabel: peakCams.label,
      peakTrucks: peakTrucks.camiones,
      peakTrucksLabel: peakTrucks.label,
      avgTrucksPerHour,
    }
  }, [rows, concurrency, periodHours])

  /**
   * Qué producto caló cada calle. El producto no lo dice la cámara: lo trae el camión
   * desde el Excel de movimientos (`producto` del journey). Si por una calle pasaron
   * camiones de soja, esa calle caló soja — la mezcla de la fila es la evidencia, y el
   * "dominante" es el producto con más camiones distintos de esa calle.
   */
  const productMatrix = useMemo(() => {
    const byCam = new Map<string, Map<string, Set<string>>>()
    for (const r of rows) {
      const producto = String(r.producto ?? '').trim() || SIN_PRODUCTO
      const m = byCam.get(r.camara) ?? new Map<string, Set<string>>()
      const s = m.get(producto) ?? new Set<string>()
      s.add(r.journey_id)
      m.set(producto, s)
      byCam.set(r.camara, m)
    }

    // Orden de columnas: productos con más camiones primero; "Sin dato" siempre al final.
    const globalTotals = new Map<string, number>()
    for (const m of byCam.values()) {
      for (const [producto, trucks] of m) {
        globalTotals.set(producto, (globalTotals.get(producto) ?? 0) + trucks.size)
      }
    }
    const ranked = [...globalTotals.entries()]
      .filter(([p]) => p !== SIN_PRODUCTO)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([p]) => p)
    const named = ranked.slice(0, MAX_PRODUCT_COLUMNS)
    const folded = new Set(ranked.slice(MAX_PRODUCT_COLUMNS))
    const columns = [...named]
    if (folded.size) columns.push('Otros')
    if (globalTotals.has(SIN_PRODUCTO)) columns.push(SIN_PRODUCTO)

    const camRows = [...byCam.entries()]
      .map(([camara, m]) => {
        const counts = new Map<string, number>()
        for (const [producto, trucks] of m) {
          const col = folded.has(producto) ? 'Otros' : producto
          counts.set(col, (counts.get(col) ?? 0) + trucks.size)
        }
        const total = [...counts.values()].reduce((a, b) => a + b, 0)
        // El dominante se busca sobre productos reales: "Sin dato" no es un producto.
        let dominante = ''
        let dominanteCamiones = 0
        for (const [producto, trucks] of m) {
          if (producto === SIN_PRODUCTO) continue
          if (trucks.size > dominanteCamiones) {
            dominante = producto
            dominanteCamiones = trucks.size
          }
        }
        const conProducto = total - (counts.get(SIN_PRODUCTO) ?? 0)
        return {
          camara,
          counts,
          total,
          dominante,
          dominanteCamiones,
          dominantePct: conProducto > 0 ? (dominanteCamiones / conProducto) * 100 : 0,
        }
      })
      .sort((a, b) => b.total - a.total || a.camara.localeCompare(b.camara))

    return { columns, camRows, sinProductoTotal: globalTotals.get(SIN_PRODUCTO) ?? 0 }
  }, [rows])

  if (!allRows.length) {
    return (
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
        No hay datos de cámaras de calada en esta corrida. La tabla <code>calada_camera_events</code> se genera al
        procesar KPI tiempos; si es una corrida guardada vieja, reprocesá el período (Análisis local → Transform →
        KPI) para verla.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Día</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value={DAY_FILTER_ALL}>Todos</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-xl text-xs text-slate-500">
            Ocupación por <strong>hora</strong>: cuántos camiones vio cada cámara de calada y cuántas cámaras
            operaban a la vez. Filtrado por los circuitos tildados. Período: {periodLabel}.
          </p>
        </div>
        <button
          type="button"
          disabled={!rows.length}
          onClick={() =>
            triggerBrowserCsvDownload(
              safeExportFilename('calada_camaras', 'csv'),
              `${CALADA_CAMERA_EVENTS_HEADERS.join(',')}\n${rows
                .map((r) => CALADA_CAMERA_EVENTS_HEADERS.map((h) => r[h] ?? '').join(','))
                .join('\n')}\n`
            )
          }
          className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV detalle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Camiones en calada" value={totals.trucks.toLocaleString()} />
        <MetricCard
          label="Prom. camiones/hora"
          value={totals.avgTrucksPerHour.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
          hint={periodHours ? `sobre ${periodHours} h con actividad` : undefined}
        />
        <MetricCard label="Cámaras con actividad" value={String(totals.cams)} />
        <MetricCard
          label="Pico cámaras simultáneas"
          value={String(totals.peakCams)}
          hint={totals.peakCamsLabel ? `en la hora ${totals.peakCamsLabel}` : 'en una hora'}
        />
        <MetricCard
          label="Pico camiones simultáneos"
          value={String(totals.peakTrucks)}
          hint={totals.peakTrucksLabel ? `en la hora ${totals.peakTrucksLabel}` : 'en una hora'}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3">Cámara de calada</th>
              <th className="px-4 py-3 text-right">Camiones recibidos</th>
              <th className="px-4 py-3 text-right">Prom. camiones/hora</th>
              <th className="px-4 py-3 text-right">Eventos</th>
              <th className="px-4 py-3 text-right">Pico por hora</th>
            </tr>
          </thead>
          <tbody>
            {perCamera.map((c) => (
              <tr key={c.camara} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{c.camara}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.camiones.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sky-800">
                  {(periodHours ? c.truckHours / periodHours : 0).toLocaleString('es-AR', {
                    maximumFractionDigits: 1,
                  })}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.eventos.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.picoPorHora}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Cámaras de calada activas en simultáneo, por hora
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Cuántas de las {totals.cams} cámaras registraron al menos un camión en esa hora: mide cuántas calles de
            calada estuvieron en uso a la vez.
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={concurrency} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="camaras_activas"
                  name="Cámaras activas"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="#7c3aed"
                  fillOpacity={0.14}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Promedio de calles usadas por cuarto de turno
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Media de calles en uso simultáneo en cada franja, sobre {totals.cams} calles con actividad.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {turnoUsage.map((t) => (
                <div key={t.id} className="rounded-lg border border-violet-100 bg-violet-50/60 px-2.5 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">{t.label}</span>
                    <span className="text-sm font-bold tabular-nums text-violet-900">
                      {t.promedioCalles.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                      <span className="ml-0.5 text-[10px] font-normal text-slate-400">/ {totals.cams}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{
                        width: `${totals.cams ? Math.min(100, (t.promedioCalles / totals.cams) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Camiones en calada, por hora
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Camiones distintos que pasaron por alguna cámara de calada en esa hora. La{' '}
            <span className="font-semibold text-emerald-700">hora pico de cada día</span> queda sombreada en verde y
            marcada con un punto.
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={concurrency} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                {/* Sombra del pico diario (detrás del área). */}
                {dayPeaks.map((p) => (
                  <ReferenceArea
                    key={`band-${p.label}`}
                    x1={p.bandStart}
                    x2={p.bandEnd}
                    fill="#22c55e"
                    fillOpacity={0.3}
                    ifOverflow="extendDomain"
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="camiones"
                  name="Camiones en calada"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="#2563eb"
                  fillOpacity={0.14}
                  dot={false}
                />
                {/* Punto verde sobre el máximo de cada día. */}
                {dayPeaks.map((p) => (
                  <ReferenceDot
                    key={`dot-${p.label}`}
                    x={p.label}
                    y={p.camiones}
                    r={5}
                    fill="#16a34a"
                    stroke="#ffffff"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Qué producto caló cada calle
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          La cámara no informa producto: se infiere de los camiones que pasaron por ella (producto del Excel de
          movimientos). Camiones distintos por calle y producto; <strong>dominante</strong> es el producto con más
          camiones de esa calle, sobre los camiones con producto conocido.
        </p>
        {productMatrix.sinProductoTotal > 0 && (
          <p className="mt-1 text-xs text-amber-700">
            {productMatrix.sinProductoTotal.toLocaleString()} pasadas sin producto (journey sin match en el Excel):
            quedan en la columna «{SIN_PRODUCTO}» y no cuentan para el dominante.
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-3 py-3">Calle</th>
                {productMatrix.columns.map((p) => (
                  <th key={p} className="px-3 py-3 text-right">
                    {p}
                  </th>
                ))}
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Dominante</th>
              </tr>
            </thead>
            <tbody>
              {productMatrix.camRows.map((r) => (
                <tr key={r.camara} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{r.camara}</td>
                  {productMatrix.columns.map((p) => {
                    const n = r.counts.get(p) ?? 0
                    return (
                      <td
                        key={p}
                        className={`px-3 py-2.5 text-right tabular-nums ${n ? 'text-slate-900' : 'text-slate-300'}`}
                      >
                        {n || '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.total.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.dominante ?
                      <>
                        <span className="font-semibold text-slate-900">{r.dominante}</span>
                        <span className="ml-1 tabular-nums text-slate-500">
                          {r.dominantePct.toFixed(0)}% ({r.dominanteCamiones})
                        </span>
                      </>
                    : <span className="text-slate-400">sin producto conocido</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
