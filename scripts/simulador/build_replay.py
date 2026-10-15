"""Arma los datos de la repetición de un día real (cámaras + Excel de movimientos).

Uso: python scripts/simulador/build_replay.py 2026-08-29 [2026-09-08 ...] --out <carpeta>

Por cada camión del día: la secuencia de nodos donde lo leyó una cámara, con la hora
operativa (occurredAt + 206 min, ver memoria occurredat-vs-createdat-offset), y del
Excel el producto y los kg. Solo entran patentes que figuran en el Excel de movimientos
de ese día o el anterior (el «sistema de camiones»): así quedan afuera autos y servicios.
"""
import json, sys, os, re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKEW = timedelta(minutes=206)
AR = timezone(timedelta(hours=-3))
MODEL = ROOT / 'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json'
# Capacidad de las playas en camiones (dato de planta 14-10-2026)
CAPACITY = {'ricardone:Playa 1': 200, 'ricardone:Playa 3': 50, 'san_lorenzo:Playa OSL': 100,
            'ricardone:Playa demorado': 30, 'ricardone:Playa de egreso': 4}
SPLIT_GAP_MIN = 12 * 60  # más de 12 h sin lecturas: es otra visita
# Puntos de descarga y calada que se miden uno por uno (cámara → nombre en pantalla)
DEVICES = [['RicCal01', 'Calada calle 1', 'calada'], ['RicCal02', 'Calada calle 2', 'calada'], ['RicCal03', 'Calada calle 3', 'calada'],
           ['RicCal04', 'Calada calle 4', 'calada'], ['RicCal05', 'Calada calle 5', 'calada'], ['RicCal06', 'Calada calle 6', 'calada'],
           ['RicCalLiq', 'Calada líquidos', 'calada'],
           ['RicVolcable1', 'Volcable 1 Ricardone', 'volc_ric'], ['RicVolcable2', 'Volcable 2 Ricardone', 'volc_ric'],
           ['RicS7DescLinea1', 'Silo Keppler línea 1', 'volc_ric'], ['RicS7DescLinea2', 'Silo Keppler línea 2', 'volc_ric'],
           ['SLZVolcableC1', 'Volcable 1 puerto', 'volc_sl'], ['SLZVolcableC2', 'Volcable 2 puerto', 'volc_sl'], ['SLZVolcableC3', 'Volcable 3 puerto', 'volc_sl'],
           ['SLZVolcableC4', 'Volcable 4 puerto', 'volc_sl'], ['SLZVolcableC5', 'Volcable 5 puerto', 'volc_sl']]
DEV_IDX = {d[0]: i for i, d in enumerate(DEVICES)}


def norm(p):
    return re.sub(r'[^A-Z0-9]', '', str(p or '').upper())


def load_events(days):
    ev = []
    for d in days:
        f = ROOT / 'data/truckflow' / d / 'event-list.json'
        if not f.exists():
            continue
        raw = json.loads(f.read_text(encoding='utf-8'))
        for e in (raw['records'] if isinstance(raw, dict) else raw):
            try:
                t = datetime.fromisoformat(e['occurredAt'].replace('Z', '+00:00')) + SKEW
            except Exception:
                continue
            ev.append((t, e.get('deviceCode') or '', norm(e.get('truckPlate'))))
    return ev


def load_excel(days):
    rows = {}
    for d in days:
        f = ROOT / 'data/movimientos' / d / 'movimientos.json'
        if not f.exists():
            continue
        for r in json.loads(f.read_text(encoding='utf-8')):
            p = norm(r.get('plate_normalized'))
            if not p or re.fullmatch(r'(X+|P+|T+)', p):
                continue
            try:
                kg = float(r.get('kgs_neto') or 0)
            except Exception:
                kg = 0
            transile = r.get('planta_normalized') == 'RICARDONE' and r.get('movement_type') == 'EGRESO' and 'VICENTIN' in str(r.get('entregado_por_a') or '').upper()
            if kg > 60000:
                kg = 0  # error de carga en el Excel (p. ej. aceite con 2.000 t)
            prev = rows.get(p)
            if not prev or kg > prev[1]:
                rows[p] = (r.get('product_normalized') or 'OTRO', kg, r.get('planta_normalized'), r.get('movement_type'), transile or (prev[4] if prev else False))
            elif transile:
                rows[p] = prev[:4] + (True,)
    return rows


def load_discharges(day):
    """Descargas del día según el Excel: filas INGRESO de Ricardone o del puerto, por patente (en orden de hora)."""
    out = {}
    f = ROOT / 'data/movimientos' / day / 'movimientos.json'
    if not f.exists():
        return out
    rows = [r for r in json.loads(f.read_text(encoding='utf-8'))
            if r.get('movement_type') == 'INGRESO' and r.get('planta_normalized') in ('RICARDONE', 'TERMINAL_EMBARQUE')]
    rows.sort(key=lambda r: r.get('external_salida_at') or r.get('external_ingreso_at') or '')
    for r in rows:
        p = norm(r.get('plate_normalized'))
        if not p or re.fullmatch(r'(X+|P+|T+)', p):
            continue
        try:
            kg = float(r.get('kgs_neto') or 0)
        except Exception:
            kg = 0
        out.setdefault(p, []).append(('R' if r['planta_normalized'] == 'RICARDONE' else 'S', 0 if kg > 60000 else kg))
    return out


