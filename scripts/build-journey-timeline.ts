/**
 * Genera la tabla `journey_timeline` de una corrida ya guardada: cada evento de
 * cámara con su HORA real y su punto lógico, agrupado por journey.
 *
 * patente · día · [evento1@hora · evento2@hora · …] — así se conoce el journey.
 *
 * Reusa la MISMA función del ETL (`normalizeRealEventPoint`) para el punto
 * lógico; no duplica reglas. Lee los eventos crudos que la corrida ya declara en
 * su manifest y escribe `runs/windows/<id>/tables/journey_timeline.json`, que el
 * endpoint genérico de tablas sirve solo (con filtro ?col=journey_uid&eq=…).
 *
 * Uso: npx tsx scripts/build-journey-timeline.ts --run 2026-07-13_2026-07-19
 *      npx tsx scripts/build-journey-timeline.ts --all
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parsePayloadToJourneyEvents } from '../src/services/realJourneyEventsDataSource.ts'
import { normalizeRealEventPoint } from '../src/etl-core/domain/eventNormalization.ts'
import type { RealJourneyEventDto } from '../src/services/realJourneyEvents.types.ts'

const RUNS = resolve('runs', 'windows')

function dayOf(iso: string): string {
  return String(iso ?? '').slice(0, 10)
}

async function buildForRun(runId: string): Promise<number> {
  const runDir = join(RUNS, runId)
  const manifestPath = join(runDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`[timeline] sin manifest: ${runId}`)
    return 0
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const paths: string[] = manifest?.input?.eventsPaths ?? []

  const events: RealJourneyEventDto[] = []
  for (const p of paths) {
    if (!existsSync(p)) continue
    const raw = JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))
    events.push(...(await parsePayloadToJourneyEvents(raw)))
  }

  const rows = events
    .map((e) => {
      const norm = normalizeRealEventPoint(e)
      const uid = String(e.journeyUid ?? '')
      return {
        journey_uid: uid,
        // El ETL fusiona journeys crudos en `merged_<A>__<B>`, donde A/B son los
        // primeros 12 chars del UID crudo. `short_uid` permite religar la
        // timeline (eventos crudos) con el journey merged de final_circuits.
        short_uid: uid.slice(0, 12),
        plate: String(e.normalizedPlate || e.truckPlate || ''),
        day: dayOf(e.occurredAt),
        sequence_number: Number(e.sequenceNumber ?? 0),
        occurred_at: String(e.occurredAt ?? ''),
        device_code: String(e.deviceCode ?? ''),
        sector_code: String(e.sectorCode ?? ''),
        logical_code: norm.logicalCode,
        point_label: norm.pointLabel,
        site: norm.siteId,
      }
    })
    .filter((r) => r.journey_uid)
    .sort((a, b) =>
      a.journey_uid === b.journey_uid
        ? a.sequence_number - b.sequence_number || a.occurred_at.localeCompare(b.occurred_at)
        : a.journey_uid.localeCompare(b.journey_uid)
    )

  const headers = [
    'journey_uid',
    'short_uid',
    'plate',
    'day',
    'sequence_number',
    'occurred_at',
    'device_code',
    'sector_code',
    'logical_code',
    'point_label',
    'site',
  ]
  const outPath = join(runDir, 'tables', 'journey_timeline.json')
  writeFileSync(outPath, JSON.stringify({ headers, rows }, null, 0))
  console.log(`[timeline] ${runId}: ${rows.length} eventos → ${outPath}`)
  return rows.length
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--all')) {
    for (const id of readdirSync(RUNS)) {
      if (existsSync(join(RUNS, id, 'manifest.json'))) await buildForRun(id)
    }
    return
  }
  const i = argv.indexOf('--run')
  const runId = i >= 0 ? argv[i + 1] : ''
  if (!runId) {
    console.error('Uso: --run <runId>  |  --all')
    process.exit(1)
  }
  await buildForRun(runId)
}

main()
