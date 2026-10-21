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
# período de más de una semana: <dirCorrida> = corridas semanales separadas por coma (ventanas lunes→domingo que lo cubren)
RUNS = RUN.split(',')
_mans = [J(r, 'manifest.json') for r in RUNS]
man = {'runId': ' + '.join(m['runId'] for m in _mans), 'rulesVersion': _mans[0]['rulesVersion'],
       'finishedAt': min(m.get('finishedAt') or '' for m in _mans),
       'input': {'eventCount': sum((m.get('input') or {}).get('eventCount') or 0 for m in _mans),
                 'movimientosRows': sum((m.get('input') or {}).get('movimientosRows') or 0 for m in _mans),
                 'eventsPaths': sorted({p for m in _mans for p in (m.get('input') or {}).get('eventsPaths', [])})}}
# cobertura de la planilla (data/movimientos, particionado por día de ingreso): la semana está completa cuando cada día
# tiene movimientos y el último Excel cargado es de después del último día (el Excel del día D trae D-1/D-2 y parte de D)
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
pl_dia, ult = {}, None
for i in range(len(DAYS) + 3):
    d = (d0 + datetime.timedelta(days=i)).isoformat()
    f = os.path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
    rr = json.load(open(f, encoding='utf-8')) if os.path.exists(f) else []
    if d in DAYS: pl_dia[d] = len(rr)
    for r in rr:                                   # source_date = fecha del Excel que trajo la fila
        sd = str(r.get('source_date') or '')[:10]
        if sd and (ult is None or sd > ult): ult = sd
faltan = [d for d in DAYS if not pl_dia[d]]
planilla = {'porDia': pl_dia, 'ultimoExcel': ult, 'diasSinMovimientos': faltan,
            'completa': not faltan and bool(ult) and ult > HASTA, 'corridaConPlanilla': bool((man.get('input') or {}).get('movimientosRows'))}
planilla['completa'] = planilla['completa'] and planilla['corridaConPlanilla']
modo = 'planilla' if planilla['completa'] else ('parcial' if any(pl_dia.values()) else 'camaras')

# ---- girasol desde movimientos: RICARDONE · INGRESO · GIRASOL por día operativo del ingreso (desde las 22 h).
# Con Excel cuentan las volcables 1/2 (R5+R6); la balanza SGC no trae plataforma, así que sus filas entran todas
# (incluyen las descargas a silos Kepler, R4) y se informan aparte para que la lámina lo diga.
def girasol_movimientos():
    seen, por_dia, sgc, kepler = set(), {d: 0 for d in DAYS}, 0, 0
    for i in range(-1, len(DAYS) + 3):
        f = os.path.join(ROOT, 'data', 'movimientos', (d0 + datetime.timedelta(days=i)).isoformat(), 'movimientos.json')
        for r in (json.load(open(f, encoding='utf-8')) if os.path.exists(f) else []):
            oid = r.get('external_operation_id')
            if oid in seen: continue
            seen.add(oid)
            if r.get('planta_normalized') != 'RICARDONE' or r.get('movement_type') != 'INGRESO' or r.get('product_normalized') != 'GIRASOL': continue
            p = str(r.get('plate_normalized') or '')
            if len(p) < 6 or len(set(p)) == 1: continue
            ing = str(r.get('external_ingreso_at') or '')
            if len(ing) < 16: continue
            dd = (datetime.datetime.fromisoformat(ing[:16]) + datetime.timedelta(hours=2)).date().isoformat()
            if dd not in por_dia: continue
            plat = str(r.get('platform_normalized') or '')
            es_sgc = r.get('source_file') == 'SGC_PROD.CamionesActivos24horas'
            if not es_sgc and not plat.startswith('VOLCABLE_'):
                kepler += plat.startswith('KEPPLER')
                continue
            sgc += es_sgc
            por_dia[dd] += 1
    return {'operaciones': sum(por_dia.values()), 'porDia': por_dia, 'balanzaSgc': sgc, 'keplerExcluidasExcel': kepler}

def rows(name):
    out = []
    for r in RUNS:
        t = J(r, 'tables', name + '.json')
        out += t if isinstance(t, list) else t.get('rows', [])
    return out

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

def paquete_ant(AX):
    if 'periodo' in AX: return J(ANT, AX['paquete']['archivo'])
    return J(os.path.abspath(os.path.join(ANT, '..', '..', '..', '..')), AX['paquete'])   # paquete oficial del comité anterior (ruta desde la raíz)

