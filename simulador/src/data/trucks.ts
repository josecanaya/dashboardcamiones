import { TruckCatalogItem } from "../types/contracts.js";

const CARGO_TYPES = ["Maiz", "Soja", "Trigo", "Pellet", "Fertilizante", "Harina"];
const CIRCUIT_CODES = ["A1", "A3", "A4", "B1", "B2"] as const;
const DRIVERS = ["Perez", "Gomez", "Rios", "Aguirre", "Lopez", "Martinez", "Fernandez", "Garcia", "Rodriguez", "Diaz"];

const PLANTS = ["Ricardone", "San Lorenzo", "Avellaneda"] as const;

function generatePlate(plantIndex: number, truckIndex: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const idx = plantIndex * 100 + truckIndex;
  const num = String((idx % 1000) + 1).padStart(3, "0");
  const p = Math.floor(idx / 1000);
  const l1 = letters[p % 26];
  const l2 = letters[Math.floor(p / 26) % 26];
  const l3 = letters[Math.floor(p / 676) % 26];
  const suffix = letters[idx % 26] + letters[Math.floor(idx / 26) % 26];
  return `${l1}${l2}${l3}${num}${suffix}`;
}

function buildTrucksForPlant(plant: string, plantIndex: number, count: number): TruckCatalogItem[] {
  const trucks: TruckCatalogItem[] = [];
  for (let i = 0; i < count; i++) {
    trucks.push({
      truckId: `SIM-${String(plantIndex * 50 + i + 1).padStart(3, "0")}`,
      plate: generatePlate(plantIndex, i),
      cargoType: CARGO_TYPES[i % CARGO_TYPES.length],
      driver: i % 3 === 0 ? DRIVERS[i % DRIVERS.length] : undefined,
      circuitCode: CIRCUIT_CODES[i % CIRCUIT_CODES.length],
      plant
    });
  }
  return trucks;
}

// 50 camiones por planta (Ricardone, San Lorenzo, Avellaneda)
export const TRUCKS: TruckCatalogItem[] = PLANTS.flatMap((plant, idx) =>
  buildTrucksForPlant(plant, idx, 50)
);

export const TRUCK_BY_ID = new Map(TRUCKS.map((truck) => [truck.truckId, truck]));
export const TRUCK_BY_PLATE = new Map(TRUCKS.map((truck) => [truck.plate, truck]));
