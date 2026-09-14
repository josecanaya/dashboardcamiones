#!/usr/bin/env node
/**
 * Genera resúmenes legibles del backup de movimientos:
 *   - `data/movimientos/<día>/RESUMEN.md`      — un resumen por día
 *   - `data/movimientos/RESUMEN.md`            — índice con la serie diaria
 *   - `data/movimientos/_semanas/<desde>_<hasta>.md` — un resumen por semana jueves→miércoles
 *   - `data/movimientos/_semanas/RESUMEN.md`   — índice con la serie semanal
 *
 * Criterio de día: **ingreso** (`external_ingreso_at`). El backup está particionado de
 * forma inconsistente (mayo por ingreso, agosto/septiembre por salida) y ~416 filas
 * aparecen en dos carpetas, así que se dedupe por `external_operation_id` y se reagrupa
 * por día de ingreso. Los 111 días de ingreso coinciden 1:1 con las 111 carpetas.
 *
 * Las semanas van de jueves a miércoles (pedido operativo) y viven en su propia carpeta
 * `_semanas/`, al margen de las particiones diarias. No tienen relación con las ventanas
 * lunes→domingo de `runs/windows/`.
 *
 * Familias de producto: espejo de las reglas del ETL (`isPelletExcelProduct`,
 * `isExcelLiquidProductName`) extendidas a maíz, biomasa, subproductos y servicios.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const MOV_ROOT = path.join(PROJECT_ROOT, 'data', 'movimientos')
const WEEKS_DIR = path.join(MOV_ROOT, '_semanas')
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Permanencia mayor a esto = dato roto del Excel, no un camión de 2 días. */
const MAX_STAY_MIN = 24 * 60

/** Semana operativa: jueves → miércoles. `getUTCDay()`: domingo 0 … jueves 4. */
const WEEK_START_DOW = 4
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/**
 * Patentes ficticias del Excel (filas de ajuste, no camiones). Espejo ampliado de
 * `excludedExcelPlates.ts`, que solo cubre la variante de 6 caracteres: el backup trae
 * además XXXX, XXXXX, XXXXXXX y TTTTTTT, y esas filas llevan pesos absurdos (una sola
 * de MAIZ con 4.034.883 kg) que inflaban las toneladas del período en ~29%.
 */
const PLACEHOLDER_PLATE_RE = /^(X+|P+|T+)$/
const isPlaceholderPlate = (plate) =>
  PLACEHOLDER_PLATE_RE.test(String(plate ?? '').trim().toUpperCase())

const FAMILIES = [
  ['PELLET', 'Pellet', /PELLET|PELLETEAD|EXPELLER|EXPELER/],
  ['ACEITE_LECITINA', 'Aceite / Lecitina', /\bACEITE|^AC\s|ACGIRASOL|LECITINA|BORRA|ACIDOS GRASOS/],
  [
    'GLICERINA_BIOCOMB',
    'Glicerina / Biocombustible',
    /GLICERIN|GLICEROL|ALCOHOL ETILICO|BIODIESEL|METANOL|METILATO|SAL GLICERINOSA/,
  ],
  ['SOJA', 'Soja', /^SOJA\b/],
  ['GIRASOL', 'Girasol', /^GIRASOL\b/],
  ['MAIZ', 'Maíz', /^MAIZ$|^MAIZ\s(?!MOLIDO)/],
  [
    'SUBPRODUCTOS',
    'Subproductos / granos varios',
    /HARINA|DDG|BURLANDA|THIN STILLAGE|CASCARA|SEMILLA|MERMA DE ZARANDA|BARRIDO DE MERCADERIA|HENO|ALFALFA|NUCLEO|MAIZ MOLIDO|GRANO DE ALGODON|GOMA DE PRODUCCION/,
  ],
  ['BIOMASA', 'Biomasa (leña / chip)', /LEÑA|LENA|CHIP/],
]
const FAMILY_FALLBACK = ['SERVICIOS', 'Servicios / insumos / residuos']
/** Familias cuyo titular es la descarga (movimiento INGRESO), no el total de filas. */
const DISCHARGE_FAMILIES = new Set([
  'SOJA',
  'GIRASOL',
  'MAIZ',
  'PELLET',
  'ACEITE_LECITINA',
  'BIOMASA',
  'SUBPRODUCTOS',
])

const PLANT_LABELS = {
  TERMINAL_EMBARQUE: 'San Lorenzo (Terminal de Embarque)',
  RICARDONE: 'Ricardone',
  AVELLANEDA: 'Avellaneda',
  RENOPACK: 'Renopack',
  LOS_CORRALES_DE_NICANOR: 'Los Corrales de Nicanor',
}

