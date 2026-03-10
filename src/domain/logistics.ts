import type { SiteId } from './sites'

export const LOGISTICS_SCHEMA_VERSION = '1.0.0'

export interface VersionedEnvelope<T> {
  schemaVersion: string
  generatedAt: string
  siteId: SiteId
  data: T
}

export type OperationalTruckState = 'EN_CIRCULACION' | 'EN_ESPERA' | 'DETENIDO' | 'EGRESADO'
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface CameraEventRaw {
  eventId: string
  timestamp: string
  cameraCode: string
  sectorId: string
  camionId: string
  plate: string
  confidence: number
  imageUrl?: string
  siteId: SiteId
}

export interface TruckInPlant {
  camionId: string
  plate: string
  circuitoEstimado: string
  circuitoValidado?: string
  sectorActual: string
  camaraActual: string
  ingresoAt: string
  ultimoEventoAt: string
  secuenciaParcialCamaras: string[]
  secuenciaParcialSectores: string[]
  estadoOperativo: OperationalTruckState
  activeAlerts: string[]
  siteId: SiteId
  /** URL de la foto de la última cámara que registró al camión */
  ultimaFotoUrl?: string
  /** Datos del último evento de cámara (ANPR) */
  ultimoEventoCamara?: {
    hora: string
    patente: string
    region: string
    logo: string
    vehicleType: string
  }
}

export interface HistoricalTrip {
  tripId: string
  camionId: string
  plate: string
  circuitoFinal: string
  ingresoAt: string
  egresoAt: string
  /** Fecha de egreso YYYY-MM-DD para filtrado por día/semana/mes */
  fecha?: string
  fechaDia?: number
  fechaMes?: number
  fechaAnio?: number
  durationMinutes: number
  secuenciaCamaras: string[]
  secuenciaSectores: string[]
  alerts: string[]
  estadoFinal: 'VALIDADO' | 'CON_OBSERVACIONES' | 'ANOMALO'
  sectorTimesMinutes?: Record<string, number>
  siteId: SiteId
}

export interface OperationalAlert {
  alertId: string
  type:
    | 'FUERA_CIRCUITO'
    | 'PERDIDA_TRAZABILIDAD'
    | 'EXCESO_TIEMPO_SECTOR'
    | 'DOBLE_PASO_NO_ESPERADO'
    | 'FALTA_CAMARA_CRITICA'
    | 'CONFLICTO_CIRCUITO_CAMARA'
    | 'EGRESO_NO_VALIDADO'
    | 'SIN_ACTUALIZACION'
    | 'POSIBLE_CONGESTION'
  severity: AlertSeverity
  status: AlertStatus
  createdAt: string
  updatedAt: string
  camionId: string
  plate: string
  circuitoEsperado?: string
  circuitoObservado?: string
  sectorId?: string
  cameraCode?: string
  elapsedMinutes: number
  resolutionNote?: string
  siteId: SiteId
}

export interface IfcCameraCatalogItem {
  cameraId: string
  cameraCode: string
  displayName: string
  sectorId: string
  position3d?: { x: number; y: number; z: number }
  orientation?: { yaw: number; pitch?: number; roll?: number }
  ifcGuid?: string
  expressId?: number
  isCritical: boolean
  siteId: SiteId
}

export type CameraEventsFile = VersionedEnvelope<CameraEventRaw[]>
export type TrucksInPlantFile = VersionedEnvelope<TruckInPlant[]>
export type HistoricalTripsFile = VersionedEnvelope<HistoricalTrip[]>
export type OperationalAlertsFile = VersionedEnvelope<OperationalAlert[]>
