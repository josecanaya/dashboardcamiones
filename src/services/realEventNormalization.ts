/**
 * Capa: normalización — punto lógico operativo y sitio desde sector/dispositivo.
 * Núcleo para reconstrucción y clasificación; no depende de UI.
 */
import type { RealJourneyEventDto, ReconstructedRealSiteId } from './realJourneyEvents.types'

import {
  lookupSanLorenzoCameraByDevice,
  lookupSanLorenzoSectorFallback,
} from '../data/sanLorenzoCameraCatalog'

const RIC_INGRESO_SECTOR = 'RICARDONE_INGRESO_CAMIONES'
const RIC_PREINGRESO_SECTOR = 'RICARDONE_PREINGRESO'
const RIC_CALADA_SECTOR = 'RICARDONE_CALADA'
const RIC_EGRESO_SECTOR = 'RICARDONE_EGRESO_CAMIONES'
const RIC_VOLCABLE_1 = 'RICARDONE_VOLCABLE_1'
const RIC_VOLCABLE_2 = 'RICARDONE_VOLCABLE_2'
const RIC_BALANZA = 'RICARDONE_BALANZA'
const SL_INGRESO_SECTOR = 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES'

const RIC_DEVICE_POINT_MAP: Record<string, { logicalCode: string; pointLabel: string; pointType: string; operationalPoint: string }> = {
  RicIngCamFrente: {
    logicalCode: 'INGRESO',
    pointLabel: 'Ingreso Ricardone',
    pointType: 'RIC_INGRESO',
    operationalPoint: 'INGRESO',
  },
  RicIngCamTrasera: {
    logicalCode: 'INGRESO_TRASERA_EXCLUIDA',
    pointLabel: 'Ingreso trasera excluida',
    pointType: 'RIC_INGRESO_TRASERA_EXCLUIDA',
    operationalPoint: 'INGRESO_TRASERA_EXCLUIDA',
  },
  RicPreIngInFr: {
    logicalCode: 'PREINGRESO',
    pointLabel: 'Preingreso Ricardone',
    pointType: 'RIC_PREINGRESO',
    operationalPoint: 'PREINGRESO',
  },
  RicPreIngInTr: {
    logicalCode: 'PREINGRESO_TRASERA_EXCLUIDA',
    pointLabel: 'Preingreso trasera excluida',
    pointType: 'RIC_PREINGRESO_TRASERA_EXCLUIDA',
    operationalPoint: 'PREINGRESO_TRASERA_EXCLUIDA',
  },
  RicPreIngEgFr: {
    logicalCode: 'PREINGRESO_EGRESO',
    pointLabel: 'Preingreso egreso Ricardone',
    pointType: 'RIC_PREINGRESO_EGRESO',
    operationalPoint: 'PREINGRESO_EGRESO',
  },
  RicPreIngEgTr: {
    logicalCode: 'PREINGRESO_EGRESO_TRASERA',
    pointLabel: 'Preingreso egreso trasera',
    pointType: 'RIC_PREINGRESO_EGRESO_TRASERA',
    operationalPoint: 'PREINGRESO_EGRESO_TRASERA',
  },
  RicEgrCamFrente: {
    logicalCode: 'EGRESO',
    pointLabel: 'Egreso Ricardone',
    pointType: 'RIC_EGRESO',
    operationalPoint: 'EGRESO',
  },
  RicEgrCamTraser: {
    logicalCode: 'EGRESO_TRASERA_EXCLUIDA',
    pointLabel: 'Egreso trasera excluida',
    pointType: 'RIC_EGRESO_TRASERA_EXCLUIDA',
    operationalPoint: 'EGRESO_TRASERA_EXCLUIDA',
  },
  RicB1Ingreso: {
    logicalCode: 'BALANZA_INGRESO',
    pointLabel: 'Balanza ingreso',
    pointType: 'RIC_BALANZA_INGRESO',
    operationalPoint: 'BALANZA_INGRESO',
  },
  RicB2Ingreso: {
    logicalCode: 'BALANZA_INGRESO',
    pointLabel: 'Balanza ingreso',
    pointType: 'RIC_BALANZA_INGRESO',
    operationalPoint: 'BALANZA_INGRESO',
  },
  RicB3Ingreso: {
    logicalCode: 'BALANZA_INGRESO',
    pointLabel: 'Balanza ingreso',
    pointType: 'RIC_BALANZA_INGRESO',
    operationalPoint: 'BALANZA_INGRESO',
  },
  RicB1Egreso: {
    logicalCode: 'BALANZA_EGRESO',
    pointLabel: 'Balanza egreso',
    pointType: 'RIC_BALANZA_EGRESO',
    operationalPoint: 'BALANZA_EGRESO',
  },
  RicB2Egreso: {
    logicalCode: 'BALANZA_EGRESO',
    pointLabel: 'Balanza egreso',
    pointType: 'RIC_BALANZA_EGRESO',
    operationalPoint: 'BALANZA_EGRESO',
  },
  RicB3Egreso: {
    logicalCode: 'BALANZA_EGRESO',
    pointLabel: 'Balanza egreso',
    pointType: 'RIC_BALANZA_EGRESO',
    operationalPoint: 'BALANZA_EGRESO',
  },
  RicC16Carga1: {
    logicalCode: 'CELDA16_CARGA',
    pointLabel: 'Carga Celda 16',
    pointType: 'RIC_CELDA16_CARGA',
    operationalPoint: 'CELDA16_CARGA',
  },
  RicC16Carga2: {
    logicalCode: 'CELDA16_CARGA',
    pointLabel: 'Carga Celda 16',
    pointType: 'RIC_CELDA16_CARGA',
    operationalPoint: 'CELDA16_CARGA',
  },
  RicC16Descarga1: {
    logicalCode: 'CELDA16_DESCARGA',
    pointLabel: 'Descarga Celda 16',
    pointType: 'RIC_CELDA16_DESCARGA',
    operationalPoint: 'CELDA16_DESCARGA',
  },
  RicC16Descarga2: {
    logicalCode: 'CELDA16_DESCARGA',
    pointLabel: 'Descarga Celda 16',
    pointType: 'RIC_CELDA16_DESCARGA',
    operationalPoint: 'CELDA16_DESCARGA',
  },
  RicVolcable1: {
    logicalCode: 'VOLCABLE',
    pointLabel: 'Volcable 1/2',
    pointType: 'RIC_VOLCABLE',
    operationalPoint: 'VOLCABLE',
  },
  RicVolcable2: {
    logicalCode: 'VOLCABLE',
    pointLabel: 'Volcable 1/2',
    pointType: 'RIC_VOLCABLE',
    operationalPoint: 'VOLCABLE',
  },
  RicCal01: {
    logicalCode: 'CALADA',
    pointLabel: 'Calada Ricardone',
    pointType: 'RIC_CALADA',
    operationalPoint: 'CALADA',
  },
  RicCal02: {
    logicalCode: 'CALADA',
    pointLabel: 'Calada Ricardone',
    pointType: 'RIC_CALADA',
    operationalPoint: 'CALADA',
  },
  RicCal03: {
    logicalCode: 'CALADA',
    pointLabel: 'Calada Ricardone',
    pointType: 'RIC_CALADA',
    operationalPoint: 'CALADA',
  },
  RicCal04: {
    logicalCode: 'CALADA',
    pointLabel: 'Calada Ricardone',
    pointType: 'RIC_CALADA',
    operationalPoint: 'CALADA',
  },
  RicCal05: {
    logicalCode: 'CALADA',
    pointLabel: 'Calada Ricardone',
    pointType: 'RIC_CALADA',
    operationalPoint: 'CALADA',
  },
  RicCalLiq: {
    logicalCode: 'LIQUIDO',
    pointLabel: 'Líquidos Ricardone',
    pointType: 'RIC_LIQUIDO',
    operationalPoint: 'LIQUIDO',
  },
}

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

