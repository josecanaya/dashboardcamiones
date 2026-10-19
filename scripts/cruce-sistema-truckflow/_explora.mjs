import { loadReads } from './lecturas.mjs'
import { loadMovimientos, arDay } from './sistema.mjs'
const reads = loadReads()
const movs = loadMovimientos()
console.log('reads', reads.length, 'movs', movs.length, arDay(movs[0].ing), arDay(movs.at(-1).ing))
const grp = (d) => /^RicPreIng/.test(d) ? 'PRE' : /^RicIngCam/.test(d) ? 'ING_RIC' : /^RicCal/.test(d) || /^SLZCal/.test(d) ? 'CAL' : /^RicB\d/.test(d) || /^SLZBal(Ing|SC)/.test(d) ? 'BAL' : /^SLZIngCam/.test(d) ? 'ING_SL' : 'OTRA'
const byPlate = new Map()
for (const r of reads) { if (!r.plate) continue; let a = byPlate.get(r.plate); if (!a) byPlate.set(r.plate, a = []); a.push(r) }
const tfFirst = reads.find(r=>r.t>0).t, tfLast = reads.at(-1).t
const stats = { total: 0, any: 0, byG: {}, noneByMonth: {}, totByMonth: {}, byFuente:{} }
const off = { PRE: [], ING_SL: [], ING_RIC: [] }
for (const m of movs) {
  if (m.ing < tfFirst || m.ing > tfLast) continue
  const end = Number.isFinite(m.sal) ? m.sal + 30*60e3 : m.ing + 12*3600e3
  const start = m.ing - 60*60e3
  const hits = []
  for (const p of [m.plate, m.acoplado]) for (const r of byPlate.get(p) ?? []) if (r.t >= start && r.t <= end) hits.push(r)
  stats.total++
  const mo = arDay(m.ing).slice(0,7)
  stats.totByMonth[mo] = (stats.totByMonth[mo]??0)+1
  const f = stats.byFuente[m.fuente] ??= {n:0,none:0}; f.n++
  if (hits.length) stats.any++; else { stats.noneByMonth[mo] = (stats.noneByMonth[mo]??0)+1; f.none++ }
  const gs = new Set(hits.map(h=>grp(h.dev)))
  for (const g of gs) stats.byG[g] = (stats.byG[g]??0)+1
  for (const g of ['PRE','ING_SL','ING_RIC']) { const h = hits.filter(x=>grp(x.dev)===g && x.plate===m.plate).sort((a,b)=>Math.abs(a.t-m.ing)-Math.abs(b.t-m.ing))[0]; if (h) off[g].push({d:(h.t-m.ing)/60e3, planta:m.planta, f:m.fuente}) }
}
console.log(JSON.stringify(stats,null,0))
const q = (a,p)=>a[Math.floor(p*(a.length-1))]
for (const g in off) for (const pl of ['RICARDONE','TERMINAL_EMBARQUE']) for (const f of ['excel','sgc']) { const a = off[g].filter(x=>x.planta===pl&&x.f===f).map(x=>x.d).sort((a,b)=>a-b); if(a.length) console.log(g,pl,f,a.length,'p10',q(a,.1).toFixed(1),'p25',q(a,.25).toFixed(1),'p50',q(a,.5).toFixed(1),'p75',q(a,.75).toFixed(1),'p90',q(a,.9).toFixed(1), 'within±5', (a.filter(x=>Math.abs(x)<=5).length/a.length*100).toFixed(0)+'%') }
