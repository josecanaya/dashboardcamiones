import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Ruta donde el dashboard consume: public/mock-data/{scenario}/. Coincide con /mock-data en Vite. */
function getMockDataRoot(): string {
  const cwd = process.cwd();
  const projectRoot = path.basename(cwd) === "simulador" ? path.resolve(cwd, "..") : cwd;
  return path.resolve(projectRoot, "public", "mock-data");
}
const DASHBOARD_MOCK_DATA = getMockDataRoot();

export async function writeOutputJson<T>(
  fileName: string,
  payload: T,
  scenario: string
): Promise<void> {
  const outputDir = path.join(DASHBOARD_MOCK_DATA, scenario);
  const fullPath = path.join(outputDir, fileName);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(payload, null, 2), "utf-8");
}
