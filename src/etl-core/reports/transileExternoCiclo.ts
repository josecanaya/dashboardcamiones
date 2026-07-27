/**
 * Transile externo Ricardone ↔ San Lorenzo: detección Excel-driven.
 *
 * Regla de negocio (Movimientos por Contrato):
 *  - Un movimiento marca transile externo si la columna `es de vuelta` = SI.
 *  - El camión recorre: ingreso → preingreso → calada liq → balanza ingreso/egreso →
 *    ingreso SLZ → balanza ingreso/egreso SLZ → egreso SLZ y VUELVE a Ricardone a hacer otro ciclo.
 *  - El circuito logístico depende del producto trasladado:
 *      PELLET (de cualquier tipo) → R30 / R31 / R32
 *      SOJA                       → R26
 *      GIRASOL                    → R27 / R28
 *    (dentro de PELLET y GIRASOL el sub-código exacto corresponde a un circuito
 *     logístico ya mapeado; hasta desambiguar se emite el set de candidatos.)
 *
 * Espeja el patrón de `transileInternoVolcable.ts` (rows + sessions + summary + CSV).
 */

import { makeTable, tableToCsv, type TypedTable } from '../typedTable'
import type { ExternalMovimientoContratoNormalized } from '../domain/contractMovements.types'
import { normalizePlate } from '../ingest/externalNormalization'
import { operationalDayKeyFromIso, parseTimestampMs } from '../domain/timestamps'

/** Pasos lógicos del recorrido de transile externo (documental, para trazabilidad). */
export const TRANSILE_EXTERNO_ROUTE_STEPS = [
  'INGRESO',
  'PREINGRESO',
  'CALADA_LIQ',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'INGRESO_SLZ',
  'BALANZA_INGRESO_SLZ',
  'BALANZA_EGRESO_SLZ',
  'EGRESO_SLZ',
] as const

export type TransileExternoProductFamily = 'PELLET' | 'SOJA' | 'GIRASOL' | ''

/** Familia de producto → códigos de circuito logístico externo candidatos. */
export const TRANSILE_EXTERNO_CIRCUIT_FAMILIES: Record<
  Exclude<TransileExternoProductFamily, ''>,
  string[]
> = {
  PELLET: ['R30', 'R31', 'R32'],
  SOJA: ['R26'],
  GIRASOL: ['R27', 'R28'],
}

export type TransileExternoProductClassification = {
  family: TransileExternoProductFamily
  candidates: string[]
  /** Código asignado cuando la familia es unívoca (SOJA → R26); '' si hay varios candidatos. */
  assigned: string
}

/**
 * Clasifica el producto Excel en familia de circuito externo.
 * PELLET tiene prioridad (ej. "PELLET DE SOJA" es PELLET, no SOJA).
 * Subcódigo pellet: Celda 09→R30, 10→R31, 11→R32 (sin cámara Truckflow).
 */
export function classifyTransileExternoProduct(
  product: string,
  platformHint = ''
): TransileExternoProductClassification {
  const p = String(product ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[^A-Z0-9\s]/g, ' ')
  const has = (needle: string) => p.includes(needle)

  let family: TransileExternoProductFamily = ''
  if (has('PELLET') || has('PELLETS') || has('EXPELLER') || has('EXPELER')) family = 'PELLET'
  else if (has('SOJA') || has('SOYA')) family = 'SOJA'
  else if (has('GIRASOL')) family = 'GIRASOL'

  if (!family) return { family: '', candidates: [], assigned: '' }
  const candidates = [...TRANSILE_EXTERNO_CIRCUIT_FAMILIES[family]]
  let assigned = candidates.length === 1 ? candidates[0]! : ''

  if (family === 'PELLET') {
    const pelletCode = resolvePelletCircuitFromPlatform(platformHint)
    if (pelletCode) assigned = pelletCode
  }

  return { family, candidates, assigned }
}

/** Celda 09/10/11 (Excel) → R30/R31/R32. Sin evidencia cámara TF en esas tolvas. */
export function resolvePelletCircuitFromPlatform(platform: string): string {
  const raw = String(platform ?? '')
  const u = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/CELDA\s*0*9\b|TOLVA.*\b0*9\b|C0*9\b/.test(u)) return 'R30'
  if (/CELDA\s*10\b|TOLVA.*\b10\b|C10\b/.test(u)) return 'R31'
  if (/CELDA\s*11\b|TOLVA.*\b11\b|C11\b/.test(u)) return 'R32'
  return ''
}

export type TransileExternoOperation = {
  external_operation_id: string
  patente: string
  fecha: string
  producto: string
  product_family: TransileExternoProductFamily
  circuit_candidates: string
  circuit_assigned: string
  es_de_vuelta: boolean
  external_ingreso_at: string
  external_salida_at: string
  planta: string
  plataforma: string
  cycle_index: number
  source_file: string
}

