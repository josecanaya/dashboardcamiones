import { describe, expect, it } from 'vitest'
import { buildPlantVisitUpsertsFromTransform } from './truckPlantVisitSync'
import type { EtlTransformOutput } from './etlTransformPipeline'

function minimalOut(csv: Record<string, string>): EtlTransformOutput {
  return {
    csv,
    stats: {} as EtlTransformOutput['stats'],
    rulesVersion: 'test',
  }
}

describe('buildPlantVisitUpsertsFromTransform', () => {
  it('mapea filas merged con producto y journey', () => {
    const csv =
      'journey_uid,plate_normalized,start_time,end_time,planta_normalized,product_normalized,merge_status,final_status\n' +
      'j1,ABC123,2026-06-17T08:00:00-03:00,2026-06-17T10:00:00-03:00,RICARDONE,SOJA,MATCH_EXACT,\n'
    const visits = buildPlantVisitUpsertsFromTransform(minimalOut({ merged_truckflow_movimientos: csv }))
    expect(visits).toHaveLength(1)
    expect(visits[0]?.plateNormalized).toBe('ABC123')
    expect(visits[0]?.producto).toBe('SOJA')
    expect(visits[0]?.productoOrigen).toBe('contrato')
    expect(visits[0]?.fuente).toBe('mixto')
  })

  it('usa debug_matrix si solo hay final_circuits', () => {
    const final =
      'journey_uid,normalized_plate,truck_plate,final_status,analysis_scope\n' +
      'j9,ZZ999ZZ,ZZ999ZZ,circuito_completo,RICARDONE\n'
    const debug =
      'journey_id,first_event_at,last_event_at\n' +
      'j9,2026-06-18T09:00:00-03:00,2026-06-18T11:30:00-03:00\n'
    const visits = buildPlantVisitUpsertsFromTransform(
      minimalOut({ final_circuits: final, debug_matrix_classification: debug })
    )
    expect(visits).toHaveLength(1)
    expect(visits[0]?.ingresoAt).toContain('2026-06-18')
    expect(visits[0]?.producto).toBeNull()
  })
})
