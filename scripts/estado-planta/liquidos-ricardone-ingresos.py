# Aceite que ENTRA a Ricardone (descargas de líquidos, p. ej. girasol oleico): camiones y toneladas por día, tiempo adentro
# según la planilla y, por cámaras, ingreso → calada de líquidos (RicCalLiq) → balanza de egreso (RicB2Egreso).
# Uso: python scripts/estado-planta/liquidos-ricardone-ingresos.py <salida.json> <desde> <hasta>
# Planilla: data/movimientos (RICARDONE · INGRESO · producto aceite), sin repetir external_operation_id; día operativo del
# ingreso (desde las 22 h). Cámaras: lecturas de la patente entre 3 h antes del ingreso y 1 h después de la salida, hora
# operativa = occurredAt + 206 min. Sin envasado ni patentes ficticias (como liquidos-criterio.cjs). Simultáneos = camiones adentro a la vez según ingreso y salida de la planilla.
import json, os, re, sys, collections, datetime as dt
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT, DESDE, HASTA = sys.argv[1:4]
SKEW = dt.timedelta(minutes=206)
iso = lambda d, n: (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()
d0, d1 = dt.date.fromisoformat(DESDE), dt.date.fromisoformat(HASTA)
DAYS = [(d0 + dt.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
ACEITE = re.compile(r'^(ACEITE|AC |ACGIRASOL)')
loc = lambda s: dt.datetime.fromisoformat(s[:19]) if s and len(s) >= 16 else None
opday = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()

seen, ops = set(), []
for i in range(-1, len(DAYS) + 3):
    f = os.path.join(ROOT, 'data', 'movimientos', iso(DESDE, i), 'movimientos.json')
    if not os.path.exists(f): continue
    j = json.load(open(f, encoding='utf-8')); rows = j if isinstance(j, list) else (j.get('rows') or [])
    for r in rows:
        if r['external_operation_id'] in seen: continue
        seen.add(r['external_operation_id'])
        if r.get('planta_normalized') != 'RICARDONE' or r.get('movement_type') != 'INGRESO' or not ACEITE.match(r.get('product_normalized') or ''): continue
        pl = (r.get('plate_normalized') or '').upper()
        if 'ENVASADO' in (r.get('product_normalized') or '') or len(pl) < 6 or len(set(pl)) == 1: continue   # mismo criterio que liquidos-criterio.cjs
        a, b = loc(r.get('external_ingreso_at')), loc(r.get('external_salida_at'))
        if not a or not b or opday(a) not in DAYS: continue
        ops.append({'patente': (r.get('plate_normalized') or '').upper(), 'producto': r['product_normalized'], 'ingreso': a, 'salida': b,
                    'kg': float(r.get('kgs_neto') or 0), 'fuente': 'sgc' if str(r.get('source_file', '')).startswith('SGC') else 'excel'})
want = {o['patente'] for o in ops}
ev = collections.defaultdict(list)
for i in range(-1, len(DAYS) + 3):
    f = os.path.join(ROOT, 'data', 'truckflow', iso(DESDE, i), 'event-list.json')
    if not os.path.exists(f): continue
    for e in json.load(open(f, encoding='utf-8-sig'))['records']:
        p = (e.get('truckPlate') or '').upper()
        if p in want and e.get('occurredAt'): ev[p].append((dt.datetime.fromisoformat(e['occurredAt']).replace(tzinfo=None) + SKEW, e.get('deviceCode')))
mins = lambda x: round(x.total_seconds() / 60)
for o in ops:
    rs = sorted(x for x in ev[o['patente']] if o['ingreso'] - dt.timedelta(hours=3) <= x[0] <= o['salida'] + dt.timedelta(hours=1))
    cal = next((t for t, d in rs if d == 'RicCalLiq'), None)
    egr = next((t for t, d in reversed(rs) if d == 'RicB2Egreso'), None)
    o['adentroMin'] = mins(o['salida'] - o['ingreso'])
    o['ingresoACaladaMin'] = mins(cal - o['ingreso']) if cal else None
    o['caladaAEgresoMin'] = mins(egr - cal) if cal and egr and egr > cal else None
med = lambda a: (sorted(a)[len(a) // 2] if a else None)
def resumen(xs):
    return {'camiones': len(xs), 'toneladas': round(sum(x['kg'] for x in xs) / 1000), 'adentroMediana': med([x['adentroMin'] for x in xs]),
            'ingresoACaladaMediana': med([x['ingresoACaladaMin'] for x in xs if x['ingresoACaladaMin'] is not None]),
            'caladaAEgresoMediana': med([x['caladaAEgresoMin'] for x in xs if x['caladaAEgresoMin'] is not None]),
            'conCamaras': sum(1 for x in xs if x['caladaAEgresoMin'] is not None)}
porDia = {d: resumen([o for o in ops if opday(o['ingreso']) == d]) for d in DAYS}
# simultáneos adentro y ritmo de salidas
marks = sorted([(o['ingreso'], 1) for o in ops] + [(o['salida'], -1) for o in ops], key=lambda x: (x[0], x[1]))
c = mx = 0; at = None
for t, s in marks:
    c += s
    if c > mx: mx, at = c, t
sal = sorted(o['salida'] for o in ops)
gaps = [mins(b - a) for a, b in zip(sal, sal[1:]) if b - a < dt.timedelta(hours=3)]
out = {'criterio': 'RICARDONE · INGRESO · aceite de la planilla (día operativo del ingreso); cámaras: primera RicCalLiq y última RicB2Egreso entre 3 h antes del ingreso y 1 h después de la salida',
       'periodo': {'desde': DESDE, 'hasta': HASTA, 'dias': DAYS}, 'productos': dict(collections.Counter(o['producto'] for o in ops)),
       'total': resumen(ops), 'porDia': porDia, 'maxSimultaneos': {'n': mx, 'at': at.isoformat(timespec='minutes') if at else None},
       'minEntreSalidasMediana': med(gaps), 'fuentes': dict(collections.Counter(o['fuente'] for o in ops)),
       'camiones': [{**{k: v for k, v in o.items() if k not in ('ingreso', 'salida')}, 'ingreso': o['ingreso'].isoformat(timespec='minutes'), 'salida': o['salida'].isoformat(timespec='minutes')} for o in sorted(ops, key=lambda o: o['ingreso'])]}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({k: out[k] for k in ('productos', 'total', 'maxSimultaneos', 'minEntreSalidasMediana', 'fuentes')}, ensure_ascii=False))
print({d: (v['camiones'], v['adentroMediana'], v['caladaAEgresoMediana']) for d, v in porDia.items()})
