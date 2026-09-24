/**
 * Exportación automática del informe de logística al terminar un procesamiento.
 *
 * Observa el resultado del workbench y, cuando hay un período y datos nuevos, arma el paquete
 * y pide al servidor que escriba la revisión. No hay paso manual de descarga; el botón que
 * expone el hook es solo para **rehacer** la exportación, no para dispararla por primera vez.
 *
 * Un fallo del exportador **no** invalida el procesamiento: se guarda el error en el estado
 * del hook y el dashboard conserva su resultado intacto.
 */
import { useCallback, useEffect, useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { buildLogisticsReportPackage, type LogisticsReportPackage } from './logisticsReportPackage'

const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_TRUCKFLOW_API ??
  'http://127.0.0.1:8787'

export type LogisticsExportResult = {
  ok: true
  periodo: { from: string; to: string }
  revision: number
  revisionDir: string
  xlsxPath: string
  controlPath: string
  cobertura: {
    graficos: {
      total: number
      completados: number
      pendientes: number
      conservadosHistoricos: number
    }
    textos: { conectados: number; sinDato: number; estaticos: number; total: number }
  }
  pendientes: { id: string; reason: string; slide?: number }[]
  advertencias: { id: string; detail: string }[]
}

export type LogisticsExportState = {
  status: 'idle' | 'running' | 'done' | 'error'
  result: LogisticsExportResult | null
  error: string | null
  /** Período que se exportó (o se está exportando) — el de los DATOS, no el del formulario. */
  periodo: { from: string; to: string; source: PeriodSource } | null
  paquete: LogisticsReportPackage | null
}

/**
 * Guardas a nivel de módulo (no por instancia): si el panel se monta en más de una pestaña,
 * el mismo período no se exporta dos veces ni se crean revisiones duplicadas.
 */
const guard = { inFlight: false, lastSignature: '' }

const IDLE: LogisticsExportState = {
  status: 'idle',
  result: null,
  error: null,
  periodo: null,
  paquete: null,
}

export type PeriodSource = 'rango_compuesto' | 'periodo_cargado'

/**
 * Período efectivo: el de los **datos cargados**, no el del formulario.
 *
 * El rango compuesto manda porque es exactamente el rango que se armó con las corridas. Si no
 * hay, se usa el período cargado en memoria. Importa la distinción: el formulario de arriba
 * se puede cambiar sin recargar datos, y exportar con ese rótulo produciría un informe con
 * cifras de otro período. Por eso el panel muestra el período que se exporta, y el paquete
 * verifica que ese período tenga datos antes de escribir nada.
 */
function effectivePeriod(
  composed: { from: string; to: string } | null,
  disk: { startDate: string; endDate: string } | null
): { from: string; to: string; source: PeriodSource } | null {
  if (composed?.from && composed?.to) {
    return { from: composed.from, to: composed.to, source: 'rango_compuesto' }
  }
  if (disk?.startDate && disk?.endDate) {
    return { from: disk.startDate, to: disk.endDate, source: 'periodo_cargado' }
  }
  return null
}

export function useLogisticsReportExport(options?: { auto?: boolean }): LogisticsExportState & {
  exportNow: () => Promise<void>
} {
  const wb = useEtlWorkbenchOptional()
  const [state, setState] = useState<LogisticsExportState>(IDLE)

  const tr = wb?.transformResult ?? null
  const composed = wb?.composedRange ?? null
  const disk = wb?.diskPeriod ?? null
  const period = effectivePeriod(composed, disk)

  const runExport = useCallback(
    async (signature: string) => {
      if (!tr || !period || guard.inFlight) return
      guard.inFlight = true
      setState({ status: 'running', result: null, error: null, periodo: period, paquete: null })
      try {
        const paquete = buildLogisticsReportPackage(tr, {
          from: period.from,
          to: period.to,
          runIds: composed?.usedRunIds ?? [],
          composedRange: composed ? `${composed.from}..${composed.to}` : null,
        })
        if (paquete.controles.sinDatos) {
          // El período del formulario se puede cambiar sin recargar datos. Escribir acá daría
          // un informe entero de pendientes rotulado con un período que nunca se procesó.
          throw new Error(
            `El período ${period.from} → ${period.to} no tiene datos cargados. ` +
              'Procesalo o abrilo primero y la exportación se rehace sola.'
          )
        }
        const res = await fetch(`${API_BASE}/api/reportes/logistica`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paquete }),
        })
        const raw = await res.text()
        let json: { ok?: boolean; error?: string; detail?: string } | null = null
        try {
          json = JSON.parse(raw)
        } catch {
          // Respuesta HTML: el servidor local no conoce la ruta. Pasa cuando el proceso
          // quedó levantado de antes de agregar el endpoint del informe.
          throw new Error(
            'El servidor local respondió HTML en vez de JSON: no tiene el endpoint del ' +
              'informe. Reiniciá `node server/truckflow-local-server.mjs` y reintentá.'
          )
        }
        if (!res.ok || !json?.ok) {
          throw new Error(json?.detail || json?.error || `HTTP ${res.status}`)
        }
        guard.lastSignature = signature
        setState({
          status: 'done',
          result: json as LogisticsExportResult,
          error: null,
          periodo: period,
          paquete,
        })
      } catch (err) {
        // El procesamiento sigue siendo válido: solo falló la exportación.
        setState({
          status: 'error',
          result: null,
          error: String((err as Error)?.message ?? err),
          periodo: period,
          paquete: null,
        })
      } finally {
        guard.inFlight = false
      }
    },
    [tr, period?.from, period?.to, composed?.usedRunIds?.join(',')]
  )

  const signature = tr && period ? `${period.from}..${period.to}|${tr.rulesVersion}|${tr.csv?.excel_operations_with_truckflow?.length ?? 0}` : ''

  useEffect(() => {
    if (options?.auto === false) return
    if (!signature) return
    if (signature === guard.lastSignature) return
    if (guard.inFlight) return
    void runExport(signature)
  }, [signature, options?.auto, runExport])

  const exportNow = useCallback(async () => {
    if (!signature) return
    await runExport(signature)
  }, [signature, runExport])

  return { ...state, exportNow }
}
