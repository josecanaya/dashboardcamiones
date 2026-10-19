// Planta estándar para los escenarios propios del simulador: sale de los días calibrados
// (public/simulador/escenarios/<día>_motor.json + public/simulador/days/<día>.json).
//
// Uso: node scripts/simulador/planta_estandar.mjs   →   public/simulador/escenarios/_estandar.json
//
// Qué guarda (medianas de todos los días, para que un escenario no dependa de ninguno):
// - la planta: cada calle de calada, volcable, punto de Ricardone y estación con su estado típico (abierto si lo
//   estuvo en la mitad de los días o más), su ritmo y un solo producto (el más frecuente);
// - los tiempos de cada tramo (a pie, demora en Playa demorado, ruta al puerto, salida del puerto, balanza de
//   Ricardone) y la carga de transiles (ritmo, ida, tiempo adentro y vuelta);
// - las llegadas típicas a Ricardone por producto (total del día y reparto en 12 ventanas de 2 h) y la flota.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ESC = path.join(ROOT, 'public/simulador/escenarios'), DAYS = path.join(ROOT, 'public/simulador/days');
const code = fs.readFileSync(path.join(ROOT, 'scripts/simulador/motor_colas.js'), 'utf8');
const E = vm.runInNewContext(code + '\n;({motorPrep, motorKnobs, motorFreeze, RIC_DESC, STATIONS, TRAMO})', {Math, JSON, Object, Array, Set, Map, Number, isFinite});

