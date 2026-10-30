// Orden de trabajo de cámaras para técnicos, 21/10 00:00 → 27/10 12:00, desde sectores.json + camaras-detalle.json.
const fs = require('fs')
const R = 'C:/Users/Usuario/Desktop/Dashboard_camiones/'
const DIR = R + 'reportes/camaras/2026-10-21_2026-10-27/'
const J = require(DIR + 'sectores.json')
const C = require(DIR + 'camaras-detalle.json')
const S = Object.fromEntries(J.sectores.map((s) => [s.sector, s]))

// Capturas crudas para marcar «sin señal» (la cámara no registró nada ±30 min del paso).
const days = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']
const capsByDev = new Map()
const push = (d, t) => { if (!capsByDev.has(d)) capsByDev.set(d, []); capsByDev.get(d).push(t) }
for (const d of days) {
  for (const e of require(R + `data/truckflow/${d}/event-list.json`).records) {
    let t = Date.parse(e.occurredAt); const c = Date.parse(e.createdAt)
    t += Math.abs(c - t) < 3600e3 ? 0 : 206 * 60e3
    push(e.deviceCode, t)
  }
  for (const a of require(R + `data/truckflow/${d}/alert-list.json`).records || []) push(a.deviceCode, Date.parse(a.createdAt))
}
const toMs = (h) => Date.parse('2026-' + h.replace(' ', 'T') + ':00-03:00')
const sinSenal = (s, hora) => { const t = toMs(hora); return !s.camaras.some((d) => (capsByDev.get(d) || []).some((x) => Math.abs(x - t) <= 30 * 60e3)) }

const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const n = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const pctInv = (dev, fr) => { const v = C[dev][fr]; return v.n ? Math.round((100 * v.inv) / v.n) : 0 }
const fecha = (h) => { const [md, hm] = h.split(' '); const [m, d] = md.split('-'); return `${d}/${m} ${hm}` }

