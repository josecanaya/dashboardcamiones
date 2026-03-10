import { CAMERA_BY_ID } from "../data/cameras.js";
import { TRUCK_BY_PLATE } from "../data/trucks.js";
import type { TruckCatalogItem } from "../types/contracts.js";
import { ScenarioStep } from "../scenarios/buildScenario.js";
import { EnrichedCameraEvent, RawCameraEvent } from "../types/contracts.js";

function getTruckByPlateMap(
  truckMap?: Map<string, TruckCatalogItem>
): Map<string, TruckCatalogItem> {
  if (truckMap) {
    const byPlate = new Map<string, TruckCatalogItem>();
    for (const t of truckMap.values()) byPlate.set(t.plate, t);
    return byPlate;
  }
  return TRUCK_BY_PLATE;
}

export function enrichEvents(
  rawEvents: RawCameraEvent[],
  steps: ScenarioStep[],
  fixedImageUrl?: string,
  truckMap?: Map<string, TruckCatalogItem>
): EnrichedCameraEvent[] {
  if (rawEvents.length !== steps.length) {
    throw new Error("La cantidad de eventos raw y pasos de escenario no coincide");
  }

  const byPlate = getTruckByPlateMap(truckMap);
  return rawEvents.map((raw, index) => {
    const step = steps[index];
    const camera = CAMERA_BY_ID.get(step.cameraId);
    const truck = byPlate.get(raw.plateNo);

    if (!camera || !truck) {
      throw new Error(`No se pudo enriquecer evento ${index + 1}`);
    }

    return {
      eventId: `evt-${String(index + 1).padStart(4, "0")}`,
      eventType: raw.eventType,
      snapshotTime: raw.snapshotTime,
      plateNo: raw.plateNo,
      region: raw.region,
      targetPlateSize: raw.targetPlateSize,
      logo: raw.logo,
      vehicleType: raw.vehicleType,
      plant: camera.plant,
      cameraId: camera.id,
      sector: camera.sector,
      inferredTruckId: truck.truckId,
      inferredCircuitCode: truck.circuitCode,
      source: "mock-camera-service",
      imageUrl:
        fixedImageUrl ??
        `https://mock.local/anpr/${raw.plateNo}/${new Date(raw.snapshotTime).getTime()}.jpg`
    };
  });
}
