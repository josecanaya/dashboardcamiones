/**
 * Informe DIARIO de logística: arma la revisión de un día y (salvo `--sin-slides`) actualiza
 * la presentación diaria en Google Slides.
 *
 * Mismas métricas que el semanal: el paquete sale de `buildLogisticsReportPackage` con un
 * período de un día, sobre la corrida guardada de la semana que contiene ese día. Se le suma
 * lo que el semanal no publica (movimientos del Excel del día, anomalías, demorados:
 * `logisticsReportDaily.ts`).
 *
 * ## Uso
 *
 *   npx tsx scripts/informe-diario.ts [AAAA-MM-DD] [--procesar] [--sin-slides] [--dry]
 *
 * - Sin fecha: el día anterior (hora Argentina).
 * - `--procesar`: baja las cámaras del día de la nube, repara `journeyUid` si vienen vacíos y
 *   reprocesa la semana calendario (lunes→domingo) en el ETL API. Sin el flag usa la corrida
 *   ya guardada que cubra el día (no reprocesa nada).
 * - `--sin-slides`: solo escribe la revisión local (sirve para cargar el historial).
 * - `--dry`: el sync de Slides no escribe (ver `informe-diario-slides.mjs`).
 * - `--forzar`: publica aunque falte el Excel de movimientos del día (sin él, productos,
 *   circuitos y puerta a puerta salen vacíos: por defecto la revisión queda como borrador local
 *   y NO se publica, para no pisar la presentación con un informe incompleto).
 *
 * ## Qué deja
 *
 * ```
 * reportes/logistica/diario/<día>/
 *   revision-NNN/{paquete.json, diario.json, control.json}
 *   ULTIMA.txt
 *   exclusiones.json   ← opcional, mismo formato que el semanal
 * ```
 */
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { buildLogisticsReportPackage } from '../src/features/real-truckflow/logisticsReport/logisticsReportPackage'
import { buildDailyExtras } from '../src/features/real-truckflow/logisticsReport/logisticsReportDaily'
import { buildRegistryLookup } from '../src/domain/truckPlateRegistry'
import { cargarCorrida, RAIZ } from './lib/loadRunHeadless'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { nextRevisionDir } from '../server/logisticsReport/reportRevision.mjs'
// @ts-expect-error módulo .mjs del servidor, sin tipos
import { aplicarExclusiones } from '../server/logisticsReport/reportWorkbook.mjs'

const ETL_API = process.env.ETL_API_BASE ?? 'http://127.0.0.1:8787'
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const shift = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
/** Hoy en Argentina (UTC−3, sin horario de verano). */
const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

const dia = args.find((a) => DAY_RE.test(a)) ?? shift(hoyAr(), -1)
const dow = new Date(`${dia}T00:00:00Z`).getUTCDay()
const lunes = shift(dia, -((dow + 6) % 7))
const domingo = shift(lunes, 6)
const advertencias: { id: string; detail: string }[] = []

console.log(`Informe diario ${dia} · semana ${lunes} → ${domingo}`)

// —— 1. Datos del día (solo con --procesar) ————————————————————————————————

async function post(ruta: string, body: unknown) {
  const res = await fetch(`${ETL_API}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${ruta}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`)
  return json
}

/** Proporción de eventos sin `journeyUid` (export roto de la nube, desde 27/08). */
function sinJourneyUid(day: string): number {
  const p = path.join(RAIZ, 'data', 'truckflow', day, 'event-list.json')
  if (!existsSync(p)) return 0
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  const evs: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.items ?? raw.data ?? raw.events ?? [])
  if (!evs.length) return 0
  return evs.filter((e) => !e.journeyUid).length / evs.length
}

