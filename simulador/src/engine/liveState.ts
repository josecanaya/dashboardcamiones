import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TruckInProgress {
  truckId: string;
  plate: string;
  plant: string;
  circuitCode: string;
  sectorSequence: string[];
  sectorIndex: number;
  entryTime: string;
  /** Ticks en sector actual (modo 10min/tick) o ticks restantes del viaje (modo 1h/tick) */
  ticksInCurrentSector?: number;
  /** Ticks restantes para completar (modo 1h/tick: 3-5) */
  ticksRemaining?: number;
}

export interface LiveState {
  simulatedClock: string;
  tripCounter: number;
  trucksInProgress: TruckInProgress[];
  /** Viajes ingresados hoy por planta (se reinicia a medianoche) */
  tripsTodayByPlant?: Record<string, number>;
}

const STATE_DIR = path.resolve(__dirname, "..", "..", ".runtime");
const STATE_FILE = path.join(STATE_DIR, "live_state.json");

/** Reloj inicial: hoy a las 06:00 UTC para arrancar desde el inicio del día simulado. */
function getInitialClock(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return new Date(Date.UTC(y, m, d, 6, 0, 0, 0)).toISOString();
}

export async function readLiveState(): Promise<LiveState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as LiveState;
    if (parsed.simulatedClock && typeof parsed.tripCounter === "number") {
      return {
        ...parsed,
        trucksInProgress: Array.isArray(parsed.trucksInProgress) ? parsed.trucksInProgress : [],
        tripsTodayByPlant: parsed.tripsTodayByPlant && typeof parsed.tripsTodayByPlant === "object" ? parsed.tripsTodayByPlant : {}
      };
    }
  } catch {
    // No existe o corrupto
  }
  return {
    simulatedClock: getInitialClock(),
    tripCounter: 0,
    trucksInProgress: []
  };
}

export async function writeLiveState(state: LiveState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function resetLiveState(): Promise<void> {
  try {
    await unlink(STATE_FILE);
  } catch {
    // No existe
  }
}
