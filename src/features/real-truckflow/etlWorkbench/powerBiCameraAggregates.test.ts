import { describe, expect, it } from 'vitest'
import {
  buildCameraPowerBiAggregates,
  cameraAggregateStatus,
  ratePer100Events,
} from './powerBiCameraAggregates'

describe('powerBiCameraAggregates', () => {
  it('status Sin base cuando hay LPR sin eventos', () => {
    expect(cameraAggregateStatus(0, 3)).toBe('Sin base')
  })

  it('recalcula tasas sobre totales agregados, no promedia filas', () => {
    const granular = [
      {
        date: '2026-05-12',
        time_bucket: '08-11',
        day_night: 'dia',
        deviceCode: 'CamA',
        sectorCode: 'SEC1',
        camera_type: 'front',
        event_count: '10',
        alert_count_total: '2',
        alert_lpr_count: '1',
      },
      {
        date: '2026-05-12',
        time_bucket: '12-15',
        day_night: 'dia',
        deviceCode: 'CamA',
        sectorCode: 'SEC1',
        camera_type: 'front',
        event_count: '10',
        alert_count_total: '0',
        alert_lpr_count: '1',
      },
    ]
    const out = buildCameraPowerBiAggregates(granular)
    expect(out.rowCounts.camera_summary).toBe(1)
    expect(out.csv.camera_summary).toContain('CamA')
    expect(ratePer100Events(2, 20)).toBe(10)
    expect(out.csv.camera_summary).toContain(',10,')
    expect(out.rowCounts.camera_daynight_summary).toBe(1)
    expect(out.rowCounts.sector_camera_summary).toBe(1)
  })
})
