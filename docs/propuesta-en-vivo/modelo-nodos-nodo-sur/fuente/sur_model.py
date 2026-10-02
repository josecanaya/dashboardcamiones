# -*- coding: utf-8 -*-
"""Nodo Sur (Ricardone + San Lorenzo): una línea por circuito.
Cada circuito es un hilo del color de su tipo de movimiento; los hilos que comparten una conexión
van lado a lado, así el grosor de la conexión es la suma de sus circuitos.
Salida: sur_geo.json (SVG de la lámina + etiquetas), sur_data.json (explorador), sur_preview.html."""
import json, math, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
raw = json.load(open(os.path.join(HERE, 'modelo_nodos_raw.json'), encoding='utf-8'))
WID = json.load(open(os.path.join(HERE, 'widths.json'), encoding='utf-8'))
WID_T = {'RICARDONE': 157, 'SAN LORENZO': 184}

PAPER, INK, MUTED = '#F5F6F2', '#13202E', '#8A97A5'
AREA, AREA_FILL = '#C27C0E', '#FBE9C8'   # playas: áreas de espera
CATS = ['Recepción', 'Despacho', 'Transile interno', 'Transile externo']
CAT_COLOR = {'Recepción': '#1A8FD0', 'Despacho': '#D9542B', 'Transile interno': '#3A8F63', 'Transile externo': '#7A5BB5'}
CAT_KEY = {'Recepción': 'rec', 'Despacho': 'des', 'Transile interno': 'tin', 'Transile externo': 'tex'}
PITCH, GAP_S, GAP_C = 1.5, 0.4, 1.2      # paso entre hilos, luz entre hilos, luz extra entre tipos
OX, OY, W, H = 128, 290, 1664, 620       # lienzo en la lámina

SHORT = {
    'Pre ingreso': 'Preingreso', 'Balanza Ingreso': 'Balanza ingreso', 'Balanza Egreso': 'Balanza egreso',
    'Volcable Silo Keppler': 'Silo Keppler', 'Volcable Silo Chief': 'Silo Chief',
    'Tolva de carga Celda 09': 'Tolva Celda 09', 'Tolva de carga Celda 10': 'Tolva Celda 10',
    'Tolva de carga Celda 11': 'Tolva Celda 11', 'Tolva de carga silo Chief': 'Tolva silo Chief',
    'Liquidos Carga/Descarga': 'Líquidos', 'Carga / Descarga OSL': 'Carga OSL',
    'Playa  espera Volcables': 'Playa volcables', 'Plataformas Volcables': 'Volcables',
    'Playa de egreso': 'Playa de salida',
    'Carga/descarga': 'Carga y descarga', 'Carga/Descarga Renova': 'Renova',
}

# "Playa espera Volcables" de la matriz no existe: es Playa OSL (29-09-2026), entre Ingreso y Balanza ingreso.
PLAYA_OLD, PLAYA_OSL = 'san_lorenzo:Playa  espera Volcables', 'san_lorenzo:Playa OSL'
for _n in raw['nodos']:
    if _n['id'] == PLAYA_OLD:
        _n['id'], _n['name'] = PLAYA_OSL, 'Playa OSL'
for _c in raw['circuitos']:
    _c['secuencia'] = [PLAYA_OSL if s == PLAYA_OLD else s for s in _c['secuencia']]

N = {n['id']: dict(n) for n in raw['nodos'] if n['plant'] != 'avellaneda'}
# Playas que la matriz no tiene (29-09-2026). Playa 1: espera entre Preingreso y Calada, la pasan
# todos. Playa demorado: después de Calada, solo el camión demorado (desvío, no es paso de circuito).
PLAYA_1, PLAYA_DEMORADO = 'ricardone:Playa 1', 'ricardone:Playa demorado'
N[PLAYA_1] = {'id': PLAYA_1, 'plant': 'ricardone', 'code': '', 'name': 'Playa 1'}
N[PLAYA_DEMORADO] = {'id': PLAYA_DEMORADO, 'plant': 'ricardone', 'code': '', 'name': 'Playa demorado'}

