// Recorrido completo de una patente en una ventana: todas las lecturas del feed y de las alertas del TruckFlow
// (las alertas traen traseras y cámaras que el feed no tiene), con lecturas parecidas (≤ 2 caracteres distintos)
// para ver si otra cámara la leyó mal. Si hay export del DSS (data/dss-export/<rango>/capturas.csv), sumarlo con --dss.
// Uso: node scripts/seguridad-sin-registro/recorrido.mjs PATENTE 2026-11-04T06:00 2026-11-04T13:00 [--dss data/dss-export/2026-11-02_03/capturas.csv]
// Horas locales (-03:00). Salida: hora del feed · cámara · lo que leyó · fuente.
import fs from 'node:fs'
import { alertReadEvents } from '../../server/plantState/alertReads.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'

const [plate, desde, hasta] = process.argv.slice(2)
const dssArg = process.argv.indexOf('--dss')
const a = Date.parse(`${desde}-03:00`)
const b = Date.parse(`${hasta}-03:00`)
const lev = (x, y) => {
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
  return d[x.length][y.length]
}
const hhmmss = (t) => new Date(t - 3 * 3600e3).toISOString().slice(11, 19)
const dias = new Set([desde.slice(0, 10), hasta.slice(0, 10)])
const out = []
for (const d of dias) {
  const read = (f) => { try { const j = JSON.parse(fs.readFileSync(`data/truckflow/${d}/${f}`, 'utf8')); return Array.isArray(j) ? j : j.records ?? [] } catch { return [] } }
  const ev = read('event-list.json')
  for (const [src, l] of [['feed', ev], ['alerta', alertReadEvents(read('alert-list.json'), [])]]) {
    for (const e of l) {
      const r = String(e.truckPlate || e.normalizedPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      const t = getEventLiveInstantMs(e)
      if (!Number.isFinite(t) || t < a || t > b || lev(r, plate) > 2) continue
      out.push({ t, linea: `${hhmmss(t)} ${e.deviceCode} ${r} ${src}` })
    }
  }
}
if (dssArg > 0) {
  // capturas.csv: camara,planta,patente,confianza,carril,velocidad,origen,color,tipo,marca,hora_camara (hora de cámara = feed − 240 s)
  for (const l of fs.readFileSync(process.argv[dssArg + 1], 'utf8').split(/\r?\n/).slice(1)) {
    const c = l.split(',')
    if (!c[10] || lev(c[2] || '', plate) > 2) continue
    const t = Date.parse(`${c[10].replace(' ', 'T')}-03:00`) + 240_000
    if (t < a || t > b) continue
    out.push({ t, linea: `${hhmmss(t)} ${c[0]} ${c[2]} dss (${c[8]} ${c[9]} ${c[7]})` })
  }
}
for (const x of [...new Map(out.map((x) => [x.linea, x])).values()].sort((p, q) => p.t - q.t)) console.log(x.linea)
