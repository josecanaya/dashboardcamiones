import { TRUCK_BY_ID } from "../data/trucks.js";
import type { TruckCatalogItem } from "../types/contracts.js";
import { RawCameraEvent } from "../types/contracts.js";
import { ScenarioStep } from "../scenarios/buildScenario.js";

const logos = ["Benz", "Scania", "Volvo", "Iveco", "Ford"];
const plateSizes = ["189x86", "185x85"];

function deterministicPick(values: string[], key: string): string {
  const sum = [...key].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return values[sum % values.length];
}

function getTruckMap(truckMap?: Map<string, TruckCatalogItem>): Map<string, TruckCatalogItem> {
  return truckMap ?? TRUCK_BY_ID;
}

export function generateRawEvents(
  steps: ScenarioStep[],
  truckMap?: Map<string, TruckCatalogItem>
): RawCameraEvent[] {
  const byId = getTruckMap(truckMap);
  return steps.map((step) => {
    const truck = byId.get(step.truckId);
    if (!truck) {
      throw new Error(`No existe camion ${step.truckId} en catalogo`);
    }

    return {
      eventType: "ANPR",
      snapshotTime: step.snapshotTime,
      plateNo: truck.plate,
      region: "ARG",
      targetPlateSize: deterministicPick(plateSizes, truck.plate),
      logo: deterministicPick(logos, truck.truckId),
      vehicleType: "Heavy Truck"
    };
  });
}
