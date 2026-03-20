import { CAMERA_BY_PLANT_AND_SECTOR } from "../data/cameras.js";
import { CIRCUIT_BY_PLANT_AND_CODE } from "../data/circuits.js";
import { TRUCKS } from "../data/trucks.js";
import type { TruckCatalogItem } from "../types/contracts.js";
import { ScenarioName } from "../types/contracts.js";

export interface ScenarioStep {
  truckId: string;
  cameraId: string;
  snapshotTime: string;
}

export interface BuildScenarioResult {
  scenario: ScenarioName;
  steps: ScenarioStep[];
  trucks?: TruckCatalogItem[];
}

/** Promedio estadía ~9h. Intervalos variables 50-100 min entre sectores. */
const AVG_STAY_MINUTES = 9 * 60;
const MIN_INTERVAL = 50;
const MAX_INTERVAL = 100;

/** Semilla para variación determinística por truck */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function plusMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

function toStep(truckId: string, plant: string, sector: string, time: Date): ScenarioStep {
  const camera = CAMERA_BY_PLANT_AND_SECTOR.get(`${plant}:${sector}`);
  if (!camera) throw new Error(`No existe camara para ${plant}:${sector}`);
  return { truckId, cameraId: camera.id, snapshotTime: time.toISOString() };
}

/**
 * Genera pasos con tiempos realistas: estadía ~9h, entrada repartida en la semana.
 */
function makeRouteSteps(
  truckId: string,
  plant: string,
  sequence: string[],
  entryDate: Date,
  intervalMinutes: number
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  let t = new Date(entryDate);
  for (const sector of sequence) {
    steps.push(toStep(truckId, plant, sector, t));
    t = plusMinutes(t, intervalMinutes);
  }
  return steps;
}

export type MarchFullVariant = "baseline" | "ordered" | "chaos";

/** Variante con variación por sector. varianceRange: ±minutos por sector (ej: 20 = ±20 min). */
function makeRouteStepsWithVariance(
  truckId: string,
  plant: string,
  sequence: string[],
  entryDate: Date,
  baseInterval: number,
  tripSeed: number,
  varianceRange: number = 20
): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  let t = new Date(entryDate);
  for (let i = 0; i < sequence.length; i++) {
    steps.push(toStep(truckId, plant, sequence[i], t));
    const variance = Math.floor(seededRandom(tripSeed + i * 7) * (varianceRange * 2 + 1)) - varianceRange;
    const interval = Math.max(10, baseInterval + variance);
    t = plusMinutes(t, interval);
  }
  return steps;
}

/** Fecha base: hace 7 días para que "Última semana" muestre datos */
function getBaseDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildNormalScenario(): ScenarioStep[] {
  const allSteps: ScenarioStep[] = [];
  const base = getBaseDate();

  TRUCKS.forEach((truck, idx) => {
    const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${truck.plant}:${truck.circuitCode}`);
    if (!circuit) return;

    const r = seededRandom(idx);
    const dayOffset = Math.floor(r * 7);
    const hourEntry = Math.floor(r * 1000) % 24;
    const entryDate = plusMinutes(plusMinutes(base, dayOffset * 24 * 60), hourEntry * 60);

    const interval = MIN_INTERVAL + Math.floor(seededRandom(idx + 1) * (MAX_INTERVAL - MIN_INTERVAL));

    const tipo = idx % 10;
    let sequence: string[];

    if (tipo < 6) {
      sequence = circuit.sectorSequence;
    } else if (tipo < 8) {
      sequence = circuit.sectorSequence.slice(0, circuit.sectorSequence.length - 1);
    } else if (tipo < 9) {
      sequence = circuit.sectorSequence.filter((s) => s !== "S4");
    } else {
      const dup = [...circuit.sectorSequence];
      dup.splice(5, 0, "S6");
      sequence = dup;
    }

    allSteps.push(...makeRouteSteps(truck.truckId, truck.plant, sequence, entryDate, interval));
  });

  return allSteps;
}

function buildAnomaliesScenario(): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  const base = getBaseDate();

  const anomalyTrucks = TRUCKS.slice(0, 30);
  anomalyTrucks.forEach((truck, idx) => {
    const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${truck.plant}:${truck.circuitCode}`);
    if (!circuit) return;

    const dayOffset = idx % 7;
    const hourEntry = (idx * 3) % 24;
    const entryDate = plusMinutes(plusMinutes(base, dayOffset * 24 * 60), hourEntry * 60);
    const interval = 60 + (idx % 40);

    const tipo = idx % 5;
    let sequence: string[];
    if (tipo === 0) {
      sequence = circuit.sectorSequence.slice(0, 3);
    } else if (tipo === 1) {
      sequence = circuit.sectorSequence.filter((s) => s !== "S4");
    } else if (tipo === 2) {
      const dup = [...circuit.sectorSequence];
      dup.splice(4, 0, "S6", "S6");
      sequence = dup;
    } else if (tipo === 3) {
      sequence = circuit.sectorSequence.slice(0, circuit.sectorSequence.length - 2);
    } else {
      sequence = circuit.sectorSequence;
    }

    steps.push(...makeRouteSteps(truck.truckId, truck.plant, sequence, entryDate, interval));
  });

  return steps;
}

