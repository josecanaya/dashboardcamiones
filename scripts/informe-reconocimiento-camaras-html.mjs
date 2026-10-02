/**
 * Página HTML del informe de reconocimiento por cámara, a partir del JSON que genera
 * `scripts/informe-reconocimiento-camaras.ts`.
 *
 * Uso: node scripts/informe-reconocimiento-camaras-html.mjs 2026-09-07_2026-09-14 ["Título"]
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const key = process.argv[2]
if (!key) {
  console.error('Uso: node scripts/informe-reconocimiento-camaras-html.mjs <from>_<to>')
  process.exit(1)
}
const dir = join(root, 'reportes/camaras', key)
const R = JSON.parse(readFileSync(join(dir, 'reconocimiento-camaras.json'), 'utf8'))

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
/** Miles con punto (formato AR) sin depender del ICU de Node. */
const n = (x) => String(Math.round(x ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const pctOf = (a) => (a.esperados ? Math.round((a.leidos / a.esperados) * 100) : null)
const MIN_N = 20
const level = (p, esperados) => {
  if (p == null) return 'na'
  if (esperados < MIN_N) return 'low'
  if (p >= 90) return 'ok'
  if (p >= 75) return 'fair'
  if (p >= 50) return 'warn'
  return 'bad'
}
const pctCell = (a) => {
  const p = pctOf(a)
  if (p == null) return `<td class="pct na">—</td>`
  return `<td class="pct ${level(p, a.esperados)}" title="${n(a.leidos)} de ${n(a.esperados)}">${p}%<small>${n(a.leidos)}/${n(a.esperados)}</small></td>`
}
const plantaLabel = { ricardone: 'Ricardone', san_lorenzo: 'Puerto San Lorenzo' }
const fmtDay = (d) => {
  const [, m, dd] = d.split('-')
  const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(`${d}T12:00:00Z`).getUTCDay()]
  return `${dow} ${Number(dd)}/${Number(m)}`
}
const fmtRange = (a, b) => `${fmtDay(a)} al ${fmtDay(b)}`

// ── Totales ────────────────────────────────────────────────────────────────────────────────
const sum = (list, k) =>
  list.reduce((acc, p) => ({ esperados: acc.esperados + p[k].esperados, leidos: acc.leidos + p[k].leidos }), { esperados: 0, leidos: 0 })
const tot = sum(R.puntos, 'total')
const totDia = sum(R.puntos, 'dia')
const totNoche = sum(R.puntos, 'noche')
const days = R.diasAnalizados ?? Object.keys(R.puntos[0]?.porDia ?? {})
const desde = days[0]
const hasta = days[days.length - 1]

// ── Hallazgos automáticos ─────────────────────────────────────────────────────────────────
const relevant = R.puntos.filter((p) => p.total.esperados >= MIN_N)
const worst = [...relevant].sort((a, b) => pctOf(a.total) - pctOf(b.total)).slice(0, 4)
const gaps = relevant
  .filter((p) => p.dia.esperados >= MIN_N && p.noche.esperados >= MIN_N)
  .map((p) => ({ p, gap: pctOf(p.dia) - pctOf(p.noche) }))
  .sort((a, b) => b.gap - a.gap)
  .slice(0, 4)
/**
 * Cámara frontal casi muda: < 5 % de las lecturas crudas de la cámara hermana más activa del punto.
 * Las calles del volcable SL quedan afuera: tienen su propio porcentaje (C4 se usa poco, no está caída).
 */
const perCameraRow = new Set(R.camaras.map((c) => c.camara))
const mute = []
for (const p of R.puntos) {
  if (p.camarasFrontales.length < 2 || p.total.esperados < MIN_N) continue
  const totals = p.camarasFrontales.filter((dv) => !perCameraRow.has(dv)).map((dv) => ({
    dv,
    t: Object.values(p.lecturasCrudasPorCamaraDia[dv] ?? {}).reduce((s, x) => s + x, 0),
  }))
  const max = Math.max(...totals.map((x) => x.t))
  for (const x of totals) if (max > 200 && x.t < max * 0.05) mute.push({ p, ...x, max })
}
/**
 * Cámara activa que un día con operación normal casi no mandó lecturas. Un día de volumen bajo
 * (domingo) no es falla de cámara: solo cuentan días con al menos la mitad del promedio esperado.
 */
const deadDays = []
for (const p of R.puntos) {
  const expByDay = Object.fromEntries(days.map((d) => [d, p.porDia[d].dia.esperados + p.porDia[d].noche.esperados]))
  const avgExp = Object.values(expByDay).reduce((s, x) => s + x, 0) / Math.max(days.length, 1)
  // Solo puntos de una cámara: en calada y calles del volcable las cámaras se usan por turnos.
  if (p.camarasFrontales.length !== 1) continue
  for (const dv of p.camarasFrontales) {
    const perDay = p.lecturasCrudasPorCamaraDia[dv] ?? {}
    const vals = Object.values(perDay)
    const avg = vals.reduce((s, x) => s + x, 0) / Math.max(vals.length, 1)
    if (avg < 40) continue
    const low = Object.entries(perDay).filter(([d, v]) => v < avg * 0.1 && expByDay[d] >= avgExp * 0.5)
    if (low.length) deadDays.push({ p, dv, days: low.map(([d]) => d) })
  }
}

// ── Tablas ────────────────────────────────────────────────────────────────────────────────
const puntosRows = (planta) =>
  R.puntos
    .filter((p) => p.planta === planta)
    .map((p) => {
      const pd = pctOf(p.dia)
      const pn = pctOf(p.noche)
      const gap = pd != null && pn != null && p.dia.esperados >= MIN_N && p.noche.esperados >= MIN_N ? pd - pn : null
      const circ = Object.entries(p.circuitos)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${c} ${n(v)}`)
        .join(' · ')
      const pt = pctOf(p.total)
      return `<tr>
        <th scope="row"><span class="pname">${esc(p.punto)}</span><span class="code">${esc(p.codigo ?? '')}</span><span class="cams">${p.camarasFrontales.map(esc).join(', ')}</span></th>
        <td class="num">${n(p.total.esperados)}</td>
        <td class="num">${n(p.total.leidos)}</td>
        <td class="bar-cell"><div class="bar ${level(pt, p.total.esperados)}"><span style="width:${pt ?? 0}%"></span></div><b>${pt ?? '—'}%</b></td>
        ${pctCell(p.dia)}
        ${pctCell(p.noche)}
        <td class="num gap ${gap != null && gap >= 20 ? 'hot' : ''}">${gap == null ? '—' : (gap > 0 ? '+' : '') + gap}</td>
        <td class="circ">${esc(circ)}</td>
      </tr>`
    })
    .join('')

const camRows = R.camaras
  .map((c) => {
    const f = c.fallasLpr
    return `<tr>
      <th scope="row"><span class="mono">${esc(c.camara)}</span><span class="cams">${esc(plantaLabel[c.planta])} · ${esc(c.punto)}</span></th>
      <td class="num">${n(c.total.esperados)}</td>
      ${pctCell(c.total)}
      ${pctCell(c.dia)}
      ${pctCell(c.noche)}
      <td class="num">${n(f.dia)}</td>
      <td class="num">${n(f.noche)}</td>
    </tr>`
  })
  .join('')

const heatRows = R.puntos
  .filter((p) => p.total.esperados >= MIN_N)
  .map((p) => {
    const cells = days
      .map((d) => {
        const v = p.porDia[d]
        const cell = (a, cls) => {
          const pp = pctOf(a)
          if (pp == null) return `<td class="hm ${cls} na">·</td>`
          return `<td class="hm ${cls} ${level(pp, a.esperados * 4)}" title="${fmtDay(d)} ${cls === 'd' ? 'día' : 'noche'}: ${n(a.leidos)} de ${n(a.esperados)}">${pp}</td>`
        }
        return cell(v.dia, 'd') + cell(v.noche, 'n')
      })
      .join('')
    return `<tr><th scope="row">${esc(p.punto)}<span class="cams">${esc(plantaLabel[p.planta])}</span></th>${cells}</tr>`
  })
  .join('')

const rawRows = R.puntos
  .filter((p) => p.camarasFrontales.length > 1 && p.total.esperados >= MIN_N)
  .map((p) => {
    const devs = p.camarasFrontales
    return devs
      .map((dv, i) => {
        const perDay = p.lecturasCrudasPorCamaraDia[dv] ?? {}
        const vals = days.map((d) => perDay[d] ?? 0)
        const total = vals.reduce((s, x) => s + x, 0)
        const matched = p.lecturasPorCamara[dv] ?? 0
        return `<tr class="${i === 0 ? 'grp' : ''}">
          ${i === 0 ? `<th scope="rowgroup" rowspan="${devs.length}">${esc(p.punto)}<span class="cams">${esc(plantaLabel[p.planta])} · ${pctOf(p.total)}% del punto</span></th>` : ''}
          <td class="mono">${esc(dv)}</td>
          ${vals.map((v) => `<td class="num raw ${v === 0 ? 'zero' : v < 10 ? 'few' : ''}">${n(v)}</td>`).join('')}
          <td class="num"><b>${n(total)}</b></td>
          <td class="num">${n(matched)}</td>
        </tr>`
      })
      .join('')
  })
  .join('')

// ── Camiones leídos (por movimiento) ──────────────────────────────────────────────────────
const C = R.camionesLeidos
const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const distKeys = Object.keys(C.distribucionPuntos).map(Number).sort((a, b) => a - b)
const distMax = Math.max(...Object.values(C.distribucionPuntos))
const distBars = distKeys
  .map((k) => {
    const v = C.distribucionPuntos[k]
    return `<div class="dist-col" title="${n(v)} camiones con ${k} puntos leídos"><span class="dist-v">${n(v)}</span><span class="dist-bar ${k === 0 ? 'zero' : k < 3 ? 'few' : ''}" style="height:${Math.max(2, Math.round((v / distMax) * 120))}px"></span><span class="dist-k">${k}</span></div>`
  })
  .join('')
const circRows = Object.entries(C.porCircuito)
  .sort((a, b) => b[1].total - a[1].total)
  .map(([c, v]) => `<tr><th scope="row">${esc(c)}</th><td class="num">${n(v.total)}</td>
    <td class="num">${n(v.algunPunto)} <small class="muted">${pc(v.algunPunto, v.total)}%</small></td>
    <td class="num">${n(v.alMenos3Puntos)} <small class="muted">${pc(v.alMenos3Puntos, v.total)}%</small></td>
    <td class="num">${n(v.total - v.algunPunto)}</td></tr>`)
  .join('')
const camionesSection = `<section>
  <h2>Camiones leídos</h2>
  <p class="lede">Sobre los ${n(C.total)} camiones del período: cuántos quedaron registrados por al menos una cámara y cuántos por al menos 3 puntos de control distintos de su recorrido.</p>
  <div class="kpis">
    <div class="kpi"><span class="v">${pc(C.algunPunto, C.total)}%</span><span class="l">leídos en alguna cámara: ${n(C.algunPunto)} de ${n(C.total)}</span></div>
    <div class="kpi dia"><span class="v">${pc(C.alMenos3Puntos, C.total)}%</span><span class="l">leídos en 3 puntos o más: ${n(C.alMenos3Puntos)} de ${n(C.total)}</span></div>
    <div class="kpi"><span class="v">${pc(C.todosLosPuntos, C.total)}%</span><span class="l">leídos en todos los puntos de su circuito: ${n(C.todosLosPuntos)}</span></div>
    <div class="kpi noche"><span class="v">${n(C.total - C.algunPunto)}</span><span class="l">camiones sin ninguna lectura</span></div>
  </div>
  <div class="split">
    <div class="dist-wrap"><h3>Camiones según cuántos puntos se leyeron</h3><div class="dist">${distBars}</div><p class="muted small">Puntos de control leídos por camión (0 = ninguna lectura).</p></div>
    <div class="scroll"><table>
      <thead><tr><th>Circuito</th><th class="num">Camiones</th><th class="num">Alguna cámara</th><th class="num">3 puntos o más</th><th class="num">Sin lectura</th></tr></thead>
      <tbody>${circRows}</tbody>
    </table></div>
  </div>
</section>`

// ── Semana a semana ───────────────────────────────────────────────────────────────────────
const W = R.semanas ?? []
const wTot = (w, k) => sum(w.puntos, k)
const weekLabel = (w) => (w.desde === w.hasta ? fmtDay(w.desde) : `${fmtDay(w.desde)} – ${fmtDay(w.hasta)}`)
const weekSummaryRows = W.map((w) => {
  const c = w.camionesLeidos
  const t = wTot(w, 'total')
  const d = wTot(w, 'dia')
  const nn = wTot(w, 'noche')
  return `<tr><th scope="row">${esc(weekLabel(w))}</th>
    <td class="num">${n(c.total)}</td>
    ${pctCell({ leidos: c.algunPunto, esperados: c.total })}
    ${pctCell({ leidos: c.alMenos3Puntos, esperados: c.total })}
    ${pctCell(t)}${pctCell(d)}${pctCell(nn)}</tr>`
}).join('')
const weekNodeRows = (planta) =>
  R.puntos
    .filter((p) => p.planta === planta && p.total.esperados >= MIN_N)
    .map((p) => {
      const cells = W.map((w) => {
        const q = w.puntos.find((x) => x.nodeId === p.nodeId)
        if (!q) return '<td class="pct na">—</td><td class="pct na"></td><td class="pct na wk-end"></td>'
        return pctCell(q.total) + pctCell(q.dia) + pctCell(q.noche).replace('class="pct', 'class="pct wk-end')
      }).join('')
      return `<tr><th scope="row"><span class="pname">${esc(p.punto)}</span></th>${cells}</tr>`
    })
    .join('')
const semanasSection = W.length
  ? `<section>
  <h2>Semana a semana</h2>
  <p class="lede">Semanas de lunes a domingo. Cada camión cuenta en la semana de su salida.</p>
  <div class="scroll"><table>
    <thead><tr><th>Semana</th><th class="num">Camiones</th><th class="num">Alguna cámara</th><th class="num">3 puntos o más</th><th class="num">Pasos leídos</th><th class="num">Día</th><th class="num">Noche</th></tr></thead>
    <tbody>${weekSummaryRows}</tbody>
  </table></div>
  <h3>Por punto de control</h3>
  <div class="scroll"><table class="wk">
    <thead>
      <tr class="hm-head"><th rowspan="2">Punto</th>${W.map((w) => `<th colspan="3" class="wk-end">${esc(weekLabel(w))}</th>`).join('')}</tr>
      <tr class="hm-head">${W.map(() => '<th>Total</th><th>Día</th><th class="wk-end">Noche</th>').join('')}</tr>
    </thead>
    <tbody>
      <tr class="planta-row"><th colspan="${1 + W.length * 3}">Ricardone</th></tr>
      ${weekNodeRows('ricardone')}
      <tr class="planta-row"><th colspan="${1 + W.length * 3}">Puerto San Lorenzo</th></tr>
      ${weekNodeRows('san_lorenzo')}
    </tbody>
  </table></div>
</section>`
  : ''

const li = (s) => `<li>${s}</li>`
const findings = [
  ...worst.map(
    (p) =>
      `<b>${esc(p.punto)}</b> (${esc(plantaLabel[p.planta])}) leyó ${pctOf(p.total)}% de ${n(p.total.esperados)} pasos esperados.`
  ),
]
const gapText = gaps
  .filter((g) => g.gap >= 15)
  .map((g) => `<b>${esc(g.p.punto)}</b> ${esc(plantaLabel[g.p.planta])}: ${pctOf(g.p.dia)}% de día contra ${pctOf(g.p.noche)}% de noche`)
const muteText = mute.map(
  (m) =>
    `<span class="mono">${esc(m.dv)}</span> (${esc(m.p.punto)}, ${esc(plantaLabel[m.p.planta])}) casi no reporta: ${n(m.t)} lecturas en el período contra ${n(m.max)} de su cámara hermana.`
)
const deadText = deadDays.map(
  (x) => `<span class="mono">${esc(x.dv)}</span> (${esc(x.p.punto)}) sin lecturas o casi sin lecturas el ${x.days.map(fmtDay).join(', ')}.`
)

const excluded = R.universo.movimientosSinCircuito
const circList = Object.entries(R.universo.porCircuito)
  .sort((a, b) => b[1] - a[1])
  .map(([c, v]) => `${c} ${n(v)}`)
  .join(' · ')

/** Nombre del informe: 3er argumento opcional (p. ej. "Lectura de cámaras septiembre"). */
const pageTitle = process.argv[3] || 'Lectura de cámaras Nodo Sur'
const html = `<title>${esc(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: informe de una columna; resumen arriba, tablas por planta en orden de recorrido, detalle al final. */
:root {
  --bg: #f6f8f5; --surface: #ffffff; --fg: #17221b; --muted: #5d6b62; --line: #dde4de;
  --accent: #1f7a4a; --accent-2: #6a4bb3;
  --ok: #1f7a4a; --ok-bg: #dcefe3; --fair: #5e8c2f; --fair-bg: #ebf3d9;
  --warn: #a8660b; --warn-bg: #fbeccd; --bad: #b3261e; --bad-bg: #f8dcd9; --na-bg: #eef1ee;
  --f-display: "Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif;
  --f-body: "Barlow", system-ui, -apple-system, "Segoe UI", sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #111713; --surface: #18201b; --fg: #e5ece6; --muted: #9aa89f; --line: #2b362f;
  --accent: #5cc58b; --accent-2: #a98ce8;
  --ok: #6fd39b; --ok-bg: #1d3a2a; --fair: #b3d57a; --fair-bg: #2c3a1c; --warn: #f0b659; --warn-bg: #3d2e12; --bad: #ff8a80; --bad-bg: #45201d; --na-bg: #1f2822;
  color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #111713; --surface: #18201b; --fg: #e5ece6; --muted: #9aa89f; --line: #2b362f;
  --accent: #5cc58b; --accent-2: #a98ce8;
  --ok: #6fd39b; --ok-bg: #1d3a2a; --fair: #b3d57a; --fair-bg: #2c3a1c; --warn: #f0b659; --warn-bg: #3d2e12; --bad: #ff8a80; --bad-bg: #45201d; --na-bg: #1f2822;
  color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 400 15px/1.5 var(--f-body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 20px; padding-block: 32px 64px; display: grid; gap: 40px; }
h1, h2, h3 { font-family: var(--f-display); text-wrap: balance; margin: 0; letter-spacing: .005em; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 700; line-height: 1.05; }
h2 { font-size: 24px; font-weight: 600; }
h3 { font-size: 18px; font-weight: 600; }
p { margin: 0; max-width: 72ch; }
.eyebrow { font: 600 12px/1 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--accent-2); }
header { display: grid; gap: 10px; }
.meta { color: var(--muted); font-size: 13px; font-family: var(--f-mono); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; display: grid; gap: 2px; }
.kpi .v { font: 700 36px/1.1 var(--f-display); font-variant-numeric: tabular-nums; }
.kpi .l { color: var(--muted); font-size: 13px; }
.kpi.dia .v { color: var(--accent); } .kpi.noche .v { color: var(--accent-2); }
section { display: grid; gap: 14px; min-width: 0; }
.lede { color: var(--muted); }
.findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.findings > div { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; min-width: 0; }
.findings ul { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
thead th { font: 600 12px/1.2 var(--f-display); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--bg); position: sticky; top: 0; white-space: nowrap; }
tbody tr:last-child > * { border-bottom: 0; }
tbody th { font-weight: 500; min-width: 180px; }
.pname { display: inline; font-weight: 600; }
.code { font: 500 11px var(--f-mono); color: var(--muted); margin-left: 6px; }
.cams { display: block; font: 400 11.5px/1.35 var(--f-mono); color: var(--muted); margin-top: 2px; }
.mono { font-family: var(--f-mono); font-size: 13px; }
.num { text-align: right; white-space: nowrap; }
.pct { text-align: right; white-space: nowrap; font-weight: 600; border-left: 3px solid transparent; }
.pct small { display: block; font: 400 11px var(--f-mono); color: var(--muted); }
.pct.ok { color: var(--ok); } .pct.fair { color: var(--fair); } .pct.warn { color: var(--warn); } .pct.bad { color: var(--bad); }
.pct.bad { background: var(--bad-bg); } .pct.warn { background: var(--warn-bg); }
.pct.low, .pct.na { color: var(--muted); }
.bar-cell { min-width: 150px; white-space: nowrap; }
.bar-cell b { font: 700 16px var(--f-display); margin-left: 8px; vertical-align: middle; }
.bar { display: inline-block; vertical-align: middle; width: 96px; height: 8px; border-radius: 4px; background: var(--na-bg); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--muted); }
.bar.ok span { background: var(--ok); } .bar.fair span { background: var(--fair); } .bar.warn span { background: var(--warn); } .bar.bad span { background: var(--bad); }
.gap.hot { color: var(--accent-2); font-weight: 700; }
.circ { font: 400 12px var(--f-mono); color: var(--muted); min-width: 160px; }
.planta-row th { background: var(--bg); font: 700 13px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.hm { text-align: center; font: 500 12px var(--f-mono); padding: 6px 4px; min-width: 34px; }
.hm.n { border-right: 1px solid var(--line); }
.hm.ok { background: var(--ok-bg); color: var(--ok); } .hm.fair { background: var(--fair-bg); color: var(--fair); }
.hm.warn { background: var(--warn-bg); color: var(--warn); } .hm.bad { background: var(--bad-bg); color: var(--bad); }
.hm.low, .hm.na { color: var(--muted); }
.hm-head th { text-align: center; }
.raw.zero { color: var(--bad); font-weight: 600; background: var(--bad-bg); } .raw.few { color: var(--warn); }
tr.grp > * { border-top: 2px solid var(--line); }
.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--muted); }
.legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; background: var(--c); }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 760px) { .split { grid-template-columns: 1fr; } }
.dist-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; }
.dist { display: flex; align-items: flex-end; gap: 6px; height: 170px; }
.dist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
.dist-bar { width: 100%; max-width: 38px; background: var(--accent); border-radius: 3px 3px 0 0; }
.dist-bar.zero { background: var(--bad); } .dist-bar.few { background: var(--warn); }
.dist-v { font: 500 11px var(--f-mono); color: var(--muted); }
.dist-k { font: 600 13px var(--f-display); border-top: 1px solid var(--line); width: 100%; text-align: center; padding-top: 2px; }
.wk .pct small { display: none; } .wk .pct { font-size: 13px; padding: 6px 8px; } .wk-end { border-right: 1px solid var(--line); }
.muted { color: var(--muted); } .small { font-size: 12.5px; }
.method { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 16px 18px; display: grid; gap: 8px; font-size: 14px; }
.method ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.method p, .method li { max-width: 90ch; }
</style>

