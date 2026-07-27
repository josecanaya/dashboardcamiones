import type { EtlTransformOutput } from './etlTransformContracts'
import { parseCsvToRecords } from './etlCsvParse'
import type { PlantVisitUpsertInput, PlantVisitProductOrigin, PlantVisitSource } from '../../../domain/truckFleet'
import { normalizePlate } from './etlExternalNormalization'
import { isValidArgentinaPlate } from '../../../services/argentinaPlate'

function plateOkForFleet(plate: string): boolean {
  return isValidArgentinaPlate(plate)
}

function dayKeyFromIso(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapPlanta(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'ricardone'
  if (s.includes('san') && s.includes('lorenzo')) return 'san_lorenzo'
  if (s.includes('avellaneda')) return 'avellaneda'
  if (s.includes('ricardone')) return 'ricardone'
  if (s.includes('terminal') || s.includes('embarque')) return 'terminal_embarque'
  return s.replace(/\s+/g, '_')
}

function productOriginFromMerge(mergeStatus: string, product: string): PlantVisitProductOrigin | null {
  if (!product) return null
  const st = mergeStatus.trim()
  if (!st || st === 'NO_EXTERNAL_MATCH' || st === 'NO_TRUCKFLOW_MATCH') return 'desconocido'
  return 'contrato'
}

function fuenteFromMerge(mergeStatus: string): PlantVisitSource {
  const st = mergeStatus.trim()
  if (st === 'NO_EXTERNAL_MATCH') return 'truckflow'
  if (st === 'NO_TRUCKFLOW_MATCH') return 'contrato'
  if (!st || st === 'INSUFFICIENT_DATA') return 'truckflow'
  return 'mixto'
}

function visitFromMergedRow(r: Record<string, string>): PlantVisitUpsertInput | null {
  const plate = normalizePlate(r.plate_normalized ?? r.normalized_plate ?? r.truck_plate) ?? ''
  const journeyUid = String(r.journey_uid ?? '').trim()
  const ingresoAt = String(r.start_time ?? r.external_ingreso_at ?? '').trim()
  const egresoAt = String(r.end_time ?? r.external_salida_at ?? '').trim() || null
  if (!plate || !ingresoAt || !plateOkForFleet(plate)) return null

  const producto = String(r.product_normalized ?? r.resolved_product ?? '').trim() || null
  const mergeStatus = String(r.merge_status ?? '')

  return {
    plateNormalized: plate,
    plateDisplay: String(r.plate_original ?? r.truck_plate ?? plate),
    planta: mapPlanta(r.planta_normalized ?? r.plant_scope ?? r.analysis_scope ?? ''),
    ingresoAt,
    egresoAt,
    fechaOperativa: dayKeyFromIso(egresoAt || ingresoAt),
    producto,
    productoOrigen: productOriginFromMerge(mergeStatus, producto ?? ''),
    journeyUid: journeyUid || null,
    fuente: fuenteFromMerge(mergeStatus),
  }
}

function visitFromCleanRow(
  r: Record<string, string>,
  timesByJourney: Map<string, { start: string; end: string }>
): PlantVisitUpsertInput | null {
  const plate = normalizePlate(r.plate_normalized ?? r.normalized_plate) ?? ''
  const journeyUid = String(r.journey_uid ?? '').trim()
  const times = journeyUid ? timesByJourney.get(journeyUid) : undefined
  const ingresoAt = String(r.start_time ?? times?.start ?? '').trim()
  const egresoAt = String(r.end_time ?? times?.end ?? '').trim() || null
  if (!plate || !ingresoAt || !plateOkForFleet(plate)) return null

  const producto = String(r.product_normalized ?? '').trim() || null
  return {
    plateNormalized: plate,
    planta: mapPlanta(r.planta_normalized ?? ''),
    ingresoAt,
    egresoAt,
    fechaOperativa: dayKeyFromIso(egresoAt || ingresoAt),
    producto,
    productoOrigen: producto ? 'contrato' : null,
    journeyUid: journeyUid || null,
    fuente: producto ? 'mixto' : 'truckflow',
  }
}

function buildTimesByJourney(debugCsv: string): Map<string, { start: string; end: string }> {
  const m = new Map<string, { start: string; end: string }>()
  if (!debugCsv.trim()) return m
  const { rows } = parseCsvToRecords(debugCsv)
  for (const r of rows) {
    const uid = String(r.journey_id ?? r.journey_uid ?? '').trim()
    const start = String(r.first_event_at ?? '').trim()
    const end = String(r.last_event_at ?? '').trim()
    if (uid && start) m.set(uid, { start, end: end || start })
  }
  return m
}

export type FleetDatabaseSaveResult = {
  ok: boolean
  visitCount: number
  inserted: number
  updated: number
  skipped: number
  storage: string
  message: string
}

/** Deriva visitas livianas a planta desde la salida del Transform (merge, clean o circuitos). */
export function buildPlantVisitUpsertsFromTransform(out: EtlTransformOutput): PlantVisitUpsertInput[] {
  const csv = out.csv
  const merged = csv.merged_truckflow_movimientos?.trim()
  if (merged) {
    const { rows } = parseCsvToRecords(merged)
    const visits: PlantVisitUpsertInput[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const v = visitFromMergedRow(r)
      if (!v) continue
      const key = v.journeyUid ?? `${v.plateNormalized}|${v.ingresoAt}`
      if (seen.has(key)) continue
      seen.add(key)
      visits.push(v)
    }
    return visits
  }

  const clean = csv.clean_journeys_for_analysis?.trim()
  if (clean) {
    const times = buildTimesByJourney(csv.debug_matrix_classification ?? '')
    const { rows } = parseCsvToRecords(clean)
    return rows.map((r) => visitFromCleanRow(r, times)).filter((v): v is PlantVisitUpsertInput => v != null)
  }

  const finalCircuits = csv.final_circuits?.trim()
  const times = buildTimesByJourney(csv.debug_matrix_classification ?? '')
  if (!finalCircuits) return []

  const { rows } = parseCsvToRecords(finalCircuits)
  const visits: PlantVisitUpsertInput[] = []
  for (const r of rows) {
    if (String(r.final_status ?? '') === 'descartado') continue
    const plate = normalizePlate(r.normalized_plate ?? r.truck_plate) ?? ''
    const journeyUid = String(r.journey_uid ?? '').trim()
    const t = journeyUid ? times.get(journeyUid) : undefined
    if (!plate || !t?.start || !plateOkForFleet(plate)) continue
    visits.push({
      plateNormalized: plate,
      plateDisplay: String(r.truck_plate ?? plate),
      planta: mapPlanta(r.analysis_scope ?? r.strong_point_source ?? ''),
      ingresoAt: t.start,
      egresoAt: t.end,
      fechaOperativa: dayKeyFromIso(t.end || t.start),
      producto: null,
      productoOrigen: null,
      journeyUid: journeyUid || null,
      fuente: 'truckflow',
    })
  }
  return visits
}

export async function persistPlantVisitsFromTransform(
  out: EtlTransformOutput
): Promise<FleetDatabaseSaveResult> {
  const visitas = buildPlantVisitUpsertsFromTransform(out)
  if (!visitas.length) {
    return {
      ok: false,
      visitCount: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      storage: '',
      message:
        'No hay visitas para guardar. Revisá que el transform haya producido merge, clean_journeys o final_circuits con patentes.',
    }
  }
  const { syncPlantVisits } = await import('../api/truckFleetApi')
  const res = await syncPlantVisits(visitas)
  const storage = res.storage || 'desconocido'
  const batchNote = res.batches > 1 ? ` (${res.batches} lotes)` : ''
  return {
    ok: true,
    visitCount: visitas.length,
    inserted: res.inserted,
    updated: res.updated,
    skipped: res.skipped,
    storage,
    message: `Guardado en ${storage}${batchNote}: ${res.inserted} nuevas, ${res.updated} actualizadas, ${res.skipped} omitidas (${visitas.length} filas del transform).`,
  }
}
