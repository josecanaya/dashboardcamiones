# Tramos de las cargas de aceite a granel en la Terminal (circuito SL1): planilla (ingreso/salida) + cámaras por patente.
# Uso: python scripts/estado-planta/liquidos-tramos-terminal.py <salida.json>   (semana fija 05–11/10 en WEEK)
import json, os, datetime as dt, collections, statistics as st, sys, re
ROOT = r'C:\Users\Usuario\Desktop\Dashboard_camiones'
SKEW = dt.timedelta(minutes=206); WEEK = [f'2026-10-{d:02d}' for d in range(5, 12)]
ev = collections.defaultdict(list); devs = collections.Counter()
for d in [f'2026-10-{x:02d}' for x in range(4, 13)]:
    for r in json.load(open(os.path.join(ROOT, 'data', 'truckflow', d, 'event-list.json'), encoding='utf-8'))['records']:
        if r.get('truckPlate') and r.get('occurredAt'):
            t = dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + SKEW
            ev[r['truckPlate'].upper()].append((t, r['deviceCode'])); 
            if r['deviceCode'].startswith(('SLZ', 'Ren')): devs[r['deviceCode']] += 1
T = json.load(open(os.path.join(ROOT, 'runs/windows/2026-10-05_2026-10-11/tables/excel_operations_with_truckflow.json'), encoding='utf-8'))['rows']
P = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
seen = set(); ops = []
for r in T:
    pn = r.get('product_normalized') or ''
    if r.get('planta_normalized') != 'TERMINAL_EMBARQUE' or r.get('movement_type') != 'EGRESO' or not pn.startswith('ACEITE') or 'ENVASADO' in pn or re.match(r'^(X+|P+|T+)$', r.get('plate_normalized') or ''): continue
    ia = P(r.get('external_ingreso_at'))
    if not ia or (ia + dt.timedelta(hours=2)).date().isoformat() not in WEEK: continue   # día operativo del ingreso (desde las 22 h)
    if r['external_operation_id'] in seen: continue
    seen.add(r['external_operation_id']); ops.append(r)
P = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
ROLES = [('ing', r'^SLZIngCamFrente$'), ('bal', r'^SLZBalIngFte$'), ('carga', r'^RenCargFte$'), ('bals', r'^SLZBalS[C0-9]*\w*Fte$'), ('sal', r'^SLZSalidaC\dFte$')]
tr = collections.defaultdict(list); tot = []; prods = collections.Counter()
for r in ops:
    a, b = P(r.get('external_ingreso_at')), P(r.get('external_salida_at'))
    if not a or not b: continue
    tot.append((b - a).total_seconds() / 60); prods[r.get('product_normalized')] += 1
    es = sorted(e for e in ev[(r.get('plate_normalized') or '').upper()] if a - dt.timedelta(minutes=45) <= e[0] <= b + dt.timedelta(minutes=45))
    first = {}
    for role, rx in ROLES:
        hit = [t for t, d in es if re.match(rx, d)]
        if hit: first[role] = hit[0] if role not in ('bals', 'sal') else hit[-1]
    seq = [k for k, _ in ROLES]
    for i in range(len(seq) - 1):
        x, y = seq[i], seq[i + 1]
        if x in first and y in first and first[y] >= first[x]:
            m = (first[y] - first[x]).total_seconds() / 60
            if m <= 600: tr[f'{x}>{y}'].append(m)
out = {'circuito': 'Cargas de aceite a granel en la Terminal (Excel TERMINAL_EMBARQUE · EGRESO · ACEITE*, sin envasados ni patentes ficticias); circuito SL1', 'operaciones': len(ops), 'conTiempo': len(tot),
       'p2pMedia': round(st.mean(tot)), 'p2pMediana': round(st.median(tot)), 'productos': dict(prods),
       'tramos': {k: {'media': round(st.mean(v)), 'mediana': round(st.median(v)), 'n': len(v)} for k, v in tr.items()}}
print({k: v for k, v in devs.items() if v > 20})
print(json.dumps(out, ensure_ascii=False, indent=1))
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