<div class="wrap">
<header>
  <span class="eyebrow">Auditoría de cámaras · Ricardone y Puerto San Lorenzo</span>
  <h1>Lectura de cámaras por punto de control</h1>
  <p class="lede">De los camiones que tenían que pasar por cada cámara según su circuito, cuántos leyó. Movimientos con salida del ${fmtRange(desde, hasta)}.</p>
  <p class="meta">Corridas ${R.runIds.map(esc).join(' + ')} · ${R.rulesVersions.map(esc).join(', ')} · tabla excel_operations_with_truckflow + eventos y alertas crudas Truckflow</p>
</header>

<div class="kpis">
  <div class="kpi"><span class="v">${pctOf(tot)}%</span><span class="l">pasos leídos: ${n(tot.leidos)} de ${n(tot.esperados)}</span></div>
  <div class="kpi dia"><span class="v">${pctOf(totDia)}%</span><span class="l">de día (06 a 18 h): ${n(totDia.leidos)} de ${n(totDia.esperados)}</span></div>
  <div class="kpi noche"><span class="v">${pctOf(totNoche)}%</span><span class="l">de noche (18 a 06 h): ${n(totNoche.leidos)} de ${n(totNoche.esperados)}</span></div>
  <div class="kpi"><span class="v">${n(R.universo.movimientosEvaluados)}</span><span class="l">movimientos Excel evaluados</span></div>