export type TransileExternoSession = {
  patente: string
  return_operations: number
  productos: string
  familias: string
  circuitos: string
  first_at: string
  last_at: string
}

export type TransileExternoSummary = {
  total_movimientos: number
  movimientos_de_vuelta: number
  patentes_con_vuelta: number
  operaciones_pellet: number
  operaciones_soja: number
  operaciones_girasol: number
  operaciones_sin_familia: number
  /** Diagnóstico: header del Excel mapeado a "es de vuelta", o '' si no se detectó. */
  columna_detectada: string
  /** Diagnóstico: muestra de headers vistos (para ubicar el nombre real de la columna). */
  headers_muestra: string
}

/** Detecta el header del Excel que corresponde a "es de vuelta" (tolerante a variantes). */
export function detectDeVueltaHeader(headers: string[] | undefined): string {
  if (!headers?.length) return ''
  return (
    headers.find((h) => {
      const k = String(h ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9]/g, '')
      if (k.includes('codigo') || k.startsWith('cod')) return false
      return k.includes('vuelta') || k.includes('retorno')
    }) ?? ''
  )
}

export type TransileExternoReport = {
  operations: TransileExternoOperation[]
  sessions: TransileExternoSession[]
  summary: TransileExternoSummary
}

function opInstantMs(mov: ExternalMovimientoContratoNormalized): number {
  const ing = parseTimestampMs(mov.external_ingreso_at)
  if (Number.isFinite(ing)) return ing
  const sal = parseTimestampMs(mov.external_salida_at)
  if (Number.isFinite(sal)) return sal
  const cal = parseTimestampMs(mov.external_calado_at)
  return Number.isFinite(cal) ? cal : Number.NaN
}

function fechaFor(mov: ExternalMovimientoContratoNormalized): string {
  return (
    operationalDayKeyFromIso(mov.external_ingreso_at) ||
    operationalDayKeyFromIso(mov.external_salida_at) ||
    mov.source_date ||
    ''
  )
}

/** Construye el reporte de transile externo desde los movimientos por contrato normalizados. */
export function buildTransileExternoReport(input: {
  movimientos: ExternalMovimientoContratoNormalized[]
  /** Headers crudos del Excel (diagnóstico: detectar el nombre real de la columna). */
  detectedHeaders?: string[]
}): TransileExternoReport {
  const deVuelta = input.movimientos.filter((m) => m.es_de_vuelta)

  const byPlate = new Map<string, ExternalMovimientoContratoNormalized[]>()
  for (const m of deVuelta) {
    const plate = normalizePlate(m.plate_normalized || m.patente_original) ?? ''
    if (!plate) continue
    const arr = byPlate.get(plate) ?? []
    arr.push(m)
    byPlate.set(plate, arr)
  }

  const operations: TransileExternoOperation[] = []
  const sessions: TransileExternoSession[] = []
  const summary: TransileExternoSummary = {
    total_movimientos: input.movimientos.length,
    movimientos_de_vuelta: deVuelta.length,
    patentes_con_vuelta: byPlate.size,
    operaciones_pellet: 0,
    operaciones_soja: 0,
    operaciones_girasol: 0,
    operaciones_sin_familia: 0,
    columna_detectada: detectDeVueltaHeader(input.detectedHeaders),
    headers_muestra: (input.detectedHeaders ?? []).join(' | '),
  }

  for (const [plate, movs] of byPlate) {
    movs.sort((a, b) => {
      const da = opInstantMs(a)
      const db = opInstantMs(b)
      if (Number.isFinite(da) && Number.isFinite(db)) return da - db
      return String(a.external_ingreso_at).localeCompare(String(b.external_ingreso_at))
    })

    const productos = new Set<string>()
    const familias = new Set<string>()
    const circuitos = new Set<string>()

    movs.forEach((m, idx) => {
      const cls = classifyTransileExternoProduct(
        m.product_normalized || m.producto_original,
        m.platform_normalized || m.plataforma_original
      )
      if (cls.family === 'PELLET') summary.operaciones_pellet++
      else if (cls.family === 'SOJA') summary.operaciones_soja++
      else if (cls.family === 'GIRASOL') summary.operaciones_girasol++
      else summary.operaciones_sin_familia++

      if (m.product_normalized) productos.add(m.product_normalized)
      if (cls.family) familias.add(cls.family)
      for (const c of cls.candidates) circuitos.add(c)

      operations.push({
        external_operation_id: m.external_operation_id,
        patente: plate,
        fecha: fechaFor(m),
        producto: m.product_normalized || m.producto_original || '',
        product_family: cls.family,
        circuit_candidates: cls.candidates.join('|'),
        circuit_assigned: cls.assigned,
        es_de_vuelta: true,
        external_ingreso_at: m.external_ingreso_at,
        external_salida_at: m.external_salida_at,
        planta: m.planta_normalized,
        plataforma: m.platform_normalized,
        cycle_index: idx + 1,
        source_file: m.source_file,
      })
    })

    sessions.push({
      patente: plate,
      return_operations: movs.length,
      productos: [...productos].sort().join('|'),
      familias: [...familias].sort().join('|'),
      circuitos: [...circuitos].sort().join('|'),
      first_at: movs[0]!.external_ingreso_at || movs[0]!.external_salida_at || '',
      last_at:
        movs[movs.length - 1]!.external_salida_at ||
        movs[movs.length - 1]!.external_ingreso_at ||
        '',
    })
  }

  operations.sort(
    (a, b) =>
      a.external_ingreso_at.localeCompare(b.external_ingreso_at) ||
      a.patente.localeCompare(b.patente)
  )
  sessions.sort((a, b) => b.return_operations - a.return_operations || a.patente.localeCompare(b.patente))

  return { operations, sessions, summary }
}

