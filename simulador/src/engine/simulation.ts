import { enrichEvents } from "./enrichment.js";
import { generateRawEvents } from "./rawGenerator.js";
import { buildStateAndAlerts } from "./stateEngine.js";
import { writeOutputJson } from "./outputWriter.js";
import { buildScenario } from "../scenarios/buildScenario.js";
import { ScenarioName } from "../types/contracts.js";
import { runLiveTick } from "./liveSimulation.js";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

function getGeneratedAt(scenario: ScenarioName): string {
  if (scenario === "week_snapshot") {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }
  if (scenario === "march_full") {
    return "2026-03-31T23:59:00.000Z";
  }
  return new Date().toISOString();
}

async function getSharedTruckImageUrl(): Promise<string | undefined> {
  const sourceDir = path.resolve(process.cwd(), "output", "public");
  const targetDir = path.resolve(process.cwd(), "..", "public", "mock-data", "public");
  try {
    const files = await readdir(sourceDir);
    const image = files.find((file) => /\.(png|jpe?g|webp|gif)$/i.test(file));
    if (!image) return undefined;
    await mkdir(targetDir, { recursive: true });
    await copyFile(path.join(sourceDir, image), path.join(targetDir, image));
    return `../public/${encodeURIComponent(image)}`;
  } catch {
    return undefined;
  }
}

export async function runSimulation(scenario: ScenarioName): Promise<void> {
  if (scenario === "live") {
    await runLiveTick();
    return;
  }

  const built = buildScenario(scenario);
  const truckMap = built.trucks
    ? new Map(built.trucks.map((t) => [t.truckId, t]))
    : undefined;
  const rawEvents = generateRawEvents(built.steps, truckMap);
  const sharedImageUrl = await getSharedTruckImageUrl();
  const enrichedEvents = enrichEvents(rawEvents, built.steps, sharedImageUrl, truckMap);

  const generatedAt = getGeneratedAt(scenario);

  const { activeTrucks, historicalTrips, alerts } = buildStateAndAlerts(enrichedEvents, generatedAt);

  await writeOutputJson(
    "raw_camera_events.json",
    {
      version: "1.0",
      generatedAt,
      source: "mock-camera-service",
      scenario,
      events: rawEvents
    },
    scenario
  );

  await writeOutputJson(
    "camera_events_enriched.json",
    {
      version: "1.0",
      generatedAt,
      scenario,
      events: enrichedEvents
    },
    scenario
  );

  await writeOutputJson(
    "camiones_en_planta.json",
    {
      version: "1.0",
      generatedAt,
      scenario,
      data: activeTrucks
    },
    scenario
  );

  await writeOutputJson(
    "historico_recorridos.json",
    {
      version: "1.0",
      generatedAt,
      scenario,
      data: historicalTrips
    },
    scenario
  );

  await writeOutputJson(
    "alertas_operativas.json",
    {
      version: "1.0",
      generatedAt,
      scenario,
      data: alerts
    },
    scenario
  );
}
