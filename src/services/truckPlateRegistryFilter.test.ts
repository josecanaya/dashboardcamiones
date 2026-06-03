import { describe, expect, it } from 'vitest'
import type { TruckPlateRegistryDocument } from '../domain/truckPlateRegistry'
import { filterEventsByPlateRegistry } from './truckPlateRegistryFilter'
import type { RealJourneyEventDto } from './realJourneyEvents.types'

function ev(plate: string): RealJourneyEventDto {
  return {
    id: '1',
    journeyUid: 'j1',
    occurredAt: '2026-06-01T10:00:00',
    truckPlate: plate,
    normalizedPlate: plate.replace(/\s/g, '').toUpperCase(),
    isValidPlate: true,
    deviceCode: 'dev',
    sectorCode: 'RICARDONE_INGRESO',
  } as RealJourneyEventDto
}

const doc: TruckPlateRegistryDocument = {
  version: 1,
  updatedAt: '2026-06-01T00:00:00Z',
  entries: [
    {
      id: 'a1',
      plate: 'ABC123',
      category: 'prestador_servicio',
      active: true,
      excludeFromAnalytics: true,
      createdAt: '2026-06-01',
      updatedAt: '2026-06-01',
    },
  ],
}

describe('filterEventsByPlateRegistry', () => {
  it('excluye eventos de patentes catalogadas', () => {
    const r = filterEventsByPlateRegistry([ev('ABC 123'), ev('ZZ999ZZ')], doc)
    expect(r.kept).toHaveLength(1)
    expect(r.excluded).toHaveLength(1)
    expect(r.byPlate.get('ABC123')).toBe(1)
  })

  it('sin catálogo devuelve todo', () => {
    const r = filterEventsByPlateRegistry([ev('ABC123')], null)
    expect(r.kept).toHaveLength(1)
    expect(r.excluded).toHaveLength(0)
  })
})
