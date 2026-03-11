import type { SiteId } from '../domain/sites'

export interface MasterCircuitItem {
  codigo: string
  /** Códigos equivalentes para matching con datos legacy (ej. A1, E01, B2). Incluye codigoBase. */
  codigosEquivalentes?: string[]
  nombre: string
  codigoCircuito: string
  codigoVuelta: string
  tipo: 'recepcion' | 'despacho' | 'movimiento_interno'
  subtipo: 'solidos' | 'liquidos' | 'transile'
  destino: string
  descripcion: string
  /** Secuencia de cámaras para clasificación automática (S0, S1, S2, etc.) */
  secuenciaCamaras?: string[]
}

export interface MasterCircuitGroup {
  id: string
  nombre: string
  color: string
  circuitos: MasterCircuitItem[]
}

export interface MasterPlantCatalog {
  planta: string
  grupos: MasterCircuitGroup[]
}

/** Secuencias San Lorenzo: Recepción S0 S1 S3 S4 S5 S7, Recalado S0 S2 S1 S3 S4 S5 S7, Espera playa S0 S1 S2 S4 S6 S7 */
const SL_RECEPCION_BASE = ['S0', 'S1', 'S3', 'S4', 'S5', 'S7']
const SL_RECEPCION_RECALADO = ['S0', 'S2', 'S1', 'S3', 'S4', 'S5', 'S7']
const SL_RECEPCION_ESPERA_PLAYA = ['S0', 'S1', 'S2', 'S4', 'S6', 'S7']

