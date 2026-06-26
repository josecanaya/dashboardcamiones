/**
 * Genera matrices cámara R1, R5, R6, R7 desde Excel movimientos por contrato + Truckflow crudo.
 *
 * Uso:
 *   npx tsx scripts/audit-excel-camera-matrix-batch.mjs "C:\Users\Usuario\Downloads\reportedecamionesde12a1806" data/truckflow --from 2026-06-12 --to 2026-06-18 --out RUTA
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, join, resolve, basename } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const matrixMod = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditExcelCameraMatrix.ts')
).href
const sourceMod = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditExcelMovimientosSource.ts')
).href
const mcMod = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts')
).href

const {
  buildExcelCameraMatrix,
  summarizeExcelCameraMatrix,
  excelCameraMatrixToCsv,
  formatExcelCameraSummaryLog,
  summarizeRouteRecognition,
  RAW_AUDIT_CIRCUIT_CODES,
} = await import(matrixMod)

const {
  buildExcelMovimientosUniverse,
  computeExcelPeriodTotals,
  describeExcelUniverse,
  formatExcelUniverseLog,
  formatExcelPeriodShareSummary,
  excelPeriodShareToCsv,
} = await import(sourceMod)

const CIRCUITS = [...RAW_AUDIT_CIRCUIT_CODES]

function parseCli(argv) {
  let fromDay = ''
  let toDay = ''
  let minPuntos = 4
  let outDir = resolve(root, 'RUTA')
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') {
      fromDay = String(argv[++i] ?? '').trim()
      continue
    }
    if (a === '--to') {
      toDay = String(argv[++i] ?? '').trim()
      continue
    }
    if (a === '--min-puntos') {
      const n = Number(argv[++i])
      if (Number.isFinite(n) && n >= 1) minPuntos = Math.floor(n)
      continue
    }
    if (a === '--out') {
      outDir = resolveInputPath(argv[++i])
      continue
    }
    positional.push(a)
  }
  return { fromDay, toDay, minPuntos, outDir, positional }
}

function printUsage() {
  console.error(`
Uso:
  npx tsx scripts/audit-excel-camera-matrix-batch.mjs <carpeta-xlsx-movimientos> <data/truckflow> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out RUTA] [--min-puntos 4]

Genera por circuito R1 R5 R6 R7:
  audit-{circuito}-excel-camera-matrix.csv
  audit-excel-circuitos-share.csv (participación vs total movimientos Excel del período)
  audit-excel-camera-matrix-batch-summary.txt
`)
}

const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDayKey(s) {
  const t = Date.parse(`${s}T12:00:00`)
  return Number.isFinite(t) ? t : Number.NaN
}

function resolveInputPath(arg) {
  const trimmed = String(arg ?? '').trim()
  if (!trimmed) return ''
  if (isAbsolute(trimmed)) return trimmed
  return resolve(process.cwd(), trimmed)
}

async function loadMovimientosFromExcelPath(excelPath) {
  const { loadMovimientosContratoFiles, normalizeMovimientosContratoBatch } = await import(mcMod)
  const st = statSync(excelPath)

  if (st.isDirectory()) {
    const xlsxNames = readdirSync(excelPath).filter((n) => /\.xlsx$/i.test(n))
    if (!xlsxNames.length) throw new Error(`No hay .xlsx en: ${excelPath}`)
    const files = xlsxNames.map((name) => {
      const full = join(excelPath, name)
      const buf = readFileSync(full)
      return {
        sourceFile: name,
        arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      }
    })
    const { raw, warnings } = loadMovimientosContratoFiles(files)
    for (const w of warnings) console.error(`  [excel] ${w}`)
    console.error(`  Excel: ${files.length} archivo(s)`)
    return normalizeMovimientosContratoBatch(raw)
  }

  if (excelPath.toLowerCase().endsWith('.xlsx')) {
    const buf = readFileSync(excelPath)
    const { raw, warnings } = loadMovimientosContratoFiles([
      {
        sourceFile: basename(excelPath),
        arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      },
    ])
    for (const w of warnings) console.error(`  [excel] ${w}`)
    return normalizeMovimientosContratoBatch(raw)
  }

  throw new Error('La entrada debe ser carpeta con .xlsx o un archivo .xlsx')
}

function loadJsonEventArray(raw) {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.value)) return raw.value
  if (Array.isArray(raw.records)) return raw.records
  throw new Error('JSON inválido para eventos')
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const parseLine = (line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = parseLine(line)
    const row = {}
    header.forEach((h, j) => {
      row[h] = cols[j] ?? ''
    })
    return row
  })
}

function loadEventsFromFile(path) {
  if (path.toLowerCase().endsWith('.csv')) {
    return parseCsv(readFileSync(path, 'utf8')).map((row) => ({
      journeyUid: row.journey_uid ?? row.journeyUid,
      truckPlate: row.truck_plate ?? row.truckPlate,
      normalizedPlate: row.normalized_plate ?? row.normalizedPlate,
      rawTruckPlate: row.raw_truck_plate ?? row.rawTruckPlate,
      deviceCode: row.device_code ?? row.deviceCode,
      sectorCode: row.sector_code ?? row.sectorCode,
      occurredAt: row.occurred_at ?? row.occurredAt,
      createdAt: row.created_at ?? row.createdAt,
      modifiedAt: row.modified_at ?? row.modifiedAt,
      recordedAt: row.recorded_at ?? row.recordedAt,
      payload: row.payload,
    }))
  }
  return loadJsonEventArray(JSON.parse(readFileSync(path, 'utf8')))
}

function loadEventsFromTruckflowDir(dir, fromDay, toDay) {
  const fromMs = fromDay ? parseDayKey(fromDay) : Number.NaN
  const toMs = toDay ? parseDayKey(toDay) : Number.NaN
  const dayDirs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DAY_DIR_RE.test(e.name))
    .map((e) => e.name)
    .filter((name) => {
      const ms = parseDayKey(name)
      if (!Number.isFinite(ms)) return false
      if (Number.isFinite(fromMs) && ms < fromMs) return false
      if (Number.isFinite(toMs) && ms > toMs) return false
      return true
    })
    .sort()
  const all = []
  for (const day of dayDirs) {
    const file = join(dir, day, 'event-list.json')
    if (!existsSync(file)) continue
    const batch = loadEventsFromFile(file)
    console.error(`  truckflow ${day}: ${batch.length} eventos`)
    all.push(...batch)
  }
  return all
}

const { fromDay, toDay, minPuntos, outDir, positional } = parseCli(process.argv.slice(2))
const excelPath = resolveInputPath(positional[0])
const eventsPath = resolveInputPath(positional[1])

if (!excelPath || !eventsPath) {
  printUsage()
  process.exit(1)
}
if (!existsSync(excelPath) || !existsSync(eventsPath)) {
  console.error('Ruta no encontrada.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

console.error('Cargando movimientos por contrato…')
const movimientosRaw = await loadMovimientosFromExcelPath(excelPath)
console.error(`  ${movimientosRaw.length} filas normalizadas`)

const periodTotals = computeExcelPeriodTotals(movimientosRaw, fromDay || undefined, toDay || undefined)
console.error(formatExcelPeriodShareSummary(periodTotals))

writeFileSync(join(outDir, 'audit-excel-circuitos-share.csv'), excelPeriodShareToCsv(periodTotals), 'utf8')

console.error('Cargando Truckflow…')
const events =
  statSync(eventsPath).isDirectory() ?
    loadEventsFromTruckflowDir(eventsPath, fromDay, toDay)
  : loadEventsFromFile(eventsPath)

const summaryLines = [
  formatExcelPeriodShareSummary(periodTotals),
  '',
  `Período egreso Excel: ${fromDay || '…'} → ${toDay || '…'}`,
  `Eventos Truckflow cargados: ${events.length}`,
  '',
]

for (const circuitCode of CIRCUITS) {
  const movimientos = buildExcelMovimientosUniverse(movimientosRaw, circuitCode, {
    fromDay: fromDay || undefined,
    toDay: toDay || undefined,
  })
  const stats = describeExcelUniverse(
    movimientosRaw.length,
    movimientosRaw,
    circuitCode,
    movimientos,
    periodTotals,
    fromDay || undefined,
    toDay || undefined
  )

  console.error('')
  console.error(`--- ${circuitCode} ---`)
  console.error(formatExcelUniverseLog(stats, periodTotals))

  if (!movimientos.length) {
    summaryLines.push(`=== ${circuitCode}: sin camiones en Excel para el período ===`)
    continue
  }

  const matrix = buildExcelCameraMatrix(circuitCode, movimientos, events, {
    preferCreatedAt: true,
    windowPaddingHours: 6,
  })
  const summaries = summarizeExcelCameraMatrix(circuitCode, matrix)
  const routeRecognition = summarizeRouteRecognition(circuitCode, matrix, minPuntos)

  const csvBody = excelCameraMatrixToCsv(circuitCode, matrix, summaries, routeRecognition)
  const outFile = join(outDir, `audit-${circuitCode.toLowerCase()}-excel-camera-matrix.csv`)
  writeFileSync(outFile, csvBody, 'utf8')
  console.error(`  → ${outFile}`)

  summaryLines.push(formatExcelCameraSummaryLog(circuitCode, summaries, matrix.length, routeRecognition))
  summaryLines.push(formatExcelUniverseLog(stats, periodTotals))
  summaryLines.push('')
}

const summaryPath = join(outDir, 'audit-excel-camera-matrix-batch-summary.txt')
writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8')
console.error('')
console.error(`Resumen: ${summaryPath}`)
console.error(`Share CSV: ${join(outDir, 'audit-excel-circuitos-share.csv')}`)
