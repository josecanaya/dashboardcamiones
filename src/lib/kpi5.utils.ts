/**
 * KPI 5 — Clasificación de recorridos y anomalías (histórico filtrado).
 */

import type { HistoricalTrip } from '../domain/logistics'
import type { SiteId } from '../domain/sites'
import { findCircuitByCode, getCircuitsForSite, type MasterCircuitItem } from '../data/masterCircuitCatalog'

export const KPI5_OPERATION_COLORS: Record<string, string> = {
  'recepcion-solidos': '#2563eb',
  'recepcion-liquidos': '#7c3aed',
  'despacho-solidos': '#16a34a',
  'despacho-liquidos': '#6366f1',
  'movimiento_interno-transile': '#ea580c',
}

export const KPI5_OPERATION_GROUPS: Array<{
  key: string
  label: string
  color: string
  match: (c: MasterCircuitItem) => boolean
}> = [
  {
    key: 'recepcion-solidos',
    label: 'Recepción / Descargas',
    color: KPI5_OPERATION_COLORS['recepcion-solidos'],
    match: (c) => c.tipo === 'recepcion' && c.subtipo === 'solidos',
  },
  {
    key: 'recepcion-liquidos',
    label: 'Recepción líquido',
    color: KPI5_OPERATION_COLORS['recepcion-liquidos'],
    match: (c) => c.tipo === 'recepcion' && c.subtipo === 'liquidos',
  },
  {
    key: 'despacho-solidos',
    label: 'Despacho',
    color: KPI5_OPERATION_COLORS['despacho-solidos'],
    match: (c) => c.tipo === 'despacho' && c.subtipo === 'solidos',
  },
  {
    key: 'despacho-liquidos',
    label: 'Despacho líquido',
    color: KPI5_OPERATION_COLORS['despacho-liquidos'],
    match: (c) => c.tipo === 'despacho' && c.subtipo === 'liquidos',
  },
  {
    key: 'movimiento_interno-transile',
    label: 'Transile',
    color: KPI5_OPERATION_COLORS['movimiento_interno-transile'],
    match: (c) => c.tipo === 'movimiento_interno',
  },
]

const COLORS_CLASIFICACION = {
  completos: '#2563eb',
  variaciones: '#7c3aed',
  anomalos: '#64748b',
} as const

const COLORS_BINARIO = {
  validos: '#0d9488',
  anomalos: '#475569',
} as const

const MAX_DESTINO_SLICES = 5

export interface Kpi5Slice {
  name: string
  value: number
  color: string
}

export interface Kpi5ValidosOperacion {
  key: string
  operacion: string
  cantidad: number
  color: string
}

export interface Kpi5MiniTortaOperacion {
  key: string
  operacion: string
  total: number
  color: string
  slices: Array<{ name: string; value: number; pct: number; color: string }>
}

export interface Kpi5Data {
  clasificacionGeneral: Kpi5Slice[]
  estadoBinario: Kpi5Slice[]
  validosPorOperacion: Kpi5ValidosOperacion[]
  miniTortasPorOperacion: Kpi5MiniTortaOperacion[]
  resumenAnomalias: {
    viajesAnomalos: number
    totalViajes: number
    pct: number
  }
}

function circuitsForKpi5(siteId: SiteId): MasterCircuitItem[] {
  const list = getCircuitsForSite(siteId)
  return list.length > 0 ? list : getCircuitsForSite('ricardone')
}

