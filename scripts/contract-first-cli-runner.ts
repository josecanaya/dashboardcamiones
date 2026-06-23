/**
 * Ejecuta Contract-first sin UI (Excel + JSON local Truckflow).
 * Invocado desde run-truckflow-transform-local.mjs vía `npx tsx`.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { buildCliFinalCsvRowsFromLocalEventJson } from '../src/services/truckflowTransform/contractFirst/contractFirstCliAdapter.ts'
import {
  runMovimientosContratoIntegration,
  CONTRACT_FIRST_INTEGRATION_CSV_KEYS,
} from '../src/services/truckflowTransform/contractFirst/contractIntegrationRun.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

export type ContractFirstCliArgs = {
  from: string
  to: string
  excel: string
  tiemposEntrePasos: string[]
  dataRoot: string
  outDir: string
}

const MIN_OUTPUT_FILES: { csvKey: (typeof CONTRACT_FIRST_INTEGRATION_CSV_KEYS)[number]; filename: string }[] = [
  { csvKey: 'excel_operations_with_truckflow', filename: 'excel_operations_with_truckflow.csv' },
  { csvKey: 'merged_truckflow_movimientos', filename: 'merged_truckflow_movimientos.csv' },
  { csvKey: 'movimientos_without_truckflow_match', filename: 'movimientos_without_truckflow_match.csv' },
  { csvKey: 'truckflow_without_movimiento_match', filename: 'truckflow_without_movimiento_match.csv' },
  { csvKey: 'excel_no_truckflow_evidence_diagnostics', filename: 'excel_no_truckflow_evidence_diagnostics.csv' },
  { csvKey: 'clean_journeys_for_analysis', filename: 'clean_journeys_for_analysis.csv' },
]

function* dayRange(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00`)
  const end = new Date(`${endIso}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
  if (start > end) return
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    yield `${y}-${m}-${day}`
  }
}

export function parseContractFirstCliArgv(argv: string[]): ContractFirstCliArgs | { help: true } {
  const out: ContractFirstCliArgs = {
    from: '',
    to: '',
    excel: '',
    tiemposEntrePasos: [],
    dataRoot: path.join(PROJECT_ROOT, 'data', 'truckflow'),
    outDir: path.join(PROJECT_ROOT, 'scripts', 'output', 'contract-first'),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return { help: true }
    if (a === '--from' || a === '--start') out.from = argv[++i] ?? ''
    if (a === '--to' || a === '--end') out.to = argv[++i] ?? ''
    if (a === '--excel') out.excel = argv[++i] ?? ''
    if (a === '--tiempos-entre-pasos') out.tiemposEntrePasos.push(argv[++i] ?? '')
    if (a === '--data-root') out.dataRoot = path.resolve(argv[++i] ?? '')
    if (a === '--out') out.outDir = path.resolve(argv[++i] ?? '')
  }
  return out
}

export async function runContractFirstCli(args: ContractFirstCliArgs): Promise<{ outDir: string; logs: string[] }> {
  if (!args.from || !args.to || !args.excel) {
    throw new Error('Faltan --from, --to y --excel')
  }

  const days = [...dayRange(args.from, args.to)]
  if (days.length === 0) throw new Error('Rango de fechas inválido')

  const eventFiles: { day: string; jsonText: string }[] = []
  for (const day of days) {
    const eventPath = path.join(args.dataRoot, day, 'event-list.json')
    const jsonText = await fs.readFile(eventPath, 'utf8')
    eventFiles.push({ day, jsonText })
  }

  const excelBuf = await fs.readFile(args.excel)
  const excelName = path.basename(args.excel)

  const tiemposFiles: { sourceFile: string; arrayBuffer: ArrayBuffer }[] = []
  for (const p of args.tiemposEntrePasos) {
    if (!p?.trim()) continue
    const buf = await fs.readFile(p)
    tiemposFiles.push({
      sourceFile: path.basename(p),
      arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    })
  }

  const logs: string[] = []
  logs.push(`[contract-first-cli] días Truckflow: ${days.join(', ')}`)
  logs.push(`[contract-first-cli] Excel: ${args.excel}`)
  if (tiemposFiles.length) {
    logs.push(`[contract-first-cli] TiemposEntrePasos: ${tiemposFiles.map((f) => f.sourceFile).join(', ')}`)
  }

  const built = await buildCliFinalCsvRowsFromLocalEventJson(eventFiles)
  for (const d of built.perDay) {
    logs.push(`  eventos crudos día ${d.day}: ${d.eventCount}`)
  }
  logs.push(
    `[contract-first-cli] Ricardone eventos ${built.eventCount} → journeys reconstruidos ${built.journeyCount} (sin matriz Workbench)`
  )

  const result = await runMovimientosContratoIntegration({
    finalCsvRows: built.finalCsvRows,
    journeyTimesByUid: built.journeyTimesByUid,
    classifiedJourneys: [],
    movimientosFiles: [
      {
        sourceFile: excelName,
        arrayBuffer: excelBuf.buffer.slice(
          excelBuf.byteOffset,
          excelBuf.byteOffset + excelBuf.byteLength
        ) as ArrayBuffer,
      },
    ],
    tiemposEntrePasosFiles: tiemposFiles.length ? tiemposFiles : undefined,
    skipKpiTiemposArtifacts: true,
    onProgress: (ev) => {
      console.info('[CONTRACT_FIRST_PROGRESS]', ev.step, ev.label, `${ev.current}/${ev.total}`, ev.elapsedMs, 'ms')
    },
  })
  if (result.stageTimings.length) {
    console.info('[CONTRACT_FIRST_PASO3] stageTimings', result.stageTimings)
  }

  logs.push(...result.logs)

  await fs.mkdir(args.outDir, { recursive: true })
  const written: string[] = []
  for (const { csvKey, filename } of MIN_OUTPUT_FILES) {
    const content = result.csv[csvKey]
    if (content === undefined) {
      logs.push(`AVISO: sin contenido para clave ${csvKey}`)
      continue
    }
    const dest = path.join(args.outDir, filename)
    await fs.writeFile(dest, content, 'utf8')
    written.push(dest)
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    from: args.from,
    to: args.to,
    excel: args.excel,
    dataRoot: args.dataRoot,
    reconstruction: 'contract_first_cli_v1',
    pipelineOrder: 'truckflow_reconstruct_then_excel_merge',
    filesWritten: written.map((p) => path.relative(PROJECT_ROOT, p)),
    stats: result.stats,
    excelFirstDiscardCounters:
      (result.stats.excelFirst as Record<string, unknown> | undefined) ?
        Object.fromEntries(
          Object.entries(result.stats.excelFirst as Record<string, unknown>).filter(([k]) =>
            [
              'no_plate_in_truckflow',
              'exact_plate_candidates',
              'fuzzy_plate_candidates',
              'rejected_by_time_window',
              'rejected_by_low_ocr_similarity',
              'rejected_by_ambiguous_fuzzy',
              'rejected_by_site_or_plant',
              'candidates_after_prefilter',
              'candidates_after_time_filter',
              'candidates_after_fuzzy_filter',
              'operations_with_exact_plate',
              'operations_with_only_fuzzy_plate',
              'operations_without_any_candidate',
              'use_candidate_prefilter',
            ].includes(k)
          )
        )
      : null,
    stageTimings: result.stageTimings,
  }
  await fs.writeFile(path.join(args.outDir, 'contract-first-run-meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  logs.push(`[contract-first-cli] salida: ${args.outDir}`)
  logs.push(`[contract-first-cli] archivos: ${written.length}`)

  return { outDir: args.outDir, logs }
}

async function main() {
  const parsed = parseContractFirstCliArgv(process.argv.slice(2))
  if ('help' in parsed) {
    console.log(`Contract-first CLI (tsx)

Opciones:
  --from / --start   YYYY-MM-DD
  --to / --end       YYYY-MM-DD
  --excel            Ruta a MovimientosPorContrato.xlsx
  --tiempos-entre-pasos  Ruta a TiemposEntrePasos_YYYYMMDD.xlsx (repetible)
  --data-root        Carpeta data/truckflow (default: data/truckflow)
  --out              Carpeta salida (default: scripts/output/contract-first)
`)
    process.exit(0)
  }

  const { logs } = await runContractFirstCli(parsed)
  for (const line of logs) console.log(line)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
