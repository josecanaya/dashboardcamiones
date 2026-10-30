// Genera láminas día por día y sectores (día/noche) del período 21–26/10 desde el JSON del informe.
const fs = require('fs')
const path = require('path')
const out = process.argv[2]
const J = require('C:/Users/Usuario/Desktop/Dashboard_camiones/reportes/camaras/2026-10-21_2026-10-26/reconocimiento-camaras.json')
const LOGOS = process.argv[3] ? JSON.parse(process.argv[3]) : { nva: 'NVA', bim: 'BIM' }
const days = J.diasAnalizados
const dn = { '2026-10-21': 'mié 21', '2026-10-22': 'jue 22', '2026-10-23': 'vie 23', '2026-10-24': 'sáb 24', '2026-10-25': 'dom 25', '2026-10-26': 'lun 26 *' }
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null)

const RIC = [
  ['ricardone:Ingreso', 'Ingreso *'],
  ['ricardone:Pre ingreso', 'Preingreso'],
  ['ricardone:Calada', 'Calada (calles 3 y 4)'],
  ['ricardone:Balanza Ingreso', 'Balanza ingreso (B1)'],
  ['ricardone:Balanza Egreso', 'Balanza egreso (B2)'],
  ['ricardone:Salida 2', 'Salida'],
]
const SL = [
  ['san_lorenzo:Ingreso', 'Ingreso'],
  ['san_lorenzo:Balanza Ingreso', 'Balanza ingreso'],
  ['san_lorenzo:Carga / Descarga OSL', 'Carga OSL'],
  ['san_lorenzo:Plataformas Volcables', 'Volcables'],
  ['san_lorenzo:Carga/descarga', 'Carga y descarga líquidos'],
  ['san_lorenzo:Balanza Egreso', 'Balanza egreso'],
  ['san_lorenzo:Egreso', 'Egreso'],
]
const P = (id) => J.puntos.find((p) => p.nodeId === id)

const B = 'border:1px solid #B9C6BE'
const cellColor = (v, n) => {
  if (v == null) return `color:#B6C0BA; background:#FCFDFB`
  if (n < 5) return `color:#9AA59E; background:#FCFDFB`
  if (v >= 80) return `background:#DCEFE2; color:#0B5638`
  if (v >= 65) return `background:#FBF1DC; color:#8A5A00`
  return `background:#F9E1DE; color:#B3261E`
}
const logos = (num, foot) =>
  `<img src="${LOGOS.nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain"><img src="${LOGOS.bim}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain"><p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:#4A5D52">${foot} · ${num}</p>`

function diaPorDia(id, planta, rows, color, num) {
  const cols = days.length
  const w = Math.floor(1324 / cols)
  let g = `<div style="display:grid; grid-template-columns:340px repeat(${cols}, ${w}px); gap:0px; font-variant-numeric:tabular-nums">`
  const H = `font-size:24px; font-weight:600; color:#14281E; text-align:center; background:#E3ECE5; ${B}; padding:3px 0px`
  g += `<p style="font-size:24px; font-weight:600; color:#14281E; background:#E3ECE5; ${B}; padding:3px 10px">Sector</p>`
  for (const d of days) g += `<p style="${H}">${dn[d]}</p>`
  const block = (turno) => {
    g +=
      turno === 'dia'
        ? `<p style="grid-column:span ${cols + 1}; font-size:24px; font-weight:700; color:#7A5600; background:#FFF6DC; ${B}; padding:4px 12px">De día · 6 a 18 h</p>`
        : `<p style="grid-column:span ${cols + 1}; font-size:24px; font-weight:700; color:#F1F6F2; background:#2E1B4E; ${B}; padding:4px 12px">De noche · 18 a 6 h · entre paréntesis, diferencia con el día</p>`
    for (const [nid, lab] of rows) {
      const p = P(nid)
      g += `<p style="font-size:24px; background:#FCFDFB; ${B}; padding:3px 10px">${lab}</p>`
      for (const d of days) {
        const s = p.porDia[d]?.[turno]
        const n = s?.esperados ?? 0
        const v = n ? pct(s.leidos, n) : null
        let txt = v == null ? '–' : String(v)
        if (turno === 'noche' && v != null && n >= 5) {
          const sd = p.porDia[d]?.dia
          if (sd?.esperados >= 5) {
            const dd = v - pct(sd.leidos, sd.esperados)
            txt += ` (${dd > 0 ? '+' : dd < 0 ? '−' : '±'}${Math.abs(dd)})`
          }
        }
        g += `<p style="font-size:24px; text-align:center; ${cellColor(v, n)}; ${B}; padding:3px 0px">${txt}</p>`
      }
    }
  }
  block('dia')
  block('noche')
  g += '</div>'
  const tag = planta === 'ric' ? 'Ricardone' : 'Puerto San Lorenzo'
  const foot = (planta === 'ric' ? '* Ingreso con problemas de conectividad · ' : '') + 'verde 80 % o más · ocre 65–79 % · rojo menos de 65 %'
  const html = `<section id="${id}" data-transition="fade" style="background:#F5F8F4; color:#14281E; font-family:'IBM Plex Sans', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:20px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${color}; padding:6px 18px; border-radius:999px">Día a día · ${tag}</p><h2 style="font-size:40px; font-weight:600; line-height:1.1; color:#14281E">% de camiones leídos por sector · 21 al 26 de octubre</h2></div>${g}${logos(num, foot)}<aside>Porcentaje de camiones leídos sobre los que pasaron por el sector según su circuito, del miércoles 21 al lunes 26 de octubre. Arriba, de día (6 a 18 h); abajo, de noche (18 a 6 h). En gris, turnos con menos de 5 camiones; guion, sin camiones. * El lunes 26 tiene solo los camiones que salieron hasta la mañana.${planta === 'ric' ? ' Ingreso tuvo problemas de conectividad constantes: sus porcentajes pueden quedar por debajo de lo real.' : ''}</aside></section>\n`
  fs.writeFileSync(path.join(out, id + '.html'), html)
}

