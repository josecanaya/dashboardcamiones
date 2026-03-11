/**
 * Esquema interno del pipeline: evento normalizado (post-import, pre-agrupación).
 * raw guarda la fila original para auditoría.
 */

import type { SiteId } from './sites'
import type { EventType, LocationKey } from './truck'

export type NormalizedCargoForm = 'SOLID' | 'LIQUID' | 'UNKNOWN'

export interface NormalizedEvent {
  siteId: SiteId
  visitId?: string
  plate?: string
  docNumber?: string
  cargoForm?: NormalizedCargoForm
  product?: string
  eventType: EventType | 'UNKNOWN'
  locationKey?: LocationKey | 'UNKNOWN'
  occurredAt: string
  raw: Record<string, unknown>
}

export interface VisitMetrics {
  cycleTimeMinutes?: number
  timeToSampleMinutes?: number
  labTurnaroundMinutes?: number
  yardWaitTimeMinutes?: number
  dischargeDurationMinutes?: number
  missingSteps?: string[]
}

export type ReconstructedVisitStatus = 'OPEN' | 'CLOSED' | 'REJECTED' | 'CANCELLED'

/** Alertas asociadas a una visita (vienen del microservicio, no se detectan en cliente). */
export interface VisitAlert {
  code: string
  message: string
  severity: 'warning' | 'error'
}

export interface ReconstructedVisit {
  visitId: string
  siteId: SiteId
  plate?: string
  docNumber?: string
  cargoForm: NormalizedCargoForm
  product?: string
  events: NormalizedEvent[]
  startAt: string
  endAt?: string
  status: ReconstructedVisitStatus
  metrics: VisitMetrics
  /** Alertas que vienen del microservicio (no se procesan en cliente). */
  alerts?: VisitAlert[]
}
