import { CircuitCatalogItem } from "../types/contracts.js";

const CIRCUIT_TEMPLATES: Omit<CircuitCatalogItem, "plant">[] = [
  { code: "A1", name: "Descarga Celda 16", sectorSequence: ["S0", "S1", "S2", "S4", "S5", "S6", "S4", "S10"] },
  { code: "A3", name: "Descarga Silos Kepler", sectorSequence: ["S0", "S1", "S2", "S4", "S6", "S7", "S4", "S10"] },
  { code: "A4", name: "Descarga Volcable 1", sectorSequence: ["S0", "S1", "S2", "S4", "S6", "S9", "S4", "S10"] },
  { code: "A7", name: "Descarga San Lorenzo", sectorSequence: ["S0", "S1", "S2", "S4", "S10"] },
  { code: "B1", name: "Carga Celda 16", sectorSequence: ["S0", "S1", "S2", "S4", "S5", "S6", "S4", "S2", "S3"] },
  { code: "B2", name: "Carga Silos Kepler", sectorSequence: ["S0", "S1", "S2", "S4", "S6", "S7", "S4", "S2", "S3"] }
];

const PLANTS = ["Ricardone", "San Lorenzo", "Avellaneda"] as const;

const SL_AV_CIRCUITS = CIRCUIT_TEMPLATES.filter((c) => c.code !== "A7");

export const CIRCUITS: CircuitCatalogItem[] = [
  ...PLANTS.flatMap((plant) =>
    (plant === "Ricardone" ? CIRCUIT_TEMPLATES : SL_AV_CIRCUITS).map((t) => ({ ...t, plant }))
  )
];

export const CIRCUIT_BY_CODE = new Map(CIRCUITS.map((c) => [c.code, c]));
export const CIRCUIT_BY_PLANT_AND_CODE = new Map(
  CIRCUITS.map((c) => [`${c.plant}:${c.code}`, c])
);
