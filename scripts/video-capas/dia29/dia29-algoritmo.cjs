// Capturas del 29/10 según el algoritmo de vínculo (cartas + lote + marca del DSS), llevadas a las capas del deck.
// Entrada: reportes/vinculo/2026-10-29_2026-10-29/capturas-todas.json (worktree dss-vinculo). Salida: dia29c.json
const fs = require('fs')
const M = require('path').resolve(__dirname, '../../../data') + '/'
const caps = JSON.parse(fs.readFileSync(__dirname + '/capturas-todas.json', 'utf8'))
const perm = new Map(JSON.parse(fs.readFileSync(M + 'padron/vehiculos-permitidos.json', 'utf8')).entries.map((e) => [e.plate, e]))
const banco = new Map(JSON.parse(fs.readFileSync(M + 'padron/corregidos.json', 'utf8')).pairs.filter((p) => !p.readIsReal).map((p) => [p.read, p.real]))
const noCam = new Map(JSON.parse(fs.readFileSync(M + 'padron/no-camiones.json', 'utf8')).entries.map((e) => [e.plate, e.kind]))
const ia = fs.readFileSync(M + 'vision/veredictos.jsonl', 'utf8').trim().split(/\n/).map((l) => JSON.parse(l)).filter((v) => v.captureAt)
const valid = (p) => /^[A-Z]{3}\d{3}$|^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)
const iaAt = (plate, t) => ia.find((v) => v.readPlate === plate && Math.abs(Date.parse(v.captureAt) - t) < 5 * 60e3)
const out = [], cnt = {}, why = {}
for (const c of caps) {
  let l, truck = c.vehicle, w
  const v = iaAt(c.plate, c.t)
  if (c.cls === 'carta') { l = 'c2'; w = 'carta' }
  else if (c.plate && perm.has(c.plate)) { l = 'c2'; w = 'permitido'; truck = perm.get(c.plate).chasis ?? c.plate }
  else if (c.cls === 'carta_corregida') { l = 'p31'; w = 'carta_corregida' }
  else if (c.plate && banco.has(c.plate)) { l = 'b33'; w = 'banco_corregida'; truck = banco.get(c.plate) }
  else if (c.plate && noCam.has(c.plate)) { l = 'b33'; w = 'banco_no_camion'; truck = c.plate }
  else if (v) { l = 'ia34'; w = 'ia'; truck = v.plate ?? c.plate }
  else if (c.cls === 'mismo_paso') { l = 'p31'; w = 'mismo_paso' }
  else if (c.lote) { truck = c.lote.truck; if (c.lote.marca > 1) { l = 'm32'; w = 'lote_marca' } else { l = 'p31'; w = 'lote' } }
  else if (valid(c.plate)) { l = 'al4'; w = c.cls; truck = c.plate }
  else { l = 'nr'; w = c.cls; truck = null }
  cnt[l] = (cnt[l] || 0) + 1; why[l + ':' + w] = (why[l + ':' + w] || 0) + 1
  out.push({ t: c.t, s: c.node.startsWith('san_lorenzo') ? 1 : 0, d: c.dev, n: c.node.split(':')[1], l, p: truck })
}
// Alertas que todavía se explican: aceite con carta fuera de la base (pasó por la balanza), otra lectura
// del DSS de la misma captura que sí está en carta o Permitidos, o el tipo de vehículo dice que no es un camión.
const P = (x) => String(x ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const sgc = new Set(['2026-10-29', '2026-10-30'].flatMap((d) => Object.values(JSON.parse(fs.readFileSync(M + `sgc/${d}/ingresos.json`, 'utf8'))).flatMap((r) => [P(r.PATENTECAMION), P(r.PATENTEACOPLADO)])))
const cartaPlates = new Set(['2026-10-28', '2026-10-29', '2026-10-30'].flatMap((d) => JSON.parse(fs.readFileSync(M + `padron/${d}.json`, 'utf8')).notes.flatMap((n) => n.plates)))
const votes = JSON.parse(fs.readFileSync(__dirname + '/attrs29.json', 'utf8'))
const dssOne = JSON.parse(fs.readFileSync(__dirname + '/dss-alertas29.json', 'utf8'))
const LIGHT = /^(SUV|Van|Sedan|Pickup|MPV|Bus|Medium Bus)$/
for (const [k, r] of Object.entries(dssOne)) {
  if (!r) continue
  const v = (votes[r.plate] ??= { liviano: 0, camion: 0, cats: {} })
  if (r.category && LIGHT.test(r.category)) v.liviano++; else if (/Truck/.test(r.category ?? '')) v.camion++
}
const dssByCap = new Map(Object.entries(dssOne).filter(([, r]) => r).map(([k, r]) => [k, r]))
const why2 = {}
for (const o of out) {
  if (o.l !== 'al4') continue
  const r = dssByCap.get(`${o.d}|${o.t}`), v = votes[o.p]
  if (sgc.has(o.p)) { o.l = 'c2'; o.w = 'remito_balanza' }
  else if (r?.dssPlate && r.dssPlate !== o.p && (cartaPlates.has(r.dssPlate) || perm.has(r.dssPlate))) { o.l = 'm32'; o.w = 'dss_otra_lectura'; o.p = perm.get(r.dssPlate)?.chasis ?? r.dssPlate }
  else if (v && v.liviano > v.camion) { o.l = 'm32'; o.w = 'no_es_camion' }
  if (o.w) { why2[o.w] = (why2[o.w] || 0) + 1; cnt.al4--; cnt[o.l]++ }
}
// Revisado con la foto del DSS (fotos-alertas/): camionetas, utilitarios, un auto, un colectivo y una persona.
const NO_CAMION_FOTO = new Set(['AC338MH', 'AG596IA', 'AG710NZ', 'AH671BL', 'AI412WY', 'EMR320', 'JZW724', 'OTV795', 'PDQ847', 'VSR057'])
// Lectura a 1 carácter de un camión con remito que pasó por la balanza ese día; las gemelas mal leídas siguen a su par.
const ed = (a, b) => { const t = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) t[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = Math.min(t[i - 1][j] + 1, t[i][j - 1] + 1, t[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return t[a.length][b.length] }
const sgcList = [...sgc].filter(Boolean)
const fix = new Map()
for (const p of new Set(out.filter((o) => o.l === 'al4').map((o) => o.p))) { const m = sgcList.filter((s) => ed(p, s) <= 1); if (m.length === 1) fix.set(p, m[0]) }
for (const p of new Set(out.filter((o) => o.l === 'al4').map((o) => o.p))) if (!fix.has(p)) { const tw = [...fix.keys()].filter((q) => ed(p, q) <= 1); if (tw.length === 1) fix.set(p, fix.get(tw[0])) }
for (const o of out) {
  if (o.l !== 'al4') continue
  if (NO_CAMION_FOTO.has(o.p)) { o.l = 'ia34'; o.w = 'ia_no_es_camion' }
  else if (fix.has(o.p)) { o.l = 'p31'; o.w = 'parecida_remito'; o.p = fix.get(o.p) }
  else continue
  why2[o.w] = (why2[o.w] || 0) + 1; cnt.al4--; cnt[o.l]++
}
// Capa 3.4 · IA por imagen: leído en el recorte de la patente del DSS (ia-alertas/, ia_hoja_*.jpg) y confirmado contra
// carta / Permitidos / remito del día; el acoplado lleva al chasis que pasó en el mismo minuto.
const IA_FIX = { GTI382: 'GXT382', IMX998: 'UWX998', INV209: 'IKV208', IYT772: 'CMF111', TET782: 'UEY782', USA628: 'UJA626', UWC140: 'UWC148', VXY228: 'CDF727', SKM535: 'EIG352', STM565: 'EIG352', IEC333: 'EFC338', BVG200: 'BVS300', BEG875: 'EDG875', ATE165: 'AYE169' }
// La «patente» es otro texto: el modelo del camión (CURSOR), la marca del acoplado (OMBÚ), la web del contenedor (ZIM.com).
const IA_NO_PATENTE = new Set(['EVS603', 'OAM811', 'OMM811', 'ZIM000'])
for (const o of out) {
  if (o.l !== 'al4') continue
  if (IA_FIX[o.p]) { o.l = 'ia34'; o.w = 'ia_corrige'; o.p = IA_FIX[o.p] }
  else if (IA_NO_PATENTE.has(o.p)) { o.l = 'ia34'; o.w = 'ia_no_es_patente' }
  else if (o.p === 'CFM117') { o.l = 'c2'; o.w = 'carta_exacta' }
  // En el sistema de camiones (SGC desde 14/10 y movimientos desde mayo): OYO513 aceite envasado 15/10, FGX032 granos 24/08.
  else if (o.p === 'OYO513' || o.p === 'FGX032') { o.l = 'c2'; o.w = 'remito_sistema' }
  else { if (o.p === 'CFF574') o.p = 'HFF574'; continue } // misma captura leída dos veces
  why2[o.w] = (why2[o.w] || 0) + 1; cnt.al4--; cnt[o.l]++
}
console.log('alertas reexplicadas', JSON.stringify(why2))
// Capturas sin patente útil: el tipo del DSS dice si era un camión (patente ilegible) o no lo era
// (moto, auto, camioneta; la minicargadora de Balanza Egreso Ricardone 07:57 se vio en la foto).
const nrDss = fs.existsSync(__dirname + '/dss-nr29.json') ? JSON.parse(fs.readFileSync(__dirname + '/dss-nr29.json', 'utf8')) : {}
const NO_CAMION_TIPO = /^(Motorcycle|Sedan|Pickup|SUV|Van|MPV)$/
for (const o of out) {
  if (o.l !== 'nr') continue
  const k = `${o.d}|${o.t}`, x = nrDss[k]
  if ((x && NO_CAMION_TIPO.test(x.tipo ?? '')) || k === 'RicB3Egreso|1793271442000') { o.l = 'nc'; cnt.nr--; cnt.nc = (cnt.nc || 0) + 1 }
}
console.log('sin patente útil: no es camión', cnt.nc, '· patente ilegible', cnt.nr)
// La trasera lee el acoplado del mismo paso que la frontal: con frontal del mismo punto a ±3 min no es otra captura
// (manda la frontal). Solo cuenta la trasera que quedó sola (la frontal no leyó ese paso).
const fronts = caps.filter((c) => !c.rear)
const rearPaired = new Set(caps.filter((c) => c.rear && fronts.some((f) => f.node === c.node && Math.abs(f.t - c.t) <= 180_000)).map((c) => `${c.dev}|${c.t}`))
for (let i = out.length - 1; i >= 0; i--) if (rearPaired.has(`${out[i].d}|${out[i].t}`)) { cnt[out[i].l]--; out.splice(i, 1) }
console.log('traseras con frontal (no cuentan)', rearPaired.size, '· capturas que quedan', out.length, JSON.stringify(cnt))
const ORD = ['c2', 'p31', 'm32', 'b33', 'ia34', 'al4']
const trucks = {}
for (const o of out) { if (o.l === 'nr' || !o.p) continue; const cur = trucks[o.p]; if (!cur) trucks[o.p] = { layer: o.l, site: o.s ? 'san_lorenzo' : 'ricardone', n: 1 }; else { cur.n++; if (ORD.indexOf(o.l) < ORD.indexOf(cur.layer)) cur.layer = o.l } }
const tc = {}; for (const v of Object.values(trucks)) tc[v.layer] = (tc[v.layer] || 0) + 1
console.log('capturas', out.length, JSON.stringify(cnt))
console.log('motivo', JSON.stringify(why))
console.log('patentes', Object.keys(trucks).length, JSON.stringify(tc))
const al = Object.entries(trucks).filter(([, v]) => v.layer === 'al4').sort((a, b) => b[1].n - a[1].n)
console.log('alerta con más lecturas:', al.slice(0, 25).map(([p, v]) => `${p}(${v.n})`).join(' '))
console.log('alerta con 1 lectura:', al.filter(([, v]) => v.n === 1).length)
fs.writeFileSync(__dirname + '/dia29-alg.json', JSON.stringify({ caps: out, trucks }))
