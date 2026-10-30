"""Tramos por circuito (girasol R12, líquidos SL5/SL6/R35/SL1/R8), 23-28/10/2026.
Viajes = planilla SGC (día operativo del ingreso); tramos = cámaras de la patente o el acoplado, cada punto
de control es la primera lectura posterior al punto anterior (hora operativa = occurredAt + 206 min).
Uso: python -I tramos_circuitos.py <salida.json>
"""
import json, re, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
DAYS = ('2026-10-23', '2026-10-28')
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
RIC_ING = {'RicIngCamFrente', 'RicPreIngInFr'}
CAL_RIC = {'RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05'}
PUNTOS = {
    'R12': [('Ingreso', RIC_ING), ('Calada', {'RicCalLiq'}), ('Playa 3', {'RicS6Playa3'}), ('Carga silo Chief', {'RicS8CargaLinea1', 'RicS8CargaLinea2'}),
            ('Balanza egreso', {'RicB2Egreso', 'RicB3Egreso'}), ('Calada de salida', CAL_RIC), ('Salida', {'RicEgrCamFrente'})],
    'SL5': [('Ingreso', {'SLZIngCamFrente'}), ('Calada', {'SLZCalado'}), ('Balanza ingreso', {'SLZBalIngFte'}), ('Balanza egreso', {'SLZBalSC2Fte'}), ('Salida', {'SLZSalidaC1Fte'})],
    'SL6': [('Ingreso', {'SLZIngCamFrente'}), ('Calada', {'SLZCalado'}), ('Balanza ingreso', {'SLZBalIngFte'}), ('Balanza egreso', {'SLZBalSC2Fte'}), ('Salida', {'SLZSalidaC1Fte'})],
    'R35': [('Ingreso Ricardone', RIC_ING), ('Calada líquidos', {'RicCalLiq'}), ('Egreso Ricardone', {'RicEgrCamFrente'}), ('Ingreso puerto', {'SLZIngCamFrente'}),
            ('Balanza ingreso', {'SLZBalIngFte'}), ('Balanza egreso', {'SLZBalSC2Fte'}), ('Salida', {'SLZSalidaC1Fte'})],
    'SL1': [('Ingreso', {'SLZIngCamFrente'}), ('Calada', {'SLZCalado'}), ('Balanza ingreso', {'SLZBalIngFte'}), ('Balanza egreso', {'SLZBalSC2Fte'}), ('Salida', {'SLZSalidaC1Fte'})],
    'R8': [('Ingreso', RIC_ING), ('Calada líquidos', {'RicCalLiq'}), ('Balanza egreso', {'RicB2Egreso', 'RicB3Egreso'}), ('Salida', {'RicEgrCamFrente'})],
}
ev = collections.defaultdict(list)
for d in range(22, 30):
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/event-list.json', encoding='utf-8'))['records']:
        ev[r['truckPlate']].append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), r['deviceCode']))
for v in ev.values(): v.sort()
rows = {}
for d in range(22, 30):
    for r in json.load(open(B + f'movimientos/2026-10-{d:02d}/movimientos.json', encoding='utf-8')):
        rows[r['external_operation_id']] = r

def circuito(r, devs):
    p, pl, mv = r['product_normalized'], r['planta_normalized'], r['movement_type']
    if pl == 'RICARDONE' and p == 'GIRASOL': return 'R12'    # 23-28/10: todo girasol de Ricardone es carga en el silo Chief (cámaras)
    if not LIQ.search(p) or 'ENVASADO' in p: return None
    if pl == 'RICARDONE' and mv == 'INGRESO': return 'R8'
    if pl == 'TERMINAL_EMBARQUE' and mv == 'EGRESO': return 'SL6' if devs & {'RenCargFte', 'RenDescFte'} else 'SL5'
    if pl == 'TERMINAL_EMBARQUE' and mv == 'INGRESO': return 'R35' if devs & {'RicCalLiq'} else 'SL1'
    return None

res = collections.defaultdict(lambda: {'viajes': 0, 'total': [], 'tramos': collections.defaultdict(list), 'kg': 0, 'sentidoInferido': 0})
for r in rows.values():
    if not r['external_salida_at']: continue
    i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    od = (i + dt.timedelta(hours=2)).date().isoformat()
    if not (DAYS[0] <= od <= DAYS[1]): continue
    rs = sorted(x for p in (r['plate_normalized'], r.get('patente_acoplado') or '') if p for x in ev.get(p, []) if i - dt.timedelta(minutes=60) <= x[0] <= s + dt.timedelta(minutes=20))
    c = circuito(r, {x[1] for x in rs})
    if not c: continue
    g = res[c]; g['viajes'] += 1; g['total'].append((s - i).total_seconds() / 60)
    g['kg'] += float(r['kgs_neto'] or 0); g['sentidoInferido'] += 'SGC_MOV_FROM_HISTORY' in str(r['normalization_warnings'])
    t0, prev, marcas = None, None, []
    for nombre, devs in PUNTOS[c]:
        t = next((x[0] for x in rs if x[1] in devs and (prev is None or x[0] >= prev)), None)
        marcas.append((nombre, t))
        if t: prev = t
    for (a, ta), (b, tb) in zip(marcas, marcas[1:]):
        if ta and tb and tb >= ta: g['tramos'][f'{a} → {b}'].append((tb - ta).total_seconds() / 60)

out = {}
for c in PUNTOS:
    if c not in res: continue
    g = res[c]
    out[c] = {'viajes': g['viajes'], 't': round(g['kg'] / 1000), 'sentidoInferidoPorHistorial': g['sentidoInferido'],
              'totalPlanillaMedia': st.mean(g['total']), 'totalPlanillaMediana': st.median(g['total']),
              'tramos': [{'tramo': k, 'media': st.mean(v), 'mediana': st.median(v), 'n': len(v)} for k, v in g['tramos'].items()]}
    print(f"== {c}: {g['viajes']} viajes, {out[c]['t']} t, planilla media {st.mean(g['total']):.0f} min (mediana {st.median(g['total']):.0f}), sentido por historial {g['sentidoInferido']}")
    for x in out[c]['tramos']: print(f"   {x['tramo']:40} media {x['media']:5.0f}  mediana {x['mediana']:5.0f}  n {x['n']}")
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
