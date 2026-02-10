import type { TruckVisit, VisitEvent } from '../../domain/truck'

const SITE = 'avellaneda' as const

export const visitsAvellaneda: TruckVisit[] = [
  {
    visitId: 'ave-001',
    siteId: SITE,
    plate: 'XY 500 ZZ',
    cargoForm: 'SOLID',
    declaredProduct: 'SOJA',
    declaredQty: 27500,
    docRef: { type: 'CARTA_PORTE', number: 'CP-AVE-001' },
    createdAt: '2024-02-06T07:30:00',
    closedAt: '2024-02-06T09:45:00',
    status: 'CLOSED',
  },
  {
    visitId: 'ave-002',
    siteId: SITE,
    plate: 'WW 600 QQ',
    cargoForm: 'LIQUID',
    declaredProduct: 'ACEITE',
    declaredQty: 22000,
    createdAt: '2024-02-06T09:00:00',
    status: 'OPEN',
  },
]

function ev(
  eventId: string,
  visitId: string,
  type: VisitEvent['type'],
  location: VisitEvent['location'],
  occurredAt: string,
  data?: VisitEvent['data']
): VisitEvent {
  return { eventId, visitId, siteId: SITE, type, location, occurredAt, data }
}

export const eventsAvellaneda: VisitEvent[] = [
  // ave-001 SOLID flujo base
  ev('e-ave-001-1', 'ave-001', 'GATE_CHECKIN', 'GATE', '2024-02-06T07:30:00'),
  ev('e-ave-001-2', 'ave-001', 'SCALE_IN', 'SCALE_IN', '2024-02-06T07:35:00', { pesoBruto: 42000 }),
  ev('e-ave-001-3', 'ave-001', 'SAMPLE_SOLID_TAKEN', 'SAMPLE_BAY_A', '2024-02-06T07:50:00'),
  ev('e-ave-001-4', 'ave-001', 'YARD_WAIT', 'YARD_A', '2024-02-06T07:55:00'),
  ev('e-ave-001-5', 'ave-001', 'LAB_RESULT_READY', 'LAB', '2024-02-06T08:18:00', { status: 'APPROVED' }),
  ev('e-ave-001-6', 'ave-001', 'DISCHARGE_ASSIGNED', 'PIT_1', '2024-02-06T08:28:00', { pit: 'PIT_1' }),
  ev('e-ave-001-7', 'ave-001', 'DISCHARGE_START', 'PIT_1', '2024-02-06T08:45:00'),
  ev('e-ave-001-8', 'ave-001', 'DISCHARGE_END', 'PIT_1', '2024-02-06T09:18:00'),
  ev('e-ave-001-9', 'ave-001', 'SCALE_OUT', 'SCALE_OUT', '2024-02-06T09:35:00', { pesoTara: 13000, pesoNeto: 29000 }),
  ev('e-ave-001-10', 'ave-001', 'EXIT', 'EXIT', '2024-02-06T09:45:00'),
  // ave-002 LIQUID en curso
  ev('e-ave-002-1', 'ave-002', 'QUEUE_OUTSIDE', 'GATE', '2024-02-06T09:00:00'),
  ev('e-ave-002-2', 'ave-002', 'GATE_CHECKIN', 'GATE', '2024-02-06T09:05:00'),
  ev('e-ave-002-3', 'ave-002', 'DOCS_OK', 'GATE', '2024-02-06T09:08:00'),
  ev('e-ave-002-4', 'ave-002', 'DISCHARGE_ASSIGNED', 'LIQUID_BAY_1', '2024-02-06T09:20:00', { bay: 'LIQUID_BAY_1' }),
  ev('e-ave-002-5', 'ave-002', 'DISCHARGE_START', 'LIQUID_BAY_1', '2024-02-06T09:35:00'),
]
