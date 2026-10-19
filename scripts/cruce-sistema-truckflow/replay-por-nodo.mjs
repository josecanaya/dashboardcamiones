/**
 * Reconocimiento por nodo: cada pasada (viaje × nodo) de un período, con TODAS las lecturas (eventos +
 * alertas), clasificada contra la balanza del día y lo que hizo el reconocedor:
 *   exacta         — la patente leída es un camión que la balanza tiene en planta (o su acoplado)
 *   corregida      — lectura mala que el algoritmo asignó a un camión de la balanza
 *   queda          — lectura mala abierta (provisorio / pendiente), o asignada a algo que no está en balanza
 *   sin_balanza    — patente válida que no figura en la balanza (internos de silos, servicios, SGC demorado)
 *   no_camion      — fuera del sistema de camiones (autos, camionetas) o descartada
 * Leyó / corregimos / quedan se calculan sobre exacta + corregida + queda (camiones del Sistema).
 *
 * Uso: node scripts/cruce-sistema-truckflow/replay-por-nodo.mjs <desde> <hasta> [<dir salida>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { buildJourneys, identifyFragments, isValidPlate, nodeModelCatalog } from '../../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'
import { alertReadEvents } from '../../server/plantState/alertReads.mjs'
import { logicalLabel } from '../../server/plantState/circuitPrefix.mjs'

const root = resolve(import.meta.dirname, '../..')
const [from, to] = process.argv.slice(2)
if (!from || !to) throw new Error('uso: replay-por-nodo.mjs <desde> <hasta>')
const outDir = process.argv[4] ?? join(root, 'reportes/cruce-sistema-truckflow', `${from}_${to}`)
const load = (f) => {
  if (!existsSync(f)) return []
  const raw = JSON.parse(readFileSync(f, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
}
const SITE_OF = (dev) => (/^(SLZ|Ren)/.test(dev) ? 'san_lorenzo' : 'ricardone')
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const catalog = nodeModelCatalog()

/** site|nodo → contadores (y por cámara) */
const agg = new Map()
const bump = (site, node, device, clase) => {
  const k = `${site}|${node}`
  const a = agg.get(k) ?? { site, node, nombre: logicalLabel(node), exacta: 0, corregida: 0, queda: 0, sin_balanza: 0, no_camion: 0, camaras: new Set() }
  agg.set(k, a)
  a[clase] += 1
  if (device) a.camaras.add(device)
}

for (let day = from; day <= to; day = addDay(day, 1)) {
  const evs = new Map()
  const alerts = []
  for (const d of [addDay(day, -1), day, addDay(day, 1)]) {
    for (const e of load(join(root, 'data/truckflow', d, 'event-list.json'))) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') evs.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
    alerts.push(...load(join(root, 'data/truckflow', d, 'alert-list.json')))
  }
  if (!evs.size) { process.stderr.write(`${day} sin eventos\n`); continue }
  const dayStart = Date.parse(day + 'T00:00:00-03:00')
  const dayEnd = Date.parse(day + 'T23:59:59-03:00')
  const end = Math.min(dayEnd + 6 * 3600_000, Date.now())
  let list = [...evs.values()]
  list.push(...alertReadEvents(alerts, list))
  list = list.filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 54 * 3600_000 && t <= end })
  const balanza = replayBalanzaRegistry(day)
  const inBz = (p, t) => Boolean(p && (balanza.truckAt(p, t) || balanza.trailerAt(p, t)))
  for (const site of ['ricardone', 'san_lorenzo']) {
    const mine = list.filter((e) => SITE_OF(e.deviceCode) === site)
    const { items } = identifyFragments(mine, end, { catalog, balanza, otherSiteEvents: list.filter((e) => SITE_OF(e.deviceCode) !== site) })
    const byKey = new Map(items.map((i) => [i.fragmentKey, i]))
    for (const j of buildJourneys(mine, end)) {
      const it = byKey.get(j.key)
      // Una pasada por nodo y viaje, contada el día en que ocurrió.
      const firstAt = new Map()
      for (const r of j.rows) if (!firstAt.has(r.logical)) firstAt.set(r.logical, r)
      for (const [node, r] of firstAt) {
        if (r.t < dayStart || r.t > dayEnd) continue
        let clase
        if (it) {
          if (it.assignedPlate) clase = inBz(it.assignedPlate, r.t) ? (it.assignedPlate === j.plate ? 'exacta' : 'corregida') : 'queda'
          else if (it.level === 'fuera_sistema' || it.level === 'rechazado') clase = 'no_camion'
          else clase = 'queda'
        } else if (isValidPlate(j.plate)) clase = inBz(j.plate, r.t) ? 'exacta' : 'sin_balanza'
        else clase = 'queda'
        bump(site, node, r.device, clase)
      }
    }
  }
  process.stderr.write(`${day} ok\n`)
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const tabla = [...agg.values()]
  .map((a) => {
    const sis = a.exacta + a.corregida + a.queda
    return { planta: a.site, nodo: a.node, nombre: a.nombre, camiones_sistema: sis, leyo_pct: pct(a.exacta, sis), corregimos_pct: pct(a.corregida, sis), quedan_pct: pct(a.queda, sis), quedan: a.queda, sin_balanza: a.sin_balanza, no_camion: a.no_camion, camaras: [...a.camaras].sort().join(' ') }
  })
  .sort((a, b) => a.planta.localeCompare(b.planta) || b.camiones_sistema - a.camiones_sistema)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'informe-por-nodo.json'), JSON.stringify(tabla, null, 1))
writeFileSync(join(outDir, 'informe-por-nodo.csv'), '﻿' + ['planta,nodo,nombre,camiones_sistema,leyo_pct,corregimos_pct,quedan_pct,quedan,sin_balanza,no_camion,camaras', ...tabla.map((t) => Object.values(t).join(','))].join('\n'))
console.table(tabla.map(({ camaras, ...t }) => t))
for (const site of ['ricardone', 'san_lorenzo']) {
  const r = tabla.filter((t) => t.planta === site)
  const s = r.reduce((a, t) => ({ n: a.n + t.camiones_sistema, q: a.q + t.quedan }), { n: 0, q: 0 })
  const ex = r.reduce((a, t) => a + Math.round((t.leyo_pct * t.camiones_sistema) / 100), 0)
  const co = r.reduce((a, t) => a + Math.round((t.corregimos_pct * t.camiones_sistema) / 100), 0)
  console.log(site, 'pasadas', s.n, 'leyó', pct(ex, s.n), 'corregimos', pct(co, s.n), 'quedan', pct(s.q, s.n))
}
