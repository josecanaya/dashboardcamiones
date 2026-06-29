import { useMemo } from 'react'
import type { RicCalLiqCohort } from '../etlWorkbench/liquidMovementsWorkbench'
import {
  SL_LIQUIDOS_S10_ALL_DEVICES,
  RIC_LIQUIDO_CAMERA,
  PERMITTED_ACEITE_LIQUID_DISCHARGE_PLATFORMS,
} from '../etlWorkbench/slLiquidCameras'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'

const COHORT_LABELS: Record<RicCalLiqCohort, string> = {
  liquido_recepcion_ric: 'Recepción líquido Ric (R8)',
  liquido_despacho_ric: 'Despacho líquido Ric (R16)',
  transile_externo_ric_sl: 'Transile externo Ric → SL',
  despacho_generico_calada: 'Despacho / calada (RicCalLiq)',
  sl_liquido_san_lorenzo: 'SL1 / SL5 líquidos (S10)',
  ambiguo_riccalliq: 'RicCalLiq ambiguo',
  sin_riccalliq: 'Sin RicCalLiq',
}

type Props = {
  ricCsv?: string
  slCsv?: string
  aceiteCrossCsv?: string
  summaryCsv?: string
  disabled?: boolean
}

function parseSummary(csv: string | undefined): Record<string, string> {
  if (!csv?.trim()) return {}
  const { rows } = parseCsvToRecords(csv)
  return rows[0] ?? {}
}

