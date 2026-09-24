/**
 * Regenera `docs/MAPA_SLIDES_EXCEL.md`: de dónde sale cada dato de la presentación.
 *
 * Se arma desde `vinculos.json` y los catálogos del escritor, así que el mapa nunca queda
 * desfasado del código. Correrlo después de etiquetar o conectar un campo nuevo:
 *
 *   node scripts/gen-mapa-slides-excel.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { CHART_CATALOG, TEXT_FIELD_CATALOG } from '../server/logisticsReport/reportWorkbook.mjs'
const R = path.resolve(import.meta.dirname, '..') + '/'
const v = JSON.parse(fs.readFileSync(R + 'reportes/logistica/prueba_manual/vinculos.json', 'utf8'))

/** De dónde sale cada familia de etiquetas, en el paquete y en el ETL. */
const FUENTES = [
  [/^period\./, 'periodo', 'Período del informe (buildReportPeriod)'],
  [/^products\.|^sample\./, 'ejecutivo.porProducto', 'final_circuits → resumen ejecutivo'],
  [/^index\./, '—', 'Índice fijo de la plantilla'],
  [/^calada\./, 'actividad.<sección>.periodo', 'Tabla de calada semanal (horas, camiones/h, total); encabezados fijos'],
  [/^semana\.soja\./, 'tiempos.soja.periodo', 'circuit_timing_journeys (R7) → tramos'],
  [/^semana\.pellet\./, 'tiempos.pellet.periodo', 'circuit_timing_journeys (R30/31/32) + Excel pellet'],
  [/^semana\.girasol\./, 'tiempos.girasol.periodo', 'circuit_timing_journeys (R5+R6)'],
  [/^dia\.pellet\./, 'tiempos.pellet.porDia', 'circuit_timing_journeys, día operativo 22:00'],
  [/^dia\./, 'tiempos.soja.porDia', 'circuit_timing_journeys (R7), día operativo 22:00'],
  [/^pellet\.operativo\./, 'tiempos.pellet.porDia', 'Días con camiones de pellet; toneladas: s/d (no está en el paquete)'],
  [/^kpi\.[a-z_]+\.(Jueves|Viernes|Sábado|Domingo|Lunes|Martes|Miércoles)\./, 'actividad.<sección>.porDia', 'Modelo de actividad de cámaras del día (mismo que el panel)'],
  [/^kpi\./, 'actividad.<sección>.periodo', 'Modelo de actividad de cámaras (calada/volcables)'],
  [/^titulo\./, 'periodo.days', 'Día y fecha real de la lámina'],
  [/^fecha\./, 'periodo.days', 'Rótulo de día'],
]
const fuenteDe = (l) => FUENTES.find(([re]) => re.test(l)) ?? [null, '?', '?']

const L = []
L.push('# Mapa del informe: de dónde sale cada dato')
L.push('')
L.push('Generado desde `reportes/logistica/prueba_manual/vinculos.json` y los catálogos de')
L.push('`server/logisticsReport/reportWorkbook.mjs`. Es la referencia de qué alimenta cada lámina.')
L.push('')
L.push('**Circuito de datos:** corrida del ETL (`runs/windows/<ventana>/tables`) → paquete del informe')
L.push('(`logisticsReportPackage.ts`, o `scripts/build-report-package.ts` sin navegador) → Excel de la')
L.push('revisión → `scripts/sync-informe-slides.mjs` → la hoja y la presentación en Google (una sola versión).')
L.push('')
L.push('## Gráficos')
L.push('')
L.push('| Lámina | ID | Título | Hoja (Excel) | Política | Fuente en el paquete |')
L.push('|---|---|---|---|---|---|')
for (const c of v.charts) {
  const p = CHART_CATALOG[c.id]
  const pol = !p ? 'retirado' : p.policy + (p.allowPartial ? ' (parcial)' : '')
  L.push(`| ${c.slide} | ${c.id} | ${c.title} | ${c.sheet}!${c.start}–${c.end} | ${pol} | ${p?.source ?? p?.note ?? '—'} |`)
}
L.push('')
L.push('### Gráficos que salen directo del paquete (sin plantilla Excel)')
L.push('')
L.push('| Láminas | Pestaña de la hoja | Qué muestran | Fuente |')
L.push('|---|---|---|---|')
L.push('| 37–49 (impares) | Graficos horarios | Calada Ricardone por hora, un día | `actividad.calada_ricardone.porDia[día].porHora` |')
L.push('| 50, 51, 54, 56 | Graficos horarios | Curva horaria de la semana | `actividad.<sección>.periodo.porHora` |')
L.push('| 60–72 (pares) | Graficos horarios | Volcables puerto por hora, un día | `actividad.volcable_san_lorenzo.porDia[día].porHora` |')
L.push('| 5, 28 | Graficos circuitos | Distribución por circuito (todos los circuitos) | `ejecutivo.circuitosPorProducto` |')
L.push('')
L.push('## Textos conectados')
L.push('')
const grupos = new Map()
for (const t of v.texts) {
  if (!t.label || /^Objeto /.test(t.label)) continue
  const [, campo, desc] = fuenteDe(t.label)
  const clave = campo + '|' + desc
  const g = grupos.get(clave) ?? { campo, desc, laminas: new Set(), n: 0, conectados: 0 }
  g.laminas.add(Number(t.slide)); g.n++
  if (TEXT_FIELD_CATALOG[t.label]) g.conectados++
  grupos.set(clave, g)
}
const rango = (s) => { const a = [...s].sort((x, y) => x - y); return a.length > 4 ? `${a[0]}–${a[a.length - 1]} (${a.length})` : a.join(', ') }
L.push('| Láminas | Textos | Conectados | Campo del paquete | Origen |')
L.push('|---|---|---|---|---|')
for (const g of [...grupos.values()].sort((a, b) => Math.min(...a.laminas) - Math.min(...b.laminas))) {
  L.push(`| ${rango(g.laminas)} | ${g.n} | ${g.conectados} | \`${g.campo}\` | ${g.desc} |`)
}
L.push('')
L.push('## Lo que sigue siendo manual o sin fuente')
L.push('')
L.push('- **Conclusiones** (láminas 18, 26, 32): texto escrito a mano; el sync no las toca.')
L.push('- **Comparativo semana anterior** (lámina 7, "+58 Min"): requiere el paquete de la semana previa.')
L.push('- **Toneladas de pellet** (lámina 20): el paquete no trae toneladas → `s/d`.')
L.push('- **Históricos** (láminas 17 y 31): series ya presentadas, se conservan sin recalcular.')
fs.writeFileSync(R + 'docs/MAPA_SLIDES_EXCEL.md', L.join('\n') + '\n')
console.log('ok', L.length, 'líneas')
