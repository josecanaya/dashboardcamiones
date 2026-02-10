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
}
