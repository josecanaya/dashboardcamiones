/**
 * Desfase de cada punto de cámara contra los horarios del Sistema de camiones (ingreso, calado, salida),
 * medido en todos los movimientos cuya patente la cámara leyó exacta. Sirve para saber en qué minutos
 * buscar a un camión sin chapa en cada punto.
 *
 * Volcables: además del punto genérico, se mide por la plataforma del Excel (VOLCABLE_PTO_3 → la cámara
 * SLZVolcableC3), así la ventana se pide solo a la cámara de su volcable.
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/desfases-anclas.mjs
 * Salida: reportes/cruce-sistema-truckflow/desfases-anclas.json
 *   { "<planta>|<punto>|<ancla>": { n, p05, p25, p50, p75, p95 } }  (minutos, cámara − ancla)
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos } from './sistema.mjs'

const MIN = 60_000
const FEED_LAG = 240_000
export const PUNTOS = [
  ['Ingreso Ricardone', /^RicIngCamFrente$/],
  ['Preingreso', /^RicPreIngInFr$/],
  ['Calada Ricardone', /^RicCal(0\d|Liq)$/],
  ['Balanza ingreso Ricardone', /^RicB\dIngreso$/],
  ['Playa 3', /^RicS6Playa3$/],
  ['Celda 16', /^RicC16Descarga\d$/],
  ['Silo Keppler', /^RicS7DescLinea\d$/],
  ['Volcables Ricardone', /^RicVolcable\d$/],
  ['Balanza egreso Ricardone', /^RicB\dEgreso$/],
  ['Egreso Ricardone', /^RicEgrCamFrente$/],
  ['Ingreso puerto', /^SLZIngCamFrente$/],
  ['Balanza ingreso puerto', /^SLZBalIngFte$/],
  ['Volcables puerto', /^(SLZVolcableC\d|SLZDescCam)$/],
  ['Balanza egreso puerto', /^SLZBalSC\dFte$/],
  ['Salida puerto', /^SLZSalidaC\dFte$/],
]
/** Cámara de descarga según la plataforma del Excel. */
export function camaraPlataforma(pl) {
  let m = /^VOLCABLE_PTO_(\d)/.exec(pl)
  if (m) return [`SLZVolcableC${m[1]}`]
  m = /^VOLCABLE_(\d)/.exec(pl)
  if (m) return [`RicVolcable${m[1]}`]
  if (/^KEPPLER/.test(pl)) return ['RicS7DescLinea1', 'RicS7DescLinea2']
  if (/^CELDA_16/.test(pl)) return ['RicC16Descarga1', 'RicC16Descarga2']
  return null
}
const q = (s, f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const byPlate = new Map()
  for (const r of loadReads()) if (r.plate && r.src === 'e') (byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)
  const raw = {}
  for (const m of loadMovimientos()) {
    if (m.mov !== 'INGRESO') continue
    const fin = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
    const reads = (byPlate.get(m.plate) ?? []).filter((r) => r.t - FEED_LAG >= m.ing - 60 * MIN && r.t - FEED_LAG <= fin)
    if (!reads.length) continue
    const anclas = { ing: m.ing, calado: m.calado, sal: m.sal }
    const camPl = camaraPlataforma(m.plataforma)
    for (const [punto, re] of PUNTOS) {
      const rs = reads.filter((r) => re.test(r.dev)).sort((a, b) => a.t - b.t)
      if (!rs.length) continue
      const t = rs[0].t - FEED_LAG
      for (const [k, a] of Object.entries(anclas)) {
        if (!Number.isFinite(a)) continue
        ;(raw[`${m.planta}|${punto}|${k}`] ??= []).push((t - a) / MIN)
        // Volcable de su plataforma (la lectura tiene que ser en esa cámara).
        if (camPl && /Volcables|Celda|Keppler/.test(punto)) {
          const r2 = rs.find((r) => camPl.includes(r.dev))
          if (r2) (raw[`${m.planta}|Descarga plataforma|${k}`] ??= []).push((r2.t - FEED_LAG - a) / MIN)
        }
      }
    }
  }
  const out = {}
  for (const [k, arr] of Object.entries(raw)) {
    if (arr.length < 30) continue
    const s = arr.sort((a, b) => a - b)
    out[k] = { n: s.length, p05: +q(s, 0.05).toFixed(1), p25: +q(s, 0.25).toFixed(1), p50: +q(s, 0.5).toFixed(1), p75: +q(s, 0.75).toFixed(1), p95: +q(s, 0.95).toFixed(1) }
  }
  writeFileSync(join(OUT_DIR, 'desfases-anclas.json'), JSON.stringify(out, null, 1))
  for (const [k, v] of Object.entries(out).sort()) console.log(k.padEnd(52), String(v.n).padStart(6), v.p05, v.p25, v.p50, v.p75, v.p95)
}
