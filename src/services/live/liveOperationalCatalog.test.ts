import { describe, expect, it } from 'vitest'
import {
  inferLiveMonitorSiteId,
  isCanonicalLiveSectorCode,
  lookupCanonicalSectorByDevice,
  resolveCanonicalSectorForLiveFeed,
} from './liveOperationalCatalog'

describe('resolveCanonicalSectorForLiveFeed', () => {
  it('conserva sectorCode canónico', () => {
    expect(
      resolveCanonicalSectorForLiveFeed('RICARDONE_INGRESO_CAMIONES', 'RicIngCamFrente')
    ).toBe('RICARDONE_INGRESO_CAMIONES')
  })

  it('resuelve sectorCode corto de Truckflow vía deviceCode', () => {
    expect(resolveCanonicalSectorForLiveFeed('1-S1', 'SLZBalIngFte')).toBe(
      'PUERTO_SAN_LORENZO_BALANZA_INGRESO'
    )
    expect(resolveCanonicalSectorForLiveFeed('2-S0', 'RicIngCamFrente')).toBe('RICARDONE_INGRESO_CAMIONES')
  })

  it('infiera planta por device cuando sectorCode es corto', () => {
    expect(inferLiveMonitorSiteId('1-S7', 'SLZSalidaC1Fte')).toBe('san_lorenzo')
    expect(inferLiveMonitorSiteId('2-S2', 'RicCal05')).toBe('ricardone')
  })
})

describe('isCanonicalLiveSectorCode', () => {
  it('detecta códigos largos y rechaza cortos', () => {
    expect(isCanonicalLiveSectorCode('PUERTO_SAN_LORENZO_EGRESO_CAMIONES')).toBe(true)
    expect(isCanonicalLiveSectorCode('1-S7')).toBe(false)
  })
})

describe('lookupCanonicalSectorByDevice', () => {
  it('mapea dispositivos Ricardone y San Lorenzo', () => {
    expect(lookupCanonicalSectorByDevice('RicB2Egreso')).toBe('RICARDONE_BALANZA')
    expect(lookupCanonicalSectorByDevice('SLZIngCamFrente')).toBe('PUERTO_SAN_LORENZO_INGRESO_CAMIONES')
  })
})
