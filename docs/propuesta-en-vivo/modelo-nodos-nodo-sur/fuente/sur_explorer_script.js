const D = /*__DATA__*/null;
const NS = 'http://www.w3.org/2000/svg';
const PL = { ricardone: 'Ricardone', san_lorenzo: 'San Lorenzo' };
const CATS = D.cats, CK = D.catKey;
const CAT_TXT = { 'Recepción': 'Recepción', 'Despacho': 'Despacho', 'Transile interno': 'Transile interno', 'Transile externo': 'Transile entre plantas' };
const byId = Object.fromEntries(D.nodes.map(n => [n.id, n]));
const circById = Object.fromEntries(D.circuits.map(c => [c.id, c]));
const inL = {}, outL = {}, linkKey = {};
D.edges.forEach((l, i) => {
  l.i = i;
  (outL[l.from] = outL[l.from] || []).push(l);
  (inL[l.to] = inL[l.to] || []).push(l);
  linkKey[l.from + '>' + l.to] = l;
});
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const state = { plant: 'all', cat: 'all', node: 'ricardone:Balanza Egreso', circuit: '', hover: null, hoverC: null };

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- cifras ----------
document.getElementById('stats').innerHTML = [
  [D.nodes.length, 'nodos'], [D.circuits.length, 'circuitos'], [D.edges.length, 'conexiones'],
  [D.circuits.filter(c => c.plants.length > 1).length, 'cruzan de planta'], [D.nodes.filter(n => !n.hasCamera && !n.area).length, 'sin cámara'], [D.nodes.filter(n => n.area).length, 'playas (áreas)'],
].map(([v, t]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('');

// ---------- red: un hilo por circuito, haces de mayor a menor ----------
const svg = document.getElementById('net');
const gE = el('g', {}, svg), gO = el('g', { 'aria-hidden': 'true' }, svg), gN = el('g', {}, svg), gL = el('g', { 'aria-hidden': 'true' }, svg), gB = el('g', { 'aria-hidden': 'true' }, svg);
D.edges.slice().sort((a, b) => a.n - b.n).forEach(l => {
  const p = el('path', { d: l.d, class: 'e', stroke: l.tone, 'stroke-width': l.lw }, gE);
  el('title', {}, p).textContent = `${byId[l.from].label} → ${byId[l.to].label} · ${plural(l.n, 'circuito', 'circuitos')}`;
  l.el = p;
});
(D.optEdges || []).forEach(l => {
  const p = el('path', { d: l.d, class: 'eopt' }, gE);
  el('title', {}, p).textContent = `${byId[l.from].label} → ${byId[l.to].label} · desvío (solo camión demorado)`;
});
const areaTxt = n => n.area ? ` · playa, capacidad ${n.capacity} camiones` : '';
D.nodes.forEach(n => {
  const g = el('g', { tabindex: '0', role: 'button', 'aria-label': `${n.label}, ${PL[n.plant]}, ${plural(n.circuits.length, 'circuito', 'circuitos')}` }, gN);
  el('circle', { cx: n.x, cy: n.y, r: n.r, class: 'core' }, g);
  el('title', {}, g).textContent = `${n.label} · ${PL[n.plant]}${n.code ? ' · ' + n.code : ''}${areaTxt(n)}${n.hasCamera || n.area ? '' : ' · sin cámara'}`;
  g.addEventListener('click', () => selectNode(n.id));
  g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(n.id); } });
  g.addEventListener('mouseenter', () => { state.hover = n.id; apply(); });
  g.addEventListener('mouseleave', () => { state.hover = null; apply(); });
  n.el = g;
  const t = el('text', { x: n.lab.x, y: n.lab.y, 'text-anchor': 'middle', class: 'label' }, gL);
  t.textContent = n.label;
  n.labEl = t;
  if (n.area) {
    const k = el('text', { x: n.x, y: n.y + 6, 'text-anchor': 'middle', class: 'cap' }, gL);
    k.textContent = n.capacity;
    n.capEl = k;
  }
});
[['RICARDONE', 0, 23, 'start'], ['SAN LORENZO', 1664, 23, 'end']].forEach(([t, x, y, a]) => {
  el('text', { x, y, 'text-anchor': a, class: 'ptitle' }, gL).textContent = t;
});

