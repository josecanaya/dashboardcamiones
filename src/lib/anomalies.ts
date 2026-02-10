/**
 * Detección básica de anomalías en una visita (hooks para analítica avanzada).
 * Reglas:
 * - SOLID sin SAMPLE_SOLID_TAKEN pero con DISCHARGE_END
 * - SCALE_OUT sin SCALE_IN
 * - Eventos fuera de orden (timestamp)
 * - LAB_RESULT_READY=REJECTED pero con descarga (DISCHARGE_END)
 */

import type { TruckVisit, VisitEvent } from '../domain/truck'
import type { LabResultStatus } from '../domain/truck'

export interface AnomalyItem {
  code: string
  message: string
  severity: 'warning' | 'error'
}

export function detectAnomalies(visit: TruckVisit, events: VisitEvent[]): AnomalyItem[] {
  const result: AnomalyItem[] = []
  const types = events.map((e) => e.type)
  const hasScaleIn = types.includes('SCALE_IN')
  const hasScaleOut = types.includes('SCALE_OUT')
  const hasSampleSolid = types.includes('SAMPLE_SOLID_TAKEN')
  const hasDischargeEnd = types.includes('DISCHARGE_END')
  const labRejected = events.some(
    (e) => e.type === 'LAB_RESULT_READY' && (e.data?.status as LabResultStatus) === 'REJECTED'
  )

  // SCALE_OUT sin SCALE_IN
  if (hasScaleOut && !hasScaleIn) {
    result.push({
      code: 'SCALE_OUT_WITHOUT_SCALE_IN',
      message: 'Pesaje de salida sin pesaje de entrada registrado.',
      severity: 'error',
    })
  }

  // SOLID: descarga sin calada
  if (visit.cargoForm === 'SOLID' && hasDischargeEnd && !hasSampleSolid) {
    result.push({
      code: 'SOLID_DISCHARGE_WITHOUT_SAMPLE',
      message: 'Carga sólida con descarga pero sin toma de muestra (calada).',
      severity: 'error',
    })
  }

  // Lab REJECTED pero tiene descarga
  if (labRejected && hasDischargeEnd) {
    result.push({
      code: 'REJECTED_WITH_DISCHARGE',
      message: 'Resultado de laboratorio REJECTED pero se registró descarga.',
      severity: 'error',
    })
  }

  // Eventos fuera de orden (timestamp estrictamente creciente)
  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1].occurredAt).getTime()
    const curr = new Date(events[i].occurredAt).getTime()
    if (curr < prev) {
      result.push({
        code: 'EVENTS_OUT_OF_ORDER',
        message: `Eventos fuera de orden: ${events[i - 1].type} (${events[i - 1].occurredAt}) y ${events[i].type} (${events[i].occurredAt}).`,
        severity: 'warning',
      })
      break
    }
  }

  return result
}