function buildHighLoadScenario(): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  const base = getBaseDate();

  TRUCKS.forEach((truck, idx) => {
    const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${truck.plant}:${truck.circuitCode}`);
    if (!circuit) return;

    const r = seededRandom(idx);
    const dayOffset = Math.floor(r * 7);
    const hourEntry = Math.floor(r * 500) % 24;
    const entryDate = plusMinutes(plusMinutes(base, dayOffset * 24 * 60), hourEntry * 60);
    const interval = 55 + Math.floor(seededRandom(idx + 2) * 45);

    const partial = idx % 6 === 0;
    const sequence = partial
      ? circuit.sectorSequence.slice(0, circuit.sectorSequence.length - 2)
      : circuit.sectorSequence;

    steps.push(...makeRouteSteps(truck.truckId, truck.plant, sequence, entryDate, interval));
  });

  return steps;
}

/** Día 7, 12:00. Totales semanales: Ricardone 4000, San Lorenzo 3000, Avellaneda 600. Hoy = 1/7. */
function buildWeekSnapshotScenario(): { steps: ScenarioStep[]; trucks: TruckCatalogItem[] } {
  const CARGO_TYPES = ["Maiz", "Soja", "Trigo", "Pellet", "Fertilizante", "Harina"];
  const DRIVERS = ["Perez", "Gomez", "Rios", "Aguirre", "Lopez", "Martinez", "Fernandez", "Garcia"];

  const totalWeek = { Ricardone: 4000, "San Lorenzo": 3000, Avellaneda: 600 };
  const todayCount = {
    Ricardone: Math.round(totalWeek.Ricardone / 7),
    "San Lorenzo": Math.round(totalWeek["San Lorenzo"] / 7),
    Avellaneda: Math.round(totalWeek.Avellaneda / 7)
  };

  const ricardoneCircuits: { code: string; pct: number }[] = [
    { code: "A7", pct: 0.3 },
    { code: "A1", pct: 0.14 },
    { code: "A3", pct: 0.14 },
    { code: "A4", pct: 0.14 },
    { code: "B1", pct: 0.14 },
    { code: "B2", pct: 0.14 }
  ];
  const slCircuits: { code: string; pct: number }[] = [
    { code: "A1", pct: 0.6 },
    { code: "A3", pct: 0.1 },
    { code: "A4", pct: 0.1 },
    { code: "B1", pct: 0.1 },
    { code: "B2", pct: 0.1 }
  ];
  const avCircuits: { code: string; pct: number }[] = [
    { code: "A1", pct: 0.6 },
    { code: "A3", pct: 0.1 },
    { code: "A4", pct: 0.1 },
    { code: "B1", pct: 0.1 },
    { code: "B2", pct: 0.1 }
  ];

  function plateFor(plantIdx: number, idx: number): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const n = plantIdx * 10000 + idx;
    const num = String((n % 1000) + 1).padStart(3, "0");
    const p = Math.floor(n / 1000);
    const l1 = letters[p % 26];
    const l2 = letters[Math.floor(p / 26) % 26];
    const l3 = letters[Math.floor(p / 676) % 26];
    const suf = letters[n % 26] + letters[Math.floor(n / 26) % 26];
    return `${l1}${l2}${l3}${num}${suf}`;
  }

  function buildTrucksForPlant(
    plant: string,
    plantIdx: number,
    count: number,
    dist: { code: string; pct: number }[]
  ): TruckCatalogItem[] {
    const trucks: TruckCatalogItem[] = [];
    let offset = 0;
    for (const { code, pct } of dist) {
      const n = Math.round(count * pct);
      for (let i = 0; i < n; i++) {
        trucks.push({
          truckId: `WS-${plantIdx}-${String(offset + i + 1).padStart(5, "0")}`,
          plate: plateFor(plantIdx, offset + i),
          cargoType: CARGO_TYPES[(offset + i) % CARGO_TYPES.length],
          driver: (offset + i) % 3 === 0 ? DRIVERS[(offset + i) % DRIVERS.length] : undefined,
          circuitCode: code,
          plant
        });
      }
      offset += n;
    }
    return trucks;
  }

  const trucks: TruckCatalogItem[] = [
    ...buildTrucksForPlant("Ricardone", 0, todayCount.Ricardone, ricardoneCircuits),
    ...buildTrucksForPlant("San Lorenzo", 1, todayCount["San Lorenzo"], slCircuits),
    ...buildTrucksForPlant("Avellaneda", 2, todayCount.Avellaneda, avCircuits)
  ];

  const day7Start = new Date();
  day7Start.setHours(0, 0, 0, 0);

  const steps: ScenarioStep[] = [];
  const MIN_INTERVAL = 50;
  const MAX_INTERVAL = 100;

  trucks.forEach((truck, idx) => {
    const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${truck.plant}:${truck.circuitCode}`);
    if (!circuit) return;

    const r = seededRandom(idx);
    const hourEntry = Math.floor(r * 1000) % 12;
    const entryDate = plusMinutes(day7Start, hourEntry * 60);
    const interval = MIN_INTERVAL + Math.floor(seededRandom(idx + 1) * (MAX_INTERVAL - MIN_INTERVAL));

    const completed = idx % 5 !== 4;
    const sequence = completed
      ? circuit.sectorSequence
      : circuit.sectorSequence.slice(0, Math.max(5, circuit.sectorSequence.length - 2));

    steps.push(...makeRouteSteps(truck.truckId, truck.plant, sequence, entryDate, interval));
  });

  steps.sort((a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime());
  return { steps, trucks };
}