if (flag('--procesar')) {
  const exp = await post('/api/truckflow/export-one-day', { day: dia })
  console.log(`Cámaras ${dia}: ${exp.eventsDownloaded ?? '?'} eventos (${exp.status ?? 'ok'}).`)
  const roto = sinJourneyUid(dia)
  if (roto > 0.5) {
    // Reconstruye journeyUid por la regla de cámaras de salida. Solo en días rotos: en un día
    // sano pisaría los uid reales con sintéticos.
    console.log(`  ${Math.round(roto * 100)} % de eventos sin journeyUid → reparando.`)
    const r = spawnSync('node', ['scripts/repair-missing-journey-uid.mjs', dia], { cwd: RAIZ, stdio: 'inherit' })
    if (r.status !== 0) throw new Error('Falló la reparación de journeyUid')
  }
  if (!existsSync(path.join(RAIZ, 'data', 'movimientos', dia, 'movimientos.json'))) {
    advertencias.push({
      id: 'movimientos.falta_excel',
      detail: `No está cargado el Excel de movimientos del ${dia}: productos, circuitos y tiempos puerta a puerta quedan sin dato.`,
    })
  }
  console.log(`Reprocesando la semana ${lunes} → ${domingo}…`)
  const run = await post('/api/etl/runs', { from: lunes, to: domingo, force: true })
  console.log(`  corrida ${run.runId}${run.cached ? ' (cache)' : ''}`)
}

// —— 2. Corrida que cubre el día ——————————————————————————————————————————

/** La semana estable si existe; si no, la corrida más reciente que contenga el día. */
async function elegirCorrida(): Promise<string> {
  const raiz = path.join(RAIZ, 'runs', 'windows')
  const semana = `${lunes}_${domingo}`
  if (existsSync(path.join(raiz, semana, 'manifest.json'))) return semana
  const candidatas: { id: string; fin: string }[] = []
  for (const id of await fs.readdir(raiz)) {
    const m = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)
    if (!m || m[1] > dia || m[2] < dia) continue
    try {
      const man = JSON.parse(await fs.readFile(path.join(raiz, id, 'manifest.json'), 'utf8'))
      if (man.status === 'ok') candidatas.push({ id, fin: String(man.finishedAt ?? '') })
    } catch {
      /* corrida incompleta */
    }
  }
  candidatas.sort((a, b) => b.fin.localeCompare(a.fin))
  if (!candidatas.length) {
    throw new Error(`No hay corrida guardada que cubra el ${dia}. Correr con --procesar.`)
  }
  return candidatas[0].id
}

const runId = await elegirCorrida()
const manifest = JSON.parse(await fs.readFile(path.join(RAIZ, 'runs', 'windows', runId, 'manifest.json'), 'utf8'))
const eventosDelDia = (manifest.input?.eventsPaths ?? []).some((p: string) => p.includes(dia))
if (!eventosDelDia) {
  advertencias.push({ id: 'corrida.sin_eventos_del_dia', detail: `La corrida ${runId} no incluye las cámaras del ${dia}.` })
}
const tr = await cargarCorrida(runId)
console.log(`Corrida ${runId}: ${Object.keys(tr.csv).length} tablas, reglas ${tr.rulesVersion}`)

// —— 3. Paquete del día + bloques diarios ——————————————————————————————————

const paquete = buildLogisticsReportPackage(tr, { from: dia, to: dia, runIds: [runId], composedRange: null })
// Un día suelto es «atípico» o «semana en curso» para la plantilla SEMANAL; el diario tiene su
// propio formato y esos avisos no aplican.
paquete.controles.advertencias = paquete.controles.advertencias.filter(
  (a) => a.id !== 'periodo.atipico' && a.id !== 'periodo.semana_en_curso'
)
if (paquete.controles.sinDatos) {
  console.error(`El ${dia} no tiene datos en la corrida ${runId}.`)
  process.exit(1)
}

/** Patentes de servicio: la base en vivo (Supabase vía API) y, si no responde, el JSON local. */
async function patentesExcluidas(): Promise<Set<string>> {
  let doc: unknown = null
  try {
    const res = await fetch(`${ETL_API}/api/truckflow/plate-registry`)
    if (res.ok) doc = await res.json()
  } catch {
    doc = null
  }
  if (!doc) {
    advertencias.push({ id: 'registro.sin_base_en_vivo', detail: 'Registro de patentes leído del JSON local (la API no respondió).' })
    doc = JSON.parse(await fs.readFile(path.join(RAIZ, 'data', 'truck-registry', 'registry.json'), 'utf8'))
  }
  return new Set(buildRegistryLookup(doc as Parameters<typeof buildRegistryLookup>[0]).keys())
}

