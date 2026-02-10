/**
 * Modelo de visita de camión y eventos — flujo realista SOLID vs LIQUID.
 * Sin backend; preparado para hooks de análisis de anomalías.
 */

import type { SiteId } from './sites'

// ——— Carga y producto ———
export type CargoForm = 'SOLID' | 'LIQUID'
export type ProductType = 'SOJA' | 'GIRASOL' | 'ACEITE' | 'OTRO'

// ——— Documentación ———
export type DocRefType = 'CARTA_PORTE' | 'REMITO' | 'OTRO'
export interface DocRef {
  type: DocRefType
  number?: string
}

// ——— Visita ———
export type VisitStatus = 'OPEN' | 'CLOSED' | 'REJECTED' | 'CANCELLED'

export interface TruckVisit {
  visitId: string
  siteId: SiteId
  plate: string
  cargoForm: CargoForm
  declaredProduct: ProductType
  declaredQty?: number
  docRef?: DocRef
  createdAt: string
  closedAt?: string
  status: VisitStatus
}

// ——— Event types (timeline) ———
export type EventType =
  | 'QUEUE_OUTSIDE'
  | 'GATE_CHECKIN'
  | 'DOCS_OK'
  | 'DOCS_PROBLEM'
  | 'SCALE_IN'
  | 'YARD_WAIT'
  | 'SAMPLE_SOLID_TAKEN'
  | 'SAMPLE_LIQUID_TAKEN'
  | 'LAB_RESULT_READY'
  | 'DISCHARGE_ASSIGNED'
  | 'DISCHARGE_START'
  | 'DISCHARGE_END'
  | 'SCALE_OUT'
  | 'EXIT'
  | 'UNKNOWN'

// ——— Ubicación lógica (no coordenadas; mapeable a sectores reales después) ———
export type LocationKey =
  | 'GATE'
  | 'SCALE_IN'
  | 'SAMPLE_BAY_A'
  | 'SAMPLE_BAY_B'
  | 'LAB'
  | 'YARD_A'
  | 'YARD_B'
  | 'PIT_1'
  | 'PIT_2'
  | 'PIT_3'
  | 'LIQUID_BAY_1'
  | 'LIQUID_BAY_2'
  | 'LIQUID_BAY_3'
  | 'SCALE_OUT'
  | 'EXIT'
  | 'UNKNOWN'

// ——— Evento ———
export interface VisitEvent {
  eventId: string
  visitId: string
  siteId: SiteId
  type: EventType
  location: LocationKey
  occurredAt: string
  data?: Record<string, unknown>
}

// Lab result (dentro de data en LAB_RESULT_READY)
export type LabResultStatus = 'APPROVED' | 'OBSERVED' | 'REJECTED'
