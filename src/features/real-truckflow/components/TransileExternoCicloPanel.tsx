import { useMemo } from 'react'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  TRANSILE_EXTERNO_CIRCUIT_FAMILIES,
  type TransileExternoOperation,
  type TransileExternoSummary,
} from '../etlWorkbench/transileExternoCiclo'
import { tableToCsv, makeTable } from '../../../etl-core/typedTable'
import { TRANSILE_EXTERNO_OPERATION_HEADERS } from '../../../etl-core/reports/transileExternoCiclo'

type OperationRow = Record<string, string> | (TransileExternoOperation & Record<string, unknown>)

type Props = {
  operationsCsv?: string
  summaryCsv?: string
  /** Fase 2: filas tipadas (preferidas sobre CSV). */
  operations?: TransileExternoOperation[]
  summary?: TransileExternoSummary
  disabled?: boolean
}

function parseSummary(csv: string | undefined): Record<string, string> {
  if (!csv?.trim()) return {}
  return parseCsvToRecords(csv).rows[0] ?? {}
}

function summaryFromTyped(s: TransileExternoSummary): Record<string, string> {
  return Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, v == null ? '' : String(v)])
  )
}

export function TransileExternoCicloPanel({
  operationsCsv,
  summaryCsv,
  operations: operationsProp,
  summary: summaryProp,
  disabled,
}: Props) {
  const summary = useMemo(() => {
    if (summaryProp) return summaryFromTyped(summaryProp)
    return parseSummary(summaryCsv)
  }, [summaryProp, summaryCsv])

  const operations = useMemo((): OperationRow[] => {
    if (operationsProp?.length) return operationsProp as OperationRow[]
    if (!operationsCsv?.trim()) return []
    return parseCsvToRecords(operationsCsv).rows
  }, [operationsProp, operationsCsv])

  const hasData = Boolean(operationsProp?.length || operationsCsv?.trim() || summaryProp || summaryCsv?.trim())

  if (!hasData) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ejecutá el <strong>Transform</strong> para detectar transiles externos por la columna{' '}
        <strong>es de vuelta = SI</strong> del Excel de Movimientos por Contrato.
      </p>
    )
  }

  const exportCsv =
    operationsCsv?.trim() ||
    (operationsProp?.length ?
      tableToCsv(
        makeTable(
          'transile_externo_operaciones',
          TRANSILE_EXTERNO_OPERATION_HEADERS,
          operationsProp.map((o) => ({
            ...o,
            es_de_vuelta: o.es_de_vuelta ? 'true' : 'false',
          })) as never
        )
      )
    : '')

  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs text-slate-600">
        Movimientos marcados <strong>es de vuelta = SI</strong> (camión que vuelve a Ricardone a hacer otro
        ciclo). Circuito por producto: <strong>PELLET</strong> → {TRANSILE_EXTERNO_CIRCUIT_FAMILIES.PELLET.join('/')} ·{' '}
        <strong>SOJA</strong> → {TRANSILE_EXTERNO_CIRCUIT_FAMILIES.SOJA.join('/')} ·{' '}
        <strong>GIRASOL</strong> → {TRANSILE_EXTERNO_CIRCUIT_FAMILIES.GIRASOL.join('/')}.
      </p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
          <dt className="text-xs text-amber-800">Movimientos de vuelta</dt>
          <dd className="font-bold tabular-nums">{summary.movimientos_de_vuelta ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
          <dt className="text-xs text-amber-800">Patentes</dt>
          <dd className="font-bold tabular-nums">{summary.patentes_con_vuelta ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
          <dt className="text-xs text-amber-800">Pellet / Soja / Girasol</dt>
          <dd className="font-bold tabular-nums">
            {summary.operaciones_pellet ?? '—'} / {summary.operaciones_soja ?? '—'} /{' '}
            {summary.operaciones_girasol ?? '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
          <dt className="text-xs text-amber-800">Sin familia</dt>
          <dd className="font-bold tabular-nums">{summary.operaciones_sin_familia ?? '—'}</dd>
        </div>
      </dl>

      {operations.length > 0 ?
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Patente</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Familia</th>
                <th className="px-2 py-2">Circuito</th>
                <th className="px-2 py-2">Ciclo</th>
                <th className="px-2 py-2">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {operations.slice(0, 40).map((r, i) => (
                <tr key={`${String(r.external_operation_id)}_${i}`} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-mono">{String(r.patente ?? '')}</td>
                  <td className="px-2 py-1.5">{String(r.fecha ?? '')}</td>
                  <td className="px-2 py-1.5">{String(r.producto || '—')}</td>
                  <td className="px-2 py-1.5">{String(r.product_family || '—')}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {String(r.circuit_assigned || r.circuit_candidates || '—')}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{String(r.cycle_index ?? '')}</td>
                  <td className="px-2 py-1.5">{String(r.external_ingreso_at || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Ningún movimiento con es de vuelta = SI en este período.</p>
          <p className="mt-1">
            {summary.columna_detectada ?
              <>Columna detectada: <span className="font-mono">{summary.columna_detectada}</span> — pero ningún valor resultó SI. Revisá los valores de esa columna.</>
            : <>La columna <strong>“es de vuelta”</strong> no se detectó en el Excel. Columnas vistas:{' '}
                <span className="font-mono break-words">{summary.headers_muestra || '—'}</span></>}
          </p>
        </div>}

      <button
        type="button"
        disabled={disabled || !exportCsv}
        onClick={() => exportCsv && triggerBrowserCsvDownload('transile_externo_operaciones.csv', exportCsv)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
      >
        Export CSV operaciones
      </button>
    </div>
  )
}
