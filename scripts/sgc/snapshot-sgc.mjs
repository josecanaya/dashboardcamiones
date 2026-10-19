/**
 * Guardado del día desde la vista SGC (balanza Vicentin), sin depender del server del dashboard.
 *
 * La vista `CamionesActivos24horas` solo muestra las últimas 24 h: si nadie la consulta en ese
 * lapso, los ingresos se pierden. Este script hace UNA consulta (mismo código que el poller del
 * server: upsert en data/sgc/<día>/ingresos.json y regeneración de data/movimientos/<día>) y sale.
 * Lo corre el Programador de tareas de Windows cada hora (scripts/sgc/instalar-tarea-sgc.ps1).
 *
 * Uso: node scripts/sgc/snapshot-sgc.mjs
 * Sale con código 1 si la vista no respondió (VPN caída o sin ruta a ORACLE_SGC_HOST: DPY-6005).
 */
import { PROJECT_ROOT } from '../../server/load-env.mjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createSgcSource } from '../../server/sgc/sgcSource.mjs'

const GAP_ALERT_H = 20

/** Último guardado bueno anterior a esta corrida, según la bitácora. */
function lastOkBefore(pollsFile) {
  if (!existsSync(pollsFile)) return null
  const lines = readFileSync(pollsFile, 'utf8').trim().split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i])
      if (e.ok) return e.at
    } catch { /* línea rota */ }
  }
  return null
}

const pollsFile = path.join(PROJECT_ROOT, 'data', 'sgc', '_polls.jsonl')
const prevOk = lastOkBefore(pollsFile)
const sgc = createSgcSource({ projectRoot: PROJECT_ROOT })
await sgc.tick()
const { status } = sgc.balanza('all')

const stamp = new Date().toLocaleString('es-AR')
if (status.error) {
  console.error(`[${stamp}] SGC sin respuesta: ${status.error}`)
  if (prevOk) {
    const h = (Date.now() - Date.parse(prevOk)) / 3_600_000
    console.error(`Último guardado bueno: ${prevOk} (hace ${h.toFixed(1)} h).${h >= GAP_ALERT_H ? ' ATENCIÓN: cerca de las 24 h, se empiezan a perder ingresos.' : ''}`)
  }
  process.exit(1)
}

if (prevOk) {
  const h = (Date.now() - Date.parse(prevOk)) / 3_600_000
  if (h >= 24) console.warn(`ATENCIÓN: hueco de ${h.toFixed(1)} h desde el guardado anterior (${prevOk}); pueden faltar ingresos.`)
}
const b = sgc.balanza('all')
console.log(`[${stamp}] SGC ok: ${b.counts.ingresos24h} ingresos en la vista, ${b.counts.inPlant} en planta.`)
process.exit(0)