# ---------- áreas de espera (playas): sin cámara propia ni dato del sistema de camiones; se miden
# por las cámaras de su entrada y su salida. Capacidad en camiones (dato de planta, 29-09-2026). ----------
AREAS = {
    PLAYA_1: 300,
    PLAYA_DEMORADO: 20,
    'ricardone:Playa 3': 100,
    'ricardone:Playa de egreso': 4,
    PLAYA_OSL: 150,
}
# Desvíos opcionales (no son pasos de ningún circuito): se dibujan punteados.
OPTIONAL_EDGES = [('ricardone:Calada', PLAYA_DEMORADO), (PLAYA_DEMORADO, 'ricardone:Balanza Ingreso'),
                  (PLAYA_DEMORADO, 'ricardone:Salida 2')]
N['ricardone:Volcable 2']['code'] = 'S9'   # confirmado: Volcable 2 tiene cámara (S9 cubre ambos volcables)
N['ricardone:Volcable Silo Chief']['code'] = 'S8'   # confirmado 29-09: Silo Chief se lee con las cámaras del sector S8
for n in N.values():
    n['label'] = SHORT.get(n['name'], n['name'].strip())
CIRC = [c for c in raw['circuitos'] if all(s in N for s in c['secuencia'])]
assert len(CIRC) == 49, len(CIRC)

# ---------- cámaras por nodo (feed real TruckFlow; nodo sin devices = sin cámara) ----------
CAMS = json.load(open(os.path.join(HERE, 'camaras_por_nodo.json'), encoding='utf-8'))
assert set(k for k in CAMS if not k.startswith('_')) == set(N), set(N) ^ set(k for k in CAMS if not k.startswith('_'))
for nid, n in N.items():
    n['devices'] = CAMS[nid]['devices']
    n['rear'] = CAMS[nid]['rear']
    n['hasCamera'] = bool(n['devices'])
    n['area'] = nid in AREAS
    n['capacity'] = AREAS.get(nid)
    n['optional'] = nid == PLAYA_DEMORADO

# ---------- correcciones al modelo (decisiones 29-09-2026, ver ../../CRUCE_NODOS_VS_ETL.md) ----------
# La matriz de Vicentin queda intacta; el modelo de nodos es la fuente de verdad y estas son sus diferencias.
_SL_VOLCABLES = ['san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso',
                 'san_lorenzo:Plataformas Volcables', 'san_lorenzo:Balanza Egreso', 'san_lorenzo:Egreso']
_RIC_A_PUERTO = ['ricardone:Balanza Egreso', 'ricardone:Calada', 'ricardone:Salida 2']


def _ric_leg(c):
    return [s for s in c['secuencia'] if s.startswith('ricardone:')]


for c in CIRC:
    cid = c['id']
    if cid in ('R26', 'R27', 'R28', 'R29', 'R30', 'R31', 'R32'):
        ric = _ric_leg(c)
        if cid == 'R26':
            # Tenía dos pasos 8 (Calada y Playa de egreso) y salía por Salida 1: un transile hacia el
            # puerto vuelve a Calada y sale por Salida 2, como R27–R32.
            ric = ric[:ric.index('ricardone:Balanza Egreso')] + _RIC_A_PUERTO
        # Pata SL de granos: volcables y Balanza egreso, no "Carga OSL" (líquidos). La espera en
        # Playa OSL la agrega el paso de abajo, como en R7.
        c['secuencia'] = ric + ['san_lorenzo:Ingreso', PLAYA_OSL] + _SL_VOLCABLES[1:]
    if PLAYA_OSL in c['secuencia']:
        # Playa OSL va inmediatamente después del Ingreso de San Lorenzo (antes de Calada / Balanza ingreso).
        s = [x for x in c['secuencia'] if x != PLAYA_OSL]
        i = s.index('san_lorenzo:Ingreso')
        c['secuencia'] = s[:i + 1] + [PLAYA_OSL] + s[i + 1:]
    # Playa 1: todo camión espera ahí entre Preingreso y Calada.
    s, out = c['secuencia'], []
    for i, x in enumerate(s):
        out.append(x)
        if x == 'ricardone:Pre ingreso' and i + 1 < len(s) and s[i + 1] == 'ricardone:Calada':
            out.append(PLAYA_1)
    c['secuencia'] = out
    c['pasos'] = list(range(1, len(c['secuencia']) + 1))   # R33/R34 saltaban del paso 8 al 10

