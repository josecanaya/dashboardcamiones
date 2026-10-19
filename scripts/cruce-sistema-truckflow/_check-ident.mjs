import { loadReads } from './lecturas.mjs'
import { loadMovimientos, arIso } from './sistema.mjs'
const casos = [['EOV644','2026-08-14 16:55:55'],['AB688RB','2026-08-28 16:33:55'],['AB723QC','2026-08-29 05:33:07'],['DDD727','2026-09-18 12:30:34'],['AH439OV','2026-09-27 17:25:18'],['TRO957','2026-09-17 21:19:17'],['GQQ158','2026-09-12 13:57:48']]
const reads = loadReads().filter((r) => /^RicPreIng/.test(r.dev))
const movs = loadMovimientos()
for (const [p, cam] of casos) {
  const t = Date.parse(cam.replace(' ', 'T') + '-03:00') + 240_000 // escala feed
  const near = movs.filter((m) => Math.abs(m.ing - t) <= 6 * 60_000)
  console.log(`\n${p} cámara ${cam}:`)
  for (const m of near) {
    const ex = reads.filter((r) => r.plate === m.plate && Math.abs(r.t - m.ing) < 10 * 60_000).map((r) => arIso(r.t - 240_000).slice(11))
    console.log(`  ${m.plate.padEnd(8)} alta ${arIso(m.ing).slice(11)} ${m.producto.slice(0, 14).padEnd(14)} leída en Preingreso: ${ex.length ? ex.join(' ') : 'NO'}`)
  }
}