// ---------- filtros ----------
function pillGroup(id, items, key) {
  const box = document.getElementById(id);
  items.forEach(([val, text, sw]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pill'; b.dataset.val = val;
    b.innerHTML = (sw ? `<span class="swc" style="background:var(--${sw})"></span>` : '') + esc(text);
    b.addEventListener('click', () => { state[key] = val; syncPills(); fillSelect(); apply(); renderPanel(); renderTable(); });
    box.appendChild(b);
  });
}
pillGroup('f-plant', [['all', 'Nodo Sur'], ['ricardone', 'Ricardone'], ['san_lorenzo', 'San Lorenzo']], 'plant');
pillGroup('f-cat', [['all', 'Todos'], ...CATS.map(c => [c, CAT_TXT[c], CK[c]])], 'cat');
function syncPills() {
  document.querySelectorAll('#f-plant .pill').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === state.plant)));
  document.querySelectorAll('#f-cat .pill').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === state.cat)));
}
const circOk = c => (state.plant === 'all' || c.plants.includes(state.plant)) && (state.cat === 'all' || c.cat === state.cat);
const nodeOk = n => (state.plant === 'all' || n.plant === state.plant) && (n.optional || n.circuits.some(id => circOk(circById[id])));

const sel = document.getElementById('circuito');
function fillSelect() {
  const groups = {};
  D.circuits.filter(circOk).forEach(c => { (groups[c.plants[0]] = groups[c.plants[0]] || []).push(c); });
  let html = '<option value="">Ninguno: ver la red completa</option>';
  for (const p of Object.keys(PL)) {
    if (!groups[p]) continue;
    html += `<optgroup label="Empiezan en ${PL[p]}">` + groups[p].map(c => `<option value="${c.id}">${c.id} · ${esc(CAT_TXT[c.cat])} · ${esc(c.desc)}</option>`).join('') + '</optgroup>';
  }
  sel.innerHTML = html;
  if (state.circuit && !circOk(circById[state.circuit])) state.circuit = '';
  sel.value = state.circuit;
}
sel.addEventListener('change', () => { state.circuit = sel.value; apply(); renderPanel(); });

// ---------- vista ----------
function apply() {
  const cSel = state.circuit || state.hoverC;
  const c = cSel ? circById[cSel] : null;
  const focus = c ? null : (state.hover || state.node);
  const through = focus ? new Set(byId[focus].circuits) : null;
  const onNodes = c ? new Set(c.seq) : null;
  D.edges.forEach(l => {
    let st = '';
    const ok = l.circuits.some(id => circOk(circById[id])) && (state.plant === 'all' || byId[l.from].plant === state.plant || byId[l.to].plant === state.plant);
    if (c) st = ' dim';
    else if (!ok) st = ' dim';
    else if (focus && l.from !== focus && l.to !== focus) st = ' faint';
    l.el.setAttribute('class', 'e' + st);
  });
  gO.replaceChildren();
  if (c) c.seq.forEach((id, i) => {
    if (!i) return;
    const l = linkKey[c.seq[i - 1] + '>' + id];
    if (l) el('path', { d: l.d, class: 'ov ' + CK[c.cat] }, gO);
  });
  D.nodes.forEach(n => {
    let st = '';
    if (c) st = onNodes.has(n.id) ? '' : ' dim';
    else if (!nodeOk(n)) st = ' dim';
    else if (focus && n.id !== focus && !(inL[focus] || []).some(l => l.from === n.id) && !(outL[focus] || []).some(l => l.to === n.id)) st = ' faint';
    n.el.setAttribute('class', 'node' + (n.area ? ' area' : n.hasCamera ? '' : ' nocam') + st + (!c && n.id === state.node ? ' sel' : ''));
    n.labEl.setAttribute('class', 'label' + st);
    if (n.capEl) n.capEl.setAttribute('class', 'cap' + st);
  });
  drawBadges(c);
}

