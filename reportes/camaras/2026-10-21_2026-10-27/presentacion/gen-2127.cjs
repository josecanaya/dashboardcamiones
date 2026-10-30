// Láminas sectores + día por día del período 21/10 → 27/10 12 h con la lógica de sectores (sectores.json).
const fs = require('fs')
const path = require('path')
const out = process.argv[2]
const J = require('C:/Users/Usuario/Desktop/Dashboard_camiones/reportes/camaras/2026-10-21_2026-10-27/sectores.json')
const NVA = '/_blob/33b755d883abb543c90ecf8484467b8e'
const BIM = '/_blob/72c0d8fa42015cee095452bfe3600658'
const days = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']
const dn = { '2026-10-21': 'mié 21', '2026-10-22': 'jue 22', '2026-10-23': 'vie 23', '2026-10-24': 'sáb 24', '2026-10-25': 'dom 25', '2026-10-26': 'lun 26', '2026-10-27': 'mar 27 *' }
const RIC = [
  ['ricardone:Ingreso', 'Ingreso *'],
  ['ricardone:Pre ingreso', 'Preingreso'],
  ['ricardone:Calada', 'Calada (calles 3 y 4)'],
  ['ricardone:Balanzas', 'Balanzas (B1 · B2)'],
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
const P = (id) => J.sectores.find((s) => s.sector === id)
const B = 'border:1px solid #B9C6BE'
const cellColor = (v, n) => {
  if (v == null) return 'color:#B6C0BA; background:#FCFDFB'
  if (n < 5) return 'color:#9AA59E; background:#FCFDFB'
  if (v >= 90) return 'background:#DCEFE2; color:#0B5638'
  if (v >= 75) return 'background:#FBF1DC; color:#8A5A00'
  return 'background:#F9E1DE; color:#B3261E'
}
const logos = (foot) =>
  `<img src="${NVA}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain"><img src="${BIM}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">` +
  (foot ? `<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:#4A5D52">${foot}</p>` : '')

function diaPorDia(id, planta, rows, color, num) {
  const cols = days.length
  const w = Math.floor(1324 / cols)
  let g = `<div style="display:grid; grid-template-columns:340px repeat(${cols}, ${w}px); gap:0px; font-variant-numeric:tabular-nums">`
  const H = `font-size:24px; font-weight:600; color:#14281E; text-align:center; background:#E3ECE5; ${B}; padding:3px 0px`
  g += `<p style="font-size:24px; font-weight:600; color:#14281E; background:#E3ECE5; ${B}; padding:3px 10px">Sector</p>`
  for (const d of days) g += `<p style="${H}">${dn[d]}</p>`
  for (const turno of ['dia', 'noche']) {
    g +=
      turno === 'dia'
        ? `<p style="grid-column:span ${cols + 1}; font-size:24px; font-weight:700; color:#7A5600; background:#FFF6DC; ${B}; padding:4px 12px">De día · 6 a 18 h</p>`
        : `<p style="grid-column:span ${cols + 1}; font-size:24px; font-weight:700; color:#F1F6F2; background:#2E1B4E; ${B}; padding:4px 12px">De noche · 18 a 6 h · entre paréntesis, diferencia con el día</p>`
    for (const [nid, lab] of rows) {
      const p = P(nid)
      g += `<p style="font-size:24px; background:#FCFDFB; ${B}; padding:3px 10px">${lab}</p>`
      for (const d of days) {
        const s = p.porDia[d]?.[turno]
        const n = s?.pasaron ?? 0
        const v = n ? s.pctTomados : null
        let txt = v == null ? '–' : String(v)
        if (turno === 'noche' && v != null && n >= 5) {
          const sd = p.porDia[d]?.dia
          if (sd?.pasaron >= 5) {
            const dd = v - sd.pctTomados
            txt += ` (${dd > 0 ? '+' : dd < 0 ? '−' : '±'}${Math.abs(dd)})`
          }
        }
        g += `<p style="font-size:24px; text-align:center; ${cellColor(v, n)}; ${B}; padding:3px 0px">${txt}</p>`
      }
    }
  }
  g += '</div>'
  const tag = planta === 'ric' ? 'Ricardone' : 'Puerto San Lorenzo'
  const foot = (planta === 'ric' ? '* Ingreso con problemas de conectividad · ' : '') + `verde 90 % o más · ocre 75–89 % · rojo menos de 75 % · ${num}`
  const html = `<section id="${id}" data-transition="fade" style="background:#F5F8F4; color:#14281E; font-family:'IBM Plex Sans', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:20px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${color}; padding:6px 18px; border-radius:999px">Día a día · ${tag}</p><h2 style="font-size:40px; font-weight:600; line-height:1.1; color:#14281E">% de camiones que la cámara tomó · 21 al 27 de octubre</h2></div>${g}${logos(foot)}<aside>Porcentaje de camiones que pasaron seguro por el sector y alguna de sus cámaras tomó (leyó la patente o registró el camión con la patente mal leída), del miércoles 21 al martes 27 de octubre a las 12 h. Arriba, de día (6 a 18 h); abajo, de noche (18 a 6 h). En gris, turnos con menos de 5 camiones; guion, sin camiones. * El martes 27 llega hasta el mediodía.${planta === 'ric' ? ' Ingreso tuvo problemas de conectividad reportados.' : ''}</aside></section>\n`
  fs.writeFileSync(path.join(out, id + '.html'), html)
}

function sectores(id, planta, rows, color, headBg, titulo) {
  const T = `font-size:25px; ${B}; padding:6px 12px`
  const hd = (t, al = 'center') => `<p style="${T}; font-weight:600; text-align:${al}; background:${headBg}; color:#14281E">${t}</p>`
  let g = `<div style="display:grid; grid-template-columns:400px 180px 210px 210px 210px 210px 244px; gap:0px; font-variant-numeric:tabular-nums">`
  g += hd('Sector', 'left') + hd('Pasaron') + hd('Sin tomar') + hd('Toma · día') + hd('Toma · noche') + hd('Lee · día') + hd('Lee · noche')
  for (const [nid, lab] of rows) {
    const p = P(nid)
    const c = (v) => `<p style="${T}; text-align:center; ${cellColor(v, 99)}">${v} %</p>`
    const pl = (v) => `<p style="${T}; text-align:center; background:#FCFDFB; color:#4A5D52">${v} %</p>`
    g += `<p style="${T}; background:#FCFDFB">${lab}</p><p style="${T}; text-align:center; background:#FCFDFB; color:#4A5D52">${p.total.pasaron}</p><p style="${T}; text-align:center; background:#FCFDFB; font-weight:700; color:${p.total.noTomados / p.total.pasaron >= 0.1 ? '#B3261E' : '#14281E'}">${p.total.noTomados}</p>${c(p.dia.pctTomados)}${c(p.noche.pctTomados)}${pl(p.dia.pctLeidos)}${pl(p.noche.pctLeidos)}`
  }
  g += '</div>'
  const html = `<section id="${id}" data-transition="fade" style="background:#F5F8F4; color:#14281E; font-family:'IBM Plex Sans', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:28px"><div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${color}; padding:6px 18px; border-radius:999px">Sectores · ${planta === 'ric' ? 'Ricardone' : 'Puerto San Lorenzo'}</p><p style="font-size:24px; color:#4A5D52">miércoles 21 a martes 27 de octubre, 12 h</p></div><h2 style="font-size:52px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div>${g}<p style="font-size:24px; color:#4A5D52">Toma = alguna cámara del sector registró el camión, aunque haya leído mal la patente · Lee = leyó la patente correcta${planta === 'ric' ? ' · * conectividad reportada' : ''}</p>${logos('')}<aside>Pasaron: camiones con prueba de paso por el sector, por la hora de pesada del sistema de balanza (SGC) o porque otra cámara lo tomó antes y después en su recorrido. Sin tomar: pasaron y ninguna cámara del sector los registró.${planta === 'ric' ? ' Balanzas: B1, B2 y B3 se usan en los dos sentidos; se mide la pesada de entrada y la de salida de cada camión con circuito. La flota interna que carga en Silo Chief queda fuera porque hace varias vueltas con un solo registro.' : ' Volcables: el SGC no informa la calle, se mide el sector. Agua industrial y nitrógeno no cargan en OSL ni en líquidos; los líquidos SL2 pesan en la balanza de líquidos.'}</aside></section>\n`
  fs.writeFileSync(path.join(out, id + '.html'), html)
}

diaPorDia('dia-por-dia', 'ric', RIC, '#0B5638', 4)
diaPorDia('dia-por-dia-sl', 'sl', SL, '#2E1B4E', 7)
sectores('sectores-ric', 'ric', RIC, '#0B5638', '#D5E3D9', 'El Ingreso deja pasar 166 camiones sin tomar; el resto toma más del 90 %')
sectores('sectores-sl', 'sl', SL, '#2E1B4E', '#DCD8E8', 'De día toma casi todo; de noche fallan la balanza de ingreso y los volcables')
console.log('ok')
