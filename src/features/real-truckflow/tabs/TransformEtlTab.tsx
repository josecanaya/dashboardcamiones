import { Fragment, useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ETL_DEV_MODE } from '../../../config/committeeEtlLite'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformPipeline'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  anomalySequenceSummaryCsv,
  buildAnomalyReviewSummary,
  buildCircuitClassificationIndex,
  buildCommitteeCircuitCrossTab,
  buildSuspiciousDischargeWithoutBalanza,
  buildSuspiciousSlExitRicReturn,
  rebuildCircuitClassificationIndex,
  ANOMALY_LIST_MIN_EVENTS,
  CIRCUIT_PIE_COLORS,
  committeeDrilldownCsv,
  committeeChartExportCsv,
  suspiciousDischargeCsv,
  suspiciousSlExitRicReturnCsv,
  trucksForCommitteeCrossTabCell,
  type AnomalyReviewSummary,
  type AnomalySequenceBreakdownRow,
  type CircuitClassificationEntry,
  type CommitteeCrossTabCategory,
  type CommitteeCircuitCrossTabRow,
  type SuspiciousDischargeWithoutBalanzaRow,
  type SuspiciousSlExitRicReturnRow,
  type CircuitClassificationIndex,
} from '../etlWorkbench/etlCircuitClassificationIndex'
import { committeePieFromGroup } from '../etlWorkbench/committeeClassification'
import { MovimientosContratoPanel } from '../components/MovimientosContratoPanel'
import { ExecutiveSampleProductFilter } from '../components/ExecutiveSampleProductFilter'
import {
  buildExecutiveProductFilterPlan,
  filterClassificationEntriesByJourneyIds,
  executiveSampleProductLabel,
  resolveAnalysisProductLookup,
  PRODUCT_FILTER_ALL,
} from '../etlWorkbench/etlProductFilter'

const DEV_EXPORT_DEF: {
  csvKey: keyof EtlTransformOutput['csv']
  filename: string
  label: string
}[] = [
  { csvKey: 'front_events', filename: 'front_events.csv', label: 'Eventos frontales' },
  { csvKey: 'rear_events', filename: 'rear_events.csv', label: 'Eventos traseros' },
  { csvKey: 'front_alerts', filename: 'front_alerts.csv', label: 'Alertas frontales' },
  { csvKey: 'rear_alerts', filename: 'rear_alerts.csv', label: 'Alertas traseras' },
  { csvKey: 'alerts_operational', filename: 'alerts_operational.csv', label: 'Alertas operativas' },
  { csvKey: 'camera_lpr_status', filename: 'camera_lpr_status.csv', label: 'Estado LPR cámaras' },
  { csvKey: 'clean_journeys', filename: 'clean_journeys.csv', label: 'Journeys limpios' },
  { csvKey: 'classified_circuits', filename: 'classified_circuits.csv', label: 'Circuitos (intermedio)' },
  { csvKey: 'final_circuits', filename: 'final_circuits.csv', label: 'Circuitos finales' },
  {
    csvKey: 'debug_matrix_classification',
    filename: 'debug_matrix_classification.csv',
    label: 'Debug matriz clasificación',
  },
  { csvKey: 'lpr_merge_candidates', filename: 'lpr_merge_candidates.csv', label: 'LPR merge candidatos' },
  { csvKey: 'lpr_merge_applied', filename: 'lpr_merge_applied.csv', label: 'LPR merge aplicados' },
  { csvKey: 'lpr_merge_review', filename: 'lpr_merge_review.csv', label: 'LPR merge revisión' },
  { csvKey: 'unclassified_journeys', filename: 'unclassified_journeys.csv', label: 'Sin clasificar' },
  { csvKey: 'rear_only_journeys_debug', filename: 'rear_only_journeys_debug.csv', label: 'Debug sólo traseros' },
  { csvKey: 'journey_merge_candidates', filename: 'journey_merge_candidates.csv', label: 'Candidatos merge' },
  { csvKey: 'merge_candidates_debug', filename: 'merge_candidates_debug.csv', label: 'Merge (solo sugerencias)' },
  { csvKey: 'transform_summary', filename: 'transform_summary.csv', label: 'Resumen transform' },
  { csvKey: 'segment_timing_kpi', filename: 'segment_timing_kpi.csv', label: 'KPI tiempos por tramo' },
  { csvKey: 'circuit_timing_summary', filename: 'circuit_timing_summary.csv', label: 'KPI tiempos por circuito' },
  { csvKey: 'circuit_timing_journeys', filename: 'circuit_timing_journeys.csv', label: 'Auditoría tiempos circuito' },
  {
    csvKey: 'external_movimientos_contrato_normalized',
    filename: 'external_movimientos_contrato_normalized.csv',
    label: 'Movimientos contrato normalizados',
  },
  { csvKey: 'merged_truckflow_movimientos', filename: 'merged_truckflow_movimientos.csv', label: 'Merge Truckflow + contrato' },
  { csvKey: 'clean_journeys_for_analysis', filename: 'clean_journeys_for_analysis.csv', label: 'Journeys análisis' },
  { csvKey: 'segment_scatter_analysis', filename: 'segment_scatter_analysis.csv', label: 'Dispersión por tramo' },
  { csvKey: 'segment_scatter_by_day', filename: 'segment_scatter_by_day.csv', label: 'Dispersión día (Power BI)' },
  { csvKey: 'operational_sample', filename: 'operational_sample.csv', label: 'Muestra operativa' },
  { csvKey: 'merge_summary', filename: 'merge_summary.csv', label: 'Resumen merge' },
]