function sectores(id, planta, rows, color, headBg, num, titulo) {
  const T = `font-size:25px; ${B}; padding:6px 12px`
  const hd = (t, al = 'center') => `<p style="${T}; font-weight:600; text-align:${al}; background:${headBg}; color:#14281E">${t}</p>`
  let g = `<div style="display:grid; grid-template-columns:400px 180px 210px 210px 210px 210px 244px; gap:0px; font-variant-numeric:tabular-nums">`
  g += hd('Sector', 'left') + hd('Camiones') + hd('Lee · día') + hd('Lee · noche') + hd('Captura · día') + hd('Captura · noche') + hd('Noche vs día')
  const summary = []
  for (const [nid, lab] of rows) {
    const p = P(nid)
    const ld = pct(p.dia.leidos, p.dia.esperados), ln = pct(p.noche.leidos, p.noche.esperados)
    const cd = pct(p.deteccion.dia.detectados, p.deteccion.dia.esperados), cn = pct(p.deteccion.noche.detectados, p.deteccion.noche.esperados)
    const gap = cn - cd
    summary.push({ lab, n: p.total.esperados, lee: pct(p.total.leidos, p.total.esperados), cap: pct(p.deteccion.total.detectados, p.deteccion.total.esperados), ld, ln, cd, cn })
    const c = (v) => `<p style="${T}; text-align:center; ${cellColor(v, 99)}">${v} %</p>`
    g += `<p style="${T}; background:#FCFDFB">${lab}</p><p style="${T}; text-align:center; background:#FCFDFB; color:#4A5D52">${p.total.esperados}</p>${c(ld)}${c(ln)}${c(cd)}${c(cn)}`
    g += `<p style="${T}; text-align:center; background:#FCFDFB; color:${gap <= -15 ? '#B3261E' : '#4A5D52'}; font-weight:${gap <= -15 ? 700 : 400}">${gap > 0 ? '+' : gap < 0 ? '−' : '±'}${Math.abs(gap)} puntos</p>`
  }
  g += '</div>'
  const foot = (planta === 'ric' ? '* Ingreso con problemas de conectividad · ' : '') + 'Lee = patente correcta · Captura = el camión aparece aunque la patente salga mal'
  const html = `<section id="${id}" data-transition="fade" style="background:#F5F8F4; color:#14281E; font-family:'IBM Plex Sans', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:28px"><div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${color}; padding:6px 18px; border-radius:999px">Sectores · ${planta === 'ric' ? 'Ricardone' : 'Puerto San Lorenzo'}</p><p style="font-size:24px; color:#4A5D52">miércoles 21 a lunes 26 de octubre</p></div><h2 style="font-size:52px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div>${g}${logos(num, foot)}<aside>Camiones: los que debían pasar por el sector según su circuito (SGC), con salida del 21 al 26 de octubre. Captura cuenta los leídos más los que tienen, cerca de la hora de su paso (±30 minutos), una captura de la cámara con patente inválida, cortada o parecida, que no corresponde a otro camión. Noche vs día: diferencia de captura entre la noche y el día.</aside></section>\n`
  fs.writeFileSync(path.join(out, id + '.html'), html)
  return summary
}

fs.mkdirSync(out, { recursive: true })
diaPorDia('dia-por-dia', 'ric', RIC, '#0B5638', 4)
diaPorDia('dia-por-dia-sl', 'sl', SL, '#2E1B4E', 7)
const sr = sectores('sectores-ric', 'ric', RIC, '#0B5638', '#D5E3D9', 3, process.env.T_RIC || 'TITULO')
const ss = sectores('sectores-sl', 'sl', SL, '#2E1B4E', '#DCD8E8', 6, process.env.T_SL || 'TITULO')
const tot = (pl) => {
  const ps = J.puntos.filter((p) => p.planta === pl && !['ricardone:Playa 3', 'ricardone:Tolva de carga silo Chief'].includes(p.nodeId))
  const s = (f) => ps.reduce((a, p) => a + f(p), 0)
  return {
    lee: pct(s((p) => p.total.leidos), s((p) => p.total.esperados)),
    leeD: pct(s((p) => p.dia.leidos), s((p) => p.dia.esperados)),
    leeN: pct(s((p) => p.noche.leidos), s((p) => p.noche.esperados)),
    cap: pct(s((p) => p.deteccion.total.detectados), s((p) => p.deteccion.total.esperados)),
    capD: pct(s((p) => p.deteccion.dia.detectados), s((p) => p.deteccion.dia.esperados)),
    capN: pct(s((p) => p.deteccion.noche.detectados), s((p) => p.deteccion.noche.esperados)),
  }
}
console.log(JSON.stringify({ ric: sr, sl: ss, totRic: tot('ricardone'), totSl: tot('san_lorenzo') }, null, 1))