function drawBadges(c) {
  gB.replaceChildren();
  if (!c) return;
  const idx = {};
  c.seq.forEach((id, i) => (idx[id] = idx[id] || []).push(i + 1));
  for (const id in idx) {
    const n = byId[id], txt = idx[id].join('·');
    const w = 12 + 10.5 * txt.length, x = n.x + n.r * 0.5, y = n.y - n.r - 18;
    const g = el('g', { class: 'badge' }, gB);
    el('rect', { x, y, width: w, height: 24, rx: 12 }, g);
    el('text', { x: x + w / 2, y: y + 17, 'text-anchor': 'middle' }, g).textContent = txt;
  }
}

// ---------- ficha ----------
const panel = document.getElementById('panel');
function catCounts(ids) {
  const k = {};
  ids.forEach(id => { const c = circById[id].cat; k[c] = (k[c] || 0) + 1; });
  return CATS.filter(c => k[c]).map(c => [c, k[c]]);
}
const catLine = ids => catCounts(ids).map(([c, k]) => `<span><i class="swc" style="background:var(--${CK[c]})"></i>${esc(CAT_TXT[c])} <b>${k}</b></span>`).join('');
function stackBar(ids, max) {
  return '<span class="bar" aria-hidden="true">' + catCounts(ids).map(([c, k]) => `<i style="width:${(100 * k / max).toFixed(1)}%; background:var(--${CK[c]})"></i>`).join('') + '</span>';
}
function flowList(list, dir) {
  if (!list.length) return `<p class="empty">${dir === 'in' ? 'Es el primer paso de sus circuitos.' : 'Es el último paso de sus circuitos.'}</p>`;
  const max = Math.max(...list.map(l => l.n));
  return '<ul class="flows">' + list.slice().sort((a, b) => b.n - a.n).map(l => {
    const other = byId[dir === 'in' ? l.from : l.to];
    const pl = l.inter ? ` <span class="pl">· ${PL[other.plant]}</span>` : '';
    return `<li><button type="button" class="linkbtn" data-node="${esc(other.id)}">${esc(other.label)}${pl}</button>${stackBar(l.circuits, max)}<b>${l.n}</b></li>`;
  }).join('') + '</ul>';
}
function nodeCard(id) {
  const n = byId[id], ins = inL[id] || [], outs = outL[id] || [];
  const areaHtml = n.area ? `<p class="warn area-note"><b>Playa · área de espera · capacidad ${n.capacity} camiones.</b> Sin cámara propia ni dato del sistema de camiones: se mide por las cámaras de su entrada y su salida. Acá pasan los camiones la mayor parte del ciclo.</p>` : '';
  if (n.optional) return `<p class="meta">${PL[n.plant]}</p><h2>${esc(n.label)}</h2>` + areaHtml
    + '<p class="empty">Desvío: no es un paso de ningún circuito. Va solo el camión demorado después de Calada; de acá sigue a Balanza ingreso o a Salida 2.</p>';
  return `<p class="meta">${PL[n.plant]}` + (n.code ? ` <span class="tag">${esc(n.code)}</span>` : '') + (n.area ? '' : n.hasCamera ? ` <span class="tag">${n.devices.length} cámara${n.devices.length === 1 ? '' : 's'}</span>` : ' <span class="tag none">sin cámara</span>') + '</p>'
    + `<h2>${esc(n.label)}</h2>` + areaHtml
    + `<p class="kpi"><b>${n.circuits.length}</b>de ${D.circuits.length} circuitos pasan por acá</p>`
    + `<div class="cats">${catLine(n.circuits)}</div>`
    + `<h3><span>De dónde llega</span><span>${ins.length}</span></h3>` + flowList(ins, 'in')
    + `<h3><span>A dónde sigue</span><span>${outs.length}</span></h3>` + flowList(outs, 'out')
    + `<h3><span>Circuitos</span><span>${n.circuits.length}</span></h3>`
    + `<div class="chips">${n.circuits.map(c => `<button type="button" data-circ="${c}" class="${CK[circById[c].cat]}" title="${esc(CAT_TXT[circById[c].cat] + ' · ' + circById[c].desc)}">${c}</button>`).join('')}</div>`;
}
const ISSUES = {
  R33: 'La matriz salta del paso 8 al 10.', R34: 'La matriz salta del paso 8 al 10.',
};
function circuitCard(cid) {
  const c = circById[cid];
  let html = `<p class="meta"><i class="swc" style="background:var(--${CK[c.cat]})"></i>${esc(CAT_TXT[c.cat])} · ${c.plants.map(p => PL[p]).join(' → ')}</p>`
    + `<h2>${esc(c.id)}</h2><p class="kpi"><b>${c.seq.length}</b>pasos</p>`;
  if (ISSUES[cid]) html += `<p class="warn">${esc(ISSUES[cid])}</p>`;
  html += '<h3><span>Recorrido</span><span>paso</span></h3><ol class="steps">';
  let last = null;
  c.seq.forEach((id, i) => {
    const n = byId[id];
    if (last && n.plant !== last) html += `<li class="cross">Cruza a ${PL[n.plant]}</li>`;
    last = n.plant;
    html += `<li><button type="button" data-node="${esc(id)}"><span class="n">${i + 1}</span><span>${esc(n.label)}</span>`
      + (n.code ? `<span class="tag">${esc(n.code)}</span>` : '') + (n.area ? `<span class="tag area">playa ${n.capacity}</span>` : n.hasCamera ? '' : '<span class="tag none">sin cámara</span>') + '</button></li>';
  });
  return html + '</ol><button type="button" class="ghost" data-clear="1">Volver a la red completa</button>';
}
function renderPanel() { panel.innerHTML = state.circuit ? circuitCard(state.circuit) : nodeCard(state.node); }
function selectCircuit(cid) {
  state.circuit = cid;
  if (!circOk(circById[cid])) { state.plant = 'all'; state.cat = 'all'; syncPills(); }
  fillSelect(); apply(); renderPanel(); renderTable();
}
panel.addEventListener('click', e => {
  const t = e.target.closest('[data-node],[data-circ],[data-clear]');
  if (!t) return;
  if (t.dataset.node) selectNode(t.dataset.node);
  else if (t.dataset.circ) selectCircuit(t.dataset.circ);
  else { state.circuit = ''; sel.value = ''; apply(); renderPanel(); }
});
function selectNode(id) {
  state.node = id; state.circuit = ''; sel.value = '';
  apply(); renderPanel(); renderTable();
}

