import { useEffect, useState } from 'react'
import { getTruckPlateRegistry } from '../api/truckPlateRegistryApi'

/** Misma normalización que el índice de anomalías: alfanumérico en mayúsculas. */
function normPlate(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

/**
 * Patentes del registro de flota (Supabase) con `active && excludeFromAnalytics`, leídas EN VIVO
 * desde `/api/truckflow/plate-registry`.
 *
 * Por qué existe: el listado de anomalías ya excluye por `plate_registry_excluded`, pero ese CSV es
 * una **foto del momento** en que se procesó la ventana. Un camión de servicio (agua, comida,
 * atmosférico, prestador) que se dio de alta en la base DESPUÉS —o una ventana guardada procesada
 * antes de esa alta— seguiría figurando como anomalía porque su exclusión nunca quedó en el CSV.
 * Este hook trae la base ACTUAL para reforzar el filtro en pantalla, sin re-procesar la ventana.
 *
 * Se fusiona en `AnomalyListContext.excludedRegistryPlates`, que ya respetan tanto el panel de
 * anomalías (`isHardExcludedFromAnomalyList`) como el modelo del comité, así el mismo camión no
 * puede aparecer en un lado y faltar en otro. Si el servidor local está apagado, devuelve vacío
 * (sin refuerzo → comportamiento previo).
 */
export function useLiveExcludedRegistryPlates(): Set<string> {
  const [plates, setPlates] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const doc = await getTruckPlateRegistry()
        const set = new Set<string>()
        for (const e of doc.entries ?? []) {
          if (!e.active || !e.excludeFromAnalytics) continue
          const p = normPlate(e.plate)
          if (p) set.add(p)
        }
        if (alive) setPlates(set)
      } catch {
        /* servidor local apagado: sin refuerzo en vivo */
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return plates
}
