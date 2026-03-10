export type ScenarioName = "normal" | "anomalies" | "high-load" | "week_snapshot" | "march_full";

export interface RawCameraEvent {
  eventType: "ANPR";
  snapshotTime: string;
  plateNo: string;
  region: string;
  targetPlateSize: string;
  logo: string;
  vehicleType: string;
}

export interface EnrichedCameraEvent extends RawCameraEvent {
  eventId: string;
  plant: string;
  cameraId: string;
  sector: string;
  inferredTruckId: string;
  inferredCircuitCode?: string;
  source: string;
  imageUrl?: string;
}

export interface TruckInPlant {
  truckId: string;
  plate: string;
  plant: string;
  circuitCode?: string;
  currentSector: string;
  currentCameraId: string;
  lastSeenAt: string;
  visitedSectors: string[];
  eventCount: number;
}

export type TripClassification = "VALIDADO" | "CON_OBSERVACIONES" | "ANOMALO";

export interface HistoricalTrip {
  tripId: string;
  truckId: string;
  plate: string;
  plant: string;
  inferredCircuitCode?: string;
  startedAt: string;
  endedAt: string;
  /** Fecha de egreso en formato YYYY-MM-DD para filtrado por día/semana/mes */
  fecha: string;
  /** Día del mes (1-31) */
  fechaDia: number;
  /** Mes (1-12) */
  fechaMes: number;
  /** Año completo */
  fechaAnio: number;
  visitedSectors: string[];
  completed: boolean;
  expectedSequence: string[];
  durationMinutes: number;
  classification?: TripClassification;
}

export interface OperationalAlert {
  alertId: string;
  type:
    | "truck_disappeared"
    | "critical_camera_missing"
    | "incomplete_route"
    | "unexpected_double_pass";
  severity: "low" | "medium" | "high";
  detectedAt: string;
  plant: string;
  truckId?: string;
  plate?: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface CameraCatalogItem {
  id: string;
  plant: string;
  sector: string;
  name: string;
  criticality?: "high" | "medium" | "low";
}

export interface CircuitCatalogItem {
  code: string;
  name: string;
  plant: string;
  sectorSequence: string[];
}

export interface TruckCatalogItem {
  truckId: string;
  plate: string;
  cargoType: string;
  driver?: string;
  circuitCode: string;
  plant: string;
}

export interface JsonEnvelope<T> {
  version: string;
  generatedAt: string;
  source?: string;
  scenario?: ScenarioName;
  events?: T[];
  data?: T[];
}