# Circuito nuevo: el camión cala en Ricardone y descarga líquido en el puerto (R8 queda solo Ricardone).
CIRC.append({'id': 'R35', 'categoria': ['Recepción'],
             'secuencia': ['ricardone:Ingreso', 'ricardone:Pre ingreso', PLAYA_1, 'ricardone:Calada', 'ricardone:Salida 2',
                           'san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso', 'san_lorenzo:Carga/descarga',
                           'san_lorenzo:Balanza Egreso', 'san_lorenzo:Egreso'],
             'pasos': list(range(1, 11))})
LABELS = {'R35': 'Calada Ricardone → descarga líquidos puerto'}


def cat(c):
    return c['categoria'][0] if isinstance(c['categoria'], list) else c['categoria']


def natkey(cid):
    m = re.match(r'([A-Za-z]+)(\d+)', cid)
    return (m.group(1), int(m.group(2)))


CBY = {c['id']: c for c in CIRC}
E = defaultdict(list)
for c in sorted(CIRC, key=lambda c: natkey(c['id'])):
    for a, b in zip(c['secuencia'], c['secuencia'][1:]):
        if c['id'] not in E[(a, b)]:
            E[(a, b)].append(c['id'])
for k in E:
    E[k].sort(key=lambda cid: (CATS.index(cat(CBY[cid])), natkey(cid)))

# ---------- posiciones (x, y, lado de etiqueta) ----------
PLACE = {
    'ricardone:Ingreso': (52, 178, 'b'),
    'ricardone:Pre ingreso': (112, 300, 'b'),
    'ricardone:Playa 1': (178, 452, 'b'),
    'ricardone:Playa demorado': (300, 500, 'b'),
    'ricardone:Calada': (262, 364, 'bl'),
    'ricardone:Salida 2': (250, 150, 'r'),
    'ricardone:Balanza Ingreso': (392, 262, 't'),
    'ricardone:Celda 16': (500, 150, 't'),
    'ricardone:Playa 3': (532, 330, 'b'),
    'ricardone:Liquidos Carga/Descarga': (470, 474, 'b'),
    'ricardone:Tolva de carga silo Chief': (660, 104, 'r'),
    'ricardone:Volcable 1': (684, 152, 'r'),
    'ricardone:Volcable Silo Keppler': (700, 202, 'r'),
    'ricardone:Volcable Silo Chief': (708, 252, 'r'),
    'ricardone:Volcable 2': (710, 302, 'r'),
    'ricardone:Silo Australiano': (706, 352, 'r'),
    'ricardone:Tolva de carga Celda 10': (696, 402, 'r'),
    'ricardone:Tolva de carga Celda 09': (680, 452, 'r'),
    'ricardone:Tolva de carga Celda 11': (660, 502, 'r'),
    'ricardone:Balanza Egreso': (956, 292, 't'),
    'ricardone:Playa de egreso': (970, 432, 'r'),
    'ricardone:Salida 1': (1000, 566, 'l'),
    'san_lorenzo:Ingreso': (1176, 150, 'l'),
    'san_lorenzo:Calada': (1228, 318, 'l'),
    'san_lorenzo:Balanza Ingreso': (1306, 196, 't'),
    'san_lorenzo:Balanza Egreso': (1486, 196, 't'),
    'san_lorenzo:Egreso': (1618, 150, 'b'),
    'san_lorenzo:Carga/Descarga Renova': (1348, 352, 'b'),
    'san_lorenzo:Carga/descarga': (1420, 322, 't'),
    'san_lorenzo:Cargadero': (1540, 318, 'b'),
    'san_lorenzo:Carga / Descarga OSL': (1262, 470, 'l'),
    'san_lorenzo:Playa OSL': (1240, 64, 'r'),
    'san_lorenzo:Plataformas Volcables': (1580, 460, 'b'),
}
assert set(PLACE) == set(N), (set(N) - set(PLACE), set(PLACE) - set(N))
for i, (x, y, s) in PLACE.items():
    N[i]['x'], N[i]['y'], N[i]['side'] = x, y, s


# ---------- curvas base ----------
def quad_pts(a, b, bend=0.12):
    ax, ay, bx, by = a['x'], a['y'], b['x'], b['y']
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    return [(ax, ay), (mx - dy * bend, my + dx * bend), (bx, by)]


def SP(f):
    return f


