import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { runEtlTransform } from './etlTransformPipeline'
import { ETL_TRANSFORM_RULES_VERSION } from './etlTransformPipeline'
import { parsePayloadToJourneyEvents } from '../../../services/realJourneyEventsDataSource'

import fixtureEvents from '../../../../tests/fixtures/etl/s-events-slice.json'

function executiveFingerprint(ex: NonNullable<Awaited<ReturnType<typeof runEtlTransform>>['stats']['executive']>): string {
  const payload = {
    committeeCompletos: ex.committeeCompletos,
    committeeVariaciones: ex.committeeVariaciones,
    committeeAnomalias: ex.committeeAnomalias,
    completos: ex.completos,
    incompletos: ex.incompletos,
    anomalos: ex.anomalos,
    deducidos: ex.deducidos,
    noEvaluables: ex.noEvaluables,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

describe('etlGoldenMaster', () => {
  it('congela conteos y fingerprint ejecutivo en fixture S', async () => {
    const events = await parsePayloadToJourneyEvents(fixtureEvents)
    expect(events.length).toBeGreaterThan(0)

    const out = await runEtlTransform({
      events,
      alerts: [],
      mergeWindowHours: 4,
      loadedEventFilesCount: 1,
      loadedAlertFilesCount: 0,
    })

    expect(out.rulesVersion).toBe(ETL_TRANSFORM_RULES_VERSION)
    const ex = out.stats.executive
    expect(ex).toBeTruthy()

    const finalLines = Math.max(0, (out.csv.final_circuits || '').split(/\r?\n/).length - 1)

    expect({
      finalCircuitRowLines: finalLines,
      committeeCompletos: ex!.committeeCompletos,
      committeeVariaciones: ex!.committeeVariaciones,
      committeeAnomalias: ex!.committeeAnomalias,
      completos: ex!.completos,
      incompletos: ex!.incompletos,
      anomalos: ex!.anomalos,
      deducidos: ex!.deducidos,
      noEvaluables: ex!.noEvaluables,
      executiveFingerprint: executiveFingerprint(ex!),
    }).toMatchSnapshot()
  })

  it('congela hash de cada CSV de salida en fixture S', async () => {
    const events = await parsePayloadToJourneyEvents(fixtureEvents)
    const out = await runEtlTransform({
      events,
      alerts: [],
      mergeWindowHours: 4,
      loadedEventFilesCount: 1,
      loadedAlertFilesCount: 0,
    })
    const hashes: Record<string, string> = {}
    for (const key of Object.keys(out.csv).sort()) {
      let content = out.csv[key] ?? ''
      // transform_summary incluye generated_at (wall-clock); se neutraliza para el hash.
      if (key === 'transform_summary') {
        content = content.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<TIMESTAMP>')
      }
      hashes[key] = createHash('sha256').update(content).digest('hex').slice(0, 16)
    }
    expect(hashes).toMatchSnapshot()
  })
})
