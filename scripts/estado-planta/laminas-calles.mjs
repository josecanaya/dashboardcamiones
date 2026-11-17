// Una lámina por camión que pasó por dos calles de volcable en la misma visita (comité de seguridad), con el mismo
// formato que las de vuelta: patente, qué pasó, carta de porte arriba, recorrido por planta y todas las fotos del DSS.
// Uso: node scripts/estado-planta/laminas-calles.mjs <carpeta comite-seguridad> <blobs.json> <cartas.json...>
// Lee datos.json (dosCalles[].visitas de comite-seguridad-deteccion.ts) y escribe <carpeta>/deck/project/slides/calle-<pat>-<ddmm>.html
import fs from 'node:fs'
import path from 'node:path'

const [carpeta, blobsFile, ...cartasFiles] = process.argv.slice(2)
const D = JSON.parse(fs.readFileSync(path.join(carpeta, 'datos.json'), 'utf8'))
const BLOBS = JSON.parse(fs.readFileSync(blobsFile, 'utf8'))
const CARTAS = cartasFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
const P0 = D.periodo.desde, P1 = D.periodo.hasta
const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const pie = `Comité de Seguridad · ${ddmm(P0)} al ${ddmm(P1)}/${P1.slice(0, 4)}`
const hm = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(11, 16)
const INK = '#1B2420', MUTE = '#4F5A55', RED = '#B83A26', GDK = '#0B5638'
const CORTO = { 'Ingreso puerto': 'Ingreso', 'Balanza puerto': 'Balanza', 'Balanza salida puerto': 'Bal. salida', 'Salida puerto': 'Salida' }
const COL = { ric: ['#E3F1FA', '#1C6E9F', '#2F8FCB', 'RICARDONE'], sl: ['#FDEEDD', '#A8560C', '#E07B1F', 'SAN LORENZO'] }

