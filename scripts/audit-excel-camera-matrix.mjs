/**
 * Listado Excel por circuito: CTG, patente, día egreso + SI/NO por cámara (crudo Truckflow).
 *
 * Universo = movimientos por contrato (Excel crudo), NO scatter post-transform.
 *
 * Uso:
 *   npx tsx scripts/audit-excel-camera-matrix.mjs R7 RUTA/external_movimientos_contrato_normalized.csv data/truckflow --from 2026-06-12 --to 2026-06-18
 *   npx tsx scripts/audit-excel-camera-matrix.mjs R7 carpeta/MovimientosPorContrato data/truckflow --from 2026-06-12 --to 2026-06-18
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join, resolve, basename } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '..')
const modUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditExcelCameraMatrix.ts')
).href
const sourceModUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/auditExcelMovimientosSource.ts')
).href
const mcModUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlExternalMovimientosContrato.ts')
).href

const {
  buildExcelCameraMatrix,
  summarizeExcelCameraMatrix,
  excelCameraMatrixToCsv,
  formatExcelCameraSummaryLog,
  getExcelCameraStepsForCircuit,
  summarizeRouteRecognition,
} = await import(modUrl)

const {
  buildExcelMovimientosUniverse,
  parseNormalizedMovimientosCsvRow,
  assertNotScatterCsvForRawAudit,
  describeExcelUniverse,
  formatExcelUniverseLog,
  computeExcelPeriodTotals,
} = await import(sourceModUrl)

function parseCli(argv) {
  let fromDay = ''
  let toDay = ''
  let minPuntos = 4
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
    positional.push(a)
  }
  return { fromDay, toDay, minPuntos, positional }
}

function printUsage() {
  console.error(`
Uso:
  npx tsx scripts/audit-excel-camera-matrix.mjs <R1|R5|R7> <movimientos-excel> <data/truckflow> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--min-puntos 4]

<movimientos-excel>:
  - external_movimientos_contrato_normalized.csv (export Transform)
  - archivo .xlsx MovimientosPorContrato
  - carpeta con uno o más .xlsx

R7: universo = volcables PTO 1–5 terminal portuaria (Excel), cruce con JSON Truckflow importado.
NO usar excel_operation_segments_for_scatter.csv (solo camiones que pasaron el transform).
`)
}

const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDayKey(s) {
  const t = Date.parse(`${s}T12:00:00`)
  return Number.isFinite(t) ? t : Number.NaN
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return { header: [], rows: [] }
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
  const rows = lines.slice(1).map((line) => {
    const cols = parseLine(line)
    const row = {}
    header.forEach((h, j) => {
      row[h] = cols[j] ?? ''
    })
    return row
  })
  return { header, rows }
}

async function loadMovimientosContratoFromPath(excelPath) {
  const { loadMovimientosContratoFiles, normalizeMovimientosContratoBatch } = await import(mcModUrl)
  const st = statSync(excelPath)

  if (st.isDirectory()) {
    const xlsxNames = readdirSync(excelPath).filter((n) => /\.xlsx$/i.test(n))
    if (!xlsxNames.length) {
      throw new Error(`No hay .xlsx en carpeta: ${excelPath}`)
    }
    const files = xlsxNames.map((name) => {
      const full = join(excelPath, name)
      const buf = readFileSync(full)
      return { sourceFile: name, arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })
    const { raw, warnings } = loadMovimientosContratoFiles(files)
    for (const w of warnings) console.error(`  [excel] ${w}`)
    const normalized = normalizeMovimientosContratoBatch(raw)
    console.error(`  Excel: ${files.length} archivo(s), ${normalized.length} movimientos normalizados`)
    return normalized
  }

  const lower = excelPath.toLowerCase()
  if (lower.endsWith('.xlsx')) {
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

  const { header, rows } = parseCsv(readFileSync(excelPath, 'utf8'))
  assertNotScatterCsvForRawAudit(header)
  const movs = rows.map((r) => parseNormalizedMovimientosCsvRow(r))
  console.error(`  CSV movimientos: ${movs.length} filas`)
  return movs
}

function loadJsonEventArray(raw) {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.value)) return raw.value
  if (Array.isArray(raw.records)) return raw.records
  throw new Error('JSON inválido para eventos')
}

function loadEventsFromFile(path) {
  if (path.toLowerCase().endsWith('.csv')) {
    return parseCsv(readFileSync(path, 'utf8')).rows.map((row) => ({
      truckPlate: row.truck_plate ?? row.truckPlate,
      normalizedPlate: row.normalized_plate,
      deviceCode: row.device_code ?? row.deviceCode,
      sectorCode: row.sector_code ?? row.sectorCode,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
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
    console.error(`  ${day}: ${batch.length} eventos`)
    all.push(...batch)
  }
  return { events: all, dayDirs }
}

function resolveInputPath(arg) {
  const trimmed = String(arg ?? '').trim()
  if (!trimmed) return ''
  if (isAbsolute(trimmed)) return trimmed
  return resolve(process.cwd(), trimmed)
}

const { fromDay, toDay, minPuntos, positional } = parseCli(process.argv.slice(2))
const circuitCode = String(positional[0] ?? '').trim().toUpperCase()
const excelPath = resolveInputPath(positional[1])
const eventsPath = resolveInputPath(positional[2])

if (!circuitCode || !excelPath || !eventsPath) {
  printUsage()
  process.exit(1)
}

try {
  getExcelCameraStepsForCircuit(circuitCode)
} catch (e) {
  console.error(e.message)
  printUsage()
  process.exit(1)
}

if (!existsSync(excelPath) || !existsSync(eventsPath)) {
  console.error('Archivo no encontrado.')
  process.exit(1)
}

let movimientosRaw
try {
  movimientosRaw = await loadMovimientosContratoFromPath(excelPath)
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}

const movimientos = buildExcelMovimientosUniverse(movimientosRaw, circuitCode, {
  fromDay: fromDay || undefined,
  toDay: toDay || undefined,
})

const periodTotals = computeExcelPeriodTotals(movimientosRaw, fromDay || undefined, toDay || undefined)

const universeStats = describeExcelUniverse(
  movimientosRaw.length,
  movimientosRaw,
  circuitCode,
  movimientos,
  periodTotals,
  fromDay || undefined,
  toDay || undefined
)

if (!movimientos.length) {
  console.error(formatExcelUniverseLog(universeStats, periodTotals))
  console.error(`No hay camiones ${circuitCode} en el Excel para el rango indicado.`)
  process.exit(1)
}

console.error(formatExcelUniverseLog(universeStats, periodTotals))
console.error('Cargando eventos Truckflow (crudo)…')
const events =
  statSync(eventsPath).isDirectory() ?
    loadEventsFromTruckflowDir(eventsPath, fromDay, toDay).events
  : loadEventsFromFile(eventsPath)

const matrix = buildExcelCameraMatrix(circuitCode, movimientos, events, {
  preferCreatedAt: true,
  windowPaddingHours: 6,
})
const summaries = summarizeExcelCameraMatrix(circuitCode, matrix)
const routeRecognition = summarizeRouteRecognition(circuitCode, matrix, minPuntos)

console.error(formatExcelCameraSummaryLog(circuitCode, summaries, matrix.length, routeRecognition))
console.log(excelCameraMatrixToCsv(circuitCode, matrix, summaries, routeRecognition))
