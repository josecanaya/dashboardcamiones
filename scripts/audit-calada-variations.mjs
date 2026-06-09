/**
 * Audita variaciones operativas de calado (ESPERA_EN_CALADA, POSIBLE_RECHAZO, RECALADO)
 * sobre eventos Truckflow cacheados o API.
 * Uso: npx tsx scripts/audit-calada-variations.mjs [start] [end]
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const startDate = process.argv[2] || '2026-05-29'
const endDate = process.argv[3] || '2026-06-02'
const API_BASE = process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'
const root = resolve(import.meta.dirname, '..')

const committeeUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/committeeClassification.ts')
).href
const pipelineUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts')
).href
const indexUrl = pathToFileURL(
  resolve(root, 'src/features/real-truckflow/etlWorkbench/etlCircuitClassificationIndex.ts')
).href

const {
  detectEsperaAntesCalada,
  detectEsperaDespuesCalada,
  detectPosibleRechazo,
  detectEsperaEnCaladaVariation,
  detectRecaladoFromJourney,
  CALADA_ESPERA_MINUTES,
} = await import(committeeUrl)
const { runEtlTransform } = await import(pipelineUrl)
const { buildCircuitClassificationIndex } = await import(indexUrl)

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

async function loadEvents() {
  const cachePath = resolve(root, 'data', 'truckflow', '_search_cache', `events_${startDate}_${endDate}.json`)
  if (existsSync(cachePath)) {
    console.log(`Cache: ${cachePath}`)
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  }
  const url = `${API_BASE}/journey-event/list?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  console.log(`Fetching: ${url}`)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const payload = await res.json()
  return (Array.isArray(payload) ? payload : payload.value ?? payload.events ?? []).filter((e) => e?.journeyUid)
}

const events = await loadEvents()
console.log(`Eventos: ${events.length} | Umbral calado: ${CALADA_ESPERA_MINUTES} min (${CALADA_ESPERA_MINUTES / 60} h)\n`)

const out = await runEtlTransform({
  events,
  alerts: [],
  mergeWindowHours: 4,
  loadedEventFilesCount: 1,
  loadedAlertFilesCount: 0,
})

const finalRows = parseCsv(out.csv.final_circuits || '')
const debugRows = parseCsv(out.csv.debug_matrix_classification || '')

function summarize(rows, label) {
  const vars = rows.filter((r) => r.committee_group === 'VARIACIONES_OPERATIVAS')
  const caladaTypes = new Set(['ESPERA_EN_CALADA', 'POSIBLE_RECHAZO', 'RECALADO'])
  const caladaVars = vars.filter((r) => caladaTypes.has(r.operational_variation_type))
  const byType = {}
  const byCircuit = {}
  for (const r of vars) {
    const t = r.operational_variation_type || '(vacío)'
    const c = r.executive_circuit_code || '?'
    byType[t] = (byType[t] || 0) + 1
    byCircuit[c] = (byCircuit[c] || 0) + 1
  }
  console.log(`=== ${label} ===`)
  console.log(`Total filas: ${rows.length}`)
  console.log(`Variaciones: ${vars.length}`)
  console.log(`Calado (ESPERA/POSIBLE/RECALADO): ${caladaVars.length}`)
  console.log('Por tipo:', byType)
  console.log('Por circuito:', byCircuit)
  if (caladaVars.length) {
    console.log('\nMuestra calado:')
    caladaVars.slice(0, 8).forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.truck_plate || r.normalized_plate} | ${r.executive_circuit_code} | ${r.operational_variation_type} | ${r.logical_sequence_front || ''}`
      )
    })
  }
  console.log('')
}

summarize(finalRows, 'final_circuits')
summarize(debugRows, 'debug_matrix_classification')

const idx = buildCircuitClassificationIndex(out.csv.debug_matrix_classification, out.csv.merged_truckflow_movimientos, out.csv.excel_operations_with_truckflow)
const idxVars = idx.entries.filter((e) => e.committeeGroup === 'VARIACIONES_OPERATIVAS')
const idxCalada = idxVars.filter((e) => ['ESPERA_EN_CALADA', 'POSIBLE_RECHAZO', 'RECALADO'].includes(e.operationalVariationType))
console.log('=== Índice UI (con Excel merge) ===')
console.log(`Entries: ${idx.entries.length} | Variaciones: ${idxVars.length} | Calado: ${idxCalada.length}`)
const idxByType = {}
for (const e of idxVars) {
  const t = e.operationalVariationType || '(vacío)'
  idxByType[t] = (idxByType[t] || 0) + 1
}
console.log('Por tipo UI:', idxByType)

// Heurística directa sobre journeys reconstruidos (si el pipeline los expone)
if (out.journeys?.length) {
  let rawAntes = 0
  let rawDespues = 0
  let rawRechazo = 0
  let rawRecalado = 0
  for (const j of out.journeys) {
    if (detectEsperaAntesCalada(j)) rawAntes++
    if (detectEsperaDespuesCalada(j)) rawDespues++
    if (detectPosibleRechazo(j, 0)) rawRechazo++
    if (detectRecaladoFromJourney(j)) rawRecalado++
  }
  console.log('\n=== Detección cruda en journeys (sin clasificación comité) ===')
  console.log({ rawAntes, rawDespues, rawPosibleRechazoSinSl: rawRechazo, rawRecalado, journeys: out.journeys.length })
}
