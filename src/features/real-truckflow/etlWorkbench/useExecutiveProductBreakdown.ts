import { useEffect, useMemo, useState } from 'react'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import {
  buildCircuitClassificationIndex,
  type CircuitClassificationIndex,
} from './etlCircuitClassificationIndex'
import {
  buildExecutiveProductFilterPlan,
  resolveAnalysisProductLookup,
  EXECUTIVE_SAMPLE_PRODUCTS,
  PRODUCT_FILTER_ALL,
  type ExecutiveProductFilterPlan,
} from './etlProductFilter'
import type { EtlTransformOutput } from './etlTransformContracts'

/**
 * Conteo canónico de recorridos por producto — MISMA fuente que la pestaña Transform
 * (chips «Producto (muestra)»): clasificación ejecutiva (`debug_matrix_classification`) +
 * lookup de producto Excel-first + `buildExecutiveProductFilterPlan`. Se extrae en un hook para
 * que Inicio y el transform por producto no diverjan de la corrida.
 *
 * `counts[bucket]` = recorridos con ese producto; `total` = recorridos del período; los recorridos
 * sin producto Excel resuelto son «cobertura faltante» (no entran en ningún bucket).
 */

type TrLike = EtlTransformOutput | null | undefined

export type ProductBreakdownRow = { key: string; count: number }

export type ExecutiveProductBreakdown = {
  /** true cuando el índice de clasificación terminó de construirse. */
  ready: boolean
  /** Recorridos del período (universo evaluable). */
  total: number
  /** Recorridos con producto resuelto (= suma de los buckets). */
  conProducto: number
  /** Recorridos sin producto Excel (cobertura faltante). */
  sinProducto: number
  perProduct: ProductBreakdownRow[]
  plan: ExecutiveProductFilterPlan | null
  index: CircuitClassificationIndex
}

export function useExecutiveProductBreakdown(tr: TrLike): ExecutiveProductBreakdown {
  const productLookup = useMemo(
    () =>
      resolveAnalysisProductLookup({
        excel_operations_with_truckflow: tr?.csv?.excel_operations_with_truckflow,
        merged_truckflow_movimientos: tr?.csv?.merged_truckflow_movimientos,
        excelOperationsRows: tr?.tables?.excel_operations_with_truckflow?.rows,
      }),
    [
      tr?.csv?.excel_operations_with_truckflow,
      tr?.csv?.merged_truckflow_movimientos,
      tr?.tables?.excel_operations_with_truckflow,
    ]
  )

  const [index, setIndex] = useState<CircuitClassificationIndex>(() =>
    buildCircuitClassificationIndex('')
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const debugMatrix =
      tr?.tables?.debug_matrix_classification?.rows ?? tr?.csv?.debug_matrix_classification
    const hasMatrix = Array.isArray(debugMatrix)
      ? debugMatrix.length > 0
      : Boolean(String(debugMatrix ?? '').trim())
    if (!hasMatrix) {
      setIndex(buildCircuitClassificationIndex(''))
      setReady(false)
      return
    }
    let cancelled = false
    const mergedCsv = tr?.csv?.merged_truckflow_movimientos
    const excelOps =
      tr?.tables?.excel_operations_with_truckflow?.rows ?? tr?.csv?.excel_operations_with_truckflow
    void (async () => {
      await yieldToBrowser()
      if (cancelled) return
      const idx = buildCircuitClassificationIndex(debugMatrix ?? '', mergedCsv, excelOps)
      if (!cancelled) {
        setIndex(idx)
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    tr?.csv?.debug_matrix_classification,
    tr?.csv?.merged_truckflow_movimientos,
    tr?.csv?.excel_operations_with_truckflow,
    tr?.tables?.debug_matrix_classification,
    tr?.tables?.excel_operations_with_truckflow,
  ])

  const plan = useMemo(
    () => (productLookup ? buildExecutiveProductFilterPlan(index.entries, productLookup) : null),
    [index.entries, productLookup]
  )

  return useMemo(() => {
    const total = index.entries.length
    const conProducto = plan?.counts[PRODUCT_FILTER_ALL] ?? 0
    const perProduct = EXECUTIVE_SAMPLE_PRODUCTS.map((k) => ({
      key: k,
      count: plan?.counts[k] ?? 0,
    })).filter((r) => r.count > 0)
    return {
      ready,
      total,
      conProducto,
      sinProducto: Math.max(0, total - conProducto),
      perProduct,
      plan,
      index,
    }
  }, [ready, index, plan])
}
