import type { OperationalAlert } from '../../domain/logistics'
import type { FlowBucketPoint, SaturationAnalysisResult, SaturationEpisode } from '../../services/saturationAnalytics'
import { buildSaturationNarrative } from '../../services/saturationAnalytics'

export function SaturationNarrative({
  result,
  selectedEpisode,
  detailFlowSeries,
  alertsInRange,
}: {
  result: SaturationAnalysisResult
  selectedEpisode: SaturationEpisode | null
  detailFlowSeries: FlowBucketPoint[]
  alertsInRange: OperationalAlert[]
}) {
  const bullets = buildSaturationNarrative(result, {
    selectedEpisode,
    detailFlowSeries,
    alertsInRange,
  })

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Lectura automática</div>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-400">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
