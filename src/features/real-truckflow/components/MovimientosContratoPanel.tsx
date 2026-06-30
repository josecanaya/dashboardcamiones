import { useMemo } from 'react'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformPipeline'
import type { ContractFirstProgressEvent } from '../etlWorkbench/etlContractFirstProgress'
import type { EtlDiskPeriod } from '../etlWorkbench/EtlWorkbenchContext'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'

type WbSlice = {
  movimientosContratoFileNames: string[]
  tiemposEntrePasosFileNames: string[]
  loadMovimientosContratoXlsx: (list: FileList | File[]) => Promise<void>
  clearMovimientosContrato: () => void
  runTransform: () => Promise<EtlTransformOutput | null>
  transformBusy: boolean
  busyLoad: boolean
  events: RealJourneyEventDto[]
  alerts: { length: number }
  transformResult: EtlTransformOutput | null
  contractFirstProgress?: ContractFirstProgressEvent | null
  diskPeriod?: EtlDiskPeriod | null
}

const MERGE_EXPORTS: { key: keyof EtlTransformOutput['csv']; filename: string; label: string }[] = [
  { key: 'excel_operations_with_truckflow', filename: 'excel_operations_with_truckflow.csv', label: 'Excel-first operaciones' },
  { key: 'excel_operation_segments_for_scatter', filename: 'excel_operation_segments_for_scatter.csv', label: 'Excel-first tramos scatter' },
  { key: 'excel_no_truckflow_evidence_diagnostics', filename: 'excel_no_truckflow_evidence_diagnostics.csv', label: 'Diagnóstico sin evidencia' },
  { key: 'excel_first_review_sample', filename: 'excel_first_review_sample.csv', label: 'Muestra revisión Excel-first' },
  { key: 'excel_first_merge_summary', filename: 'excel_first_merge_summary.csv', label: 'Excel-first resumen' },
  { key: 'excel_first_by_product_platform', filename: 'excel_first_by_product_platform.csv', label: 'Excel-first por producto/plataforma' },
  { key: 'merged_truckflow_movimientos', filename: 'merged_truckflow_movimientos.csv', label: 'Merge completo' },
  { key: 'clean_journeys_for_analysis', filename: 'clean_journeys_for_analysis.csv', label: 'Análisis listo' },
  { key: 'external_movimientos_contrato_normalized', filename: 'external_movimientos_contrato_normalized.csv', label: 'Externos normalizados' },
  { key: 'merge_summary', filename: 'merge_summary.csv', label: 'Resumen merge' },
  { key: 'segment_scatter_analysis', filename: 'segment_scatter_analysis.csv', label: 'Dispersión tramos' },
  { key: 'segment_scatter_by_day', filename: 'segment_scatter_by_day.csv', label: 'Dispersión día (Power BI)' },
  { key: 'operational_sample', filename: 'operational_sample.csv', label: 'Muestra operativa' },
  {
    key: 'journeys_enriched_sin_punto_descarga',
    filename: 'journeys_enriched_sin_punto_descarga.csv',
    label: 'Sin descarga cámara + producto',
  },
]

