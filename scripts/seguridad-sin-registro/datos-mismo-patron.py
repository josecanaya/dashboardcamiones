"""Junta, por camión del informe «mismo patrón que CXV575», las visitas con huella (B1 → B2 sin pesar), todas las
visitas de cámara a Ricardone, lo que dice la balanza (sin kg) y las fotos del DSS.

Uso: python scripts/seguridad-sin-registro/datos-mismo-patron.py
Lee  reportes/barrera-sin-sistema/{mismo-patron-CXV575.json, 2026-*/visitas-sin-sistema.csv, fotos-mismo-patron/veh.json}
Deja reportes/barrera-sin-sistema/fichas-mismo-patron.json
"""
import csv, glob, json, os

R = 'reportes/barrera-sin-sistema'
cands = json.load(open(f'{R}/mismo-patron-CXV575.json', encoding='utf-8'))
veh = json.load(open(f'{R}/fotos-mismo-patron/veh.json', encoding='utf-8'))
plates = [c['p'] for c in cands]
DESDE = '2026-07-01'   # pedido del usuario 05/11: no usar nada anterior (huecos del Excel en mayo y junio)
SIN_DATOS = {'2026-10-31'}   # sin Excel ni SGC ese día

visitas = {}
for f in sorted(glob.glob(f'{R}/2026-*/visitas-sin-sistema.csv')):
    for r in csv.DictReader(open(f, encoding='utf-8-sig')):
        if r['patente'] in plates and r['prioridad'] != '9' and r['dia'] >= DESDE and r['dia'] not in SIN_DATOS:
            visitas.setdefault(r['patente'], []).append(r)

balanza = {}
for f in sorted(glob.glob('data/movimientos/2026-*/movimientos.json')):
    for r in json.load(open(f, encoding='utf-8')):
        p = str(r.get('plate_normalized') or r.get('patente_original') or '').replace(' ', '').upper()
        a = str(r.get('patente_acoplado') or '').replace(' ', '').upper()
        if str(r.get('external_ingreso_at'))[:10] < DESDE: continue
        for pl in plates:
            if pl in (p, a):
                ent = str(r.get('entregado_por_a') or '').split('-')[0].strip()
                balanza.setdefault(pl, []).append({
                    'dia': str(r.get('external_ingreso_at'))[:10], 'ingreso': str(r.get('external_ingreso_at'))[11:16],
                    'salida': str(r.get('external_salida_at'))[11:16], 'mov': r.get('movement_type'), 'producto': r.get('product_normalized'),
                    'empresa': ent, 'obs': str(r.get('observaciones') or '').split(',')[0].strip(), 'planta': r.get('planta_normalized')})

# Vista SGC con historia (desde 05/11/2026; scripts/sgc/consultar_rango.py → data/sgc/_historico/). Le falta el 61 % de
# los «productos varios»/residuos del Excel, así que complementa al Excel, no lo reemplaza. Una pasada con ingreso SGC
# de la patente ±2 h tiene registro y sale de la ficha.
from datetime import datetime, timedelta
import re
SGC_CSV = sorted(glob.glob('data/sgc/_historico/sgc_*.csv'))
sgc = []
if SGC_CSV:
    k = lambda s: re.sub(r'[^A-Z0-9]', '', (s or '').upper())
    for r in csv.DictReader(open(SGC_CSV[-1], encoding='utf-8')):
        for pl in plates:
            if pl in (k(r['PATENTECAMION']), k(r['PATENTEACOPLADO'])):
                ing = datetime.fromisoformat(r['FECHAINGRESO'][:19])
                sal = datetime.fromisoformat(r['FECHASALIDA'][:19]) if r['FECHASALIDA'] else ing + timedelta(hours=24)
                sgc.append((pl, ing, sal))
                planta = {'TERMINAL DE EMBARQUE': 'TERMINAL_EMBARQUE', 'PLANTA SAN LORENZO': 'RICARDONE'}.get(r['PLANTA'], r['PLANTA'])
                ya_en_excel = any(b['dia'] == r['FECHAINGRESO'][:10] and b['planta'] == planta for b in balanza.get(pl, []))
                if r['FECHAINGRESO'][:10] >= DESDE and not ya_en_excel:
                    balanza.setdefault(pl, []).append({
                        'dia': r['FECHAINGRESO'][:10], 'ingreso': r['FECHAINGRESO'][11:16], 'salida': (r['FECHASALIDA'] or '')[11:16],
                        'mov': 'INGRESO', 'producto': r['PRODUCTO'], 'empresa': '', 'obs': (r['PRODUCTO'] or '').capitalize() + (' (dado de baja)' if r['BAJA'] else ''),
                        'planta': {'TERMINAL DE EMBARQUE': 'TERMINAL_EMBARQUE', 'PLANTA SAN LORENZO': 'RICARDONE'}.get(r['PLANTA'], r['PLANTA']), 'fuente': 'sgc'})
def con_registro_sgc(pl, h):
    t0 = datetime.fromisoformat(f"{h['dia']}T{h['primera']}")
    t1 = datetime.fromisoformat(f"{h['dia']}T{h['ultima']}")
    return any(p == pl and ing - timedelta(hours=2) <= t1 and sal + timedelta(hours=2) >= t0 for p, ing, sal in sgc)

# San Lorenzo: visitas sin registro del barrido del puerto (balanza-sl-sin-sistema.mjs)
for x in json.load(open(f'{R}/sl/p1-sl.json', encoding='utf-8')):
    if x['p'] in plates:
        visitas.setdefault(x['p'], []).extend(r for r in x['filas'] if r['dia'] >= DESDE)

# Fotos donde el DSS asoció la patente a otro vehículo (revisadas a mano el 05/11).
FOTOS_MALAS = {('AB127BY', '2026-10-21', 'SLZTK400'), ('NAD656', '2026-10-23', 'SLZBalSC1Fte')}
fotos = {}
for v in veh:
    for p in v['pasos']:
        if p.get('foto') and v['dia'] >= DESDE and (v['plate'], v['dia'], p['device']) not in FOTOS_MALAS:
            fotos.setdefault(v['plate'], []).append({'dia': v['dia'], 'device': p['device'], 'at': p['at'], 'foto': p['foto']})

out = []
for c in cands:
    pl = c['p']
    out.append({
        'patente': pl,
        'huellas': [{'planta': h.get('planta', 'ric'), 'salida': h.get('salida', ''), 'dia': h['dia'], 'primera': h['primera'], 'ultima': h['ultima'], 'minB1B2': int(h['min_b1_b2']), 'camaras': h['camaras'].split()} for h in c['huellas'] if not con_registro_sgc(pl, h)],
        'visitas': sorted({v['dia'] for v in visitas.get(pl, [])}),
        'balanza': sorted({json.dumps(b, sort_keys=True) for b in balanza.get(pl, [])}),
        'fotos': fotos.get(pl, []),
    })
    out[-1]['balanza'] = [json.loads(b) for b in out[-1]['balanza']]
json.dump(out, open(f'{R}/fichas-mismo-patron.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for x in out:
    print(x['patente'], len(x['huellas']), 'huellas', len(x['visitas']), 'días', len(x['balanza']), 'bal', len(x['fotos']), 'fotos')
