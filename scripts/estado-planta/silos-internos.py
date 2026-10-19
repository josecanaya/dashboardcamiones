# Transile interno en silos de Ricardone: camiones con 3+ cargas en el silo 7 en un día, destinos por cámara y cruce con data/movimientos.
# Uso: python scripts/estado-planta/silos-internos.py <salida.json>   (semana fija 05–11/10 en WEEK; ajustar para otras semanas)
import json, os, datetime as dt, collections, sys
ROOT = r'C:\Users\Usuario\Desktop\Dashboard_camiones'
SKEW = dt.timedelta(minutes=206); WEEK = [f'2026-10-{d:02d}' for d in range(5, 12)]
ev = collections.defaultdict(list)
for d in [f'2026-10-{x:02d}' for x in range(4, 13)]:
    for r in json.load(open(os.path.join(ROOT, 'data', 'truckflow', d, 'event-list.json'), encoding='utf-8'))['records']:
        if r.get('truckPlate') and r.get('occurredAt'):
            t = dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + SKEW
            if t.date().isoformat() in WEEK: ev[r['truckPlate'].upper()].append((t, r['deviceCode']))
mov = collections.defaultdict(dict)
for d in [f'2026-10-{x:02d}' for x in range(3, 13)]:
    f = os.path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
    if os.path.exists(f):
        j = json.load(open(f, encoding='utf-8')); rows = j if isinstance(j, list) else (j.get('rows') or [])
        for r in rows: mov[(r.get('plate_normalized') or '').upper()][r['external_operation_id']] = r
# camiones internos: 3+ cargas en silo 7 en un mismo día
inter = sorted(p for p, es in ev.items() if any(n >= 3 for n in collections.Counter(t.date() for t, d in es if d == 'RicS7Carga').values()))
porDia = {d: {'cargasS7': 0, 'volcable2': 0, 'silo7Linea2': 0, 'camiones': 0} for d in WEEK}
cam = []
for p in inter:
    es = sorted(ev[p]); dias = sorted({t.date().isoformat() for t, d in es if d == 'RicS7Carga'})
    for d in WEEK:
        de = [x for x in es if x[0].date().isoformat() == d]
        c = collections.Counter(x[1] for x in de)
        if c['RicS7Carga']: porDia[d]['camiones'] += 1
        porDia[d]['cargasS7'] += c['RicS7Carga']; porDia[d]['volcable2'] += c['RicVolcable2']; porDia[d]['silo7Linea2'] += c['RicS7DescLinea2']
    xl = [r for r in mov[p].values() if (r.get('external_ingreso_at') or '')[:10] in WEEK]
    turnos = [(r['external_ingreso_at'][11:16], r['external_salida_at'][11:16]) for r in xl]
    cam.append({'patente': p, 'dias': len(dias), 'cargasS7': sum(1 for t, d in es if d == 'RicS7Carga'),
                'excel': {'filas': len(xl), 'producto': sorted({r['product_normalized'] for r in xl}), 'planta': sorted({r['planta_normalized'] for r in xl}), 'mov': sorted({r['mov'] for r in xl}),
                          'kgsNeto': sum(float(r.get('kgs_neto') or 0) for r in xl), 'turnos': turnos}})
otros = []
SIL = {'RicS7Carga', 'RicS7DescLinea2', 'RicS8CargaLinea2', 'RicC16Carga1', 'RicC16Carga2'}
for p, es in ev.items():
    if p in inter or not any(d in {'RicS7Carga', 'RicS7DescLinea2', 'RicS8CargaLinea2'} for t, d in es): continue
    c = collections.Counter(d for t, d in es if d in SIL | {'RicB3Ingreso', 'RicB3Egreso'})
    xl = [r for r in mov[p].values() if (r.get('external_ingreso_at') or '')[:10] in WEEK]
    otros.append({'patente': p, 'lecturas': dict(c), 'excel': [f'{r["mov"]} {r["product_normalized"].lower()}' for r in xl]})
out = {'criterio': 'camiones con 3 o más cargas en el silo 7 (RicS7Carga) en un mismo día; hora operativa = occurredAt + 206 min; cruce con data/movimientos por patente',
       'internos': cam, 'porDia': porDia, 'otros': sorted(otros, key=lambda o: o['patente'])}
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False)[:1800])