SPECIAL = {
    ('ricardone:Balanza Egreso', 'ricardone:Calada'): lambda a, b: [a, (a[0] - 120, a[1] + 320), (b[0] + 80, b[1] + 280), b],
    ('ricardone:Salida 2', 'san_lorenzo:Ingreso'): lambda a, b: [a, (a[0] + 200, 26), (b[0] - 250, 26), b],
    ('san_lorenzo:Egreso', 'ricardone:Ingreso'): lambda a, b: [a, (a[0] - 300, -30), (b[0] + 260, -30), b],
    ('ricardone:Salida 1', 'san_lorenzo:Ingreso'): lambda a, b: [a, (a[0] + 90, a[1] - 90), (b[0] - 100, b[1] + 150), b],
}


def base_pts(a, b):
    k = (a, b)
    A, B = (N[a]['x'], N[a]['y']), (N[b]['x'], N[b]['y'])
    return SPECIAL[k](A, B) if k in SPECIAL else quad_pts(N[a], N[b])


def offset_pts(pts, d):
    """Tiller-Hanson: desplaza cada tramo del polígono de control y corta tramos vecinos."""
    segs = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1e-9
        nx, ny = -dy / L, dx / L
        segs.append(((x0 + nx * d, y0 + ny * d), (x1 + nx * d, y1 + ny * d), (dx, dy)))
    out = [segs[0][0]]
    for s1, s2 in zip(segs, segs[1:]):
        (p, _, u), (q, _, v) = s1, s2
        det = u[0] * v[1] - u[1] * v[0]
        if abs(det) < 1e-6:
            out.append(s1[1])
        else:
            t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det
            out.append((p[0] + u[0] * t, p[1] + u[1] * t))
    out.append(segs[-1][1])
    return out


def dstr(pts, prec=1):
    f = lambda v: f'{v:.{prec}f}'.rstrip('0').rstrip('.')
    c = 'Q' if len(pts) == 3 else 'C'
    return f'M{f(pts[0][0])} {f(pts[0][1])}{c}' + ' '.join(f'{f(x)} {f(y)}' for x, y in pts[1:])


def bez(pts, t):
    if len(pts) == 3:
        (a, b, c) = pts
        return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1])
    a, b, c, d = pts
    u = 1 - t
    return (u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
            u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1])


# ---------- haces ----------
edges = []
for (a, b), cids in E.items():
    pts = base_pts(a, b)
    pos, prev, centers = 0.0, None, []
    for cid in cids:
        ct = cat(CBY[cid])
        if prev is not None and ct != prev:
            pos += GAP_C
        centers.append(pos + PITCH / 2)
        pos += PITCH
        prev = ct
    Wb = pos
    strands = [{'c': cid, 'cat': cat(CBY[cid]), 'd': dstr(offset_pts(pts, o - Wb / 2))} for cid, o in zip(cids, centers)]
    edges.append({'from': a, 'to': b, 'n': len(cids), 'W': round(Wb, 2), 'pts': pts, 'd': dstr(pts), 'circuits': cids,
                  'strands': strands, 'inter': N[a]['plant'] != N[b]['plant']})

opt_edges = [{'from': a, 'to': b, 'd': dstr(quad_pts(N[a], N[b], 0.18))} for a, b in OPTIONAL_EDGES]

for n in N.values():
    inc = [e['W'] for e in edges if n['id'] in (e['from'], e['to'])]
    n['circuitos'] = sorted({cid for e in edges if n['id'] in (e['from'], e['to']) for cid in e['circuits']}, key=natkey)
    n['r'] = round(7 + 15 * math.sqrt(len(n['circuitos']) / 42), 1) if n['circuitos'] else 13.0

# ---------- etiquetas ----------
LH, PADX = 32, 4


def label_rect(n):
    r, w = n['r'], WID[n['label']] + 2 * PADX
    x, y, s = n['x'], n['y'], n['side']
    g = 6
    pos = {'r': (x + r + g, y - LH / 2), 'l': (x - r - g - w, y - LH / 2), 't': (x - w / 2, y - r - 3 - LH),
           'b': (x - w / 2, y + r + 3), 'tr': (x + r * .6, y - r - LH + 6), 'tl': (x - r * .6 - w, y - r - LH + 6),
           'br': (x + r * .6, y + r - 6), 'bl': (x - r * .6 - w, y + r - 6)}[s]
    return pos[0], pos[1], w