export function LiquidMovementsPanel({ ricCsv, slCsv, aceiteCrossCsv, summaryCsv, disabled }: Props) {
  const summary = useMemo(() => parseSummary(summaryCsv), [summaryCsv])
  const slRows = useMemo(() => {
    if (!slCsv?.trim()) return []
    return parseCsvToRecords(slCsv).rows
  }, [slCsv])

  const aceiteCrossRows = useMemo(() => {
    if (!aceiteCrossCsv?.trim()) return []
    return parseCsvToRecords(aceiteCrossCsv).rows
  }, [aceiteCrossCsv])

  const aceitePlatformLabels = PERMITTED_ACEITE_LIQUID_DISCHARGE_PLATFORMS.map((p) =>
    p.replace(/_/g, ' ')
  ).join(' · ')

  const cohortChips = useMemo(() => {
    return (Object.keys(COHORT_LABELS) as RicCalLiqCohort[])
      .map((k) => ({
        key: k,
        label: COHORT_LABELS[k],
        count: Number(summary[`cohort_${k}`] ?? 0),
      }))
      .filter((c) => c.count > 0)
  }, [summary])

  if (!ricCsv?.trim() && !slCsv?.trim()) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ejecutá el <strong>Transform</strong> con movimientos Excel para generar el informe de líquidos
        (RicCalLiq + SL1/SL5 S10).
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs text-slate-600">
        <strong>Excel-first</strong> (una fila = un movimiento del Excel):{' '}
        <strong>Ricardone</strong> busca <strong>{RIC_LIQUIDO_CAMERA}</strong> en Truckflow;{' '}
        <strong>San Lorenzo</strong> ({aceitePlatformLabels}) busca <strong>S10</strong> (
        {SL_LIQUIDOS_S10_ALL_DEVICES.join(', ')}). Columna <code className="text-[10px]">analysis_ready_for_scatter</code>{' '}
        indica si podés usar <strong>KPI → Tiempos</strong> (R8, R16, SL1, SL5).
      </p>

      <div className="flex flex-wrap gap-2">
        {cohortChips.map((c) => (
          <span
            key={c.key}
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-950"
          >
            {c.label}: {c.count}
          </span>
        ))}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Ops con RicCalLiq</dt>
          <dd className="font-bold tabular-nums text-slate-900">{summary.riccalliq_operations ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Excel aceite (plataformas)</dt>
          <dd className="font-bold tabular-nums text-slate-900">{summary.aceite_platform_excel_ops ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Excel aceite ↔ Truckflow</dt>
          <dd className="font-bold tabular-nums text-slate-900">
            {summary.aceite_platform_excel_with_truckflow ?? '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Con cámara clave OK</dt>
          <dd className="font-bold tabular-nums text-slate-900">
            {summary.truckflow_s10_with_excel_match ?? '—'} / {summary.aceite_platform_excel_ops ?? '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Ops líquidos (Excel)</dt>
          <dd className="font-bold tabular-nums text-slate-900">{summary.sl1_sl5_operations ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Con captura S10</dt>
          <dd className="font-bold tabular-nums text-slate-900">{summary.aceite_platform_s10_captured ?? summary.sl1_sl5_s10_captured ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Puente Ric → SL</dt>
          <dd className="font-bold tabular-nums text-slate-900">{summary.bridge_ric_sl_count ?? '—'}</dd>
        </div>
      </dl>

      {aceiteCrossRows.length > 0 ?
        <div className="overflow-x-auto rounded-lg border border-amber-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-amber-50 text-[10px] uppercase text-amber-900">
              <tr>
                <th className="px-2 py-2">Sitio</th>
                <th className="px-2 py-2">Patente</th>
                <th className="px-2 py-2">Truckflow</th>
                <th className="px-2 py-2">Cámara</th>
                <th className="px-2 py-2">Brecha</th>
              </tr>
            </thead>
            <tbody>
              {aceiteCrossRows.slice(0, 20).map((r, i) => (
                <tr key={`${r.external_operation_id ?? r.plate_normalized}-${i}`} className="border-t border-amber-100">
                  <td className="px-2 py-1.5">{r.audit_site}</td>
                  <td className="px-2 py-1.5 font-mono">{r.plate_normalized}</td>
                  <td className="px-2 py-1.5">{r.truckflow_matched === 'true' ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1.5">{r.camera_captured === 'true' ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1.5 text-[10px]">{r.gap_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : null}

      {slRows.length > 0 ?
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Sitio</th>
                <th className="px-2 py-2">Plataforma Excel</th>
                <th className="px-2 py-2">Circuito</th>
                <th className="px-2 py-2">Patente</th>
                <th className="px-2 py-2">RicCalLiq</th>
                <th className="px-2 py-2">S10</th>
                <th className="px-2 py-2">Truckflow</th>
                <th className="px-2 py-2">Tiempos OK</th>
              </tr>
            </thead>
            <tbody>
              {slRows.slice(0, 25).map((r) => (
                <tr key={String(r.external_operation_id)} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-[10px]">{r.audit_site || '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.excel_platform || '—'}</td>
                  <td className="px-2 py-1.5 font-medium">{r.circuit}</td>
                  <td className="px-2 py-1.5 font-mono">{r.plate_normalized}</td>
                  <td className="px-2 py-1.5">{r.riccalliq_captured === 'true' ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1.5">{r.s10_captured === 'true' ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1.5">{r.excel_in_truckflow_window === 'true' ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1.5">{r.analysis_ready_for_scatter === 'true' ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {slRows.length > 25 ?
            <p className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500">
              +{slRows.length - 25} filas en CSV
            </p>
          : null}
        </div>
      : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !ricCsv}
          onClick={() => ricCsv && triggerBrowserCsvDownload('liquid_movements_riccalliq_cohort.csv', ricCsv)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          CSV cohorte RicCalLiq
        </button>
        <button
          type="button"
          disabled={disabled || !slCsv}
          onClick={() => slCsv && triggerBrowserCsvDownload('liquid_movements_sl1_sl5_s10.csv', slCsv)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          CSV Excel aceite ↔ S10
        </button>
        <button
          type="button"
          disabled={disabled || !aceiteCrossCsv}
          onClick={() =>
            aceiteCrossCsv &&
            triggerBrowserCsvDownload('liquid_movements_aceite_truckflow_excel.csv', aceiteCrossCsv)
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          CSV brechas Excel-first (sin Truckflow o sin cámara)
        </button>
      </div>
    </div>
  )
}
