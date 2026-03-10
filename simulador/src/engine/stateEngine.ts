import { CIRCUIT_BY_PLANT_AND_CODE } from "../data/circuits.js";
import type { TripClassification } from "../types/contracts.js";
import {
  EnrichedCameraEvent,
  HistoricalTrip,
  OperationalAlert,
  TruckInPlant
} from "../types/contracts.js";

interface StateEngineResult {
  activeTrucks: TruckInPlant[];
  historicalTrips: HistoricalTrip[];
  alerts: OperationalAlert[];
}

function minutesBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

function classifyTrip(
  completed: boolean,
  hasCriticalMissing: boolean,
  hasDoublePass: boolean
): TripClassification {
  if (hasCriticalMissing || hasDoublePass) return "ANOMALO";
  if (completed) return "VALIDADO";
  return "CON_OBSERVACIONES";
}

export function buildStateAndAlerts(events: EnrichedCameraEvent[], generatedAt: string): StateEngineResult {
  const byTruck = new Map<string, EnrichedCameraEvent[]>();
  for (const event of events) {
    const list = byTruck.get(event.inferredTruckId) ?? [];
    list.push(event);
    byTruck.set(event.inferredTruckId, list);
  }

  const activeTrucks: TruckInPlant[] = [];
  const historicalTrips: HistoricalTrip[] = [];
  const alerts: OperationalAlert[] = [];
  let alertCounter = 1;
  let tripCounter = 1;

  for (const [truckId, truckEvents] of byTruck.entries()) {
    truckEvents.sort((a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime());
    const first = truckEvents[0];
    const last = truckEvents[truckEvents.length - 1];
    const circuitCode = first.inferredCircuitCode;
    const expected = circuitCode
      ? CIRCUIT_BY_PLANT_AND_CODE.get(`${first.plant}:${circuitCode}`)?.sectorSequence ?? []
      : [];
    const expectedEnd = expected[expected.length - 1];
    const visitedSectors = truckEvents.map((event) => event.sector);
    const completed = Boolean(expectedEnd && last.sector === expectedEnd);
    const hasCriticalMissing = !visitedSectors.includes("S4");
    let hasDoublePass = false;
    for (let i = 1; i < visitedSectors.length; i += 1) {
      if (visitedSectors[i] === visitedSectors[i - 1]) {
        hasDoublePass = true;
        break;
      }
    }

    const classification = classifyTrip(completed, hasCriticalMissing, hasDoublePass);
    const durationMinutes = minutesBetween(first.snapshotTime, last.snapshotTime);

    const egresoDate = new Date(last.snapshotTime);
    const fechaAnio = egresoDate.getUTCFullYear();
    const fechaMes = egresoDate.getUTCMonth() + 1;
    const fechaDia = egresoDate.getUTCDate();
    const fecha = `${fechaAnio}-${String(fechaMes).padStart(2, "0")}-${String(fechaDia).padStart(2, "0")}`;

    historicalTrips.push({
      tripId: `trip-${String(tripCounter++).padStart(4, "0")}`,
      truckId,
      plate: first.plateNo,
      plant: first.plant,
      inferredCircuitCode: circuitCode,
      startedAt: first.snapshotTime,
      endedAt: last.snapshotTime,
      fecha,
      fechaDia,
      fechaMes,
      fechaAnio,
      visitedSectors,
      completed,
      expectedSequence: expected,
      durationMinutes,
      classification
    });

    if (!completed) {
      activeTrucks.push({
        truckId,
        plate: first.plateNo,
        plant: first.plant,
        circuitCode,
        currentSector: last.sector,
        currentCameraId: last.cameraId,
        lastSeenAt: last.snapshotTime,
        visitedSectors,
        eventCount: truckEvents.length
      });
    }

    if (hasCriticalMissing) {
      alerts.push({
        alertId: `alt-${String(alertCounter++).padStart(4, "0")}`,
        type: "critical_camera_missing",
        severity: "high",
        detectedAt: generatedAt,
        plant: first.plant,
        truckId,
        plate: first.plateNo,
        message: "No se detecto paso por el nodo critico S4.",
        context: { expectedCircuit: circuitCode ?? "UNKNOWN", visitedSectors }
      });
    }

    if (hasDoublePass) {
      for (let i = 1; i < visitedSectors.length; i += 1) {
        if (visitedSectors[i] === visitedSectors[i - 1]) {
          alerts.push({
            alertId: `alt-${String(alertCounter++).padStart(4, "0")}`,
            type: "unexpected_double_pass",
            severity: "medium",
            detectedAt: generatedAt,
            plant: first.plant,
            truckId,
            plate: first.plateNo,
            message: `Doble paso consecutivo por ${visitedSectors[i]}.`,
            context: { sector: visitedSectors[i], eventId: truckEvents[i].eventId }
          });
          break;
        }
      }
    }

    if (!completed && expected.length > 0) {
      alerts.push({
        alertId: `alt-${String(alertCounter++).padStart(4, "0")}`,
        type: "incomplete_route",
        severity: "medium",
        detectedAt: generatedAt,
        plant: first.plant,
        truckId,
        plate: first.plateNo,
        message: "Recorrido aun no completo segun secuencia esperada.",
        context: { expectedEnd, currentSector: last.sector, visitedSectors }
      });
    }

    const minutesWithoutSignal = minutesBetween(last.snapshotTime, generatedAt);
    if (!completed && minutesWithoutSignal >= 60) {
      alerts.push({
        alertId: `alt-${String(alertCounter++).padStart(4, "0")}`,
        type: "truck_disappeared",
        severity: "high",
        detectedAt: generatedAt,
        plant: first.plant,
        truckId,
        plate: first.plateNo,
        message: `Sin detecciones de camara por ${minutesWithoutSignal} minutos.`,
        context: { lastSeenAt: last.snapshotTime, minutesWithoutSignal }
      });
    }
  }

  activeTrucks.sort((a, b) => a.plate.localeCompare(b.plate));
  historicalTrips.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  alerts.sort((a, b) => a.alertId.localeCompare(b.alertId));

  return { activeTrucks, historicalTrips, alerts };
}