const ORDENES = [
  {
    prio: 'alta', planta: 'Ricardone', sector: 'ricardone:Ingreso', camaras: 'RicIngCamFrente',
    problema: (s) => `Deja pasar camiones sin tomarlos: ${s.total.noTomados} de ${n(s.total.pasaron)} (${100 - s.total.pctTomados} %), parejo de día (${s.dia.noTomados}) y de noche (${s.noche.noTomados}). En casi todos los casos la cámara estaba tomando otros camiones en ese momento: no es un corte, se le escapan.`,
    acciones: ['enfoque', 'limpieza', 'conectividad'],
    detalle: 'Revisar zona de disparo y encuadre para camiones que entran pegados. Sigue con los problemas de conectividad reportados.',
  },
  {
    prio: 'alta', planta: 'Ricardone', sector: 'ricardone:Balanzas', camaras: 'RicB1Ingreso · RicB2Ingreso · RicB2Egreso',
    problema: (s) => `Toma ${s.total.pctTomados} % de los camiones pero lee la patente en ${s.total.pctLeidos} %. De noche lee ${s.noche.pctLeidos} % (de día ${s.dia.pctLeidos} %). RicB1Ingreso: ${pctInv('RicB1Ingreso', 'noche')} % de lecturas inválidas de noche; RicB2Ingreso: ${pctInv('RicB2Ingreso', 'dia')} % de día.`,
    acciones: ['iluminacion', 'enfoque'],
    detalle: 'Las tres balanzas se usan en los dos sentidos: la cámara de egreso de B2 lee el aceite que entra. Pesadas de entrada y de salida medidas contra la hora del sistema de balanza.',
  },
  {
    prio: 'alta', planta: 'Puerto San Lorenzo', sector: 'san_lorenzo:Plataformas Volcables', camaras: 'SLZVolcableC5 · SLZVolcableC2',
    problema: (s) => `De noche no toma ${s.noche.noTomados} de ${s.noche.pasaron} camiones y lee ${s.noche.pctLeidos} % (de día ${s.dia.pctLeidos} %). Calle 5: ${pctInv('SLZVolcableC5', 'noche')} % de lecturas inválidas de noche contra ${pctInv('SLZVolcableC5', 'dia')} % de día. Calle 2: ${pctInv('SLZVolcableC2', 'noche')} % de noche.`,
    acciones: ['iluminacion', 'limpieza'],
    detalle: 'Casi todo el grano descargó por la calle 5. El sistema de balanza no informa la calle, así que el volcable se mide como un sector.',
  },
  {
    prio: 'alta', planta: 'Puerto San Lorenzo', sector: 'san_lorenzo:Balanza Ingreso', camaras: 'SLZBalIngFte',
    problema: (s) => `De noche no toma ${s.noche.noTomados} de ${s.noche.pasaron} camiones (toma ${s.noche.pctTomados} %, de día ${s.dia.pctTomados} %). La caída es nocturna.`,
    acciones: ['iluminacion'],
    detalle: 'Concentrado entre las 0 y las 3 h y entre las 16 y las 20 h.',
  },
  {
    prio: 'media', planta: 'Puerto San Lorenzo', sector: 'san_lorenzo:Balanza Egreso', camaras: 'SLZBalSC2Fte · SLZBalSC1Fte',
    problema: (s) => `${s.total.noTomados} camiones sin tomar; de noche lee ${s.noche.pctLeidos} % (de día ${s.dia.pctLeidos} %). El 21/10 entre las 13 y las 14 h no registró nada mientras salían camiones. SLZBalSC1Fte: ${pctInv('SLZBalSC1Fte', 'dia')} % de lecturas inválidas de día.`,
    acciones: ['iluminacion', 'enfoque', 'conectividad'],
    detalle: 'Medido contra la hora de pesada de salida del sistema de balanza (±12 min). Los líquidos SL2 pesan en la balanza de líquidos y quedan fuera.',
  },
  {
    prio: 'media', planta: 'Puerto San Lorenzo', sector: 'san_lorenzo:Carga/descarga', camaras: 'SLZBalLiq1b · SLZBalLiq2a',
    problema: (s) => `De día toma todo; de noche toma ${s.noche.tomados} de ${s.noche.pasaron}. SLZBalLiq1b: ${pctInv('SLZBalLiq1b', 'dia')} % de lecturas inválidas.`,
    acciones: ['iluminacion', 'enfoque'],
    detalle: 'Poco volumen (40 pasos), pero la falla nocturna es clara.',
  },
  {
    prio: 'media', planta: 'Ricardone', sector: 'ricardone:Calada', camaras: 'RicCal04 · RicCal03 · RicCalLiq',
    problema: (s) => `Toma ${s.total.pctTomados} %. De noche lee ${s.noche.pctLeidos} % (de día ${s.dia.pctLeidos} %); RicCal04 da ${pctInv('RicCal04', 'noche')} % de lecturas inválidas de noche. Sin señal el 23/10 a las 19 h y el 24/10 entre las 19 y las 22 h.`,
    acciones: ['iluminacion', 'conectividad'],
    detalle: 'Se usan las calles 3 y 4 (y la de líquidos). Las calles 1, 2, 5 y 6 no se usan: no son falla.',
  },
  {
    prio: 'media', planta: 'Ricardone', sector: 'ricardone:Salida 2', camaras: 'RicEgrCamFrente',
    problema: (s) => `Toma ${s.total.pctTomados} %, pero de noche lee ${s.noche.pctLeidos} % (de día ${s.dia.pctLeidos} %): ${pctInv('RicEgrCamFrente', 'noche')} % de lecturas inválidas de noche.`,
    acciones: ['iluminacion'],
    detalle: 'Captura bien; el problema es leer la chapa de noche.',
  },
  {
    prio: 'media', planta: 'Ambas plantas', sector: null, camaras: 'Traseras: RicIngCamTrasera · RicPreIngInTr · RicEgrCamTraser · SLZIngCamTrasera · SLZBalIngTras · SLZBalSC1Tras',
    problema: () => `Entre ${pctInv('SLZBalIngTras', 'dia')} % y ${pctInv('SLZIngCamTrasera', 'noche')} % de sus lecturas son inválidas. Leen la marca del acoplado (HERMANN, VULCANO, OMBU, HELVETICA) en vez de la patente.`,
    acciones: ['enfoque'],
    detalle: 'Bajar el encuadre hacia la chapa del acoplado. Las traseras no tienen porcentaje de toma: el sistema solo exporta sus lecturas fallidas.',
  },
  {
    prio: 'baja', planta: 'Puerto San Lorenzo', sector: 'san_lorenzo:Carga / Descarga OSL', camaras: 'RenCargFte · RenDescFte',
    problema: (s) => `Toma ${s.total.pctTomados} %. La mayoría de los ${s.total.noTomados} sin tomar coinciden con ratos sin ninguna captura de la cámara.`,
    acciones: ['conectividad'],
    detalle: 'Los camiones de agua industrial no cargan en OSL y quedan fuera.',
  },
]
const ACC = [['iluminacion', 'Iluminación'], ['enfoque', 'Enfoque / encuadre'], ['limpieza', 'Limpieza / mantenimiento'], ['conectividad', 'Conectividad']]
const PRIO = { alta: 'Alta', media: 'Media', baja: 'Baja' }

