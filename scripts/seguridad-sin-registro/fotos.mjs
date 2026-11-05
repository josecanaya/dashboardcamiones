// Foto de escena del DSS para cada paso de los vehículos de listar.cjs, directo al DSS (no necesita el 8787).
// Uso: node scripts/seguridad-sin-registro/fotos.mjs <sinreg.json> <carpeta salida> [PATENTE,PATENTE…]
// Deja <salida>/<día>_<patente>_<n>.jpg (960 px) y <salida>/veh.json con lo que leyó el DSS en cada paso
// (patente, tipo, marca, color). La hora del paso es la del feed: la cámara marca 240 s menos.
import '../../server/load-env.mjs'
import fs from 'node:fs'
import sharp from 'sharp'
import { createDssLiveRouter } from '../../server/dss-live.mjs'

const [inFile, outDir, keep] = process.argv.slice(2)
const dss = createDssLiveRouter({ projectRoot: process.cwd() })
fs.mkdirSync(outDir, { recursive: true })
const veh = JSON.parse(fs.readFileSync(inFile, 'utf8')).filter((v) => !keep || keep.split(',').includes(v.plate))
for (const v of veh) for (const [i, p] of v.pasos.entries()) {
  const f = `${v.dia}_${v.plate}_${i}.jpg`
  try {
    const r = await dss.findVehicleCapture(p.device, Date.parse(p.at) - 240_000, v.plate)
    if (!r?.scenePicture) { console.log('sin foto', v.plate, p.device, p.at); continue }
    const { buf } = await dss.fetchPicture(r.scenePicture)
    await sharp(buf).resize(960, 960, { fit: 'inside' }).jpeg({ quality: 68 }).toFile(`${outDir}/${f}`)
    Object.assign(p, { foto: f, leyoDss: r.plate, marca: r.vehicleBrand, color: r.vehicleColor, tipo: r.vehicleCategory })
  } catch (e) {
    console.log('error', v.plate, e instanceof Error ? e.message : e)
  }
}
fs.writeFileSync(`${outDir}/veh.json`, JSON.stringify(veh, null, 1))
console.log('listo', veh.length, 'vehículos')
process.exit(0)
