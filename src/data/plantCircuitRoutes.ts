/**
 * Recorridos dibujables sobre el plano, derivados de las secuencias REALES de
 * `CIRCUIT_CATALOG` (la única fuente de verdad de circuitos). Acá no se inventa
 * ninguna secuencia: se toma `baseSequence` tal cual y se traduce cada paso al
 * punto que tiene posición confirmada en el plano.
 *
 * Dos cosas que el catálogo no resuelve y este módulo deja explícitas:
 *
 * 1. **Pasos sin ubicación.** Si un paso de la secuencia (hoy `S10` egreso y `S3`
 *    salida a San Lorenzo) no tiene punto confirmado, el tramo no se dibuja y el
 *    circuito lo declara en `missingSteps`. Antes que adivinar una posición, el
 *    recorrido queda cortado y a la vista.
 * 2. **Calada líquida.** Los circuitos de producto líquido pasan por la misma
 *    `S2` de la secuencia, pero por el frente líquido: para esos, `S2` resuelve a
 *    `S2-LIQ`. Es la misma secuencia, apuntando al punto correcto.
 */
import { CIRCUIT_CATALOG, type CircuitCatalogEntry } from '../etl-core/domain/circuitCatalog'

export type PlantCircuitRoute = {
  code: string
  label: string
  kind: CircuitCatalogEntry['kind']
  product?: CircuitCatalogEntry['product']
  /** Secuencia original del catálogo, sin tocar. */
  sequence: string[]
  /** Ids de punto en orden, ya resueltos y con posición en el plano. */
  steps: string[]
  /** Pasos de la secuencia que no se pudieron ubicar. */
  missingSteps: string[]
}

/** Un circuito de Ricardone es R + número; el resto es San Lorenzo o mixto. */
const RICARDONE_CODE = /^R\d+$/

/**
 * Los transiles externos encadenan dos plantas en una sola secuencia (Ricardone y
 * después San Lorenzo), así que no son un recorrido dibujable sobre este plano.
 */
const NOT_DRAWABLE_KINDS = new Set<CircuitCatalogEntry['kind']>(['transile_externo'])

function resolveStep(step: string, entry: CircuitCatalogEntry, placed: Set<string>): string | null {
  if (step === 'ESPERA') return null
  if (step === 'S2' && entry.kind === 'liquido' && placed.has('S2-LIQ')) return 'S2-LIQ'
  if (placed.has(step)) return step
  // Puntos con varias bocas: la secuencia nombra el sector, el plano tiene cada boca.
  const firstLane = [...placed].find((id) => id.startsWith(`${step}-`))
  return firstLane ?? null
}

/**
 * Recorridos de Ricardone que se pueden dibujar con los puntos ubicados.
 * @param placedPointIds ids de punto que hoy tienen posición en el plano.
 */
export function getRicardoneCircuitRoutes(placedPointIds: Iterable<string>): PlantCircuitRoute[] {
  const placed = new Set(placedPointIds)
  const out: PlantCircuitRoute[] = []
  for (const entry of Object.values(CIRCUIT_CATALOG)) {
    if (!RICARDONE_CODE.test(entry.code)) continue
    if (!entry.baseSequence?.length) continue
    if (NOT_DRAWABLE_KINDS.has(entry.kind)) continue
    const sequence = [...entry.baseSequence]
    const steps: string[] = []
    const missingSteps: string[] = []
    for (const step of sequence) {
      const resolved = resolveStep(step, entry, placed)
      if (resolved) {
        // No repetir el mismo punto dos veces seguidas: el tramo sería de largo cero.
        if (steps[steps.length - 1] !== resolved) steps.push(resolved)
      } else if (step !== 'ESPERA' && !missingSteps.includes(step)) {
        missingSteps.push(step)
      }
    }
    if (steps.length < 2) continue
    out.push({
      code: entry.code,
      label: entry.label,
      kind: entry.kind,
      product: entry.product,
      sequence,
      steps,
      missingSteps,
    })
  }
  return out.sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)))
}