cal_r7 = None
if R7c and R7c.get('calibracion'):
    k = R7c['calibracion']
    pd_ = (ANT and paquete_ant(J(ANT, 'datos.json'))['tiempos']['soja']['porDia']) or {}
    w = [pd_[d] for d in k['planillaPorDia'] if d in pd_ and pd_[d].get('tiempoMedioN')]
    cal_r7 = {'p2pPlanilla': round(sum(x['tiempoMedioMin'] * x['tiempoMedioN'] for x in w) / sum(x['tiempoMedioN'] for x in w)) if w else None,
              'archivo': R7cf, 'dias': sorted(k['planillaPorDia']), 'camara': R7c['viajes'], 'planilla': k['planillaR7'],
              'cobertura': round(R7c['viajes'] / k['planillaR7'], 3), 'p2pCamara': R7c['tramos']['total']['mean'], 'p2pCamaraN': R7c['tramos']['total']['n']}

# ---- comité anterior (publicado) y su medición por cámaras con el mismo script (metricas-camaras)
ant = None
if ANT and 'periodo' in J(ANT, 'datos.json'):
    # comité armado con comite_semana.py: lo que publicó lo dejó gen_comite_logistica_semana.py en publicado.json
    AX = J(ANT, 'datos.json'); PB = J(ANT, 'publicado.json'); APX = paquete_ant(AX)
    AM = opt(ANT, 'calculo', 'metricas-camaras.json')
    ant = {'carpeta': ANT, 'dias': PB['dias'], 'comite': PB['comite'], 'series': PB['series'], 'extras': PB['extras'],
           'girasol': PB['girasol'], 'pelletHistorico': PB['pelletHistorico'], 'paquete': AX['paquete']['archivo'],
           'sojaPorDia': APX['tiempos']['soja']['porDia'], 'sojaPeriodo': {k: v for k, v in APX['tiempos']['soja']['periodo'].items() if k != 'porHora'},
           'actividad': {k: {'periodo': {kk: vv for kk, vv in v['periodo'].items() if kk != 'porHora'}, 'porDia': {d: x.get('camiones') for d, x in v['porDia'].items()}} for k, v in APX['actividad'].items()},
           'metricas': AM['circuitos']['cur'] if AM else None, 'metricasSemanas': AM['semanas']['cur'] if AM else None}
elif ANT:
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
    'planilla': planilla,
    'corrida': {'runId': man['runId'], 'rulesVersion': man['rulesVersion'], 'eventCount': man['input'].get('eventCount'),
                'movimientosRows': man['input'].get('movimientosRows'), 'finishedAt': man.get('finishedAt'),
                'eventDays': [os.path.basename(os.path.dirname(p)) for p in man['input'].get('eventsPaths', [])]},
    'paquete': {'archivo': 'calculo/paquete.json', 'actividad': PX['actividad'], 'tiempos': PX['tiempos'], 'controles': PX['controles']},
    'finalCircuits': {'total': len(fc), 'porCircuito': bucket},
    'r7': {'camaras': R7, 'calibracion': cal_r7, 'etlRecorridos': len(r7ids), 'etlPorDia': [etl_r7_dia[d] for d in DAYS],
           'metricas': M['circuitos']['cur']['r7']},
    'girasol': {'movimientos': girasol_movimientos(), 'metricas': M['circuitos']['cur']['gir'], 'volcable2PorDia': M['sectores']['cur']['volcRic2'], 'volcable1PorDia': M['sectores']['cur']['volcRic1']},
    'r29': {'metricas': M['circuitos']['cur']['r29'], 'silosCarga': M['sectores']['cur']['silosCarga'], 'silosDesc': M['sectores']['cur']['silosDesc']},
    'sectores': {'metricas': M['sectores']['cur'], 'calles': M['calles']['cur'], 'horasActivas': M['horasActivas']['cur']},
    'pellet': {'camaras': PE, 'calibracion': (PEc or {}).get('calibracion'), 'calibracionArchivo': PEcf},
    'liquidos': {'camaras': {k: v for k, v in LQ.items() if k != 'detalle'}, 'calibracion': (LQc or {}).get('calibracion'), 'calibracionArchivo': LQcf,
                 'calibracionVisitas': (LQc or {}).get('visitas'), 'criterioAnterior': LCR, 'criterioArchivo': LCRf,
                 'criterioSemana': LCW if LCW and LCW['total']['n'] else None},
    'anterior': ant,
}
json.dump(out, open(os.path.join(D, 'datos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'modo': modo, 'planilla': planilla, 'run': out['corrida'], 'r7': {'viajes': R7['viajes'], 'etl': len(r7ids), 'p2p': R7['tramos']['total']}, 'cal': cal_r7}, ensure_ascii=False))
