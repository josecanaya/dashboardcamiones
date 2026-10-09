"""Reparación offline de recorridos (no en vivo).

Entre dos lecturas buenas de la misma patente, el circuito más probable (modelo de nodos ×
peso histórico desde junio) define qué nodos tuvo que pasar el camión:
  - lectura dudosa en un nodo de ese camino, con caracteres y atributos compatibles → se asigna
  - nodo del camino sin lectura asignable → "pasó, no leído (deducido por circuito)"
  - una captura reclamada por dos viajes → gana el de mayor puntaje si la ventaja es clara; si no, pendiente
Pesos: atributos (marca, color, tipo) + modelo de nodos + error de caracteres. El tiempo solo acota
la búsqueda al intervalo entre las dos lecturas buenas. No modifica fuentes.

Uso: python reparar_recorridos.py [--xlsx inputs/VehicleCapture....xlsx]
"""
import argparse, bisect, json, math, random
from collections import Counter, defaultdict
from pathlib import Path
import pandas as pd

P = Path(__file__).parent
R = P.parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--xlsx', default=str(P / 'inputs/VehicleCaptureRecord202610021644394118890.xlsx'))
args = ap.parse_args()

# ---------- modelo de nodos + pesos históricos ----------
mod = json.loads((R / 'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json').read_text(encoding='utf-8-sig'))
prior = json.loads((P / 'prior_circuitos_historico.json').read_text(encoding='utf-8'))['prior']
EPS = 0.002
circ = {c['id']: c['seq'] for c in mod['circuits']}
w = {k: prior.get(k, 0) + EPS for k in circ}
s = sum(w.values()); w = {k: v / s for k, v in w.items()}
has_cam = {n['id']: n['hasCamera'] for n in mod['nodes']}
UMBRAL_CIRCUITO = 0.80

def subseq_pos(seq, h):
    """posiciones de h como subsecuencia ordenada de seq (primera coincidencia voraz) o None"""
    pos, i = [], 0
    for j, x in enumerate(seq):
        if i < len(h) and x == h[i]:
            pos.append(j); i += 1
    return pos if i == len(h) else None

def circuito_probable(h):
    pc = {k: w[k] for k, seq in circ.items() if subseq_pos(seq, h) is not None}
    t = sum(pc.values())
    if not t: return None, 0.0
    k = max(pc, key=pc.get)
    return k, pc[k] / t

# ---------- capturas ----------
m = json.loads((P / 'mapping.json').read_text(encoding='utf-8-sig'))['devices']
d = pd.read_excel(args.xlsx).fillna('')
d['excel_row'] = range(2, len(d) + 2)
d['t'] = pd.to_datetime(d['Capture Time'])
d['p'] = d['Plate No.'].astype(str).str.upper().str.replace(r'[^A-Z0-9]', '', regex=True)
d['conf'] = pd.to_numeric(d['Confidence Level'], errors='coerce').fillna(0)
d['node'] = d['Device Name'].map(lambda x: m.get(x, {}).get('node_id'))
d['rear'] = d['Device Name'].map(lambda x: m.get(x, {}).get('rear', False))
d = d[d.node.notna() & ~d.rear].sort_values('t').reset_index(drop=True)
FMT = r'[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2}'
d['anchor'] = d.p.str.fullmatch(FMT) & (d.conf >= 80)
BAD = {'', 'Unknown', 'Unrecognized'}
TRUCK = {'Large Truck', 'Medium Truck', 'Small Truck'}
d['tipo'] = d['Vehicle Category'].map(lambda c: '' if c in BAD else ('CAMION' if c in TRUCK else 'OTRO'))
d['color'] = d['Vehicle Color'].map(lambda c: '' if c in BAD else c)
d['marca'] = d['Vehicle Brand'].map(lambda c: '' if c in BAD else c)
rows = d.to_dict('records')
ts = [r['t'].timestamp() for r in rows]
by_node = defaultdict(list)
for i, r in enumerate(rows): by_node[r['node']].append(i)
node_ts = {k: [ts[i] for i in v] for k, v in by_node.items()}

