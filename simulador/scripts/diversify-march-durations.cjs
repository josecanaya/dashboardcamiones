/**
 * Reescribe durationMinutes en historico_recorridos.json de march_full
 * con una distribución normal realista (forma de campana) para que el histograma
 * muestre muchas barras de 5 min en lugar de pocos clusters.
 * Ejecutar: pnpm run diversify:march_full
 */

const fs = require("fs");
const path = require("path");

const MOCK_ROOT = path.resolve(__dirname, "..", "..", "public", "mock-data");
const PLANTS = ["ricardone", "san_lorenzo", "avellaneda"];

function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

/** Box-Muller: genera z ~ N(0,1) a partir de dos uniformes (0,1] */
function normalFromUniform(r1, r2) {
  const u1 = Math.max(1e-10, r1);
  const u2 = r2;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Genera nueva duración con distribución normal centrada en mean,
 * std mínimo 50 min para ~20 bins de 5 min a cada lado.
 */
function diversifyTrip(trip, idx, mean, std) {
  const r1 = seededRandom(idx * 2) * 0.999 + 0.001;
  const r2 = seededRandom(idx * 2 + 1);
  const z = normalFromUniform(r1, r2);
  const spread = Math.max(std, 50);
  const newDuration = Math.round(mean + z * spread);
  const clamped = Math.max(45, Math.min(900, newDuration));
  const diff = clamped - (trip.durationMinutes ?? 0);

  const endedAt = new Date(trip.endedAt);
  endedAt.setMinutes(endedAt.getMinutes() + diff);

  return {
    ...trip,
    durationMinutes: clamped,
    endedAt: endedAt.toISOString(),
  };
}

function getISOWeek(d) {
  const d2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  const y = d2.getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1));
  const weekNo = Math.ceil((((d2.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

function main() {
  const outDir = path.join(MOCK_ROOT, "march_full");
  const archivosRoot = path.join(outDir, "archivos");
  const weeks = ["2026-W09", "2026-W10", "2026-W11", "2026-W12", "2026-W13"];
  let totalModified = 0;

  const byPlant = {};

  for (const plant of PLANTS) {
    const p = path.join(outDir, plant, "historico_recorridos.json");
    if (!fs.existsSync(p)) {
      console.log(`[diversify] No existe ${p}`);
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(p, "utf-8"));
    const data = payload.data ?? [];
    const durations = data.map((t) => t.durationMinutes ?? 0).filter((d) => d > 0);
    const mean = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 240;
    const variance = durations.length > 1
      ? durations.reduce((s, d) => s + (d - mean) ** 2, 0) / (durations.length - 1)
      : 2500;
    const std = Math.sqrt(variance);
    const diversified = data.map((t, i) =>
      diversifyTrip(t, plant.length * 100000 + i, mean, std)
    );
    payload.data = diversified;
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf-8");
    byPlant[plant] = diversified;
    totalModified += data.length;
    const bins5 = new Set(diversified.map((d) => Math.floor(d.durationMinutes / 5) * 5)).size;
    console.log(`[diversify] ${plant}: ${data.length} viajes | mean=${mean.toFixed(0)} std=${std.toFixed(0)} | bins 5min: ${bins5}`);
  }

  // Actualizar copias en archivos/
  for (const plant of PLANTS) {
    const trips = byPlant[plant] ?? [];
    if (trips.length === 0) continue;
    const plantArchivos = path.join(archivosRoot, plant);
    fs.mkdirSync(plantArchivos, { recursive: true });
    for (const week of weeks) {
      const filtered = trips.filter((t) => {
        const f = t.fecha || "";
        const [ty, tm, td] = f.split("-").map(Number);
        if (!ty || !tm || ty !== 2026 || tm !== 3) return false;
        const d = new Date(Date.UTC(ty, tm - 1, td || 1));
        return getISOWeek(d) === week;
      });
      fs.writeFileSync(
        path.join(plantArchivos, `historico_semana_${week}.json`),
        JSON.stringify({
          version: "1.0",
          scenario: "march_full",
          tipo: "copia_semanal",
          semana: week,
          planta: plant,
          data: filtered,
        }, null, 2),
        "utf-8"
      );
    }
    fs.writeFileSync(
      path.join(plantArchivos, "historico_2026_03.json"),
      JSON.stringify({
        version: "1.0",
        scenario: "march_full",
        tipo: "copia_mensual",
        mes: "2026-03",
        planta: plant,
        data: trips,
      }, null, 2),
      "utf-8"
    );
  }

  console.log(`[diversify] Completado: ${totalModified} viajes con distribución normal realista. Archivos/ actualizados.`);
}

main();
