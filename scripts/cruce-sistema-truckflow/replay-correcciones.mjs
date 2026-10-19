/**
 * Correcciones del reconocedor en un período: corre la identificación día por día sobre TODAS las lecturas
 * (eventos + alertas) con la balanza de cada día y exporta cada lectura que el algoritmo asignó a otra
 * patente: { plate (asignada), read (leída), device, t (hora operativa ms), rule }.
 * La usa informe-reconocimiento-camaras.ts (--correcciones) para la columna «corregido por el algoritmo».
 *
 * Uso: node scripts/cruce-sistema-truckflow/replay-correcciones.mjs <desde> <hasta> <salida.json>
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { identifyFragments, journeyKeyOf, nodeModelCatalog } from '../../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'
import { alertReadEvents } from '../../server/plantState/alertReads.mjs'

const root = resolve(import.meta.dirname, '../..')
const [from, to, out] = process.argv.slice(2)
if (!from || !to || !out) throw new Error('uso: replay-correcciones.mjs <desde> <hasta> <salida.json>')
const load = (f) => {
  if (!existsSync(f)) return []
  const raw = JSON.parse(readFileSync(f, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
}
const plateKey = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const SITE_OF = (dev) => (/^(SLZ|Ren)/.test(dev) ? 'san_lorenzo' : 'ricardone')
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const catalog = nodeModelCatalog()

const correcciones = new Map()
for (let day = from; day <= to; day = addDay(day, 1)) {
  const evs = new Map()
  const alerts = []
  for (const d of [addDay(day, -1), day, addDay(day, 1)]) {
    for (const e of load(join(root, 'data/truckflow', d, 'event-list.json'))) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') evs.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
    alerts.push(...load(join(root, 'data/truckflow', d, 'alert-list.json')))
  }
  const dayStart = Date.parse(day + 'T00:00:00-03:00')
  const dayEnd = Date.parse(day + 'T23:59:59-03:00')
  const end = Math.min(dayEnd + 6 * 3600_000, Date.now())
  let list = [...evs.values()]
  list.push(...alertReadEvents(alerts, list))
  list = list.filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 54 * 3600_000 && t <= end })
  const balanza = replayBalanzaRegistry(day)
  for (const site of ['ricardone', 'san_lorenzo']) {
    const mine = list.filter((e) => SITE_OF(e.deviceCode) === site)
    const { items } = identifyFragments(mine, end, { catalog, balanza, otherSiteEvents: list.filter((e) => SITE_OF(e.deviceCode) !== site) })
    const asignadas = new Map(items.filter((i) => i.assignedPlate && i.assignedPlate !== i.readPlate).map((i) => [i.fragmentKey, i]))
    for (const e of mine) {
      const t = getEventLiveInstantMs(e)
      if (t < dayStart || t > dayEnd) continue
      const it = asignadas.get(journeyKeyOf(e, t))
      if (!it) continue
      const k = `${e.deviceCode}|${t}|${it.assignedPlate}`
      correcciones.set(k, { plate: it.assignedPlate, read: plateKey(e.truckPlate ?? e.normalizedPlate), device: e.deviceCode, t, rule: it.rule, alert: e.fromAlert ?? null })
    }
  }
  process.stderr.write(`${day} ok\n`)
}
writeFileSync(out, JSON.stringify([...correcciones.values()]))
console.log(`${correcciones.size} lecturas corregidas → ${out}`)
