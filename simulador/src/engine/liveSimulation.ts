import { CAMERA_BY_PLANT_AND_SECTOR } from "../data/cameras.js";
import { CIRCUIT_BY_PLANT_AND_CODE } from "../data/circuits.js";
import type { HistoricalTrip, TruckInPlant } from "../types/contracts.js";
import { readLiveState, writeLiveState, resetLiveState, type LiveState, type TruckInProgress } from "./liveState.js";
import { writeOutputJson } from "./outputWriter.js";
import { LIVE_SIMULATED_MINUTES_PER_TICK } from "../scenarios/buildScenario.js";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

/** Misma ruta que outputWriter: public/mock-data (dashboard lee desde /mock-data) */
function getMockDataRoot(): string {
  const cwd = process.cwd();
  const projectRoot = path.basename(cwd) === "simulador" ? path.resolve(cwd, "..") : cwd;
  return path.resolve(projectRoot, "public", "mock-data");
}
const MOCK_DATA_ROOT = getMockDataRoot();

/** Sectores de egreso por planta: el camión completa y pasa a histórico al llegar aquí. San Lorenzo usa S3/S10 como las demás (circuitos terminan ahí). */
const EGRESO_SECTORS_BY_PLANT: Record<string, Set<string>> = {
  Ricardone: new Set(["S3", "S10"]),
  "San Lorenzo": new Set(["S3", "S10"]),
  Avellaneda: new Set(["S3", "S10"])
};

/** Máximo de viajes por planta en histórico (archivo). */
const MAX_TRIPS_POR_PLANTA = 75_000;

/** Ingresos por hora (promedio): 40 Ricardone, 35 San Lorenzo, 15 Avellaneda. Variable ±25%. */
const INGRESOS_POR_HORA: Record<string, number> = {
  Ricardone: 40,
  "San Lorenzo": 35,
  Avellaneda: 15
};

/** Ticks por día: 1 tick = 1h sim → 24 ticks/día */
const TICKS_PER_DAY = 24;

/** Estadía 3-5 h: ticks totales del viaje (1 tick = 1h). */
const MIN_ESTADIA_TICKS = 3;
const MAX_ESTADIA_TICKS = 5;

const PLANT_KEYS = ["ricardone", "san_lorenzo", "avellaneda"] as const;
function toPlantKey(plant: string): (typeof PLANT_KEYS)[number] {
  const n = plant.toLowerCase().replace(/\s+/g, "_");
  if (n.includes("san_lorenzo")) return "san_lorenzo";
  if (n.includes("avellaneda")) return "avellaneda";
  return "ricardone";
}

/** Registro mínimo para archivo mensual (analytics, sin fotos ni secuencias completas) */
interface TripArchivo {
  tripId: string;
  truckId: string;
  plate: string;
  plant: string;
  circuitCode: string;
  fecha: string;
  egresoAt: string;
  durationMinutes: number;
  classification: string;
}

