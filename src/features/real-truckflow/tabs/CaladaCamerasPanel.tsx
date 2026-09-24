import { Disclosure } from '../../../components/ui/Interface'
import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
} from 'recharts'
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  CALADA_CAMERA_EVENTS_HEADERS,
  type CaladaCameraEventRow,
} from '../etlWorkbench/etlCaladaCameraActivity'
import { safeExportFilename } from '../../../utils/chartExport'
import { ComportamientoPorDiaBar } from '../components/ComportamientoPorDiaBar'
import { SCATTER_DAY_FILTER_ALL } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  buildActivityDayBars,
  buildCameraActivityModel,
  isExcelSourcedRow,
  localDayOf,
} from '../etlWorkbench/etlCameraActivityModel'

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

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 } as const

/** Textos configurables: el panel sirve para calada (Ricardone) y volcable SL con la misma lógica. */
export type CameraActivityLabels = {
  /** Nombre de la entidad-columna (singular), p.ej. «cámara de calada» / «calle volcable». */
  entitySingular: string
  /** Plural para títulos de gráficos, p.ej. «cámaras de calada» / «calles del volcable». */
  entityPlural: string
  /** Encabezado de la columna en la tabla, p.ej. «Cámara de calada» / «Calle volcable». */
  columnHeader: string
  /** Métrica de camiones, p.ej. «Camiones en calada» / «Camiones en volcable SL». */
  trucksMetric: string
  /** Métrica de actividad, p.ej. «Cámaras con actividad» / «Calles con actividad». */
  activityMetric: string
  /** Base del nombre de archivo del export. */
  exportName: string
  /** Nombre de la tabla ETL (mensaje de estado vacío). */
  tableName: string
  /**
   * Cámaras a excluir del gráfico «camiones por hora». En calada, la calada líquida
   * (`RicCalLiq`) no se cuenta ahí: se descartan los camiones que pasaron por ella.
   */
  hourlyTrucksExcludeCameras?: string[]
  /**
   * Separar «Excel» vs «solo cámara». En volcable SL la verdad del conteo es la fila INGRESO
   * del Excel (plataforma `VOLCABLE_PTO_N`); los camiones que solo vio la cámara (sin fila
   * Excel) son un posible error y se muestran aparte, NO se suman a «Camiones recibidos». En
   * calada no hay filas Excel, así que queda en false y se cuenta todo (comportamiento normal).
   */
  splitExcelVsCamera?: boolean
  /**
   * Mostrar la columna «Patentes» con el botón «Ver» y el modal de patentes por cámara (auditoría
   * de seguridad: qué camiones exactos pasaron por ese sector). Se activa solo donde tiene sentido
   * de control (aceites SL, calada líquida/SL); en el resto queda oculto.
   */
  showPatentesModal?: boolean
}

const CALADA_LABELS: CameraActivityLabels = {
  entitySingular: 'cámara de calada',
  entityPlural: 'cámaras de calada',
  columnHeader: 'Cámara de calada',
  trucksMetric: 'Camiones en calada',
  activityMetric: 'Cámaras con actividad',
  exportName: 'calada_camaras',
  tableName: 'calada_camera_events',
  hourlyTrucksExcludeCameras: ['RicCalLiq'],
}

