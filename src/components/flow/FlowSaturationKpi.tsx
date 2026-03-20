/**
 * KPI 3 — Flujo e ingreso de camiones.
 * Análisis de ingresos, ocupación en planta y momentos de saturación operativa.
 */

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  Legend,
} from 'recharts'
import { ChartExportButtons } from '../charts/ChartExportButtons'
import {
  computeHourlyFlow,
  computeHourlyFlowWeek,
  computeFlowSaturationMetrics,
  computeIngresoKpiMetrics,
  type HourlyFlow,
  type HourlyFlowWeekSlot,
} from '../../services/analyticsKpi'
import { UMBRAL_SATURACION, UMBRAL_ALERTA } from '../../config/flowSaturationThresholds'
import type { HistoricalTrip } from '../../domain/logistics'
import type { SiteId } from '../../domain/sites'

export interface FlowSaturationKpiProps {
  trips: HistoricalTrip[]
  siteId: SiteId
  periodPreset: 'last_day' | 'last_week' | 'last_month'
  refFecha: string
  plantName: string
  effectiveDate: string
}

type FlowPoint = {
  label: string
  camionesEnPlanta: number
  ingresos: number
  egresos: number
  saldoHorario: number
  hour: number
  day?: number
  slot: number
}

function buildFlowPoints(
  weekData: HourlyFlowWeekSlot[] | null,
  dayData: HourlyFlow[] | null
): FlowPoint[] {
  if (weekData && weekData.length > 0) {
    return weekData.map((s, i) => ({
      label: s.label,
      camionesEnPlanta: s.camionesEnPlanta,
      ingresos: s.ingresos,
      egresos: s.egresos,
      saldoHorario: s.saldoHorario,
      hour: s.hour,
      day: s.day,
      slot: i,
    }))
  }
  if (dayData && dayData.length > 0) {
    return dayData.map((h, i) => ({
      label: `${String(h.hour).padStart(2, '0')}`,
      camionesEnPlanta: h.simultaneos,
      ingresos: h.ingresos,
      egresos: h.egresos,
      saldoHorario: h.saldoHorario,
      hour: h.hour,
      slot: i,
    }))
  }
  return []
}

function generateFlowInsights(
  metrics: ReturnType<typeof computeFlowSaturationMetrics>,
  points: FlowPoint[],
  ingresoMetrics: ReturnType<typeof computeIngresoKpiMetrics>
): string[] {
  const lines: string[] = []
  if (metrics.picoEnPlanta > 0) {
    lines.push(`La planta alcanzó un pico de ${metrics.picoEnPlanta.toLocaleString('es-AR')} camiones en planta a las ${metrics.horaDelPico}.`)
  }
  if (metrics.horasSobreUmbral > 0) {
    lines.push(`Se registraron ${metrics.horasSobreUmbral} horas por encima del umbral de saturación (${metrics.pctTiempoSobreSaturacion.toFixed(1)}% del tiempo).`)
  }
  if (metrics.p90CamionesEnPlanta > 0 && metrics.picoEnPlanta > 0) {
    const ratio = metrics.p90CamionesEnPlanta / metrics.picoEnPlanta
    if (ratio >= 0.9) {
      lines.push(`El P90 (${Math.round(metrics.p90CamionesEnPlanta)}) está cerca del pico (${metrics.picoEnPlanta}): la planta pasa buena parte del tiempo cerca del límite.`)
    }
  }
  if (metrics.crucesUmbralAlerta > 0 || metrics.crucesUmbralSaturacion > 0) {
    const parts: string[] = []
    if (metrics.crucesUmbralAlerta > 0) parts.push(`${metrics.crucesUmbralAlerta} cruces del umbral de alerta`)
    if (metrics.crucesUmbralSaturacion > 0) parts.push(`${metrics.crucesUmbralSaturacion} cruces del umbral de saturación`)
    lines.push(`Se atravesó el umbral ${parts.join(' y ')}.`)
  }
  if (ingresoMetrics.picoDeLlegadas > 0) {
    lines.push(`El mayor pico de llegadas fue de ${ingresoMetrics.picoDeLlegadas} camiones/h (${ingresoMetrics.momentoPicoLlegadas}).`)
  }
  if (ingresoMetrics.ventanaPicoValor > 0 && ingresoMetrics.ventanaPicoDia !== '—') {
    lines.push(`El día con más ingresos fue ${ingresoMetrics.ventanaPicoDia} con ${ingresoMetrics.ventanaPicoValor.toLocaleString('es-AR')} camiones entrando.`)
  }
  if (ingresoMetrics.franjaCriticaNombre !== '—' && ingresoMetrics.franjaCriticaValor > 0) {
    lines.push(
      `La franja crítica (8h con más llegadas) es ${ingresoMetrics.franjaCriticaNombre}: ${ingresoMetrics.franjaCriticaValor} camiones (${ingresoMetrics.franjaCriticaPromedioPorHora.toFixed(1)} cam/h). Promedio general: ${ingresoMetrics.promedioIngresosPorHora.toFixed(1)} cam/h.`
    )
  }
  if (ingresoMetrics.backlogGenerado > 0) {
    lines.push(
      `Backlog: +${ingresoMetrics.backlogGenerado} camiones acumulados (${ingresoMetrics.backlogIntervalo}). Ocurre cuando entran más camiones de los que salen.`
    )
  }
  if (metrics.tiempoRecuperacionHoras != null && metrics.tiempoRecuperacionHoras > 0) {
    lines.push(`El episodio de saturación más largo duró ${metrics.tiempoRecuperacionHoras} horas.`)
  }
  if (lines.length === 0) lines.push('No hay datos suficientes para generar conclusiones.')
  return lines
}