function familyOf(product) {
  const p = String(product ?? '')
    .toUpperCase()
    .trim()
  for (const [key, label, re] of FAMILIES) if (re.test(p)) return { key, label }
  return { key: FAMILY_FALLBACK[0], label: FAMILY_FALLBACK[1] }
}
function familyLabel(key) {
  return FAMILIES.find((f) => f[0] === key)?.[1] ?? FAMILY_FALLBACK[1]
}

// ── Fechas ──────────────────────────────────────────────────────────────────────
const dayOf = (iso) => String(iso ?? '').slice(0, 10)
const utc = (dayIso) => new Date(`${dayIso}T00:00:00Z`)
const addDays = (dayIso, n) => {
  const d = utc(dayIso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dowLabel = (dayIso) => DOW_LABELS[utc(dayIso).getUTCDay()]
/** Jueves de la semana operativa a la que pertenece el día. */
function weekStartOf(dayIso) {
  return addDays(dayIso, -((utc(dayIso).getUTCDay() - WEEK_START_DOW + 7) % 7))
}

// ── Formato ─────────────────────────────────────────────────────────────────────
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const minutesBetween = (from, to) => {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (b - a) / 60000
}
const hhmm = (min) => {
  if (min === null || min === undefined) return '—'
  // Redondear los minutos totales primero: con `round(min % 60)` una media de 59,6
  // salía como «0h60».
  const total = Math.round(min)
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`
}
const int = (n) => (Math.round(n) || 0).toLocaleString('es-AR')
/** `|| 0` evita el «-0» que salía con netos negativos chicos (ajustes del Excel). */
const ton = (n) => (Math.round(n) || 0).toLocaleString('es-AR')
/** «1 movimiento» / «2 movimientos» — el resumen se lee, no es solo una tabla. */
const plural = (n, one, many) => `${int(n)} ${Math.abs(Math.round(n)) === 1 ? one : many}`
const yamlStr = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`
const yamlNum = (n) => (n === null || n === undefined ? 'null' : String(Math.round(n)))

// ── Agregación ──────────────────────────────────────────────────────────────────
const plates = (rows) =>
  new Set(rows.map((r) => String(r.plate_normalized ?? '').trim()).filter(Boolean)).size
const tons = (rows) => (rows.reduce((acc, r) => acc + num(r.kgs_neto), 0) || 0) / 1000
const countBy = (rows, fn) => {
  const m = new Map()
  for (const r of rows) {
    const k = fn(r)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}

function stayStats(rows) {
  const kept = []
  let missing = 0
  let negative = 0
  let over = 0
  for (const r of rows) {
    const d = minutesBetween(r.external_ingreso_at, r.external_salida_at)
    if (d === null) {
      missing += 1
      continue
    }
    if (d < 0) {
      negative += 1
      continue
    }
    if (d > MAX_STAY_MIN) {
      over += 1
      continue
    }
    kept.push(d)
  }
  if (!kept.length) return { n: 0, missing, negative, over, avg: null, p50: null, p90: null }
  kept.sort((a, b) => a - b)
  const avg = kept.reduce((a, b) => a + b, 0) / kept.length
  const at = (q) => kept[Math.min(kept.length - 1, Math.max(0, Math.ceil(q * kept.length) - 1))]
  return { n: kept.length, missing, negative, over, avg, p50: at(0.5), p90: at(0.9) }
}

/** Todas las cifras de un conjunto de movimientos — se reusa para día y para semana. */
function metricsOf(rows) {
  const byMovType = (t) => rows.filter((r) => r.movement_type === t)
  const groupOf = (keyFn, labelFn) =>
    countBy(rows, keyFn).map(([key, n]) => {
      const sub = rows.filter((r) => keyFn(r) === key)
      return {
        key,
        label: labelFn(key),
        n,
        plates: plates(sub),
        ing: sub.filter((r) => r.movement_type === 'INGRESO').length,
        egr: sub.filter((r) => r.movement_type === 'EGRESO').length,
        ton: tons(sub),
        vuelta: sub.filter((r) => r.es_de_vuelta === true).length,
        stay: stayStats(sub),
      }
    })

  const hours = new Array(24).fill(0)
  for (const r of rows) {
    const h = Number(String(r.external_ingreso_at ?? '').slice(11, 13))
    if (Number.isInteger(h) && h >= 0 && h < 24) hours[h] += 1
  }
  const calados = rows
    .map((r) => minutesBetween(r.external_ingreso_at, r.external_calado_at))
    .filter((d) => d !== null && d >= 0 && d <= MAX_STAY_MIN)

  const prodKey = (r) => `${r.product_normalized}␟${r.cod_prod}`
  const famGroups = groupOf(
    (r) => familyOf(r.product_normalized).key,
    (k) => familyLabel(k)
  )

  return {
    rows,
    n: rows.length,
    plates: plates(rows),
    ton: tons(rows),
    stay: stayStats(rows),
    ingresos: byMovType('INGRESO').length,
    egresos: byMovType('EGRESO').length,
    otros: rows.filter((r) => r.movement_type !== 'INGRESO' && r.movement_type !== 'EGRESO').length,
    deVuelta: rows.filter((r) => r.es_de_vuelta === true).length,
    sources: [...new Set(rows.map((r) => r.source_file).filter(Boolean))].sort(),
    plantGroups: groupOf(
      (r) => r.planta_normalized || '(sin planta)',
      (k) => PLANT_LABELS[k] ?? k
    ),
    famGroups,
    headline: famGroups
      .filter((f) => DISCHARGE_FAMILIES.has(f.key) && f.ing > 0)
      .sort((a, b) => b.ing - a.ing),
    prodGroups: countBy(rows, prodKey).map(([k, n]) => {
      const [product, cod] = k.split('␟')
      const sub = rows.filter((r) => prodKey(r) === k)
      return {
        product,
        cod,
        n,
        ing: sub.filter((r) => r.movement_type === 'INGRESO').length,
        ton: tons(sub),
        stay: stayStats(sub),
      }
    }),
    platGroups: countBy(rows, (r) => r.platform_normalized || '(sin plataforma)'),
    hours,
    peakHour: hours.indexOf(Math.max(...hours)),
    calAvg: calados.length ? calados.reduce((a, b) => a + b, 0) / calados.length : null,
    caladoBase: calados.length,
    sinCalado: rows.filter((r) => !String(r.external_calado_at ?? '').trim()).length,
    warns: countBy(
      rows.filter((r) => String(r.normalization_warnings ?? '').trim()),
      (r) => r.normalization_warnings
    ),
  }
}

// ── Render compartido ───────────────────────────────────────────────────────────
function writeMetricsFrontmatter(A, m) {
  A(`movimientos: ${m.n}`)
  A(`camiones: ${m.plates}`)
  A(`ingresos: ${m.ingresos}`)
  A(`egresos: ${m.egresos}`)
  A(`otros_movimientos: ${m.otros}`)
  A(`de_vuelta: ${m.deVuelta}`)
  A(`toneladas_netas: ${Math.round(m.ton)}`)
  A(`permanencia_prom_min: ${yamlNum(m.stay.avg)}`)
  A(`permanencia_p50_min: ${yamlNum(m.stay.p50)}`)
  A(`permanencia_p90_min: ${yamlNum(m.stay.p90)}`)
  A(`permanencia_base: ${m.stay.n}`)
  A(`hora_pico_ingreso: ${yamlStr(String(m.peakHour).padStart(2, '0'))}`)
  A('plantas:')
  for (const p of m.plantGroups) {
    A(
      `  ${p.key}: { movimientos: ${p.n}, camiones: ${p.plates}, ingresos: ${p.ing}, egresos: ${p.egr}, toneladas: ${Math.round(p.ton)}, permanencia_prom_min: ${yamlNum(p.stay.avg)} }`
    )
  }
  A('familias:')
  for (const f of m.famGroups) {
    A(
      `  ${f.key}: { movimientos: ${f.n}, descargas_ingreso: ${f.ing}, egresos: ${f.egr}, camiones: ${f.plates}, toneladas: ${Math.round(f.ton)}, de_vuelta: ${f.vuelta}, permanencia_prom_min: ${yamlNum(f.stay.avg)} }`
    )
  }
}

function writeTitulares(A, m, { unidad, extra = [] }) {
  A('## Titulares')
  A()
  A(
    `- **${plural(m.n, 'movimiento', 'movimientos')}** de **${plural(m.plates, 'camión distinto', 'camiones distintos')}** (${plural(m.ingresos, 'ingreso', 'ingresos')}, ${plural(m.egresos, 'egreso', 'egresos')}${m.otros ? `, ${plural(m.otros, 'otro', 'otros')}` : ''}).`
  )
  A(
    `- **Permanencia ingreso → salida:** promedio **${hhmm(m.stay.avg)}**, mediana ${hhmm(m.stay.p50)}, p90 ${hhmm(m.stay.p90)} (base ${plural(m.stay.n, 'movimiento', 'movimientos')}).`
  )
  A(`- **${ton(m.ton)} toneladas netas** en ${unidad}.`)
  if (m.headline.length)
    A(
      `- **Descargas por producto:** ${m.headline.map((f) => `${f.label} ${int(f.ing)}`).join(' · ')}.`
    )
  A(`- **Por planta:** ${m.plantGroups.map((p) => `${p.label} ${int(p.n)}`).join(' · ')}.`)
  A(
    `- **Hora pico de ingreso:** ${String(m.peakHour).padStart(2, '0')}:00 con ${plural(m.hours[m.peakHour], 'ingreso', 'ingresos')}.`
  )
  if (m.calAvg !== null)
    A(
      `- **Ingreso → calado:** promedio ${hhmm(m.calAvg)} sobre ${int(m.caladoBase)} movimientos (${int(m.sinCalado)} sin calado registrado).`
    )
  if (m.deVuelta)
    A(`- **${int(m.deVuelta)} viajes de vuelta** (\`es_de_vuelta\`), incluidos en los totales.`)
  for (const line of extra) A(line)
  A()
}

function writeTables(A, m, { productLimit = 20, platformLimit = 15 } = {}) {
  A('## Por planta')
  A()
  A('| Planta | Movs | Camiones | Ingresos | Egresos | Ton netas | Permanencia prom. | Mediana | p90 |')
  A('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const p of m.plantGroups) {
    A(
      `| ${p.label} | ${int(p.n)} | ${int(p.plates)} | ${int(p.ing)} | ${int(p.egr)} | ${ton(p.ton)} | ${hhmm(p.stay.avg)} | ${hhmm(p.stay.p50)} | ${hhmm(p.stay.p90)} |`
    )
  }
  A()
  A('## Por familia de producto')
  A()
  A(
    'En las familias de descarga el titular es la columna **Descargas (INGRESO)**; los egresos son cargas o salidas de producto.'
  )
  A()
  A(
    '| Familia | Movs | Descargas (INGRESO) | Egresos | Camiones | Ton netas | De vuelta | Permanencia prom. |'
  )
  A('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const f of m.famGroups) {
    A(
      `| ${f.label} | ${int(f.n)} | ${DISCHARGE_FAMILIES.has(f.key) ? int(f.ing) : '—'} | ${int(f.egr)} | ${int(f.plates)} | ${ton(f.ton)} | ${int(f.vuelta)} | ${hhmm(f.stay.avg)} |`
    )
  }
  A()
  A('## Productos concretos')
  A()
  A('| Producto | cod_prod | Movs | Ingresos | Ton netas | Permanencia prom. |')
  A('|---|---|---:|---:|---:|---:|')
  for (const p of m.prodGroups.slice(0, productLimit)) {
    A(`| ${p.product} | ${p.cod} | ${int(p.n)} | ${int(p.ing)} | ${ton(p.ton)} | ${hhmm(p.stay.avg)} |`)
  }
  if (m.prodGroups.length > productLimit) {
    A()
    A(
      `_(${m.prodGroups.length - productLimit} productos más, con ${int(m.prodGroups.slice(productLimit).reduce((a, p) => a + p.n, 0))} movimientos.)_`
    )
  }
  A()
  A('## Plataformas / calles')
  A()
  A('| Plataforma | Movs |')
  A('|---|---:|')
  for (const [k, n] of m.platGroups.slice(0, platformLimit)) A(`| ${k} | ${int(n)} |`)
  A()
  A('## Ingresos por hora')
  A()
  A(`| Hora | ${m.hours.map((_, h) => String(h).padStart(2, '0')).join(' | ')} |`)
  A(`|---${'|---:'.repeat(24)}|`)
  A(`| Movs | ${m.hours.map((n) => int(n)).join(' | ')} |`)
  A()
}

function writeCalidad(A, m, placeholderCount) {
  A('## Calidad del dato')
  A()
  A(`- Sin ingreso o sin salida: ${int(m.stay.missing)}`)
  A(`- Salida anterior al ingreso: ${int(m.stay.negative)}`)
  A(`- Permanencia mayor a 24 h (excluida del promedio): ${int(m.stay.over)}`)
  A(`- Sin calado registrado: ${int(m.sinCalado)}`)
  A(
    `- Filas con patente ficticia (XXXXXX / PPPPPP / TTTTTT), excluidas de todos los conteos: ${int(placeholderCount)}`
  )
  A(
    `- Avisos de normalización: ${m.warns.length ? m.warns.map(([k, n]) => `${k} (${int(n)})`).join(', ') : 'ninguno'}`
  )
  A()
}

// ── Carga y reagrupación ────────────────────────────────────────────────────────
if (!existsSync(MOV_ROOT)) {
  console.error(`No existe ${MOV_ROOT}`)
  process.exit(1)
}
const folders = readdirSync(MOV_ROOT)
  .filter((d) => DAY_RE.test(d))
  .sort()
const byId = new Map()
let rawRows = 0
let duplicated = 0
for (const folder of folders) {
  const file = path.join(MOV_ROOT, folder, 'movimientos.json')
  if (!existsSync(file)) continue
  let arr
  try {
    arr = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    console.warn(`  ! partición ilegible: ${folder}`)
    continue
  }
  if (!Array.isArray(arr)) continue
  for (const row of arr) {
    rawRows += 1
    const id = String(row?.external_operation_id ?? '').trim()
    if (id && byId.has(id)) {
      duplicated += 1
      continue
    }
    byId.set(id || `__anon_${rawRows}`, { ...row, _folder: folder })
  }
}
const allRows = []
const byDay = new Map()
const placeholderByDay = new Map()
const undated = []
let placeholderRows = 0
let placeholderTons = 0
for (const row of byId.values()) {
  const day = dayOf(row.external_ingreso_at)
  if (isPlaceholderPlate(row.plate_normalized)) {
    placeholderRows += 1
    placeholderTons += num(row.kgs_neto) / 1000
    if (DAY_RE.test(day)) placeholderByDay.set(day, (placeholderByDay.get(day) ?? 0) + 1)
    continue
  }
  allRows.push(row)
  if (!DAY_RE.test(day)) {
    undated.push(row)
    continue
  }
  if (!byDay.has(day)) byDay.set(day, [])
  byDay.get(day).push(row)
}
const days = [...byDay.keys()].sort()
const byIngresoAt = (a, b) =>
  String(a.external_ingreso_at).localeCompare(String(b.external_ingreso_at))

// ── RESUMEN.md por día ─────────────────────────────────────────────────────────
const dayIndex = []
for (const day of days) {
  const rows = byDay.get(day).slice().sort(byIngresoAt)
  const outDir = path.join(MOV_ROOT, day)
  if (!existsSync(outDir)) {
    console.warn(`  ! sin carpeta para el día ${day} (${rows.length} movs) — omitido`)
    continue
  }
  const m = metricsOf(rows)
  const foreign = rows.filter((r) => r._folder !== day).length

  const L = []
  const A = (s = '') => L.push(s)
  A('---')
  A(`dia: ${day}`)
  A(`semana: ${weekStartOf(day)}_${addDays(weekStartOf(day), 6)}`)
  A('criterio_dia: ingreso')
  A(`generado: ${new Date().toISOString().slice(0, 10)}`)
  writeMetricsFrontmatter(A, m)
  A('archivos_excel:')
  for (const s of m.sources) A(`  - ${yamlStr(s)}`)
  A(`filas_guardadas_en_otra_particion: ${foreign}`)
  A('---')
  A()
  A(`# Movimientos ${day} (${dowLabel(day)})`)
  A()
  A(
    `Movimientos con **ingreso** el ${day}, deduplicados por \`external_operation_id\` sobre todo el backup.`
  )
  A(`Excel de origen: ${m.sources.map((s) => `\`${s}\``).join(', ') || '—'}.`)
  A(
    `Semana operativa: [${weekStartOf(day)} → ${addDays(weekStartOf(day), 6)}](../_semanas/${weekStartOf(day)}_${addDays(weekStartOf(day), 6)}.md).`
  )
  if (foreign)
    A(
      `> ${foreign} de estas ${rows.length} filas están guardadas físicamente en otra carpeta: el backup particiona por día de salida desde agosto.`
    )
  A()
  writeTitulares(A, m, { unidad: 'el día' })
  writeTables(A, m)
  writeCalidad(A, m, placeholderByDay.get(day) ?? 0)

  writeFileSync(path.join(outDir, 'RESUMEN.md'), L.join('\n'), 'utf8')
  dayIndex.push({
    day,
    n: m.n,
    plates: m.plates,
    ing: m.ingresos,
    egr: m.egresos,
    ton: m.ton,
    stay: m.stay,
    fam: Object.fromEntries(
      m.famGroups.map((f) => [f.key, DISCHARGE_FAMILIES.has(f.key) ? f.ing : f.n])
    ),
    plant: Object.fromEntries(m.plantGroups.map((p) => [p.key, p.n])),
  })
}

// ── Resumen semanal (jueves → miércoles), carpeta aparte ───────────────────────
const byWeek = new Map()
for (const day of days) {
  const start = weekStartOf(day)
  if (!byWeek.has(start)) byWeek.set(start, [])
  byWeek.get(start).push(day)
}
const weekStarts = [...byWeek.keys()].sort()
mkdirSync(WEEKS_DIR, { recursive: true })

const weekIndex = []
for (const start of weekStarts) {
  const end = addDays(start, 6)
  const weekDays = byWeek.get(start).slice().sort()
  const rows = weekDays.flatMap((d) => byDay.get(d)).sort(byIngresoAt)
  const m = metricsOf(rows)
  const slug = `${start}_${end}`
  // Semana parcial: el backup no cubre los 7 días (arranca el 15/05 y termina «hoy»).
  const missingDays = []
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(start, i)
    if (!byDay.has(d)) missingDays.push(d)
  }
  const placeholderWeek = weekDays.reduce((a, d) => a + (placeholderByDay.get(d) ?? 0), 0)
  const dayStats = weekDays.map((d) => ({ day: d, m: metricsOf(byDay.get(d)) }))
  const busiest = dayStats.slice().sort((a, b) => b.m.n - a.m.n)[0]
  const slowest = dayStats
    .filter((d) => d.m.stay.avg !== null)
    .sort((a, b) => b.m.stay.avg - a.m.stay.avg)[0]

  const L = []
  const A = (s = '') => L.push(s)
  A('---')
  A(`semana: ${slug}`)
  A(`desde: ${start}`)
  A(`hasta: ${end}`)
  A('semana_de: jueves-a-miercoles')
  A('criterio_dia: ingreso')
  A(`dias_con_datos: ${weekDays.length}`)
  A(`completa: ${missingDays.length === 0}`)
  A(`generado: ${new Date().toISOString().slice(0, 10)}`)
  writeMetricsFrontmatter(A, m)
  A(`promedio_movimientos_por_dia: ${Math.round(m.n / weekDays.length)}`)
  A('dias:')
  for (const s of weekDays) A(`  - ${s}`)
  A('---')
  A()
  A(`# Semana ${start} → ${end} (jueves a miércoles)`)
  A()
  A(
    `Movimientos con **ingreso** entre el ${start} y el ${end}, deduplicados por \`external_operation_id\`.`
  )
  if (missingDays.length)
    A(
      `> **Semana parcial:** ${plural(weekDays.length, 'día', 'días')} de 7 con datos. Sin movimientos en: ${missingDays.join(', ')}.`
    )
  A()
  const weekExtra = [
    `- **Promedio ${plural(Math.round(m.n / weekDays.length), 'movimiento', 'movimientos')} por día** sobre ${plural(weekDays.length, 'día', 'días')} con datos.`,
  ]
  if (busiest)
    weekExtra.push(
      `- **Día más cargado:** ${busiest.day} (${dowLabel(busiest.day)}) con ${plural(busiest.m.n, 'movimiento', 'movimientos')}.`
    )
  if (slowest)
    weekExtra.push(
      `- **Día más lento:** ${slowest.day} (${dowLabel(slowest.day)}) con permanencia promedio ${hhmm(slowest.m.stay.avg)}.`
    )
  writeTitulares(A, m, { unidad: 'la semana', extra: weekExtra })
  A('## Día por día')
  A()
  A('| Día | | Movs | Camiones | Ing | Egr | Ton netas | Permanencia prom. | Mediana | p90 |')
  A('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const { day, m: dm } of dayStats) {
    A(
      `| [${day}](../${day}/RESUMEN.md) | ${dowLabel(day)} | ${int(dm.n)} | ${int(dm.plates)} | ${int(dm.ingresos)} | ${int(dm.egresos)} | ${ton(dm.ton)} | ${hhmm(dm.stay.avg)} | ${hhmm(dm.stay.p50)} | ${hhmm(dm.stay.p90)} |`
    )
  }
  A(
    `| **Semana** | | **${int(m.n)}** | **${int(m.plates)}** | **${int(m.ingresos)}** | **${int(m.egresos)}** | **${ton(m.ton)}** | **${hhmm(m.stay.avg)}** | **${hhmm(m.stay.p50)}** | **${hhmm(m.stay.p90)}** |`
  )
  A()
  A('## Descargas día por día, por familia')
  A()
  const weekFamKeys = m.famGroups.map((f) => f.key)
  A(`| Día | | ${weekFamKeys.map((k) => familyLabel(k)).join(' | ')} |`)
  A(`|---|---${'|---:'.repeat(weekFamKeys.length)}|`)
  for (const { day, m: dm } of dayStats) {
    const cells = weekFamKeys.map((k) => {
      const f = dm.famGroups.find((x) => x.key === k)
      if (!f) return '0'
      return int(DISCHARGE_FAMILIES.has(k) ? f.ing : f.n)
    })
    A(`| [${day}](../${day}/RESUMEN.md) | ${dowLabel(day)} | ${cells.join(' | ')} |`)
  }
  A(
    `| **Semana** | | ${weekFamKeys
      .map((k) => {
        const f = m.famGroups.find((x) => x.key === k)
        return `**${int(DISCHARGE_FAMILIES.has(k) ? f.ing : f.n)}**`
      })
      .join(' | ')} |`
  )
  A()
  writeTables(A, m, { productLimit: 25, platformLimit: 20 })
  writeCalidad(A, m, placeholderWeek)

  writeFileSync(path.join(WEEKS_DIR, `${slug}.md`), L.join('\n'), 'utf8')
  weekIndex.push({
    slug,
    start,
    end,
    days: weekDays.length,
    complete: missingDays.length === 0,
    n: m.n,
    plates: m.plates,
    ing: m.ingresos,
    egr: m.egresos,
    ton: m.ton,
    stay: m.stay,
    fam: Object.fromEntries(
      m.famGroups.map((f) => [f.key, DISCHARGE_FAMILIES.has(f.key) ? f.ing : f.n])
    ),
    plant: Object.fromEntries(m.plantGroups.map((p) => [p.key, p.n])),
  })
}

// ── Índice semanal ─────────────────────────────────────────────────────────────
{
  const L = []
  const A = (s = '') => L.push(s)
  A('---')
  A(`generado: ${new Date().toISOString().slice(0, 10)}`)
  A('semana_de: jueves-a-miercoles')
  A('criterio_dia: ingreso')
  A(`semanas: ${weekIndex.length}`)
  A(`semanas_completas: ${weekIndex.filter((w) => w.complete).length}`)
  A(`movimientos: ${weekIndex.reduce((a, w) => a + w.n, 0)}`)
  A('---')
  A()
  A('# Movimientos — resumen semanal (jueves a miércoles)')
  A()
  A(
    'Agregado semanal del backup, al margen de las particiones diarias. Cada archivo `<desde>_<hasta>.md` cubre una semana operativa de **jueves a miércoles**. Regenerar con `npm run mov:resumen`.'
  )
  A()
  A(
    '> No confundir con las ventanas de `runs/windows/`, que son semanas calendario lunes→domingo. Estas semanas existen solo para lectura, no alimentan ninguna corrida del ETL.'
  )
  A()
  A('## Serie semanal')
  A()
  A(
    '| Semana (jue → mié) | Días | Movs | Camiones | Ing | Egr | Ton netas | Permanencia prom. | Mediana | p90 | Soja | Girasol | Maíz | Pellet | Aceite |'
  )
  A('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const w of weekIndex) {
    A(
      `| [${w.start} → ${w.end}](${w.slug}.md)${w.complete ? '' : ' ·parcial'} | ${w.days} | ${int(w.n)} | ${int(w.plates)} | ${int(w.ing)} | ${int(w.egr)} | ${ton(w.ton)} | ${hhmm(w.stay.avg)} | ${hhmm(w.stay.p50)} | ${hhmm(w.stay.p90)} | ${int(w.fam.SOJA ?? 0)} | ${int(w.fam.GIRASOL ?? 0)} | ${int(w.fam.MAIZ ?? 0)} | ${int(w.fam.PELLET ?? 0)} | ${int(w.fam.ACEITE_LECITINA ?? 0)} |`
    )
  }
  A()
  A('## Movimientos por planta, semana a semana')
  A()
  const plantKeys = Object.keys(PLANT_LABELS).filter((k) =>
    weekIndex.some((w) => (w.plant[k] ?? 0) > 0)
  )
  A(`| Semana (jue → mié) | ${plantKeys.map((k) => PLANT_LABELS[k]).join(' | ')} |`)
  A(`|---${'|---:'.repeat(plantKeys.length)}|`)
  for (const w of weekIndex) {
    A(
      `| [${w.start} → ${w.end}](${w.slug}.md) | ${plantKeys.map((k) => int(w.plant[k] ?? 0)).join(' | ')} |`
    )
  }
  A()
  writeFileSync(path.join(WEEKS_DIR, 'RESUMEN.md'), L.join('\n'), 'utf8')
}

// ── Índice diario ──────────────────────────────────────────────────────────────
const totalRows = dayIndex.reduce((a, d) => a + d.n, 0)
const tot = (fn) => dayIndex.reduce((a, d) => a + fn(d), 0)
const allStay = stayStats(allRows)
const I = []
const B = (s = '') => I.push(s)
B('---')
B(`generado: ${new Date().toISOString().slice(0, 10)}`)
B('criterio_dia: ingreso')
B(`dias: ${dayIndex.length}`)
B(`semanas: ${weekIndex.length}`)
B(`movimientos: ${totalRows}`)
B(`filas_leidas: ${rawRows}`)
B(`filas_duplicadas_descartadas: ${duplicated}`)
B(`filas_sin_fecha_ingreso: ${undated.length}`)
B(`filas_patente_ficticia_excluidas: ${placeholderRows}`)
B(`permanencia_prom_min: ${yamlNum(allStay.avg)}`)
B('---')
B()
B('# Movimientos — índice del backup')
B()
B(
  'Cada `data/movimientos/<día>/RESUMEN.md` tiene las conclusiones de ese día. El agregado semanal jueves→miércoles vive aparte, en [`_semanas/`](_semanas/RESUMEN.md). Regenerar todo con `npm run mov:resumen`.'
)
B()
B('## Cómo leerlo')
B()
B(
  '- **Criterio de día: ingreso.** El backup particiona por día de *salida* desde agosto y por día de *ingreso* en mayo; acá se dedupe por `external_operation_id` y se reagrupa siempre por día de ingreso, así los días son comparables entre sí.'
)
B(
  `- ${int(rawRows)} filas leídas → ${int(duplicated)} descartadas por aparecer en dos particiones → ${int(placeholderRows)} descartadas por patente ficticia → **${int(totalRows)} movimientos únicos** en ${dayIndex.length} días (${weekIndex.length} semanas).`
)
B(
  `- **Patentes ficticias excluidas.** ${int(placeholderRows)} filas del Excel vienen con patente \`XXXXXX\` / \`PPPPPP\` / \`TTTTTT\` (y variantes de 4 a 7 caracteres): son ajustes contables, no camiones, y traían pesos absurdos — ${ton(placeholderTons)} toneladas, ~29% del total. Se excluyen de movimientos, camiones, toneladas y permanencia.`
)
B(
  '- **Movimientos ≠ camiones:** una patente puede hacer varios movimientos en el día. Ambas cifras están en cada resumen.'
)
B(
  '- **Permanencia** = `external_salida_at − external_ingreso_at`, excluyendo salidas anteriores al ingreso y estadías mayores a 24 h (dato roto del Excel).'
)
B(
  '- **Familias:** Soja, Girasol, Maíz, Pellet, Aceite/Lecitina, Glicerina/Biocombustible, Biomasa (leña/chip), Subproductos/granos varios, Servicios/insumos/residuos. En las familias de descarga el titular es el movimiento `INGRESO`.'
)
B(
  '- `TERMINAL DE EMBARQUE` = San Lorenzo (terminal portuaria). Ojo: `PLANTA SAN LORENZO` del Excel se normaliza a **Ricardone**.'
)
B()
B('## Totales del período')
B()
B(
  `- **${int(totalRows)} movimientos** · ${int(tot((d) => d.ing))} ingresos · ${int(tot((d) => d.egr))} egresos · ${ton(tot((d) => d.ton))} toneladas netas.`
)
B(
  `- Permanencia promedio del período: **${hhmm(allStay.avg)}** (mediana ${hhmm(allStay.p50)}, p90 ${hhmm(allStay.p90)}, base ${int(allStay.n)} movimientos).`
)
for (const [key, label] of Object.entries(PLANT_LABELS)) {
  const n = tot((d) => d.plant[key] ?? 0)
  if (n) B(`- ${label}: ${int(n)} movimientos.`)
}
B()
B('## Descargas del período por familia')
B()
B('| Familia | Movs / descargas |')
B('|---|---:|')
const famTotals = [...FAMILIES, FAMILY_FALLBACK]
  .map(([key]) => ({ key, n: tot((d) => d.fam[key] ?? 0) }))
  .filter((f) => f.n > 0)
  .sort((a, b) => b.n - a.n)
for (const f of famTotals) B(`| ${familyLabel(f.key)} | ${int(f.n)} |`)
B()
B('## Serie diaria')
B()
B(
  '| Día | | Semana | Movs | Camiones | Ing | Egr | Ton netas | Permanencia prom. | Soja | Girasol | Maíz | Pellet | Aceite | Servicios |'
)
B('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const d of dayIndex) {
  const w = weekStartOf(d.day)
  B(
    `| [${d.day}](${d.day}/RESUMEN.md) | ${dowLabel(d.day)} | [${w}](_semanas/${w}_${addDays(w, 6)}.md) | ${int(d.n)} | ${int(d.plates)} | ${int(d.ing)} | ${int(d.egr)} | ${ton(d.ton)} | ${hhmm(d.stay.avg)} | ${int(d.fam.SOJA ?? 0)} | ${int(d.fam.GIRASOL ?? 0)} | ${int(d.fam.MAIZ ?? 0)} | ${int(d.fam.PELLET ?? 0)} | ${int(d.fam.ACEITE_LECITINA ?? 0)} | ${int(d.fam.SERVICIOS ?? 0)} |`
  )
}
B()
writeFileSync(path.join(MOV_ROOT, 'RESUMEN.md'), I.join('\n'), 'utf8')

console.log(`OK — ${dayIndex.length} RESUMEN.md por día + índice en data/movimientos/RESUMEN.md`)
console.log(
  `     ${weekIndex.length} semanas jueves→miércoles en data/movimientos/_semanas/ (${weekIndex.filter((w) => w.complete).length} completas)`
)
console.log(
  `     ${rawRows} filas leídas · ${duplicated} duplicadas · ${placeholderRows} patente ficticia · ${totalRows} movimientos únicos`
)
if (undated.length)
  console.log(`     ${undated.length} filas sin fecha de ingreso (no asignadas a ningún día)`)