const med = v => v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
const days = fs.readdirSync(ESC).filter(f => /^\d{4}-\d{2}-\d{2}_motor\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
const lanes = {cal: [], volc: [], rd: []}, st = {}, tr = {walk: [], demora: [], route: [], exitWalk: [], walkBal: []};
const carga = {pellet: {cap: [], back: [], inFix: [], toSl: []}, soja: {cap: [], back: [], inFix: [], toSl: []}};
const llegadas = {soja: [], girasol: [], liquido: []}, ventanas = {soja: Array(12).fill(0), girasol: Array(12).fill(0), liquido: Array(12).fill(0)};
const tons = {soja: [], girasol: [], pellet: [], liquido: []}, flota = {pellet: [], soja: []}, flotaIni = [], flotaHoras = [];
let M0 = null;
for (const day of days) {
  const M = JSON.parse(fs.readFileSync(path.join(ESC, `${day}_motor.json`), 'utf8'));
  const D = JSON.parse(fs.readFileSync(path.join(DAYS, `${day}.json`), 'utf8'));
  M0 ||= M;
  const P = E.motorPrep(M, D.trucks), K = E.motorKnobs(P), F = E.motorFreeze(P, K, 0);
  for (const g of ['cal', 'volc', 'rd']) F[g].forEach((l, i) => (lanes[g][i] ||= []).push(l));
  for (const [k, s] of Object.entries(F.st)) (st[k] ||= []).push(s.rate);
  const cnt = {soja: 0, girasol: 0, liquido: 0};
  for (const r of P.ric) {
    tr.walk.push(r.walk); tr.demora.push(r.demora); if (r.pi >= 0) tr.route.push(r.route); if (r.walkBal) tr.walkBal.push(r.walkBal);
    if (r.ing >= 0 && r.ing < 1440 && D.trucks[r.i][4] !== 1 && cnt[r.prod] != null && (r.dest || r.prod === 'liquido')) {
      cnt[r.prod]++; ventanas[r.prod][Math.floor(r.ing / 120)]++;
    }
    if (tons[r.prod] && r.tons) tons[r.prod].push(r.tons);
  }
  for (const p of P.port) { tr.exitWalk.push(p.exitWalk); if (p.prod === 'pellet' && p.tons) tons.pellet.push(p.tons); }
  for (const p of Object.keys(cnt)) llegadas[p].push(cnt[p]);
  for (const [p, c] of Object.entries(P.carga || {})) for (const k of Object.keys(carga[p])) carga[p][k].push(c[k]);
  for (const [p, l] of Object.entries(P.fleet || {})) if (l.length) {
    flota[p].push(l.length);
    if (p === 'pellet') { flotaIni.push(Math.min(...l.map(f => f.first))); flotaHoras.push((Math.max(...l.map(f => f.until)) - Math.min(...l.map(f => f.first))) / 60); }
  }
}
// canal típico: abierto si lo estuvo en la mitad de los días o más, ritmo mediano cuando abre, el producto más frecuente
const tipico = arr => arr.map(ls => {
  const on = ls.filter(l => l.on), prodCount = {};
  ls.forEach(l => { const p = l.prods[0]; prodCount[p] = (prodCount[p] || 0) + (l.on ? 2 : 1); });
  const prod = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0][0];
  return {on: on.length * 2 >= ls.length, rate: Math.round((med(on.map(l => l.rate)) || med(ls.map(l => l.rate)) || 0) * 10) / 10, prods: [prod]};
});
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const out = {
  dias: days.length, desde: days[0], hasta: days[days.length - 1],
  prm: M0.prm, T0: M0.T0, T_END: M0.T_END, h0: M0.h0, H: M0.cal.length,
  planta: {cal: tipico(lanes.cal), volc: tipico(lanes.volc), rd: tipico(lanes.rd),
           st: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, {on: true, rate: r1(med(v))}]))},
  tramos: Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, r1(med(v))])),
  carga: Object.fromEntries(Object.entries(carga).filter(([, c]) => c.cap.length).map(([p, c]) => [p, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r1(med(v))]))])),
  llegadas: Object.fromEntries(Object.entries(llegadas).map(([p, v]) => [p, Math.round(med(v) || 0)])),
  // reparto típico del día en 12 ventanas de 2 h (suma de todos los días, normalizado)
  reparto: Object.fromEntries(Object.entries(ventanas).map(([p, v]) => { const s = v.reduce((a, b) => a + b, 0) || 1; return [p, v.map(x => Math.round(x / s * 1000) / 1000)]; })),
  tons: Object.fromEntries(Object.entries(tons).map(([p, v]) => [p, r1(med(v)) || 30])),
  flota: {pellet: Math.round(med(flota.pellet) || 0), soja: Math.round(med(flota.soja) || 0),
          pelletIni: Math.max(0, Math.round((med(flotaIni) || 0) / 15) * 15), pelletHoras: Math.round(med(flotaHoras) || 20)},
};
// ---------- Turnos reales del puerto (ver docs/simulador/OPERATORIA_VOLCABLES.md) ----------
// Días fuertes (≥ 250 descargas leídas en volcables): ritmo de cada hora contra el de las 08–17 h, y la parada de cada
// cambio de turno (06 y 18 h) = el hueco más largo sin ninguna descarga en todo el puerto que empieza en esa franja.
const allDays = fs.readdirSync(DAYS).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
const prof = Array(24).fill(0), gap = {6: [], 18: []}, balDay = [];
let nF = 0;
for (const day of allDays) {
  const D = JSON.parse(fs.readFileSync(path.join(DAYS, `${day}.json`), 'utf8'));
  const vt = [], bt = [];
  for (const t of D.trucks) for (const [n, tt, dv] of t[3]) if (tt >= 0 && tt < 1440) { if (n === 25 && dv >= 11 && dv <= 15) vt.push(tt); if (n === 22) bt.push(tt); }
  bt.sort((a, b) => a - b);
  if (bt.length) {  // balanza de ingreso SL: mejor ritmo sostenido de 3 h del día
    let best = 0; for (let i = 0, j = 0; i < bt.length; i++) { while (bt[i] - bt[j] > 180) j++; best = Math.max(best, i - j + 1); }
    balDay.push({n: best / 3, day});
  }
  if (vt.length < 250) continue;
  nF++; vt.sort((a, b) => a - b);
  for (const x of vt) prof[Math.floor(x / 60)]++;
  for (const h of [6, 18]) {
    let g = 0; for (let i = 1; i < vt.length; i++) if (vt[i - 1] >= h * 60 - 30 && vt[i - 1] < h * 60 + 60) g = Math.max(g, vt[i] - vt[i - 1]);
    gap[h].push(g);
  }
}
const diaRef = med(prof.slice(8, 18));
const parada = h => Math.round(Math.min(90, med(gap[h])) / 5) * 5;
// la hora de cada parada va en sus minutos propios; el factor de esas horas se toma del resto de la hora
out.turnos = {
  dias: nF,
  factor: prof.map((v, h) => Math.round(Math.min(1, (h === 6 || h === 18 ? (prof[h - 1] + prof[h + 1]) / 2 : v) / diaRef) * 100) / 100),
  paradas: [[360, parada(6), [0, 1, 2, 3, 4]], [1080, parada(18), [0, 1, 2, 3, 4]]],
};
// ---------- OEE de cada volcable del puerto: capacidad teórica × disponibilidad × rendimiento ----------
// Solo en las horas con cola (≥ 15 camiones adentro del puerto esperando volcar: la volcable tenía trabajo).
// · ciclo teórico = p20 del intervalo entre dos camiones seguidos en la misma volcable con cola (ciclo limpio). Una
//   lectura perdida alarga el intervalo, nunca lo acorta: los percentiles bajos son confiables. teórica = 60 / ciclo.
// · disponibilidad = minutos de la hora sin un hueco de más de 20 min en esa volcable (hueco largo = parada),
//   de día (07–19 h) y de noche por separado.
// · rendimiento = camiones de la hora (escalados por la cobertura de cámara) / (minutos disponibles / ciclo teórico),
//   tope 100 %.
const COB = 0.75;  // cámaras de volcable / Excel en días fuertes (29/08: 491 de 654)
const oeeAcc = [0, 1, 2, 3, 4].map(() => ({hw: [], dia: {disp: 0, n: 0, cam: 0}, noche: {disp: 0, n: 0, cam: 0}}));
for (const day of allDays) {
  const D = JSON.parse(fs.readFileSync(path.join(DAYS, `${day}.json`), 'utf8'));
  const vt = [[], [], [], [], []], esp = [];
  for (const t of D.trucks) {
    const r = {};
    for (const [n, tt, dv] of t[3]) { if (!(n in r)) r[n] = tt; if (n === 25 && dv >= 11 && dv <= 15 && tt >= 0 && tt < 1440) vt[dv - 11].push(tt); }
    if (20 in r && 25 in r) esp.push([r[20], r[25]]);
  }
  if (vt.reduce((a, v) => a + v.length, 0) < 250) continue;
  const cola = t => esp.reduce((a, [x, y]) => a + (x <= t && t < y), 0) >= 15;
  vt.forEach((ts, i) => {
    ts.sort((a, b) => a - b);
    if (ts.length < 30) return;
    for (let k = 1; k < ts.length; k++) if (ts[k] - ts[k - 1] < 60 && cola(ts[k - 1])) oeeAcc[i].hw.push(ts[k] - ts[k - 1]);
    for (let h = 0; h < 24; h++) {
      const t0 = h * 60;
      if (!cola(t0 + 30)) continue;
      const before = ts.filter(x => x < t0).slice(-1), inh = ts.filter(x => x >= t0 && x < t0 + 60), after = ts.filter(x => x >= t0 + 60).slice(0, 1);
      const seq = [...before, ...inh, ...after];
      let stop = 0; for (let k = 1; k < seq.length; k++) if (seq[k] - seq[k - 1] > 20) stop += Math.max(0, Math.min(seq[k], t0 + 60) - Math.max(seq[k - 1], t0));
      if (!before.length && !inh.length) stop = 60;
      const per = h >= 7 && h < 19 ? oeeAcc[i].dia : oeeAcc[i].noche;
      per.disp += 60 - stop; per.n++; per.cam += inh.length;
    }
  });
}
const r2 = v => Math.round(v * 100) / 100;
out.oee = oeeAcc.map((a, i) => {
  const hw = [...a.hw].sort((x, y) => x - y), ciclo = hw[Math.floor(0.2 * (hw.length - 1))] || 7.5, teorica = 60 / ciclo;
  const disp = p => p.n ? p.disp / (60 * p.n) : 0.5;
  const camH = (a.dia.cam + a.noche.cam) / COB, dispMin = a.dia.disp + a.noche.disp;
  const rend = dispMin ? Math.min(1, camH / (dispMin / ciclo)) : 0.8;
  return {v: 'V' + (i + 1), ciclo: Math.round(ciclo * 10) / 10, teorica: Math.round(teorica * 10) / 10, dispDia: r2(disp(a.dia)), dispNoche: r2(disp(a.noche)), rend: r2(rend),
          horas: a.dia.n + a.noche.n};
});
// ---------- Récords reales: lo más que se vio, para avisar cuando un escenario los pasa ----------
// Excel (data/movimientos): descargas por día del puerto y de cada volcable (plataforma VOLCABLE_PTO_1–5, sin
// patentes ficticias, día operativo desde las 22 h). Cámaras: mejor ritmo de 3 h de la balanza de ingreso SL.
const MOV = path.join(ROOT, 'data/movimientos'), seen = new Set(), porDia = {}, porCalle = {};
const opDay = s => { if (!/^\d{4}-\d{2}-\d{2}T\d{2}/.test(s || '')) return null; const d = new Date(s.slice(0, 10) + 'T12:00:00Z'); if (+s.slice(11, 13) >= 22) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
if (fs.existsSync(MOV)) for (const d of fs.readdirSync(MOV).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = path.join(MOV, d, 'movimientos.json');
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), rows = Array.isArray(j) ? j : (j.rows || j.movimientos || []);
  for (const r of rows) {
    if (seen.has(r.external_operation_id)) continue;
    seen.add(r.external_operation_id);
    const m = /^VOLCABLE_PTO_([1-5]|SGC)$/.exec(r.platform_normalized || '');
    if (!m || /^(X+|P+|T+)$/.test(r.plate_normalized || '')) continue;
    const day = opDay(r.external_ingreso_at) || opDay(r.external_salida_at);
    if (!day) continue;
    porDia[day] = (porDia[day] || 0) + 1;
    if (m[1] !== 'SGC') { const k = day + '|' + m[1]; porCalle[k] = (porCalle[k] || 0) + 1; }
  }
}
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || [null, 0];
const [pd, pn] = top(porDia), bal = balDay.sort((a, b) => b.n - a.n)[0] || {n: 0, day: null};
out.record = {
  fuente: 'Excel de movimientos (descargas por día) y cámaras (balanza de ingreso SL)',
  puertoDia: {n: pn, dia: pd},
  volcDia: Object.fromEntries([1, 2, 3, 4, 5].map(v => { const [k, n] = top(Object.fromEntries(Object.entries(porCalle).filter(([k]) => k.endsWith('|' + v)))); return ['V' + v, {n, dia: k && k.slice(0, 10)}]; })),
  bal3h: {n: Math.round(bal.n * 10) / 10, dia: bal.day},
};
fs.writeFileSync(path.join(ESC, '_estandar.json'), JSON.stringify(out, null, 1));
console.log('turnos', JSON.stringify(out.turnos));
console.log('récords', JSON.stringify(out.record));
console.log(`planta estándar de ${days.length} días (${out.desde} a ${out.hasta})`);
console.log('calada', out.planta.cal.map((l, i) => `${i < 6 ? 'C' + (i + 1) : 'CL'}${l.on ? '+' : '-'}${l.prods[0]}:${l.rate}`).join(' '));
console.log('volcables', out.planta.volc.map((l, i) => `V${i + 1}${l.on ? '+' : '-'}${l.prods[0]}:${l.rate}`).join(' '));
console.log('ricardone', out.planta.rd.map((l, i) => `${E.RIC_DESC[i].short}${l.on ? '+' : '-'}${l.prods[0]}:${l.rate}`).join(' '));
console.log('estaciones', JSON.stringify(out.planta.st));
console.log('tramos', JSON.stringify(out.tramos), 'carga', JSON.stringify(out.carga));
console.log('llegadas', JSON.stringify(out.llegadas), 'flota', JSON.stringify(out.flota), 'tons', JSON.stringify(out.tons));