export function FlowSaturationKpi({
  trips,
  siteId,
  periodPreset,
  refFecha,
  plantName,
  effectiveDate,
}: FlowSaturationKpiProps) {
  const refDateMs = new Date(refFecha + 'T12:00:00Z').getTime()
  const dayMs = 24 * 60 * 60 * 1000

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (t.siteId !== siteId) return false
      const fecha = t.fecha ?? `${new Date(t.egresoAt).getUTCFullYear()}-${String(new Date(t.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(t.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs
      if (periodPreset === 'last_day') return fecha === refFecha
      if (periodPreset === 'last_week') return daysDiff >= 0 && daysDiff <= 6
      return daysDiff >= 0 && daysDiff <= 30
    })
  }, [trips, siteId, periodPreset, refFecha, refDateMs, dayMs])

  const weekData = useMemo(() => {
    if (periodPreset !== 'last_week') return null
    return computeHourlyFlowWeek(filteredTrips, refDateMs, undefined)
  }, [filteredTrips, periodPreset, refDateMs])

  const dayData = useMemo(() => {
    if (periodPreset !== 'last_day') return null
    return computeHourlyFlow(filteredTrips, undefined)
  }, [filteredTrips, periodPreset])

  const monthData = useMemo(() => {
    if (periodPreset !== 'last_month') return null
    return computeHourlyFlow(filteredTrips, undefined)
  }, [filteredTrips, periodPreset])

  const points = useMemo(() => {
    return buildFlowPoints(weekData, dayData ?? monthData)
  }, [weekData, dayData, monthData])

  const slotsForMetrics = useMemo(() => {
    return points.map((p) => ({
      camionesEnPlanta: p.camionesEnPlanta,
      ingresos: p.ingresos,
      egresos: p.egresos,
      saldoHorario: p.saldoHorario,
      hour: p.hour,
      label: p.label,
    }))
  }, [points])

  const slotsForIngreso = useMemo(() => {
    return points.map((p, i) => ({
      ingresos: p.ingresos,
      egresos: p.egresos,
      camionesEnPlanta: p.camionesEnPlanta,
      saldoHorario: p.saldoHorario,
      hour: p.hour,
      day: p.day,
      label: p.label,
      slot: i,
    }))
  }, [points])

  const metrics = useMemo(
    () => computeFlowSaturationMetrics(slotsForMetrics, UMBRAL_SATURACION, UMBRAL_ALERTA),
    [slotsForMetrics]
  )

  const ingresoMetrics = useMemo(
    () => computeIngresoKpiMetrics(slotsForIngreso, refFecha),
    [slotsForIngreso, refFecha]
  )

  const insights = useMemo(() => generateFlowInsights(metrics, points, ingresoMetrics), [metrics, points, ingresoMetrics])

  const chartInterval = periodPreset === 'last_week' ? 23 : 0

  const picoIngresosSlots = useMemo(() => {
    if (ingresoMetrics.picoDeLlegadas <= 0) return []
    return points
      .map((p, i) => (p.ingresos === ingresoMetrics.picoDeLlegadas ? { label: p.label, value: p.ingresos, idx: i } : null))
      .filter((x): x is { label: string; value: number; idx: number } => x != null)
  }, [points, ingresoMetrics.picoDeLlegadas])

  const meta = { plant: plantName, period: effectiveDate }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">
          KPI 3 — Flujo e ingreso de camiones
        </h4>
        <p className="mt-0.5 text-xs text-slate-500">
          Análisis de ingresos, ocupación en planta y momentos de saturación operativa.
        </p>
      </div>

      {/* Parte 1: Camiones en planta — exportable por separado */}
      <ChartExportButtons
        filenamePrefix="kpi3_camiones_en_planta"
        csvData={points.map((p) => ({
          slot: p.label,
          camiones_en_planta: p.camionesEnPlanta,
          ingresos: p.ingresos,
          egresos: p.egresos,
        }))}
        meta={meta}
        title="KPI 3 — Camiones en planta"
      >
        <div className="space-y-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Camiones en planta
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">1. Pico en planta</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{metrics.picoEnPlanta.toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-500">máx. simultáneos</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">2. Horas sobre saturación</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{metrics.horasSobreUmbral.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500">horas en zona roja</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">3. Tiempo de recuperación</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">
              {metrics.tiempoRecuperacionHoras != null ? `${metrics.tiempoRecuperacionHoras} h` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">duración episodio máx.</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">4. P90 en planta</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{Math.round(metrics.p90CamionesEnPlanta).toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-500">nivel alto habitual</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">5. % tiempo sobre saturación</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{metrics.pctTiempoSobreSaturacion.toFixed(1)}%</div>
            <div className="text-[10px] text-slate-500">del período</div>
          </div>
        </div>

      {/* Gráfico Camiones en planta */}
      <div>
        <h5 className="mb-2 text-xs font-semibold text-slate-700">Camiones en planta por hora</h5>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 20, bottom: 24, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9 }}
                interval={chartInterval}
                angle={periodPreset === 'last_week' ? -45 : 0}
                textAnchor={periodPreset === 'last_week' ? 'end' : 'middle'}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, 'auto']} />
              <Tooltip
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as FlowPoint | undefined
                  if (!p) return null
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
                      <div className="font-semibold text-slate-800">{p.label}</div>
                      <div className="text-xs text-slate-600">En planta: {p.camionesEnPlanta} camiones</div>
                      <div className="text-xs text-slate-600">Ingresos: {p.ingresos} · Egresos: {p.egresos}</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={UMBRAL_ALERTA} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} />
              <ReferenceLine y={UMBRAL_SATURACION} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={2} />
              <ReferenceArea
                y1={UMBRAL_SATURACION}
                y2={Math.max(UMBRAL_SATURACION + 100, (metrics.picoEnPlanta || 0) + 20)}
                fill="#fecaca"
                fillOpacity={0.2}
              />
              <Line
                type="monotone"
                dataKey="camionesEnPlanta"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="Camiones en planta"
              />
              {metrics.picoEnPlanta > 0 && points[metrics.slotPico] && (
                <ReferenceDot
                  x={points[metrics.slotPico]!.label}
                  y={metrics.picoEnPlanta}
                  r={5}
                  fill="#ef4444"
                  stroke="white"
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Línea amarilla: umbral de alerta ({UMBRAL_ALERTA} camiones) · Línea roja: umbral de saturación ({UMBRAL_SATURACION} camiones)
        </p>
      </div>
        </div>
      </ChartExportButtons>

      {/* Parte 2: Ingresos — exportable por separado */}
      <ChartExportButtons
        filenamePrefix="kpi3_ingresos"
        csvData={points.map((p) => ({ slot: p.label, ingresos: p.ingresos }))}
        meta={meta}
        title="KPI 3 — Ingresos"
      >
        <div className="space-y-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Ingresos
          </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">1. Pico de llegadas</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{ingresoMetrics.picoDeLlegadas.toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-500">camiones/h · {ingresoMetrics.momentoPicoLlegadas}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">2. Ventana pico de llegadas (24h)</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">{ingresoMetrics.ventanaPicoValor.toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-500">camiones entraron · {ingresoMetrics.ventanaPicoDia}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">3. Franja crítica de ingreso (8h)</div>
            <div className="mt-0.5 text-sm font-bold text-slate-800">{ingresoMetrics.franjaCriticaNombre}</div>
            <div className="text-[10px] text-slate-500">
              {ingresoMetrics.franjaCriticaValor.toLocaleString('es-AR')} cam · {ingresoMetrics.franjaCriticaPromedioPorHora.toFixed(1)} cam/h en franja
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              Promedio general: {ingresoMetrics.promedioIngresosPorHora.toFixed(1)} cam/h
            </div>
          </div>
          <div
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
            title="Backlog: camiones que se acumularon en planta porque entraron más de los que salieron. Mide la presión sobre la operación cuando la planta no puede evacuar todo lo que recibe."
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">4. Backlog generado</div>
            <div className="mt-0.5 text-lg font-bold text-slate-800">+{ingresoMetrics.backlogGenerado.toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-slate-500">camiones · {ingresoMetrics.backlogIntervalo}</div>
            <div className="mt-1 text-[9px] text-slate-400">
              Acumulación: ingresos &gt; egresos
            </div>
          </div>
        </div>

          {/* Gráfico Ingresos */}
          <div>
          <h5 className="mb-2 text-xs font-semibold text-slate-700">Ingresos por hora</h5>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 10, right: 20, bottom: 24, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval={chartInterval}
                  angle={periodPreset === 'last_week' ? -45 : 0}
                  textAnchor={periodPreset === 'last_week' ? 'end' : 'middle'}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, 'auto']} />
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as FlowPoint | undefined
                    if (!p) return null
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
                        <div className="font-semibold text-slate-800">{p.label}</div>
                        <div className="text-xs text-green-600">Ingresos: {p.ingresos} camiones/h</div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {ingresoMetrics.ventanaPicoValor > 0 &&
                  points[ingresoMetrics.ventanaPicoSlotStart] &&
                  points[ingresoMetrics.ventanaPicoSlotEnd] && (
                    <ReferenceArea
                      x1={points[ingresoMetrics.ventanaPicoSlotStart]!.label}
                      x2={points[ingresoMetrics.ventanaPicoSlotEnd]!.label}
                      fill="#22c55e"
                      fillOpacity={0.15}
                    />
                  )}
                <Line
                  type="monotone"
                  dataKey="ingresos"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Ingresos"
                />
                {picoIngresosSlots.map((peak) => (
                  <ReferenceDot
                    key={`ing-${peak.label}-${peak.idx}`}
                    x={peak.label}
                    y={peak.value}
                    r={6}
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth={2}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {picoIngresosSlots.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              Día con más ingresos sombreado · Pico: {ingresoMetrics.picoDeLlegadas} cam/h en {picoIngresosSlots.map((p) => p.label).join(', ')}
            </p>
          )}
        </div>
        </div>
      </ChartExportButtons>

      {/* Parte 3: Lectura ejecutiva — exportable por separado */}
      <ChartExportButtons
        filenamePrefix="kpi3_lectura_ejecutiva"
        csvData={insights.map((line, i) => ({ punto: i + 1, texto: line }))}
        meta={meta}
        title="KPI 3 — Lectura operativa"
      >
      <div className="rounded-lg border border-slate-200 bg-slate-50/30 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Lectura operativa
        </div>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {insights.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
      </div>
      </ChartExportButtons>
    </div>
  )
}
