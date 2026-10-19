# Comité de Seguridad · reglas que no cubre comite-seguridad-deteccion.ts:
#   - Doble ciclo: calada en Ricardone → visita al puerto SIN volcable → vuelve a entrar por el PRE-INGRESO, cala otra vez → descarga
#     en el puerto. Con un solo movimiento de soja en el Excel para las dos vueltas = «doble ciclo, un solo contrato».
#   - Primer ingreso por el puerto: el ciclo arranca en San Lorenzo (ingreso/balanza/salida, sin volcable) sin calada previa en
#     Ricardone, después cala en Ricardone y vuelve a descargar al puerto.
# Uso: python scripts/estado-planta/seguridad-doble-ciclo.py <desde> <hasta> <carpeta comité seguridad>
# Hora operativa = occurredAt + 206 min. Aplica las correcciones de En vivo guardadas en <carpeta>/correcciones-en-vivo.json.
import json, os, re, sys, datetime as dt, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
d0, d1, OUT = sys.argv[1:4]
D0, D1 = dt.date.fromisoformat(d0), dt.date.fromisoformat(d1)
SKEW = dt.timedelta(minutes=206)
days = [(D0 + dt.timedelta(n)).isoformat() for n in range(-1, (D1 - D0).days + 3)]
corr = json.load(open(os.path.join(OUT, 'correcciones-en-vivo.json'), encoding='utf-8')) if os.path.exists(os.path.join(OUT, 'correcciones-en-vivo.json')) else []
corr = corr if isinstance(corr, list) else (corr.get('corrections') or corr.get('items') or [])
ren = {c.get('journeyUid') or c.get('key'): c['plate'] for c in corr if c.get('kind') == 'rename' and c.get('plate')}
drop = {c.get('key') for c in corr if c.get('kind') == 'drop'}
ev = collections.defaultdict(list)
for d in days:
    f = os.path.join(ROOT, 'data', 'truckflow', d, 'event-list.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8'))['records']:
        if not r.get('occurredAt') or r.get('journeyUid') in drop: continue
        p = ren.get(r.get('journeyUid')) or (r.get('truckPlate') or '')
        p = re.sub(r'[^A-Z0-9]', '', p.upper())
        if not re.match(r'^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$', p) or re.match(r'^(X+|P+|T+)', p): continue
        t = dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + SKEW
        ev[p].append((t, r['deviceCode']))
site = lambda dev: 'ric' if dev.startswith('Ric') else ('sl' if dev.startswith(('SLZ', 'Ren')) else '?')
LBL = {'RicIngCamFrente': 'Ingreso', 'RicPreIngInFr': 'Pre-ingreso', 'RicEgrCamFrente': 'Egreso', 'RicB2Egreso': 'Balanza egreso', 'SLZIngCamFrente': 'Ingreso', 'SLZBalIngFte': 'Balanza',
       'SLZSalidaC1Fte': 'Egreso', 'SLZSalidaC2Fte': 'Egreso', 'SLZCalado': 'Calada', 'SLZBalSC1Fte': 'Balanza salida', 'SLZBalSC2Fte': 'Balanza salida'}
def lbl(dev):
    if re.match(r'RicCal0\d', dev): return 'Calada'
    m = re.match(r'SLZVolcableC(\d)', dev)
    return f'Volcable {m.group(1)}' if m else LBL.get(dev, dev)
def visits(es):
    """Agrupa lecturas en visitas por planta (corta cuando cambia de planta o pasan más de 3 h)."""
    vs = []
    for t, d in es:
        s = site(d)
        if s == '?': continue
        if vs and vs[-1]['site'] == s and (t - vs[-1]['fin']) <= dt.timedelta(hours=3): vs[-1]['ev'].append((t, d)); vs[-1]['fin'] = t
        else: vs.append({'site': s, 'ini': t, 'fin': t, 'ev': [(t, d)]})
    for v in vs:
        ds = [d for _, d in v['ev']]
        v['calada'] = any(re.match(r'RicCal0[1-6]$', d) for d in ds); v['pre'] = 'RicPreIngInFr' in ds
        v['volc'] = next((d for d in ds if d.startswith('SLZVolcableC')), None); v['slcal'] = 'SLZCalado' in ds
    return vs
# Excel: operaciones de soja/grano en la Terminal por patente
mov = collections.defaultdict(dict)
for d in days + [(D1 + dt.timedelta(n)).isoformat() for n in (2, 3)]:
    f = os.path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
    if not os.path.exists(f): continue
    j = json.load(open(f, encoding='utf-8')); rows = j if isinstance(j, list) else (j.get('rows') or [])
    for r in rows: mov[(r.get('plate_normalized') or '').upper()][r['external_operation_id']] = r
P = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
def ops_en(p, a, b):
    return [r for r in mov.get(p, {}).values() if r.get('planta_normalized') == 'TERMINAL_EMBARQUE' and r.get('movement_type') == 'INGRESO'
            and P(r.get('external_ingreso_at')) and a - dt.timedelta(hours=1) <= P(r['external_ingreso_at']) <= b + dt.timedelta(hours=1)]
inweek = lambda t: D0 <= (t + dt.timedelta(hours=2)).date() <= D1
doble, primero = [], []
for p, es in ev.items():
    es.sort(); vs = visits(es)
    for i in range(len(vs) - 3):
        a, b, c, e = vs[i:i + 4]
        # doble ciclo: Ric con calada → SL sin volcable → Ric con pre-ingreso y calada → SL con volcable, todo en 24 h
        if (a['site'], b['site'], c['site'], e['site']) == ('ric', 'sl', 'ric', 'sl') and a['calada'] and not b['volc'] and c['pre'] and c['calada'] and e['volc'] \
                and e['fin'] - a['ini'] <= dt.timedelta(hours=24) and inweek(a['ini']):
            ops = ops_en(p, b['ini'], e['fin'])
            doble.append({'patente': p, 'dia': (a['ini'] + dt.timedelta(hours=2)).strftime('%d/%m'), 'opsExcel': len(ops), 'producto': sorted({r['product_normalized'] for r in ops}),
                          'excel': [f'{r["product_normalized"].lower()} · ingreso {r["external_ingreso_at"][11:16]} · salida {(r.get("external_salida_at") or "")[11:16]} · {r.get("platform_normalized")}' for r in ops],
                          'minPuerto1': round((b['fin'] - b['ini']).total_seconds() / 60), 'hastaDescargar': round((e['fin'] - a['ini']).total_seconds() / 60),
                          'grupos': [{'planta': v['site'], 'items': [{'hora': t.strftime('%H:%M'), 'punto': lbl(d), 'dev': d} for t, d in v['ev']]} for v in (a, b, c, e)]})
    for i in range(len(vs) - 2):
        a, b, c = vs[i:i + 3]
        prev_cal = any(v['site'] == 'ric' and v['calada'] and a['ini'] - v['fin'] <= dt.timedelta(hours=12) for v in vs[:i])
        # primer ingreso por el puerto: SL sin volcable (sin calada previa en Ric en 12 h) → Ric con calada → SL con volcable, en 24 h
        if (a['site'], b['site'], c['site']) == ('sl', 'ric', 'sl') and not a['volc'] and not prev_cal and b['calada'] and c['volc'] \
                and c['fin'] - a['ini'] <= dt.timedelta(hours=24) and inweek(a['ini']) and any(d in ('SLZIngCamFrente', 'SLZBalIngFte') for _, d in a['ev']):
            ops = ops_en(p, a['ini'], c['fin'])
            primero.append({'patente': p, 'dia': (a['ini'] + dt.timedelta(hours=2)).strftime('%d/%m'), 'opsExcel': len(ops), 'producto': sorted({r['product_normalized'] for r in ops}),
                            'excel': [f'{r["product_normalized"].lower()} · ingreso {r["external_ingreso_at"][11:16]} · salida {(r.get("external_salida_at") or "")[11:16]} · {r.get("platform_normalized")}' for r in ops],
                            'minPuerto1': round((a['fin'] - a['ini']).total_seconds() / 60), 'hastaDescargar': round((c['fin'] - a['ini']).total_seconds() / 60),
                            'grupos': [{'planta': v['site'], 'items': [{'hora': t.strftime('%H:%M'), 'punto': lbl(d), 'dev': d} for t, d in v['ev']]} for v in (a, b, c)]})
res = {'criterio': 'ver cabecera de scripts/estado-planta/seguridad-doble-ciclo.py', 'dobleCiclo': doble, 'primerIngresoPuerto': primero}
json.dump(res, open(os.path.join(OUT, 'doble-ciclo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in ('dobleCiclo', 'primerIngresoPuerto'):
    print(f'== {k}: {len(res[k])}')
    for x in res[k]:
        print(f'  {x["patente"]} {x["dia"]} excel={x["opsExcel"]} {x["producto"]} puerto1={x["minPuerto1"]} min · hasta descargar {x["hastaDescargar"]} min')
        print('     ' + ' | '.join(f'{g["planta"].upper()}: ' + ', '.join(f'{it["hora"]} {it["punto"]}' for it in g['items']) for g in x['grupos']))
        for e_ in x['excel']: print('     EXCEL', e_)