for n in N.values():
    n['lx'], n['ly'], n['lw'] = label_rect(n)
TITLES = [('RICARDONE', 0, 0, 'ricardone'), ('SAN LORENZO', W - WID_T['SAN LORENZO'], 0, 'san_lorenzo')]


def ov(a, b, pad=0):
    return not (a[2] + pad <= b[0] or b[2] + pad <= a[0] or a[3] + pad <= b[1] or b[3] + pad <= a[1])


issues = []
rects = [(n, (n['lx'], n['ly'], n['lx'] + n['lw'], n['ly'] + LH)) for n in N.values()]
rects += [({'id': 'T:' + t, 'label': t}, (x, y, x + WID_T[t], y + LH)) for t, x, y, _ in TITLES]
for i, (a, ra) in enumerate(rects):
    if ra[0] < 0 or ra[1] < 0 or ra[2] > W or ra[3] > H:
        issues.append(('fuera', a['label']))
    for b, rb in rects[i + 1:]:
        if ov(ra, rb, 4):
            issues.append(('etiqueta-etiqueta', a['label'], b['label']))
    for m in N.values():
        if m is a:
            continue
        if ov(ra, (m['x'] - m['r'], m['y'] - m['r'], m['x'] + m['r'], m['y'] + m['r']), 3):
            issues.append(('etiqueta-nodo', a['label'], m['label']))
    for e in edges:
        if a.get('id') in (e['from'], e['to']):
            continue
        hw = e['W'] / 2 + 1
        for k in range(1, 40):
            px, py = bez(e['pts'], k / 40)
            if ra[0] - hw < px < ra[2] + hw and ra[1] - hw < py < ra[3] + hw and e['n'] >= 5:
                issues.append(('etiqueta-haz', a['label'], N[e['from']]['label'] + '→' + N[e['to']]['label'], e['n']))
                break
ns = list(N.values())
for i, a in enumerate(ns):
    for b in ns[i + 1:]:
        if math.hypot(a['x'] - b['x'], a['y'] - b['y']) < a['r'] + b['r'] + 10:
            issues.append(('nodos', a['label'], b['label']))

# ---------- tono: más circuitos superpuestos = más oscuro ----------
RAMP = [(0.0, (0xC4, 0xD4, 0xE3)), (0.5, (0x4F, 0x7C, 0xA6)), (1.0, (0x0E, 0x1F, 0x38))]
NMAX = max(e['n'] for e in edges)


def tone(n):
    t = math.log(n) / math.log(NMAX)
    for (t0, c0), (t1, c1) in zip(RAMP, RAMP[1:]):
        if t <= t1:
            u = (t - t0) / (t1 - t0)
            return '#%02X%02X%02X' % tuple(round(a + (b - a) * u) for a, b in zip(c0, c1))
    return '#%02X%02X%02X' % RAMP[-1][1]


def lw(n):
    return round(2.4 + 2.6 * math.log(n) / math.log(NMAX), 2)


for e in edges:
    e['tone'], e['lw'] = tone(e['n']), lw(e['n'])

# ---------- SVG de la lámina ----------
svg = []
for e in sorted(edges, key=lambda e: e['n']):
    svg.append(f'<path d="{e["d"]}" fill="none" stroke="{e["tone"]}" stroke-width="{e["lw"]}" stroke-linecap="round"/>')


def circ(x, y, r):
    return f'M{x - r:.1f} {y}a{r:.1f} {r:.1f} 0 1 0 {2 * r:.1f} 0a{r:.1f} {r:.1f} 0 1 0 {-2 * r:.1f} 0'


cam = ''.join(circ(n['x'], n['y'], n['r']) for n in N.values() if n['hasCamera'] and not n['area'])
nocam = ''.join(circ(n['x'], n['y'], n['r']) for n in N.values() if not n['hasCamera'] and not n['area'])
area = ''.join(circ(n['x'], n['y'], n['r']) for n in N.values() if n['area'])
svg.append(f'<path d="{cam}" fill="{PAPER}" stroke="{INK}" stroke-width="3.5"/>')
svg.append(f'<path d="{nocam}" fill="{PAPER}" stroke="{MUTED}" stroke-width="3" stroke-dasharray="5 4"/>')
svg.append(f'<path d="{area}" fill="{AREA_FILL}" stroke="{AREA}" stroke-width="4"/>')
for e in opt_edges:
    svg.insert(0, f'<path d="{e["d"]}" fill="none" stroke="{AREA}" stroke-width="2.5" stroke-dasharray="6 5"/>')
