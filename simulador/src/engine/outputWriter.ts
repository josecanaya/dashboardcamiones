import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Ruta donde el dashboard consume: public/mock-data/{scenario}/ */
const DASHBOARD_MOCK_DATA = path.resolve(process.cwd(), "..", "public", "mock-data");

export async function writeOutputJson<T>(
  fileName: string,
  payload: T,
  scenario: string
): Promise<void> {
  const outputDir = path.join(DASHBOARD_MOCK_DATA, scenario);
  await mkdir(outputDir, { recursive: true });

  const fullPath = path.join(outputDir, fileName);
  await writeFile(fullPath, JSON.stringify(payload, null, 2), "utf-8");
}