// ---------- tabla ----------
const tbody = document.getElementById('tbody');
function renderTable() {
  const order = Object.keys(PL);
  const rows = D.nodes.filter(n => state.plant === 'all' || n.plant === state.plant)
    .sort((a, b) => order.indexOf(a.plant) - order.indexOf(b.plant) || b.circuits.length - a.circuits.length || a.label.localeCompare(b.label));
  tbody.innerHTML = rows.map(n => `<tr class="${n.id === state.node ? 'is-sel' : ''}">`
    + `<td><button type="button" class="linkbtn" data-node="${esc(n.id)}">${esc(n.label)}</button></td>`
    + `<td>${PL[n.plant]}</td>`
    + `<td>${n.code ? `<span class="tag">${esc(n.code)}</span>` : ''}${n.area ? ` <span class="tag area">playa ${n.capacity}</span>` : n.hasCamera ? '' : ' <span class="tag none">sin cámara</span>'}</td>`
    + `<td class="num">${n.circuits.length}</td><td class="num">${(inL[n.id] || []).length}</td><td class="num">${(outL[n.id] || []).length}</td></tr>`).join('');
}
tbody.addEventListener('click', e => { const t = e.target.closest('[data-node]'); if (t) selectNode(t.dataset.node); });

syncPills(); fillSelect(); apply(); renderPanel(); renderTable();
