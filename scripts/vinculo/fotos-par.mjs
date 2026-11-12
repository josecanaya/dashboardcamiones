// Foto propia de un camión (frontal del puerto o de Ricardone) y foto de una captura candidata, lado a lado, para validar
// a mano una asignación del lote. Dos consultas al DSS (datos + foto) por imagen.
// node scripts/vinculo/fotos-par.mjs <cobertura.json> <patente> <cámara> <hora ISO del feed> <salida.jpg>
import '../../server/load-env.mjs'
import fs from 'node:fs'
import sharp from 'sharp'
import { createDssLiveRouter } from '../../server/dss-live.mjs'
const [cobF, plate, cam, at, out] = process.argv.slice(2)
const dss = createDssLiveRouter({ projectRoot: process.cwd() })
const t = JSON.parse(fs.readFileSync(cobF, 'utf8')).camiones.find((x) => x.plate === plate || x.plates.includes(plate))
const own = ['SLZBalIngFte', 'SLZIngCamFrente', 'SLZBalSC2Fte', 'SLZBalSC1Fte', 'SLZSalidaC1Fte', 'RicEgrCamFrente', 'RicCal04', 'RicCal03'].map((c) => t.lecturas.find((l) => l.camara === c && l.fuente === 'feed')).find(Boolean)
const get = async (dev, iso, p) => { const r = await dss.findVehicleCapture(dev, Date.parse(iso) - 240_000, p); return r?.scenePicture ? (await dss.fetchPicture(r.scenePicture)).buf : null }
const a = own ? await get(own.camara, own.at, own.patente) : null
const b = await get(cam, at, '')
const img = async (buf, label) => sharp(buf ?? { create: { width: 640, height: 380, channels: 3, background: '#444' } }).resize(640, 380, { fit: 'contain' }).composite([{ input: Buffer.from(`<svg width="640" height="30"><rect width="640" height="30" fill="black"/><text x="8" y="21" font-size="18" fill="yellow" font-family="Arial">${label}</text></svg>`), top: 0, left: 0 }]).jpeg().toBuffer()
const A = await img(a, `${plate} propia ${own?.camara ?? '-'} ${own ? new Date(Date.parse(own.at) - 3 * 3600e3).toISOString().slice(11, 16) : ''}`)
const B = await img(b, `candidata ${cam} ${new Date(Date.parse(at) - 3 * 3600e3).toISOString().slice(11, 16)}`)
await sharp({ create: { width: 1280, height: 380, channels: 3, background: '#000' } }).composite([{ input: A, left: 0, top: 0 }, { input: B, left: 640, top: 0 }]).jpeg({ quality: 75 }).toFile(out)
console.log('ok', out)
process.exit(0)