const extras = buildDailyExtras(
  { tables: tr.tables as never, csv: tr.csv as Record<string, string>, excludedPlates: await patentesExcluidas() },
  dia
)
if (extras.movimientos.missing || extras.movimientos.total === 0) {
  if (!advertencias.some((a) => a.id === 'movimientos.falta_excel')) {
    advertencias.push({ id: 'movimientos.sin_filas', detail: `La corrida no trae movimientos del Excel del ${dia}.` })
  }
}

// —— 4. Revisión ———————————————————————————————————————————————————————————

const diaDir = path.join(RAIZ, 'reportes', 'logistica', 'diario', dia)
let exclusiones: unknown[] = []
try {
  exclusiones = JSON.parse(await fs.readFile(path.join(diaDir, 'exclusiones.json'), 'utf8'))
} catch {
  exclusiones = []
}
const { name: revName, number: revNum } = await nextRevisionDir(diaDir)
const revDir = path.join(diaDir, revName)
await fs.mkdir(revDir, { recursive: true })
await fs.writeFile(path.join(revDir, 'paquete.json'), JSON.stringify(paquete, null, 2), 'utf8')
await fs.writeFile(path.join(revDir, 'diario.json'), JSON.stringify(extras, null, 2), 'utf8')
const control = {
  generadoEl: new Date().toISOString(),
  tipo: 'diario',
  revision: revNum,
  dia,
  corrida: { runId, rulesVersion: tr.rulesVersion, finishedAt: manifest.finishedAt, inputHash: manifest.input?.inputHash },
  tablas: [
    ...paquete.fuentes.tablesUsed,
    'excel_operations_with_truckflow (movimientos por source_date)',
    'debug_matrix_classification (anomalías BEHAVIORAL)',
    'segment_timing_legs (demorados)',
  ],
  politicaDia: paquete.controles.politicaDia,
  pendientes: paquete.controles.pendientes,
  advertencias: [...advertencias, ...paquete.controles.advertencias],
  exclusiones,
  estado: advertencias.length ? 'borrador_con_advertencias' : 'para_revision_del_usuario',
}
await fs.writeFile(path.join(revDir, 'control.json'), JSON.stringify(control, null, 2), 'utf8')
await fs.writeFile(path.join(diaDir, 'ULTIMA.txt'), `${revDir}\n`, 'utf8')
// Las exclusiones se aplican al leer (como en el semanal): acá solo para el resumen de consola.
const vista = aplicarExclusiones(paquete, exclusiones)

const n = (v: number | null | undefined) => (typeof v === 'number' ? Math.round(v).toLocaleString('es-AR') : 's/d')
console.log(`Revisión ${revNum}: ${revDir}`)
console.log(
  `  Movimientos Excel ${n(extras.movimientos.total)} · recorridos clasificados ${n(vista.ejecutivo.recorridosEnPeriodo)} · ` +
    `R7 ${n(vista.tiempos.soja?.periodo?.tiempoMedioMin)} min (${n(vista.tiempos.soja?.periodo?.camiones)} camiones) · ` +
    `anomalías ${extras.anomalias.total} · demorados ${extras.demorados.reduce((s, d) => s + d.casos.length, 0)}`
)
// Los eventos de la noche anterior que quedan fuera del día son esperables: no se listan.
for (const a of control.advertencias.filter((x) => !/quedaron fuera del período exacto/.test(x.detail))) {
  console.log(`  ⚠ ${a.id}: ${a.detail}`)
}

// —— 5. Google Slides —————————————————————————————————————————————————————

const sinExcel = control.advertencias.some((a) => a.id === 'movimientos.falta_excel' || a.id === 'movimientos.sin_filas')
if (sinExcel && !flag('--sin-slides') && !flag('--forzar')) {
  console.error(`No se publica: falta el Excel de movimientos del ${dia}. Cargarlo y volver a correr (o --forzar).`)
  process.exit(3)
}
if (!flag('--sin-slides')) {
  const r = spawnSync('node', ['scripts/informe-diario-slides.mjs', revDir, ...(flag('--dry') ? ['--dry'] : [])], {
    cwd: RAIZ,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
