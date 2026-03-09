import type { SiteId } from '../domain/sites'
import type { IfcSelectedTruckInfo } from '../components/IfcViewer'
import {
  LOGISTICS_SCHEMA_VERSION,
  type CameraEventRaw,
  type CameraEventsFile,
  type HistoricalTrip,
  type HistoricalTripsFile,
  type OperationalAlert,
  type OperationalAlertsFile,
  type TruckInPlant,
  type TrucksInPlantFile,
} from '../domain/logistics'

const CAMERA_SECTOR_MAP: Record<string, string> = {
  S0: 'INGRESO',
  S1: 'EGRESO',
  S2: 'CALADA',
  S3: 'EGRESO_VALIDACION',
  S4: 'BALANZA',
  S5: 'CELDA_16',
  S6: 'SILOS',
  S7: 'PLAYA_3',
  S8: 'SILOS_CHIEF',
  S9: 'VOLCABLE',
  S10: 'PORTON_SUR',
}

function normalizeSiteId(siteId: SiteId): SiteId {
  return siteId
}

function nowIso(): string {
  return new Date().toISOString()
}

function minutesBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000))
}

export function buildCameraEventsFromFleet(fleet: IfcSelectedTruckInfo[], siteId: SiteId): CameraEventsFile {
  const timestamp = nowIso()
  const events: CameraEventRaw[] = fleet.map((truck, idx) => {
    const sequence = truck.cameraSequence.length > 0 ? truck.cameraSequence : ['S0']
    const step = idx % sequence.length
    const cameraCode = sequence[step]
    return {
      eventId: `${truck.plate}-${cameraCode}-${Date.now()}-${idx}`,
      timestamp,
      cameraCode,
      sectorId: CAMERA_SECTOR_MAP[cameraCode] ?? 'SECTOR_DESCONOCIDO',
      camionId: truck.plate,
      plate: truck.plate,
      confidence: 0.85 + (idx % 10) * 0.01,
      imageUrl: truck.cameraCaptures[step]?.imageUrl ?? truck.cameraImageUrl,
      siteId: normalizeSiteId(siteId),
    }
  })

  return {
    schemaVersion: LOGISTICS_SCHEMA_VERSION,
    generatedAt: timestamp,
    siteId: normalizeSiteId(siteId),
    data: events,
  }
}

export function projectTrucksInPlantFromFleet(
  fleet: IfcSelectedTruckInfo[],
  cameraEvents: CameraEventRaw[],
  siteId: SiteId
): TrucksInPlantFile {
  const generatedAt = nowIso()
  const eventsByPlate = new Map<string, CameraEventRaw[]>()
  for (const ev of cameraEvents) {
    if (!eventsByPlate.has(ev.plate)) eventsByPlate.set(ev.plate, [])
    eventsByPlate.get(ev.plate)!.push(ev)
  }

  const trucks: TruckInPlant[] = fleet.map((truck) => {
    const evs = eventsByPlate.get(truck.plate) ?? []
    const last = evs[evs.length - 1]
    const cameraSequence = truck.cameraSequence.length > 0 ? truck.cameraSequence : ['S0']
    const sectorSequence = cameraSequence.map((cam) => CAMERA_SECTOR_MAP[cam] ?? 'SECTOR_DESCONOCIDO')
    return {
      camionId: truck.plate,
      plate: truck.plate,
      circuitoEstimado: truck.assignedCircuitPrefix,
      circuitoValidado: truck.assignedCircuitPrefix,
      sectorActual: last?.sectorId ?? sectorSequence[0] ?? 'SECTOR_DESCONOCIDO',
      camaraActual: last?.cameraCode ?? cameraSequence[0] ?? 'S0',
      ingresoAt: generatedAt,
      ultimoEventoAt: last?.timestamp ?? generatedAt,
      secuenciaParcialCamaras: cameraSequence.slice(0, Math.min(5, cameraSequence.length)),
      secuenciaParcialSectores: sectorSequence.slice(0, Math.min(5, sectorSequence.length)),
      estadoOperativo: truck.operationType === 'DESPACHANDO' ? 'EN_CIRCULACION' : truck.operationType === 'RECEPCION' ? 'EN_ESPERA' : 'DETENIDO',
      activeAlerts: [],
      siteId: normalizeSiteId(siteId),
    }
  })

  return {
    schemaVersion: LOGISTICS_SCHEMA_VERSION,
    generatedAt,
    siteId: normalizeSiteId(siteId),
    data: trucks,
  }
}

export function buildOperationalAlerts(
  trucksInPlant: TruckInPlant[],
  historicalTrips: HistoricalTrip[],
  siteId: SiteId
): OperationalAlertsFile {
  const now = nowIso()
  const alerts: OperationalAlert[] = []

  for (const truck of trucksInPlant) {
    const elapsed = minutesBetween(truck.ultimoEventoAt, now)
    if (elapsed >= 15) {
      alerts.push({
        alertId: `A-SIN-ACT-${truck.camionId}`,
        type: 'SIN_ACTUALIZACION',
        severity: elapsed > 30 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        camionId: truck.camionId,
        plate: truck.plate,
        circuitoEsperado: truck.circuitoEstimado,
        circuitoObservado: truck.circuitoValidado,
        sectorId: truck.sectorActual,
        cameraCode: truck.camaraActual,
        elapsedMinutes: elapsed,
        siteId: normalizeSiteId(siteId),
      })
    }
  }

  const recentHistory = historicalTrips.slice(-25)
  if (recentHistory.length >= 20) {
    alerts.push({
      alertId: `A-CONG-${Date.now()}`,
      type: 'POSIBLE_CONGESTION',
      severity: 'LOW',
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
      camionId: 'PLANTA',
      plate: 'N/A',
      elapsedMinutes: 0,
      siteId: normalizeSiteId(siteId),
    })
  }

  return {
    schemaVersion: LOGISTICS_SCHEMA_VERSION,
    generatedAt: now,
    siteId: normalizeSiteId(siteId),
    data: alerts,
  }
}

export function rollCurrentToHistory(
  previousHistory: HistoricalTrip[],
  previousCurrent: TruckInPlant[],
  siteId: SiteId
): HistoricalTripsFile {
  const generatedAt = nowIso()
  const nextHistory = [...previousHistory]

  for (const truck of previousCurrent) {
    if (truck.estadoOperativo !== 'DETENIDO') continue
    const exists = nextHistory.some((h) => h.camionId === truck.camionId && h.ingresoAt === truck.ingresoAt)
    if (exists) continue
    const egresoAt = generatedAt
    nextHistory.push({
      tripId: `${truck.camionId}-${Date.now()}`,
      camionId: truck.camionId,
      plate: truck.plate,
      circuitoFinal: truck.circuitoValidado ?? truck.circuitoEstimado,
      ingresoAt: truck.ingresoAt,
      egresoAt,
      durationMinutes: minutesBetween(truck.ingresoAt, egresoAt),
      secuenciaCamaras: truck.secuenciaParcialCamaras,
      secuenciaSectores: truck.secuenciaParcialSectores,
      alerts: truck.activeAlerts,
      estadoFinal: truck.activeAlerts.length > 0 ? 'CON_OBSERVACIONES' : 'VALIDADO',
      siteId: normalizeSiteId(siteId),
    })
  }

  return {
    schemaVersion: LOGISTICS_SCHEMA_VERSION,
    generatedAt,
    siteId: normalizeSiteId(siteId),
    data: nextHistory,
  }
}
