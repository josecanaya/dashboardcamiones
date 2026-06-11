import { describe, expect, it } from 'vitest'
import {
  buildCliWorkbenchInputsFromJourneys,
  readEventRecordsFromLocalJsonFile,
} from './contractFirstCliAdapter'

describe('contractFirstCliAdapter', () => {
  it('readEventRecordsFromLocalJsonFile extrae records', async () => {
    const json = JSON.stringify({ records: [{ journeyUid: 'a', truckPlate: 'AB123CD' }] })
    const rows = await readEventRecordsFromLocalJsonFile(json)
    expect(rows).toHaveLength(1)
  })

  it('buildCliWorkbenchInputsFromJourneys arma journey_uid y tiempos', () => {
    const { finalCsvRows, journeyTimesByUid } = buildCliWorkbenchInputsFromJourneys([
      {
        journeyUid: 'uid-1',
        plate: 'AB123CD',
        normalizedPlate: 'AB123CD',
        isValidPlate: true,
        startedAt: '2026-06-04T10:00:00.000Z',
        endedAt: '2026-06-04T11:00:00.000Z',
        durationMinutes: 60,
        eventCount: 2,
        siteId: 'ricardone',
        day: '2026-06-04',
        rawSectorSequence: [],
        logicalSectorSequence: [],
        unmappedSectorCodes: [],
        rawDeviceSequence: [],
        deviceCodeSequence: [],
        normalizedPointSequence: [],
        logicalCodeSequence: ['INGRESO', 'EGRESO'],
        events: [],
        preliminaryCircuitCode: 'X',
        preliminaryCircuitName: 'Test',
        preliminaryCircuitConfidence: 'high',
        preliminaryCircuitReason: '',
        preliminaryCircuitGroup: 'COMPLETO',
        preliminaryCircuitVariant: '',
        missingExpectedPoints: [],
        excludedRearCameraEventsCount: 0,
        classificationReason: '',
        isDiscardedOperational: false,
        feedsOperationalAnalytics: true,
        qualityFlags: [],
        isCompleteMinimal: true,
        isSuspiciousLong: false,
      } as never,
    ])
    expect(finalCsvRows[0]!.journey_uid).toBe('uid-1')
    expect(journeyTimesByUid.get('uid-1')?.start).toBe('2026-06-04T10:00:00.000Z')
    expect(finalCsvRows[0]!.cli_reconstruction).toBe('contract_first_cli_v1')
  })
})
