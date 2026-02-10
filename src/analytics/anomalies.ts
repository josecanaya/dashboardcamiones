import type { ReconstructedVisit } from '../domain/events'

export interface AnomalyItem {
  code: string
  message: string
  severity: 'warning' | 'error'
}

const MIN_CYCLE_MINUTES = 5
const MAX_CYCLE_MINUTES = 12 * 60 // 12h

export function detectAnomalies(
  visit: ReconstructedVisit,
  options?: { minCycleMinutes?: number; maxCycleMinutes?: number }
): AnomalyItem[] {
  const minCycle = options?.minCycleMinutes ?? MIN_CYCLE_MINUTES
  const maxCycle = options?.maxCycleMinutes ?? MAX_CYCLE_MINUTES
  const result: AnomalyItem[] = []
  const events = visit.events
  const types = events.map((e) => e.eventType)
  const hasScaleIn = types.includes('SCALE_IN')
  const hasScaleOut = types.includes('SCALE_OUT')
  const hasSampleSolid = types.includes('SAMPLE_SOLID_TAKEN')
  const hasDischargeEnd = types.includes('DISCHARGE_END')
  const labRejected = events.some(
    (e) =>
      e.eventType === 'LAB_RESULT_READY' &&
      (e.raw?.status === 'REJECTED' || String(e.raw?.resultado ?? '').toLowerCase() === 'rechazado')
  )

  if (hasScaleOut && !hasScaleIn) {
    result.push({
      code: 'SCALE_OUT_WITHOUT_SCALE_IN',
      message: 'Pesaje de salida sin pesaje de entrada registrado.',
      severity: 'error',
    })
  }
  if ((visit.cargoForm === 'SOLID' || visit.cargoForm === 'UNKNOWN') && hasDischargeEnd && !hasSampleSolid) {
    result.push({
      code: 'SOLID_DISCHARGE_WITHOUT_SAMPLE',
      message: 'Carga sólida con descarga pero sin toma de muestra (calada).',
      severity: 'error',
    })
  }
  if (labRejected && hasDischargeEnd) {
    result.push({
      code: 'REJECTED_WITH_DISCHARGE',
      message: 'Resultado de laboratorio REJECTED pero se registró descarga.',
      severity: 'error',
    })
  }
  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1].occurredAt).getTime()
    const curr = new Date(events[i].occurredAt).getTime()
    if (curr < prev) {
      result.push({
        code: 'EVENTS_OUT_OF_ORDER',
        message: `Eventos fuera de orden: ${events[i - 1].occurredAt} vs ${events[i].occurredAt}.`,
        severity: 'warning',
      })
      break
    }
  }
  const cycleMin = visit.metrics.cycleTimeMinutes
  if (cycleMin != null) {
    if (cycleMin < minCycle) {
      result.push({
        code: 'CYCLE_TOO_SHORT',
        message: `Tiempo de ciclo muy bajo: ${cycleMin} min (mínimo esperado ${minCycle} min).`,
        severity: 'warning',
      })
    }
    if (cycleMin > maxCycle) {
      result.push({
        code: 'CYCLE_TOO_LONG',
        message: `Tiempo de ciclo muy alto: ${cycleMin} min (máximo esperado ${maxCycle} min).`,
        severity: 'warning',
      })
    }
  }
  const unknownEvents = events.filter((e) => e.eventType === 'UNKNOWN')
  if (unknownEvents.length > 0) {
    result.push({
      code: 'UNKNOWN_EVENTS',
      message: `${unknownEvents.length} evento(s) no reconocidos. Revisar diccionario de eventos.`,
      severity: 'warning',
    })
  }
  const unknownLocations = events.filter((e) => e.locationKey === 'UNKNOWN')
  if (unknownLocations.length > 0) {
    result.push({
      code: 'UNKNOWN_LOCATIONS',
      message: `${unknownLocations.length} ubicación(es) no reconocidas. Revisar diccionario de sectores.`,
      severity: 'warning',
    })
  }
  if (visit.metrics.missingSteps?.length) {
    result.push({
      code: 'MISSING_STEPS',
      message: `Pasos esperados faltantes: ${visit.metrics.missingSteps.join(', ')}.`,
      severity: 'warning',
    })
  }
  return result
}

/** Conteo de anomalías por tipo (para dashboard por planta). */
export function countAnomaliesByType(visits: ReconstructedVisit[]): { code: string; message: string; count: number }[] {
  const counts = new Map<string, { message: string; count: number }>()
  for (const v of visits) {
    const list = detectAnomalies(v)
    for (const a of list) {
      const cur = counts.get(a.code)
      if (!cur) counts.set(a.code, { message: a.message, count: 1 })
      else cur.count++
    }
  }
  return Array.from(counts.entries()).map(([code, { message, count }]) => ({ code, message, count }))
}