export const TRANSILE_EXTERNO_OPERATION_HEADERS = [
  'external_operation_id',
  'patente',
  'fecha',
  'producto',
  'product_family',
  'circuit_candidates',
  'circuit_assigned',
  'es_de_vuelta',
  'external_ingreso_at',
  'external_salida_at',
  'planta',
  'plataforma',
  'cycle_index',
  'source_file',
] as const

export const TRANSILE_EXTERNO_SESSION_HEADERS = [
  'patente',
  'return_operations',
  'productos',
  'familias',
  'circuitos',
  'first_at',
  'last_at',
] as const

export type TransileExternoOperationCsvRow = Omit<TransileExternoOperation, 'es_de_vuelta'> & {
  es_de_vuelta: string
}

export function transileExternoTables(report: TransileExternoReport): {
  operaciones: TypedTable<TransileExternoOperationCsvRow & Record<string, unknown>>
  sessions: TypedTable<TransileExternoSession & Record<string, unknown>>
  summary: TypedTable<TransileExternoSummary & Record<string, unknown>>
} {
  const opRows: TransileExternoOperationCsvRow[] = report.operations.map((o) => ({
    ...o,
    es_de_vuelta: o.es_de_vuelta ? 'true' : 'false',
  }))
  const summaryHeaders = Object.keys(report.summary) as (keyof TransileExternoSummary & string)[]
  return {
    operaciones: makeTable(
      'transile_externo_operaciones',
      TRANSILE_EXTERNO_OPERATION_HEADERS,
      opRows as (TransileExternoOperationCsvRow & Record<string, unknown>)[]
    ),
    sessions: makeTable(
      'transile_externo_sessions',
      TRANSILE_EXTERNO_SESSION_HEADERS,
      report.sessions as (TransileExternoSession & Record<string, unknown>)[]
    ),
    summary: makeTable(
      'transile_externo_summary',
      summaryHeaders,
      [report.summary as TransileExternoSummary & Record<string, unknown>]
    ),
  }
}

export function transileExternoOperationsCsv(operations: TransileExternoOperation[]): string {
  const rows: TransileExternoOperationCsvRow[] = operations.map((o) => ({
    ...o,
    es_de_vuelta: o.es_de_vuelta ? 'true' : 'false',
  }))
  return tableToCsv(
    makeTable(
      'transile_externo_operaciones',
      TRANSILE_EXTERNO_OPERATION_HEADERS,
      rows as (TransileExternoOperationCsvRow & Record<string, unknown>)[]
    )
  )
}

export function transileExternoSessionsCsv(sessions: TransileExternoSession[]): string {
  return tableToCsv(
    makeTable(
      'transile_externo_sessions',
      TRANSILE_EXTERNO_SESSION_HEADERS,
      sessions as (TransileExternoSession & Record<string, unknown>)[]
    )
  )
}

export function transileExternoSummaryCsv(summary: TransileExternoSummary): string {
  return tableToCsv(
    makeTable(
      'transile_externo_summary',
      Object.keys(summary) as (keyof TransileExternoSummary & string)[],
      [summary as TransileExternoSummary & Record<string, unknown>]
    )
  )
}

export function formatTransileExternoLog(summary: TransileExternoSummary): string {
  return [
    'Transile externo (es de vuelta)',
    `movimientos=${summary.movimientos_de_vuelta}`,
    `patentes=${summary.patentes_con_vuelta}`,
    `pellet=${summary.operaciones_pellet}`,
    `soja=${summary.operaciones_soja}`,
    `girasol=${summary.operaciones_girasol}`,
    `sin_familia=${summary.operaciones_sin_familia}`,
  ].join(' · ')
}
