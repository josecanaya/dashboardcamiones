/**
 * Evento desde API/archivo tras enriquecimiento de patentes (`annotateRealJourneyEventsWithPlateFields`).
 */
export type RealJourneyEventDto = {
  id: number
  journeyUid: string
  sequenceNumber: number
  eventCategory: string
  eventType: string
  occurredAt: string
  recordedAt: string
  /** Lectura tal como llega desde origen (OCR/API). */
  truckPlate: string
  /** Alias explícito de la lectura cruda antes de normalizar. */
  rawTruckPlate: string
  /** Solo letras y números, sin espacios ni guiones. */
  normalizedPlate: string
  isValidPlate: boolean
  sectorCode: string
  deviceCode: string
  alertLevel: number
}

/** Fila cruda desde JSON/API antes del enriquecimiento de patentes. */
export type ApiRealJourneyEventRow = Omit<RealJourneyEventDto, 'rawTruckPlate' | 'normalizedPlate' | 'isValidPlate'>

export type ReconstructedRealSiteId = 'ricardone' | 'san_lorenzo' | 'avellaneda' | 'unknown'

export type PreliminaryCircuitClassification = {
  preliminaryCircuitCode: string
  preliminaryCircuitName: string
  preliminaryCircuitConfidence: string
  preliminaryCircuitReason: string
}

/** Viaje reconstruido antes de análisis de calidad (incluye día local del primer evento). */
export type ReconstructedRealJourneyCore = {
  journeyUid: string
  /** Alias mostrado: patente normalizada Argentina válida cuando el pipeline es sólo válidos. */
  plate: string
  normalizedPlate: string
  isValidPlate: boolean
  startedAt: string
  endedAt: string
  durationMinutes: number
  eventCount: number
  siteId: ReconstructedRealSiteId
  /** YYYY-MM-DD hora local del primer evento del journey */
  day: string
  rawSectorSequence: string[]
  logicalSectorSequence: string[]
  /** sectorCode únicos del viaje sin fila en REAL_SECTOR_CODE_MAP */
  unmappedSectorCodes: string[]
  rawDeviceSequence: string[]
  /** Mismo orden que los eventos; alias explícito de rawDeviceSequence. */
  deviceCodeSequence: string[]
  normalizedPointSequence: string[]
  /** Código lógico operativo por evento (INGRESO, BALANZA_INGRESO, VOLCABLE, …), no es S0/S1. */
  logicalCodeSequence: string[]
  events: RealJourneyEventDto[]
}

export type ReconstructedRealJourneyWithQuality = ReconstructedRealJourneyCore & {
  hasRicardoneIngreso: boolean
  hasRicardoneEgreso: boolean
  hasPreingreso: boolean
  hasBalanza: boolean
  hasVolcable: boolean
  hasSanLorenzoIngreso: boolean
  /** Ingreso Ricardone + egreso Ricardone en el mismo journey (no validación de circuito). */
  isCompleteMinimal: boolean
  isMixedPlant: boolean
  /** Duración > 12 h entre primer y último evento */
  isSuspiciousLong: boolean
  dominantSectorCode: string | null
  dominantSectorRatio: number
  qualityFlags: string[]
}

/** Viaje tras depuración operativa observable (circuito preliminar o código de descarte). */
export type ReconstructedRealJourney = ReconstructedRealJourneyWithQuality &
  PreliminaryCircuitClassification & {
    /** Ruido probable (solo ingreso/egreso de ruta, etc.): fuera del análisis operativo principal / KPIs. */
    isDiscardedOperational: boolean
    /** Incluye en tablas/recuentos útiles tras depuración (no descartado por ruido ni patente inválida en journey). */
    feedsOperationalAnalytics: boolean
  }
