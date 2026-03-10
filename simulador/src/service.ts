import { runSimulation } from "./engine/simulation.js";
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
  if (["normal", "anomalies", "high-load", "week_snapshot"].includes(value)) return value;
  throw new Error(`Scenario invalido: ${value}. Usar normal | anomalies | high-load | week_snapshot`);
}

function getIntervalMs(): number {
  const raw = parseIntervalFromArgv(process.argv) ?? Number(process.env.npm_config_intervalsec);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 20;
  return seconds * 1000;
}

async function main(): Promise<void> {
  const scenario = getScenarioArg();
  const intervalMs = getIntervalMs();

  let running = true;
  let tickInProgress = false;

  const shutdown = (signal: string) => {
    running = false;
    console.log(`[simulator] Recibida senal ${signal}. Deteniendo servicio...`);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(
    `[simulator] Servicio iniciado. Escenario=${scenario}. Intervalo=${intervalMs / 1000}s.`
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