const ordenesHtml = ORDENES.map((o, i) => {
  const s = o.sector ? S[o.sector] : null
  return `<article class="ot ot-${o.prio}">
  <header><span class="prio">${PRIO[o.prio]}</span><span class="otn">OT ${String(i + 1).padStart(2, '0')}</span><span class="pl">${esc(o.planta)}</span></header>
  <h3>${esc(s ? s.nombre : 'Cámaras traseras')}</h3>
  <p class="cams">${esc(o.camaras)}</p>
  <p>${esc(o.problema(s))}</p>
  <ul class="acc">${ACC.map(([k, l]) => `<li class="${o.acciones.includes(k) ? 'on' : ''}">${o.acciones.includes(k) ? '✕' : '·'} ${l}</li>`).join('')}</ul>
  <p class="det">${esc(o.detalle)}</p>
</article>`
}).join('\n')

const ORDEN_SECT = ['ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Balanzas', 'ricardone:Salida 2', 'san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso', 'san_lorenzo:Plataformas Volcables', 'san_lorenzo:Carga / Descarga OSL', 'san_lorenzo:Carga/descarga', 'san_lorenzo:Balanza Egreso', 'san_lorenzo:Egreso']
const cls = (p) => (p == null ? '' : p >= 95 ? 'ok' : p >= 85 ? 'mid' : 'bad')
const strip = (s) => s.porHora.map((h) => {
  const v = h.pasaron ? h.noTomados / h.pasaron : 0
  const lvl = !h.pasaron ? 0 : v === 0 ? 1 : v < 0.1 ? 2 : v < 0.25 ? 3 : 4
  return `<i class="h l${lvl}" title="${h.h} h: ${h.noTomados} sin tomar de ${h.pasaron}"></i>`
}).join('')
const filas = (plant) => ORDEN_SECT.filter((id) => S[id] && S[id].planta === plant).map((id) => {
  const s = S[id]
  return `<tr><th scope="row">${esc(s.nombre)}<span>${esc(s.camaras.join(' · '))}</span></th>
<td class="num">${n(s.total.pasaron)}</td>
<td class="num strong">${s.total.noTomados}</td>
<td class="num ${cls(s.dia.pctTomados)}">${s.dia.pctTomados ?? '–'} %</td>
<td class="num ${cls(s.noche.pctTomados)}">${s.noche.pctTomados ?? '–'} %</td>
<td class="num">${s.dia.pctLeidos ?? '–'} %</td>
<td class="num">${s.noche.pctLeidos ?? '–'} %</td>
<td class="strip"><div>${strip(s)}</div></td></tr>`
}).join('')
const tabla = (plant, titulo) => `<div class="tw"><table>
<caption>${titulo}</caption>
<thead><tr><th scope="col">Sector · cámaras</th><th scope="col">Pasaron</th><th scope="col">Sin tomar</th><th scope="col">Toma día</th><th scope="col">Toma noche</th><th scope="col">Lee día</th><th scope="col">Lee noche</th><th scope="col">Sin tomar por hora (0 → 23 h)</th></tr></thead>
<tbody>${filas(plant)}</tbody></table></div>`

const listas = ORDEN_SECT.filter((id) => S[id] && S[id].noTomados.length).map((id) => {
  const s = S[id]
  const rows = s.noTomados.map((x) => {
    const ss = sinSenal(s, x.hora)
    return `<tr${ss ? ' class="ss"' : ''}><td class="mono">${fecha(x.hora)}</td><td class="mono">${esc(x.patente)}</td><td class="mono">${esc(x.acoplado)}</td><td>${esc(x.circuito)}${x.pasada ? ` · pesada de ${x.pasada}` : ''}</td><td>${ss ? 'sin señal' : ''}</td></tr>`
  }).join('')
  const nss = s.noTomados.filter((x) => sinSenal(s, x.hora)).length
  return `<details><summary><b>${esc(s.planta === 'ricardone' ? 'Ricardone' : 'San Lorenzo')} · ${esc(s.nombre)}</b> <span>${s.noTomados.length} camiones${nss ? ` · ${nss} sin señal` : ''}</span></summary>
<div class="tw"><table class="list"><thead><tr><th scope="col">Hora</th><th scope="col">Patente</th><th scope="col">Acoplado</th><th scope="col">Circuito</th><th scope="col">Cámara</th></tr></thead><tbody>${rows}</tbody></table></div></details>`
}).join('\n')