function slide(x) {
  const pat = x.patente
  const vis = (x.visitas ?? []).filter((v) => v.items.length)
  const calles = x.calles
  const t0 = vis.flatMap((v) => v.items).find((i) => /Volcable/.test(i.punto))?.t ?? Date.parse(`2026-${x.dia.slice(3)}-${x.dia.slice(0, 2)}T12:00:00-03:00`)
  // carta vigente en la visita: emitida antes y confirmada/cerrada después de la primera calle
  const carta = CARTAS.filter((n) => n.plates.includes(pat) && Date.parse(n.issued) <= t0 + 3600e3 && Date.parse(n.stateSince) >= t0 - 3600e3)
    .sort((a, b) => b.issued.localeCompare(a.issued))[0]
  const minEntre = (() => { const a = calles[0].hora, b = calles.at(-1).hora; let m = (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3)); return m < 0 ? m + 1440 : m })()
  const pill = (a, b, bg, c) => `<div style="display:flex; flex-direction:row; align-items:baseline; gap:14px; background:${bg}; padding:12px 24px; border-radius:40px"><p style="font-family:'Domine', Georgia, serif; font-size:36px; font-weight:700; color:${c}; white-space:nowrap">${a}</p><p style="font-size:24px; color:${INK}; white-space:nowrap">${b}</p></div>`
  const box = (lbl, txt, col) => `<div style="display:flex; flex-direction:column; gap:2px; background:#FFFFFF; border:2px solid #D3DAD6; border-left:8px solid ${col}; border-radius:12px; padding:8px 18px"><p style="font-size:18px; font-weight:700; letter-spacing:2px; color:${col}">${lbl}</p><p style="font-size:24px; font-weight:600; color:${INK}; white-space:nowrap">${txt}</p></div>`
  const cartaTxt = carta ? `CTG ${carta.ctg} · ${carta.grain} · ${carta.stateCode === 'CN' ? 'confirmada' : carta.stateCode === 'RE' ? 'rechazada' : carta.stateCode} ${hm(Date.parse(carta.stateSince))}` : 'Sin carta vigente en la visita'
  const head = `<div style="display:flex; flex-direction:row; gap:40px; align-items:center"><div style="display:flex; flex-direction:column; width:340px; background:#FFFFFF; border:4px solid ${INK}; border-radius:14px; overflow:hidden"><div style="height:22px; background:#1F3F8C"></div><p style="font-family:Arial, sans-serif; font-size:64px; font-weight:700; text-align:center; letter-spacing:2px; color:${INK}; padding:4px 0px 8px">${pat}</p></div>`
    + `<div style="flex:1; display:flex; flex-direction:column; gap:14px"><p style="font-size:24px; font-weight:600; letter-spacing:2px; color:${MUTE}">${x.dia} · PUERTO SAN LORENZO</p>`
    + `<h2 style="font-family:'Domine', Georgia, serif; font-size:44px; font-weight:700; line-height:1.15; color:${INK}">Entró a la calle ${calles[0].calle} a las ${calles[0].hora} y a las ${calles.at(-1).hora} estaba en la calle ${calles.at(-1).calle}</h2>`
    + `<div style="display:flex; flex-direction:row; gap:16px; align-items:center">${pill(`${minEntre} min`, `entre la calle ${calles[0].calle} y la ${calles.at(-1).calle}`, '#FBE9E4', RED)}${box('CARTA DE PORTE', cartaTxt, carta ? GDK : RED)}</div></div></div>`
  const items = vis.flatMap((v) => v.items.map((i) => ({ ...i, planta: v.planta })))
  const nItems = items.length
  const grupo = (v, i) => {
    const [bg, c, b, nombre] = COL[v.planta]
    const box_ = (it) => { const vol = /Volcable/.test(it.punto); const cc = vol ? RED : c
      return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:#FFFFFF; border:${vol ? 3 : 2}px solid ${vol ? RED : b}; border-radius:14px; padding:8px 2px"><p style="font-size:22px; font-weight:700; color:${cc}; white-space:nowrap">${it.hora}</p><p style="font-size:18px; line-height:1.15; text-align:center; color:${vol ? RED : INK}">${CORTO[it.punto] ?? it.punto}${it.estado !== 'camara' ? ' (alg.)' : ''}</p></div>` }
    return (i ? `<div style="display:flex; flex-direction:column; justify-content:center; padding-top:38px"><x-shape kind="arrow-right" style="background:#A7B0AB; width:44px; height:26px"></x-shape></div>` : '')
      + `<div style="flex:${Math.max(2, v.items.length)}; display:flex; flex-direction:column; gap:6px; background:${bg}; border-radius:20px; padding:10px 8px 8px"><p style="font-size:20px; font-weight:700; letter-spacing:2px; color:${c}">${nombre}</p><div style="display:flex; flex-direction:row; gap:4px">${v.items.map(box_).join('')}</div></div>`
  }
  const fotos = items.map((it) => ({ src: BLOBS[`${pat}_${it.hora.replace(':', '')}_${it.device}`], it })).filter((f) => f.src)
  const nc = fotos.length > 8 ? Math.min(8, Math.ceil(fotos.length / 2)) : Math.max(fotos.length, 6), fw = Math.floor((1664 - (nc - 1) * 12) / nc), fh = Math.round(fw * 0.56)
  const ph = `<div style="display:grid; grid-template-columns:repeat(${nc}, ${fw}px); gap:8px 12px">` + fotos.map(({ src, it }) => `<div style="display:flex; flex-direction:column; gap:4px"><img src="${src}" alt="Cámara ${it.hora} · ${it.punto}" style="width:${fw}px; height:${fh}px; object-fit:cover; border-radius:10px${/Volcable/.test(it.punto) ? `; border:4px solid ${RED}` : ''}"><p style="font-size:18px; line-height:1.2; color:${MUTE}"><b style="color:${INK}">${it.hora}</b> · ${it.planta === 'ric' ? 'Ric.' : 'SL'}<br>${CORTO[it.punto] ?? it.punto}</p></div>`).join('') + '</div>'
  const id = `calle-${pat.toLowerCase()}-${x.dia.replace('/', '')}`
  const aside = `${pat} ${x.dia}: cámaras de volcable ${calles.map((c) => `C${c.calle} ${c.hora}`).join(' → ')}. ${carta ? `Carta ${carta.ctg} (${carta.grain}, destino ARCA ${carta.plant}) emitida ${hm(Date.parse(carta.issued))}, estado ${carta.stateCode} ${hm(Date.parse(carta.stateSince))}.` : 'Sin carta vigente.'} El sistema de camiones no informa la calle declarada. Lecturas: ${items.map((i) => `${i.hora} ${i.punto}`).join('; ')}.`
  return [id, `<section id="${id}" style="background:#FBFBF8; color:${INK}; font-family:'Public Sans', Arial, sans-serif; padding:80px 128px 150px; display:flex; flex-direction:column; gap:18px; justify-content:start">${head}<div style="display:flex; flex-direction:row; gap:10px; align-items:stretch">${vis.map(grupo).join('')}</div>${ph}<div style="position:absolute; left:128px; right:128px; bottom:56px; height:64px; display:flex; flex-direction:row; align-items:center; justify-content:space-between"><p style="font-size:24px; color:${MUTE}">${pie}</p><div style="display:flex; flex-direction:row; align-items:center; gap:40px"><img src="/_blob/d0ecd973e0389342a9808cfbafb74695" alt="Nueva Vicentin Argentina" style="width:75px; height:40px; object-fit:contain"><img src="/_blob/ebf418210cba2ac25c7c394fcbb9757f" alt="Bimtrazer" style="width:119px; height:56px; object-fit:contain"></div></div><aside>${aside}</aside></section>`]
}
const out = path.join(carpeta, 'deck', 'project', 'slides')
fs.mkdirSync(out, { recursive: true })
const solo = (process.env.CALLES ?? '').split(',').filter(Boolean)
for (const x of D.dosCalles.filter((c) => !solo.length || solo.includes(c.patente))) {
  const [id, html] = slide(x)
  fs.writeFileSync(path.join(out, `${id}.html`), html)
  console.log(id, html.length)
}
