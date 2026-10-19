import { loadReads } from './lecturas.mjs'
import { arIso } from './sistema.mjs'
const reads = loadReads()
for (const [p, from, to] of [['THI14','2026-09-08T00:00','2026-09-08T09:00'],['THI149','2026-09-07T20:00','2026-09-08T10:00'],['AE399PP','2026-09-10T19:00','2026-09-11T02:00'],['AE399FF','2026-09-10T15:00','2026-09-11T02:00'],['GVB886','2026-09-09T00:00','2026-09-09T06:00'],['GVD086','2026-09-08T20:00','2026-09-09T06:00']]) {
  const a = Date.parse(from+'-03:00'), b = Date.parse(to+'-03:00')
  console.log(p, reads.filter(r => r.plate===p && r.t>=a && r.t<=b).map(r=>`${r.dev}@${arIso(r.t).slice(11)}${r.src}${r.code?':'+r.code:''}`).join(' '))
}