</div>

${semanasSection}

${camionesSection}

<section>
  <h2>Qué mirar</h2>
  <div class="findings">
    <div><h3>Puntos con menor lectura</h3><ul>${findings.map(li).join('')}</ul></div>
    <div><h3>Mayor caída de noche</h3><ul>${gapText.map(li).join('') || li('Sin diferencias mayores a 15 puntos.')}</ul></div>
    <div><h3>Cámaras que no reportan</h3><ul>${[...muteText, ...deadText].map(li).join('') || li('Todas las cámaras reportaron todos los días.')}</ul></div>
  </div>
</section>

<section>
  <h2>Reconocimiento por punto</h2>
  <p class="lede">Un punto puede tener varias cámaras (una por calle o carril). Se cuenta leído si cualquiera de sus cámaras frontales leyó la patente. La columna Δ es la diferencia en puntos entre día y noche.</p>
  <div class="legend"><span style="--c:var(--ok)">90% o más</span><span style="--c:var(--fair)">75 a 89%</span><span style="--c:var(--warn)">50 a 74%</span><span style="--c:var(--bad)">menos de 50%</span><span style="--c:var(--na-bg)">menos de ${MIN_N} camiones: sin color</span></div>
  <div class="scroll"><table>
    <thead><tr><th>Punto · cámaras</th><th class="num">Esperados</th><th class="num">Leídos</th><th>Total</th><th class="num">Día</th><th class="num">Noche</th><th class="num">Δ</th><th>Circuitos que pasan</th></tr></thead>
    <tbody>
      <tr class="planta-row"><th colspan="8">Ricardone</th></tr>
      ${puntosRows('ricardone')}
      <tr class="planta-row"><th colspan="8">Puerto San Lorenzo</th></tr>
      ${puntosRows('san_lorenzo')}
    </tbody>
  </table></div>