const html = `<title>Orden de trabajo cámaras</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Hoja de trabajo: encabezado de planta, órdenes priorizadas, tabla de sectores con franja horaria, listas para revisar grabaciones */
:root {
  --bg: #f4f7f4; --surface: #ffffff; --fg: #15261d; --muted: #52645a; --line: #c9d6cd;
  --nva: #0b5638; --violet: #2e1b4e;
  --bad: #a4261d; --bad-bg: #f8e1de; --mid: #845600; --mid-bg: #faefd6; --ok: #0b5638; --ok-bg: #dcefe2;
  --h0: #eef2ef; --h1: #d3e8da; --h2: #f3e2b4; --h3: #eab394; --h4: #c2463b;
  --sans: 'IBM Plex Sans', Arial, sans-serif; --mono: 'IBM Plex Mono', Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0f1713; --surface: #16211b; --fg: #e3ece6; --muted: #9db0a4; --line: #2c3d33;
  --nva: #6cc79a; --violet: #b9a6e0;
  --bad: #f19a90; --bad-bg: #3a1c19; --mid: #e6c071; --mid-bg: #33280f; --ok: #7fd3a6; --ok-bg: #16301f;
  --h0: #1c2822; --h1: #1f4430; --h2: #5a4a1c; --h3: #7a3d29; --h4: #c2463b; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0f1713; --surface: #16211b; --fg: #e3ece6; --muted: #9db0a4; --line: #2c3d33;
  --nva: #6cc79a; --violet: #b9a6e0;
  --bad: #f19a90; --bad-bg: #3a1c19; --mid: #e6c071; --mid-bg: #33280f; --ok: #7fd3a6; --ok-bg: #16301f;
  --h0: #1c2822; --h1: #1f4430; --h2: #5a4a1c; --h3: #7a3d29; --h4: #c2463b; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--sans); }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 32px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: flex; flex-direction: column; gap: 36px; }
h1, h2, h3 { text-wrap: balance; margin: 0; }
h1 { font-size: 34px; font-weight: 600; line-height: 1.15; }
h2 { font-size: 22px; font-weight: 600; }
h3 { font-size: 18px; font-weight: 600; }
p { margin: 0; }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--nva); }
.head { display: flex; flex-direction: column; gap: 10px; border-bottom: 2px solid var(--nva); padding-bottom: 20px; }
.head .meta { color: var(--muted); max-width: 70ch; }
.defs { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.defs div { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; min-width: 0; }
.defs b { display: block; font-size: 13px; }
.defs p { color: var(--muted); font-size: 14px; }
section { display: flex; flex-direction: column; gap: 14px; }
section > .lede { color: var(--muted); max-width: 75ch; }
.ots { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
.ot { background: var(--surface); border: 1px solid var(--line); border-top: 4px solid var(--muted); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ot-alta { border-top-color: var(--bad); } .ot-media { border-top-color: var(--mid); } .ot-baja { border-top-color: var(--nva); }
.ot header { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.prio { font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding: 2px 8px; border-radius: 4px; }
.ot-alta .prio { background: var(--bad-bg); color: var(--bad); } .ot-media .prio { background: var(--mid-bg); color: var(--mid); } .ot-baja .prio { background: var(--ok-bg); color: var(--ok); }
.otn { font-family: var(--mono); }
.pl { margin-left: auto; }
.cams { font-family: var(--mono); font-size: 13px; color: var(--violet); overflow-wrap: anywhere; }
.acc { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 13px; color: var(--muted); }
.acc li.on { color: var(--fg); font-weight: 600; }
.det { font-size: 13px; color: var(--muted); border-top: 1px dashed var(--line); padding-top: 8px; }
.tw { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
caption { text-align: left; font-weight: 600; padding: 12px 14px 4px; color: var(--nva); }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
thead th { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
tbody th { font-weight: 600; min-width: 200px; }
tbody th span { display: block; font: 400 12px/1.4 var(--mono); color: var(--muted); }
.num { text-align: right; white-space: nowrap; }
.strong { font-weight: 700; }
td.ok { color: var(--ok); } td.mid { color: var(--mid); font-weight: 600; } td.bad { color: var(--bad); font-weight: 700; }
.strip div { display: grid; grid-template-columns: repeat(24, 9px); gap: 2px; }
.h { display: block; height: 18px; border-radius: 2px; }
.l0 { background: var(--h0); } .l1 { background: var(--h1); } .l2 { background: var(--h2); } .l3 { background: var(--h3); } .l4 { background: var(--h4); }
.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--muted); align-items: center; }
.legend i { width: 12px; height: 12px; display: inline-block; border-radius: 2px; vertical-align: -2px; margin-right: 4px; }
details { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
summary { padding: 10px 14px; cursor: pointer; display: flex; gap: 10px; flex-wrap: wrap; }
summary span { color: var(--muted); }
summary:focus-visible { outline: 2px solid var(--nva); outline-offset: 2px; }
details .tw { border: 0; border-top: 1px solid var(--line); border-radius: 0 0 8px 8px; max-height: 360px; overflow-y: auto; }
.list td { font-size: 14px; } .mono { font-family: var(--mono); }
tr.ss td { color: var(--muted); font-style: italic; }
.notes { margin: 0; padding-left: 18px; color: var(--muted); display: flex; flex-direction: column; gap: 6px; max-width: 85ch; }
</style>
<div class="wrap">
<header class="head">
  <p class="eyebrow">Cámaras · Ricardone y Puerto San Lorenzo</p>
  <h1>Orden de trabajo de cámaras</h1>
  <p class="meta">Del miércoles 21/10 a las 0 h al martes 27/10 a las 12 h. ${n(J.universo.camiones)} camiones del sistema de balanza (SGC). Para cada sector: camiones que pasaron seguro y ninguna de sus cámaras tomó.</p>
</header>

<div class="defs">
  <div><b>Pasó seguro</b><p>La hora de pesada del sistema de balanza lo ubica ahí, o otra cámara lo tomó antes y después en su recorrido.</p></div>
  <div><b>Tomado</b><p>Alguna cámara del sector registró el camión, aunque haya leído mal la patente. Mal leída se corrige; no tomado, no.</p></div>
  <div><b>Lee</b><p>Además leyó la patente correcta. Día de 6 a 18 h, noche de 18 a 6 h.</p></div>
</div>

<section>
  <h2>Qué hay que hacer, por prioridad</h2>
  <p class="lede">Alta: la cámara no toma camiones o casi no lee de noche. Media: toma, pero lee mal en un horario o tiene cortes. Baja: cortes puntuales.</p>
  <div class="ots">${ordenesHtml}</div>
</section>

<section>
  <h2>Sectores</h2>
  <div class="legend"><span>Sin tomar por hora:</span><span><i class="l1"></i>ninguno</span><span><i class="l2"></i>menos del 10 %</span><span><i class="l3"></i>10 a 25 %</span><span><i class="l4"></i>más del 25 %</span><span><i class="l0"></i>sin camiones</span></div>
  ${tabla('ricardone', 'Ricardone')}
  ${tabla('san_lorenzo', 'Puerto San Lorenzo')}
</section>

<section>
  <h2>Camiones sin tomar, para revisar en las grabaciones</h2>
  <p class="lede">Hora estimada del paso por el sector. «Sin señal» = la cámara no registró nada en ±30 minutos: revisar conexión antes que la óptica.</p>
  ${listas}
</section>

<section>
  <h2>Qué no cuenta como falla</h2>
  <ul class="notes">
    <li>Calada Ricardone usa las calles 3 y 4 (y la de líquidos). Las calles 1, 2, 5 y 6 no se usan.</li>
    <li>RicB3Ingreso, RicB3Egreso y SLZBalSC1Fte leen sobre todo camiones que no están en el sistema de balanza. No se les cuenta nada en contra.</li>
    <li>La flota interna que carga en Silo Chief hace varias vueltas por día con un solo registro, sin hora de pesada exacta: queda fuera de balanzas.</li>
    <li>Agua industrial y nitrógeno no cargan en OSL ni en líquidos. Los líquidos SL2 pesan en la balanza de líquidos, no en la de egreso.</li>
    <li>Calada de San Lorenzo y Renova (SLZTK400) no se miden. Playa 3 tuvo 8 pasos y Volcable 2 ninguno (no entró girasol).</li>
  </ul>
</section>
</div>
`
fs.writeFileSync(DIR + 'orden-trabajo-camaras.html', html)
console.log('ok', html.length)
