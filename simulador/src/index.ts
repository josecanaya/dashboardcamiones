import { runSimulation } from "./engine/simulation.js";
import { resetLive } from "./engine/liveSimulation.js";
import { ScenarioName } from "./types/contracts.js";

function parseScenarioFromArgv(argv: string[]): string | undefined {
  const eqArg = argv.find(
    (arg) => arg.startsWith("--scenario=") || arg.startsWith("scenario=")
  );
  if (eqArg) {
    return eqArg.split("=")[1];
  }
  const flagIndex = argv.findIndex((arg) => arg === "--scenario" || arg === "scenario");
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1];
  }
  return undefined;
}

function getScenarioArg(): ScenarioName {
  const value = (
    parseScenarioFromArgv(process.argv) ?? process.env.npm_config_scenario
  ) as ScenarioName | undefined;
  if (!value) return "normal";
  const valid = [
    "normal",
    "anomalies",
    "high-load",
    "week_snapshot",
    "march_full",
    "march_full_ordered",
    "march_full_chaos",
    "live"
  ];
  if (valid.includes(value)) return value;
  throw new Error(`Scenario invalido: ${value}. Usar ${valid.join(" | ")}`);
}

function hasResetArg(): boolean {
  return process.argv.includes("--reset") || process.argv.includes("-reset");
}

async function main(): Promise<void> {
  const scenario = getScenarioArg();
  if (scenario === "live" && hasResetArg()) {
    await resetLive();
    console.log("Reset completado. Estado y historico en 0.");
  }
  await runSimulation(scenario);
  console.log(`Simulacion completada (${scenario}). Archivos en public/mock-data/${scenario}/`);
}

main().catch((error: unknown) => {
  console.error("Error al ejecutar simulador:", error);
  process.exit(1);
});
