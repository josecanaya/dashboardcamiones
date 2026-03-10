import { CameraCatalogItem } from "../types/contracts.js";

const SECTOR_TEMPLATE: Omit<CameraCatalogItem, "id" | "plant">[] = [
  { sector: "S0", name: "Ingreso principal", criticality: "high" },
  { sector: "S1", name: "Pre-checkpoint" },
  { sector: "S2", name: "Desvio operativo" },
  { sector: "S3", name: "Egreso carga", criticality: "high" },
  { sector: "S4", name: "Nodo central", criticality: "high" },
  { sector: "S5", name: "Celda 16" },
  { sector: "S6", name: "Distribucion silos" },
  { sector: "S7", name: "Silos Kepler" },
  { sector: "S8", name: "Reserva operacional" },
  { sector: "S9", name: "Volcable 1" },
  { sector: "S10", name: "Egreso descarga", criticality: "high" }
];

const PLANT_PREFIX: Record<string, string> = {
  Ricardone: "RIC",
  "San Lorenzo": "SL",
  Avellaneda: "AV"
};

function buildCamerasForPlant(plant: string): CameraCatalogItem[] {
  const prefix = PLANT_PREFIX[plant] ?? "XX";
  return SECTOR_TEMPLATE.map((t) => ({
    ...t,
    id: `CAM_${prefix}_${t.sector}_01`,
    plant
  }));
}

export const CAMERAS: CameraCatalogItem[] = [
  ...buildCamerasForPlant("Ricardone"),
  ...buildCamerasForPlant("San Lorenzo"),
  ...buildCamerasForPlant("Avellaneda")
];

export const CAMERA_BY_ID = new Map(CAMERAS.map((c) => [c.id, c]));
export const CAMERA_BY_PLANT_AND_SECTOR = new Map(
  CAMERAS.map((c) => [`${c.plant}:${c.sector}`, c])
);

/** @deprecated Usar CAMERA_BY_PLANT_AND_SECTOR para multi-planta */
export const CAMERA_BY_SECTOR = new Map(
  CAMERAS.filter((c) => c.plant === "Ricardone").map((c) => [c.sector, c])
);
