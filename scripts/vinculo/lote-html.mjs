// Vista de un día del vínculo: un camión con carta por fila, cada paso de su circuito con su origen
// (cámara, reconstruido, deducido, falta) y, para los pasos sin lectura, las candidatas y el motivo.
// Uso: node scripts/vinculo/lote-html.mjs DESDE HASTA DIA   (lee reportes/vinculo/<desde>_<hasta>/cobertura.json)
import fs from 'node:fs'
import path from 'node:path'

const [FROM = '2026-10-19', TO = '2026-10-25', DAY = '2026-10-25'] = process.argv.slice(2)
const dir = path.join(process.cwd(), 'reportes/vinculo', `${FROM}_${TO}`)
const r = JSON.parse(fs.readFileSync(path.join(dir, 'cobertura.json'), 'utf8'))
const md = DAY.slice(5)
const trucks = r.camiones.filter((t) => t.lecturas.length && [...t.lecturas].sort((a, b) => a.hora.localeCompare(b.hora))[0].hora.startsWith(md))
  .map((t) => ({ ...t, first: [...t.lecturas].sort((a, b) => a.hora.localeCompare(b.hora))[0].hora }))
  .sort((a, b) => a.first.localeCompare(b.first))
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const short = (n) => n.replace('ricardone:', 'Ric · ').replace('san_lorenzo:', 'SL · ')
const tally = {}
for (const t of trucks) for (const v of Object.values(t.status)) tally[v] = (tally[v] ?? 0) + 1
const motivos = {}
for (const t of trucks) for (const h of t.huecos ?? []) if (!h.asignada) motivos[h.motivo] = (motivos[h.motivo] ?? 0) + 1
const n = Object.values(tally).reduce((a, b) => a + b, 0)
const pct = (k) => `${(((tally[k] ?? 0) / n) * 100).toFixed(1)} %`

function cell(t, node) {
  const st = t.status[node]
  const reads = t.lecturas.filter((l) => l.nodo === node)
  const h = (t.huecos ?? []).find((x) => x.nodo === node)
  let body = ''
  if (reads.length) body += `<ul>${reads.map((l) => `<li>${esc(l.hora.slice(6))} · <b>${esc(l.patente || '(sin patente)')}</b> · ${esc(l.clase)} · ${esc(l.fuente)}${l.marca ? ` · ${esc(l.marca)}` : ''}</li>`).join('')}</ul>`
  if (h?.asignada) body += `<p>Asignada: <b>${esc(h.asignada.patente)}</b> ${esc(h.asignada.hora.slice(6))} (${esc(h.asignada.fuente)}${h.asignada.marca ? `, ${esc(h.asignada.marca)}` : ''})<br>Ventana ${esc(h.desde.slice(6))}–${esc(h.hasta.slice(6))}${h.esperada ? `, esperada ${esc(h.esperada.slice(6))}` : ''}</p>`
  else if (h) body += `<p class="why">${esc(h.motivo)}</p><p>Ventana ${esc(h.desde.slice(6))}–${esc(h.hasta.slice(6))}${h.esperada ? `, esperada ${esc(h.esperada.slice(6))}` : ''} · ${h.lecturasEnVentana} lecturas libres</p>${h.candidatas?.length ? `<ul>${h.candidatas.map((c) => `<li><b>${esc(c.patente)}</b> ${esc(c.hora.slice(6))} · puntaje ${c.puntaje}${c.marca ? ` · ${esc(c.marca)}` : ''}${c.otrosCamiones.length ? ` · también encaja con ${esc(c.otrosCamiones.join(', '))}` : ''}${c.tomada ? ' · tomada por otro' : ''}</li>`).join('')}</ul>` : ''}`
  return `<td class="s-${st}"><details><summary>${{ camara: 'cámara', reconstruido: 'recup.', deducido: 'deducido', falta: 'falta' }[st] ?? st}</summary>${body}</details></td>`
}

const byCircuit = new Map()
for (const t of trucks) byCircuit.set(t.circuit, [...(byCircuit.get(t.circuit) ?? []), t])
const tables = [...byCircuit].sort((a, b) => b[1].length - a[1].length).map(([c, list]) => {
  const nodes = Object.keys(list[0].status)
  return `<h2>${esc(c)} <span>${list.length} camiones</span></h2><div class="wrap"><table><thead><tr><th>Patente</th><th>Primera lectura</th>${nodes.map((x) => `<th>${esc(short(x))}</th>`).join('')}</tr></thead><tbody>${list.map((t) => `<tr><th>${esc(t.plates.join(' / '))}<small>CTG ${esc(t.ctg)}</small></th><td>${esc(t.first.slice(6))}</td>${nodes.map((x) => cell(t, x)).join('')}</tr>`).join('')}</tbody></table></div>`
}).join('')

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lote del ${md.split('-').reverse().join('/')}</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--mut:#667085;--line:#e4e7ec;--cam:#d1fadf;--rec:#d1e9ff;--ded:#fef0c7;--fal:#fee4e2}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#11151c;--fg:#e6e9ef;--mut:#98a2b3;--line:#2a313c;--cam:#0f3d26;--rec:#123a5c;--ded:#4a3a0a;--fal:#4f1d1a}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}h2 span{color:var(--mut);font-weight:400}
.kpis{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:120px}.kpi b{display:block;font-size:22px}
.kpi.cam{background:var(--cam)}.kpi.rec{background:var(--rec)}.kpi.ded{background:var(--ded)}.kpi.fal{background:var(--fal)}
.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:4px 6px;vertical-align:top;text-align:left}
thead th{position:sticky;top:0;background:var(--bg);font-weight:600;white-space:nowrap}tbody th small{display:block;color:var(--mut);font-weight:400}
td.s-camara{background:var(--cam)}td.s-reconstruido{background:var(--rec)}td.s-deducido{background:var(--ded)}td.s-falta{background:var(--fal)}
details summary{cursor:pointer;white-space:nowrap}details[open]{min-width:260px}ul{margin:4px 0;padding-left:16px}p{margin:4px 0}.why{font-weight:600}.mut{color:var(--mut)}
</style></head><body>
<h1>Lote del ${md.split('-').reverse().join('/')}: ${trucks.length} camiones con carta</h1>
<p class="mut">Camiones cuya primera lectura fue ese día, tomados de la corrida de la semana ${FROM} → ${TO}. Tocá un paso para ver sus lecturas o, si falta, las candidatas y por qué no se asignó.</p>
<div class="kpis"><div class="kpi cam">Directo de cámaras<b>${pct('camara')}</b>${tally.camara ?? 0} pasos</div><div class="kpi rec">Recuperado por el algoritmo<b>${pct('reconstruido')}</b>${tally.reconstruido ?? 0} pasos</div><div class="kpi ded">Deducido<b>${pct('deducido')}</b>${tally.deducido ?? 0} pasos</div><div class="kpi fal">Falta<b>${pct('falta')}</b>${tally.falta ?? 0} pasos</div></div>
<p><b>Pasos sin asignar, por motivo:</b> ${Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</p>
${tables}
</body></html>`
const out = path.join(dir, `lote-${DAY}.html`)
fs.writeFileSync(out, html)
console.log(`${trucks.length} camiones · cámara ${pct('camara')} · recuperado ${pct('reconstruido')} · deducido ${pct('deducido')} · falta ${pct('falta')}\n→ ${path.relative(process.cwd(), out)}`)
