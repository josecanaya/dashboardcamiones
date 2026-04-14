/**
 * KPI 5 — Donut multinivel (3 anillos):
 * 1) Válidos vs anómalos
 * 2) En anómalos: por producto (gama roja). En válidos: variaciones (amarillo) vs completos (verde)
 * 3) Solo en completos validados: destinos de descarga (verde claro → oscuro)
 */

import type { HistoricalTrip } from '../domain/logistics'
import type { SiteId } from '../domain/sites'
import { findCircuitByCode, getCircuitsForSite, type MasterCircuitItem } from '../data/masterCircuitCatalog'
import { KPI5_PRODUCT_FILTER_TODOS, getTripProductLabel } from './kpi5.utils'

const MAX_DESTINOS_ANILLO = 7

/** Orden fijo para gradiente rojo: más oscuro → más claro */
const PRODUCT_ORDER_ANOMALIA = ['Maíz', 'Soja', 'Girasol', 'Trigo'] as const

export interface Kpi5MultinivelProductSlice {
  product: string
  count: number
  color: string
}

export interface Kpi5MultinivelDestinoSlice {
  destino: string
  count: number
  color: string
}

export type Kpi5MultinivelInsightKind = 'destino_frecuente' | 'operacion_dominante'

export interface Kpi5MultinivelInsight {
  kind: Kpi5MultinivelInsightKind
  /** Texto listo para mostrar (una línea breve) */
  text: string
  /** Destino más frecuente (solo si `kind === 'destino_frecuente'`) */
  destinoNombre?: string
}

export interface Kpi5MultinivelView {
  totalRecorridos: number
  totalValidos: number
  totalAnomalos: number
  validados: number
  variaciones: number
  /** Anómalos agrupados por producto (etiqueta de viaje) */
  anomalousByProduct: Kpi5MultinivelProductSlice[]
  /** Completos (VALIDADO) por punto de descarga / destino de circuito */
  completosByDestino: Kpi5MultinivelDestinoSlice[]
  /** Destino más frecuente en completos, o si no aplica, operación dominante en todos los válidos */
  insight: Kpi5MultinivelInsight | null
}

export const KPI5_MULTINIVEL_COLORS = {
  /** Paleta sobria original (dashboard industrial) */
  ring1: {
    validos: '#8FA8C4',
    anomalos: '#7A4540',
  },
  variaciones: '#E6D896',
  completosRing2: '#6E9B6D',
  /** Rojos por producto (Maíz más oscuro …) */
  anomaloProducto: [
    '#5C2A24',
    '#7A3A32',
    '#955045',
    '#A66F62',
    '#B88A7E',
    '#C4A398',
  ] as const,
} as const

function circuitsForSite(siteId: SiteId): MasterCircuitItem[] {
  const list = getCircuitsForSite(siteId)
  return list.length > 0 ? list : getCircuitsForSite('ricardone')
}

function destinoDescargaLabel(circuit: MasterCircuitItem): string {
  return circuit.tipo === 'movimiento_interno' ? circuit.nombre : circuit.destino
}

type OpKey = 'recepcion' | 'despacho' | 'transile'

function circuitToOpKey(circuit: MasterCircuitItem | undefined): OpKey {
  if (!circuit) return 'recepcion'
  if (circuit.tipo === 'recepcion') return 'recepcion'
  if (circuit.tipo === 'despacho') return 'despacho'
  return 'transile'
}

const OP_LABEL: Record<OpKey, string> = {
  recepcion: 'Recepción',
  despacho: 'Despacho',
  transile: 'Transile',
}

function colorForAnomalousProduct(product: string): string {
  const idx = PRODUCT_ORDER_ANOMALIA.findIndex(
    (p) => p.toLowerCase() === product.toLowerCase()
  )
  if (idx >= 0) {
    return KPI5_MULTINIVEL_COLORS.anomaloProducto[
      Math.min(idx, KPI5_MULTINIVEL_COLORS.anomaloProducto.length - 1)
    ]
  }
  return KPI5_MULTINIVEL_COLORS.anomaloProducto[
    KPI5_MULTINIVEL_COLORS.anomaloProducto.length - 1
  ]
}

