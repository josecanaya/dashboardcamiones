import fs from 'node:fs'
const R = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
await import('file:///' + R + 'server/load-env.mjs')
const { createDssLiveRouter } = await import('file:///' + R + 'server/dss-live.mjs')
const here = (f) => new URL(f, import.meta.url)
const o = JSON.parse(fs.readFileSync(here('./dss-nr29.json'), 'utf8'))
const dir = here('./fotos-nr/'); fs.mkdirSync(dir, { recursive: true })
const dss = createDssLiveRouter({ projectRoot: R })
const pick = Object.entries(o).filter(([, x]) => x && x.scene && (x.tipo === 'Motorcycle' || !x.tipo))
let n = 0
for (const [k, x] of pick) {
  const f = new URL(`${String(n).padStart(3, '0')}_${(x.tipo || 'sintipo')}.jpg`, dir)
  try { const p = await dss.fetchPicture(x.scene); fs.writeFileSync(f, p.buf); x.file = f.pathname.split('/').pop(); x.key = k; n++ } catch (e) { console.log(e.message) }
}
fs.writeFileSync(here('./fotos-nr/meta.json'), JSON.stringify(pick.map(([, x]) => x).filter((x) => x.file), null, 1))
console.log('fotos', n)
process.exit(0)
