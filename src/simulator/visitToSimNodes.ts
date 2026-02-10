/**
 * Mapeo de eventos normalizados a nodos del simulador (solo A,B,C,D,E,F,G).
 * La decisión no es evento: C.resultado (OK/NO/OBS) se obtiene de LAB_RESULT_READY y se asocia al último C.
 */

import type { NormalizedEvent } from '../domain/events'
import type { ReconstructedVisit } from '../domain/events'

export type SimNodeKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type CaladaResult = 'OK' | 'NO' | 'OBS'

function getCaladaResult(ev: NormalizedEvent): CaladaResult | undefined {
  if (ev.eventType !== 'LAB_RESULT_READY') return undefined
  const status = String(ev.raw?.status ?? ev.raw?.resultado ?? '').toLowerCase()
  if (status === 'rejected' || status === 'rechazado') return 'NO'
  if (status === 'observed' || status === 'observado') return 'OBS'
  if (status === 'approved' || status === 'aprobado' || status === 'ok' || status === 'si') return 'OK'
  return undefined
}

function eventToNode(ev: NormalizedEvent): SimNodeKey | null {
  const type = ev.eventType
  if (type === 'GATE_CHECKIN' || type === 'QUEUE_OUTSIDE') return 'A'
  if (type === 'SCALE_IN') return 'B'
  if (type === 'SAMPLE_SOLID_TAKEN' || type === 'SAMPLE_LIQUID_TAKEN') return 'C'
  if (type === 'YARD_WAIT') return 'G'
  if (type === 'DISCHARGE_ASSIGNED' || type === 'DISCHARGE_START' || type === 'DISCHARGE_END') return 'D'
  if (type === 'SCALE_OUT') return 'E'
  if (type === 'EXIT') return 'F'
  if (type === 'LAB_RESULT_READY') return null
  const loc = ev.locationKey
  if (loc === 'GATE') return 'A'
  if (loc === 'SCALE_IN') return 'B'
  if (loc === 'SAMPLE_BAY_A' || loc === 'SAMPLE_BAY_B') return 'C'
  if (loc === 'YARD_A' || loc === 'YARD_B') return 'G'
  if (loc === 'PIT_1' || loc === 'PIT_2' || loc === 'PIT_3' || loc?.startsWith('LIQUID_BAY')) return 'D'
  if (loc === 'SCALE_OUT') return 'E'
  if (loc === 'EXIT') return 'F'
  return null
}

export interface VisitSimResult {
  nodes: SimNodeKey[]
  eventIndexPerNode: number[]
  /** Para cada índice de nodo que es C, resultado de esa calada (del LAB_RESULT_READY siguiente). */
  caladaResultByNodeIndex: Record<number, CaladaResult>
}

export function visitToSimNodes(visit: ReconstructedVisit): SimNodeKey[] {
  return visitToSimNodesWithEventIndex(visit).nodes
}

export function visitToSimNodesWithEventIndex(visit: ReconstructedVisit): VisitSimResult {
  const nodes: SimNodeKey[] = []
  const eventIndexPerNode: number[] = []
  const caladaResultByNodeIndex: Record<number, CaladaResult> = {}
  let last: SimNodeKey | null = null

  visit.events.forEach((ev, i) => {
    if (ev.eventType === 'LAB_RESULT_READY') {
      const res = getCaladaResult(ev)
      if (res != null && nodes.length > 0) {
        for (let j = nodes.length - 1; j >= 0; j--) {
          if (nodes[j] === 'C') {
            caladaResultByNodeIndex[j] = res
            break
          }
        }
      }
      return
    }
    const node = eventToNode(ev)
    if (node && node !== last) {
      nodes.push(node)
      eventIndexPerNode.push(i)
      last = node
    }
  })

  return { nodes, eventIndexPerNode, caladaResultByNodeIndex }
}
