"""Asigna calle (volcable del puerto) a cada descarga de soja del SGC 23-28/10.
1) lectura exacta de patente/acoplado en SLZVolcableC1-C5 (eventos) entre ingreso y salida
2) lectura parecida (eventos + alertas LPR), distancia de edicion <=2 o fragmento >=4, en la ventana, cada lectura una vez
Uso: python -I calles.py <salida.json>"""
import json, re, sys, collections, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
DAYS = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']
reads = []   # (t, calle, texto, fuente, id)
for d in range(22, 31):
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/event-list.json', encoding='utf-8'))['records']:
        m = re.match(r'^SLZVolcableC([1-5])$', r.get('deviceCode') or '')
        if m: reads.append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), 'V' + m.group(1), r['truckPlate'] or '', 'evento', 'e%s' % r['id']))
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/alert-list.json', encoding='utf-8'))['records']:
        m = re.match(r'^SLZVolcableC([1-5])$', r.get('deviceCode') or '')
        if not m: continue
        p = json.loads(r['payload'] or '{}'); u = (p.get('externalEventBody') or {}).get('UTC')
        txt = p.get('normalizedPlate') or p.get('plate') or ''
        if u and txt: reads.append((dt.datetime.utcfromtimestamp(u), 'V' + m.group(1), txt, 'alerta', 'a%s' % r['id']))
DSSF = 'C:/Users/Usuario/AppData/Local/Temp/claude/C--Users-Usuario-Desktop-Dashboard-camiones/68d834ea-f6f9-4760-9398-a07fc072dbb7/scratchpad/dss-volcables.json'
for dev, caps in json.load(open(DSSF, encoding='utf-8'))['capturas'].items():
    c = 'V' + dev[-1]
    for k, x in enumerate(caps):
        t = dt.datetime.fromisoformat(x['at'].replace('Z', '+00:00')).replace(tzinfo=None) - dt.timedelta(hours=3)
        reads.append((t, c, (x['plate'] or '').upper(), 'dss', 'd%s%d' % (dev, k)))
def lev(a, b):
    if abs(len(a) - len(b)) > 3: return 9
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1): c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (ca != cb)))
        p = c
    return p[-1]
def sim(txt, plates):
    best = 9
    for p in plates:
        if not p: continue
        d = lev(txt, p)
        if len(txt) >= 4 and txt in p: d = min(d, 1)
        best = min(best, d)
    return best
rows = {}
for d in range(22, 31):
    for r in json.load(open(B + f'movimientos/2026-10-{d:02d}/movimientos.json', encoding='utf-8')):
        if r['planta_normalized'] == 'TERMINAL_EMBARQUE' and r['movement_type'] == 'INGRESO' and str(r['platform_normalized']).startswith('VOLCABLE_PTO'):
            rows[r['external_operation_id']] = r
trips = []
for r in rows.values():
    i = dt.datetime.fromisoformat(r['external_ingreso_at']); od = (i + dt.timedelta(hours=2)).date().isoformat()
    if od not in DAYS: continue
    s = dt.datetime.fromisoformat(r['external_salida_at']) if r['external_salida_at'] else i + dt.timedelta(hours=12)
    trips.append({'id': r['external_operation_id'], 'dia': od, 'i': i, 's': s, 'plates': [r['plate_normalized'], r.get('patente_acoplado') or '']})
used = set()
for t in trips:   # 1) exacta, la camara mas leida
    c = collections.Counter(x[1] for x in reads if x[2] in t['plates'] and t['i'] <= x[0] <= t['s'] + dt.timedelta(minutes=30))
    if c:
        t['calle'], t['metodo'] = c.most_common(1)[0][0], 'exacta'
        for x in reads:
            if x[2] in t['plates'] and t['i'] <= x[0] <= t['s'] + dt.timedelta(minutes=30): used.add(x[4])
cand = []   # 2) parecida
for t in trips:
    if t.get('calle'): continue
    for x in reads:
        if x[4] in used or not (t['i'] <= x[0] <= t['s'] + dt.timedelta(minutes=30)): continue
        dd = sim(x[2], t['plates'])
        if dd <= 2: cand.append((dd, abs((t['s'] - x[0]).total_seconds()), t['id'], x))
