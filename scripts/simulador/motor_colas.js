// Motor de colas del circuito completo, en el navegador (eventos discretos, reintento cada minuto), para la
// consola de la repetición. Toma escenarios/<día>_motor.json (calibrado con scripts/simulador/motor_colas.py)
// y los recorridos del día. Lo único que queda fijo del día real es la hora a la que llega cada camión a la
// garita de Ricardone (o al puerto, los transiles); todo lo demás sale de las estaciones y sus ritmos:
//
//   Ingreso RIC → Preingreso → [Playa 1] → Calada (6 calles)
//     soja/pellet al puerto: → [Playa demorado] → Salida 2 → ruta → Ingreso SL → [Playa OSL] → Balanza ingreso SL
//                             → Volcables SL (5) → [espera para salir] → Balanza egreso SL → Egreso SL
//     girasol en Ricardone:  → Balanza ingreso RIC → [Playa 3] → Volcables RIC (2) o Silos (Keppler 2 líneas, Chief)
//                             → Balanza egreso RIC
//
// Cada punto de descarga acepta ciertos productos (soja, girasol, pellet) y un camión solo va a uno que acepte
// el suyo. Una estación lenta llena la playa de adelante y, si la playa está llena, frena a la anterior:
// Playa 1 llena frena el preingreso, Playa demorado llena deja al camión en la calle de calada, Playa OSL con
// tope frena el ingreso del puerto, Playa 3 llena frena la balanza de Ricardone, y la espera para salir llena
// (hasta pasar el egreso) deja al camión arriba del volcable.
const N_ING_RIC = 0, N_PRE = 1, N_CAL = 2, N_BAL_RIC = 3, N_BAL_EGR_RIC = 16, N_SAL2 = 19;
const N_ING_SL = 20, N_BAL_SL = 22, N_VOLC = 25, N_BAL_EGR = 28, N_EGR_SL = 30;
const SL_NODES = new Set([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
// Estaciones de un solo puesto (las calles de calada y los puntos de descarga van aparte, uno por canal)
const STATIONS = ['ing', 'pre', 'sal2', 'balric', 'balegrric', 'ingsl', 'bal', 'balegr', 'egr', 'cargapellet', 'cargasoja'];
const TRAMO = {ingPre: 5.6, calSal2: 6, sal2IngSl: 12.8, balVolc: 16, volcBalEgr: 4, balEgrEgr: 5.3,
               calBalRic: 7.9, balRicP3: 7.4, descBalEgrRic: 15};
// Puntos de descarga de Ricardone: nodo y device del modelo, productos y ritmo por defecto (camiones por hora)
const RIC_DESC = [
  {k: 'vr1', lab: 'Volcable 1 Ricardone', short: 'VR1', node: 13, dev: 7, prods: ['girasol'], rate: 4.5},
  {k: 'vr2', lab: 'Volcable 2 Ricardone', short: 'VR2', node: 14, dev: 8, prods: ['girasol'], rate: 4.5},
  {k: 'k1', lab: 'Silo Keppler línea 1', short: 'K1', node: 7, dev: 9, prods: ['girasol', 'soja'], rate: 4.5},
  {k: 'k2', lab: 'Silo Keppler línea 2', short: 'K2', node: 7, dev: 10, prods: ['girasol', 'soja'], rate: 4.5},
  {k: 'ch', lab: 'Silo Chief', short: 'CH', node: 8, dev: -1, prods: ['girasol', 'soja'], rate: 4.5},
];
// Productos que acepta cada volcable del puerto por defecto (reglas de planta): pellet solo en el 3 y el 4
const PORT_PRODS = [['soja', 'girasol'], ['soja', 'girasol'], ['soja', 'girasol', 'pellet'], ['pellet', 'soja'], ['soja', 'girasol']];
const prodOf = g => g === 'pellet' ? 'pellet' : g === 'girasol' ? 'girasol' : g === 'liquido' ? 'liquido' : 'soja';
// Calles de calada: C1–C6 de grano y la de líquidos (RicCalLiq, device 6), que el 29/08 caló pellet, líquidos y girasol
const CAL_PRODS = [['soja', 'girasol'], ['soja', 'girasol'], ['soja', 'girasol'], ['soja', 'girasol'], ['soja', 'girasol'], ['soja', 'girasol'],
                   ['liquido', 'pellet', 'girasol']];
const CAL_LIQ_RATE = 6;  // camiones por hora (máximo visto: 7)

function motorKnobs(M) {
  // M: el motor preparado con motorPrep (de ahí salen productos por volcable y puntos de Ricardone del día).
  // Perillas por hora (de M.h0 a 26 h) copiadas de los perfiles calibrados, más los ritmos de cada estación.
  // Las garitas y balanzas sin medir van por encima de lo observado; en Ricardone abren los puntos que se usaron.
  return {cal: [...M.cal], calles: M.calles.map((c, i) => Math.max(c, M.cal[i] >= 60 ? 2 : 1)), volc: [...M.volc], vact: [...M.vact],
          st: {ing: 90, pre: 90, sal2: 90, balric: 40, balegrric: 40, ingsl: 90, bal: 60 / M.prm.bal_min, balegr: 40, egr: 90,
               cargapellet: ((M.carga || {}).pellet || {}).cap || 8, cargasoja: ((M.carga || {}).soja || {}).cap || 4},
          volcProds: (M.volcProds || PORT_PRODS).map(p => [...p]), calProds: CAL_PRODS.map(p => [...p]),
          calLiq: {on: M.calLiqUsed !== false, rate: M.calLiqRate || CAL_LIQ_RATE},
          rd: RIC_DESC.map((d, i) => ({on: M.rdDay ? M.rdDay[i].used : d.k === 'vr2' || d.k === 'k1', rate: d.rate, prods: M.rdDay ? [...M.rdDay[i].prods] : [...d.prods]})),
          fleet: Object.fromEntries(Object.entries(M.fleet || {}).map(([p, l]) => [p, l.length])),
          parada: 'juntos', N: 0, gate: M.prm.gate_extra, demoraPct: 100, capP1: 200, capDem: 30, capP3: 50, capOsl: 0, capSal: 20, live: []};
}

class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (Heap.lt(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && Heap.lt(a[l], a[m])) m = l; if (r < a.length && Heap.lt(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
  static lt(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
}

// Prepara los camiones: producto, horas reales de cada hito (con lo imputado por Python) e índice de la lectura
// en el recorrido, para poder correr las lecturas después. Los tramos a pie/ruta entre estaciones son los reales.
function motorPrep(M, dayTrucks) {
  const clip = (v, a, b, d) => v == null || !isFinite(v) ? d : Math.max(a, Math.min(b, v));
  const ric = M.ric.map(([i, pre, cal, delay, pi, jCal, dev]) => {
    const path = dayTrucks[i][3], find = (n, after) => path.findIndex(x => x[0] === n && x[1] >= after);
    const j1 = path.findIndex(x => x[0] === N_PRE && Math.abs(x[1] - pre) < 0.2);
    const j0 = path.findIndex(x => x[0] === N_ING_RIC && x[1] <= pre && x[1] > pre - 120);
    const j19 = find(N_SAL2, cal);
    const ing = j0 >= 0 ? path[j0][1] : pre - TRAMO.ingPre;
    const t20 = pi >= 0 ? M.port[pi][1] : null;
    const s2 = j19 >= 0 ? path[j19][1] : (t20 != null ? Math.max(cal, t20 - TRAMO.sal2IngSl) : cal + TRAMO.calSal2);
    const prod = prodOf(dayTrucks[i][1]);
    const r = {i, ing, pre, cal, s2, pi, dev, dest: prod === 'liquido' && dayTrucks[i][5] === 'R' ? '' : dayTrucks[i][5], prod, tons: dayTrucks[i][2] || 30,
               walk: clip(pre - ing, 0.5, 30, TRAMO.ingPre), demora: Math.max(0.5, s2 - cal),
               route: t20 != null ? clip(t20 - s2, 3, 90, TRAMO.sal2IngSl) : TRAMO.sal2IngSl,
               idx: {[N_ING_RIC]: j0, [N_PRE]: j1, [N_CAL]: jCal, [N_SAL2]: j19}};
    if (r.dest === 'R') {  // descarga en Ricardone: balanza de ingreso, Playa 3, punto de descarga, balanza de egreso
      const j3 = find(N_BAL_RIC, cal), jd = path.findIndex(x => [13, 14, 7, 8].includes(x[0]) && x[1] >= cal), j16 = find(N_BAL_EGR_RIC, cal);
      r.tBalRic = j3 >= 0 ? path[j3][1] : cal + TRAMO.calBalRic;
      r.tDesc = jd >= 0 ? path[jd][1] : r.tBalRic + 100;
      r.tBalEgrRic = j16 >= 0 ? path[j16][1] : r.tDesc + 35;
      r.walkBal = clip(r.tBalRic - cal, 1, 40, TRAMO.calBalRic);
      Object.assign(r.idx, {[N_BAL_RIC]: j3, desc: jd, [N_BAL_EGR_RIC]: j16});
    }
    return r;
  });
  const port = M.port.map(([i, t20, t22, t25, ri, j20, j22, j25]) => {
    const path = dayTrucks[i][3];
    let k = Math.max(j20, j22, j25), j28 = -1, j30 = -1;
    if (k >= 0) for (k = k + 1; k < path.length && SL_NODES.has(path[k][0]); k++) {
      if (path[k][0] === N_BAL_EGR && j28 < 0) j28 = k;
      if (path[k][0] === N_EGR_SL && j30 < 0) j30 = k;
    }
    const t28 = j28 >= 0 ? path[j28][1] : null, t30 = j30 >= 0 ? path[j30][1] : null;
    const pp = prodOf(dayTrucks[i][1]);  // en los volcables del puerto el líquido no se modela aparte: va como grano
    return {i, t20, t22, t25, t28: t28 ?? t25 + 11.7, t30: t30 ?? (t28 != null ? t28 + TRAMO.balEgrEgr : t25 + 17.4), ri, prod: pp === 'liquido' ? 'soja' : pp,
            tons: dayTrucks[i][2] || 30, transile: ri < 0 && dayTrucks[i][4] === 1,
            exitWalk: t28 != null && t30 != null ? clip(t30 - t28, 1, 20, TRAMO.balEgrEgr) : TRAMO.balEgrEgr,
            idx: {[N_ING_SL]: j20, [N_BAL_SL]: j22, [N_VOLC]: j25, [N_BAL_EGR]: j28, [N_EGR_SL]: j30}};
  });
  // qué calles y volcables trabajaron cada hora (por device): las que se abren primero cuando la perilla dice N
  const H = M.cal.length, order = (dev0, n) => {
    const tot = Array(n).fill(0), per = Array.from({length: H}, () => Array(n).fill(0));
    for (const t of dayTrucks) for (const [, m, dv] of t[3]) if (dv >= dev0 && dv < dev0 + n) {
      tot[dv - dev0]++; const h = Math.floor(m / 60) - M.h0; if (h >= 0 && h < H) per[h][dv - dev0]++;
    }
    return per.map(c => [...Array(n).keys()].sort((a, b) => (c[b] - c[a]) || (tot[b] - tot[a])));
  };
  // ritmo propio de cada volcable del puerto: p75 de sus camiones por hora en el día, entre 5 y 10
  const volcRate = [11, 12, 13, 14, 15].map(dv => {
    const c = {}; for (const t of dayTrucks) for (const [n, m, d] of t[3]) if (n === N_VOLC && d === dv && m >= 0 && m < 1440) c[Math.floor(m / 60)] = (c[Math.floor(m / 60)] || 0) + 1;
    const v = Object.values(c).sort((a, b) => a - b);
    return v.length ? Math.max(5, Math.min(10, v[Math.floor(0.75 * (v.length - 1))])) : 6;
  });
  // Productos por punto de descarga: las reglas de planta (PORT_PRODS, RIC_DESC) más lo que se vio descargar en
  // Ricardone ese día; las cámaras de los volcables pierden muchas lecturas (21/08: 182 de 414 camiones de soja),
  // así que para el puerto mandan las reglas. Los puntos de Ricardone que trabajaron arrancan abiertos.
  const prodsAt = match => {
    const c = {}; let n = 0;
    for (const t of dayTrucks) for (const [nd, m, d] of t[3]) if (match(nd, d)) { const p = prodOf(t[1]); c[p] = (c[p] || 0) + 1; n++; }
    return {n, prods: Object.keys(c).filter(p => c[p] >= Math.max(1, 0.03 * n))};
  };
  const rdDay = RIC_DESC.map(D => { const r = prodsAt((nd, d) => nd === D.node && (D.dev < 0 || d === D.dev || (D.k === 'k1' && d < 0))); return {used: r.n > 0, prods: [...new Set([...D.prods, ...r.prods])]}; });
  // calle de líquidos: ritmo medido ese día (p75 de sus camiones por hora, entre 2 y 7); se descuenta de la calada total
  const cl = {}; for (const t of dayTrucks) for (const [n, m, d] of t[3]) if (n === N_CAL && d === 6 && m >= 0 && m < 1440) cl[Math.floor(m / 60)] = (cl[Math.floor(m / 60)] || 0) + 1;
  const clv = Object.values(cl).sort((a, b) => a - b), calLiqUsed = clv.length > 0;
  const calLiqRate = calLiqUsed ? Math.max(2, Math.min(7, clv[Math.floor(0.75 * (clv.length - 1))])) : CAL_LIQ_RATE;
  // Flota de transiles (pellet y soja de silos): cada camión hace vueltas puerto → Ricardone → puerto. Del día real
  // salen la flota, la hora de su primera llegada al puerto y su vuelta (egreso SL → siguiente ingreso SL, mediana).
  const fleet = {}, fleetPass = new Set(), byTruck = {};
  port.forEach((p, k) => { if (p.transile && p.t22 >= M.T0) (byTruck[p.i] ||= []).push(k); });
  const vueltas = {};
  for (const ks of Object.values(byTruck)) { ks.sort((a, b) => port[a].t20 - port[b].t20); for (let n = 1; n < ks.length; n++) { const v = port[ks[n]].t20 - port[ks[n - 1]].t30; if (v > 20 && v < 720) (vueltas[port[ks[0]].prod] ||= []).push(v); } }
  const med = v => v && v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 120;
  for (const [i, ks] of Object.entries(byTruck)) {
    const p0 = port[ks[0]], vv = [];
    for (let n = 1; n < ks.length; n++) { const v = port[ks[n]].t20 - port[ks[n - 1]].t30; if (v > 20 && v < 720) vv.push(v); }
    ks.forEach(k => fleetPass.add(k));
    (fleet[p0.prod] ||= []).push({i: +i, prod: p0.prod, tons: p0.tons, first: p0.t20, until: port[ks[ks.length - 1]].t30 + 30,
      vuelta: vv.length ? med(vv) : med(vueltas[p0.prod]),
      viajesReal: ks.filter(k => port[k].t25 >= 0 && port[k].t25 < 1440).length});
  }
  for (const l of Object.values(fleet)) l.sort((a, b) => a.first - b.first);
  // La vuelta de un transil: egreso SL → Ricardone (ruta), adentro de Ricardone (tiempo fijo + cola y carga en tolva
  // o silo) y Ricardone → ingreso SL. La carga es una estación con su ritmo sostenido: salidas cargadas de
  // Ricardone de ese producto por hora, en las horas en que se cargó. Así, con más camiones, crece la cola de carga y no los viajes.
  const qv = (v, p, d) => v.length ? [...v].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))] : d;
  const carga = {};
  for (const t of dayTrucks) {
    if (t[4] !== 1) continue;
    const prod = prodOf(t[1]) === 'pellet' ? 'pellet' : 'soja', c = carga[prod] ||= {back: [], inside: [], toSl: [], dep: Array(24).fill(0)};
    t[3].forEach(([n, m], i) => {
      if (n === N_BAL_EGR_RIC && m >= 0 && m < 1440) c.dep[Math.floor(m / 60)]++;
      if (n !== N_EGR_SL) return;
      const nx = t[3].slice(i + 1), r0 = nx.find(x => [N_ING_RIC, N_PRE, N_BAL_RIC].includes(x[0])), r16 = nx.find(x => x[0] === N_BAL_EGR_RIC), r20 = nx.find(x => x[0] === N_ING_SL);
      if (r0 && r16 && r20 && r0[1] < r16[1] && r16[1] < r20[1]) { c.back.push(r0[1] - m); c.inside.push(r16[1] - r0[1]); c.toSl.push(r20[1] - r16[1]); }
    });
  }
  for (const [p, c] of Object.entries(carga)) {
    // ritmo sostenido: salidas cargadas por hora en las horas en que se cargó (el pico de 2 h no se sostiene)
    const act = c.dep.filter(x => x > 0), best = act.length ? act.reduce((x, y) => x + y, 0) / act.length : 0;
    // la cámara de la balanza de egreso de Ricardone pierde lecturas: el ritmo se toma de los viajes que llegan al
    // puerto (pasadas de la flota en el día) por hora con llegadas, si da más
    const llegH = Array(24).fill(0);
    (fleet[p] || []).forEach(fl => port.forEach((pp, k) => { if (fleetPass.has(k) && pp.i === fl.i && pp.t20 >= 0 && pp.t20 < 1440) llegH[Math.floor(pp.t20 / 60)]++; }));
    const actL = llegH.filter(x => x > 0), capL = actL.length ? actL.reduce((x, y) => x + y, 0) / actL.length : 0;
    carga[p] = {cap: Math.max(2, best, capL) || (p === 'pellet' ? 6 : 3), back: qv(c.back, 0.5, 11), inFix: Math.max(10, qv(c.inside, 0.1, 35) - 60 / Math.max(2, best || 6)), toSl: qv(c.toSl, 0.5, 18)};
  }
  return {...M, ric, port, nTrucks: dayTrucks.length, calOrder: order(0, 6), volcOrder: order(11, 5), volcRate, rdDay, calLiqUsed, calLiqRate,
          fleet, fleetPass, carga,
          volcFactor: 1.05};  // calibración con 4 días: descargas del puerto ±5 % (29/08 +2,4; 21/08 −3,7; 25/08 0; 03/09 +0,8)
}

// Llegadas extra: copia pct % de los camiones que llegan a Ricardone en el día (00 a 24 h), repartidos parejo y
// llegando `off` min después del original, con su producto, destino y tramos reales. Más de 100 % = varias rondas
// de copias (a 6, 12, 18… min del original). Sirve para medir cuánto más entraba con una configuración.
function motorAugment(P, dayTrucks, pct, off = 6) {
  const cand = P.ric.map((r, k) => k).filter(k => P.ric[k].ing >= 0 && P.ric[k].ing < 1440).sort((a, b) => P.ric[a].ing - P.ric[b].ing);
  const ric = [...P.ric], port = [...P.port], trucks = [...dayTrucks];
  let nExtra = 0;
  for (let round = 0; round * 100 < pct; round++) {
    const pr = Math.min(100, pct - round * 100), o = off * (round + 1);
    const sh = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' && /^t[A-Z\d]|^ing$|^pre$|^cal$|^s2$/.test(k) ? v + o : v]));
    for (const k of cand.filter((k, n) => Math.floor((n + 1) * pr / 100) > Math.floor(n * pr / 100))) {
      const r = P.ric[k], t = dayTrucks[r.i], ni = trucks.length;
      trucks.push([t[0] + ' (extra)', t[1], t[2], t[3].map(([n, m, d]) => [n, m + o, d]), t[4], t[5], t[6]]);
      const nr = ric.length;
      ric.push({...sh(r), i: ni, pi: r.pi >= 0 ? port.length : -1});
      if (r.pi >= 0) port.push({...sh(P.port[r.pi]), i: ni, ri: nr});
      nExtra++;
    }
  }
  return {P2: {...P, ric, port}, trucks, nExtra, port0: P.port.length};
}

// Camiones que llegan a Ricardone en el día (00 a 24 h) y descargan, por producto. Sin la flota de transile, que se
// maneja con su propia perilla (cantidad de camiones de la flota).
function motorLlegadas(P, dayTrucks) {
  const c = {};
  P.ric.forEach(r => { if (r.ing >= 0 && r.ing < 1440 && r.dest && dayTrucks[r.i][4] !== 1) c[r.prod] = (c[r.prod] || 0) + 1; });
  return c;
}

// Escenario hipotético: cuántos camiones de cada producto llegan a Ricardone en el día. Si se piden más, se copian
// camiones de ese producto (con su horario, destino y tramos reales, 7 min después del original por cada ronda); si se
// piden menos, se sacan parejo a lo largo del día. Lo que llegó antes de las 00 h y la flota de transile no se tocan.
function motorEscenario(P, dayTrucks, target) {
  const byProd = {};
  P.ric.forEach((r, k) => { if (r.ing >= 0 && r.ing < 1440 && r.dest && dayTrucks[r.i][4] !== 1) (byProd[r.prod] ||= []).push(k); });
  for (const l of Object.values(byProd)) l.sort((a, b) => P.ric[a].ing - P.ric[b].ing);
  const drop = new Set(), add = [];
  for (const [p, list] of Object.entries(byProd)) {
    if (target[p] == null) continue;
    const n = list.length, w = Math.max(0, Math.round(target[p]));
    if (w < n) { const q = n - w; list.forEach((k, j) => { if (Math.floor((j + 1) * q / n) > Math.floor(j * q / n)) drop.add(k); }); }
    else for (let j = 0; j < w - n; j++) add.push({k: list[j % n], round: Math.floor(j / n) + 1});
  }
  if (!drop.size && !add.length) return {P2: P, trucks: dayTrucks, nAdd: 0, nDrop: 0};
  // sacar: el camión y su visita al puerto; los índices se renumeran
  const mapR = new Map(), mapP = new Map(), ric = [], port = [];
  const trucks = dayTrucks.map((t, i) => t);
  P.ric.forEach((r, k) => { if (drop.has(k)) { const t = trucks[r.i]; trucks[r.i] = [t[0], t[1], t[2], [], t[4], '', 0]; } else { mapR.set(k, ric.length); ric.push(r); } });
  P.port.forEach((p, k) => { if (p.ri >= 0 && drop.has(p.ri)) return; mapP.set(k, port.length); port.push(p); });
  for (let j = 0; j < ric.length; j++) if (ric[j].pi >= 0) ric[j] = {...ric[j], pi: mapP.get(ric[j].pi)};
  for (let j = 0; j < port.length; j++) if (port[j].ri >= 0) port[j] = {...port[j], ri: mapR.get(port[j].ri)};
  const fleetPass = new Set([...(P.fleetPass || [])].filter(k => mapP.has(k)).map(k => mapP.get(k)));
  // sumar: copias del mismo producto
  for (const {k, round} of add) {
    const r = P.ric[k], t = dayTrucks[r.i], o = 7 * round, ni = trucks.length;
    const sh = x => Object.fromEntries(Object.entries(x).map(([kk, v]) => [kk, typeof v === 'number' && /^t[A-Z\d]|^ing$|^pre$|^cal$|^s2$/.test(kk) ? v + o : v]));
    trucks.push([t[0] + ' (escenario)', t[1], t[2], t[3].map(([n, m, d]) => [n, m + o, d]), t[4], t[5], t[6]]);
    const nr = ric.length;
    ric.push({...sh(r), i: ni, pi: r.pi >= 0 ? port.length : -1});
    if (r.pi >= 0) port.push({...sh(P.port[r.pi]), i: ni, ri: nr});
  }
  return {P2: {...P, ric, port, fleetPass}, trucks, nAdd: add.length, nDrop: drop.size};
}

function motorParadas(M, K) {
  return K.parada === 'sin' ? [] : K.parada === 'escalonada'
    ? M.prm.paradas.flatMap(([s, d, vs], k) => k === 0 ? vs.map((v, j) => [s + j * d, d, [v]]) : [[s, d, vs]])
    : M.prm.paradas;
}

// Estado de cada canal en el minuto t: calles de calada (6 de grano y la de líquidos), volcables del puerto (5),
// puntos de descarga de Ricardone (5) y estaciones.
// · Antes del control manual: lo que dicen las perillas de esa hora (el día como se midió).
// · Desde K.frozen.t (la primera jugada): cada canal queda como estaba en ese momento, con un solo producto, y solo
//   cambia con las jugadas de K.live ({t, g: 'cal'|'volc'|'rd'|'st', i, on?, rate?, prods?: [producto]}).
// · Cambiar de producto deja al canal sin recibir nada durante K.cambioMin (60 min por defecto).
function motorLaneState(M, K, t, paradas) {
  let cal, volc, rd, st;
  if (K.frozen && t >= K.frozen.t) {
    const F = K.frozen, cp = x => x.map(l => ({...l, prods: [...l.prods]}));
    cal = cp(F.cal); volc = cp(F.volc).map(v => ({...v, stop: false})); rd = cp(F.rd);
    st = Object.fromEntries(STATIONS.map(k => [k, {...F.st[k]}]));
  } else ({cal, volc, rd, st} = motorBaseState(M, K, t));
  const cambio = K.cambioMin ?? 60;
  for (const c of K.live || []) {
    if (c.t > t) break;
    const L = c.g === 'st' ? st[c.i] : ({cal, volc, rd})[c.g][c.i];
    if (c.on != null) L.on = c.on;
    if (c.rate != null) L.rate = c.rate;
    if (c.prods != null) {
      if (L.prods.length !== c.prods.length || L.prods.some(p => !c.prods.includes(p))) L.changeUntil = c.t + cambio;
      L.prods = [...c.prods];
    }
  }
  for (const L of [...cal, ...volc, ...rd]) L.changing = L.changeUntil != null && t < L.changeUntil;
  for (const [s0, d, vs] of paradas || motorParadas(M, K)) if (s0 <= t && t < s0 + d) vs.forEach(i => volc[i].stop = true);
  return {cal, volc, rd, st};
}

// El día como se midió en la hora de t (sin jugadas): calles y volcables abiertos según las perillas de esa hora
function motorBaseState(M, K, t) {
  const h = Math.max(0, Math.min(K.cal.length - 1, Math.floor(t / 60) - M.h0));
  const nc = K.cal[h] > 0 ? Math.max(1, Math.min(6, K.calles[h])) : 0;
  const rc = nc ? K.cal[h] / nc : (M.cal[h] / Math.max(1, M.calles[h]) || 30);
  const nv = Math.max(0, Math.min(5, K.vact[h]));
  const rv = nv ? K.volc[h] / nv : (M.volc[h] / Math.max(1, M.vact[h]) || 6);
  // abiertas = las N que más trabajaron esa hora (si no hay datos del día, las primeras N)
  const co = M.calOrder ? M.calOrder[h] : [0, 1, 2, 3, 4, 5], vo = M.volcOrder ? M.volcOrder[h] : [0, 1, 2, 3, 4];
  // la calada medida de esa hora incluye la calle de líquidos: lo que hace la CL (a su ritmo medido) se descuenta
  // del total antes de repartirlo entre las calles de grano
  const cp = K.calProds || CAL_PRODS, liq = K.calLiq || {on: false, rate: CAL_LIQ_RATE};
  const liq0 = M.calLiqUsed ? (M.calLiqRate || CAL_LIQ_RATE) : 0, rcg = nc ? Math.max(1, K.cal[h] - liq0) / nc : rc;
  const cal = [0, 1, 2, 3, 4, 5].map(i => ({on: co.indexOf(i) < nc, rate: rcg, prods: [...cp[i]]}));
  cal.push({on: liq.on, rate: liq.rate, prods: [...cp[6]]});
  // la capacidad de esa hora (K.volc) se reparte entre los abiertos en proporción al ritmo medido de cada volcable;
  // uno que se abra en vivo usa la misma escala. De 00 a 24 h va × volcFactor (calibración, ver motorPrep).
  const vr = M.volcRate || [1, 1, 1, 1, 1], openSum = [0, 1, 2, 3, 4].filter(i => vo.indexOf(i) < nv).reduce((a, i) => a + vr[i], 0);
  const sc = (openSum > 0 ? K.volc[h] / openSum : rv / (vr[0] || 1)) * (h + M.h0 >= 0 ? (M.volcFactor || 1) : 1);
  const volc = [0, 1, 2, 3, 4].map(i => ({on: vo.indexOf(i) < nv, rate: vr[i] * sc, stop: false, prods: [...K.volcProds[i]]}));
  const rd = K.rd.map(d => ({...d, prods: [...d.prods]}));
  const st = Object.fromEntries(STATIONS.map(k => [k, {on: true, rate: K.st[k]}]));
  return {cal, volc, rd, st};
}

// Arma el estado del control manual (desde tf): la configuración típica del día medido, no la de ese minuto (a la
// noche hay menos volcables abiertos y congelar eso deja el puerto corto todo el día). Un canal arranca abierto si
// trabajó la mayor parte del día (00 a 24 h), a su ritmo mediano; cada canal con un solo producto, repartidos según
// el volumen del día de cada producto en ese sector, con al menos uno por producto que lo necesite.
function motorFreeze(M, K, tf) {
  const S = Array.from({length: 24}, (_, h) => motorBaseState(M, K, h * 60 + 30));
  const med = v => v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0;
  // Configuración típica de un sector: la capacidad media del día (00 a 24 h) repartida entre productos según el
  // volumen de cada uno; cada producto usa los canales que hagan falta sin pasar el máximo físico por canal
  // (volcable 10 por hora), empezando por los que más trabajaron ese día. Así, sin tocar nada, se mueve parecido
  // al día medido.
  const inDay = v => v >= 0 && v < 1440, count = (xs, ok) => xs.reduce((c, x) => { if (ok(x)) c[x.prod] = (c[x.prod] || 0) + 1; return c; }, {});
  const demand = {cal: count(M.ric, r => inDay(r.pre)), volc: count(M.port, p => inDay(p.t20)), rd: count(M.ric, r => r.dest === 'R' && inDay(r.pre))};
  const MAXR = {cal: 60, volc: 10, rd: 6};
  const typical = key => {
    const lanes = S[0][key].map(l => ({...l, on: false, prods: [...l.prods]})), n = lanes.length, use = Array(n).fill(0);
    S.forEach(x => x[key].forEach((l, i) => { if (l.on) use[i]++; }));
    const capMean = S.reduce((a, x) => a + x[key].reduce((b, l) => b + (l.on ? l.rate : 0), 0), 0) / 24;
    const want = Object.entries(demand[key]).filter(([p, d]) => d > 0 && lanes.some(l => l.prods.includes(p)));
    const tot = want.reduce((a, [, d]) => a + d, 0);
    if (!tot || capMean <= 0) return lanes.map(l => ({...l, prods: [l.prods[0]]}));
    const order = [...Array(n).keys()].sort((a, b) => use[b] - use[a]), taken = new Set();
    const laneRate = lanes.map((l, i) => med(S.filter(x => x[key][i].on).map(x => x[key][i].rate)) || l.rate);
    // primero el producto con menos canales que lo acepten, después el resto
    want.sort((a, b) => lanes.filter(l => l.prods.includes(a[0])).length - lanes.filter(l => l.prods.includes(b[0])).length);
    for (const [p, d] of want) {
      const capP = capMean * d / tot, cands = order.filter(i => !taken.has(i) && lanes[i].prods.includes(p));
      const k = Math.max(1, Math.min(cands.length, Math.ceil(capP / MAXR[key])));
      // un canal abierto trabaja por lo menos a su ritmo normal medido (no tiene sentido un volcable a 0,7 por hora)
      cands.slice(0, k).forEach(i => { taken.add(i); Object.assign(lanes[i], {on: true, prods: [p], rate: Math.max(capP / k, Math.min(MAXR[key], laneRate[i]))}); });
    }
    return lanes.map(l => l.on ? l : {...l, prods: [l.prods[0]]});
  };
  const st = Object.fromEntries(STATIONS.map(k => [k, {on: true, rate: med(S.map(x => x.st[k].rate))}]));
  return {t: tf, cal: typical('cal'), volc: typical('volc'), rd: typical('rd'), st};
}

function motorRun(P, K) {
  const paradas = motorParadas(P, K);
  const ev = new Heap(); let seq = 0;
  const push = (t, kind, x) => ev.push([t, seq++, kind, x]);
  const inDay = t => t >= 0 && t < 1440;
  const outR = P.ric.map(() => ({})), outP = P.port.map(() => ({}));
  // las pasadas reales de la flota se reemplazan por las vueltas que hace cada camión en la simulación
  const PORT = P.port.map((p, k) => P.fleetPass && P.fleetPass.has(k) ? {...p, skip: true} : p);
  const fleetT = [];
  for (const [prod, list] of Object.entries(P.fleet || {})) {
    const n = Math.max(0, Math.round((K.fleet || {})[prod] ?? list.length));
    for (let j = 0; j < n && list.length; j++) {
      const T = list[j % list.length], extra = j >= list.length;
      fleetT.push({id: fleetT.length, prod, tons: T.tons, vuelta: T.vuelta, plateOf: T.i, vi: extra ? null : T.i, extra, trips: 0,
                   first: Math.max(P.T0, T.first + (extra ? 20 * Math.floor(j / list.length) : 0)),
                   until: T.until + (extra ? 20 * Math.floor(j / list.length) : 0)});
    }
  }
  const newTrip = (f, t) => {
    const k = PORT.length;
    PORT.push({i: f.vi, ri: -1, prod: f.prod, tons: f.tons, exitWalk: TRAMO.balEgrEgr, idx: {}, dyn: true, ft: f.id});
    outP.push({}); push(t, 'arr_sl', k);
  };
  const laneMin = {cal: Array.from({length: 7}, () => ({open: 0, stop: 0, off: 0})), volc: Array.from({length: 5}, () => ({open: 0, stop: 0, off: 0})),
                   rd: RIC_DESC.map(() => ({open: 0, stop: 0, off: 0}))};
  const Q = {ing: [], pre: [], cal: [], sal2: [], balric: [], p3: [], balegrric: [], ingsl: [], bal: [], volc: [], balegr: [], egr: [], cargapellet: [], cargasoja: []};
  const cargaEv = [];  // llegada a Ricardone e inicio de carga de cada vuelta, para la cola de carga
  const stBusy = Object.fromEntries(STATIONS.map(s => [s, -1e9]));
  const calBusy = Array(7).fill(-1e9), calHeld = Array(7).fill(null);
  const volcBusy = Array(5).fill(null), volcHeld = Array(5).fill(null), rdBusy = Array(RIC_DESC.length).fill(-1e9);
  let playa1 = 0, demorado = 0, playa3 = 0, osl = 0, salida = 0, downstream = 0, inTransit = 0;
  const downP = {};  // camiones pesados que todavía no bajaron del volcable, por producto
  const busy = {}, open = {};
  const addBusy = (res, t, dur) => { const b = busy[res] ||= {}; let m = t; while (m < t + dur) { const h = Math.floor(m / 60), s = Math.min(t + dur, (h + 1) * 60) - m; b[h] = (b[h] || 0) + s; m += s; } };
  const [ls, ld] = P.prm.bal_limpieza;
  // arranque a −6 h: lo que ya pasó antes queda como fue
  P.ric.forEach((r, k) => {
    const o = outR[k];
    if (r.cal < P.T0) {
      Object.assign(o, {ing: r.ing, pre: r.pre, cal: r.cal, fin: r.cal, fixed: true});
      if (r.dest === 'R') push(Math.max(P.T0, r.tBalRic), 'arr_balric', k);
      else if (r.pi < 0) { /* no va a ningún lado que modelemos */ }
      else if (r.s2 < P.T0) { o.s2 = r.s2; push(PORT[r.pi].t20, 'arr_sl', r.pi); }
      else { demorado++; push(r.s2, 'arr_sal2', k); }
    } else if (r.pre < P.T0) { Object.assign(o, {ing: r.ing, pre: r.pre}); playa1++; push(P.T0, 'arr_cal', k); }
    else push(Math.max(r.ing, P.T0), 'arr_ing', k);
  });
  // el primer viaje también sale de la carga en Ricardone: cada camión llega a la tolva o silo antes de su primera
  // llegada real al puerto (lo que tarda la carga, el tiempo fijo adentro y la ruta)
  fleetT.forEach(f => {
    const C = (P.carga || {})[f.prod === 'pellet' ? 'pellet' : 'soja'];
    const tc = C ? f.first - C.toSl - C.inFix - 60 / C.cap : null;
    if (C && tc >= P.T0) push(tc, 'arr_carga', f.id); else newTrip(f, f.first);
  });
  P.port.forEach((p, k) => {
    if (p.ri >= 0 || PORT[k].skip) return;
    if (p.t22 < P.T0) Object.assign(outP[k], {t20: p.t20, t22: p.t22, t25: p.t25, t28: p.t28, t30: p.t30, fixed: true});
    else push(Math.max(p.t20, P.T0), 'arr_sl', k);
  });
  for (let t = P.T0; t <= P.T_END; t += 1) push(t, 'tick', null);
  while (ev.size) {
    const [t, , kind, x] = ev.pop();
    if (t > P.T_END + 600) break;
    switch (kind) {
      case 'arr_ing': Q.ing.push(x); break;
      case 'arr_pre': Q.pre.push(x); break;
      case 'arr_cal': Q.cal.push(x); break;
      case 'cal_done': calHeld[x[0]] = x[1]; outR[x[1]].fin = t; break;
      case 'arr_sal2': Q.sal2.push(x); break;
      case 'arr_balric': Q.balric.push(x); break;
      case 'arr_p3': Q.p3.push(x); break;
      case 'rd_done': push(t + TRAMO.descBalEgrRic, 'arr_balegrric', x); break;
      case 'arr_balegrric': Q.balegrric.push(x); break;
      case 'arr_sl': if (PORT[x].ri >= 0) inTransit--; outP[x].arr = t; Q.ingsl.push(x); break;
      case 'arr_bal': Q.bal.push(x); break;
      case 'bal_done': push(t + TRAMO.balVolc, 'arr_volc', x); break;
      case 'arr_volc': Q.volc.push(x); break;
      case 'volc_done': volcHeld[x[0]] = x[1]; volcBusy[x[0]] = null; outP[x[1]].fin = t; break;
      case 'arr_balegr': Q.balegr.push(x); break;
      case 'balegr_done': push(t + PORT[x].exitWalk, 'arr_egr', x); break;
      case 'arr_egr': Q.egr.push(x); break;
      case 'arr_carga': { const f = fleetT[x]; const ev = {f: x, prod: f.prod, arr: t}; cargaEv.push(ev); Q[f.prod === 'pellet' ? 'cargapellet' : 'cargasoja'].push(ev); break; }
      case 'egr_done': salida--;
        // vuelve a Ricardone a cargar (cola en la tolva o silo) y viene de nuevo, dentro de su turno
        if (PORT[x].ft != null) {
          const f = fleetT[PORT[x].ft], C = (P.carga || {})[f.prod === 'pellet' ? 'pellet' : 'soja'];
          if (!C) { if (t + f.vuelta < Math.min(P.T_END, f.until)) newTrip(f, t + f.vuelta); }
          else if (t + C.back < Math.min(P.T_END, f.until)) push(t + C.back, 'arr_carga', f.id);
        }
        break;
    }
    const L = motorLaneState(P, K, t, paradas);
    if (kind === 'tick') {  // capacidad abierta por minuto, para saber qué estación manda
      const hr = Math.floor(t / 60), add = (res, n) => { const o = open[res] ||= {}; o[hr] = (o[hr] || 0) + n; };
      add('cal', L.cal.filter(c => c.on && c.rate > 0).length);
      add('volc', L.volc.filter(v => v.on && !v.stop && v.rate > 0).length);
      add('rd', L.rd.filter(v => v.on && v.rate > 0).length);
      for (const s of STATIONS) add(s, L.st[s].on && L.st[s].rate > 0 && !(s === 'bal' && ls <= t && t < ls + ld) ? 1 : 0);
      if (inDay(t)) for (const g of ['cal', 'volc', 'rd']) L[g].forEach((l, i) => {  // minutos abierto / parado / cerrado por canal
        const m = laneMin[g][i]; if (!l.on || l.rate <= 0) m.off++; else if (l.stop || l.changing) m.stop++; else m.open++;
      });
    }
    dispatch(t, L);
  }
  // Una estación de un puesto: atiende al primero de su cola (o al que `pick` elija) si está abierta, libre y la
  // regla `can` lo deja
  function serve(s, t, L, can, done, pick) {
    const q = Q[s], S = L.st[s];
    if (!q.length || !S.on || S.rate <= 0 || stBusy[s] > t || (can && !can())) return;
    const j = pick ? pick(q) : 0;
    if (j < 0) return;
    const x = q.splice(j, 1)[0], dur = 60 / S.rate;
    stBusy[s] = t + dur; addBusy(s, t, dur);
    done(x, t, dur);
  }
  // Descarga: cada punto libre toma al primero de la cola cuyo producto acepta
  function unload(lanes, q, prodOfX, isFree, start) {
    lanes.forEach((ln, s) => {
      if (!q.length || !ln.on || ln.stop || ln.changing || ln.rate <= 0 || !isFree(s)) return;
      const j = q.findIndex(x => ln.prods.includes(prodOfX(x)));
      if (j < 0) return;
      start(s, q.splice(j, 1)[0], 60 / ln.rate);
    });
  }
  function dispatch(t, L) {
    // Ricardone: ingreso, preingreso y calada
    serve('ing', t, L, null, (k, t0, d) => { outR[k].ing = t0; push(t0 + d + P.ric[k].walk, 'arr_pre', k); });
    serve('pre', t, L, () => !K.capP1 || playa1 < K.capP1, (k, t0, d) => { outR[k].pre = t0; playa1++; push(t0 + d, 'arr_cal', k); });
    // el camión calado deja la calle solo si hay lugar adelante (Playa demorado para los que van al puerto)
    for (let c = 0; c < 7; c++) {
      const k = calHeld[c]; if (k == null) continue;
      const r = P.ric[k];
      if (r.dest === 'R') { calHeld[c] = null; push(t + r.walkBal, 'arr_balric', k); }
      else if (r.pi < 0) calHeld[c] = null;
      else if (!K.capDem || demorado < K.capDem) { calHeld[c] = null; demorado++; push(t + r.demora * (inDay(t) ? K.demoraPct / 100 : 1), 'arr_sal2', k); }
    }
    // cada calle libre cala al primero de Playa 1 cuyo producto acepta
    for (let c = 0; c < 7 && Q.cal.length; c++) {
      const ln = L.cal[c];
      if (!ln.on || ln.changing || ln.rate <= 0 || calBusy[c] > t || calHeld[c] != null) continue;
      const j = Q.cal.findIndex(k => ln.prods.includes(P.ric[k].prod));
      if (j < 0) continue;
      const k = Q.cal.splice(j, 1)[0], dur = 60 / ln.rate;
      calBusy[c] = t + dur; addBusy('cal', t, dur); addBusy('cal' + c, t, dur); playa1--;
      Object.assign(outR[k], {cal: t, calle: c});
      push(t + dur, 'cal_done', [c, k]);
    }
    // Ricardone, girasol: balanza de ingreso → Playa 3 → volcable o silo → balanza de egreso
    serve('balric', t, L, () => !K.capP3 || playa3 < K.capP3, (k, t0, d) => { outR[k].tBalRic = t0; playa3++; push(t0 + d + TRAMO.balRicP3, 'arr_p3', k); });
    unload(L.rd, Q.p3, k => P.ric[k].prod, s => rdBusy[s] <= t, (s, k, dur) => {
      rdBusy[s] = t + dur; addBusy('rd', t, dur); addBusy('rd' + s, t, dur); playa3--;
      Object.assign(outR[k], {tDesc: t, rd: s});
      push(t + dur, 'rd_done', k);
    });
    serve('balegrric', t, L, null, (k, t0) => { outR[k].tBalEgrRic = t0; });
    // Salida 2: si está puesto el tope, solo suelta con Playa OSL + ruta por debajo de N
    serve('sal2', t, L, () => !K.N || osl + Q.ingsl.length + inTransit < K.N, (k, t0, d) => {
      outR[k].s2 = t0; demorado--; inTransit++; push(t0 + d + P.ric[k].route, 'arr_sl', P.ric[k].pi);
    });
    // Puerto: el ingreso se frena si Playa OSL está llena (cuando tiene tope)
    serve('ingsl', t, L, () => !K.capOsl || osl < K.capOsl, (k, t0, d) => { outP[k].t20 = t0; osl++; push(t0 + d, 'arr_bal', k); });
    // la balanza pesa al primero de Playa OSL que tenga lugar adelante: cada producto tiene (volcables abiertos que lo
    // reciben) × (1 + en camino) lugares, así una avalancha de soja no tapa al pellet que tiene su volcable libre
    const nv = L.volc.filter(v => v.on).length, lugar = p => L.volc.filter(v => v.on && v.prods.includes(p)).length * (1 + K.gate);
    serve('bal', t, L, () => !(ls <= t && t < ls + ld) && downstream < nv * (1 + K.gate),
      (k, t0, d) => { const p = PORT[k].prod; outP[k].t22 = t0; osl--; downstream++; downP[p] = (downP[p] || 0) + 1; push(t0 + d, 'bal_done', k); },
      q => q.findIndex(k => (downP[PORT[k].prod] || 0) < lugar(PORT[k].prod)));
    // volcables: el que terminó baja solo si hay lugar en la espera para salir (hasta pasar el egreso)
    for (let s = 0; s < 5; s++) if (volcHeld[s] != null && (!K.capSal || salida < K.capSal)) {
      const k = volcHeld[s]; volcHeld[s] = null; downstream--; downP[PORT[k].prod]--; salida++;
      outP[k].baja = t; push(t + TRAMO.volcBalEgr, 'arr_balegr', k);
    }
    unload(L.volc, Q.volc, k => PORT[k].prod, s => volcBusy[s] === null && volcHeld[s] == null, (s, k, dur) => {
      volcBusy[s] = t + dur; addBusy('volc', t, dur); addBusy('volc' + s, t, dur);
      Object.assign(outP[k], {t25: t, srv: s});
      push(t + dur, 'volc_done', [s, k]);
    });
    serve('balegr', t, L, null, (k, t0, d) => { outP[k].t28 = t0; push(t0 + d, 'balegr_done', k); });
    serve('egr', t, L, null, (k, t0, d) => { outP[k].t30 = t0; push(t0 + d, 'egr_done', k); });
    // carga de transiles en Ricardone: sale cargado y llega al puerto después del tiempo fijo adentro y la ruta
    for (const cs of ['cargapellet', 'cargasoja']) serve(cs, t, L, null, (ev, t0, d) => {
      ev.ini = t0; const f = fleetT[ev.f], C = P.carga[cs === 'cargapellet' ? 'pellet' : 'soja'];
      const next = t0 + d + C.inFix + C.toSl;
      if (next < Math.min(P.T_END, f.until + 60)) newTrip(f, next);
    });
  }
  return {outR, outP, busy, open, port: PORT, fleetT, laneMin, cargaEv};
}

// Medidas del día sobre el resultado del motor (las mismas para lo medido y para la simulación)
function motorMetrics(P, run) {
  const BIG = 1e9, inDay = v => v >= 0 && v < 1440, mean = v => v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  const R = P.ric.map((r, k) => { const o = run.outR[k]; return {pre: o.pre ?? BIG, cal: o.cal ?? BIG, fin: o.fin ?? BIG, s2: o.s2 ?? BIG,
    tBalRic: o.tBalRic ?? BIG, tDesc: o.tDesc ?? BIG, arr: r.ing, needS2: r.pi >= 0, R: r.dest === 'R', prod: r.prod, tons: r.tons}; });
  const PORT = run.port || P.port;
  const Pp = PORT.map((p, k) => p.skip ? null : (o => ({t20: o.t20 ?? BIG, t22: o.t22 ?? BIG, t25: o.t25 ?? BIG, arr: o.arr ?? BIG, prod: p.prod, tons: p.tons || 30, ft: p.ft}))(run.outP[k])).filter(Boolean);
  const hs = [...Array(24).keys()];
  const q = (xs, a, b, f = () => true) => hs.map(h => xs.filter(x => f(x) && x[a] <= h * 60 && h * 60 < x[b]).length);
  const playa1 = q(R, 'pre', 'cal'), osl = q(Pp, 't20', 't22'), demorado = q(R, 'fin', 's2', x => x.needS2), playa3 = q(R, 'tBalRic', 'tDesc', x => x.R);
  // qué estación manda en cada bloque de 4 h: la más de abajo que trabaja a ≥ 90 % de lo que tiene abierto
  const NAMES = {egr: 'egreso del puerto', balegr: 'balanza de egreso del puerto', volc: 'volcables del puerto', bal: 'balanza de ingreso del puerto',
                 ingsl: 'ingreso del puerto', sal2: 'Salida 2 de Ricardone', rd: 'descarga de Ricardone', balric: 'balanza de Ricardone',
                 cal: 'calada de Ricardone', pre: 'preingreso', ing: 'ingreso de Ricardone'};
  const mando = [];
  for (let h0 = 0; h0 < 24; h0 += 4) {
    const u = res => { let b = 0, o = 0; for (let i = 0; i < 4; i++) { b += (run.busy[res] || {})[h0 + i] || 0; o += ((run.open[res] || {})[h0 + i] || 0); } return o ? b / o : 0; };
    const key = Object.keys(NAMES).find(r => u(r) >= 0.9);
    mando.push({h0, quien: key ? NAMES[key] : 'llegadas (no hay cola)', key: key || null, uCal: u('cal'), uVol: u('volc')});
  }
  const porProd = {soja: 0, girasol: 0, pellet: 0}, tonsProd = {soja: 0, girasol: 0, pellet: 0};
  Pp.forEach(x => { if (inDay(x.t25)) { porProd[x.prod]++; tonsProd[x.prod] += x.tons; } });
  R.forEach(x => { if (x.R && inDay(x.tDesc)) { porProd[x.prod]++; tonsProd[x.prod] += x.tons; } });
  const descPuerto = Pp.filter(x => inDay(x.t25)).length, descRic = R.filter(x => x.R && inDay(x.tDesc)).length;
  // viajes de cada camión de la flota de transile (descargas en el día)
  const viajes = (run.fleetT || []).map(f => ({id: f.id, prod: f.prod, plateOf: f.plateOf, extra: f.extra,
    viajes: Pp.filter(x => x.ft === f.id && inDay(x.t25)).length}));
  // horas de cada canal en el día: descargando/calando, abierto sin trabajo, parado (parada o cambio) y cerrado
  const lanes = {};
  for (const g of ['cal', 'volc', 'rd']) lanes[g] = (run.laneMin ? run.laneMin[g] : []).map((m, i) => {
    let b = 0; for (let h = 0; h < 24; h++) b += (run.busy[g + i] || {})[h] || 0;
    return {activo: b / 60, ocioso: Math.max(0, m.open - b) / 60, parado: m.stop / 60, cerrado: m.off / 60};
  });
  return {
    descargas: descPuerto + descRic, descPuerto, descRic, porProd, tonsProd, tons: Object.values(tonsProd).reduce((a, b) => a + b, 0), viajes, lanes,
    esperaEntrada: mean(R.filter(x => inDay(x.pre) && x.arr >= 0).map(x => x.pre - x.arr)),
    esperaCal: mean(R.filter(x => inDay(x.cal) && x.pre < BIG).map(x => x.cal - x.pre)),
    esperaOsl: mean(Pp.filter(x => inDay(x.t22)).map(x => x.t22 - x.t20)),
    esperaP3: mean(R.filter(x => x.R && inDay(x.tDesc) && x.tBalRic < BIG).map(x => x.tDesc - x.tBalRic)),
    playa1, osl, ret: demorado, demorado, playa3, mando,
    pendientes: Pp.filter(x => x.arr <= 1440 && 1440 < x.t25).length + R.filter(x => x.arr <= 1440 && 1440 < x.cal).length
      + R.filter(x => x.R && x.cal <= 1440 && 1440 < x.tDesc).length,
  };
}

// Series para los velocímetros: horas de paso por cada estación y, minuto a minuto, cuántos hay en cada playa
function motorSeries(P, run) {
  const sortT = a => a.filter(v => v != null && v > -60 && v < 1440).sort((x, y) => x - y);
  const PORT = run.port || P.port;
  const R = run.outR.filter(o => !o.fixed), Pp = run.outP.filter((o, k) => !o.fixed && !PORT[k].skip);
  const occ = () => new Int32Array(1442);
  const z = {entrada: occ(), playa1: occ(), demorado: occ(), playa3: occ(), osl: occ(), salida: occ(), ruta: occ(), carga: occ()};
  const PR = ['soja', 'girasol', 'pellet', 'liquido'];
  const zp = Object.fromEntries(Object.keys(z).map(k => [k, Object.fromEntries(PR.map(p => [p, occ()]))]));
  const span2 = (k, p, a, b) => { span(z[k], a, b); span(zp[k][p], a, b); };
  const span = (arr, a, b) => { if (a == null) return; const s0 = Math.max(0, Math.ceil(a)), e = Math.min(1441, Math.ceil(b ?? 1e9)); if (e > s0) { arr[s0]++; arr[e]--; } };
  P.ric.forEach((r, k) => {
    const o = run.outR[k]; if (o.fixed) return;
    span2('entrada', r.prod, Math.max(r.ing, P.T0), o.pre); span2('playa1', r.prod, o.pre, o.cal);
    if (r.pi >= 0) span2('demorado', r.prod, o.fin, o.s2);
    if (r.dest === 'R') span2('playa3', r.prod, o.tBalRic, o.tDesc);
  });
  run.outP.forEach((o, k) => { if (o.fixed || PORT[k].skip) return; const p = PORT[k].prod; span2('osl', p, o.t20, o.t22); span2('salida', p, o.baja, o.t30); span2('ruta', p, o.arr, o.t20); });
  for (const ev of run.cargaEv || []) span2('carga', ev.prod === 'pellet' ? 'pellet' : 'soja', ev.arr, ev.ini);
  for (const a of [...Object.values(z), ...Object.values(zp).flatMap(x => Object.values(x))]) for (let m = 1; m < 1442; m++) a[m] += a[m - 1];
  return {ing: sortT(R.map(o => o.ing)), pre: sortT(R.map(o => o.pre)), cal: sortT(R.map(o => o.cal)), sal2: sortT(R.map(o => o.s2)),
          balric: sortT(R.map(o => o.tBalRic)), rd: sortT(R.map(o => o.tDesc)), balegrric: sortT(R.map(o => o.tBalEgrRic)),
          ingsl: sortT(Pp.map(o => o.t20)), bal: sortT(Pp.map(o => o.t22)), volc: sortT(Pp.map(o => o.t25)),
          balegr: sortT(Pp.map(o => o.t28)), egr: sortT(Pp.map(o => o.t30)), cargaR: sortT((run.cargaEv || []).map(e => e.ini)), ...z, porProd: zp};
}

// Recorridos simulados con el formato de days/<día>.json: cada lectura de un hito toma la hora del motor (y, en
// la descarga, el punto que eligió el motor); las otras lecturas se corren con el hito siguiente (la espera queda
// en la playa). Los hitos sin lectura real de calada, ingreso SL, balanzas o descarga se agregan para que se vean.
function motorTrucks(P, run, dayTrucks) {
  const anchorsOf = dayTrucks.map(() => []);
  const add = (i, j, node, real, sim, dev, insert) => { if (real != null && sim != null) anchorsOf[i].push([j >= 0 ? j : null, node, real, sim, dev, insert]); };
  P.ric.forEach((r, k) => {
    const o = run.outR[k]; if (o.fixed) return;
    const path = dayTrucks[r.i][3], dev = j => j >= 0 ? path[j][2] : -1;
    add(r.i, r.idx[N_ING_RIC], N_ING_RIC, r.ing, o.ing, dev(r.idx[N_ING_RIC]), false);
    add(r.i, r.idx[N_PRE], N_PRE, r.pre, o.pre, dev(r.idx[N_PRE]), false);
    add(r.i, r.idx[N_CAL], N_CAL, r.cal, o.cal, o.calle != null ? o.calle : r.dev, true);
    if (r.pi >= 0) add(r.i, r.idx[N_SAL2], N_SAL2, r.s2, o.s2, dev(r.idx[N_SAL2]), false);
    if (r.dest === 'R') {
      add(r.i, r.idx[N_BAL_RIC], N_BAL_RIC, r.tBalRic, o.tBalRic, -1, true);
      const D = o.rd != null ? RIC_DESC[o.rd] : null;
      if (D) add(r.i, r.idx.desc, D.node, r.tDesc, o.tDesc, D.dev, true);
      add(r.i, r.idx[N_BAL_EGR_RIC], N_BAL_EGR_RIC, r.tBalEgrRic, o.tBalEgrRic, -1, true);
    }
  });
  const PORT = run.port || P.port, fleetVi = new Set((run.fleetT || []).filter(f => f.vi != null).map(f => f.vi));
  PORT.forEach((p, k) => {
    const o = run.outP[k]; if (o.fixed || p.skip || p.dyn) return;
    const path = dayTrucks[p.i][3], dev = j => j >= 0 ? path[j][2] : -1;
    add(p.i, p.idx[N_ING_SL], N_ING_SL, p.t20, o.t20, dev(p.idx[N_ING_SL]), true);
    add(p.i, p.idx[N_BAL_SL], N_BAL_SL, p.t22, o.t22, dev(p.idx[N_BAL_SL]), true);
    add(p.i, p.idx[N_VOLC], N_VOLC, p.t25, o.t25, o.srv != null ? 11 + o.srv : dev(p.idx[N_VOLC]), true);
    add(p.i, p.idx[N_BAL_EGR], N_BAL_EGR, p.t28, o.t28, dev(p.idx[N_BAL_EGR]), false);
    add(p.i, p.idx[N_EGR_SL], N_EGR_SL, p.t30, o.t30, dev(p.idx[N_EGR_SL]), false);
  });
  // camiones de la flota: recorrido armado con sus vueltas (puerto → Ricardone → puerto); los de más van al final
  const fleetReads = {};
  PORT.forEach((p, k) => {
    if (!p.dyn) return; const o = run.outP[k]; if (o.t20 == null) return;
    const r = fleetReads[p.ft] ||= [];
    r.push([N_ING_SL, o.t20, -1]);
    if (o.t22 != null) r.push([N_BAL_SL, o.t22, -1]);
    if (o.t25 != null) r.push([N_VOLC, o.t25, 11 + o.srv]);
    if (o.t28 != null) r.push([N_BAL_EGR, o.t28, -1]);
    if (o.t30 != null) r.push([N_EGR_SL, o.t30, -1], [N_ING_RIC, o.t30 + 15, -1]);
  });
  const fleetTruck = f => {
    const r = (fleetReads[f.id] || []).slice().sort((a, b) => a[1] - b[1]), out = [];
    r.forEach((x, n) => {  // antes de cada ingreso al puerto, la balanza de egreso de Ricardone (sale cargado)
      if (x[0] === N_ING_SL && x[1] - 18 > (out.length ? out[out.length - 1][1] : -1e9)) out.push([N_BAL_EGR_RIC, x[1] - 18, -1]);
      out.push(x);
    });
    const t = dayTrucks[f.plateOf];
    return [t[0] + (f.extra ? ' (flota +)' : ''), t[1], t[2], out.length ? out : t[3], 1, 'S', t[2]];
  };
  const fleetOf = Object.fromEntries((run.fleetT || []).filter(f => f.vi != null).map(f => [f.vi, f]));
  const extras = (run.fleetT || []).filter(f => f.extra).map(fleetTruck);
  return dayTrucks.map((t, i) => {
    if (fleetOf[i]) return fleetTruck(fleetOf[i]);
    if (fleetVi.size && t[4] === 1 && (P.fleet || {})[prodOf(t[1])]?.some(f => f.i === i)) return [t[0], t[1], t[2], [], t[4], '', 0];  // camión de la flota que no se usa
    const A = anchorsOf[i]; if (!A.length) return t;
    A.sort((a, b) => a[2] - b[2]);
    const byIdx = new Map(A.filter(a => a[0] !== null).map(a => [a[0], a]));
    const reads = [];
    t[3].forEach(([n, m, dv], k) => {
      if (byIdx.has(k)) { const a = byIdx.get(k); reads.push([a[1], a[3], a[4]]); return; }
      const prev = A.filter(a => a[2] <= m), nxt = A.find(a => a[2] > m);
      let nw;
      if (!prev.length) nw = nxt ? Math.min(m, nxt[3] - 0.1) : m;
      else if (nxt) nw = Math.min(Math.max(nxt[3] - (nxt[2] - m), prev[prev.length - 1][3] + 0.5), nxt[3] - 0.1);
      else { const p = prev[prev.length - 1]; nw = p[3] + (m - p[2]); }
      reads.push([n, nw, dv]);
    });
    for (const a of A) if (a[0] === null && a[5]) reads.push([a[1], a[3], a[4]]);
    reads.sort((a, b) => a[1] - b[1]);
    return [t[0], t[1], t[2], reads, t[4], t[5], t[6]];
  }).concat(extras).filter(t => t[3].length);
}
