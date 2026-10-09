import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { resolveRunDir } from '../etl-runs-layout.mjs'
import { tsImport } from 'tsx/esm/api'
let domainPromise
const domain = () => domainPromise ??= Promise.all([
  tsImport('../../src/features/real-truckflow/etlWorkbench/etlOperationalDay.ts', import.meta.url),
  tsImport('../../src/features/real-truckflow/etlWorkbench/etlSegmentTiming.ts', import.meta.url),
  tsImport('../../src/features/real-truckflow/etlWorkbench/etlComposeRuns.ts', import.meta.url),
  tsImport('../../src/features/real-truckflow/etlWorkbench/etlSegmentScatterByDay.ts', import.meta.url),
  tsImport('../../src/etl-core/csv.ts', import.meta.url),
])

export const METRICS = [
  { id: 'plant.trucks_present', label: 'Camiones presentes', mode: 'live', unit: 'camiones', source: 'plant-state', population: 'Estimación de presencia actual del motor de planta' },
  { id: 'identification.pending_cases', label: 'Patentes por confirmar', mode: 'live', unit: 'casos', source: 'plate-identification', population: 'Casos pendientes y provisorios devueltos por identificación' },
  { id: 'segment.duration_median', label: 'Mediana del tramo', mode: 'historical', unit: 'min', source: 'segment_timing_legs', population: 'Observaciones elegibles del tramo, día operativo desde las 22 h, según las reglas del KPI de tiempos' },
  { id: 'segment.duration_p90', label: 'P90 del tramo', mode: 'historical', unit: 'min', source: 'segment_timing_legs', population: 'Observaciones elegibles del tramo, día operativo desde las 22 h, según las reglas del KPI de tiempos' },
  { id: 'circuit.duration_median', label: 'Mediana de duración', mode: 'historical', unit: 'min', source: 'E_kpi_operacion', population: 'Operaciones con duración válida y fecha de inicio dentro del período' },
  { id: 'circuit.duration_p90', label: 'P90 de duración', mode: 'historical', unit: 'min', source: 'E_kpi_operacion', population: 'Operaciones con duración válida y fecha de inicio dentro del período' },
]
export function quantile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const at = (sorted.length - 1) * p, low = Math.floor(at)
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low)
}
function fail(message, status = 400) { const error = new Error(message); error.httpStatus = status; throw error }
export function calculateDuration(rows, scope, metricId) {
  const seen = new Map()
  const column = scope.site === 'ricardone' ? 'ric_min' : scope.site === 'san_lorenzo' ? 'sl_min' : 'total_min'
  let rejected = 0
  for (const row of rows) {
    const day = row.operational_day ?? String(row.inicio_at ?? '').slice(0, 10)
    if (!day || day < scope.from || day > scope.to) continue
    if (scope.circuit && !(scope.circuitCodes ?? [scope.circuit]).includes(row.circuito_code)) continue
    if (scope.franja && row.franja !== scope.franja) continue
    if (scope.product && row.product_normalized !== scope.product) continue
    if (scope.plate && row.plate_normalized !== scope.plate.toUpperCase()) continue
    const raw = row[column]
    if (raw === '' || raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 0) { rejected++; continue }
    const key = `${row.journey_key}|${row.external_operation_id}|${row.circuito_code}`
    const value = Number(raw)
    if (seen.has(key) && seen.get(key) !== value) fail('Operación duplicada con duraciones contradictorias', 409)
    seen.set(key, value)
  }
  return { value: quantile([...seen.values()], metricId.endsWith('_p90') ? .9 : .5), n: seen.size, rejected, durationColumn: column }
}
export function createMetricService({ runsRoot, getSnapshot, getIdentifications, getFreshness }) {
  async function getMetric(scope) {
    // El texto de la consulta y las etiquetas de UI no cambian la identidad del KPI.
    scope = Object.fromEntries(Object.entries(scope ?? {}).filter(([key,value]) => ['metricId','mode','site','from','to','runIds','circuit','product','plate','sector','zone','fromPoint','toPoint','franja','revisions'].includes(key) && value != null && value !== ''))
    const definition = METRICS.find(m => m.id === scope.metricId)
    if (!definition) fail('Métrica desconocida')
    if (!['ricardone', 'san_lorenzo', 'both'].includes(scope.site)) fail('Planta inválida')
    if (scope.mode !== definition.mode) fail('El modo no corresponde a la métrica')
    let result, provenance
    if (definition.mode === 'live') {
      const sites = scope.site === 'both' ? ['ricardone', 'san_lorenzo'] : [scope.site]
      const snapshots = await Promise.all(sites.map(getSnapshot))
      const identifications = definition.id === 'identification.pending_cases' ? await Promise.all(sites.map(getIdentifications)) : null
      const counts = identifications ? identifications.map(doc => doc.items.filter(it => ['pendiente', 'provisorio'].includes(it.level) && (!scope.sector || it.sectorCode === scope.sector)).length) : snapshots.map(s => {
        if (scope.sector) return s.sectors?.find(r => r.sectorCode === scope.sector)?.present
        if (scope.zone) return s.zones?.find(r => r.id === scope.zone || r.zoneId === scope.zone)?.backlog
        return s.plant?.trucksInPlant
      })
      result = { value: counts.every(v => Number.isFinite(v)) ? counts.reduce((a,b) => a+b, 0) : null, n: null }
      provenance = { snapshots, identifications, runIds: [], rulesVersion: [], coverage: 'live', at: snapshots.map(s => s.at ?? null) }
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scope.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(scope.to ?? '') || scope.from > scope.to) fail('Período inválido')
      const start = Date.parse(scope.from + 'T12:00:00Z'), end = Date.parse(scope.to + 'T12:00:00Z')
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 366 * 86400000 || new Date(start).toISOString().slice(0,10) !== scope.from || new Date(end).toISOString().slice(0,10) !== scope.to) fail('Período inválido o mayor a un año')
      if (!Array.isArray(scope.runIds) || !scope.runIds.length || scope.runIds.length > 53) fail('Seleccioná corridas para el período')
      const runs = [], rows = [], timingJourneys = [], excelOperations = [], scatterRows = []
      for (const id of [...new Set(scope.runIds)]) {
        if (!/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(id)) fail('Se requieren ventanas semanales guardadas')
        if (getFreshness?.(id,id.slice(0,10),id.slice(11)).stale) fail(`Corrida desactualizada: ${id}. Recalculá la semana antes de analizar el KPI.`, 409)
        const dir = resolveRunDir(runsRoot, id)
        if (!dir) fail(`Corrida no encontrada: ${id}`, 404)
        let tableText, manifestText
        try { tableText = readFileSync(path.join(dir, 'tables', definition.source + '.json'), 'utf8'); manifestText = readFileSync(path.join(dir, 'manifest.json'), 'utf8') } catch { fail(`Corrida incompleta: ${id}`, 404) }
        const manifest = JSON.parse(manifestText), table = JSON.parse(tableText)
        if (manifest.status !== 'ok') fail(`Corrida sin finalizar: ${id}`, 409)
        if (!Array.isArray(table.rows)) fail(`Tabla incompatible: ${id}`, 409)
        const revision = createHash('sha256').update(manifestText).update(tableText).digest('hex')
        const stats = JSON.parse(readFileSync(path.join(dir, 'stats.json'), 'utf8'))
        const summaryRevision = createHash('sha256').update(JSON.stringify({ manifest, stats })).digest('hex')
        if (scope.revisions?.[id] && ![revision,summaryRevision].includes(scope.revisions[id])) fail('La corrida cambió: actualizá el KPI antes de analizar', 409)
        runs.push({ runId: id, revision, rulesVersion: manifest.rulesVersion, createdAt: manifest.finishedAt ?? manifest.createdAt, inputHash:manifest.input?.inputHash, sourceFingerprint:manifest.sourceFingerprint, corrections:manifest.input?.liveCorrections ?? null, from: id.slice(0,10), to: id.slice(11) })
        rows.push(...table.rows)
        if (definition.id.startsWith('segment.')) {
          for (const [name, target] of [['circuit_timing_journeys', timingJourneys], ['excel_operations_with_truckflow', excelOperations], ['segment_scatter_by_day', scatterRows]]) {
            try { target.push(...JSON.parse(readFileSync(path.join(dir, 'tables', name + '.json'), 'utf8')).rows) } catch { fail(`Falta fuente de fechas/filtros: ${name} en ${id}`, 409) }
          }
        }
      }
      if (new Set(runs.map(r => r.rulesVersion)).size > 1) fail('No se pueden combinar versiones de reglas distintas', 409)
      const [days, timing, compose, scatter, csv] = await domain()
      const circuitCodes = scope.circuit ? timing.kpiCircuitCodesForScatterFilter(scope.circuit) : []
      if (definition.id.startsWith('segment.')) {
        if (scope.site !== 'both') fail('Para tramos seleccioná ambas plantas y el punto exacto del circuito; la métrica no acepta un filtro de planta aislado')
        if (!scope.circuit || !scope.fromPoint || !scope.toPoint) fail('Seleccioná un circuito y un tramo')
        if (scope.product) fail('Seleccioná el circuito correspondiente al producto; el KPI de tramos usa circuitos')
        const toCsv = rows => csv.recordsToCsv(rows.length ? Object.keys(rows[0]) : [], rows)
        const dayMap = days.buildJourneyOperationalDayMap({ circuitTimingJourneysCsv: toCsv(timingJourneys), excelOperationsCsv: toCsv(excelOperations) })
        const seen = new Map()
        for (const leg of compose.persistedLegRowsToSegmentLegs(rows)) {
          const key = `${leg.journeyId}|${leg.executiveCircuitCode}|${leg.fromCode}|${leg.toCode}`
          if (seen.has(key) && seen.get(key).durationMinutes !== leg.durationMinutes) fail('Tramo duplicado con valores contradictorios', 409)
          seen.set(key, leg)
        }
        let unmapped = 0
        const eligible = [...seen.values()].filter(leg => {
          if (!circuitCodes.includes(leg.executiveCircuitCode) || (scope.plate && leg.plate !== scope.plate)) return false
          const day = dayMap.get(leg.journeyId)
          if (!day) { unmapped++; return false }
          if (day < scope.from || day > scope.to) return false
          if (scope.franja && !scatterRows.some(r => r.journey_id === leg.journeyId && r.segment_from === leg.fromCode && r.segment_to === leg.toCode && r.franja_horaria === scope.franja)) return false
          return true
        })
        let index = timing.rebuildSegmentTimingIndexFromLegs(eligible)
        if (scope.circuit === timing.VOLCABLE_RECEIPT_KPI_UNION_CODE) index = timing.mergeVolcableReceiptSegmentTiming(index)
        const aggregate = index.aggregates.find(a => a.circuitCode === scope.circuit && a.fromCode === scope.fromPoint && a.toCode === scope.toPoint)
        result = { value: aggregate?.stats.count ? (definition.id.endsWith('_p90') ? aggregate.stats.p90 : aggregate.stats.median) : null, n: aggregate?.stats.count ?? 0, rejected: aggregate?.demorados?.length ?? 0, unmapped }
      } else {
        if (rows.length && !rows.some(row => Object.hasOwn(row,'total_min') && Object.hasOwn(row,'inicio_at'))) fail('Esquema de duración incompatible', 409)
        result = calculateDuration(rows.map(row => ({ ...row, operational_day: days.operationalDayOfIso(row.inicio_at), franja: scatter.resolveFranjaHoraria(row.inicio_at) })), { ...scope, circuitCodes }, definition.id)
      }
      const missingDays = []
      for (let day = scope.from; day <= scope.to;) {
        if (!runs.some(r => day >= r.from && day <= r.to)) missingDays.push(day)
        day = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0,10)
      }
      provenance = { runs, runIds: runs.map(r => r.runId), rulesVersion: [...new Set(runs.map(r => r.rulesVersion))], coverage: missingDays.length ? 'partial' : 'complete', missingDays }
    }
    const payload = { definition, scope, ...result, ...provenance, metricVersion: '1', schemaVersion: '1', generatedAt: new Date().toISOString() }
    payload.evidenceId = createHash('sha256').update(JSON.stringify({ definition, scope, result, provenance })).digest('hex')
    if (runsRoot && definition.mode === 'historical') {
      const directory = path.join(runsRoot, '_evidence')
      mkdirSync(directory, { recursive:true })
      const file = path.join(directory, payload.evidenceId + '.json')
      if (!existsSync(file)) writeFileSync(file, JSON.stringify(payload, null, 2), { flag:'wx' })
    }
    return payload
  }
  function getEvidence(id) {
    if (!/^[0-9a-f]{64}$/.test(id ?? '')) fail('Identificador de evidencia inválido')
    try { return JSON.parse(readFileSync(path.join(runsRoot, '_evidence', id + '.json'), 'utf8')) }
    catch { fail('Evidencia no encontrada', 404) }
  }
  async function compareMetric({ current, reference }) {
    if (current?.metricId !== reference?.metricId || current?.site !== reference?.site || current?.mode !== 'historical' || reference?.mode !== 'historical') fail('La comparación requiere la misma métrica y planta en dos períodos históricos')
    const [a,b] = await Promise.all([getMetric(current),getMetric(reference)])
    return { current:a, reference:b, delta:a.value == null || b.value == null ? null : a.value - b.value, deltaPercent:a.value == null || !b.value ? null : (a.value-b.value)/b.value*100, unit:a.definition.unit }
  }
  return { getMetric, getEvidence, compareMetric }
}
