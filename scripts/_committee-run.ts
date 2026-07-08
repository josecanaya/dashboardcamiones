/**
 * Harness headless: corre el MISMO pipeline del software (runEtlTransformAllTramos +
 * buildKpiTiemposArtifacts) sobre data/truckflow + Excel Movimientos, para el período
 * de comité, y vuelca stats + CSVs (incluye tramos/segment timing).
 * Uso: npx vite-node scripts/_committee-run.ts --from 2026-06-22 --to 2026-07-05
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runEtlTransformAllTramos, createTransformPhaseSession } from '../src/features/real-truckflow/etlWorkbench/etlTransformPhaseRunner.ts'
import { buildKpiTiemposArtifacts } from '../src/features/real-truckflow/etlWorkbench/etlKpiTiemposBuild.ts'
import { buildSegmentTimingIndex, segmentTimingKpiCsv, segmentTimingLegsCsv } from '../src/features/real-truckflow/etlWorkbench/etlSegmentTiming.ts'
import type { EtlTransformInput } from '../src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts'
import type { RealJourneyEventDto } from '../src/services/realJourneyEvents.types.ts'
import type { RealAlertDto } from '../src/services/realTruckflowApi.ts'

function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? def) : def
}

const FROM = arg('--from', '2026-06-22')
const TO = arg('--to', '2026-07-05')
const DATA_ROOT = resolve('data/truckflow')
const MOV_DIR = resolve('data/Movimientos')
const OUT_DIR = resolve('scripts/output/committee')

function* dayRange(a: string, b: string) {
  const s = new Date(`${a}T12:00:00`)
  const e = new Date(`${b}T12:00:00`)
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    yield `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

function loadRecords(file: string): unknown[] {
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
  if (Array.isArray(raw)) return raw
  return (raw?.records as unknown[]) ?? []
}

function toArrayBuffer(path: string): ArrayBuffer {
  const b = readFileSync(path)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}

const events: RealJourneyEventDto[] = []
const alerts: RealAlertDto[] = []
let eventFiles = 0
let alertFiles = 0
const days = [...dayRange(FROM, TO)]
for (const day of days) {
  const ev = loadRecords(join(DATA_ROOT, day, 'event-list.json'))
  const al = loadRecords(join(DATA_ROOT, day, 'alert-list.json'))
  if (ev.length) {
    eventFiles++
    for (const r of ev) if (r && (r as { journeyUid?: string }).journeyUid) events.push(r as RealJourneyEventDto)
  }
  if (al.length) {
    alertFiles++
    for (const r of al) alerts.push(r as RealAlertDto)
  }
}
console.info(`[committee-run] período ${FROM}..${TO} — ${days.length} días · eventos=${events.length} alertas=${alerts.length}`)

// Excel: Movimientos por Contrato + Tiempos entre pasos
const movFiles = readdirSync(MOV_DIR).filter((f) => f.startsWith('MovimientosPorContrato') && f.endsWith('.xlsx')).sort()
const tepFiles = readdirSync(MOV_DIR).filter((f) => f.startsWith('TiemposEntrePasos') && f.endsWith('.xlsx')).sort()
const movimientosContratoFiles = movFiles.map((f) => ({ sourceFile: f, arrayBuffer: toArrayBuffer(join(MOV_DIR, f)) }))
const tiemposEntrePasosFiles = tepFiles.map((f) => ({ sourceFile: f, arrayBuffer: toArrayBuffer(join(MOV_DIR, f)) }))
console.info(`[committee-run] Excel: ${movFiles.length} MovimientosPorContrato, ${tepFiles.length} TiemposEntrePasos`)

const inp: EtlTransformInput = {
  events,
  alerts,
  mergeWindowHours: 4,
  loadedEventFilesCount: eventFiles,
  loadedAlertFilesCount: alertFiles,
  movimientosContratoFiles,
  tiemposEntrePasosFiles,
}

const phaseStore = createTransformPhaseSession()
const out = await runEtlTransformAllTramos(inp, phaseStore)

mkdirSync(OUT_DIR, { recursive: true })
const replacer = (_k: string, v: unknown) => (v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v)

// CSVs de tramos 1-3
for (const [k, content] of Object.entries(out.csv)) {
  if (content && content.trim()) writeFileSync(join(OUT_DIR, `${k}.csv`), content, 'utf8')
}

// KPI Tiempos (tramos / segment timing)
let kpi = null
if (out.kpiTiemposPrepared) {
  kpi = await buildKpiTiemposArtifacts(out.kpiTiemposPrepared)
  for (const [k, content] of Object.entries(kpi.csv)) {
    if (content && content.trim()) writeFileSync(join(OUT_DIR, `${k}.csv`), content, 'utf8')
  }
  writeFileSync(join(OUT_DIR, '_kpi_logs.txt'), kpi.logs.join('\n'), 'utf8')
}

// COMPLETOS segment timing (per-tramo Calada/Balanza/Descarga) — sin override Excel-first
let segCompletos = null
if (out.kpiTiemposPrepared) {
  segCompletos = buildSegmentTimingIndex(out.kpiTiemposPrepared.classifiedJourneys, { committeeGroups: ['COMPLETOS'] })
  writeFileSync(join(OUT_DIR, 'segment_timing_kpi_COMPLETOS.csv'), segmentTimingKpiCsv(segCompletos), 'utf8')
  writeFileSync(join(OUT_DIR, 'segment_timing_legs_COMPLETOS.csv'), segmentTimingLegsCsv(segCompletos), 'utf8')
  writeFileSync(join(OUT_DIR, '_segment_timing_COMPLETOS.json'), JSON.stringify(segCompletos, replacer, 2), 'utf8')
  console.info('\n===== SEGMENT TIMING COMPLETOS =====')
  console.info('circuitCodes:', JSON.stringify(segCompletos.circuitCodes), '· journeys:', segCompletos.journeyCount, '· legs:', segCompletos.legs.length)
}

writeFileSync(join(OUT_DIR, '_stats.json'), JSON.stringify(out.stats, replacer, 2), 'utf8')
if (kpi) {
  writeFileSync(join(OUT_DIR, '_segment_timing.json'), JSON.stringify(kpi.segmentTiming, replacer, 2), 'utf8')
  writeFileSync(join(OUT_DIR, '_circuit_timing.json'), JSON.stringify(kpi.circuitTiming, replacer, 2), 'utf8')
}

console.info('\n===== EXECUTIVE =====')
console.info(JSON.stringify(out.stats.executive, null, 2))
console.info('\n===== MOVIMIENTOS CONTRATO =====')
console.info(JSON.stringify({ ...out.stats.movimientosContrato, products: out.stats.movimientosContrato?.products?.slice(0, 40) }, replacer, 2))
console.info('\n===== KPI TIEMPOS =====')
if (kpi) {
  console.info('segmentTiming circuitCodes:', JSON.stringify(kpi.segmentTiming.circuitCodes))
  console.info('segmentTiming journeyCount:', kpi.segmentTiming.journeyCount, '· legs:', kpi.segmentTiming.legs.length)
  console.info('circuitTiming codes:', JSON.stringify(Object.keys((kpi.circuitTiming as { byCircuit?: Record<string, unknown> }).byCircuit ?? {})))
  console.info('logs:\n' + kpi.logs.join('\n'))
} else {
  console.info('kpiTiemposPrepared ausente')
}
console.info('\nCSVs:', [...Object.keys(out.csv), ...(kpi ? Object.keys(kpi.csv) : [])].join(', '))
console.info(`[committee-run] salida en ${OUT_DIR}`)