/** Distribución de circuitos por planta (código, peso relativo). */
const CIRCUITOS_POR_PLANTA: Record<string, { code: string; weight: number }[]> = {
  Ricardone: [
    { code: "A7", weight: 28 },
    { code: "A1", weight: 22 },
    { code: "A3", weight: 14 },
    { code: "A4", weight: 12 },
    { code: "B1", weight: 10 },
    { code: "B2", weight: 8 },
    { code: "C1", weight: 4 },
    { code: "C2", weight: 2 }
  ],
  "San Lorenzo": [
    { code: "A1", weight: 35 },
    { code: "A3", weight: 15 },
    { code: "A4", weight: 12 },
    { code: "B1", weight: 10 },
    { code: "B2", weight: 8 },
    { code: "C1", weight: 8 },
    { code: "C2", weight: 4 },
    { code: "D1", weight: 5 },
    { code: "D2", weight: 2 },
    { code: "E1", weight: 1 }
  ],
  Avellaneda: [
    { code: "A1", weight: 40 },
    { code: "A3", weight: 18 },
    { code: "A4", weight: 14 },
    { code: "B1", weight: 10 },
    { code: "B2", weight: 8 },
    { code: "C1", weight: 6 },
    { code: "C2", weight: 3 },
    { code: "D1", weight: 1 }
  ]
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

/** Factor horario: picos 6-10 y 14-18, valle de noche. */
function factorHorario(hourUTC: number): number {
  if (hourUTC >= 6 && hourUTC < 10) return 1.4;
  if (hourUTC >= 14 && hourUTC < 18) return 1.35;
  if (hourUTC >= 10 && hourUTC < 14) return 1.1;
  if (hourUTC >= 18 && hourUTC < 22) return 0.9;
  return 0.5;
}

/** Cantidad de ingresos por planta en este tick (1 tick = 1h). Variable ±25%, picos horarios. */
function ingresosPorTick(
  plant: string,
  hourUTC: number,
  tripsToday: number,
  seed: number
): number {
  const maxPorDia = (INGRESOS_POR_HORA[plant] ?? 40) * 24;
  const remaining = maxPorDia - tripsToday;
  if (remaining <= 0) return 0;
  const basePorTick = INGRESOS_POR_HORA[plant] ?? 40;
  const factor = factorHorario(hourUTC);
  const rnd = 0.75 + seededRandom(seed) * 0.5; // ±25%
  let target = Math.round(basePorTick * factor * rnd);
  return Math.max(0, Math.min(target, remaining));
}

function elegirCircuito(plant: string, seed: number): string {
  const dist = CIRCUITOS_POR_PLANTA[plant];
  if (!dist) return "A1";
  const total = dist.reduce((s, d) => s + d.weight, 0);
  let r = seededRandom(seed) * total;
  for (const { code, weight } of dist) {
    r -= weight;
    if (r <= 0) return code;
  }
  return dist[dist.length - 1].code;
}

/** Ticks totales del viaje (3-5 h). */
function ticksTotalesViaje(truckId: string): number {
  const seed = [...(truckId ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = seededRandom(seed);
  return MIN_ESTADIA_TICKS + Math.floor(r * (MAX_ESTADIA_TICKS - MIN_ESTADIA_TICKS + 1));
}

function plateFor(idx: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const n = idx;
  const num = String((n % 1000) + 1).padStart(3, "0");
  const p = Math.floor(n / 1000);
  const l1 = letters[p % 26];
  const l2 = letters[Math.floor(p / 26) % 26];
  const suf = letters[n % 26] + letters[Math.floor(n / 26) % 26];
  return `${l1}${l2}${num}${suf}`;
}

function truckInProgressToTruckInPlant(t: TruckInProgress, generatedAt: string): TruckInPlant {
  const sector = t.sectorSequence[t.sectorIndex] ?? t.sectorSequence[0] ?? "S0";
  const camera = CAMERA_BY_PLANT_AND_SECTOR.get(`${t.plant}:${sector}`);
  const visitedSectors = t.sectorSequence.slice(0, t.sectorIndex + 1);
  return {
    truckId: t.truckId,
    plate: t.plate,
    plant: t.plant,
    circuitCode: t.circuitCode,
    currentSector: sector,
    currentCameraId: camera?.id ?? `CAM_${sector}_01`,
    lastSeenAt: generatedAt,
    visitedSectors,
    eventCount: visitedSectors.length
  };
}

function truckInProgressToHistoricalTrip(
  t: TruckInProgress,
  tripId: string,
  generatedAt: string
): HistoricalTrip {
  const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${t.plant}:${t.circuitCode}`);
  const expectedSequence = circuit?.sectorSequence ?? t.sectorSequence;
  const visitedSectors = t.sectorSequence;
  const egresoDate = new Date(generatedAt);
  const durationMin = Math.round(
    (new Date(generatedAt).getTime() - new Date(t.entryTime).getTime()) / 60_000
  );

  return {
    tripId,
    truckId: t.truckId,
    plate: t.plate,
    plant: t.plant,
    inferredCircuitCode: t.circuitCode,
    startedAt: t.entryTime,
    endedAt: generatedAt,
    fecha: `${egresoDate.getUTCFullYear()}-${String(egresoDate.getUTCMonth() + 1).padStart(2, "0")}-${String(egresoDate.getUTCDate()).padStart(2, "0")}`,
    fechaDia: egresoDate.getUTCDate(),
    fechaMes: egresoDate.getUTCMonth() + 1,
    fechaAnio: egresoDate.getUTCFullYear(),
    visitedSectors,
    completed: true,
    expectedSequence,
    durationMinutes: durationMin,
    classification: "VALIDADO"
  };
}

export async function resetLive(): Promise<void> {
  await resetLiveState();
  const outputDir = path.join(MOCK_DATA_ROOT, "live");
  const now = new Date();
  const generatedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0, 0)).toISOString();
  const emptyPayload = { version: "1.0", generatedAt, scenario: "live", data: [] };
  try {
    // Borrar archivos históricos (archivos/{planta}/*.json)
    const archivosDir = path.join(outputDir, "archivos");
    for (const key of PLANT_KEYS) {
      const plantArchivosDir = path.join(archivosDir, key);
      try {
        const files = await readdir(plantArchivosDir);
        for (const f of files) {
          if (f.endsWith(".json")) await unlink(path.join(plantArchivosDir, f));
        }
      } catch {
        // No existe
      }
    }
    for (const key of PLANT_KEYS) {
      const plantDir = path.join(outputDir, key);
      await mkdir(plantDir, { recursive: true });
      await writeFile(
        path.join(plantDir, "historico_recorridos.json"),
        JSON.stringify({ ...emptyPayload, planta: key }, null, 2),
        "utf-8"
      );
      await writeFile(
        path.join(plantDir, "camiones_en_planta.json"),
        JSON.stringify({ ...emptyPayload, planta: key, data: [] }, null, 2),
        "utf-8"
      );
      await writeFile(
        path.join(plantDir, "raw_camera_events.json"),
        JSON.stringify({ ...emptyPayload, planta: key, events: [] }, null, 2),
        "utf-8"
      );
      await writeFile(
        path.join(plantDir, "camera_events_enriched.json"),
        JSON.stringify({ ...emptyPayload, planta: key, events: [] }, null, 2),
        "utf-8"
      );
      await writeFile(
        path.join(plantDir, "alertas_operativas.json"),
        JSON.stringify({ ...emptyPayload, planta: key, data: [] }, null, 2),
        "utf-8"
      );
    }
  } catch (e) {
    console.error("Error al resetear live:", e);
  }
}

export async function runLiveTick(): Promise<void> {
  const scenario = "live";
  const state = await readLiveState();

  const clock = new Date(state.simulatedClock);
  if (isNaN(clock.getTime())) {
    throw new Error(`Reloj invalido: ${state.simulatedClock}`);
  }
  const prevDate = `${clock.getUTCFullYear()}-${String(clock.getUTCMonth() + 1).padStart(2, "0")}-${String(clock.getUTCDate()).padStart(2, "0")}`;
  const prevMonth = `${clock.getUTCFullYear()}-${String(clock.getUTCMonth() + 1).padStart(2, "0")}`;
  clock.setUTCMinutes(clock.getUTCMinutes() + LIVE_SIMULATED_MINUTES_PER_TICK);
  const newSimulatedClock = clock.toISOString();
  const newDate = `${clock.getUTCFullYear()}-${String(clock.getUTCMonth() + 1).padStart(2, "0")}-${String(clock.getUTCDate()).padStart(2, "0")}`;
  const newMonth = `${clock.getUTCFullYear()}-${String(clock.getUTCMonth() + 1).padStart(2, "0")}`;
  const crossedMidnight = prevDate !== newDate;
  const crossedNewMonth = prevMonth !== newMonth;

  function getISOWeek(d: Date): string {
    const d2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
    const y = d2.getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const weekNo = Math.ceil((((d2.getTime() - start.getTime()) / 86400000) + 1) / 7);
    return `${y}-W${String(weekNo).padStart(2, "0")}`;
  }
  const prevWeek = getISOWeek(new Date(state.simulatedClock));
  const newWeek = getISOWeek(new Date(newSimulatedClock));
  const crossedNewWeek = prevWeek !== newWeek;

  const completedTrips: HistoricalTrip[] = [];
  const stillInProgress: TruckInProgress[] = [];

  // Reiniciar contador diario al cruzar medianoche
  let tripsTodayByPlant = { ...(state.tripsTodayByPlant ?? {}) };
  if (crossedMidnight) {
    tripsTodayByPlant = {};
  }

  const hourUTC = new Date(newSimulatedClock).getUTCHours();

  // 1. Avanzar camiones. 1 tick = 1h, estadía 3-5h. Completar cuando llega al sector de egreso de su planta.
  for (const t of state.trucksInProgress) {
    const totalSectores = t.sectorSequence.length;
    let ticksRem = t.ticksRemaining ?? ticksTotalesViaje(t.truckId);
    const sectorIdx = t.sectorIndex;
    const egresoSet = EGRESO_SECTORS_BY_PLANT[t.plant] ?? new Set(["S3", "S10"]);
    const currentSector = t.sectorSequence[sectorIdx] ?? "";

    if (ticksRem <= 0) {
      stillInProgress.push({ ...t, ticksRemaining: 0 });
      continue;
    }

    // Si ya está en sector de egreso (S3/S10 Ricardone/Avellaneda, S7 San Lorenzo): completar y pasar a histórico
    if (egresoSet.has(currentSector)) {
      state.tripCounter++;
      completedTrips.push(
        truckInProgressToHistoricalTrip(
          t,
          `trip-${String(state.tripCounter).padStart(4, "0")}`,
          newSimulatedClock
        )
      );
      continue;
    }

    const sectoresRestantes = totalSectores - 1 - sectorIdx;
    const sectoresEsteTick = Math.min(
      sectoresRestantes,
      Math.max(1, Math.ceil(sectoresRestantes / ticksRem))
    );
    const nextIndex = sectorIdx + sectoresEsteTick;
    ticksRem--;
    const nextSector = t.sectorSequence[Math.min(nextIndex, totalSectores - 1)] ?? "";

    // Si al avanzar llega a sector de egreso: completar
    if (nextIndex >= totalSectores || egresoSet.has(nextSector)) {
      state.tripCounter++;
      completedTrips.push(
        truckInProgressToHistoricalTrip(
          t,
          `trip-${String(state.tripCounter).padStart(4, "0")}`,
          newSimulatedClock
        )
      );
    } else {
      stillInProgress.push({
        ...t,
        sectorIndex: nextIndex,
        ticksRemaining: ticksRem
      });
    }
  }

  // 2. Nuevos ingresos: cantidad variable por planta, límite 1500/día, circuitos variados
  const PLANTS: { plant: string }[] = [
    { plant: "Ricardone" },
    { plant: "San Lorenzo" },
    { plant: "Avellaneda" }
  ];

  const newEntries: TruckInProgress[] = [];
  for (const { plant } of PLANTS) {
    const key = toPlantKey(plant);
    const count = ingresosPorTick(
      plant,
      hourUTC,
      tripsTodayByPlant[key] ?? 0,
      state.tripCounter * 13 + hourUTC * 7
    );

    for (let i = 0; i < count; i++) {
      const code = elegirCircuito(plant, state.tripCounter * 17 + i * 31);
      const circuit = CIRCUIT_BY_PLANT_AND_CODE.get(`${plant}:${code}`);
      if (!circuit) continue;

      state.tripCounter++;
      tripsTodayByPlant[key] = (tripsTodayByPlant[key] ?? 0) + 1;

      const truckId = `LIVE-${plant.slice(0, 2).toUpperCase()}-${String(state.tripCounter).padStart(5, "0")}`;
      const plate = plateFor(state.tripCounter);

      newEntries.push({
        truckId,
        plate,
        plant,
        circuitCode: code,
        sectorSequence: circuit.sectorSequence,
        sectorIndex: 0,
        entryTime: newSimulatedClock,
        ticksRemaining: ticksTotalesViaje(truckId)
      });
    }
  }

  const trucksInProgress = [...stillInProgress, ...newEntries];

  // 3. Escribir camiones_en_planta por planta (todos los que están en planta)
  const activeTrucks: TruckInPlant[] = trucksInProgress.map((t) =>
    truckInProgressToTruckInPlant(t, newSimulatedClock)
  );

  const outputDir = path.join(MOCK_DATA_ROOT, scenario);

  // PRIORIDAD 1: camiones_en_planta por planta (live/ricardone/, live/san_lorenzo/, live/avellaneda/)
  for (const key of PLANT_KEYS) {
    const trucksForPlant = activeTrucks.filter((t) => toPlantKey(t.plant) === key);
    await writeOutputJson(
      `${key}/camiones_en_planta.json`,
      { version: "1.0", generatedAt: newSimulatedClock, scenario, planta: key, data: trucksForPlant },
      scenario
    );
  }

  // PRIORIDAD 2: histórico por planta. Flujo: camiones completan → historico_recorridos → al terminar semana/mes → archivos/{planta}/
  const byPlant = new Map<string, HistoricalTrip[]>();
  for (const key of PLANT_KEYS) byPlant.set(key, []);

  const archivosRoot = path.join(outputDir, "archivos");
  for (const key of PLANT_KEYS) {
    await mkdir(path.join(archivosRoot, key), { recursive: true });
  }

  // 1. Leer historico existente y acumular (camiones que ya completaron su recorrido)
  for (const key of PLANT_KEYS) {
    const filePath = path.join(outputDir, key, "historico_recorridos.json");
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { data?: HistoricalTrip[] };
      byPlant.set(key, parsed.data ?? []);
    } catch {
      // No existe
    }
  }

  // 2. Agregar viajes que acaban de completar (salen de camiones_en_planta → pasan a historico)
  for (const t of completedTrips) {
    const key = toPlantKey(t.plant);
    byPlant.get(key)!.push(t);
  }

  // 3. Al terminar semana: mover esos recorridos a archivos/{planta}/historico_semana_YYYY-WNN.json
  if (crossedNewWeek) {
    const semanaAnterior = prevWeek;
    for (const key of PLANT_KEYS) {
      const trips = byPlant.get(key)!;
      const deEstaSemana = trips.filter((trip) => {
        const f = trip.fecha ?? "";
        const [y, m, d] = f.split("-").map((x) => parseInt(x, 10) || 0);
        const tripDate = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
        return getISOWeek(tripDate) === semanaAnterior;
      });
      if (deEstaSemana.length > 0) {
        deEstaSemana.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
        const plantArchivosDir = path.join(archivosRoot, key);
        await writeFile(
          path.join(plantArchivosDir, `historico_semana_${semanaAnterior}.json`),
          JSON.stringify(
            { version: "1.0", scenario: "live", tipo: "copia_semanal", semana: semanaAnterior, planta: key, data: deEstaSemana },
            null,
            2
          ),
          "utf-8"
        );
        const restantes = trips.filter((t) => !deEstaSemana.includes(t));
        byPlant.set(key, restantes);
      }
    }
  }

  // 4. Al terminar mes: mover esos recorridos a archivos/{planta}/historico_YYYY_MM.json
  if (crossedNewMonth) {
    const mesAnterior = prevMonth;
    const [py, pm] = mesAnterior.split("-");
    for (const key of PLANT_KEYS) {
      const trips = byPlant.get(key)!;
      const deEsteMes = trips.filter((trip) => {
        const f = trip.fecha ?? "";
        const [y, m] = f.split("-").map((x) => parseInt(x, 10) || 0);
        return `${y}-${String(m).padStart(2, "0")}` === mesAnterior;
      });
      if (deEsteMes.length > 0) {
        deEsteMes.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
        const plantArchivosDir = path.join(archivosRoot, key);
        const archivoPath = path.join(plantArchivosDir, `historico_${py}_${pm}.json`);
        let archivoExistente: HistoricalTrip[] = [];
        try {
          const raw = await readFile(archivoPath, "utf-8");
          const parsed = JSON.parse(raw) as { data?: HistoricalTrip[] };
          archivoExistente = parsed.data ?? [];
        } catch {
          // No existe
        }
        await writeFile(
          archivoPath,
          JSON.stringify(
            { version: "1.0", scenario: "live", tipo: "copia_mensual", mes: mesAnterior, planta: key, data: [...archivoExistente, ...deEsteMes] },
            null,
            2
          ),
          "utf-8"
        );
        const restantes = trips.filter((t) => !deEsteMes.includes(t));
        byPlant.set(key, restantes);
      }
    }
  }

  // 5. Si excede MAX_TRIPS_POR_PLANTA, archivar los más viejos a archivos/{planta}/archivo_YYYY_MM.json
  const yyyy = new Date(newSimulatedClock).getUTCFullYear();
  const mm = String(new Date(newSimulatedClock).getUTCMonth() + 1).padStart(2, "0");
  for (const key of PLANT_KEYS) {
    let trips = byPlant.get(key)!;
    if (trips.length > MAX_TRIPS_POR_PLANTA) {
      const toArchive = trips.slice(0, trips.length - MAX_TRIPS_POR_PLANTA);
      trips = trips.slice(-MAX_TRIPS_POR_PLANTA);
      byPlant.set(key, trips);
      const archivo: TripArchivo[] = toArchive.map((t) => ({
        tripId: t.tripId,
        truckId: t.truckId,
        plate: t.plate,
        plant: t.plant,
        circuitCode: t.inferredCircuitCode ?? "",
        fecha: t.fecha,
        egresoAt: t.endedAt,
        durationMinutes: t.durationMinutes,
        classification: t.classification ?? "VALIDADO"
      }));
      const plantArchivosDir = path.join(archivosRoot, key);
      const archivoPath = path.join(plantArchivosDir, `archivo_${yyyy}_${mm}.json`);
      let archivoExistente: TripArchivo[] = [];
      try {
        const raw = await readFile(archivoPath, "utf-8");
        const parsed = JSON.parse(raw) as { data?: TripArchivo[] };
        archivoExistente = parsed.data ?? [];
      } catch {
        // No existe
      }
      await writeFile(
        archivoPath,
        JSON.stringify(
          { version: "1.0", scenario: "live", tipo: "archivo_analytics", planta: key, data: [...archivoExistente, ...archivo] },
          null,
          2
        ),
        "utf-8"
      );
    }
    await writeOutputJson(
      `${key}/historico_recorridos.json`,
      { version: "1.0", generatedAt: newSimulatedClock, scenario, planta: key, data: trips },
      scenario
    );
  }


  // raw_camera_events, camera_events_enriched, alertas_operativas: uno por planta en su carpeta
  for (const key of PLANT_KEYS) {
    await writeOutputJson(
      `${key}/raw_camera_events.json`,
      { version: "1.0", generatedAt: newSimulatedClock, source: "mock-camera-service", scenario, planta: key, events: [] },
      scenario
    );
    await writeOutputJson(
      `${key}/camera_events_enriched.json`,
      { version: "1.0", generatedAt: newSimulatedClock, scenario, planta: key, events: [] },
      scenario
    );
    await writeOutputJson(
      `${key}/alertas_operativas.json`,
      { version: "1.0", generatedAt: newSimulatedClock, scenario, planta: key, data: [] },
      scenario
    );
  }

  const stateToWrite: LiveState = {
    simulatedClock: newSimulatedClock,
    tripCounter: state.tripCounter,
    trucksInProgress,
    tripsTodayByPlant
  };
  await writeLiveState(stateToWrite);
}