export const MASTER_CIRCUIT_CATALOG: Record<SiteId, MasterPlantCatalog> = {
  ricardone: {
    planta: 'Ricardone',
    grupos: [
      {
        id: 'recepcion_solidos',
        nombre: 'Recepción / Descarga sólido',
        color: 'blue',
        circuitos: [
          { codigo: 'A1V0', codigosEquivalentes: ['A1'], nombre: 'Celda 16', codigoCircuito: 'CIR_A1_V0', codigoVuelta: 'VUE_A1_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Celda 16', descripcion: 'Descarga sólido en Celda 16.' },
          { codigo: 'A2V0', codigosEquivalentes: ['A2'], nombre: 'Silo Australiano', codigoCircuito: 'CIR_A2_V0', codigoVuelta: 'VUE_A2_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Silo Australiano', descripcion: 'Descarga sólido en Silo Australiano.' },
          { codigo: 'A3V0', codigosEquivalentes: ['A3'], nombre: 'Silos Kepler', codigoCircuito: 'CIR_A3_V0', codigoVuelta: 'VUE_A3_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Silos Kepler', descripcion: 'Descarga sólido en Silos Kepler.' },
          { codigo: 'A4V0', codigosEquivalentes: ['A4'], nombre: 'Silos CHIEF', codigoCircuito: 'CIR_A4_V0', codigoVuelta: 'VUE_A4_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Silos CHIEF', descripcion: 'Descarga sólido en Silos CHIEF.' },
          { codigo: 'A5V0', codigosEquivalentes: ['A5'], nombre: 'Volcable 1', codigoCircuito: 'CIR_A5_V0', codigoVuelta: 'VUE_A5_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Volcable 1', descripcion: 'Descarga sólido en Volcable 1.' },
          { codigo: 'A6V0', codigosEquivalentes: ['A6'], nombre: 'Volcable 2', codigoCircuito: 'CIR_A6_V0', codigoVuelta: 'VUE_A6_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Volcable 2', descripcion: 'Descarga sólido en Volcable 2.' },
          { codigo: 'A7V0', codigosEquivalentes: ['A7'], nombre: 'San Lorenzo', codigoCircuito: 'CIR_A7_V0', codigoVuelta: 'VUE_A7_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'San Lorenzo', descripcion: 'Descarga sólido hacia San Lorenzo.' },
        ],
      },
      {
        id: 'despacho_solidos',
        nombre: 'Despacho / Carga sólido',
        color: 'green',
        circuitos: [
          { codigo: 'B1V0', codigosEquivalentes: ['B1'], nombre: 'Celda 16', codigoCircuito: 'CIR_B1_V0', codigoVuelta: 'VUE_B1_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 16', descripcion: 'Carga sólido en Celda 16.' },
          { codigo: 'B2V0', codigosEquivalentes: ['B2'], nombre: 'Silo Australiano', codigoCircuito: 'CIR_B2_V0', codigoVuelta: 'VUE_B2_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Silo Australiano', descripcion: 'Carga sólido en Silo Australiano.' },
          { codigo: 'B3V0', codigosEquivalentes: ['B3'], nombre: 'Silos Kepler', codigoCircuito: 'CIR_B3_V0', codigoVuelta: 'VUE_B3_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Silos Kepler', descripcion: 'Carga sólido en Silos Kepler.' },
          { codigo: 'B4V0', codigosEquivalentes: ['B4'], nombre: 'Silos CHIEF', codigoCircuito: 'CIR_B4_V0', codigoVuelta: 'VUE_B4_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Silos CHIEF', descripcion: 'Carga sólido en Silos CHIEF.' },
          { codigo: 'B5V0', codigosEquivalentes: ['B5'], nombre: 'Celda 9', codigoCircuito: 'CIR_B5_V0', codigoVuelta: 'VUE_B5_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 9', descripcion: 'Carga sólido en Celda 9.' },
          { codigo: 'B6V0', codigosEquivalentes: ['B6'], nombre: 'Celda 10', codigoCircuito: 'CIR_B6_V0', codigoVuelta: 'VUE_B6_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 10', descripcion: 'Carga sólido en Celda 10.' },
          { codigo: 'B7V0', codigosEquivalentes: ['B7'], nombre: 'Celda 11', codigoCircuito: 'CIR_B7_V0', codigoVuelta: 'VUE_B7_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 11', descripcion: 'Carga sólido en Celda 11.' },
          { codigo: 'B8V0', codigosEquivalentes: ['B8'], nombre: 'San Lorenzo', codigoCircuito: 'CIR_B8_V0', codigoVuelta: 'VUE_B8_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'San Lorenzo', descripcion: 'Carga sólido hacia San Lorenzo.' },
        ],
      },
      {
        id: 'liquidos',
        nombre: 'Recepción y Despacho líquido',
        color: 'purple',
        circuitos: [
          { codigo: 'C1V0', codigosEquivalentes: ['C1', 'D1'], nombre: 'Líquidos completo', codigoCircuito: 'CIR_C1_V0', codigoVuelta: 'VUE_C1_V0', tipo: 'recepcion', subtipo: 'liquidos', destino: 'Líquidos', descripcion: 'Recepción y despacho líquido en una sola categoría completa.' },
        ],
      },
      {
        id: 'movimientos_internos',
        nombre: 'Transile / Movimientos internos',
        color: 'orange',
        circuitos: [
          { codigo: 'E1V0', codigosEquivalentes: ['E1', 'E01'], nombre: 'Celda 16 -> Silo Australiano', codigoCircuito: 'CIR_E1_V0', codigoVuelta: 'VUE_E1_V0', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Celda 16 a Silo Australiano', descripcion: 'Transile Celda 16 hacia Silo Australiano.' },
          { codigo: 'E2V0', codigosEquivalentes: ['E2', 'E02'], nombre: 'Silo Australiano -> Silos Kepler', codigoCircuito: 'CIR_E2_V0', codigoVuelta: 'VUE_E2_V0', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Silo Australiano a Silos Kepler', descripcion: 'Transile Silo Australiano hacia Silos Kepler.' },
          { codigo: 'E3V0', codigosEquivalentes: ['E3', 'E03'], nombre: 'Silos Kepler -> Celda 16', codigoCircuito: 'CIR_E3_V0', codigoVuelta: 'VUE_E3_V0', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Silos Kepler a Celda 16', descripcion: 'Transile Silos Kepler hacia Celda 16.' },
          { codigo: 'E4V0', codigosEquivalentes: ['E4', 'F4'], nombre: 'Mov. interno Celda 16 -> Silos Kepler', codigoCircuito: 'CIR_E4_V0', codigoVuelta: 'VUE_E4_V0', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Celda 16 a Silos Kepler', descripcion: 'Movimiento interno Celda 16 hacia Silos Kepler.' },
          { codigo: 'E5V0', codigosEquivalentes: ['E5', 'F5'], nombre: 'Carga Silo Australiano', codigoCircuito: 'CIR_E5_V0', codigoVuelta: 'VUE_E5_V0', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Carga Silo Australiano', descripcion: 'Carga en Silo Australiano.' },
        ],
      },
    ],
  },
  san_lorenzo: {
    planta: 'San Lorenzo',
    grupos: [
      {
        id: 'recepcion_solidos',
        nombre: 'Recepción sólido',
        color: 'blue',
        circuitos: [
          { codigo: 'A1V0', codigosEquivalentes: ['A1'], nombre: 'Completo', codigoCircuito: 'CIR_A1_V0', codigoVuelta: 'VUE_A1_V0', tipo: 'recepcion', subtipo: 'solidos', destino: 'Recepción sólido', descripcion: 'Recepción sólido completo.', secuenciaCamaras: SL_RECEPCION_BASE },
          { codigo: 'A1V1', codigosEquivalentes: ['A1'], nombre: 'Recalado', codigoCircuito: 'CIR_A1_V1', codigoVuelta: 'VUE_A1_V1', tipo: 'recepcion', subtipo: 'solidos', destino: 'Recepción sólido', descripcion: 'Recepción sólido con recalado.', secuenciaCamaras: SL_RECEPCION_RECALADO },
          { codigo: 'A1V2', codigosEquivalentes: ['A1'], nombre: 'Espera en playa', codigoCircuito: 'CIR_A1_V2', codigoVuelta: 'VUE_A1_V2', tipo: 'recepcion', subtipo: 'solidos', destino: 'Recepción sólido', descripcion: 'Recepción sólido con espera en playa.', secuenciaCamaras: SL_RECEPCION_ESPERA_PLAYA },
          { codigo: 'A1V3', codigosEquivalentes: ['A1'], nombre: 'Observaciones calidad', codigoCircuito: 'CIR_A1_V3', codigoVuelta: 'VUE_A1_V3', tipo: 'recepcion', subtipo: 'solidos', destino: 'Recepción sólido', descripcion: 'Recepción sólido con observaciones de calidad.' },
          { codigo: 'A1V4', codigosEquivalentes: ['A1'], nombre: 'Observación descarga', codigoCircuito: 'CIR_A1_V4', codigoVuelta: 'VUE_A1_V4', tipo: 'recepcion', subtipo: 'solidos', destino: 'Recepción sólido', descripcion: 'Recepción sólido con observación en descarga.' },
        ],
      },
      {
        id: 'despacho_solidos',
        nombre: 'Despacho sólido',
        color: 'green',
        circuitos: [
          { codigo: 'B1V0', codigosEquivalentes: ['B1'], nombre: 'Completo', codigoCircuito: 'CIR_B1_V0', codigoVuelta: 'VUE_B1_V0', tipo: 'despacho', subtipo: 'solidos', destino: 'Despacho sólido', descripcion: 'Despacho sólido completo.' },
          { codigo: 'B1V1', codigosEquivalentes: ['B1'], nombre: 'Error de peso', codigoCircuito: 'CIR_B1_V1', codigoVuelta: 'VUE_B1_V1', tipo: 'despacho', subtipo: 'solidos', destino: 'Despacho sólido', descripcion: 'Despacho sólido con error de peso.' },
          { codigo: 'B1V2', codigosEquivalentes: ['B1'], nombre: 'Espera calado', codigoCircuito: 'CIR_B1_V2', codigoVuelta: 'VUE_B1_V2', tipo: 'despacho', subtipo: 'solidos', destino: 'Despacho sólido', descripcion: 'Despacho sólido con espera calado.' },
        ],
      },
      {
        id: 'recepcion_liquidos',
        nombre: 'Recepción líquido',
        color: 'purple',
        circuitos: [
          { codigo: 'C1V0', codigosEquivalentes: ['C1'], nombre: 'Punto 1', codigoCircuito: 'CIR_C1_V0', codigoVuelta: 'VUE_C1_V0', tipo: 'recepcion', subtipo: 'liquidos', destino: 'Punto 1', descripcion: 'Recepción líquido punto 1. V0=Completo, V1=Espera, V2=Recalado.' },
          { codigo: 'C2V0', codigosEquivalentes: ['C2'], nombre: 'Punto 2', codigoCircuito: 'CIR_C2_V0', codigoVuelta: 'VUE_C2_V0', tipo: 'recepcion', subtipo: 'liquidos', destino: 'Punto 2', descripcion: 'Recepción líquido punto 2.' },
          { codigo: 'C3V0', codigosEquivalentes: ['C3'], nombre: 'Renova', codigoCircuito: 'CIR_C3_V0', codigoVuelta: 'VUE_C3_V0', tipo: 'recepcion', subtipo: 'liquidos', destino: 'Renova', descripcion: 'Recepción líquido Renova.' },
        ],
      },
      {
        id: 'despacho_liquidos',
        nombre: 'Despacho líquido',
        color: 'purple',
        circuitos: [
          { codigo: 'D1V0', codigosEquivalentes: ['D1'], nombre: 'Punto 1', codigoCircuito: 'CIR_D1_V0', codigoVuelta: 'VUE_D1_V0', tipo: 'despacho', subtipo: 'liquidos', destino: 'Punto 1', descripcion: 'Despacho líquido punto 1. V0=Completo, V1=Espera, V2=Recalado.' },
          { codigo: 'D2V0', codigosEquivalentes: ['D2'], nombre: 'Punto 2', codigoCircuito: 'CIR_D2_V0', codigoVuelta: 'VUE_D2_V0', tipo: 'despacho', subtipo: 'liquidos', destino: 'Punto 2', descripcion: 'Despacho líquido punto 2.' },
          { codigo: 'D3V0', codigosEquivalentes: ['D3'], nombre: 'Renova', codigoCircuito: 'CIR_D3_V0', codigoVuelta: 'VUE_D3_V0', tipo: 'despacho', subtipo: 'liquidos', destino: 'Renova', descripcion: 'Despacho líquido Renova.' },
        ],
      },
    ],
  },
  avellaneda: {
    planta: 'Avellaneda',
    grupos: [
      { id: 'pendiente_definicion', nombre: 'Circuitos Avellaneda', color: 'blue', circuitos: [] },
    ],
  },
}

export function getCircuitsForSite(siteId: SiteId): MasterCircuitItem[] {
  return MASTER_CIRCUIT_CATALOG[siteId].grupos.flatMap((g) => g.circuitos)
}

/** Obtiene el código base de un circuito (ej. A1V2 -> A1) */
export function getCodigoBase(codigo: string): string {
  const match = codigo.match(/^([A-Z]\d+)/)
  return match ? match[1] : codigo
}

/** Busca circuito por codigo o codigosEquivalentes (para matching con datos legacy) */
export function findCircuitByCode(circuits: MasterCircuitItem[], code: string): MasterCircuitItem | undefined {
  const normalized = (code ?? '').toUpperCase().trim().replace(/^E0/, 'E').replace(/^B0/, 'B')
  const base = getCodigoBase(normalized)
  return circuits.find(
    (c) =>
      c.codigo.toUpperCase() === normalized ||
      (c.codigosEquivalentes ?? [getCodigoBase(c.codigo)]).some((eq) => eq.toUpperCase() === normalized || eq.toUpperCase() === base)
  )
}

/** Normaliza ID de cámara: CAM_S0 -> S0, S0 -> S0 */
function normalizeCameraId(id: string): string {
  const s = (id ?? '').trim().toUpperCase()
  return s.replace(/^CAM_/, '')
}

/**
 * Clasifica circuito por secuencia de cámaras detectada.
 * Compara la secuencia con secuenciaCamaras de cada circuito y devuelve el mejor match.
 */
export function classifyCircuitBySequence(
  circuits: MasterCircuitItem[],
  detectedSequence: string[]
): MasterCircuitItem | undefined {
  const seq = detectedSequence.map(normalizeCameraId).filter(Boolean)
  if (seq.length === 0) return undefined

  const withSeq = circuits.filter((c) => c.secuenciaCamaras && c.secuenciaCamaras.length > 0)
  if (withSeq.length === 0) return undefined

  let best: { circuit: MasterCircuitItem; score: number } | null = null
  for (const circuit of withSeq) {
    const catalog = (circuit.secuenciaCamaras ?? []).map(normalizeCameraId)
    if (catalog.length === 0) continue

    // Coincidencia exacta
    if (catalog.length === seq.length && catalog.every((c, i) => c === seq[i])) {
      return circuit
    }

    // Subsecuencia: ¿la secuencia del catálogo está contenida en la detectada (en orden)?
    let matchLen = 0
    let j = 0
    for (let i = 0; i < seq.length && j < catalog.length; i++) {
      if (seq[i] === catalog[j]) {
        matchLen++
        j++
      }
    }
    const score = j === catalog.length ? catalog.length : matchLen / catalog.length
    if (score > 0 && (!best || score > best.score)) {
      best = { circuit, score }
    }
  }
  return best && best.score >= 0.6 ? best.circuit : undefined
}
