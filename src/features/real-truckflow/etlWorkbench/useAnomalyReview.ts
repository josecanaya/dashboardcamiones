import { useMemo } from 'react'
import {
  buildAnomalyListContextFromTransformCsv,
  buildAnomalyReviewSummary,
  buildPelletExcelMovementsFromCsv,
  stampMissingExcelAnomalies,
  stampPelletCircuitsFromExcel,
  type AnomalyReviewSummary,
  type CircuitClassificationEntry,
} from './etlCircuitClassificationIndex'
import { useLiveExcludedRegistryPlates } from './useLiveExcludedRegistryPlates'
import type { EtlTransformOutput } from './etlTransformContracts'

/**
 * Revisión de anomalías por secuencia — MISMA cadena que la pestaña Transform (panel de anomalías):
 * contexto Excel/transile + estampado pellet/Excel + `buildAnomalyReviewSummary`. Extraído en un hook
 * para que la pestaña Seguridad no diverja del Transform. Recibe las `entries` del índice de
 * clasificación (ver `useExecutiveProductBreakdown`).
 */
export function useAnomalyReview(
  tr: EtlTransformOutput | null | undefined,
  entries: CircuitClassificationEntry[]
): AnomalyReviewSummary {
  // Refuerzo EN VIVO: patentes de servicio (agua, comida, prestadores) dadas de alta en la base
  // aunque la ventana cargada se haya procesado antes. Ver useLiveExcludedRegistryPlates.
  const liveExcludedPlates = useLiveExcludedRegistryPlates()

  const anomalyListCtx = useMemo(() => {
    const ctx = buildAnomalyListContextFromTransformCsv(
      tr?.csv,
      tr?.tables?.excel_operations_with_truckflow?.rows,
      tr?.tables?.transile_interno_volcable_sessions?.rows
    )
    if (liveExcludedPlates.size) {
      const merged = new Set(ctx.excludedRegistryPlates ?? [])
      for (const p of liveExcludedPlates) merged.add(p)
      ctx.excludedRegistryPlates = merged
    }
    return ctx
  }, [
    tr?.csv?.external_movimientos_contrato_normalized,
    tr?.csv?.excel_operations_with_truckflow,
    tr?.csv?.plate_registry_excluded,
    tr?.tables?.excel_operations_with_truckflow,
    tr?.tables?.transile_interno_volcable_sessions,
    liveExcludedPlates,
  ])

  const pelletExcelMovements = useMemo(
    () => buildPelletExcelMovementsFromCsv(tr?.csv?.external_movimientos_contrato_normalized),
    [tr?.csv?.external_movimientos_contrato_normalized]
  )

  const stampedEntries = useMemo(
    () => stampMissingExcelAnomalies(stampPelletCircuitsFromExcel(entries, pelletExcelMovements), anomalyListCtx),
    [entries, pelletExcelMovements, anomalyListCtx]
  )

  return useMemo(
    () => buildAnomalyReviewSummary(stampedEntries, anomalyListCtx),
    [stampedEntries, anomalyListCtx]
  )
}