export function MovimientosContratoPanel({ wb, compact }: { wb: WbSlice; compact?: boolean }) {
  const mc = wb.transformResult?.stats.movimientosContrato
  const filesLoaded = wb.movimientosContratoFileNames.length
  const needsRerun = filesLoaded > 0 && mc && !mc.enabled
  const parseFailed = mc?.enabled && (mc.rawCount ?? 0) === 0
  const mergeOk = mc?.enabled && (mc.withProduct ?? 0) > 0

  const productCounts = useMemo(() => {
    const excelCsv = wb.transformResult?.csv.excel_operations_with_truckflow
    const csv = excelCsv?.trim() ? excelCsv : wb.transformResult?.csv.merged_truckflow_movimientos
    if (!csv?.trim()) return []
    const { rows } = parseCsvToRecords(csv)
    const m = new Map<string, number>()
    for (const r of rows) {
      const p = String(r.resolved_product ?? r.product_normalized ?? r.producto_original ?? '').trim()
      if (!p) continue
      m.set(p, (m.get(p) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }, [
    wb.transformResult?.csv.excel_operations_with_truckflow,
    wb.transformResult?.csv.merged_truckflow_movimientos,
  ])

  const canTransform = wb.events.length > 0 || wb.alerts.length > 0

  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        mergeOk ?
          'border-emerald-300 bg-emerald-50/80'
        : needsRerun ?
          'border-amber-400 bg-amber-50'
        : parseFailed ?
          'border-rose-300 bg-rose-50'
        : 'border-emerald-200 bg-emerald-50/50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Movimientos por Contrato + producto</h3>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-700">
            Cargá los XLSX <strong>antes</strong> de «Procesar Transform»:{' '}
            <strong>MovimientosPorContrato</strong> y/o <strong>TiemposEntrePasos</strong> (balanza SL, 17–21 jun).
          </p>
        </div>
        {!compact && canTransform ?
          <button
            type="button"
            disabled={wb.busyLoad || wb.transformBusy || !filesLoaded}
            onClick={() => void wb.runTransform()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {wb.transformBusy ? 'Procesando…' : 'Re-procesar con XLSX'}
          </button>
        : null}
      </div>

      <label className="mt-3 inline-flex cursor-pointer flex-col text-sm">
        <span className="text-xs font-semibold text-slate-800">Archivos XLSX (Movimientos + TiemposEntrePasos)</span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          disabled={wb.busyLoad || wb.transformBusy}
          className="mt-1 max-w-full text-xs"
          onChange={(ev) => {
            const fs = ev.target.files
            if (fs?.length) void wb.loadMovimientosContratoXlsx(fs)
          }}
        />
      </label>

      {filesLoaded > 0 || wb.tiemposEntrePasosFileNames.length > 0 ?
        <p className="mt-2 text-[11px] font-medium text-slate-800">
          Movimientos: {wb.movimientosContratoFileNames.length} —{' '}
          {wb.movimientosContratoFileNames.join(', ') || '—'}
          {wb.tiemposEntrePasosFileNames.length > 0 ?
            <>
              <br />
              TiemposEntrePasos: {wb.tiemposEntrePasosFileNames.length} —{' '}
              {wb.tiemposEntrePasosFileNames.join(', ')}
            </>
          : null}
          <button
            type="button"
            className="ml-2 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-white"
            onClick={() => wb.clearMovimientosContrato()}
          >
            Quitar
          </button>
        </p>
      : null}

      {wb.transformBusy && wb.contractFirstProgress ?
        <div className="mt-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          <p className="font-semibold">Paso 3 en curso</p>
          <p className="mt-1">
            {wb.contractFirstProgress.label} —{' '}
            {wb.contractFirstProgress.total > 0 ?
              `${wb.contractFirstProgress.current}/${wb.contractFirstProgress.total}`
            : '…'}
          </p>
        </div>
      : null}

      {needsRerun ?
        <p className="mt-3 rounded-lg border border-amber-500 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950">
          Tenés XLSX cargados pero el último Transform <strong>no los usó</strong>. Volvé a «Análisis local» o pulsá
          «Re-procesar con XLSX».
        </p>
      : null}

      {parseFailed ?
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-xs text-rose-950">
          <p className="font-semibold">No se leyeron filas de los XLSX.</p>
          <p className="mt-1">Revisá que el archivo tenga columna Patente y filas de datos. Avisos:</p>
          <ul className="mt-1 list-inside list-disc font-mono text-[10px]">
            {(mc?.warnings ?? []).slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      : null}

      {mc?.enabled ?
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Operaciones Excel (total)"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.total_excel_operations ?? mc.normalizedCount ?? 0)}
          />
          <Metric
            label="Excel con evidencia Truckflow"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.total_with_truckflow_evidence ?? 0)}
          />
          <Metric
            label="Excel sin evidencia Truckflow"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.total_without_truckflow_evidence ?? 0)}
          />
          <Metric
            label="Excel fragmentadas"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.external_match_fragmented ?? 0)}
          />
          <Metric
            label="Listas para scatter (Excel-first)"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.ready_for_scatter ?? 0)}
          />
          <Metric
            label="Listas KPI ruta completa"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.ready_for_full_route_kpi ?? 0)}
          />
          <Metric
            label="Journeys en pool merge"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.truckflow_journeys_in_merge_pool ?? mc.truckflowJourneys ?? 0)}
          />
          <Metric
            label="Cobertura Excel-first"
            value={
              mc.normalizedCount > 0 ?
                `${Number((mc.excelFirst as Record<string, unknown> | undefined)?.coverage_excel_first_pct ?? 0)}%`
              : '—'
            }
          />
          {(mc.excelFirst as Record<string, unknown> | undefined)?.period_mismatch ?
            <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-rose-400 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-950">
              PERIOD_MISMATCH: Truckflow no cubre el rango de los XLSX (
              {String((mc.excelFirst as Record<string, unknown>).excel_min_source_date ?? '?')} →{' '}
              {String((mc.excelFirst as Record<string, unknown>).excel_max_source_date ?? '?')}). Muchos
              NO_TRUCKFLOW_EVIDENCE pueden deberse a esto, no a falla del merge.
            </div>
          : null}
          <Metric
            label="Sin evidencia: patente no en Truckflow"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.no_evidence_no_plate_in_truckflow ?? 0)}
          />
          <Metric
            label="Sin evidencia: fuera de ventana"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.no_evidence_plate_out_of_window ?? 0)}
          />
          <Metric
            label="Sin evidencia: fuera de período"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.no_evidence_outside_period ?? 0)}
          />
          <Metric
            label="Sin evidencia: horarios inválidos TF"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.no_evidence_invalid_truckflow_time ?? 0)}
          />
          <Metric
            label="Wide window matches"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.external_match_wide_window ?? 0)}
          />
          <Metric
            label="Low confidence matches"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.external_match_low_confidence ?? 0)}
          />
          <Metric
            label="Anómalos rescatados (Excel)"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.rescued_anomalous ?? 0)}
          />
          <Metric
            label="Sin punto rescatados (Excel)"
            value={Number((mc.excelFirst as Record<string, unknown> | undefined)?.rescued_no_discharge_point ?? 0)}
          />
          <Metric label="Movimientos leídos" value={mc.normalizedCount} />
          <Metric label="Con producto (XLSX)" value={mc.withProduct ?? 0} />
          <Metric label="Con patente (XLSX)" value={mc.withPlate ?? 0} />
          <Metric
            label="Journeys con producto"
            value={Number((mc.merge as Record<string, unknown>).journeys_with_product ?? 0)}
          />
          <Metric
            label="Enriquecidos operativos"
            value={Number((mc.merge as Record<string, unknown>).operational_enrichment_ready ?? 0)}
          />
          <Metric
            label="Sin descarga cámara + externo"
            value={Number((mc.merge as Record<string, unknown>).enriched_sin_descarga_camara ?? 0)}
          />
          <Metric
            label="Match Excel → Truckflow"
            value={Number((mc.merge as Record<string, unknown>).match_excel_anchor ?? 0)}
          />
          <Metric
            label="Cobertura Excel"
            value={
              mc.normalizedCount > 0 ?
                `${Math.round(Number((mc.merge as Record<string, unknown>).match_rate_movimientos ?? 0) * 100)}%`
              : '—'
            }
          />
          <Metric
            label="Enriquecido patente+día"
            value={Number((mc.merge as Record<string, unknown>).match_enriched_plate_day ?? 0)}
          />
          <Metric
            label="Match exacto"
            value={Number((mc.merge as Record<string, unknown>).match_exact ?? 0)}
          />
          <Metric
            label="Match probable"
            value={Number((mc.merge as Record<string, unknown>).match_probable ?? 0)}
          />
          <Metric
            label="Sin match externo"
            value={Number((mc.merge as Record<string, unknown>).no_external_match ?? 0)}
          />
          <Metric label="Analysis ready" value={mc.analysisReadyCount} />
          <Metric
            label="Confianza merge (prom.)"
            value={
              mc.analysisReadyCount > 0 ?
                `${Math.round(Number((mc.merge as Record<string, unknown>).match_rate_truckflow ?? 0) * 100)}% truckflow`
              : '—'
            }
          />
        </div>
      : !mc ?
        null
      : (
        <p className="mt-3 text-xs text-slate-600">
          Sin integración en el último transform. Cargá XLSX y reprocesá.
        </p>
      )}

      {productCounts.length > 0 ?
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase text-slate-600">
            Productos en operaciones Excel-first
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {productCounts.map(({ product, count }) => (
              <li
                key={product}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-emerald-200"
              >
                {product}{' '}
                <span className="font-mono text-emerald-800">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      : mc?.enabled && (mc.products?.length ?? 0) > 0 ?
        <p className="mt-3 text-xs text-slate-700">
          Productos detectados en fuente externa:{' '}
          <span className="font-semibold">{mc.products.join(', ')}</span>
          {(mc.withProduct ?? 0) === 0 ?
            ' (ningún journey matcheó con producto asignado)'
          : null}
        </p>
      : null}

      {mergeOk && wb.transformResult?.csv ?
        <div className="mt-4 flex flex-wrap gap-2">
          {MERGE_EXPORTS.map((ex) => {
            const text = wb.transformResult?.csv[ex.key]
            if (!text?.trim()) return null
            return (
              <button
                key={ex.key}
                type="button"
                className="rounded-lg border border-emerald-400 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-50"
                onClick={() => triggerBrowserCsvDownload(ex.filename, text)}
              >
                ↓ {ex.label}
              </button>
            )
          })}
        </div>
      : null}

      {mc?.logs?.length && !compact ?
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">Log del merge</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-white/80 p-2 text-[10px] text-slate-700">
            {mc.logs.join('\n')}
          </pre>
        </details>
      : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number | undefined }) {
  const display =
    value === undefined || value === null || value === '' ? '—' : (
      typeof value === 'number' ?
        value.toLocaleString()
      : value)
  return (
    <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{display}</div>
    </div>
  )
}
