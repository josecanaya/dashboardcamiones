import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { lookupSanLorenzoCameraByDevice } from '../../../data/sanLorenzoCameraCatalog'
import { isEtlRearCameraDevice } from './etlRearDevices'

function journeyFrontEvents(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode))
}

/** SL ingreso por cámara catalogada o por secuencia lógica ya reconstruida. */
export function journeyHasSlIngresoEvidence(j: ReconstructedRealJourney): boolean {
  for (const e of journeyFrontEvents(j)) {
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    if (dev?.installed === false) continue
    const norm = normalizeRealEventPoint(e)
    const code = dev?.logicalCode ?? norm.logicalCode
    if (code === 'SL_INGRESO') return true
  }
  return j.logicalCodeSequence.some((c) => String(c).trim() === 'SL_INGRESO')
}

/** Ric→SL: ingreso Ricardone + SL_INGRESO sin descarga instrumentada (volcable/celda/líquido/balanza). */
export function journeyIsRicSanLorenzoRouteEvidence(j: ReconstructedRealJourney): boolean {
  if (!journeyHasSlIngresoEvidence(j)) return false
  const logical = [...new Set(j.logicalCodeSequence.map((x) => String(x).trim()).filter(Boolean))]
  if (!logical.includes('INGRESO') && !logical.includes('PREINGRESO')) return false
  const blocked = [
    'VOLCABLE',
    'CELDA16_CARGA',
    'CELDA16_DESCARGA',
    'LIQUIDO',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'BALANZA',
  ]
  return !blocked.some((c) => logical.includes(c))
}