# ---------- error de caracteres ----------
CONF = {frozenset(x) for x in ['0O', '0D', '0Q', '8B', '1I', '1L', '5S', '2Z', '6G', '4A', 'MN', 'UV', 'VY', 'HM', 'EF', 'CG']}
def costo(a, b):
    """Levenshtein ponderado: confusión OCR 0.3, otra sustitución 1, borrado/inserción 0.6"""
    n, k = len(a), len(b)
    D = [[0.0] * (k + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): D[i][0] = i * 0.6
    for j in range(1, k + 1): D[0][j] = j * 0.6
    for i in range(1, n + 1):
        for j in range(1, k + 1):
            sub = 0 if a[i-1] == b[j-1] else (0.3 if frozenset((a[i-1], b[j-1])) in CONF else 1)
            D[i][j] = min(D[i-1][j-1] + sub, D[i-1][j] + 0.6, D[i][j-1] + 0.6)
    return D[n][k]
def sim_patente(leida, real):
    if len(leida) < 4: return 0.0
    if len(leida) >= 4 and leida in real: return max(0.0, 1 - 0.6 * (len(real) - len(leida)) / len(real)) * 0.95 + 0.05 * (len(leida) >= 4)
    return max(0.0, 1 - costo(leida, real) / len(real))

# ---------- atributos (LR medidos entre cámaras, atributos_entre_camaras.py) ----------
LR_COLOR = {'White': 1.21, 'Black': 2.22, 'Blue': 3.04, 'Silver': 2.78, 'Red': 10.8, 'Gray': 2.51}
def log_attr(c, perfil):
    s = 0.0
    if c['marca'] and perfil.get('marca'):
        s += math.log(4.75) if c['marca'] == perfil['marca'] else math.log(0.197)
    if c['color'] and perfil.get('color'):
        s += math.log(LR_COLOR.get(c['color'], 3.0)) if c['color'] == perfil['color'] else math.log(0.728)
    if c['tipo'] and perfil.get('tipo'):
        s += math.log(1.09) if c['tipo'] == perfil['tipo'] else (math.log(0.05) if 'OTRO' in (c['tipo'], perfil['tipo']) else math.log(0.759))
    return s
def perfil_de(idxs):
    p = {}
    for f in ['marca', 'color', 'tipo']:
        v = Counter(rows[i][f] for i in idxs if rows[i][f])
        if v: p[f] = v.most_common(1)[0][0]
    return p

# ---------- viajes de anclas ----------
# Corte por vuelta: el viaje sigue mientras algún circuito del modelo explique los nodos vistos.
# Si el nodo nuevo ya no encaja en ningún circuito (p. ej. el transile vuelve a Calada), arranca otra vuelta.
CORTE = 6 * 3600
def encaja(h):
    return any(subseq_pos(seq, h) is not None for seq in circ.values())
viajes = []
for plate, g in d[d.anchor].groupby('p'):
    cur, h = [], []
    for i in g.index:
        n_ = rows[i]['node']
        h2 = h if h and h[-1] == n_ else h + [n_]
        if cur and (ts[i] - ts[cur[-1]] > CORTE or (len(h2) > 1 and not encaja(h2) and encaja(h))):
            viajes.append((plate, cur)); cur, h2 = [], [n_]
        cur.append(i); h = h2
    viajes.append((plate, cur))

def puntaje(c, plate, perfil):
    sp = sim_patente(c['p'], plate)
    return sp, 4.0 * sp + log_attr(c, perfil)

claims = defaultdict(list)   # captura → [(score, viaje_id, sp)]
info = []
for vid, (plate, idxs) in enumerate(viajes):
    vis = []
    for i in idxs:
        if not vis or vis[-1][0] != rows[i]['node']: vis.append((rows[i]['node'], i))
    h = [n for n, _ in vis]
    k, pk = circuito_probable(h) if len(h) >= 2 else (None, 0.0)
    v = dict(vid=vid, plate=plate, visibles=h, circuito=k, p_circuito=round(pk, 3), huecos=[], idx_vis=[i for _, i in vis])
    info.append(v)
    if not k or pk < UMBRAL_CIRCUITO: continue
    seq = circ[k]; pos = subseq_pos(seq, h); perfil = perfil_de(idxs)
    for (a, ia), (b, ib), pa, pb in zip(vis, vis[1:], pos, pos[1:]):
        for nodo in seq[pa + 1:pb]:
            if not has_cam.get(nodo):
                v['huecos'].append(dict(nodo=nodo, estado='SIN_CAMARA')); continue
            lo = bisect.bisect_right(node_ts.get(nodo, []), ts[ia]); hi = bisect.bisect_left(node_ts.get(nodo, []), ts[ib])
            cands = []
            for c_i in by_node.get(nodo, [])[lo:hi]:
                c = rows[c_i]
                if c['anchor'] and c['p'] != plate: continue  # lectura buena de otra patente
                sp, sc = puntaje(c, plate, perfil)
                if sp >= 0.65 and log_attr(c, perfil) > -2.5: cands.append((sc, c_i, sp))
            cands.sort(reverse=True)
            hueco = dict(nodo=nodo, estado='NO_LEIDO_DEDUCIDO', candidatas=len(cands))
            if cands:
                hueco['captura'] = cands[0][1]
                for sc, c_i, sp in cands[:3]: claims[c_i].append((sc, vid, nodo, sp))
            v['huecos'].append(hueco)

# ---------- una captura, un dueño ----------
dueno = {}
for c_i, lst in claims.items():
    lst.sort(reverse=True)
    if len(lst) == 1 or lst[0][0] - lst[1][0] >= 1.0 or lst[0][1] == lst[1][1]:
        dueno[c_i] = lst[0][1]
for v in info:
    for hh in v['huecos']:
        if hh['estado'] != 'NO_LEIDO_DEDUCIDO' or 'captura' not in hh: continue
        c_i = hh.pop('captura')
        if dueno.get(c_i) == v['vid']:
            hh.update(estado='ASIGNADA', excel_row=rows[c_i]['excel_row'], leida=rows[c_i]['p'], conf=rows[c_i]['conf'],
                      hora=str(rows[c_i]['t']), camara=rows[c_i]['Device Name'])
        else:
            hh['estado'] = 'PENDIENTE_CONFLICTO' if c_i in claims and len(claims[c_i]) > 1 else 'NO_LEIDO_DEDUCIDO'

# ---------- exclusión: vehículos que no son camión y no figuran en el Excel (servicios / particulares) ----------
_mov = []
for w_ in ['2026-09-21_2026-09-27', '2026-09-28_2026-10-04']:
    _mov += json.loads((R / 'runs/windows' / w_ / 'tables/external_movimientos_contrato_normalized.json').read_text(encoding='utf-8-sig'))['rows']
EN_EXCEL = {r_['plate_normalized'] for r_ in _mov if r_.get('plate_normalized')}
for v in info:
    cat = Counter(rows[i]['Vehicle Category'] for i in v['idx_vis'] if rows[i]['Vehicle Category'] not in BAD)
    v['categoria'] = cat.most_common(1)[0][0] if cat else ''
    v['excluido'] = v['plate'] not in EN_EXCEL and v['categoria'] not in TRUCK
    v['en_excel'] = v['plate'] in EN_EXCEL

# ---------- métricas ----------
con = [v for v in info if v['circuito'] and v['p_circuito'] >= UMBRAL_CIRCUITO]
def cerrado(v, modo):
    for hh in v['huecos']:
        if hh['estado'] == 'SIN_CAMARA': continue
        if modo == 'antes': return False
        if modo == 'asignadas' and hh['estado'] != 'ASIGNADA': return False
        if modo == 'deducido' and hh['estado'] == 'PENDIENTE_CONFLICTO': return False
    return True
est = Counter(hh['estado'] for v in con for hh in v['huecos'])
res = dict(
    excluidos_servicio_particular=sum(v['excluido'] for v in info), camiones_fuera_excel=sum((not v['en_excel']) and v['categoria'] in TRUCK for v in info),
    capturas_frontales=len(rows), lecturas_buenas=int(d.anchor.sum()),
    viajes=len(info), viajes_2_o_mas_nodos=sum(len(v['visibles']) >= 2 and not v['excluido'] for v in info),
    viajes_con_circuito=len(con), circuitos=dict(Counter(v['circuito'] for v in con).most_common()),
    nodos_con_camara_faltantes=sum(est[k] for k in est if k != 'SIN_CAMARA'), estados_huecos=dict(est),
    cerrados_antes=sum(cerrado(v, 'antes') for v in con),
    cerrados_con_asignadas=sum(cerrado(v, 'asignadas') for v in con),
    cerrados_con_deducidos=sum(cerrado(v, 'deducido') for v in con))

# ---------- prueba ciega: ocultar una lectura buena intermedia y corromperla ----------
random.seed(7)
ALF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
def corromper(p):
    r = random.random(); p = list(p)
    if r < 0.4:  # perder 1-2 caracteres de un extremo
        return ''.join(p[random.randint(1, 2):] if random.random() < .5 else p[:-random.randint(1, 2)])
    for _ in range(random.randint(1, 2)):
        j = random.randrange(len(p)); p[j] = random.choice(ALF)
    return ''.join(p)
ok = mal = sin = 0
for v in con:
    plate = v['plate']; vis = v['idx_vis']
    if len(vis) < 3: continue
    for j in range(1, len(vis) - 1):
        oculto = vis[j]; c = dict(rows[oculto]); c['p'] = corromper(plate)
        perfil = perfil_de([i for i in vis if i != oculto])
        a, b = vis[j - 1], vis[j + 1]
        # todas las candidatas: viajes activos en ese intervalo cuyo circuito pasa por ese nodo
        best = []
        for u in con:
            ui = u['idx_vis']
            if ts[ui[0]] > ts[oculto] or ts[ui[-1]] < ts[oculto]: continue
            if c['node'] not in circ[u['circuito']]: continue
            sp, sc = puntaje(c, u['plate'], perfil_de(ui) if u is not v else perfil)
            if sp >= 0.65: best.append((sc, u['plate']))
        best.sort(reverse=True)
        if not best: sin += 1
        elif len(best) > 1 and best[0][0] - best[1][0] < 1.0: sin += 1
        elif best[0][1] == plate: ok += 1
        else: mal += 1
res['prueba_ciega'] = dict(casos=ok + mal + sin, correctas=ok, incorrectas=mal, pendientes=sin,
                           precision_sobre_decididas=round(ok / max(1, ok + mal), 4),
                           recuperacion=round(ok / max(1, ok + mal + sin), 4))

# ---------- salidas ----------
out = []
for v in con:
    for hh in v['huecos']:
        out.append(dict(patente=v['plate'], circuito=v['circuito'], p_circuito=v['p_circuito'],
                        nodos_vistos=' > '.join(x.split(':')[1] for x in v['visibles']), **hh))
pd.DataFrame(out).to_csv(P / 'reparacion_recorridos_detalle.csv', index=False, encoding='utf-8-sig')
(P / 'reparacion_recorridos_resumen.json').write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding='utf-8')
print(json.dumps(res, indent=1, ensure_ascii=False))
# diagnóstico de viajes sin circuito asignable
dx = Counter('ningun_circuito_encaja' if not v['circuito'] else 'circuito_ambiguo' for v in info if len(v['visibles']) >= 2 and not (v['circuito'] and v['p_circuito'] >= UMBRAL_CIRCUITO))
print(dict(dx))
nc = Counter(' > '.join(x.split(':')[1] for x in v['visibles']) for v in info if len(v['visibles']) >= 2 and not v['circuito'])
print(nc.most_common(8))
a = pd.DataFrame(out); a = a[a.estado == 'ASIGNADA']
print('asignadas: lectura exacta', int((a.leida == a.patente).sum()), 'corregida', int((a.leida != a.patente).sum()))
print(a[a.leida != a.patente][['patente', 'leida', 'conf', 'nodo']].head(10).to_string(index=False))