</section>

<section>
  <h2>Reconocimiento por cámara</h2>
  <p class="lede">Solo cámaras por las que el camión pasa sí o sí: puntos de un solo carril y las calles del volcable del puerto, donde la calle sale del Excel (VOLCABLE PTO 1 a 5). Fallas LPR: veces que la cámara detectó un vehículo pero no pudo leer una patente válida.</p>
  <div class="scroll"><table>
    <thead><tr><th>Cámara</th><th class="num">Esperados</th><th class="num">Total</th><th class="num">Día</th><th class="num">Noche</th><th class="num">Fallas LPR día</th><th class="num">Fallas LPR noche</th></tr></thead>
    <tbody>${camRows}</tbody>
  </table></div>
</section>

<section>
  <h2>Día por día</h2>
  <p class="lede">Porcentaje leído por punto, cada día separado en día (D) y noche (N). Pasá el cursor sobre una celda para ver leídos y esperados.</p>
  <div class="scroll"><table>
    <thead>
      <tr class="hm-head"><th rowspan="2">Punto</th>${days.map((d) => `<th colspan="2">${fmtDay(d)}</th>`).join('')}</tr>
      <tr class="hm-head">${days.map(() => '<th>D</th><th>N</th>').join('')}</tr>
    </thead>
    <tbody>${heatRows}</tbody>
  </table></div>