function truncateMiddle(text: string, max = 12): string {
  const t = text.trim()
  if (t.length <= max) return t
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${t.slice(0, head)}…${t.slice(-tail)}`
}

function formatDateTimeShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

type CrossTabDrilldownKey = { code: string; category: CommitteeCrossTabCategory | 'total' }

const CROSS_TAB_CATEGORY_LABEL: Record<CommitteeCrossTabCategory | 'total', string> = {
  completos: 'Completos',
  variaciones: 'Variaciones',
  anomalias: 'Anomalías',
  total: 'Total circuito',
}

function CrossTabCountButton({
  count,
  pct,
  colorClass,
  active,
  disabled,
  onClick,
}: {
  count: number
  pct?: number
  colorClass: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  if (count <= 0) {
    return (
      <span className={`font-mono tabular-nums ${colorClass} opacity-40`}>
        0{pct != null ? ' (0%)' : ''}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Ver listado de camiones"
      className={`rounded px-1.5 py-0.5 font-mono tabular-nums underline-offset-2 transition hover:underline disabled:opacity-40 ${colorClass} ${
        active ? 'bg-indigo-100 ring-1 ring-indigo-300' : 'hover:bg-white/80'
      }`}
    >
      {count.toLocaleString()}
      {pct != null ? ` (${pct}%)` : ''}
    </button>
  )
}

function variationTypeBreakdown(entries: CircuitClassificationEntry[]): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const t = e.operationalVariationType.trim() || '(sin tipo)'
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

function AnomalySequenceDrilldown({
  row,
  onClose,
}: {
  row: AnomalySequenceBreakdownRow
  onClose: () => void
}) {
  const filename = `anomalias_recorrido_${row.sequenceKey.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 48)}.csv`

  return (
    <div className="rounded-lg border border-rose-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-bold text-rose-950">{row.displaySequence}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {row.count.toLocaleString()} camiones · {row.pctOfAnomalies}% del total anómalo · motivo principal:{' '}
            <span className="text-slate-700">{row.topCommitteeReason || '—'}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => triggerBrowserCsvDownload(filename, committeeDrilldownCsv(row.trucks))}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
      {row.reasonCounts.length > 1 ?
        <ul className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {row.reasonCounts.map((r) => (
            <li
              key={r.reason}
              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-rose-900"
            >
              {r.reason}: {r.count.toLocaleString()}
            </li>
          ))}
        </ul>
      : null}
      <ul className="mt-2 max-h-64 overflow-auto rounded border border-slate-100 text-[11px]">
        {row.trucks.map((t) => (
          <li
            key={`an-${t.journeyId}-${t.plate}`}
            className="border-b border-slate-100 px-2 py-1.5 last:border-0 odd:bg-slate-50/50"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold text-slate-900">{t.plate || '—'}</span>
              <span className="text-slate-600">{t.committeeReason || '—'}</span>
              {t.executiveCircuitDisplay ?
                <span className="text-[10px] text-slate-400" title="Circuito inferido (referencia, no agrupa la anomalía)">
                  ref. {t.executiveCircuitDisplay}
                </span>
              : null}
              <span className="font-mono text-[10px] text-slate-400" title={t.journeyId}>
                {truncateMiddle(t.journeyId, 18)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

type AnomalyPanelTab = 'recorrido' | 'sospechosos'

function SuspiciousSlExitRicReturnTable({ rows }: { rows: SuspiciousSlExitRicReturnRow[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-600">
          <strong>{rows.length.toLocaleString()}</strong> casos: salida San Lorenzo (egreso o balanza salida) y vuelta a
          Ricardone (ingreso, preingreso o calada) en <strong>&lt; 40 min</strong> (misma patente).
        </p>
        <button
          type="button"
          onClick={() =>
            triggerBrowserCsvDownload('anomalias_sospechosos_sl_salida_vuelta_ric.csv', suspiciousSlExitRicReturnCsv(rows))
          }
          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
        >
          CSV SL → Ric
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-amber-200">
        <table className="min-w-[1000px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-amber-100 bg-amber-50/70 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pl-3 pr-2 font-semibold">Día</th>
              <th className="py-2 px-2 font-semibold">Patente</th>
              <th className="py-2 px-2 font-semibold">Salida SL</th>
              <th className="py-2 px-2 font-semibold">Vuelta Ric</th>
              <th className="py-2 px-2 font-semibold">Δ min</th>
              <th className="py-2 pr-3 font-semibold">Journeys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`slric-${row.plate}-${row.slExitAt}-${i}`}
                className="border-b border-slate-100 odd:bg-white even:bg-amber-50/20"
              >
                <td className="whitespace-nowrap py-2 pl-3 pr-2 font-mono text-[11px] text-slate-700">{row.day}</td>
                <td className="py-2 px-2 font-mono font-bold text-slate-900">{row.plate}</td>
                <td className="py-2 px-2 text-[11px] text-slate-700">
                  <span className="block font-mono">{formatDateTimeShort(row.slExitAt)}</span>
                  <span className="text-[10px] text-slate-500">{row.slExitPoint}</span>
                </td>
                <td className="py-2 px-2 text-[11px] text-slate-700">
                  <span className="block font-mono">{formatDateTimeShort(row.ricReturnAt)}</span>
                  <span className="text-[10px] text-slate-500">{row.ricReturnPoint}</span>
                </td>
                <td className="py-2 px-2 font-mono font-semibold tabular-nums text-amber-950">{row.deltaMinutes}</td>
                <td className="py-2 pr-3 font-mono text-[10px] text-slate-400">
                  <span title={row.journeyUidAtExit}>exit {truncateMiddle(row.journeyUidAtExit, 14)}</span>
                  <br />
                  <span title={row.journeyUidAtReturn}>ret {truncateMiddle(row.journeyUidAtReturn, 14)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SuspiciousDischargePanel({
  dischargeRows,
  slRicRows,
}: {
  dischargeRows: SuspiciousDischargeWithoutBalanzaRow[]
  slRicRows: SuspiciousSlExitRicReturnRow[]
}) {
  if (!dischargeRows.length && !slRicRows.length) {
    return (
      <p className="mt-3 text-xs text-slate-500">
        No hay sospechosos en este período (descarga sin balanza ni vuelta rápida SL → Ricardone).
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-6">
      {slRicRows.length > 0 ? <SuspiciousSlExitRicReturnTable rows={slRicRows} /> : null}
      {dischargeRows.length > 0 ?
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              <strong>{dischargeRows.length.toLocaleString()}</strong> camiones con descarga instrumentada (C16, Volcable 1
              o 2) y <strong>sin</strong> balanza ingreso/egreso en el recorrido.
            </p>
            <button
              type="button"
              onClick={() =>
                triggerBrowserCsvDownload(
                  'anomalias_sospechosos_descarga_sin_balanza.csv',
                  suspiciousDischargeCsv(dischargeRows)
                )
              }
              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
            >
              CSV descarga sin balanza
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-200">
            <table className="min-w-[1100px] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-amber-100 bg-amber-50/70 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pl-3 pr-2 font-semibold">Inicio</th>
                  <th className="py-2 px-2 font-semibold">Fin</th>
                  <th className="py-2 px-2 font-semibold">Patente</th>
                  <th className="py-2 px-2 font-semibold">Punto descarga</th>
                  <th className="py-2 px-2 font-semibold">Recorrido</th>
                  <th className="py-2 px-2 font-semibold">Circuito ref.</th>
                  <th className="py-2 px-2 font-semibold">Comité</th>
                  <th className="py-2 pr-3 font-semibold">Journey</th>
                </tr>
              </thead>
              <tbody>
                {dischargeRows.map((row) => (
                  <tr
                    key={`susp-${row.journeyId}-${row.plate}`}
                    className="border-b border-slate-100 odd:bg-white even:bg-amber-50/20"
                  >
                    <td className="whitespace-nowrap py-2 pl-3 pr-2 font-mono text-[11px] text-slate-700">
                      {formatDateTimeShort(row.firstEventAt)}
                    </td>
                    <td className="whitespace-nowrap py-2 px-2 font-mono text-[11px] text-slate-700">
                      {formatDateTimeShort(row.lastEventAt)}
                    </td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900">{row.plate || '—'}</td>
                    <td className="py-2 px-2 font-semibold text-amber-950">{row.dischargePoint}</td>
                    <td
                      className="max-w-[240px] py-2 px-2 font-mono text-[10px] leading-snug text-slate-600"
                      title={row.detectedSequence}
                    >
                      {truncateMiddle(row.detectedSequence, 56)}
                    </td>
                    <td className="py-2 px-2 text-slate-600">{row.executiveCircuitDisplay || '—'}</td>
                    <td className="py-2 px-2">
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        {row.committeeGroup || '—'}
                      </span>
                      <span className="text-[11px] text-slate-600">{row.committeeReason || '—'}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-slate-400" title={row.journeyId}>
                      {truncateMiddle(row.journeyId, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      : null}
    </div>
  )
}

function AnomalyPanel({
  summary,
  suspiciousDischargeRows,
  suspiciousSlRicRows,
  expandedSequenceKey,
  onToggleSequence,
}: {
  summary: AnomalyReviewSummary
  suspiciousDischargeRows: SuspiciousDischargeWithoutBalanzaRow[]
  suspiciousSlRicRows: SuspiciousSlExitRicReturnRow[]
  expandedSequenceKey: string | null
  onToggleSequence: (key: string | null) => void
}) {
  const [panelTab, setPanelTab] = useState<AnomalyPanelTab>('recorrido')
  const totalCommitteeAnomalies = summary.incompleteCount + summary.listedAnomalyCount
  const suspiciousTotal = suspiciousDischargeRows.length + suspiciousSlRicRows.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPanelTab('recorrido')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
            panelTab === 'recorrido' ?
              'bg-rose-600 text-white shadow'
            : 'border border-rose-200 bg-white text-rose-900 hover:bg-rose-50'
          }`}
        >
          Por recorrido
          {totalCommitteeAnomalies > 0 ? ` (${totalCommitteeAnomalies.toLocaleString()})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setPanelTab('sospechosos')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
            panelTab === 'sospechosos' ?
              'bg-amber-600 text-white shadow'
            : 'border border-amber-300 bg-white text-amber-950 hover:bg-amber-50'
          }`}
        >
          Sospechosos
          {suspiciousTotal > 0 ? ` (${suspiciousTotal.toLocaleString()})` : ''}
        </button>
      </div>

      {panelTab === 'recorrido' ?
        <AnomalySequenceBreakdownPanel
          summary={summary}
          expandedSequenceKey={expandedSequenceKey}
          onToggleSequence={onToggleSequence}
        />
      : <SuspiciousDischargePanel dischargeRows={suspiciousDischargeRows} slRicRows={suspiciousSlRicRows} />}
    </div>
  )
}