export function CaladaCamerasPanel({
  csv,
  checkedCircuits,
  filterActive,
  periodLabel,
  labels = CALADA_LABELS,
  selectedDay: selectedDayProp,
  onSelectDay: onSelectDayProp,
}: {
  csv: string | undefined
  /** Circuitos tildados en el checklist. */
  checkedCircuits: Set<string>
  /** True solo si el usuario acotó (no están todos tildados). Si es false, se muestra todo. */
  filterActive: boolean
  periodLabel: string
  /** Textos del panel (default: calada). Para volcable SL se pasan los de calle volcable. */
  labels?: CameraActivityLabels
  /** Mismo filtro de día que el resto de KPI tiempos (opcional). */
  selectedDay?: string
  onSelectDay?: (day: string) => void
}) {
  const allRows = useMemo(() => parseCaladaRows(csv), [csv])
  const [localDay, setLocalDay] = useState(SCATTER_DAY_FILTER_ALL)
  const [selectedCamaraForModal, setSelectedCamaraForModal] = useState<string | null>(null)
  const selectedDay = selectedDayProp ?? localDay
  const setSelectedDay = onSelectDayProp ?? setLocalDay

  const rowsBeforeDay = useMemo(() => {
    let out = allRows
    if (filterActive) out = out.filter((r) => checkedCircuits.has(r.circuito))
    return out
  }, [allRows, checkedCircuits, filterActive])

  const rows = useMemo(() => {
    if (selectedDay === SCATTER_DAY_FILTER_ALL) return rowsBeforeDay
    return rowsBeforeDay.filter((r) => localDayOf(r) === selectedDay)
  }, [rowsBeforeDay, selectedDay])

  const splitSource = labels.splitExcelVsCamera === true

  const baseRowsBeforeDay = useMemo(
    () => (splitSource ? rowsBeforeDay.filter(isExcelSourcedRow) : rowsBeforeDay),
    [rowsBeforeDay, splitSource]
  )

  const dayBars = useMemo(() => buildActivityDayBars(baseRowsBeforeDay), [baseRowsBeforeDay])

  /**
   * Todos los agregados del panel salen de `buildCameraActivityModel` (módulo puro
   * `etlCameraActivityModel`), la ÚNICA implementación: el exportador del informe de
   * logística reusa exactamente estos números.
   */
  const activity = useMemo(
    () =>
      buildCameraActivityModel(rows, {
        splitExcelVsCamera: splitSource,
        hourlyTrucksExcludeCameras: labels.hourlyTrucksExcludeCameras,
      }),
    [rows, splitSource, labels.hourlyTrucksExcludeCameras]
  )
  const {
    baseRows,
    perCamera,
    periodHours,
    trucksPerHour,
    turnoUsage,
    totals,
    camOnlyByCamera,
    camOnlyTotal,
  } = activity

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
    trucksPerHour.forEach((c, i) => {
      if (c.camiones <= 0) return
      const day = c.bucket.slice(0, 10)
      const cur = bestIdxByDay.get(day)
      if (cur === undefined || c.camiones > trucksPerHour[cur]!.camiones) bestIdxByDay.set(day, i)
    })
    return [...bestIdxByDay.values()]
      .sort((a, b) => a - b)
      .map((i) => {
        const c = trucksPerHour[i]!
        const next = trucksPerHour[i + 1]
        const prev = trucksPerHour[i - 1]
        return {
          label: c.label,
          camiones: c.camiones,
          bandStart: c.label,
          bandEnd: (next ?? prev ?? c).label,
        }
      })
  }, [trucksPerHour])


  /**
   * Qué producto caló cada calle. El producto no lo dice la cámara: lo trae el camión
   * desde el Excel de movimientos (`producto` del journey). Si por una calle pasaron
   * camiones de soja, esa calle caló soja — la mezcla de la fila es la evidencia, y el
   * "dominante" es el producto con más camiones distintos de esa calle.
   */
  const productMatrix = useMemo(() => {
    const byCam = new Map<string, Map<string, Set<string>>>()
    for (const r of baseRows) {
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
  }, [baseRows])

  /** Patentes únicas para la cámara seleccionada en el modal. */
  const selectedCamaraPatentes = useMemo(() => {
    if (!selectedCamaraForModal) return []
    const patentes = new Map<string, { count: number; lastTime: string }>()
    for (const r of baseRows.filter((x) => x.camara === selectedCamaraForModal)) {
      const p = String(r.patente ?? '').trim()
      if (!p) continue
      const existing = patentes.get(p) ?? { count: 0, lastTime: '' }
      patentes.set(p, {
        count: existing.count + 1,
        lastTime: r.timestamp > existing.lastTime ? r.timestamp : existing.lastTime,
      })
    }
    return [...patentes.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].lastTime.localeCompare(a[1].lastTime))
      .map(([patente, info]) => ({ patente, ...info }))
  }, [baseRows, selectedCamaraForModal])

  if (!allRows.length) {
    return (
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
        No hay datos en esta corrida. La tabla <code>{labels.tableName}</code> se genera al procesar KPI tiempos; si es
        una corrida guardada vieja, reprocesá el período (Análisis local → Transform → KPI) para verla.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <ComportamientoPorDiaBar
        dayBars={dayBars}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        hint={`camiones por día · clic para filtrar ${labels.entityPlural}`}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <p className="max-w-xl text-xs text-slate-500">
            Camiones por <strong>{labels.entitySingular}</strong>, por hora y por producto. Filtrado por los circuitos
            tildados. Período: {periodLabel}.
            {splitSource ? (
              <>
                {' '}
                El conteo es la <strong>descarga registrada en el Excel</strong> (plataforma <code>VOLCABLE_PTO</code>).
                {camOnlyTotal > 0 ? (
                  <>
                    {' '}
                    Otros <strong className="text-amber-700">{camOnlyTotal.toLocaleString()}</strong> camiones los vio
                    solo la cámara (sin Excel): posible error, se listan aparte y no se suman.
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          disabled={!rows.length}
          onClick={() =>
            triggerBrowserCsvDownload(
              safeExportFilename(labels.exportName, 'csv'),
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label={labels.trucksMetric} value={totals.trucks.toLocaleString()} />
        <MetricCard
          label="Prom. camiones/hora"
          value={totals.avgTrucksPerHour.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
          hint={periodHours ? `sobre ${periodHours} h con actividad` : undefined}
        />
        <MetricCard
          label="Mediana camiones/hora"
          value={totals.medianTrucksPerHour.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
          hint="valor central de la serie horaria"
        />
        <MetricCard label={labels.activityMetric} value={String(totals.cams)} />
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

      <Disclosure title="Detalle por cámara y patentes">
      {splitSource ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {perCamera.map((c) => (
            <div
              key={c.camara}
              className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm hover:shadow-md hover:border-violet-300 transition"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 font-mono text-base">{c.camara}</h3>
                <div className="h-2 w-2 rounded-full bg-green-500" />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-violet-50 border border-violet-200 p-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-600 tracking-wide">Recibidos (Excel)</div>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">{c.camiones.toLocaleString()}</div>
                </div>
                {splitSource && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                    <div className="text-[10px] font-semibold uppercase text-slate-600 tracking-wide">Solo cámara</div>
                    <div className="text-xl font-bold text-amber-700 tabular-nums">
                      {(camOnlyByCamera.get(c.camara) ?? 0) > 0
                        ? `+${(camOnlyByCamera.get(c.camara) ?? 0)}`
                        : '—'}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Prom/hora activa</span>
                  <span className="font-bold text-slate-900">
                    {(c.activeHours ? c.truckHours / c.activeHours : 0).toLocaleString('es-AR', {
                      maximumFractionDigits: 1,
                    })}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      · {c.activeHours} h
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Pico/hora</span>
                  <span className="font-bold text-slate-900">
                    {c.picoPorHora}
                    {c.picoLabel ? (
                      <span className="ml-1 text-[10px] font-normal text-slate-500">· {c.picoLabel}</span>
                    ) : null}
                  </span>
                </div>
              </div>

              <div className="h-1 bg-gradient-to-r from-violet-400 to-violet-600 rounded-full opacity-50" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">{labels.columnHeader}</th>
                <th className="px-4 py-3 text-right">Camiones recibidos</th>
                <th className="px-4 py-3 text-right">Prom. camiones/hora</th>
                <th className="px-4 py-3 text-right">Eventos</th>
                <th className="px-4 py-3 text-right">Pico por hora</th>
                {labels.showPatentesModal ? <th className="px-4 py-3 text-center">Patentes</th> : null}
              </tr>
            </thead>
            <tbody>
              {perCamera.map((c) => (
                <tr key={c.camara} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{c.camara}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.camiones.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sky-800">
                    {(c.activeHours ? c.truckHours / c.activeHours : 0).toLocaleString('es-AR', {
                      maximumFractionDigits: 1,
                    })}
                    <span className="ml-1 text-[10px] font-normal text-slate-400">· {c.activeHours} h</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.eventos.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.picoPorHora}
                    {c.picoLabel ? (
                      <span className="ml-1 text-[10px] font-normal text-slate-500">· {c.picoLabel}</span>
                    ) : null}
                  </td>
                  {labels.showPatentesModal ? (
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => setSelectedCamaraForModal(c.camara)}
                        className="rounded px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition"
                      >
                        Ver
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </Disclosure>
      <Disclosure title="Distribución por cámara, hora y cuarto de día">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Camiones por {labels.entitySingular}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Camiones distintos que pasó cada {labels.entitySingular} en el período, ordenadas de mayor a menor.
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perCamera} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="camara" tick={{ fontSize: 11 }} width={76} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="camiones" name="Camiones" fill="#7c3aed" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  <LabelList
                    dataKey="camiones"
                    position="right"
                    formatter={(v) => Number(v).toLocaleString()}
                    style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
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
            {labels.trucksMetric}, por hora
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Camiones distintos que pasaron por alguna {labels.entitySingular} en esa hora
            {labels.hourlyTrucksExcludeCameras?.length ? ' (excluye la calada líquida)' : ''}. La{' '}
            <span className="font-semibold text-emerald-700">hora pico de cada día</span> queda sombreada en verde y
            marcada con un punto. La línea punteada naranja marca la{' '}
            <span className="font-semibold text-orange-700">
              mediana ({totals.medianTrucksPerHour.toLocaleString('es-AR', { maximumFractionDigits: 1 })})
            </span>
            .
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trucksPerHour} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
                {/* Mediana: línea de referencia horizontal (naranja punteada). */}
                {totals.medianTrucksPerHour > 0 ? (
                  <ReferenceLine
                    y={totals.medianTrucksPerHour}
                    stroke="#ea580c"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: `Mediana ${totals.medianTrucksPerHour.toLocaleString('es-AR', {
                        maximumFractionDigits: 1,
                      })}`,
                      position: 'insideTopRight',
                      fill: '#ea580c',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                ) : null}
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

      </Disclosure>
      <Disclosure title="Productos por cámara">
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

      </Disclosure>
      {labels.showPatentesModal && selectedCamaraForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Patentes — {selectedCamaraForModal}</h3>
              <button
                onClick={() => setSelectedCamaraForModal(null)}
                className="text-slate-500 hover:text-slate-700 text-xl font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                {selectedCamaraPatentes.length} patentes únicas, {selectedCamaraPatentes.reduce((sum, p) => sum + p.count, 0)} pasadas totales
              </p>

              <div className="space-y-2">
                {selectedCamaraPatentes.map((p) => (
                  <div
                    key={p.patente}
                    className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="font-mono font-semibold text-slate-900">{p.patente}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-500">{p.count} pasadas</span>
                      <span className="text-xs text-slate-400">{new Date(p.lastTime).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedCamaraPatentes.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-8">Sin patentes registradas</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
