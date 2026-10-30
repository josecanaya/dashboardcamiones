// Para cada patente que sigue en alerta (29/10): recorte de la patente del DSS y candidatas
// (carta / Permitidos / remito a ≤2 caracteres, y vehículos leídos en el mismo paso ±90 s).
import fs from 'node:fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const M = R + 'data/'
await import('file:///' + R + 'server/load-env.mjs')
const { createDssLiveRouter } = await import('file:///' + R + 'server/dss-live.mjs')
const here = (f) => new URL(f, import.meta.url)
const P = (x) => String(x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const ed = (a, b) => { const t = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) t[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = Math.min(t[i - 1][j] + 1, t[i][j - 1] + 1, t[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return t[a.length][b.length] }
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const known = new Map()
for (const e of J(M + 'padron/vehiculos-permitidos.json').entries) known.set(e.plate, 'Permitidos')
for (const d of ['2026-10-28', '2026-10-29', '2026-10-30']) for (const n of J(M + `padron/${d}.json`).notes) for (const p of n.plates) known.set(p, 'carta')
for (const d of ['2026-10-29', '2026-10-30']) for (const r of Object.values(J(M + `sgc/${d}/ingresos.json`))) for (const p of [P(r.PATENTECAMION), P(r.PATENTEACOPLADO)]) if (p) known.set(p, 'remito · ' + r.PRODUCTO.toLowerCase())
const d = J(here('./dia29-alg.json'))
const base = (dev) => dev.replace(/(Tras|Traser|Trasera|Tr|Fte|Frente|Fr)$/i, '')
const dss = createDssLiveRouter({ projectRoot: R })
const dir = here('./ia-alertas/'); fs.mkdirSync(dir, { recursive: true })
const out = {}
const alertPlates = [...new Set(d.caps.filter((c) => c.l === 'al4').map((c) => c.p))]
for (const p of alertPlates) {
  const cs = d.caps.filter((c) => c.p === p && c.l === 'al4')
  const near = [...known].filter(([q]) => ed(p, q) <= 2).map(([q, src]) => ({ plate: q, src, dist: ed(p, q) }))
  const same = [...new Set(cs.flatMap((c) => d.caps.filter((x) => base(x.d) === base(c.d) && Math.abs(x.t - c.t) < 90e3 && x.p && x.p !== p && x.l !== 'nr').map((x) => x.p)))]
  out[p] = { lecturas: cs.length, near, same, fotos: [] }
  for (const c of cs.slice(0, 2)) {
    try {
      const r = await dss.findVehicleCapture(c.d, c.t - 240_000, p)
      if (!r) continue
      for (const [kind, url] of [['patente', r.platePicture], ['escena', r.scenePicture]]) {
        if (!url) continue
        const pic = await dss.fetchPicture(url)
        const f = `${p}_${out[p].fotos.length}_${kind}.jpg`
        fs.writeFileSync(new URL(f, dir), pic.buf)
        out[p].fotos.push({ f, kind, dev: c.d, nodo: c.n, hora: new Date(c.t - 3 * 3600e3).toISOString().slice(11, 16) })
      }
    } catch (e) { console.log(p, e.message) }
  }
}
fs.writeFileSync(here('./ia-alertas/candidatas.json'), JSON.stringify(out, null, 1))
console.log('patentes', alertPlates.length, '· con candidata', Object.values(out).filter((o) => o.near.length || o.same.length).length)
process.exit(0)
