import type { RealJourneyEventDto, ReconstructedRealSiteId } from './realJourneyEvents.types'

const RIC_INGRESO_SECTOR = 'RICARDONE_INGRESO_CAMIONES'
const RIC_PREINGRESO_SECTOR = 'RICARDONE_PREINGRESO'
const RIC_EGRESO_SECTOR = 'RICARDONE_EGRESO_CAMIONES'
const RIC_VOLCABLE_1 = 'RICARDONE_VOLCABLE_1'
const RIC_VOLCABLE_2 = 'RICARDONE_VOLCABLE_2'
const RIC_BALANZA = 'RICARDONE_BALANZA'
const SL_INGRESO_SECTOR = 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES'

function inferSiteLocal(sectorCode: string): ReconstructedRealSiteId {
  const s = (sectorCode ?? '').trim()
  const upper = s.toUpperCase()
  if (upper.startsWith('RICARDONE_')) return 'ricardone'
  if (upper.startsWith('PUERTO_SAN_LORENZO_')) return 'san_lorenzo'
  if (upper.includes('AVELLANEDA')) return 'avellaneda'
  return 'unknown'
}

export type NormalizedRealEventPoint = {
  siteId: ReconstructedRealSiteId
  pointType: string
  pointLabel: string
  logicalCode: string
  operationalPoint: string
}

/** Punto semántico único por evento (sector + dirección balanza cuando aplica). */
export function normalizeRealEventPoint(event: RealJourneyEventDto): NormalizedRealEventPoint {
  const sector = (event.sectorCode ?? '').trim()
  const sectorU = sector.toUpperCase()
  const deviceRaw = event.deviceCode ?? ''
  const device = deviceRaw.toLowerCase()

  const siteId = inferSiteLocal(sector)

  switch (sectorU) {
    case RIC_INGRESO_SECTOR:
      return {
        siteId,
        pointType: 'RIC_INGRESO',
        pointLabel: 'Ingreso Ricardone',
        logicalCode: 'INGRESO',
        operationalPoint: 'INGRESO',
      }
    case RIC_PREINGRESO_SECTOR:
      return {
        siteId,
        pointType: 'RIC_PREINGRESO',
        pointLabel: 'Preingreso / Calada Ricardone',
        logicalCode: 'PREINGRESO',
        operationalPoint: 'PREINGRESO',
      }
    case RIC_EGRESO_SECTOR:
      return {
        siteId,
        pointType: 'RIC_EGRESO',
        pointLabel: 'Egreso Ricardone',
        logicalCode: 'EGRESO',
        operationalPoint: 'EGRESO',
      }
    case RIC_VOLCABLE_1:
      return {
        siteId,
        pointType: 'RIC_VOLCABLE_1',
        pointLabel: 'Volcable 1',
        logicalCode: 'VOLCABLE',
        operationalPoint: 'VOLCABLE_1',
      }
    case RIC_VOLCABLE_2:
      return {
        siteId,
        pointType: 'RIC_VOLCABLE_2',
        pointLabel: 'Volcable 2',
        logicalCode: 'VOLCABLE',
        operationalPoint: 'VOLCABLE_2',
      }
    case RIC_BALANZA:
      if (device.includes('ingreso'))
        return {
          siteId,
          pointType: 'RIC_BALANZA_INGRESO',
          pointLabel: 'Balanza ingreso',
          logicalCode: 'BALANZA_INGRESO',
          operationalPoint: 'BALANZA_INGRESO',
        }
      if (device.includes('egreso'))
        return {
          siteId,
          pointType: 'RIC_BALANZA_EGRESO',
          pointLabel: 'Balanza egreso',
          logicalCode: 'BALANZA_EGRESO',
          operationalPoint: 'BALANZA_EGRESO',
        }
      return {
        siteId,
        pointType: 'RIC_BALANZA_DESCONOCIDA',
        pointLabel: 'Balanza sin dirección',
        logicalCode: 'BALANZA',
        operationalPoint: 'BALANZA',
      }
    case 'RICARDONE_CELDA_16':
      return {
        siteId,
        pointType: 'RIC_CELDA_16',
        pointLabel: 'Celda 16',
        logicalCode: 'CELDA_16',
        operationalPoint: 'CELDA_16',
      }
    case SL_INGRESO_SECTOR:
      return {
        siteId,
        pointType: 'SL_INGRESO',
        pointLabel: 'Ingreso San Lorenzo',
        logicalCode: 'SL_INGRESO',
        operationalPoint: 'SL_INGRESO',
      }
    default:
      // Heurística operativa: algunas cámaras de recepción en Volcable pueden llegar
      // con sector/device no mapeado y caer como UNKNOWN. Si hay evidencia textual
      // de volcable, se normaliza como punto VOLCABLE válido.
      if (sectorU.includes('VOLCABLE') || sectorU.includes('VOLC') || device.includes('volc')) {
        return {
          siteId,
          pointType: 'RIC_VOLCABLE_INFERIDO',
          pointLabel: 'Volcable (inferido por cámara/sector)',
          logicalCode: 'VOLCABLE',
          operationalPoint: 'VOLCABLE_INFERRED',
        }
      }
      if (sectorU.includes('CELDA_16')) {
        return {
          siteId,
          pointType: 'RIC_CELDA_16',
          pointLabel: 'Celda 16',
          logicalCode: 'CELDA_16',
          operationalPoint: 'CELDA_16',
        }
      }
      return {
        siteId,
        pointType: 'DESCONOCIDO',
        pointLabel: 'Punto sin regla conocida',
        logicalCode: 'UNKNOWN',
        operationalPoint: 'UNKNOWN',
      }
  }
}
