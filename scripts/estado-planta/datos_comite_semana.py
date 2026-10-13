"""Junta las cifras del Comité de Logística de una semana (lunes→domingo) en <carpeta>/datos.json.

Uso: python scripts/estado-planta/datos_comite_semana.py <carpeta> <desde> <hasta> <dirCorrida> [<carpetaComiteAnterior>]
  <carpeta>/calculo/ tiene que traer (scripts de scripts/estado-planta/, todos con <desde> <hasta>):
    paquete.json                         paquete-periodo.ts sobre la corrida de la semana (actividad de sectores, tramos ETL)
    r7-camaras.json                      r7-camaras.cjs                (soja R7 por patente, sin depender de las volcables del puerto)
    metricas-camaras.json                metricas-camaras.cjs <prev> <desde> <dias>  (girasol, sectores por patente)
    pellet-camaras.json                  pellet-camaras.cjs
    liquidos-camaras.json                liquidos-camaras.cjs
    *-calibracion-<rango>.json           los mismos scripts sobre días con planilla (calibración)
    liquidos-criterio-anterior.json      liquidos-criterio.cjs sobre el período del comité anterior (criterio nuevo de líquidos)
    liquidos-criterio.json (opcional)    liquidos-criterio.cjs sobre la semana, cuando llega la planilla
  <carpetaComiteAnterior> (opcional): datos.json y calculo-pc/ del comité anterior, para los comparativos.
Modo: si la corrida trae movimientos (manifest.input.movimientosRows > 0) se marca 'planilla'; si no, 'camaras'.
Las cifras de cámara se publican como «según cámaras», con el denominador y la calibración contra la planilla.
"""
import json, os, sys, glob, datetime

D, DESDE, HASTA, RUN = sys.argv[1:5]
ANT = sys.argv[5] if len(sys.argv) > 5 else None
C = os.path.join(D, 'calculo')
J = lambda *p: json.load(open(os.path.join(*p), encoding='utf-8'))
def opt(*p):
    f = os.path.join(*p)
    return J(f) if os.path.exists(f) else None
def one(pat):
    fs = sorted(glob.glob(os.path.join(C, pat)))
    return (J(fs[-1]), os.path.basename(fs[-1])) if fs else (None, None)

d0 = datetime.date.fromisoformat(DESDE)
DAYS = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((datetime.date.fromisoformat(HASTA) - d0).days + 1)]
man = J(RUN, 'manifest.json')
modo = 'planilla' if (man.get('input') or {}).get('movimientosRows') else 'camaras'

def rows(name):
    t = J(RUN, 'tables', name + '.json')
    return t if isinstance(t, list) else t.get('rows', [])

PX = J(C, 'paquete.json')
R7 = J(C, 'r7-camaras.json'); R7c, R7cf = one('r7-camaras-calibracion-*.json')
M = J(C, 'metricas-camaras.json')
PE = J(C, 'pellet-camaras.json'); PEc, PEcf = one('pellet-camaras-calibracion-*.json')
LQ = J(C, 'liquidos-camaras.json'); LQc, LQcf = one('liquidos-camaras-calibracion-*.json')
LCR, LCRf = J(C, 'liquidos-criterio-anterior.json'), 'liquidos-criterio-anterior.json'
LCW = opt(C, 'liquidos-criterio.json')                              # la semana, cuando hay planilla

# ---- soja R7: recorridos de la corrida (final_circuits) por día operativo del inicio (circuit_timing_journeys)
fc = rows('final_circuits'); ctj = rows('circuit_timing_journeys')
r7ids = {x['journey_uid'] for x in fc if x.get('executive_circuit_code') == 'R7'}
def opday(s):
    t = datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    t = t.astimezone(datetime.timezone(datetime.timedelta(hours=-3))) + datetime.timedelta(hours=2)
    return t.date().isoformat()
etl_r7_dia = {d: 0 for d in DAYS}
for x in ctj:
    if x.get('journey_id') in r7ids and x.get('start_time'):
        dd = opday(x['start_time'])
        if dd in etl_r7_dia: etl_r7_dia[dd] += 1
bucket = {}
for x in fc:
    k = x.get('executive_circuit_code') or 'SIN'
    b = bucket.setdefault(k, {})
    b[x.get('executive_bucket')] = b.get(x.get('executive_bucket'), 0) + 1

