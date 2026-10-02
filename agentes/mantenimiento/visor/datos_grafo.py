"""Arma el JSON que embebe la página del grafo a partir del mapa de planta + OT del período."""
import csv, json, re, collections, sys, datetime as dt

MAPA = r'C:\Users\Usuario\Desktop\Dashboard_camiones\agentes\mantenimiento\pedido_mapa_planta\mapa_planta_mantenimiento.json'
OT = r'C:\Users\Usuario\Desktop\Jose\maintence\Agente_EAM_Bimtrazer_v2\eam_bimtrazer\reportes\2026-06-10_09-29\OT_detalle_fechas_10jun_29sep.csv'
PLAT_NOMBRE = {'VOLCABLE_PTO_1': 'PV1', 'VOLCABLE_PTO_2': 'PV2', 'VOLCABLE_PTO_3': 'PV3', 'VOLCABLE_PTO_4': 'PV4', 'VOLCABLE_PTO_5': 'PV5',
               'VOLCABLE_1': 'Volcable 1', 'VOLCABLE_2': 'Volcable 2', 'CELDA_16': 'Celda 16', 'KEPPLER_1': 'Kepler 1', 'KEPPLER_2': 'Kepler 2',
               'SILO_CHIEF_2': 'Silo Chief', 'CARGA_SILO_10': 'Carga silo 10', 'CARGA_SILO_11': 'Carga silo 11',
               'ACEITE': 'Aceite Ric.', 'ACEITE_OSL': 'Aceite OSL', 'ACEITE_PTO': 'Aceite puerto'}

d = json.load(open(MAPA, encoding='utf-8'))
A = {a['codigo_activo']: a for a in d['activos']}
clas = d['clasificacion_trabajos']
rx_det = re.compile('|'.join(p['patron'] for p in clas['detienen_equipo']), re.I)
rx_no = re.compile('|'.join(p['patron'] for p in clas['no_detienen']), re.I)

nodos = set()
for f in d['flujo_grano']:
    nodos |= {f['desde'], f['hasta']}

# Qué plataforma del Excel es cada fuente (impacto directo)
plat_de = collections.defaultdict(set)
impacto = collections.defaultdict(list)
for i in d['impacto_descarga']:
    if i['efecto'] == 'ninguno':
        continue
    for p in i['plataformas_excel']:
        impacto[i['equipo']].append({'p': PLAT_NOMBRE.get(p, p), 'e': i['efecto'], 'r': i['relacion'], 'c': i['confianza']})
    if i['relacion'] == 'directo' and i['equipo'] in nodos:
        plat_de[i['equipo']] |= {PLAT_NOMBRE.get(p, p) for p in i['plataformas_excel']}

# Servicios bloqueantes de cada nodo del flujo (y el nombre del proveedor)
serv = collections.defaultdict(list)
proveedores = {}
for s in d['dependencias_servicio']:
    serv[s['equipo']].append({'de': s['depende_de'], 't': s['tipo'], 'b': s.get('bloqueante', True), 'c': s['confianza']})
    if s.get('bloqueante', True):
        proveedores.setdefault(s['depende_de'], set()).add(s['equipo'])

# OT del período por equipo (sin las que no paran equipo)
ots = collections.defaultdict(list)
for r in csv.DictReader(open(OT, encoding='utf-8-sig')):
    c = r['codigo_activo']
    if r['resultado'] == 'CANCELADA':
        continue
    det = bool(rx_det.search(r['trabajo']))
    if not det and rx_no.search(r['trabajo']):
        continue
    ots[c].append({'f': r['debia_iniciar'][:5], 'iso': dt.datetime.strptime(r['debia_iniciar'][:10], '%d/%m/%Y').date().isoformat(),
                   't': ' '.join(r['trabajo'].split())[:120], 'tipo': (r['tipo_ot'] or 'plan'), 'pr': r['prioridad'],
                   'res': r['resultado'], 'det': det, 'ot': r['ot']})

def fuerte(o):
    return o['det'] or 'EMERGEN' in (o['tipo'] + o['pr']).upper() or o['tipo'] in ('Correctivo', 'Diferido', 'Mitigación') or o['pr'] == 'Urgente'

out_nodes = []
for n in sorted(nodos):
    a = A[n]
    lst = sorted(ots.get(n, []), key=lambda o: o['iso'])
    out_nodes.append({'id': n, 'nombre': a['nombre'], 'tipo': a['tipo'], 'planta': 'R' if a['planta'] == 'Ricardone' else 'P',
                      'sector': a.get('sector') or '', 'funcion': a.get('funcion') or '', 'plat': sorted(plat_de.get(n, [])),
                      'imp': impacto.get(n, []), 'serv': serv.get(n, []), 'ots': lst, 'fuertes': sum(fuerte(o) for o in lst)})

# Proveedores de servicio (CCM, trafo...) que alimentan nodos del flujo, para simular su caída
def cierre(p, visto=None):
    """Todo lo que queda sin servicio si cae p (trafo -> CCM -> equipos)."""
    visto = visto if visto is not None else set()
    for e in proveedores.get(p, ()):
        if e not in visto:
            visto.add(e)
            cierre(e, visto)
    return visto

out_prov = []
for p in list(proveedores):
    eqs_flujo = sorted(e for e in cierre(p) if e in nodos)
    if not eqs_flujo:
        continue
    a = A.get(p, {'nombre': p, 'tipo': 'otro', 'planta': ''})
    out_prov.append({'id': p, 'nombre': a['nombre'], 'tipo': a['tipo'], 'planta': 'R' if a.get('planta') == 'Ricardone' else 'P',
                     'alimenta': eqs_flujo, 'ots': len(ots.get(p, []))})
out_prov.sort(key=lambda x: (x['planta'], -len(x['alimenta'])))

edges = [{'a': f['desde'], 'b': f['hasta'], 'c': f['confianza'], 'alt': f.get('alternativo', False),
          'via': [A[v]['nombre'] if v in A else v for v in f.get('via', [])],
          'ev': ' · '.join(e.get('detalle', '') + (f" (OT {', '.join(e['ot'])})" if e.get('ot') else '') for e in f['evidencia'])[:400]}
         for f in d['flujo_grano']]

data = {'nodes': out_nodes, 'edges': edges, 'prov': out_prov,
        'casos': d['validacion_casos'], 'preguntas': d['preguntas_abiertas'],
        'resumen': {'activos': len(d['activos']), 'flujo': len(d['flujo_grano']), 'serv': len(d['dependencias_servicio']), 'imp': len(d['impacto_descarga'])}}
json.dump(data, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out_nodes), len(edges), len(out_prov), sum(len(n['ots']) for n in out_nodes))