# ---------- viajes sin circuito: ¿figuran en el Excel de movimientos? ----------
mov = []
for w_ in ['2026-09-21_2026-09-27', '2026-09-28_2026-10-04']:
    f = R / 'runs/windows' / w_ / 'tables/external_movimientos_contrato_normalized.json'
    mov += json.loads(f.read_text(encoding='utf-8-sig'))['rows']
exc = defaultdict(list)
for r_ in mov:
    t_ = r_.get('external_ingreso_at') or r_.get('external_salida_at')
    if r_.get('plate_normalized') and t_: exc[r_['plate_normalized']].append((pd.Timestamp(t_).tz_localize(None) if pd.Timestamp(t_).tzinfo is None else pd.Timestamp(t_).tz_convert('America/Argentina/Buenos_Aires').tz_localize(None), r_))
fuera = []
for v in info:
    if v.get('excluido') or len(v['visibles']) < 2 or (v['circuito'] and v['p_circuito'] >= UMBRAL_CIRCUITO): continue
    ii = v['idx_vis']; t0, t1 = rows[ii[0]]['t'], rows[ii[-1]]['t']
    allidx = [i for i in range(len(rows)) if False]
    cat = Counter(rows[i]['Vehicle Category'] for i in ii if rows[i]['Vehicle Category'] not in BAD)
    hits = [r_ for t_, r_ in exc.get(v['plate'], []) if t0 - pd.Timedelta(hours=12) <= t_ <= t1 + pd.Timedelta(hours=12)]
    fuera.append(dict(patente=v['plate'], motivo='ningun_circuito_encaja' if not v['circuito'] else 'circuito_ambiguo',
        nodos=' > '.join(x.split(':')[1] for x in v['visibles']), desde=str(t0), hasta=str(t1),
        categoria=cat.most_common(1)[0][0] if cat else '', marca=perfil_de(ii).get('marca', ''),
        en_excel_semana=v['plate'] in exc, en_excel_ese_dia=bool(hits),
        planta=';'.join(sorted({h['planta_normalized'] for h in hits})), producto=';'.join(sorted({h['product_normalized'] or '' for h in hits})),
        cliente=';'.join(sorted({h['cliente_contrato'] for h in hits}))[:80], mov=';'.join(sorted({h['movement_type'] for h in hits}))))
F = pd.DataFrame(fuera); F.to_csv(P / 'viajes_sin_circuito_vs_excel.csv', index=False, encoding='utf-8-sig')
F['clase'] = F.categoria.map(lambda c: 'camion' if c in TRUCK else ('sin_dato' if not c else 'no_camion'))
print(pd.crosstab([F.motivo, F.clase], F.en_excel_ese_dia, margins=True))
x = F[F.en_excel_ese_dia]
print(x.planta.value_counts().head(8)); print(x.producto.value_counts().head(10)); print(x.nodos.value_counts().head(8))
