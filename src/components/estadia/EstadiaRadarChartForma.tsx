/**
 * Radar de forma de la distribución.
 * Pico de frecuencia %, Camiones en rango central %, Camiones en cola derecha %.
 * Scores 0–100, más afuera = mejor.
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
} from 'recharts'
import { buildFormaRadarDataset, type FormaRadarDataPoint } from '../../lib/estadiaRadarFormaScore'
import type { IndicadoresForma } from '../../lib/distribucionForma'

export interface EstadiaRadarChartFormaProps {
  indicadores: IndicadoresForma
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FormaRadarDataPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  const valorStr = p.unidad === '%'
    ? `${p.valorReal.toFixed(1)}%`
    : `${p.valorReal.toFixed(1)} ${p.unidad}`
  const camionesStr = p.valorCamiones != null
    ? ` (${p.valorCamiones.toLocaleString('es-AR')} camiones)`
    : ''
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="font-semibold text-slate-800">{p.subject}</div>
      <div className="text-xs text-slate-600">Valor real: {valorStr}{camionesStr}</div>
      <div className="text-xs text-slate-600">Score: {p.score.toFixed(0)} / 100</div>
    </div>
  )
}

export function EstadiaRadarChartForma({ indicadores }: EstadiaRadarChartFormaProps) {
  const data = useMemo(() => buildFormaRadarDataset(indicadores), [indicadores])

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Perfil de forma de la distribución</h4>
        <p className="mt-0.5 text-xs text-slate-500">
          Métricas principales · Perfil más expandido = mejor concentración y menor dispersión
        </p>
      </div>
      <div className="h-[280px]">
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
              name="Forma"
              dataKey="score"
              stroke="#7c3aed"
              fill="#7c3aed"
              fillOpacity={0.35}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
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