function sortProductSlices(entries: Map<string, number>): Kpi5MultinivelProductSlice[] {
  const list: { product: string; count: number; order: number }[] = []
  for (const [product, count] of entries) {
    if (count <= 0) continue
    const idx = PRODUCT_ORDER_ANOMALIA.findIndex(
      (p) => p.toLowerCase() === product.toLowerCase()
    )
    const order = idx >= 0 ? idx : 50
    list.push({ product, count, order })
  }
  list.sort(
    (a, b) => a.order - b.order || a.product.localeCompare(b.product, 'es')
  )
  return list.map((row) => ({
    product: row.product,
    count: row.count,
    color: colorForAnomalousProduct(row.product),
  }))
}

function parseRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const v = parseInt(n, 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const A = parseRgb(hexA)
  const B = parseRgb(hexB)
  const mix = (k: keyof typeof A) => Math.round(A[k] + (B[k] - A[k]) * t)
  const r = mix('r')
  const g = mix('g')
  const b = mix('b')
  const hx = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

/** Verdes de claro a oscuro para destinos (completos). */
function greensForDestinos(n: number): string[] {
  if (n <= 0) return []
  const light = '#C5E3C3'
  const dark = '#356A3A'
  if (n === 1) return [mixHex(light, dark, 0.55)]
  return Array.from({ length: n }, (_, i) => mixHex(light, dark, i / Math.max(n - 1, 1)))
}

function foldDestinos(map: Map<string, number>): Kpi5MultinivelDestinoSlice[] {
  const entries = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return []
  const top = entries.slice(0, MAX_DESTINOS_ANILLO)
  const rest = entries.slice(MAX_DESTINOS_ANILLO)
  const restSum = rest.reduce((s, [, v]) => s + v, 0)
  const rows = [...top]
  if (restSum > 0) rows.push(['Otros', restSum] as [string, number])
  const colors = greensForDestinos(rows.length)
  return rows.map(([destino, count], i) => ({
    destino,
    count,
    color: colors[i] ?? colors[colors.length - 1],
  }))
}

/**
 * Válidos = VALIDADO + CON_OBSERVACIONES. Anómalos = ANOMALO.
 * Anómalos por producto del viaje; completos por destino de descarga del circuito.
 */
export function computeKpi5MultinivelView(
  trips: HistoricalTrip[],
  productFilter: string,
  siteId: SiteId
): Kpi5MultinivelView {
  const filtered =
    !productFilter || productFilter === KPI5_PRODUCT_FILTER_TODOS
      ? trips
      : trips.filter((t) => getTripProductLabel(t) === productFilter)

  const circuits = circuitsForSite(siteId)
  const byProductAnom = new Map<string, number>()
  const byDestinoCompleto = new Map<string, number>()
  const validosPorOp: Record<OpKey, number> = { recepcion: 0, despacho: 0, transile: 0 }
  let validados = 0
  let variaciones = 0
  let anomalos = 0

  for (const row of filtered) {
    const ef = row.estadoFinal
    const circuit = findCircuitByCode(circuits, row.catalogCode ?? row.circuitoFinal)
    const destino = circuit ? destinoDescargaLabel(circuit) : 'Sin clasificar'

    if (ef === 'ANOMALO') {
      anomalos += 1
      const prod = getTripProductLabel(row)
      byProductAnom.set(prod, (byProductAnom.get(prod) ?? 0) + 1)
    } else {
      const op = circuitToOpKey(circuit)
      validosPorOp[op] += 1
      if (ef === 'CON_OBSERVACIONES') {
        variaciones += 1
      } else {
        validados += 1
        byDestinoCompleto.set(destino, (byDestinoCompleto.get(destino) ?? 0) + 1)
      }
    }
  }

  const totalValidos = validados + variaciones
  const totalAnomalos = anomalos
  const completosByDestino = foldDestinos(byDestinoCompleto)

  let insight: Kpi5MultinivelInsight | null = null
  if (validados > 0 && completosByDestino.length > 0) {
    const top = completosByDestino[0]
    insight = {
      kind: 'destino_frecuente',
      text: `Destino más frecuente (completos): ${top.destino}`,
      destinoNombre: top.destino,
    }
  } else if (totalValidos > 0) {
    let best: OpKey = 'recepcion'
    let bestN = -1
    for (const k of ['recepcion', 'despacho', 'transile'] as const) {
      if (validosPorOp[k] > bestN) {
        bestN = validosPorOp[k]
        best = k
      }
    }
    if (bestN > 0) {
      insight = {
        kind: 'operacion_dominante',
        text: `Operación dominante (válidos): ${OP_LABEL[best]}`,
      }
    }
  }

  return {
    totalRecorridos: filtered.length,
    totalValidos,
    totalAnomalos,
    validados,
    variaciones,
    anomalousByProduct: sortProductSlices(byProductAnom),
    completosByDestino,
    insight,
  }
}

export type Kpi5MultinivelRing =
  | 'principal'
  | 'validacion'
  | 'anomalo_producto'
  | 'destino_completo'

export interface Kpi5MultinivelArcSlice {
  ring: Kpi5MultinivelRing
  tipoLabel: string
  detalleLabel: string
  cantidad: number
  pctPadre: number
  color: string
  a0: number
  a1: number
  rInner: number
  rOuter: number
}

const GAP_RAD_RING1 = 0.02
const PAD_RAD = 0.035

function clampGap(totalRad: number, n: number): number {
  if (n <= 0 || totalRad <= 0) return 0
  const maxGap = totalRad / (n * 2 + 1)
  return Math.min(PAD_RAD, maxGap * 0.45)
}

function pushArcs(
  out: Kpi5MultinivelArcSlice[],
  ring: Kpi5MultinivelRing,
  tipoLabel: string,
  parentTotal: number,
  aStart: number,
  aSpan: number,
  items: Array<{ label: string; value: number; color: string }>,
  rInner: number,
  rOuter: number
) {
  if (parentTotal <= 0 || aSpan <= 0) return
  const entries = items.filter((e) => e.value > 0)
  if (entries.length === 0) return
  const gap = clampGap(aSpan, entries.length)
  let cursor = aStart + gap
  const usable = aSpan - gap * (entries.length + 1)
  for (const e of entries) {
    const seg = usable * (e.value / parentTotal)
    const a0 = cursor
    const a1 = cursor + seg
    cursor = a1 + gap
    out.push({
      ring,
      tipoLabel,
      detalleLabel: e.label,
      cantidad: e.value,
      pctPadre: parentTotal > 0 ? (e.value / parentTotal) * 100 : 0,
      color: e.color,
      a0,
      a1,
      rInner,
      rOuter,
    })
  }
}

/** Ángulos del sub-arco "Completos" dentro del sector válido (mismo reparto que `pushArcs` con 2 partes). */
function completosArcInValidSector(
  aValid0: number,
  aValid1: number,
  variaciones: number,
  validados: number,
  totalValidos: number
): { a0: number; a1: number } | null {
  if (totalValidos <= 0 || validados <= 0) return null
  const span = aValid1 - aValid0
  const gap = clampGap(span, 2)
  const usable = span - gap * 3
  if (usable <= 0) return null

  if (variaciones <= 0) {
    const g1 = clampGap(span, 1)
    const u1 = span - 2 * g1
    if (u1 <= 0) return null
    const a0 = aValid0 + g1
    const a1 = a0 + u1
    return { a0, a1 }
  }

  if (validados <= 0) return null

  const segV = usable * (variaciones / totalValidos)
  const segC = usable * (validados / totalValidos)
  const aVar0 = aValid0 + gap
  const aComp0 = aVar0 + segV + gap
  const aComp1 = aComp0 + segC
  return { a0: aComp0, a1: aComp1 }
}

/**
 * Anillo 1 un poco más grueso hacia el centro; anillo 2 dominante; anillo 3 detalle fino.
 */
export function buildKpi5MultinivelArcSlices(
  viewSize: number,
  data: Kpi5MultinivelView
): Kpi5MultinivelArcSlice[] {
  const scale = viewSize / 240

  /** Anillo 1: un poco más grueso hacia el centro */
  const r1in = 40 * scale
  const r1out = 58 * scale
  /** Anillo 2: lectura principal */
  const r2in = 62 * scale
  const r2out = 98 * scale
  /** Anillo 3: fino */
  const r3in = 102 * scale
  const r3out = 115 * scale

  const { totalValidos, totalAnomalos, validados, variaciones, anomalousByProduct, completosByDestino } =
    data
  const total = totalValidos + totalAnomalos
  if (total <= 0) return []

  const a0 = -Math.PI / 2
  const spanV = (totalValidos / total) * Math.PI * 2
  const g1 = GAP_RAD_RING1
  const aValid0 = a0 + g1
  const aValid1 = a0 + spanV - g1
  const aAnom0 = a0 + spanV + g1
  const aAnom1 = a0 + Math.PI * 2 - g1

  const out: Kpi5MultinivelArcSlice[] = []

  if (totalValidos > 0) {
    out.push({
      ring: 'principal',
      tipoLabel: 'Válidos',
      detalleLabel: 'Total válidos',
      cantidad: totalValidos,
      pctPadre: (totalValidos / total) * 100,
      color: KPI5_MULTINIVEL_COLORS.ring1.validos,
      a0: aValid0,
      a1: aValid1,
      rInner: r1in,
      rOuter: r1out,
    })

    const spanValid = aValid1 - aValid0
    pushArcs(
      out,
      'validacion',
      'Válidos',
      totalValidos,
      aValid0,
      spanValid,
      [
        { label: 'Variaciones operativas', value: variaciones, color: KPI5_MULTINIVEL_COLORS.variaciones },
        { label: 'Completos', value: validados, color: KPI5_MULTINIVEL_COLORS.completosRing2 },
      ],
      r2in,
      r2out
    )

    const compArc = completosArcInValidSector(
      aValid0,
      aValid1,
      variaciones,
      validados,
      totalValidos
    )
    if (compArc && completosByDestino.length > 0) {
      pushArcs(
        out,
        'destino_completo',
        'Completos',
        validados,
        compArc.a0,
        compArc.a1 - compArc.a0,
        completosByDestino.map((d) => ({
          label: d.destino,
          value: d.count,
          color: d.color,
        })),
        r3in,
        r3out
      )
    }
  }

  if (totalAnomalos > 0) {
    out.push({
      ring: 'principal',
      tipoLabel: 'Anómalos',
      detalleLabel: 'Total anómalos',
      cantidad: totalAnomalos,
      pctPadre: (totalAnomalos / total) * 100,
      color: KPI5_MULTINIVEL_COLORS.ring1.anomalos,
      a0: aAnom0,
      a1: aAnom1,
      rInner: r1in,
      rOuter: r1out,
    })

    pushArcs(
      out,
      'anomalo_producto',
      'Anómalos',
      totalAnomalos,
      aAnom0,
      aAnom1 - aAnom0,
      anomalousByProduct.map((p) => ({
        label: p.product,
        value: p.count,
        color: p.color,
      })),
      r2in,
      r2out
    )
  }

  return out
}

export function kpi5MultinivelPolar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

export function kpi5MultinivelAnnularPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number
): string {
  if (a1 - a0 <= 1e-6) return ''
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0o, y0o] = kpi5MultinivelPolar(cx, cy, r1, a0)
  const [x1o, y1o] = kpi5MultinivelPolar(cx, cy, r1, a1)
  const [x1i, y1i] = kpi5MultinivelPolar(cx, cy, r0, a1)
  const [x0i, y0i] = kpi5MultinivelPolar(cx, cy, r0, a0)
  return [
    `M ${x0o.toFixed(3)} ${y0o.toFixed(3)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${x1o.toFixed(3)} ${y1o.toFixed(3)}`,
    `L ${x1i.toFixed(3)} ${y1i.toFixed(3)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${x0i.toFixed(3)} ${y0i.toFixed(3)}`,
    'Z',
  ].join(' ')
}