cand.sort(key=lambda c: (c[0], c[1]))
byid = {t['id']: t for t in trips}
for dd, _, tid, x in cand:
    t = byid[tid]
    if t.get('calle') or x[4] in used: continue
    t['calle'], t['metodo'], t['lectura'] = x[1], f'parecida d={dd} ({x[3]})', f'{x[2]} {x[0]:%d/%m %H:%M}'
    used.add(x[4])
tab = collections.defaultdict(collections.Counter); met = collections.Counter()
for t in trips:
    tab[t.get('calle', 'SIN')][t['dia']] += 1; met[t.get('metodo', 'sin').split(' (')[0]] += 1
print('viajes', len(trips), dict(met))
for k in sorted(tab): print(k, sum(tab[k].values()), [tab[k][d] for d in DAYS])
# lecturas de volcable sin usar en la ventana de algun viaje sin calle (para la revision con fotos)
sin = [t for t in trips if not t.get('calle')]
libres = [x for x in reads if x[4] not in used]
print('lecturas de volcable sin asignar', len(libres), collections.Counter(x[3] for x in libres))
json.dump({'trips': [{**t, 'i': t['i'].isoformat(), 's': t['s'].isoformat()} for t in trips]}, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 3) por horario: la volcable que estaba descargando cuando el camion debia pasar (validado contra los identificados)
import statistics as st
ide = [t for t in trips if t.get('calle')]
lag = []
for t in ide:
    xs = [x for x in reads if x[1] == t['calle'] and (x[2] in t['plates'] or sim(x[2], t['plates']) <= 2) and t['i'] <= x[0] <= t['s'] + dt.timedelta(minutes=30)]
    if xs: lag.append((t['s'] - min(x[0] for x in xs)).total_seconds() / 60)
lag.sort(); lo, hi = lag[int(.1 * len(lag))], lag[int(.9 * len(lag))]
print('salida - lectura de volcable (min): mediana', round(st.median(lag)), 'p10', round(lo), 'p90', round(hi))
uniq = {}
for x in reads:   # una lectura por camara y momento (feed y DSS duplican)
    k = (x[1], x[0].replace(second=0, microsecond=0))
    uniq.setdefault(k, x)
U = list(uniq.values())
def vota(t, excluir=()):
    a, b = t['s'] - dt.timedelta(minutes=hi), t['s'] - dt.timedelta(minutes=lo)
    c = collections.Counter(x[1] for x in U if a <= x[0] <= b and x[4] not in excluir)
    n = sum(c.values())
    if not n: return None, 0, 0
    k, v = c.most_common(1)[0]
    return k, v / n, n
UMBRAL = 0.8
ok = tot = 0
for t in ide:
    mine = {x[4] for x in reads if x[1] == t['calle'] and (x[2] in t['plates'] or sim(x[2], t['plates']) <= 2) and t['i'] <= x[0] <= t['s'] + dt.timedelta(minutes=30)}
    k, share, n = vota(t, mine)
    if k and share >= UMBRAL: tot += 1; ok += (k == t['calle'])
print(f'validacion por horario (umbral {UMBRAL}): {ok}/{tot} aciertos sobre identificados ({ok / tot * 100:.0f} %), cubre {tot}/{len(ide)}')
asig = 0
for t in trips:
    if t.get('calle'): continue
    k, share, n = vota(t)
    if k and share >= UMBRAL: t['calle'], t['metodo'] = k, f'horario {share:.0%} de {n}'; asig += 1
print('asignados por horario', asig)
tab = collections.defaultdict(collections.Counter); met = collections.Counter()
for t in trips:
    tab[t.get('calle', 'SIN')][t['dia']] += 1; met[t.get('metodo', 'sin').split(' ')[0]] += 1
print(dict(met))
for k in sorted(tab): print(k, sum(tab[k].values()), [tab[k][d] for d in DAYS])
json.dump({'validacion': {'aciertos': ok, 'casos': tot, 'umbral': UMBRAL, 'ventanaMin': [lo, hi]}, 'trips': [{**t, 'i': str(t['i']), 's': str(t['s'])} for t in trips]}, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
