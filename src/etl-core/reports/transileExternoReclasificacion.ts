/**
 * Propuesta de enriquecimiento ejecutivo por transile externo (Excel es_de_vuelta).
 * No muta filas Excel: solo sugiere circuito R* para journeys Truckflow.
 */

import { makeTable, tableToCsv, type TypedTable } from '../typedTable'
import { normalizePlate } from '../ingest/externalNormalization'
import { parseTimestampMs } from '../domain/timestamps'
import type { TransileExternoOperation } from './transileExternoCiclo'

export type JourneyLiteForTransileMatch = {
  journey_uid: string
  plate: string
  start_at: string
  end_at: string
  executive_status: string
  executive_circuit_code: string
}

export type TransileExternoReclasificacionRow = {
  journey_uid: string
  patente: string
  estado_original: string
  circuito_original: string
  circuito_propuesto: string
  producto_excel: string
  product_family: string
  external_operation_id: string
  evidencia: string
}

const MATCH_PAD_MS = 3 * 3600_000

function plateKey(v: string): string {
  return normalizePlate(v) ?? ''
}

function overlap(
  journeyStart: number,
  journeyEnd: number,
  opStart: number,
  opEnd: number
): boolean {
  if (![journeyStart, journeyEnd, opStart, opEnd].every(Number.isFinite)) return false
  const js = Math.min(journeyStart, journeyEnd)
  const je = Math.max(journeyStart, journeyEnd)
  const os = Math.min(opStart, opEnd) - MATCH_PAD_MS
  const oe = Math.max(opStart, opEnd) + MATCH_PAD_MS
  return js <= oe && je >= os
}

/**
 * Cruza operaciones Excel (es_de_vuelta) con journeys Truckflow por patente + ventana.
 * Emite propuesta cuando hay circuito asignado/candidato y el journey es ANOMALO/NO_EVALUABLE
 * o el circuito ejecutivo difiere.
 */
export function buildTransileExternoReclasificacion(
  operations: TransileExternoOperation[],
  journeys: JourneyLiteForTransileMatch[]
): TransileExternoReclasificacionRow[] {
  const byPlate = new Map<string, JourneyLiteForTransileMatch[]>()
  for (const j of journeys) {
    const p = plateKey(j.plate)
    if (!p) continue
    const arr = byPlate.get(p) ?? []
    arr.push(j)
    byPlate.set(p, arr)
  }

  const out: TransileExternoReclasificacionRow[] = []
  for (const op of operations) {
    const proposed =
      String(op.circuit_assigned ?? '').trim() ||
      String(op.circuit_candidates ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)[0] ||
      ''
    if (!proposed) continue

    const plate = plateKey(op.patente)
    const candidates = byPlate.get(plate) ?? []
    const opStart = parseTimestampMs(op.external_ingreso_at) || parseTimestampMs(op.fecha)
    const opEnd = parseTimestampMs(op.external_salida_at) || opStart

    for (const j of candidates) {
      const js = parseTimestampMs(j.start_at)
      const je = parseTimestampMs(j.end_at) || js
      if (!overlap(js, je, opStart, opEnd)) continue

      const status = String(j.executive_status ?? '').toUpperCase()
      const original = String(j.executive_circuit_code ?? '').trim().toUpperCase()
      const needs =
        status === 'ANOMALO' ||
        status === 'NO_EVALUABLE' ||
        status === 'NO_DIFERENCIABLE' ||
        (original && original !== proposed)

      if (!needs && original === proposed) continue

      out.push({
        journey_uid: j.journey_uid,
        patente: plate,
        estado_original: status || '—',
        circuito_original: original || '—',
        circuito_propuesto: proposed,
        producto_excel: op.producto,
        product_family: op.product_family,
        external_operation_id: op.external_operation_id,
        evidencia: `es_de_vuelta+producto; op=${op.external_ingreso_at || op.fecha}`,
      })
    }
  }

  // Preferir una propuesta por journey (mejor: ya tiene assigned vs candidato).
  const best = new Map<string, TransileExternoReclasificacionRow>()
  for (const row of out) {
    const prev = best.get(row.journey_uid)
    if (!prev) {
      best.set(row.journey_uid, row)
      continue
    }
    const prevAssigned = prev.circuito_propuesto && !prev.circuito_propuesto.includes('|')
    const nextAssigned = row.circuito_propuesto && !row.circuito_propuesto.includes('|')
    if (nextAssigned && !prevAssigned) best.set(row.journey_uid, row)
  }
  return [...best.values()]
}

export const TRANSILE_EXTERNO_RECLASIFICACION_HEADERS = [
  'journey_uid',
  'patente',
  'estado_original',
  'circuito_original',
  'circuito_propuesto',
  'producto_excel',
  'product_family',
  'external_operation_id',
  'evidencia',
] as const

export function transileExternoReclasificacionTable(
  rows: TransileExternoReclasificacionRow[]
): TypedTable {
  return makeTable(
    'transile_externo_reclasificacion',
    TRANSILE_EXTERNO_RECLASIFICACION_HEADERS,
    rows as unknown as Record<string, unknown>[]
  )
}

export function transileExternoReclasificacionCsv(rows: TransileExternoReclasificacionRow[]): string {
  return tableToCsv(transileExternoReclasificacionTable(rows))
}

/** Aplica propuestas a entries de clasificación (mutación controlada del ejecutivo). */
export function applyTransileExternoCircuitOverrides<
  T extends {
    journeyId: string
    executiveCircuitCode: string
    executiveCircuitLabel: string
    executiveCircuitDisplay: string
    executiveStatus: string
    committeeReason: string
  },
>(entries: T[], proposals: TransileExternoReclasificacionRow[], labelByCode: (code: string) => string): T[] {
  if (!proposals.length) return entries
  const byUid = new Map(proposals.map((p) => [p.journey_uid, p]))
  return entries.map((e) => {
    const p = byUid.get(e.journeyId)
    if (!p?.circuito_propuesto) return e
    const code = p.circuito_propuesto
    const label = labelByCode(code)
    return {
      ...e,
      executiveCircuitCode: code,
      executiveCircuitLabel: label,
      executiveCircuitDisplay: label ? `${code} · ${label}` : code,
      executiveStatus: e.executiveStatus === 'ANOMALO' || e.executiveStatus === 'NO_EVALUABLE' ? 'VALIDO' : e.executiveStatus,
      committeeReason: `EXCEL_TRANSILE_EXTERNO:${p.product_family || p.producto_excel}@${p.external_operation_id}`,
    }
  })
}
