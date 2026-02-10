import type { TruckVisit, VisitEvent } from '../../domain/truck'

const SITE = 'san_lorenzo' as const

export const visitsSanLorenzo: TruckVisit[] = [
  {
    visitId: 'sl-001',
    siteId: SITE,
    plate: 'AA 100 BB',
    cargoForm: 'SOLID',
    declaredProduct: 'SOJA',
    declaredQty: 28500,
    docRef: { type: 'CARTA_PORTE', number: 'CP-SL-001' },
    createdAt: '2024-02-06T06:00:00',
    closedAt: '2024-02-06T08:20:00',
    status: 'CLOSED',
  },
  {
    visitId: 'sl-002',
    siteId: SITE,
    plate: 'CC 200 DD',
    cargoForm: 'LIQUID',
    declaredProduct: 'ACEITE',
    declaredQty: 24000,
    docRef: { type: 'REMITO', number: 'REM-SL-100' },
    createdAt: '2024-02-06T07:00:00',
    closedAt: '2024-02-06T09:30:00',
    status: 'CLOSED',
  },
  {
    visitId: 'sl-003',
    siteId: SITE,
    plate: 'EE 300 FF',
    cargoForm: 'SOLID',
    declaredProduct: 'GIRASOL',
    declaredQty: 27000,
    createdAt: '2024-02-06T08:00:00',
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

export const eventsSanLorenzo: VisitEvent[] = [
  // sl-001 SOLID
  ev('e-sl-001-1', 'sl-001', 'QUEUE_OUTSIDE', 'GATE', '2024-02-06T06:00:00'),
  ev('e-sl-001-2', 'sl-001', 'GATE_CHECKIN', 'GATE', '2024-02-06T06:05:00'),
  ev('e-sl-001-3', 'sl-001', 'SCALE_IN', 'SCALE_IN', '2024-02-06T06:10:00', { pesoBruto: 43200 }),
  ev('e-sl-001-4', 'sl-001', 'SAMPLE_SOLID_TAKEN', 'SAMPLE_BAY_A', '2024-02-06T06:28:00'),
  ev('e-sl-001-5', 'sl-001', 'YARD_WAIT', 'YARD_A', '2024-02-06T06:32:00'),
  ev('e-sl-001-6', 'sl-001', 'LAB_RESULT_READY', 'LAB', '2024-02-06T06:55:00', { status: 'APPROVED' }),
  ev('e-sl-001-7', 'sl-001', 'DISCHARGE_ASSIGNED', 'PIT_1', '2024-02-06T07:05:00', { pit: 'PIT_1' }),
  ev('e-sl-001-8', 'sl-001', 'DISCHARGE_START', 'PIT_1', '2024-02-06T07:25:00'),
  ev('e-sl-001-9', 'sl-001', 'DISCHARGE_END', 'PIT_1', '2024-02-06T07:58:00'),
  ev('e-sl-001-10', 'sl-001', 'SCALE_OUT', 'SCALE_OUT', '2024-02-06T08:12:00', { pesoTara: 12700, pesoNeto: 30500 }),
  ev('e-sl-001-11', 'sl-001', 'EXIT', 'EXIT', '2024-02-06T08:20:00'),
  // sl-002 LIQUID
  ev('e-sl-002-1', 'sl-002', 'GATE_CHECKIN', 'GATE', '2024-02-06T07:00:00'),
  ev('e-sl-002-2', 'sl-002', 'DOCS_OK', 'GATE', '2024-02-06T07:04:00'),
  ev('e-sl-002-3', 'sl-002', 'DISCHARGE_ASSIGNED', 'LIQUID_BAY_2', '2024-02-06T07:15:00', { bay: 'LIQUID_BAY_2' }),
  ev('e-sl-002-4', 'sl-002', 'DISCHARGE_START', 'LIQUID_BAY_2', '2024-02-06T07:30:00'),
  ev('e-sl-002-5', 'sl-002', 'DISCHARGE_END', 'LIQUID_BAY_2', '2024-02-06T08:55:00', { measuredQty: 23800 }),
  ev('e-sl-002-6', 'sl-002', 'EXIT', 'EXIT', '2024-02-06T09:30:00'),
  // sl-003 en curso (OPEN)
  ev('e-sl-003-1', 'sl-003', 'GATE_CHECKIN', 'GATE', '2024-02-06T08:00:00'),
  ev('e-sl-003-2', 'sl-003', 'SCALE_IN', 'SCALE_IN', '2024-02-06T08:06:00', { pesoBruto: 41500 }),
  ev('e-sl-003-3', 'sl-003', 'SAMPLE_SOLID_TAKEN', 'SAMPLE_BAY_B', '2024-02-06T08:22:00'),
  ev('e-sl-003-4', 'sl-003', 'YARD_WAIT', 'YARD_A', '2024-02-06T08:28:00'),
]