def product_group(p):
    p = p or ''
    if 'PELLET' in p: return 'pellet'
    if p == 'SOJA': return 'soja'
    if 'GIRASOL' in p and 'ACEITE' not in p: return 'girasol'
    if p in ('MAIZ', 'TRIGO', 'SORGO'): return 'otros_granos'
    if 'ACEITE' in p or 'GLICERINA' in p or 'ALCOHOL' in p: return 'liquido'
    return 'otro'


def build(day):
    model = json.loads(MODEL.read_text(encoding='utf-8'))
    nodes = [n for n in model['nodes']]
    idx = {n['id']: i for i, n in enumerate(nodes)}
    dev2node = {}
    for n in nodes:
        for dv in n['devices']:
            dev2node.setdefault(dv, n['id'])
    d0 = datetime.fromisoformat(day).replace(tzinfo=AR)
    days = [(d0 + timedelta(days=k)).date().isoformat() for k in (-1, 0, 1)]
    ev = load_events(days)
    excel = load_excel([days[0], days[1]])
    desc = load_discharges(day)
    start, end = d0 - timedelta(hours=8), d0 + timedelta(hours=26)
    by = {}
    for t, dv, p in ev:
        if not (start <= t <= end) or p not in excel:
            continue
        node = dev2node.get(dv)
        if not node:
            continue
        by.setdefault(p, []).append((t, idx[node], dv))
    trucks = []
    for p, reads in by.items():
        reads.sort()
        visits, cur = [], []
        for t, n, dv in reads:
            if cur and (t - cur[-1][0]).total_seconds() / 60 > SPLIT_GAP_MIN:
                visits.append(cur); cur = []
            if cur and cur[-1][1] == n:
                continue  # misma cámara seguida: una sola pasada
            cur.append((t, n, dv))
        if cur:
            visits.append(cur)
        prod, kg, planta, mov, transile = excel[p]
        pend = list(desc.get(p, []))  # descargas del Excel de esa patente, se asignan a sus visitas
        for v in visits:
            mins = [round((t - d0).total_seconds() / 60, 1) for t, _, _ in v]
            if mins[-1] < 0 or mins[0] > 24 * 60:
                continue  # visita que no toca el día
            plants = {'S' if nodes[n]['plant'] == 'san_lorenzo' else 'R' for _, n, _ in v}
            d = next((x for x in pend if x[0] == 'S' and 'S' in plants), None) or next((x for x in pend if x[0] == 'R' and 'R' in plants), None)
            if d:
                pend.remove(d)
            trucks.append([p, product_group(prod), round(kg / 1000, 1), [[n, m, DEV_IDX.get(dv, -1)] for (_, n, dv), m in zip(v, mins)],
                           1 if transile else 0, d[0] if d else '', round(d[1] / 1000, 1) if d else 0])
    out_nodes = [{'id': n['id'], 'plant': n['plant'], 'label': n['label'], 'x': n['x'], 'y': n['y'],
                  'area': n['area'], 'cap': CAPACITY.get(n['id']), 'cam': n['hasCamera']} for n in nodes]
    edges = [{'a': idx[e['from']], 'b': idx[e['to']], 'd': e['d'], 'inter': e.get('inter', False)} for e in model['edges']]
    return {'day': day, 'W': model['W'], 'H': model['H'], 'nodes': out_nodes, 'edges': edges, 'trucks': trucks, 'devices': DEVICES}


DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


def available_days():
    a = {p.name for p in (ROOT / 'data/truckflow').iterdir() if re.fullmatch(r'\d{4}-\d{2}-\d{2}', p.name)}
    b = {p.name for p in (ROOT / 'data/movimientos').iterdir() if re.fullmatch(r'\d{4}-\d{2}-\d{2}', p.name)}
    return sorted(a & b)


if __name__ == '__main__':
    args = sys.argv[1:]
    out = Path(args[args.index('--out') + 1]) if '--out' in args else ROOT / 'outputs/simulador'
    days = available_days() if '--all' in args else [a for a in args if re.fullmatch(r'\d{4}-\d{2}-\d{2}', a)]
    (out / 'days').mkdir(parents=True, exist_ok=True)
    index = []
    model = None
    for d in days:
        data = build(d)
        model = {k: data[k] for k in ('W', 'H', 'nodes', 'edges', 'devices')}
        dt = datetime.fromisoformat(d)
        nodes = data['nodes']
        sl = any(n['plant'] == 'san_lorenzo' for t in data['trucks'] for n in [nodes[r[0]] for r in t[3]])
        info = {'day': d, 'label': f"{DIAS[dt.weekday()].capitalize()} {dt.day:02d}/{dt.month:02d}",
                'title': f"{DIAS[dt.weekday()].capitalize()} {dt.day} de {MESES[dt.month - 1]}",
                'camiones': len(data['trucks']), 'puerto': sl,
                'descargan': sum(1 for t in data['trucks'] if t[5])}
        index.append(info)
        (out / 'days' / f'{d}.json').write_text(json.dumps({**info, 'trucks': data['trucks']}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(d, info['camiones'], info['descargan'], 'puerto' if sl else 'sin puerto')
    (out / 'model.json').write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (out / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
