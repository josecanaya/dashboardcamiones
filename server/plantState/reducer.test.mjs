/**
 * Gate T06 — reductor contra ventana del 2026-09-08.
 * Fuente de eventos: data/truckflow/2026-09-08/event-list.json
 * (las tablas de runs/windows/... no traen deviceCode/occurredAt crudos).
 *
 * Números de referencia (corte 14:32 ART, skew +206 min):
 *   trucksInPlant ≈ ver log del test
 *   suma present === trucksInPlant
 *   madrugada 03:00 < tarde 14:32
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reducePlantState } from './reducer.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const EVENT_PATH = path.join(ROOT, 'data/truckflow/2026-09-08/event-list.json')

function loadEvents() {
  const raw = JSON.parse(fs.readFileSync(EVENT_PATH, 'utf8'))
  const records = raw.records || raw.rows || []
  return records.map((r) => ({
    ...r,
    normalizedPlate: String(r.truckPlate || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase(),
    rawTruckPlate: r.truckPlate || '',
    isValidPlate: Boolean(r.truckPlate),
  }))
}

function msAt(iso) {
  return Date.parse(iso)
}

describe('reducePlantState contra 2026-09-08', () => {
  it('reproduce presencia coherente a las 14:32 y menor a las 03:00', () => {
    const events = loadEvents()
    expect(events.length).toBeGreaterThan(100)

    const corteTarde = msAt('2026-09-08T14:32:00-03:00')
    const snap = reducePlantState(events, corteTarde, { site: 'ricardone' })

    // Referencia observada en esta corrida (no hardcodear aserciones a valores exactos):
    // console: trucksInPlant, present sum, inflow/outflow
    // eslint-disable-next-line no-console
    console.log(
      'ref 14:32',
      JSON.stringify({
        trucksInPlant: snap.plant.trucksInPlant,
        presentSum: snap.sectors.reduce((s, x) => s + x.present, 0),
        inflow60: snap.plant.inflow60,
        outflow60: snap.plant.outflow60,
        balance60: snap.plant.balance60,
        top: snap.sectors
          .map((s) => `${s.sectorCode}:${s.present}`)
          .join(' '),
      })
    )

    expect(Number.isInteger(snap.plant.trucksInPlant)).toBe(true)
    expect(snap.plant.trucksInPlant).toBeGreaterThanOrEqual(0)
    expect(snap.plant.trucksInPlant).toBeLessThanOrEqual(400)

    const presentSum = snap.sectors.reduce((s, x) => s + x.present, 0)
    expect(presentSum).toBe(snap.plant.trucksInPlant)

    // Capacidad = densidad de tramo. En scale/gate/exit la presencia es “última LPR”,
    // no ocupación física simultánea — no validar capacity×1.2 ahí (diag T06).
    for (const s of snap.sectors) {
      if (s.capacity == null) continue
      if (s.type === 'scale' || s.type === 'gate' || s.type === 'exit') continue
      expect(s.present).toBeLessThanOrEqual(s.capacity * 1.2)
    }

    const balanza = snap.sectors.find((s) => s.sectorCode === 'RICARDONE_BALANZA')
    expect(balanza?.present).toBeLessThanOrEqual(balanza?.capacity ?? 14)

    expect(snap.plant.inflow60 - snap.plant.outflow60).toBe(snap.plant.balance60)

    const corteMadrugada = msAt('2026-09-08T03:00:00-03:00')
    const snapNight = reducePlantState(events, corteMadrugada, { site: 'ricardone' })
    // eslint-disable-next-line no-console
    console.log('ref 03:00', snapNight.plant.trucksInPlant)
    expect(snapNight.plant.trucksInPlant).toBeLessThan(snap.plant.trucksInPlant)
  })

  it('reparte el backlog por zona sin perder camiones', () => {
    const events = loadEvents()
    const snap = reducePlantState(events, msAt('2026-09-08T14:32:00-03:00'), { site: 'ricardone' })

    // eslint-disable-next-line no-console
    console.log(
      'ref zonas 14:32',
      snap.zones
        .filter((z) => z.backlog > 0)
        .map((z) => `${z.id}:${z.backlog}@${z.drainMinutes ?? '-'}min`)
        .join(' ')
    )

    // Invariante central: cada camión abierto está en exactamente una zona.
    const backlogSum = snap.zones.reduce((s, z) => s + z.backlog, 0)
    expect(backlogSum).toBe(snap.plant.trucksInPlant)

    // "Otros tramos" es la red de seguridad: si atrapa algo, falta declarar una zona.
    const zx = snap.zones.find((z) => z.id === 'ZX')
    expect(zx?.backlog ?? 0).toBe(0)

    // En horario de recepción, el grueso espera calada en Playa 1.
    const z2 = snap.zones.find((z) => z.id === 'Z2')
    expect(z2?.backlog ?? 0).toBeGreaterThan(0)
    expect(z2?.capacityOperational).toBe(450)

    // Playa 3 se mide contra el límite operativo (30), no contra el físico (141).
    const z6 = snap.zones.find((z) => z.id === 'Z6')
    expect(z6?.capacityOperational).toBe(30)
    expect(z6?.capacityPhysical).toBe(141)

    // Toda zona con tasa relevada tiene tiempo estimado; las demás, null y no cero.
    for (const z of snap.zones) {
      if (z.drainRatePerHour == null) expect(z.drainMinutes).toBeNull()
      else expect(typeof z.drainMinutes).toBe('number')
    }
  })
})
