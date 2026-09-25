/**
 * Carga una corrida guardada (`runs/windows/<runId>/`) como `EtlTransformOutput`, sin navegador.
 *
 * Misma conversión a CSV que `loadTransformOutputFromRun` en el front: los builders del
 * informe reciben CSV. La usan el armado del informe semanal (`build-report-package.ts`) y el
 * diario (`informe-diario.ts`), así las dos vías leen la corrida de la misma forma.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { EtlTransformOutput } from '../../src/features/real-truckflow/etlWorkbench/etlTransformContracts'

export const RAIZ = path.resolve(import.meta.dirname, '..', '..')

/** Misma serialización que `loadTransformOutputFromRun`: el builder recibe CSV. */
export function serializeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  if (!headers.length) return ''
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}

export async function cargarCorrida(runId: string): Promise<EtlTransformOutput> {
  const dir = path.join(RAIZ, 'runs', 'windows', runId)
  const nombres = (await fs.readdir(path.join(dir, 'tables'))).filter((f) => f.endsWith('.json'))
  const tables: Record<string, { headers: string[]; rows: Record<string, unknown>[] }> = {}
  const csv: Record<string, string> = {}
  for (const archivo of nombres) {
    const t = JSON.parse(await fs.readFile(path.join(dir, 'tables', archivo), 'utf8'))
    const nombre = archivo.replace(/\.json$/, '')
    tables[nombre] = { headers: t.headers ?? [], rows: t.rows ?? [] }
    csv[nombre] = serializeCsv(t.headers ?? [], t.rows ?? [])
  }
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
  let stats: unknown = {}
  try {
    stats = JSON.parse(await fs.readFile(path.join(dir, 'stats.json'), 'utf8'))
  } catch {
    stats = {}
  }
  return {
    csv,
    tables: tables as unknown as EtlTransformOutput['tables'],
    stats: stats as EtlTransformOutput['stats'],
    rulesVersion: String(manifest.rulesVersion ?? '') as EtlTransformOutput['rulesVersion'],
  }
}
