#!/usr/bin/env node
/**
 * Smoke del endpoint Plant State del server local.
 * Valida la forma del snapshot (no los valores).
 * Requiere el server arriba: npm run server:truckflow
 */

const PORT = Number(process.env.TRUCKFLOW_LOCAL_SERVER_PORT || 8787)
const BASE = `http://127.0.0.1:${PORT}`

async function main() {
  let res
  try {
    res = await fetch(`${BASE}/api/truckflow/live/plant-state?site=ricardone`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    console.error(`FAIL: no hay conexión con ${BASE}. Levantá el server: npm run server:truckflow`)
    console.error(String(e))
    process.exit(1)
  }
  if (res.status !== 200) {
    const body = await res.text().catch(() => '')
    console.error(`FAIL: /api/truckflow/live/plant-state devolvió HTTP ${res.status}`)
    console.error(body.slice(0, 400))
    process.exit(1)
  }
  const body = await res.json()
  const problems = []
  if (!body.plant || typeof body.plant !== 'object') problems.push('falta plant')
  if (!Array.isArray(body.sectors)) problems.push('falta sectors[]')
  if (!Array.isArray(body.edges)) problems.push('falta edges[]')
  if (body.plant && typeof body.plant.trucksInPlant !== 'number') {
    problems.push('plant.trucksInPlant debe ser number')
  }
  if (Array.isArray(body.sectors)) {
    for (const s of body.sectors) {
      if (typeof s.sectorCode !== 'string') problems.push('sector sin sectorCode')
      if (typeof s.present !== 'number') problems.push(`sector ${s.sectorCode}: present`)
      if (typeof s.status !== 'string') problems.push(`sector ${s.sectorCode}: status`)
    }
    const presentSum = body.sectors.reduce((a, s) => a + (s.present || 0), 0)
    if (body.plant && presentSum !== body.plant.trucksInPlant) {
      problems.push(`suma present (${presentSum}) !== trucksInPlant (${body.plant.trucksInPlant})`)
    }
  }
  if (problems.length > 0) {
    console.error('FAIL: shape inesperado de /live/plant-state:', problems.join('; '))
    console.error(JSON.stringify(body, null, 2).slice(0, 800))
    process.exit(1)
  }
  console.log(
    'OK /api/truckflow/live/plant-state:',
    JSON.stringify({
      site: body.site,
      trucksInPlant: body.plant.trucksInPlant,
      sectors: body.sectors.length,
      edges: body.edges.length,
    })
  )
}

await main()
