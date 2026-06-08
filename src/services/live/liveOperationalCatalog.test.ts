import { describe, expect, it } from 'vitest'
import {
  getLiveSectorEntries,
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
    expect(lookupCanonicalSectorByDevice('RenCargFte')).toBe('PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1')
    expect(lookupCanonicalSectorByDevice('RenDescTras')).toBe('PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1')
  })

  it('infiera planta Renova líquidos como San Lorenzo', () => {
    expect(inferLiveMonitorSiteId('1-S10', 'RenDescFte')).toBe('san_lorenzo')
  })
})

describe('getLiveSectorEntries San Lorenzo líquidos S10', () => {
  it('incluye sector líquidos punto 1 con las 4 cámaras Renova', () => {
    const entry = getLiveSectorEntries('san_lorenzo').find(
      (e) => e.kind === 'sector' && e.sectorCode === 'PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1'
    )
    expect(entry?.kind).toBe('sector')
    if (entry?.kind !== 'sector') return
    expect(entry.devices).toEqual(['RenCargFte', 'RenCargTras', 'RenDescFte', 'RenDescTras'])
    expect(entry.label).toMatch(/líquidos punto 1/i)
  })
})