function destinoLabel(circuit: MasterCircuitItem): string {
  return circuit.tipo === 'movimiento_interno' ? circuit.nombre : circuit.destino
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = parseInt(n, 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function mixRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

function toHex(c: { r: number; g: number; b: number }): string {
  const x = (n: number) => n.toString(16).padStart(2, '0')
  return `#${x(c.r)}${x(c.g)}${x(c.b)}`
}

function sliceColorsFromBase(baseHex: string, count: number): string[] {
  if (count <= 0) return []
  const base = parseHex(baseHex)
  const white = { r: 255, g: 255, b: 255 }
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const t = 0.12 + (i / Math.max(count, 1)) * 0.58
    out.push(toHex(mixRgb(base, white, Math.min(0.82, t))))
  }
  return out
}

function foldDestinoSlices(
  byDestino: Map<string, number>,
  total: number,
  baseColor: string
): Array<{ name: string; value: number; pct: number; color: string }> {
  if (total <= 0) return []
  const entries = [...byDestino.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return []

  const top = entries.slice(0, MAX_DESTINO_SLICES)
  const rest = entries.slice(MAX_DESTINO_SLICES)
  const restSum = rest.reduce((s, [, n]) => s + n, 0)
  const rows = [...top]
  if (restSum > 0) rows.push(['Otros', restSum] as [string, number])

  const colors = sliceColorsFromBase(baseColor, rows.length)
  return rows.map(([name, value], i) => ({
    name,
    value,
    pct: (value / total) * 100,
    color: colors[i] ?? baseColor,
  }))
}

export function computeKpi5Data(tripRows: HistoricalTrip[], siteId: SiteId): Kpi5Data {
  const circuits = circuitsForKpi5(siteId)

  let completos = 0
  let variaciones = 0
  let anomalos = 0

  const opBuckets = new Map<
    string,
    { label: string; color: string; count: number; byDestino: Map<string, number> }
  >()
  for (const g of KPI5_OPERATION_GROUPS) {
    opBuckets.set(g.key, { label: g.label, color: g.color, count: 0, byDestino: new Map() })
  }

  for (const row of tripRows) {
    const ef = row.estadoFinal
    if (ef === 'VALIDADO') completos += 1
    else if (ef === 'CON_OBSERVACIONES') variaciones += 1
    else anomalos += 1

    if (ef === 'ANOMALO') continue

    const circuit = findCircuitByCode(circuits, row.catalogCode ?? row.circuitoFinal)
    if (!circuit) continue

    for (const g of KPI5_OPERATION_GROUPS) {
      if (!g.match(circuit)) continue
      const b = opBuckets.get(g.key)!
      b.count += 1
      const d = destinoLabel(circuit)
      b.byDestino.set(d, (b.byDestino.get(d) ?? 0) + 1)
      break
    }
  }

  const totalViajes = tripRows.length
  const validosTotal = completos + variaciones

  const clasificacionGeneral: Kpi5Slice[] = [
    { name: 'Circuitos completos', value: completos, color: COLORS_CLASIFICACION.completos },
    { name: 'Variaciones operativas', value: variaciones, color: COLORS_CLASIFICACION.variaciones },
    { name: 'Anómalos', value: anomalos, color: COLORS_CLASIFICACION.anomalos },
  ].filter((s) => s.value > 0)

  const estadoBinario: Kpi5Slice[] = [
    { name: 'Recorridos válidos', value: validosTotal, color: COLORS_BINARIO.validos },
    { name: 'Recorridos anómalos', value: anomalos, color: COLORS_BINARIO.anomalos },
  ].filter((s) => s.value > 0)

  const validosPorOperacion: Kpi5ValidosOperacion[] = KPI5_OPERATION_GROUPS.map((g) => {
    const b = opBuckets.get(g.key)!
    return { key: g.key, operacion: g.label, cantidad: b.count, color: g.color }
  })

  const miniTortasPorOperacion: Kpi5MiniTortaOperacion[] = KPI5_OPERATION_GROUPS.map((g) => {
    const b = opBuckets.get(g.key)!
    const slices = foldDestinoSlices(b.byDestino, b.count, g.color)
    return {
      key: g.key,
      operacion: g.label,
      total: b.count,
      color: g.color,
      slices,
    }
  })

  const pct = totalViajes > 0 ? (anomalos / totalViajes) * 100 : 0

  return {
    clasificacionGeneral,
    estadoBinario,
    validosPorOperacion,
    miniTortasPorOperacion,
    resumenAnomalias: {
      viajesAnomalos: anomalos,
      totalViajes,
      pct,
    },
  }
}

// ——— KPI 5 panel seguridad: recorridos + anomalías por producto ———

/** Toneladas estimadas por camión en situación anómala (presentación / planificación). */
export const KPI5_TONELADAS_POR_CAMION_ANOMALO = 26

const PRODUCT_POOL = ['Soja', 'Maíz', 'Girasol', 'Trigo'] as const

function inferProductFromTripId(tripId: string): (typeof PRODUCT_POOL)[number] {
  let h = 0
  for (let i = 0; i < tripId.length; i++) h = (h * 31 + tripId.charCodeAt(i)) >>> 0
  return PRODUCT_POOL[h % PRODUCT_POOL.length]
}

/**
 * Etiqueta de producto para filtros: usa `productType` del viaje si viene del backend;
 * si no, reparto determinístico por `tripId` solo para demos sin campo en JSON.
 */
export function getTripProductLabel(trip: HistoricalTrip): string {
  const raw = trip.productType?.trim()
  if (raw) {
    const lower = raw.toLowerCase()
    for (const p of PRODUCT_POOL) {
      if (lower.includes(p.toLowerCase())) return p
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
  return inferProductFromTripId(trip.tripId)
}

export const KPI5_PRODUCT_FILTER_TODOS = 'Todos'

export function buildKpi5ProductFilterOptions(trips: HistoricalTrip[]): string[] {
  const set = new Set<string>()
  for (const t of trips) set.add(getTripProductLabel(t))
  const sorted = [...set].sort((a, b) => a.localeCompare(b, 'es'))
  return [KPI5_PRODUCT_FILTER_TODOS, ...sorted]
}

export interface Kpi5SecurityViewData {
  clasificacionPie: Array<{ name: string; value: number; color: string }>
  totalViajes: number
  viajesCompletos: number
  viajesVariaciones: number
  viajesAnomalos: number
  toneladasAnomalas: number
  toneladasPorCamion: number
}

/**
 * Colores del donut KPI 5 seguridad:
 * - completos / variaciones: tonos pálidos (verde, amarillo-naranja)
 * - anomalías: rojo coral intenso (sin cambiar)
 */
export const KPI5_SEGURIDAD_CHART_COLORS = {
  completos: '#A8DCC8',
  variaciones: '#F3D9A4',
  anomalos: '#C05A4E',
} as const

const COLORS_KPI5_SEGURIDAD = KPI5_SEGURIDAD_CHART_COLORS

export function computeKpi5SecurityView(
  trips: HistoricalTrip[],
  productFilter: string,
  toneladasPorCamion: number = KPI5_TONELADAS_POR_CAMION_ANOMALO
): Kpi5SecurityViewData {
  const filtered =
    !productFilter || productFilter === KPI5_PRODUCT_FILTER_TODOS
      ? trips
      : trips.filter((t) => getTripProductLabel(t) === productFilter)

  let completos = 0
  let variaciones = 0
  let anomalos = 0
  for (const row of filtered) {
    const ef = row.estadoFinal
    if (ef === 'VALIDADO') completos += 1
    else if (ef === 'CON_OBSERVACIONES') variaciones += 1
    else anomalos += 1
  }

  const clasificacionPie = [
    { name: 'Circuitos completos', value: completos, color: COLORS_KPI5_SEGURIDAD.completos },
    { name: 'Variaciones operativas', value: variaciones, color: COLORS_KPI5_SEGURIDAD.variaciones },
    { name: 'Anómalos', value: anomalos, color: COLORS_KPI5_SEGURIDAD.anomalos },
  ].filter((s) => s.value > 0)

  const totalViajes = filtered.length
  const toneladasAnomalas = anomalos * toneladasPorCamion

  return {
    clasificacionPie,
    totalViajes,
    viajesCompletos: completos,
    viajesVariaciones: variaciones,
    viajesAnomalos: anomalos,
    toneladasAnomalas,
    toneladasPorCamion,
  }
}