function lookupRicDevicePoint(deviceRaw: string) {
  const trimmed = deviceRaw.trim()
  if (!trimmed) return undefined
  const direct = RIC_DEVICE_POINT_MAP[trimmed]
  if (direct) return direct
  const lower = trimmed.toLowerCase()
  const key = Object.keys(RIC_DEVICE_POINT_MAP).find((k) => k.toLowerCase() === lower)
  return key ? RIC_DEVICE_POINT_MAP[key] : undefined
}

/** Punto semántico único por evento (sector + dirección balanza cuando aplica). */
export function normalizeRealEventPoint(event: RealJourneyEventDto): NormalizedRealEventPoint {
  const sector = (event.sectorCode ?? '').trim()
  const sectorU = sector.toUpperCase()
  const deviceRaw = event.deviceCode ?? ''
  const device = deviceRaw.toLowerCase()

  const slDevice = lookupSanLorenzoCameraByDevice(deviceRaw.trim())
  if (slDevice) {
    return {
      siteId: 'san_lorenzo',
      pointType: `SL_${slDevice.logicalSector}`,
      pointLabel: slDevice.label,
      logicalCode: slDevice.logicalCode,
      operationalPoint: slDevice.logicalCode,
    }
  }

  const devicePoint = lookupRicDevicePoint(deviceRaw)
  const siteId = devicePoint ? 'ricardone' : inferSiteLocal(sector)

  if (devicePoint) {
    return {
      siteId,
      ...devicePoint,
    }
  }

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
        pointLabel: 'Preingreso Ricardone',
        logicalCode: 'PREINGRESO',
        operationalPoint: 'PREINGRESO',
      }
    case RIC_CALADA_SECTOR:
      return {
        siteId,
        pointType: 'RIC_CALADA',
        pointLabel: 'Calada Ricardone',
        logicalCode: 'CALADA',
        operationalPoint: 'CALADA',
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
        logicalCode: 'CELDA16_DESCARGA',
        operationalPoint: 'CELDA16_DESCARGA',
      }
    case SL_INGRESO_SECTOR: {
      const fb = lookupSanLorenzoSectorFallback(sectorU)
      return {
        siteId: 'san_lorenzo',
        pointType: 'SL_INGRESO',
        pointLabel: fb?.label ?? 'Ingreso San Lorenzo',
        logicalCode: fb?.logicalCode ?? 'SL_INGRESO',
        operationalPoint: fb?.logicalCode ?? 'SL_INGRESO',
      }
    }
    default: {
      const fb = lookupSanLorenzoSectorFallback(sectorU)
      if (fb) {
        return {
          siteId: 'san_lorenzo',
          pointType: `SL_${fb.logicalSector}`,
          pointLabel: fb.label,
          logicalCode: fb.logicalCode,
          operationalPoint: fb.logicalCode,
        }
      }
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
          logicalCode: 'CELDA16_DESCARGA',
          operationalPoint: 'CELDA16_DESCARGA',
        }
      }
      if (sectorU.includes('CALADA') || device.includes('riccal') || device.includes('ric cal')) {
        return {
          siteId,
          pointType: 'RIC_CALADA',
          pointLabel: 'Calada Ricardone',
          logicalCode: 'CALADA',
          operationalPoint: 'CALADA',
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
}
