/**
 * Radar / telaraña de desempeño operativo (KPI 1).
 * Scores normalizados 0–100, más afuera = mejor.
 */

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from 'recharts'
import {
  buildRadarDataset,
  buildMergedRadarDataset,
  type RadarDataPoint,
  type StayStatsForRadar,
} from '../../lib/estadiaRadarScore'

export interface EstadiaRadarChartProps {
  stayStats: StayStatsForRadar
  /** Serie de comparación opcional (ej. semana anterior, planta referencia) */
  compareStats?: StayStatsForRadar
  compareLabel?: string
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RadarDataPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  const valorStr = p.unidad === '%' ? `${p.valorReal.toFixed(1)}%` : `${p.valorReal.toFixed(1)} ${p.unidad}`
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="font-semibold text-slate-800">{p.subject}</div>
      <div className="text-xs text-slate-600">Valor real: {valorStr}</div>
      <div className="text-xs text-slate-600">Score: {p.score.toFixed(0)} / 100</div>
    </div>
  )
}

export function EstadiaRadarChart({ stayStats, compareStats, compareLabel }: EstadiaRadarChartProps) {
  const data = useMemo(() => {
    if (compareStats && compareLabel) {
      return buildMergedRadarDataset(stayStats, compareStats)
    }
    return buildRadarDataset(stayStats)
  }, [stayStats, compareStats, compareLabel])

  const hasCompare = Boolean(compareStats && compareLabel)

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Perfil general de desempeño operativo</h4>
        <p className="mt-0.5 text-xs text-slate-500">
          Perfil más expandido = mejor desempeño · Perfil contraído = operación más lenta / dispersa / anómala
        </p>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 10 }}
              tickLine={false}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9 }}
              tickCount={5}
            />
            <Radar
              name="Actual"
              dataKey="score"
              stroke="#7c3aed"
              fill="#7c3aed"
              fillOpacity={0.35}
              strokeWidth={2}
            />
            {hasCompare && (
              <Radar
                name={compareLabel}
                dataKey="scoreCompare"
                stroke="#64748b"
                fill="#64748b"
                fillOpacity={0.15}
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {hasCompare && <Legend wrapperStyle={{ fontSize: 10 }} />}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 md:grid-cols-6">
        {data.map((d) => (
          <div key={d.metricKey} className="rounded bg-slate-50 px-2 py-1">
            <span className="font-medium text-slate-700">{d.subject}:</span>{' '}
            <span className="font-semibold text-violet-600">{d.score.toFixed(0)}</span>
            <span className="text-slate-500">/100</span>
          </div>
        ))}
      </div>
    </div>
  )
}
