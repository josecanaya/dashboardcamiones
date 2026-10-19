import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { resolve } from 'path'
const dss = createDssLiveRouter({ projectRoot: resolve(import.meta.dirname, '../..') })
console.log('configurado', dss.isDssConfigured())
const ing = Date.parse('2026-08-10T21:45:00-03:00') // DGC830
const r = await dss.listVehicleCaptures('RicPreIngInFr', ing - 9 * 60e3, ing + 1 * 60e3)
for (const x of r) console.log(new Date(Date.parse(x.at) - 3 * 3600e3).toISOString().slice(11, 19), JSON.stringify(x.plate), x.confidence, x.vehicleCategory, x.scenePicture ? 'foto' : '-')
process.exit(0)