</section>

<section>
  <h2>Lecturas crudas en puntos de varias cámaras</h2>
  <p class="lede">En calada, balanzas y salidas con varios carriles no se sabe por qué calle pasó cada camión, así que no hay porcentaje por cámara. Estas son las lecturas que mandó cada cámara por día (con y sin journey). Una cámara en cero mientras su hermana trabaja indica que está fuera de servicio. La última columna cuenta cuántos camiones esperados leyó.</p>
  <div class="scroll"><table>
    <thead><tr><th>Punto</th><th>Cámara</th>${days.map((d) => `<th class="num">${fmtDay(d)}</th>`).join('')}<th class="num">Total</th><th class="num">Camiones leídos</th></tr></thead>
    <tbody>${rawRows}</tbody>
  </table></div>
</section>

<section class="method">
  <h2>Cómo se calcula</h2>
  <ul>
    <li><b>Universo:</b> ${n(R.universo.movimientosEvaluados)} movimientos del Excel de Movimientos por Contrato con salida del ${fmtRange(desde, hasta)} y circuito asignado por el Excel (${esc(circList)}). Quedan fuera ${n(excluded)} movimientos sin circuito resuelto, ${n(R.universo.patentesFicticiasExcluidas)} con patente ficticia (XXXXXX, PPPPPP, TTTTTT) y los de plantas sin cámaras del Nodo Sur (${Object.entries(R.universo.otraPlantaExcluidos ?? {}).map(([k, v]) => `${esc(k)} ${n(v)}`).join(', ')}).</li>
    <li><b>Cámaras esperadas:</b> los puntos con cámara del recorrido de cada circuito en el modelo de nodos del Nodo Sur. Las plataformas volcables del puerto se esperan solo si el Excel indica VOLCABLE PTO.</li>
    <li><b>Leído:</b> una lectura de una cámara frontal del punto con la patente del movimiento, exacta o con un error de OCR tolerable, entre 45 minutos antes del ingreso y 45 minutos después de la salida del Excel. Se usan eventos de journey y también alertas (ruta inválida, inicio inválido), porque en esos casos la cámara leyó la patente aunque el sistema no la asignó a un recorrido.</li>
    <li><b>Día y noche:</b> día de 06 a 18 h, noche de 18 a 06 h, hora Argentina, según la hora de la lectura. Si la cámara no leyó, se toma la hora estimada entre las lecturas vecinas del mismo camión.</li>
    <li><b>Cámaras traseras:</b> no se incluyen. Leen la patente del acoplado, que no es la patente del chasis que figura en el Excel.</li>
    <li><b>Camiones leídos:</b> un camión cuenta en 3 puntos o más cuando lo leyeron cámaras frontales de al menos 3 puntos de control distintos de su recorrido (por ejemplo ingreso, calada y salida).</li>
    <li><b>Límite:</b> el circuito sale del Excel, no de la cámara, para no depender de lo que se leyó. Los transiles de soja desde silos que el Excel marca como R7 pasan por balanza en Ricardone pero no se esperan ahí, así que la balanza puede tener lecturas de camiones que no están en su denominador.</li>
  </ul>
</section>
</div>
`
writeFileSync(join(dir, 'informe-reconocimiento-camaras.html'), html, 'utf8')
console.log(join(dir, 'informe-reconocimiento-camaras.html'))
