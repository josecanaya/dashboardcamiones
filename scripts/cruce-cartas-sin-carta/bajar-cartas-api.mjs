// Baja de la API de agro (llave de soporte) todas las cartas (74 y 284) emitidas en un rango.
// Uso: node --env-file=.env.local scripts/cruce-cartas-sin-carta/bajar-cartas-api.mjs DESDE HASTA salida.json
import fs from 'node:fs'
import { normalizeNote } from '../../server/live/padron/cartasSource.mjs'
const [desde, hasta, out] = process.argv.slice(2)
const base = String(process.env.AGRO_API_BASE ?? 'https://agro.bimtrazer.com').replace(/\/$/, '')
const headers = { SaasAgroArApiKey: process.env.AGRO_GW_KEY, 'X-Plant-Access-Key': process.env.AGRO_SUPPORT_KEY }
const notes = []
// de a un día de emisión: la paginación por rangos largos es lenta
for (let t = Date.parse(desde + 'T12:00Z'); t <= Date.parse(hasta + 'T12:00Z'); t += 86400e3) {
  const d = new Date(t)
  const ymd = p => ({ [`${p}.year`]: String(d.getUTCFullYear()), [`${p}.month`]: String(d.getUTCMonth() + 1), [`${p}.day`]: String(d.getUTCDate()) })
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ ...ymd('filter.issueDateRange.startDate'), ...ymd('filter.issueDateRange.endDate'), 'pageParams.pageSize': '100', 'pageParams.pageNumber': String(page) })
    const r = await fetch(`${base}/v1/arca_consignment_notes?${q}`, { headers, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`agro ${r.status} ${await r.text()}`)
    const body = await r.json()
    notes.push(...(body.list ?? []).map(normalizeNote))
    if (page >= Number(body.pagination?.totalPages ?? 1)) break
  }
  process.stderr.write(`${d.toISOString().slice(0, 10)} ${notes.length}\n`)
}
const uniq = [...new Map(notes.map(n => [n.ctg, n])).values()]
fs.writeFileSync(out, JSON.stringify(uniq))
console.log('cartas', uniq.length)
