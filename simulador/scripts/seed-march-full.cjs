/**
 * Genera 3 variantes de marzo completo con estructura por planta:
 * - march_full: baseline (variación normal)
 * - march_full_ordered: tiempos uniformes (baja desviación)
 * - march_full_chaos: desordenado (alta desviación)
 * Cada una: ~45.000 viajes, 31 días, archivos/ con copias semanales y mensual.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MOCK_ROOT = path.resolve(__dirname, "..", "..", "public", "mock-data");
const PLANTS = ["ricardone", "san_lorenzo", "avellaneda"];
const SCENARIOS = [
  { id: "march_full", label: "baseline" },
  { id: "march_full_ordered", label: "ordenado" },
  { id: "march_full_chaos", label: "desordenado" },
];

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function getISOWeek(d) {
  const d2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  const y = d2.getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1));
  const weekNo = Math.ceil((((d2.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

function processScenario(scenarioId) {
  const outDir = path.join(MOCK_ROOT, scenarioId);
  const simuladorDir = path.resolve(__dirname, "..");

  console.log(`[${scenarioId}] Ejecutando simulación...`);
  execSync(`npm run simulate -- --scenario=${scenarioId}`, {
    cwd: simuladorDir,
    stdio: "inherit",
  });

  const byPlant = {};
  for (const key of PLANTS) {
    const p = path.join(outDir, key, "historico_recorridos.json");
    const payload = readJson(p);
    byPlant[key] = payload?.data ?? [];
  }

  const archivosRoot = path.join(outDir, "archivos");
  const weeks = ["2026-W09", "2026-W10", "2026-W11", "2026-W12", "2026-W13"];
  for (const key of PLANTS) {
    const plantArchivos = path.join(archivosRoot, key);
    fs.mkdirSync(plantArchivos, { recursive: true });
    for (const week of weeks) {
      const trips = byPlant[key].filter((t) => {
        const f = t.fecha || "";
        const [ty, tm, td] = f.split("-").map(Number);
        if (!ty || !tm || ty !== 2026 || tm !== 3) return false;
        const d = new Date(Date.UTC(ty, tm - 1, td || 1));
        return getISOWeek(d) === week;
      });
      writeJson(path.join(plantArchivos, `historico_semana_${week}.json`), {
        version: "1.0",
        scenario: scenarioId,
        tipo: "copia_semanal",
        semana: week,
        planta: key,
        data: trips,
      });
    }
  }

  for (const key of PLANTS) {
    const plantArchivos = path.join(archivosRoot, key);
    writeJson(path.join(plantArchivos, "historico_2026_03.json"), {
      version: "1.0",
      scenario: scenarioId,
      tipo: "copia_mensual",
      mes: "2026-03",
      planta: key,
      data: byPlant[key],
    });
  }

  const total =
    byPlant.ricardone.length + byPlant.san_lorenzo.length + byPlant.avellaneda.length;
  return { total, byPlant };
}

function main() {
  console.log("[march_full] Generando 3 variantes de marzo 2026...\n");

  for (const { id, label } of SCENARIOS) {
    const { total, byPlant } = processScenario(id);
    console.log(`[${id}] ${label}: ${total} viajes`);
    console.log(
      `  ricardone: ${byPlant.ricardone.length}, san_lorenzo: ${byPlant.san_lorenzo.length}, avellaneda: ${byPlant.avellaneda.length}\n`
    );
  }

  console.log("[march_full] Completado. Guardado en public/mock-data/");
}

main();