function AnomalySequenceBreakdownPanel({
  summary,
  expandedSequenceKey,
  onToggleSequence,
}: {
  summary: AnomalyReviewSummary
  expandedSequenceKey: string | null
  onToggleSequence: (key: string | null) => void
}) {
  const { incompleteCount, sequenceRows, listedAnomalyCount } = summary
  const totalCommitteeAnomalies = incompleteCount + listedAnomalyCount

  if (totalCommitteeAnomalies <= 0) {
    return (
      <p className="mt-3 text-xs text-slate-500">No hay anomalías en este período.</p>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {incompleteCount > 0 ?
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold uppercase tracking-wide text-[10px]">Incompletos</span>
          <span className="font-mono text-lg font-bold tabular-nums">{incompleteCount.toLocaleString()}</span>
          <span className="text-amber-900/80">
            journeys con menos de {ANOMALY_LIST_MIN_EVENTS} eventos — no se listan por recorrido.
          </span>
        </div>
      : null}

      {listedAnomalyCount <= 0 ?
        <p className="text-xs text-slate-500">No hay anomalías con ≥{ANOMALY_LIST_MIN_EVENTS} eventos para desglosar.</p>
      : <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              <strong>{sequenceRows.length.toLocaleString()}</strong> recorridos distintos ·{' '}
              <strong>{listedAnomalyCount.toLocaleString()}</strong> anomalías (≥{ANOMALY_LIST_MIN_EVENTS} eventos)
              {incompleteCount > 0 ?
                <> · + {incompleteCount.toLocaleString()} incompletos</>
              : null}
            </p>
            <button
              type="button"
              onClick={() =>
                triggerBrowserCsvDownload('anomalias_por_recorrido.csv', anomalySequenceSummaryCsv(sequenceRows))
              }
              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100"
            >
              CSV resumen
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-rose-100">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50/50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pl-3 pr-2 font-semibold">Recorrido · cantidad</th>
                  <th className="py-2 px-2 font-semibold text-right">%</th>
                  <th className="py-2 px-2 font-semibold">Motivo principal</th>
                </tr>
              </thead>
              <tbody>
                {sequenceRows.map((row) => {
                  const open = expandedSequenceKey === row.sequenceKey
                  return (
                    <Fragment key={row.sequenceKey}>
                      <tr className="border-b border-slate-100 hover:bg-rose-50/30">
                        <td className="py-2 pl-3 pr-2">
                          <button
                            type="button"
                            onClick={() => onToggleSequence(open ? null : row.sequenceKey)}
                            className={`flex w-full flex-wrap items-center gap-2 text-left ${
                              open ? 'rounded bg-rose-50 ring-1 ring-rose-200 px-1 py-0.5' : ''
                            }`}
                          >
                            <span className="font-mono text-[11px] text-slate-800">{row.displaySequence}</span>
                            <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-rose-900">
                              {row.count.toLocaleString()}
                            </span>
                          </button>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">{row.pctOfAnomalies}%</td>
                        <td className="py-2 px-2 text-slate-600">{row.topCommitteeReason || '—'}</td>
                      </tr>
                      {open ?
                        <tr className="border-b border-slate-100 bg-rose-50/20">
                          <td colSpan={3} className="px-2 py-2">
                            <AnomalySequenceDrilldown row={row} onClose={() => onToggleSequence(null)} />
                          </td>
                        </tr>
                      : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      }
    </div>
  )
}

function CommitteeCrossTabDrilldown({
  row,
  category,
  onClose,
}: {
  row: CommitteeCircuitCrossTabRow
  category: CommitteeCrossTabCategory | 'total'
  onClose: () => void
}) {
  const trucks = trucksForCommitteeCrossTabCell(row, category)
  const variationBreakdown = category === 'variaciones' ? variationTypeBreakdown(trucks) : []
  const filename = `conciliacion_${row.code}_${category}.csv`

  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-indigo-950">
            {row.displayLabel} · {CROSS_TAB_CATEGORY_LABEL[category]} ({trucks.length.toLocaleString()})
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Patente, motivo comité y secuencia detectada — para revisar reglas de clasificación.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => triggerBrowserCsvDownload(filename, committeeDrilldownCsv(trucks))}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </div>
      {variationBreakdown.length ?
        <ul className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {variationBreakdown.map((v) => (
            <li
              key={v.type}
              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-sky-900"
            >
              {v.type}: {v.count.toLocaleString()}
            </li>
          ))}
        </ul>
      : null}
      <ul className="mt-2 max-h-64 overflow-auto rounded border border-slate-100 text-[11px]">
        {trucks.map((t) => (
          <li
            key={`${category}-${t.journeyId}-${t.plate}`}
            className="border-b border-slate-100 px-2 py-1.5 last:border-0 odd:bg-slate-50/50"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold text-slate-900">{t.plate || '—'}</span>
              {t.operationalVariationType ?
                <span className="rounded bg-sky-100 px-1 font-mono text-[10px] text-sky-800">
                  {t.operationalVariationType}
                </span>
              : null}
              <span className="text-slate-600" title={t.committeeReason}>
                {t.committeeReason || '—'}
              </span>
              <span className="font-mono text-[10px] text-slate-400" title={t.journeyId}>
                {truncateMiddle(t.journeyId, 18)}
              </span>
            </div>
            {t.detectedSequence ?
              <p className="mt-0.5 font-mono text-[10px] leading-snug text-slate-500" title={t.detectedSequence}>
                {truncateMiddle(t.detectedSequence, 72)}
              </p>
            : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TransformEtlTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult ?? null
  const exec = useMemo(() => tr?.stats.executive ?? null, [tr])
  const stats = useMemo(() => tr?.stats ?? null, [tr])
  const [expandedSlice, setExpandedSlice] = useState<string | null>(null)
  const [expandedCrossTab, setExpandedCrossTab] = useState<CrossTabDrilldownKey | null>(null)
  const [expandedAnomalySequence, setExpandedAnomalySequence] = useState<string | null>(null)
  const [executiveProductFilter, setExecutiveProductFilter] = useState(PRODUCT_FILTER_ALL)
  const [productFilterPending, startProductFilterTransition] = useTransition()
  const deferredProductFilter = useDeferredValue(executiveProductFilter)

  const productLookup = useMemo(
    () => resolveAnalysisProductLookup(tr?.csv),
    [tr?.csv?.excel_operations_with_truckflow, tr?.csv?.merged_truckflow_movimientos]
  )

  const [circuitClassIndex, setCircuitClassIndex] = useState<CircuitClassificationIndex>(() =>
    buildCircuitClassificationIndex('')
  )
  useEffect(() => {
    if (!tr?.csv.debug_matrix_classification) {
      setCircuitClassIndex(buildCircuitClassificationIndex(''))
      return
    }
    let cancelled = false
    const debugCsv = tr.csv.debug_matrix_classification
    const mergedCsv = tr.csv.merged_truckflow_movimientos
    const excelCsv = tr.csv.excel_operations_with_truckflow
    void (async () => {
      await yieldToBrowser()
      if (cancelled) return
      const idx = buildCircuitClassificationIndex(debugCsv, mergedCsv, excelCsv)
      if (!cancelled) setCircuitClassIndex(idx)
    })()
    return () => {
      cancelled = true
    }
  }, [
    tr?.csv.debug_matrix_classification,
    tr?.csv.merged_truckflow_movimientos,
    tr?.csv.excel_operations_with_truckflow,
  ])

  const executiveProductFilterPlan = useMemo(
    () =>
      productLookup ?
        buildExecutiveProductFilterPlan(circuitClassIndex.entries, productLookup)
      : null,
    [circuitClassIndex.entries, productLookup]
  )

  const displayClassIndex = useMemo(() => {
    if (!deferredProductFilter || deferredProductFilter === PRODUCT_FILTER_ALL) return circuitClassIndex
    const ids = executiveProductFilterPlan?.journeyIdsByProduct.get(deferredProductFilter) ?? new Set<string>()
    const filteredEntries = filterClassificationEntriesByJourneyIds(circuitClassIndex.entries, ids)
    return rebuildCircuitClassificationIndex(filteredEntries)
  }, [circuitClassIndex, deferredProductFilter, executiveProductFilterPlan])

  const executiveProductFilterActive = deferredProductFilter !== PRODUCT_FILTER_ALL
  const productFilterIsStale = executiveProductFilter !== deferredProductFilter

  const circuitClassificationPie = useMemo(() => {
    if (displayClassIndex.pieSlices.length) {
      return displayClassIndex.pieSlices.map((s) => {
        if (s.name === 'COMPLETOS') return { ...s, color: committeePieFromGroup('COMPLETOS').color }
        if (s.name === 'VARIACIONES OPERATIVAS') return { ...s, color: committeePieFromGroup('VARIACIONES_OPERATIVAS').color }
        if (s.name === 'ANOMALÍAS' || s.name === 'ANOMALIAS') return { ...s, color: committeePieFromGroup('ANOMALIAS').color }
        return s
      })
    }
    if (!exec) return []
    const completos = exec.committeeCompletos ?? exec.validos ?? 0
    const variaciones = exec.committeeVariaciones ?? 0
    const anomalias = exec.committeeAnomalias ?? exec.noEvaluables ?? 0
    return [
      { name: 'COMPLETOS', value: completos, color: committeePieFromGroup('COMPLETOS').color },
      { name: 'VARIACIONES OPERATIVAS', value: variaciones, color: committeePieFromGroup('VARIACIONES_OPERATIVAS').color },
      { name: 'ANOMALÍAS', value: anomalias, color: committeePieFromGroup('ANOMALIAS').color },
    ].filter((d) => d.value > 0)
  }, [displayClassIndex.pieSlices, exec])

  const circuitPieTotal = circuitClassificationPie.reduce((acc, d) => acc + Math.max(0, d.value), 0)
  const circuitBarData = useMemo(() => displayClassIndex.circuitBarSlices, [displayClassIndex.circuitBarSlices])
  const circuitBarTotal = circuitBarData.reduce((acc, d) => acc + d.count, 0)
  const committeeCrossTab = useMemo(
    () => buildCommitteeCircuitCrossTab(displayClassIndex.entries),
    [displayClassIndex.entries]
  )
  const filteredEntriesForAnomalies = useMemo(
    () => displayClassIndex.entries,
    [displayClassIndex.entries]
  )
  const anomalyReview = useMemo(
    () => buildAnomalyReviewSummary(filteredEntriesForAnomalies),
    [filteredEntriesForAnomalies]
  )
  const suspiciousDischargeRows = useMemo(
    () => buildSuspiciousDischargeWithoutBalanza(filteredEntriesForAnomalies),
    [filteredEntriesForAnomalies]
  )
  const suspiciousSlRicAllowedJourneyIds = useMemo(() => {
    if (!executiveProductFilterActive || !executiveProductFilterPlan) return null
    return executiveProductFilterPlan.journeyIdsByProduct.get(deferredProductFilter) ?? new Set<string>()
  }, [executiveProductFilterActive, executiveProductFilterPlan, deferredProductFilter])
  const suspiciousSlRicRows = useMemo(
    () =>
      buildSuspiciousSlExitRicReturn(wb?.events ?? [], {
        allowedJourneyIds: suspiciousSlRicAllowedJourneyIds,
      }),
    [wb?.events, suspiciousSlRicAllowedJourneyIds]
  )
  const suspiciousTotalCount = suspiciousDischargeRows.length + suspiciousSlRicRows.length
  const totalAnomalies = useMemo(
    () => anomalyReview.incompleteCount + anomalyReview.listedAnomalyCount,
    [anomalyReview]
  )
  const crossTabTotals = useMemo(() => {
    return committeeCrossTab.reduce(
      (acc, row) => ({
        total: acc.total + row.total,
        completos: acc.completos + row.completos,
        variaciones: acc.variaciones + row.variaciones,
      }),
      { total: 0, completos: 0, variaciones: 0 }
    )
  }, [committeeCrossTab])
  const circuitClassificationRows = useMemo(
    () =>
      circuitClassificationPie.map((d) => ({
        ...d,
        pct: circuitPieTotal > 0 ? Math.round((d.value / circuitPieTotal) * 10000) / 100 : 0,
        trucks: displayClassIndex.byPieSlice.get(d.name) ?? [],
      })),
    [circuitClassificationPie, displayClassIndex.byPieSlice, circuitPieTotal]
  )

  const downloadDevCsvs = () => {
    if (!tr?.csv) return
    for (const d of DEV_EXPORT_DEF) {
      const text = tr.csv[d.csvKey]
      if (text) triggerBrowserCsvDownload(d.filename, text)
    }
  }

  const downloadCommitteeChartCsv = (includeJourneyRows: boolean) => {
    if (!displayClassIndex.entries.length) return
    const csv = committeeChartExportCsv(
      {
        entries: displayClassIndex.entries,
        crossTab: committeeCrossTab,
        crossTabTotals,
        anomalyReview,
        circuitBarSlices: displayClassIndex.circuitBarSlices,
      },
      { includeJourneyRows }
    )
    triggerBrowserCsvDownload(
      includeJourneyRows ? 'conciliacion_comite_completa.csv' : 'conciliacion_comite_graficos.csv',
      csv
    )
  }

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        El workbench ETL no está disponible en este layout.
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50/90 via-white to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Transform</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Clasificación única de journeys y alertas para evidencia de comité. Los CSV intermedios solo están disponibles
          en modo diagnóstico DEV.
        </p>

        {!tr ?
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Aún no hay transform ejecutado. Cargá JSON en «Análisis local» y pulsá{' '}
            <strong>Procesar Transform</strong>.
          </p>
        : null}

        {wb.transformError ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
            {wb.transformError}
          </div>
        : null}

        {wb.transformBusy ?
          <p className="mt-4 text-sm font-semibold text-amber-800">Ejecutando transform…</p>
        : null}

        <div className="mt-5">
          <MovimientosContratoPanel wb={wb} />
        </div>
      </div>

      {exec ?
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">Resumen ejecutivo</h3>
          <p className="text-sm text-slate-600">
            Período:{' '}
            <span className="font-mono font-semibold">
              {exec.periodStart || '—'}
              {exec.periodEnd && exec.periodEnd !== exec.periodStart ? ` → ${exec.periodEnd}` : ''}
            </span>
            {' · '}
            Reglas: <span className="font-mono text-xs">{tr?.rulesVersion ?? '—'}</span>
          </p>

          <ExecutiveSampleProductFilter
            plan={executiveProductFilterPlan}
            value={executiveProductFilter}
            pending={productFilterPending || productFilterIsStale}
            onChange={(product) => {
              startProductFilterTransition(() => {
                setExecutiveProductFilter(product)
                setExpandedSlice(null)
                setExpandedCrossTab(null)
                setExpandedAnomalySequence(null)
              })
            }}
            className="rounded-2xl border border-violet-200 bg-violet-50/50 px-4 py-3"
          />
          {executiveProductFilterActive ?
            <p className="text-xs text-violet-800">
              Mostrando muestra filtrada por{' '}
              <strong>{executiveSampleProductLabel(deferredProductFilter)}</strong>:{' '}
              {displayClassIndex.total.toLocaleString()} journeys con producto en Excel. Torta, barras y conciliación
              reflejan solo este producto.
            </p>
          : null}

          <article
            aria-label="Gráfico clasificación operativa de circuitos"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Clasificación ejecutiva comité (3 categorías)
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Total de journeys clasificados:{' '}
              <span className="font-semibold tabular-nums text-slate-700">
                {circuitPieTotal.toLocaleString()}
              </span>
              . La torta responde: <strong>¿comité COMPLETOS o ANOMALÍAS?</strong> Con Movimientos por Contrato
              cargados, incluye la <strong>conciliación Excel-first</strong> (operaciones con evidencia Truckflow) y{' '}
              <strong>filas Excel aceite (OSL/PTO/ACEITE) sin match en cámaras</strong> como ancla{' '}
              <code className="text-[10px]">excel:…</code>.
              {!executiveProductFilterActive && circuitClassIndex.excelFirstReconciledCount > 0 ?
                <>
                  {' '}
                  <strong className="text-emerald-700">
                    {circuitClassIndex.excelFirstReconciledCount.toLocaleString()} journeys conciliados con Excel
                    {circuitClassIndex.excelPromotedCount > 0 ?
                      ` (${circuitClassIndex.excelPromotedCount.toLocaleString()} salieron de anomalías)`
                    : ''}
                    .
                  </strong>
                </>
              : !executiveProductFilterActive && circuitClassIndex.excelPromotedCount > 0 ?
                <>
                  {' '}
                  <strong className="text-emerald-700">
                    {circuitClassIndex.excelPromotedCount.toLocaleString()} camiones del Excel salieron de
                    anomalías y entraron a su circuito.
                  </strong>
                </>
              : null}
            </p>
            {circuitPieTotal === 0 ?
              <p className="mt-8 text-center text-sm text-slate-400">Sin datos para esta comparación.</p>
            : <div className="mt-2 h-[220px] w-full max-w-lg mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={circuitClassificationPie}
                      dataKey="value"
                      nameKey="name"
                      cx="38%"
                      cy="50%"
                      outerRadius={72}
                      innerRadius={36}
                      paddingAngle={2}
                      minAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {circuitClassificationPie.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined, _name: string | number, item: { payload?: { value?: number } }) =>
                        value != null ?
                          [
                            `${value.toLocaleString()} (${circuitPieTotal > 0 ? `${(((item?.payload?.value ?? 0) / circuitPieTotal) * 100).toFixed(2)}%` : '0%'})`,
                            'Cantidad',
                          ]
                        : ['', '']
                      }
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 11, lineHeight: '18px', paddingLeft: 4 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            }
            {circuitClassificationRows.length ?
              <div className="mt-4 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Expandí cada porción para ver patentes y journeys (útil para merge y limpieza).
                </p>
                {circuitClassificationRows.map((row) => {
                  const open = expandedSlice === row.name
                  return (
                    <div
                      key={`legend-${row.name}`}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/40"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedSlice(open ? null : row.name)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-white/80"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="font-semibold text-slate-700">{row.name}</span>
                          <span className="text-slate-400">({row.trucks.length} camiones)</span>
                        </div>
                        <span className="shrink-0 font-mono text-slate-900">
                          {row.value.toLocaleString()} · {row.pct.toFixed(2)}% {open ? '▾' : '▸'}
                        </span>
                      </button>
                      {open && row.name.includes('ANOMAL') ?
                        <div className="border-t border-slate-200 bg-white px-2 py-2">
                          <AnomalyPanel
                            summary={anomalyReview}
                            suspiciousDischargeRows={suspiciousDischargeRows}
                            suspiciousSlRicRows={suspiciousSlRicRows}
                            expandedSequenceKey={expandedAnomalySequence}
                            onToggleSequence={setExpandedAnomalySequence}
                          />
                        </div>
                      : open && row.trucks.length ?
                        <ul className="max-h-52 overflow-auto border-t border-slate-200 bg-white px-3 py-2 text-[11px]">
                          {row.trucks.map((t) => (
                            <li
                              key={`${row.name}-${t.journeyId}-${t.plate}`}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 py-1.5 last:border-0"
                            >
                              <span className="font-mono font-bold text-slate-900">{t.plate || '—'}</span>
                              {t.executiveCircuitDisplay ?
                                <span className="text-slate-600">{t.executiveCircuitDisplay}</span>
                              : null}
                              <span className="font-mono text-[10px] text-slate-400" title={t.journeyId}>
                                {truncateMiddle(t.journeyId, 16)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      : open ?
                        <p className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-400">Sin camiones en esta porción.</p>
                      : null}
                    </div>
                  )
                })}
              </div>
            : null}
          </article>

          <article
            aria-label="Gráfico de barras por circuito ejecutivo"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Camiones por circuito (matriz ejecutiva)
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Total de journeys con circuito asignado:{' '}
              <span className="font-semibold tabular-nums text-slate-700">
                {circuitBarTotal.toLocaleString()}
              </span>
              . Las barras indican <strong>qué plantilla R* / RS_* se asignó</strong>, no el veredicto del comité.
              Con Excel cargado, cada movimiento líquido/aceite sin Truckflow entra como fila <code className="text-[10px]">excel:…</code>{' '}
              (los chips de producto arriba cuentan <strong>operaciones Excel</strong>, no siempre 1:1 con journeys).
              Ej.: R7 (ruta Ric→SL) con ingreso/preingreso/calada/egreso → COMPLETOS; RS_REC con evidencia → COMPLETOS.
            </p>
            {circuitBarData.length === 0 ?
              <p className="mt-8 text-center text-sm text-slate-400">Sin datos de circuitos para este período.</p>
            : <div className="mt-3 h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={circuitBarData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="displayLabel"
                      width={168}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(value: number | undefined) =>
                        value != null ? [value.toLocaleString(), 'Camiones'] : ['', '']
                      }
                      labelFormatter={(label) => String(label)}
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            }
          </article>

          {committeeCrossTab.length > 0 ?
            <article
              aria-label="Conciliación circuito por categoría comité"
              className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 via-white to-white p-4 shadow-sm"
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">
                Conciliación comité — circuito × comité (válidos)
              </h4>
              <p className="mt-1 text-xs text-indigo-800/90">
                Cruce circuito R × categoría comité. Con XLSX cargados, la plataforma del Excel (
                VOLCABLE 1/2→R5/R6 Ricardone, VOLCABLE PTO 1/2/3/5→R7 sólidos, ACEITE OSL/PTO→SL1/SL5 o R8/R16 Ric, CELDA_16→R1) reemplaza RS_REC / SIN_PUNTO y saca
                anomalías conciliadas a su circuito real.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!displayClassIndex.entries.length}
                  onClick={() => downloadCommitteeChartCsv(false)}
                  className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:opacity-40"
                  title="Resúmenes para barras apiladas, torta y anomalías por recorrido"
                >
                  CSV gráficos
                </button>
                <button
                  type="button"
                  disabled={!displayClassIndex.entries.length}
                  onClick={() => downloadCommitteeChartCsv(true)}
                  className="rounded-lg border border-indigo-300 bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
                  title="Incluye una fila JOURNEY por camión con secuencia y clasificación"
                >
                  CSV completo
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Solo <strong>completos</strong> y <strong>variaciones</strong> por circuito R*. Las{' '}
                <strong>{totalAnomalies.toLocaleString()} anomalías</strong> se analizan abajo por recorrido
                observado, sin forzarlas a un circuito preseteado.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-indigo-100 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Circuito</th>
                      <th className="py-2 px-2 font-semibold text-right">Total</th>
                      <th className="py-2 px-2 font-semibold text-right text-emerald-700">Completos</th>
                      <th className="py-2 px-2 font-semibold text-right text-sky-700">Variaciones</th>
                      <th className="py-2 pl-2 font-semibold">Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {committeeCrossTab.map((row) => {
                      const toggle = (category: CommitteeCrossTabCategory | 'total') => {
                        setExpandedCrossTab((prev) =>
                          prev?.code === row.code && prev.category === category ? null : { code: row.code, category }
                        )
                      }
                      const isOpen = (category: CommitteeCrossTabCategory | 'total') =>
                        expandedCrossTab?.code === row.code && expandedCrossTab.category === category

                      return (
                        <Fragment key={row.code}>
                          <tr className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-800">{row.displayLabel}</td>
                            <td className="py-2 px-2 text-right">
                              <CrossTabCountButton
                                count={row.total}
                                colorClass="text-slate-800"
                                active={isOpen('total')}
                                onClick={() => toggle('total')}
                              />
                            </td>
                            <td className="py-2 px-2 text-right">
                              <CrossTabCountButton
                                count={row.completos}
                                pct={row.pctCompletos}
                                colorClass="text-emerald-700"
                                active={isOpen('completos')}
                                onClick={() => toggle('completos')}
                              />
                            </td>
                            <td className="py-2 px-2 text-right">
                              <CrossTabCountButton
                                count={row.variaciones}
                                pct={row.pctVariaciones}
                                colorClass="text-sky-700"
                                active={isOpen('variaciones')}
                                onClick={() => toggle('variaciones')}
                              />
                            </td>
                            <td className="py-2 pl-2 text-slate-600">
                              {row.code === 'R7' ?
                                row.variaciones > 0 ?
                                  'Ruta Ric→SL: espera calado / posible rechazo / recalado (cámaras)'
                                : row.pctCompletos >= 80 ?
                                  'Ruta Ric→SL con matriz lógica OK'
                                : 'Revisar casos incompletos en panel anomalías'
                              : row.code === 'R5' || row.code === 'R6' ?
                                row.variaciones > 0 ?
                                  'Volcable: espera calado / posible egreso / recalado (cámaras)'
                                : 'Circuito instrumentado OK'
                              : row.code === 'RS_REC' || row.code === 'RS_DESP' ?
                                row.pctCompletos >= 80 ?
                                  'Inferido sólido con evidencia → completos'
                                : 'Revisar incompletos en panel anomalías'
                              : row.code === 'SIN_PUNTO' ?
                                row.pctCompletos > 0 ?
                                  'Parte con ingreso+egreso+4 evt → completos'
                                : 'Sin patrón claro — ver anomalías por recorrido'
                              : row.variaciones > 0 ?
                                `Incluye ${row.variaciones.toLocaleString()} variación${row.variaciones === 1 ? '' : 'es'} operativa${row.variaciones === 1 ? '' : 's'}`
                              : row.pctCompletos >= 90 ?
                                'Circuito instrumentado OK'
                              : 'Mixto — revisar casos sueltos'}
                            </td>
                          </tr>
                          {expandedCrossTab?.code === row.code ?
                            <tr className="border-b border-slate-100 bg-indigo-50/30">
                              <td colSpan={5} className="px-2 py-2">
                                <CommitteeCrossTabDrilldown
                                  row={row}
                                  category={expandedCrossTab.category}
                                  onClose={() => setExpandedCrossTab(null)}
                                />
                              </td>
                            </tr>
                          : null}
                        </Fragment>
                      )
                    })}
                    <tr className="border-t border-indigo-200 bg-indigo-50/40 font-semibold text-slate-800">
                      <td className="py-2 pr-3">Total válidos</td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">{crossTabTotals.total.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-emerald-700">
                        {crossTabTotals.completos.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-sky-700">
                        {crossTabTotals.variaciones.toLocaleString()}
                      </td>
                      <td className="py-2 pl-2 text-slate-600">
                        + {totalAnomalies.toLocaleString()} anomalías (panel abajo)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          : null}

          {(totalAnomalies > 0 || suspiciousTotalCount > 0) ?
            <article
              aria-label="Anomalías por recorrido observado"
              className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/60 via-white to-white p-4 shadow-sm"
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-rose-900">
                Anomalías y sospechosos
              </h4>
              <p className="mt-1 text-xs text-slate-600">
                <strong>Por recorrido:</strong> incompletos (&lt;3 eventos) y anomalías agrupadas por secuencia.{' '}
                <strong>Sospechosos:</strong> vuelta a Ricardone en &lt;40 min tras salida San Lorenzo; y descarga en C16 /
                Volcable sin balanza.
                {executiveProductFilterActive ?
                  <>
                    {' '}
                    Filtrado por{' '}
                    <strong>{executiveSampleProductLabel(deferredProductFilter)}</strong> (mismo filtro del resumen).
                  </>
                : null}
              </p>
              <AnomalyPanel
                summary={anomalyReview}
                suspiciousDischargeRows={suspiciousDischargeRows}
                suspiciousSlRicRows={suspiciousSlRicRows}
                expandedSequenceKey={expandedAnomalySequence}
                onToggleSequence={setExpandedAnomalySequence}
              />
            </article>
          : null}

          <article
            aria-label="Apoyo San Lorenzo en transform"
            className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-white p-4 shadow-sm"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-teal-800">
              Apoyo San Lorenzo (etl_transform_v10)
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              Esta semana: apoyo ejecutivo SL <strong>desactivado</strong> y el circuito interno SL (S1/S5/S7 / SL1–SL7){' '}
              <strong>no se evalúa</strong>. La ruta operativa <strong>R7</strong> (ingreso → preingreso → calada →
              egreso → ingreso SLZ) sí se asigna y clasifica por matriz Ricardone + corroboración SL.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Completos (comité)" value={(exec.committeeCompletos ?? 0).toLocaleString()} />
              <Metric label="Variaciones operativas" value={(exec.committeeVariaciones ?? 0).toLocaleString()} />
              <Metric label="Anomalías (comité)" value={(exec.committeeAnomalias ?? 0).toLocaleString()} />
              <Metric label="Eventos frontales SL" value={(exec.slFrontEvents ?? 0).toLocaleString()} />
              <Metric
                label="Journeys con corroboración SL"
                value={(exec.slJourneysWithCorroboration ?? 0).toLocaleString()}
              />
              <Metric
                label="Journeys reforzados (motivo SL_*)"
                value={(exec.slJourneysExecutiveReinforced ?? 0).toLocaleString()}
              />
            </div>
            {(exec.slFrontEvents ?? 0) === 0 ?
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                No hay eventos de cámaras SL en este período. Verificá la extracción con Site ={' '}
                <strong>Todos</strong> y que la API devuelva dispositivos{' '}
                <span className="font-mono">SLZIngCamFrente</span>,{' '}
                <span className="font-mono">SLZBalIngFte</span>, etc. En la consola en vivo usá{' '}
                <strong>Ricardone + San Lorenzo</strong>.
              </p>
            : null}
          </article>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Eventos" value={exec.eventCount.toLocaleString()} />
            <Metric label="Alertas" value={exec.alertCount.toLocaleString()} />
            <Metric label="Circuitos válidos" value={(exec.validos || exec.completos + exec.deducidos).toLocaleString()} />
            <Metric label="Probables (inferidos)" value={(exec.probables || 0).toLocaleString()} />
            <Metric label="Merges aplicados" value={(exec.journeysMergedApplied || 0).toLocaleString()} />
            <Metric label="Válidos completos" value={(exec.validComplete || exec.completos).toLocaleString()} />
            <Metric label="Válidos deducidos" value={(exec.validDeduced || exec.deducidos).toLocaleString()} />
            <Metric label="Incompletos" value={exec.incompletos.toLocaleString()} />
            <Metric label="Anómalos" value={exec.anomalos.toLocaleString()} />
            <Metric label="No evaluables" value={(exec.noEvaluables || 0).toLocaleString()} />
            <Metric label="Alertas LPR (LPR_MALFUNCTION)" value={exec.lprAlerts.toLocaleString()} />
            <Metric label="Alertas operativas" value={exec.operationalAlerts.toLocaleString()} />
            <Metric
              label="Alertas operativas cruzadas"
              value={exec.operationalAlertsCrossed.toLocaleString()}
            />
            <Metric
              label="Journeys con INVALID_ROUTE"
              value={exec.journeysWithInvalidRoute.toLocaleString()}
            />
            <Metric
              label="Journeys con INVALID_START_JOURNEY"
              value={exec.journeysWithInvalidJourneyStart.toLocaleString()}
            />
            <Metric
              label="Incompletos con alerta operativa"
              value={exec.incompletosWithOperationalAlert.toLocaleString()}
            />
            <Metric
              label="Anómalos con alerta operativa"
              value={exec.anomalosWithOperationalAlert.toLocaleString()}
            />
            <Metric
              label="Estado exportación"
              value={exec.exportReady ? 'Listo para Load / Export' : 'Pendiente'}
            />
          </div>

          {ETL_DEV_MODE && stats?.validation.lprMalfunctionByCamera.length ?
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-700">
                Alertas LPR por cámara (DEV)
              </summary>
              <ul className="mt-2 grid gap-1 font-mono text-[11px] text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                {stats.validation.lprMalfunctionByCamera.slice(0, 20).map((r) => (
                  <li key={r.deviceCode}>
                    {r.deviceCode}: {r.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
          : null}
          <p className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
            Continuá en <strong>Load / Export</strong> para generar los archivos <span className="font-mono text-xs">pb_*</span>{' '}
            del comité.
          </p>
        </div>
      : null}

      {ETL_DEV_MODE && stats ?
        <details className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">
            Diagnóstico DEV — CSVs intermedios y métricas técnicas
          </summary>
          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap gap-2">
              {DEV_EXPORT_DEF.map((d) => (
                <button
                  key={d.filename}
                  type="button"
                  disabled={!tr?.csv[d.csvKey]}
                  onClick={() =>
                    tr?.csv[d.csvKey] ? triggerBrowserCsvDownload(d.filename, tr.csv[d.csvKey]) : undefined
                  }
                  className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs shadow-sm hover:bg-violet-50 disabled:opacity-40"
                >
                  <div className="font-bold text-violet-950">{d.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-600">{d.filename}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={downloadDevCsvs}
                disabled={!tr}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Descargar todos (DEV)
              </button>
            </div>

            <h4 className="text-sm font-bold text-slate-800">Paso 1 — clasificación frontal / trasera</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Eventos frontales" value={stats.step1.frontEvents.toLocaleString()} />
              <Metric label="Eventos traseros excl." value={stats.step1.rearEvents.toLocaleString()} />
              <Metric label="% eventos traseros (excl.)" value={`${stats.step1.pctExcludedEvents}%`} />
              <Metric label="Alertas frontales" value={stats.step1.frontAlerts.toLocaleString()} />
              <Metric label="Alertas traseras excl." value={stats.step1.rearAlerts.toLocaleString()} />
            </div>

            <h4 className="text-sm font-bold text-slate-800">Control de coherencia</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Circuitos finales" value={stats.coherence.final_circuits_count.toLocaleString()} />
              <Metric label="Circuitos completos" value={stats.coherence.final_circuitos_completos.toLocaleString()} />
              <Metric label="Incompletos revisión" value={stats.coherence.final_incompletos_revision.toLocaleString()} />
              <Metric label="Journeys tras filtro" value={stats.coherence.journeys_after_rear_filter.toLocaleString()} />
            </div>
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                stats.coherence.coherenceLabel === 'Coherente' ?
                  'border-emerald-200 bg-emerald-50 text-emerald-950'
                : stats.coherence.coherenceLabel === 'Fragmentación alta' ?
                  'border-rose-200 bg-rose-50 text-rose-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              <div className="font-bold">{stats.coherence.coherenceLabel}</div>
              {stats.coherence.coherenceDetail ?
                <p className="mt-2 text-[13px] leading-relaxed opacity-95">{stats.coherence.coherenceDetail}</p>
              : null}
            </div>

            <p className="text-xs text-slate-500">
              Candidatos merge: gap fijo 120 min — merge automático no aplicado; ver{' '}
              <span className="font-mono">merge_candidates_debug.csv</span>.
            </p>
          </div>
        </details>
      : null}
    </section>
  )
}