/** Parámetros de variación por variante de marzo. Chaos: cap para que ningún viaje supere 24h (circuitos hasta 9 sectores = 8 intervalos). */
const MARCH_VARIANT_PARAMS: Record<
  MarchFullVariant,
  { minInterval: number; maxInterval: number; varianceRange: number }
> = {
  baseline: { minInterval: 45, maxInterval: 115, varianceRange: 20 },
  ordered: { minInterval: 58, maxInterval: 62, varianceRange: 2 },
  chaos: { minInterval: 20, maxInterval: 100, varianceRange: 40 }
};

/** Simulación realista del mes de marzo completo. Promedio/día: Ricardone 700, San Lorenzo 500, Avellaneda 250. */
function buildMarchFullScenario(variant: MarchFullVariant = "baseline"): {
  steps: ScenarioStep[];
  trucks: TruckCatalogItem[];
} {
  const CARGO_TYPES = ["Maiz", "Soja", "Trigo", "Pellet", "Fertilizante", "Harina"];
  const DRIVERS = ["Perez", "Gomez", "Rios", "Aguirre", "Lopez", "Martinez", "Fernandez", "Garcia", "Rodriguez", "Diaz"];

  const perDay = { Ricardone: 700, "San Lorenzo": 500, Avellaneda: 250 };
  const daysInMarch = 31;
  const totalMonth = {
    Ricardone: perDay.Ricardone * daysInMarch,
    "San Lorenzo": perDay["San Lorenzo"] * daysInMarch,
    Avellaneda: perDay.Avellaneda * daysInMarch
  };

  /* Variedad: recepción (A*) dominante, despacho (B*) minoritario. Sin agregar camiones. */
  const ricardoneCircuits: { code: string; pct: number }[] = [
    { code: "A7", pct: 0.32 },
    { code: "A1", pct: 0.22 },
    { code: "A3", pct: 0.15 },
    { code: "A4", pct: 0.15 },
    { code: "B1", pct: 0.08 },
    { code: "B2", pct: 0.08 }
  ];
  const slCircuits: { code: string; pct: number }[] = [
    { code: "A1", pct: 0.35 },
    { code: "A3", pct: 0.15 },
    { code: "A4", pct: 0.12 },
    { code: "B1", pct: 0.10 },
    { code: "B2", pct: 0.08 },
    { code: "C1", pct: 0.08 },
    { code: "C2", pct: 0.04 },
    { code: "D1", pct: 0.05 },
    { code: "D2", pct: 0.02 },
    { code: "E1", pct: 0.01 },
    { code: "E2", pct: 0.00 }
  ];
  const avCircuits: { code: string; pct: number }[] = [
    { code: "A1", pct: 0.37 },
    { code: "A3", pct: 0.18 },
    { code: "A4", pct: 0.14 },
    { code: "B1", pct: 0.10 },
    { code: "B2", pct: 0.08 },
    { code: "C1", pct: 0.06 },
    { code: "C2", pct: 0.03 },
    { code: "D1", pct: 0.02 },
    { code: "D2", pct: 0.01 },
    { code: "E1", pct: 0.01 },
    { code: "E2", pct: 0.00 }
  ];

  function plateFor(plantIdx: number, globalIdx: number): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const n = plantIdx * 100000 + globalIdx;
    const num = String((n % 1000) + 1).padStart(3, "0");
    const p = Math.floor(n / 1000);
    const l1 = letters[p % 26];
    const l2 = letters[Math.floor(p / 26) % 26];
    const l3 = letters[Math.floor(p / 676) % 26];
    const suf = letters[n % 26] + letters[Math.floor(n / 26) % 26];
    return `${l1}${l2}${l3}${num}${suf}`;
  }

  function buildTrucksForPlant(
    plant: string,
    plantIdx: number,
    count: number,
    dist: { code: string; pct: number }[]
  ): TruckCatalogItem[] {
    const trucks: TruckCatalogItem[] = [];
    let offset = 0;
    for (const { code, pct } of dist) {
      const n = Math.round(count * pct);
      for (let i = 0; i < n; i++) {
        trucks.push({
          truckId: `MF-${plantIdx}-${String(offset + i + 1).padStart(6, "0")}`,
          plate: plateFor(plantIdx, offset + i),
          cargoType: CARGO_TYPES[(offset + i) % CARGO_TYPES.length],
          driver: (offset + i) % 3 === 0 ? DRIVERS[(offset + i) % DRIVERS.length] : undefined,
          circuitCode: code,
          plant
        });
      }
      offset += n;
    }
    return trucks;
  }

  const trucks: TruckCatalogItem[] = [
    ...buildTrucksForPlant("Ricardone", 0, totalMonth.Ricardone, ricardoneCircuits),
    ...buildTrucksForPlant("San Lorenzo", 1, totalMonth["San Lorenzo"], slCircuits),
    ...buildTrucksForPlant("Avellaneda", 2, totalMonth.Avellaneda, avCircuits)
  ];

  const marchStart = new Date(2026, 2, 1, 0, 0, 0, 0);

  const steps: ScenarioStep[] = [];
  const { minInterval, maxInterval, varianceRange } = MARCH_VARIANT_PARAMS[variant];

  let tripIdx = 0;
  for (const plant of ["Ricardone", "San Lorenzo", "Avellaneda"] as const) {
    const dailyCount = perDay[plant];
    const plantTrucks = trucks.filter((t) => t.plant === plant);

    for (let day = 0; day < daysInMarch; day++) {
      const dayStart = new Date(marchStart);
      dayStart.setDate(dayStart.getDate() + day);

      for (let i = 0; i < dailyCount; i++) {
        const truck = plantTrucks[day * dailyCount + i];
        if (!truck) break;
        const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${truck.plant}:${truck.circuitCode}`);
        if (!circuit) continue;

        const r = seededRandom(tripIdx);
        const hourEntry = Math.floor(r * 1000) % 24;
        const minuteEntry = Math.floor(seededRandom(tripIdx + 1) * 60);
        const entryDate = plusMinutes(plusMinutes(dayStart, hourEntry * 60), minuteEntry);
        const baseInterval =
          minInterval + Math.floor(seededRandom(tripIdx + 2) * (maxInterval - minInterval));

        const tipo = tripIdx % 10;
        let sequence: string[];
        if (tipo < 7) {
          sequence = circuit.sectorSequence;
        } else if (tipo < 9) {
          sequence = circuit.sectorSequence.slice(0, circuit.sectorSequence.length - 1);
        } else {
          sequence = circuit.sectorSequence.filter((s) => s !== "S4");
        }

        steps.push(
          ...makeRouteStepsWithVariance(
            truck.truckId,
            truck.plant,
            sequence,
            entryDate,
            baseInterval,
            tripIdx,
            varianceRange
          )
        );
        tripIdx++;
      }
    }
  }

  steps.sort((a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime());
  return { steps, trucks };
}

/** Configuración live: 10s real = 1h simulado, ~90 camiones/tick (40+35+15) */
export const LIVE_TICKS_PER_BATCH = 90;
export const LIVE_SIMULATED_MINUTES_PER_TICK = 60;

/** Genera un batch de 5 camiones para modo live. simulatedClock = fin de la ventana de 10 min. */
export function buildLiveBatch(
  simulatedClock: string,
  tripCounterStart: number
): { steps: ScenarioStep[]; trucks: TruckCatalogItem[]; tripCounterEnd: number } {
  const CARGO_TYPES = ["Maiz", "Soja", "Trigo", "Pellet", "Fertilizante", "Harina"];
  const DRIVERS = ["Perez", "Gomez", "Rios", "Aguirre", "Lopez", "Martinez", "Fernandez", "Garcia"];

  const plantCircuits: { plant: string; code: string }[] = [
    { plant: "Ricardone", code: "A7" },
    { plant: "Ricardone", code: "A1" },
    { plant: "San Lorenzo", code: "A1" },
    { plant: "San Lorenzo", code: "C1" },
    { plant: "Avellaneda", code: "A1" }
  ];

  const egresoDate = new Date(simulatedClock);
  const steps: ScenarioStep[] = [];
  const trucks: TruckCatalogItem[] = [];
  let tripCounter = tripCounterStart;

  function plateFor(idx: number): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const n = Date.now() % 100000 + idx;
    const num = String((n % 1000) + 1).padStart(3, "0");
    const p = Math.floor(n / 1000);
    const l1 = letters[p % 26];
    const l2 = letters[Math.floor(p / 26) % 26];
    const suf = letters[idx % 26] + letters[Math.floor(idx / 26) % 26];
    return `${l1}${l2}${num}${suf}`;
  }

  for (let i = 0; i < LIVE_TICKS_PER_BATCH; i++) {
    const { plant, code } = plantCircuits[i];
    const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${plant}:${code}`);
    if (!circuit) continue;

    tripCounter++;
    const truckId = `LIVE-${plant.slice(0, 2).toUpperCase()}-${String(tripCounter).padStart(5, "0")}`;
    const plate = plateFor(tripCounter);

    trucks.push({
      truckId,
      plate,
      cargoType: CARGO_TYPES[tripCounter % CARGO_TYPES.length],
      driver: tripCounter % 3 === 0 ? DRIVERS[tripCounter % DRIVERS.length] : undefined,
      circuitCode: code,
      plant
    });

    const fullSequence = circuit.sectorSequence;
    const inProgress = i >= 2;

    const sequence = inProgress
      ? fullSequence.slice(0, Math.max(3, fullSequence.length - 2))
      : fullSequence;

    const seqLen = sequence.length;
    const interval = MIN_INTERVAL + Math.floor(seededRandom(tripCounter) * (MAX_INTERVAL - MIN_INTERVAL));
    const durationMin = inProgress ? (seqLen - 1) * interval : 7 * 60 + (tripCounter % 181) * 60;
    const ingresoDate = new Date(egresoDate.getTime() - durationMin * 60_000);

    const actualInterval = seqLen > 1 ? Math.round(durationMin / (seqLen - 1)) : MIN_INTERVAL;

    steps.push(...makeRouteSteps(truckId, plant, sequence, ingresoDate, Math.max(MIN_INTERVAL, actualInterval)));
  }

  steps.sort((a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime());
  return { steps, trucks, tripCounterEnd: tripCounter };
}

export function buildScenario(scenario: ScenarioName): BuildScenarioResult {
  if (scenario === "week_snapshot") {
    const { steps, trucks } = buildWeekSnapshotScenario();
    return { scenario, steps, trucks };
  }
  if (scenario === "march_full") {
    const { steps, trucks } = buildMarchFullScenario("baseline");
    return { scenario, steps, trucks };
  }
  if (scenario === "march_full_ordered") {
    const { steps, trucks } = buildMarchFullScenario("ordered");
    return { scenario, steps, trucks };
  }
  if (scenario === "march_full_chaos") {
    const { steps, trucks } = buildMarchFullScenario("chaos");
    return { scenario, steps, trucks };
  }
  if (scenario === "live") {
    throw new Error("Escenario live usa runLiveSimulation, no buildScenario");
  }

  let steps: ScenarioStep[];
  if (scenario === "anomalies") {
    steps = buildAnomaliesScenario();
  } else if (scenario === "high-load") {
    steps = buildHighLoadScenario();
  } else {
    steps = buildNormalScenario();
  }

  steps.sort((a, b) => new Date(a.snapshotTime).getTime() - new Date(b.snapshotTime).getTime());
  return { scenario, steps };
}