cal_r7 = None
if R7c and R7c.get('calibracion'):
    k = R7c['calibracion']
    pd_ = (ANT and J(os.path.abspath(os.path.join(ANT, '..', '..', '..', '..')), J(ANT, 'datos.json')['paquete'])['tiempos']['soja']['porDia']) or {}
    w = [pd_[d] for d in k['planillaPorDia'] if d in pd_ and pd_[d].get('tiempoMedioN')]
    cal_r7 = {'p2pPlanilla': round(sum(x['tiempoMedioMin'] * x['tiempoMedioN'] for x in w) / sum(x['tiempoMedioN'] for x in w)) if w else None,
              'archivo': R7cf, 'dias': sorted(k['planillaPorDia']), 'camara': R7c['viajes'], 'planilla': k['planillaR7'],
              'cobertura': round(R7c['viajes'] / k['planillaR7'], 3), 'p2pCamara': R7c['tramos']['total']['mean'], 'p2pCamaraN': R7c['tramos']['total']['n']}

# ---- comité anterior (publicado) y su medición por cámaras con el mismo script (metricas-camaras)
ant = None
if ANT:
    AX = J(ANT, 'datos.json')
    AM = opt(ANT, 'calculo-pc', 'metricas-camaras.json')
    APX = J(os.path.abspath(os.path.join(ANT, '..', '..', '..', '..')), AX['paquete'])   # paquete oficial del comité anterior
    ant = {'carpeta': ANT, 'dias': AX['days'], 'extras': {k: AX['extras'][k] for k in ('r7', 'girasol', 'liquidos', 'pelletTransile', 'r29') if k in AX['extras']},
           'girasol': {k: v for k, v in AX['girasol'].items() if k != 'cam'}, 'pelletHistorico': AX['pelletHistorico'],
           'paquete': AX['paquete'], 'sojaPorDia': APX['tiempos']['soja']['porDia'], 'sojaPeriodo': {k: v for k, v in APX['tiempos']['soja']['periodo'].items() if k != 'porHora'},
           'actividad': {k: {'periodo': {kk: vv for kk, vv in v['periodo'].items() if kk != 'porHora'}, 'porDia': {d: x.get('camiones') for d, x in v['porDia'].items()}} for k, v in APX['actividad'].items()},
           'metricas': AM['circuitos']['cur'] if AM else None, 'metricasSemanas': AM['semanas']['cur'] if AM else None}

out = {
    'periodo': {'desde': DESDE, 'hasta': HASTA, 'days': DAYS},
    'modo': modo,
    'corrida': {'runId': man['runId'], 'rulesVersion': man['rulesVersion'], 'eventCount': man['input'].get('eventCount'),
                'movimientosRows': man['input'].get('movimientosRows'), 'finishedAt': man.get('finishedAt'),
                'eventDays': [os.path.basename(os.path.dirname(p)) for p in man['input'].get('eventsPaths', [])]},
    'paquete': {'archivo': 'calculo/paquete.json', 'actividad': PX['actividad'], 'tiempos': PX['tiempos'], 'controles': PX['controles']},
    'finalCircuits': {'total': len(fc), 'porCircuito': bucket},
    'r7': {'camaras': R7, 'calibracion': cal_r7, 'etlRecorridos': len(r7ids), 'etlPorDia': [etl_r7_dia[d] for d in DAYS],
           'metricas': M['circuitos']['cur']['r7']},
    'girasol': {'metricas': M['circuitos']['cur']['gir'], 'volcable2PorDia': M['sectores']['cur']['volcRic2'], 'volcable1PorDia': M['sectores']['cur']['volcRic1']},
    'r29': {'metricas': M['circuitos']['cur']['r29'], 'silosCarga': M['sectores']['cur']['silosCarga'], 'silosDesc': M['sectores']['cur']['silosDesc']},
    'sectores': {'metricas': M['sectores']['cur'], 'calles': M['calles']['cur'], 'horasActivas': M['horasActivas']['cur']},
    'pellet': {'camaras': PE, 'calibracion': (PEc or {}).get('calibracion'), 'calibracionArchivo': PEcf},
    'liquidos': {'camaras': {k: v for k, v in LQ.items() if k != 'detalle'}, 'calibracion': (LQc or {}).get('calibracion'), 'calibracionArchivo': LQcf,
                 'calibracionVisitas': (LQc or {}).get('visitas'), 'criterioAnterior': LCR, 'criterioArchivo': LCRf,
                 'criterioSemana': LCW if LCW and LCW['total']['n'] else None},
    'anterior': ant,
}
json.dump(out, open(os.path.join(D, 'datos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'modo': modo, 'run': out['corrida'], 'r7': {'viajes': R7['viajes'], 'etl': len(r7ids), 'p2p': R7['tramos']['total']}, 'cal': cal_r7}, ensure_ascii=False))
