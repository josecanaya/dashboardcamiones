import { createDssLiveRouter } from '../../server/dss-live.mjs'
import { writeFileSync } from 'fs'
import { resolve, join } from 'path'
const dss = createDssLiveRouter({ projectRoot: resolve(import.meta.dirname, '../..') })
const out = resolve(import.meta.dirname, '../../reportes/cruce-sistema-truckflow/sin-patente/vecinas')
for (const [tag, a, b] of [['EOV644', '2026-08-14T16:54:00-03:00', '2026-08-14T16:57:30-03:00'], ['AB723QC', '2026-08-29T05:32:30-03:00', '2026-08-29T05:35:00-03:00']]) {
  for (const dev of ['RicPreIngInFr']) {
    const caps = await dss.listVehicleCaptures(dev, Date.parse(a), Date.parse(b))
    for (const c of caps) {
      const h = new Date(Date.parse(c.at) - 3 * 3600e3).toISOString().slice(11, 19)
      console.log(tag, dev, h, JSON.stringify(c.plate), c.vehicleCategory, c.vehicleColor, c.vehicleBrand)
      if (c.scenePicture) writeFileSync(join(out, `${tag}_${h.replace(/:/g, '')}_${c.plate || 'vacia'}.jpg`), (await dss.fetchPicture(c.scenePicture)).buf)
    }
  }
}
process.exit(0)