svg_inner = ''.join(svg)
ARIA = (f'Nodo Sur: {len(N)} nodos y {len(CIRC)} circuitos de Ricardone y San Lorenzo. Los circuitos se superponen: '
        'cuantos más circuitos comparten una conexión, más oscura es la línea')
svg_el = (f'<svg aria-label="{ARIA}" style="position:absolute; left:{OX}px; top:{OY}px" width="{W}" height="{H}" '
          f'viewBox="0 0 {W} {H}">{svg_inner}</svg>')
labels = [{'text': n['label'], 'left': round(OX + n['lx']), 'top': round(OY + n['ly']), 'width': round(n['lw'])} for n in N.values()]
titles = [{'text': t, 'left': OX + x, 'top': OY + y, 'width': WID_T[t], 'plant': p} for t, x, y, p in TITLES]
json.dump({'svg': svg_el, 'labels': labels, 'titles': titles}, open(os.path.join(HERE, 'sur_geo.json'), 'w', encoding='utf-8'), ensure_ascii=False)

# ---------- datos del explorador ----------
data = {
    'W': W, 'H': H, 'pitch': PITCH - GAP_S, 'cats': CATS, 'catKey': CAT_KEY,
    'nodes': [{'id': n['id'], 'plant': n['plant'], 'label': n['label'], 'code': n['code'], 'hasCamera': n['hasCamera'],
               'devices': n['devices'], 'rear': n['rear'], 'area': n['area'], 'capacity': n['capacity'], 'optional': n['optional'], 'x': n['x'], 'y': n['y'], 'r': n['r'],
               'lab': {'x': round(n['lx'] + n['lw'] / 2, 1), 'y': round(n['ly'] + 23, 1)}, 'circuits': n['circuitos']} for n in N.values()],
    'edges': [{'from': e['from'], 'to': e['to'], 'n': e['n'], 'd': e['d'], 'circuits': e['circuits'], 'inter': e['inter'],
               'tone': e['tone'], 'lw': e['lw']} for e in edges], 'optEdges': opt_edges, 'nmax': NMAX, 'ramp': [tone(1), tone(6), tone(NMAX)],
    'circuits': [{'id': c['id'], 'cat': cat(c), 'seq': c['secuencia'], **({'label': LABELS[c['id']]} if c['id'] in LABELS else {}),
                  'plants': list(dict.fromkeys(N[s]['plant'] for s in c['secuencia']))} for c in sorted(CIRC, key=lambda c: natkey(c['id']))],
}
json.dump(data, open(os.path.join(HERE, 'sur_data.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---------- vista previa ----------
lbl = ''.join(f'<p style="position:absolute; left:{l["left"]}px; top:{l["top"]}px; width:{l["width"]}px; margin:0; font:24px/32px \'IBM Plex Sans\', Arial; '
              f'color:{INK}; text-align:center; white-space:nowrap; background:rgba(245,246,242,0.86); border-radius:6px">{l["text"]}</p>' for l in labels)
col = {'ricardone': '#A63A17', 'san_lorenzo': '#0F6FA8'}
ttl = ''.join(f'<p style="position:absolute; left:{t["left"]}px; top:{t["top"]}px; margin:0; font:600 24px/32px \'IBM Plex Sans\', Arial; letter-spacing:2px; color:{INK}">{t["text"]}</p>' for t in titles)
html = ('<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">'
        f'<body style="margin:0; background:{PAPER}"><div style="position:relative; width:1920px; height:1080px; overflow:hidden">{svg_el}{lbl}{ttl}</div></body>')
open(os.path.join(HERE, 'sur_preview.html'), 'w', encoding='utf-8').write(html)
print('svg', len(svg_el.encode()), 'bytes |', svg_el.count('<path'), 'paths |', len(edges), 'conexiones |',
      sum(e['n'] for e in edges), 'hilos | sin cámara', sum(1 for n in N.values() if not n['hasCamera']), '| circuitos', len(CIRC))
print('radios', {N[k]['label'] + ('' if N[k]['plant'] == 'ricardone' else '*'): N[k]['r'] for k in N if N[k]['r'] > 12})
for i in issues:
    print(i)
