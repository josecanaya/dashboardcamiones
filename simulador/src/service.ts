import { runSimulation } from "./engine/simulation.js";
import { resetLive } from "./engine/liveSimulation.js";
import { ScenarioName } from "./types/contracts.js";

function parseScenarioFromArgv(argv: string[]): string | undefined {
  const eqArg = argv.find(
    (arg) => arg.startsWith("--scenario=") || arg.startsWith("scenario=")
  );
  if (eqArg) return eqArg.split("=")[1];
  const flagIndex = argv.findIndex((arg) => arg === "--scenario" || arg === "scenario");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return undefined;
}

function parseIntervalFromArgv(argv: string[]): number | undefined {
  const eqArg = argv.find(
    (arg) => arg.startsWith("--intervalSec=") || arg.startsWith("intervalSec=")
  );
  if (eqArg) return Number(eqArg.split("=")[1]);
  const flagIndex = argv.findIndex((arg) => arg === "--intervalSec" || arg === "intervalSec");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return Number(argv[flagIndex + 1]);
  return undefined;
}

function getScenarioArg(): ScenarioName {
  const value = (
    parseScenarioFromArgv(process.argv) ?? process.env.npm_config_scenario
  ) as ScenarioName | undefined;
  if (!value) return "normal";
  if (["normal", "anomalies", "high-load", "week_snapshot", "march_full", "live"].includes(value)) return value;
  throw new Error(`Scenario invalido: ${value}. Usar normal | anomalies | high-load | week_snapshot | march_full | live`);
}

function getIntervalMs(scenario: ScenarioName): number {
  const raw = parseIntervalFromArgv(process.argv) ?? Number(process.env.npm_config_intervalsec);
  if (Number.isFinite(raw) && raw > 0) return Math.max(50, Math.round(raw * 1000));
  return scenario === "live" ? 3 * 1000 : 20 * 1000;
}

function hasResetArg(): boolean {
  return process.argv.includes("--reset") || process.argv.includes("-reset");
}

async function main(): Promise<void> {
  const scenario = getScenarioArg();
  const intervalMs = getIntervalMs(scenario);

  let running = true;
  let tickInProgress = false;

  const shutdown = (signal: string) => {
    running = false;
    console.log(`[simulator] Recibida senal ${signal}. Deteniendo servicio...`);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  if (scenario === "live" && hasResetArg()) {
    await resetLive();
    console.log("[simulator] Reset completado. Estado y historico en 0.");
  }

  const turbo = intervalMs < 500;
  console.log(
    `[simulator] Servicio iniciado. Escenario=${scenario}. Intervalo=${intervalMs}ms real.` +
      (scenario === "live"
        ? turbo
          ? ` (TURBO: ~1 semana cada 20s, 40/35/15 por hora Ric/SL/Av)`
          : " (3s real = 1h sim, ~50 dias/hora real, 40/35/15 por hora Ric/SL/Av)"
        : "")
  );

  while (running) {
    if (!tickInProgress) {
      tickInProgress = true;
      try {
        await runSimulation(scenario);
        console.log(
          `[simulator] Tick OK (${scenario}) - ${new Date().toISOString()} -> public/mock-data/${scenario}/`
        );
      } catch (error) {
        console.error("[simulator] Error en tick:", error);
      } finally {
        tickInProgress = false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.log("[simulator] Servicio detenido.");
}

main().catch((error: unknown) => {
  console.error("[simulator] Error fatal:", error);
  process.exit(1);
});
