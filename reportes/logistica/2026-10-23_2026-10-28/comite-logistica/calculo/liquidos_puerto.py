"""Líquidos del puerto 23-28/10/2026 agrupados por lo que dice el SGC (sentido, producto, plataforma), sin los calados en Ricardone.
Cruce: SGC (planilla) x cámaras (lecturas de la patente o acoplado) x cartas de porte (ARCA).
Uso: python -I liquidos_puerto.py <salida.json>"""
import json, re, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
def grupo(r):
    p, mv = r['product_normalized'], r['movement_type']
    if mv == 'EGRESO':
        if 'GIRASOL REFINADO' in p and 'BORRA' not in p: return 'Carga · aceite de girasol refinado'
        if 'SOJA CRUDO' in p: return 'Carga · aceite de soja crudo'
        if 'GLICERIN' in p: return 'Carga · glicerina'
        return 'Carga · borras, lecitina y ácidos grasos'
    if 'ACEITE' in p: return 'Descarga · aceite para refinar'
    return 'Descarga · glicerina e insumos químicos'
PUNTOS = [('Ingreso', {'SLZIngCamFrente'}), ('Calada', {'SLZCalado'}), ('Balanza ingreso', {'SLZBalIngFte'}), ('Balanza egreso', {'SLZBalSC2Fte'}), ('Salida', {'SLZSalidaC1Fte'})]
ev = collections.defaultdict(list)
for d in range(22, 30):
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/event-list.json', encoding='utf-8'))['records']:
        ev[r['truckPlate']].append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), r['deviceCode']))
for v in ev.values(): v.sort()
cartas = json.load(open(B + 'arca/arca_consignment_notes.json', encoding='utf-8'))
cart_pl = collections.defaultdict(list)
for c in cartas:
    for p in c['transport'].get('plates') or []: cart_pl[p].append(c)
rows = {}
for d in range(22, 30):
    for r in json.load(open(B + f'movimientos/2026-10-{d:02d}/movimientos.json', encoding='utf-8')): rows[r['external_operation_id']] = r
G = collections.defaultdict(lambda: {'viajes': 0, 't': 0, 'total': [], 'tramos': collections.defaultdict(list), 'conCamaraPuerto': 0, 'conCarta': 0, 'sentidoHistorial': 0, 'plataformas': collections.Counter(), 'renovaCam': 0, 'productos': collections.Counter()})
excl = collections.Counter()
for r in rows.values():
    if r['planta_normalized'] != 'TERMINAL_EMBARQUE' or not LIQ.search(r['product_normalized']) or 'ENVASADO' in r['product_normalized'] or not r['external_salida_at']: continue
    i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    if not ('2026-10-23' <= (i + dt.timedelta(hours=2)).date().isoformat() <= '2026-10-28'): continue
    ps = [p for p in (r['plate_normalized'], r.get('patente_acoplado') or '') if p]
    rs = sorted(x for p in ps for x in ev.get(p, []) if i - dt.timedelta(minutes=60) <= x[0] <= s + dt.timedelta(minutes=20))
    devs = {x[1] for x in rs}
    if 'RicCalLiq' in devs and r['movement_type'] == 'INGRESO': excl['calados en Ricardone'] += 1; continue
    g = G[grupo(r)]
    g['viajes'] += 1; g['t'] += float(r['kgs_neto'] or 0); g['total'].append((s - i).total_seconds() / 60)
    g['plataformas'][r['platform_normalized'] or 'sin plataforma'] += 1; g['productos'][r['product_normalized']] += 1
    g['conCamaraPuerto'] += any(x[1].startswith('SLZ') for x in rs)
    g['renovaCam'] += bool(devs & {'RenCargFte', 'RenDescFte'})
    g['sentidoHistorial'] += 'SGC_MOV_FROM_HISTORY' in str(r['normalization_warnings'])
    g['conCarta'] += any(abs((dt.datetime.fromisoformat(c['issue_time']['$date'][:19]) - dt.timedelta(hours=3) - i).total_seconds()) < 2 * 86400 for p in ps for c in cart_pl.get(p, []))
    prev, marcas = None, []
    for n, dv in PUNTOS:
        t = next((x[0] for x in rs if x[1] in dv and (prev is None or x[0] >= prev)), None); marcas.append((n, t))
        if t: prev = t
    for (a, ta), (b, tb) in zip(marcas, marcas[1:]):
        if ta and tb: g['tramos'][f'{a} → {b}'].append((tb - ta).total_seconds() / 60)
out = {'excluidos': dict(excl), 'grupos': {}}
for k in sorted(G, key=lambda k: -G[k]['viajes']):
    g = G[k]
    out['grupos'][k] = {'viajes': g['viajes'], 't': round(g['t'] / 1000), 'totalMedia': st.mean(g['total']), 'totalMediana': st.median(g['total']),
                        'conCamaraPuerto': g['conCamaraPuerto'], 'conCarta': g['conCarta'], 'sentidoHistorial': g['sentidoHistorial'], 'renovaCam': g['renovaCam'],
                        'plataformas': dict(g['plataformas']), 'productos': dict(g['productos']),
                        'tramos': {t: {'media': st.mean(v), 'mediana': st.median(v), 'n': len(v)} for t, v in g['tramos'].items()}}
    print(f"== {k}: {g['viajes']} viajes, {round(g['t']/1000)} t, total {st.mean(g['total']):.0f} (med {st.median(g['total']):.0f}); cámara puerto {g['conCamaraPuerto']}, cámara Renova {g['renovaCam']}, carta {g['conCarta']}, sentido por historial {g['sentidoHistorial']}; plataformas {dict(g['plataformas'])}")
    for t, v in g['tramos'].items(): print(f"   {t:34} media {st.mean(v):5.0f} mediana {st.median(v):5.0f} n {len(v)}")
print('excluidos', dict(excl))
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
