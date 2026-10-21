"""Comité de Logística Nodo Sur — una semana lunes→domingo, con la maqueta del deck 24/09–04/10 (artifact SxeVbx2h3pxKuaAf6nfMRF).

Uso: python scripts/estado-planta/gen_comite_logistica_semana.py <carpeta>
  <carpeta>/datos.json lo arma datos_comite_semana.py (ver <carpeta>/calculo/README.md). Escribe <carpeta>/deck/project/...
Diferencias con gen_comite_logistica_rango.py:
- Nada de fechas fijas: días, rótulos, títulos y textos salen de datos.json.
- Modo «cámaras» (sin planilla): cada cifra de cámara dice su denominador y su calibración contra la planilla de días anteriores.
- Pellet queda solo como monitoreo (sin propuesta de puerto ni de flete).
- Líquidos con el criterio por producto, planta y sentido (liquidos-criterio.cjs) y estimación por cámaras (liquidos-camaras.cjs).
"""
import json, os, sys, datetime, collections
D = os.path.abspath(sys.argv[1])
X = json.load(open(os.path.join(D, 'datos.json'), encoding='utf-8'))
CAL_DIR = os.path.join(D, 'calculo')
JC = lambda f: json.load(open(os.path.join(CAL_DIR, f), encoding='utf-8'))
OUT = os.path.join(D, 'deck')
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)
CAMARAS = X['modo'] != 'planilla'          # 'parcial' = llegó parte de la planilla: los conteos siguen siendo de cámaras
PLAN = X.get('planilla') or {}

DAYS = X['periodo']['days']
N = len(DAYS)
MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
DOWF = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
def wd(d): return datetime.date.fromisoformat(d).weekday()
def dd(d): return int(d[8:10])
days = [f'{DOW[wd(d)]} {dd(d)}' for d in DAYS]                       # «Lun 5»
ini = [DOW[wd(d)][0] for d in DAYS]                                  # «L»
full = [f'{DOWF[wd(d)]} {dd(d)}' for d in DAYS]                       # «lunes 5»
fdm = lambda d: f'{d[8:10]}/{d[5:7]}'
LBL = f'{fdm(DAYS[0])}–{fdm(DAYS[-1])}'
LBL_LARGO = f'Del {dd(DAYS[0])} al {dd(DAYS[-1])} de {MES[int(DAYS[-1][5:7]) - 1]} de {DAYS[-1][:4]}'
HOURS = 24 * N
iD = {d: i for i, d in enumerate(DAYS)}

GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'; G2='#1F7A4D'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'; GREY='#B7C3BB'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'; VXLT='#A99BCF'
BLU='#1F4E7A'; BMID='#3F7FB5'; BXLT='#DCE8F3'
PEL='#5E4428'; PELM='#9A7650'; PELL='#F3EADF'
FONT="'IBM Plex Sans', Arial, sans-serif"
NVA_G='/_blob/2c1166d4fbf2fbec7430398abf6b0e3b'; NVA_L='/_blob/18aa8ca0d589832dda48c77f1ed28a0b'
BTZ='/_blob/916ea0722fd539b2369ca6413631c60d'; BTZ_L='/_blob/0e7d769a3aba86ad2cd768091719225b'
AER_RIC='/_blob/d87935e062f6db2ad585a52b0b30e02f'; AER_SL='/_blob/b2b7b4c6595ee63172090f5ac4fd588e'
# imágenes: ids del almacén del artifact donde se publica (deck/assets.json); por defecto, los del deck 24/09–04/10
_AS = os.path.join(OUT, 'assets.json')
if os.path.exists(_AS):
    _a = json.load(open(_AS, encoding='utf-8')); NVA_G, NVA_L, BTZ, BTZ_L, AER_RIC, AER_SL = (_a[k] for k in ('NVA_G', 'NVA_L', 'BTZ', 'BTZ_L', 'AER_RIC', 'AER_SL'))

fmtn = lambda v: f'{round(v):,}'.replace(',', '.')
def hm(m): m = round(m); return f'{m // 60} h {m % 60} m'
def sgn(d): d = round(d); return f'+{d}' if d > 0 else (f'−{abs(d)}' if d < 0 else '0')
def pct(a, b): return round((a / b - 1) * 100)
def spct(v): return (f'+{v}' if v > 0 else f'−{abs(v)}' if v < 0 else '0') + ' %'
fx = lambda v: str(round(v, 1)).replace('.', ',')
avg = lambda a: round(sum(a) / len(a))
def rank(a, v, low=True):
    s = sorted(a) if low else sorted(a, reverse=True)
    return s.index(v) + 1
def y_(l, sep=', ', last=' y '): l = list(l); return l[0] if len(l) == 1 else sep.join(l[:-1]) + last + l[-1]
cap = lambda t: t[:1].upper() + t[1:]
SEG_CAM = 'según cámaras' if CAMARAS else 'según planilla'

# ------------------------------------------------------------------ datos
RUN = X['corrida']; ANT = X['anterior']
RUNTXT = f'corrida {RUN["runId"]} ({RUN["rulesVersion"]}, {fmtn(RUN["eventCount"])} eventos de cámara, {RUN["movimientosRows"]} movimientos de planilla)'
ANT_DAYS = ANT['dias']; ANT_N = len(ANT_DAYS); ANT_LBL = f'{fdm(ANT_DAYS[0])}–{fdm(ANT_DAYS[-1])}'
ASP = ANT['sojaPeriodo']; atr = {t['key']: round(t['mediaMin']) for t in ASP['tramos'] if t['mediaMin'] is not None}
PUB = dict(r7_ops=ASP['camiones'], total=round(ASP['tiempoMedioMin']), p1=atr['PREINGRESO→CALADA'],
           ric=atr['INGRESO→PREINGRESO'] + atr['PREINGRESO→CALADA'] + atr['CALADA→EGRESO'],
           g_p1=ANT['girasol']['p1'], g_dt=ANT['girasol']['desc'] + ANT['girasol']['tara'],
           slz=atr['SL_INGRESO→SL_BALANZA_INGRESO'] + atr['SL_BALANZA_INGRESO→SL_VOLCABLE'] + atr['SL_VOLCABLE→SL_EGRESO'],
           g_total=ANT['girasol']['total'], g_ops=ANT['extras']['girasol']['ops'], liq=ANT['extras']['liquidos']['camiones'],
           pel_viajes=ANT['pelletHistorico'][-1]['viajes'], pel_ciclo=ANT['pelletHistorico'][-1]['ciclo'],
           cal=ANT['actividad']['calada_ricardone']['periodo']['camiones'], cal_h=ANT['actividad']['calada_ricardone']['periodo']['horasConActividad'],
           liq_cal=ANT['actividad']['calada_ricardone_liquidos']['periodo']['camiones'], sil=ANT['actividad']['silos_ricardone']['periodo']['camiones'],
           r29=ANT['extras']['r29']['ops'])

# soja R7 · cámaras por patente (r7-camaras.cjs) y recorridos de la corrida (final_circuits)
RC = X['r7']['camaras']; T7 = {k: v['mean'] for k, v in RC['tramos'].items()}; N7 = {k: v['n'] for k, v in RC['tramos'].items()}
TD = RC['tramosDia']
K7 = X['r7']['calibracion']; R7P = JC(K7['archivo'])                   # misma medición sobre días con planilla
TP = {k: v['mean'] for k, v in R7P['tramos'].items()}
CAL_LBL = f'{fdm(K7["dias"][0])}–{fdm(K7["dias"][-1])}'
# con planilla de la semana (r7-camaras.cjs la cruza sola cuando data/movimientos trae esos días) el conteo pasa a ser el de la planilla
PR7 = RC.get('calibracion') if not CAMARAS and (RC.get('calibracion') or {}).get('planillaR7') else None
APR = '' if PR7 else '≈ '
R7 = dict(viajes=RC['viajes'], est=PR7['planillaR7'] if PR7 else round(RC['viajes'] / K7['cobertura']), etl=X['r7']['etlRecorridos'],
          dia=[PR7['planillaPorDia'][d] for d in DAYS] if PR7 else X['r7']['etlPorDia'],
          viajesDia=[RC['porDia'][d] for d in DAYS], total=T7['total'], ric=T7['ric'], slz=T7['sl'], p1=T7['playa1'],
          totDia=[TD[d]['total']['mean'] for d in DAYS], ricDia=[TD[d]['ric']['mean'] for d in DAYS], slzDia=[TD[d]['sl']['mean'] for d in DAYS],
          totN=[TD[d]['total']['n'] for d in DAYS])
CAMT = T7['total']                                                    # puerta a puerta por cámaras (patente)
PQS = X['paquete']['tiempos']['soja']                                 # con planilla: salida − ingreso de cada operación R7 (como los comités anteriores)
P2P_PLAN = not CAMARAS and PQS['periodo'].get('camiones') and PQS['periodo'].get('tiempoMedioMin')
if P2P_PLAN:
    R7['total'] = round(PQS['periodo']['tiempoMedioMin'])
    R7['totDia'] = [round(PQS['porDia'].get(d, {}).get('tiempoMedioMin') or 0) or c for d, c in zip(DAYS, R7['totDia'])]
P2P_SRC = (f'planilla (salida − ingreso de {fmtn(PQS["periodo"]["tiempoMedioN"])} operaciones R7; por cámaras da {CAMT})' if P2P_PLAN
           else f'cámaras por patente ({N7["total"]} viajes; en {CAL_LBL} el mismo método dio {K7["p2pCamara"]} contra {K7["p2pPlanilla"]} de la planilla)')
TK7 = [('ingreso', 'INGRESO→PREINGRESO'), ('playa1', 'PREINGRESO→CALADA'), ('salida', 'CALADA→EGRESO'), ('interplanta', 'EGRESO→SL_INGRESO'),
       ('playaOsl', 'SL_INGRESO→SL_BALANZA_INGRESO'), ('descarga', 'SL_BALANZA_INGRESO→SL_VOLCABLE'), ('egreso', 'SL_VOLCABLE→SL_EGRESO')]
_pt = {t['key']: t for t in PQS['periodo'].get('tramos', []) if isinstance(t, dict)}
RUN_T = bool(P2P_PLAN) and all((_pt.get(k) or {}).get('mediaMin') is not None for _, k in TK7)   # tiempos de la corrida, como lo publicado
if RUN_T:
    for a, k in TK7: T7[a] = round(_pt[k]['mediaMin']); N7[a] = _pt[k]['n']
    T7['ric'] = T7['ingreso'] + T7['playa1'] + T7['salida']; T7['sl'] = T7['playaOsl'] + T7['descarga'] + T7['egreso']
    N7['total'] = PQS['periodo']['tiempoMedioN']
    R7.update(ric=T7['ric'], slz=T7['sl'], p1=T7['playa1'])
    def _dsum(d, ks):
        tt = {t['key']: t for t in PQS['porDia'].get(d, {}).get('tramos', []) if isinstance(t, dict)}
        vs = [(tt.get(k) or {}).get('mediaMin') for k in ks]
        return round(sum(vs)) if None not in vs else None
    _rk, _sk = [k for _, k in TK7[:3]], [k for _, k in TK7[4:]]
    R7['ricDia'] = [_dsum(d, _rk) or c for d, c in zip(DAYS, R7['ricDia'])]
    R7['slzDia'] = [_dsum(d, _sk) or c for d, c in zip(DAYS, R7['slzDia'])]
    R7['totN'] = [PQS['porDia'].get(d, {}).get('tiempoMedioN', 0) for d in DAYS]
r7_dia, r7_dia_prev = R7['est'] / N, PUB['r7_ops'] / ANT_N
LIVIANA = r7_dia < 0.9 * r7_dia_prev; PESADA = r7_dia > 1.1 * r7_dia_prev
QN = {q: sum(v) for q, v in RC['cuartos'].items()}; qd = RC['cuartos']
if P2P_PLAN:   # cuartos de la planilla: todas las operaciones R7, no la muestra de cámaras
    qd = {q: [PQS['porDia'].get(d, {}).get('porCuarto', {}).get(q, 0) for d in DAYS] for q in ('Q1', 'Q2', 'Q3', 'Q4')}
    QN = {q: sum(v) for q, v in qd.items()}
# girasol (metricas-camaras.cjs: calada → volcable de Ricardone por patente) · volcable 2 (paquete)
GM = X['girasol']['metricas']; GT_ = {k: v['mean'] for k, v in GM['tiempos'].items()}; GN_ = {k: v['n'] for k, v in GM['tiempos'].items()}
GA = ANT['metricas']['gir']; GAT = {k: v['mean'] for k, v in GA['tiempos'].items()}
PXA = X['paquete']['actividad']
def act(key):
    a = PXA[key]; per = a['periodo']
    return {'camiones': per['camiones'], 'horas': per['horasConActividad'], 'pico': per['picoCamiones'], 'picoLabel': per['picoLabel'],
            'porCalle': {c['camara']: c['camiones'] for c in per['porCalle']}, 'porDia': [a['porDia'].get(d, {}).get('camiones', 0) for d in DAYS],
            'calleDia': {d: {c['camara']: c['camiones'] for c in a['porDia'].get(d, {}).get('porCalle', [])} for d in DAYS}}
CAL = act('calada_ricardone'); LIQ = act('calada_ricardone_liquidos'); CSL = act('calada_san_lorenzo'); VR = act('volcable_ricardone'); SIL = act('silos_ricardone')
SI = JC('silos-internos.json') if not CAMARAS and os.path.exists(os.path.join(CAL_DIR, 'silos-internos.json')) else None
SI_OK = bool(SI and SI['internos'])
def silos_txt(internos):   # silos con al menos el 10 % de los viajes: «el silo 8» / «los silos 7 y 8»
    n = collections.Counter(); [n.update(c['silos']) for c in internos]; t = sum(n.values()) or 1
    ks = sorted(k for k, v in n.items() if v / t >= 0.1)
    return f'el silo {ks[0]}' if len(ks) == 1 else 'los silos ' + ', '.join(ks[:-1]) + ' y ' + ks[-1] if ks else ''
SI_SILOS = silos_txt(SI['internos']) if SI_OK else ''
num_txt = lambda n: ['ningún', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] if n <= 10 else str(n)
SIL_INT = SIL['camiones'] > 0 and not X['r29']['metricas']['total']   # actividad en silos sin transile al puerto = transiles internos
GI = dict(rec=VR['camiones'], dia=VR['porDia'], viajes=GM['total'], p1=GT_.get('p1'), calVolc=GT_.get('calVolc'), desc=GT_.get('descarga'), tara=GT_.get('tara'), total=GT_.get('total'))
PQG = X['paquete']['tiempos']['girasol']
GOPS = PQG.get('operaciones') if not CAMARAS and PQG.get('operaciones') else None    # con planilla: operaciones R5+R6
GOPS_DIA = [PQG['porDia'].get(d, {}).get('camiones', 0) for d in DAYS] if GOPS else None
GMV = X['girasol'].get('movimientos') or {}
GOPS_SGC = 0
if not CAMARAS and GMV.get('balanzaSgc') and GMV.get('operaciones'):
    # balanza SGC sin plataforma: el ETL no resuelve R5/R6, se cuentan los ingresos de girasol de Ricardone
    GOPS, GOPS_DIA, GOPS_SGC = GMV['operaciones'], [GMV['porDia'].get(d, 0) for d in DAYS], GMV['balanzaSgc']
GSUM = 3 + (GI['p1'] or 0) + (GI['calVolc'] or 0) + (GI['tara'] or 0)    # suma de tramos (ingreso 3 + Playa 1 + calada → volcable + tara)
GIR_OK = None not in (GI['p1'], GI['calVolc'], GI['tara'], GI['total']) and GN_.get('total', 0) >= 10   # con menos de 10 camiones medidos no se publican tramos
# volcables del puerto: camiones distintos leídos por cada cámara de volcable, por día calendario (metricas-camaras.cjs)
VOL = {k: X['sectores']['calles'].get(k, [0] * N) for k in ('V1', 'V2', 'V3', 'V4', 'V5')}
VOL_TOT = sum(sum(v) for v in VOL.values())
# pellet (pellet-camaras.cjs)
PE = X['pellet']['camaras']; PK = X['pellet']['calibracion']; PEP = JC(X['pellet']['calibracionArchivo'])
PPE = PE.get('calibracion') if not CAMARAS and (PE.get('calibracion') or {}).get('planillaEgresosPellet') else None   # planilla de la semana
PEL_N = PPE['planillaEgresosPellet'] if PPE else PE['viajes']               # viajes: planilla si hay, si no leídos por cámaras
PEL_CAM = PPE.get('planillaCamiones', PE['camiones']) if PPE else PE['camiones']
PEL_U = 'viajes' if PPE else 'viajes leídos'
PEL_CHICO = (PEL_N if PPE else PE['viajes'] / PK['recall']) < min(o['viajes'] for o in ANT['pelletHistorico'])
pt = {k: v['mean'] for k, v in PE['tramos'].items()}; ptn = {k: v['n'] for k, v in PE['tramos'].items()}
ptp = {k: v['mean'] for k, v in PEP['tramos'].items()}
pdays = [d for d in DAYS if PE['viajesDia'][d]]
PI = JC('pellet-informe.json') if not CAMARAS and os.path.exists(os.path.join(CAL_DIR, 'pellet-informe.json')) else None
if PI:
    _a, _b = PI['actual'], PI['anterior']
    PEL_N, PEL_CAM, PEL_U = _a['viajes'], _a['camiones'], 'viajes'
    pt = dict(_a['tramos'], ric=_a['ric'], sl=_a['sl'], ciclo=_a['ric'] + _a['tramos']['interplanta'] + _a['sl'])
    ptp = dict(_b['tramos'], ric=_b['ric'], sl=_b['sl'], ciclo=_b['ric'] + _b['tramos']['interplanta'] + _b['sl'])
    pdays = [d for d in DAYS if d in _a['porDia']]
PANT = 'la tanda del 30/09–02/10' if PI else 'el operativo anterior'
pl_blk = [b for b in PE['bloques'] if b['viajes'] >= 5]
PEL_OP = bool(PI or pl_blk)   # hubo operativo de transile (no viajes sueltos)
# líquidos
LC = X['liquidos']['camaras']; LK = X['liquidos']['calibracion']; LKV = X['liquidos']['calibracionVisitas']; LCR = X['liquidos']['criterioAnterior']; LCW = X['liquidos'].get('criterioSemana') if not CAMARAS else None
LKD = len(K7['dias'])
r29 = X['r29']

# series de comités (rótulo = fecha del comité); «Ant.» = comité anterior, «Actual» = esta semana
# serie publicada hasta el comité anterior: la trae su publicado.json (comités armados con este script) o la fija de junio–septiembre
SER = ANT.get('series') or dict(
    weeks=['17/6', '24/6', '8/7', '15/7', '24/7', '30/7', '7/8', '13/8', '21/8', '28/8', '4/9', '11/9', '18/9', '25/9'],
    TOT=[338, 316, 383, 304, 445, 389, 421, 346, 368, 296, 379, 276, 334, 303], P1=[94, 113, 145, 114, 171, 181, 120, 101, 130, 112, 140, 87, 126, 89],
    SLZ=[196, 150, 175, 125, 199, 143, 213, 176, 198, 153, 199, 160, 180, 184], GT=[315, 287, 317, 306, 351, 361, 347, 241, 289, 353, 430, 319, 382, 228],
    GP=[107, 105, 122, 117, 140, 137, 138, 80, 99, 163, 190, 116, 133, 78], GD=[180, 159, 170, 166, 188, 208, 186, 110, 146, 152, 215, 155, 208, 124])
weeks = SER['weeks'] + ['Ant.']
TOT, P1, SLZ = SER['TOT'] + [PUB['total']], SER['P1'] + [PUB['p1']], SER['SLZ'] + [PUB['slz']]
GT, GP, GD = SER['GT'] + [PUB['g_total']], SER['GP'] + [PUB['g_p1']], SER['GD'] + [PUB['g_dt']]

# ------------------------------------------------------------------ helpers de maqueta (iguales a gen_comite_logistica_rango.py)
slides = []
def footer(n, dark=False):
    nva = NVA_L if dark else NVA_G; btz = BTZ_L if dark else BTZ; col = '#C9D8CE' if dark else BODY
    return (f'<img src="{nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">'
            f'<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:{col}">Comité de Logística Nodo Sur · {LBL} · §N§</p>'
            f'<img src="{btz}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">')
def add(id, html): slides.append((id, html))
def section(id, body, notes, bg=BG, gap=40, extra=''):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:{TEXT}; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:{gap}px{extra}">{body}{footer(0)}<aside>{notes}</aside></section>')
def pill(t, bg): return f'<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:{bg}; padding:6px 18px; border-radius:999px">{t}</p>'
def tagcam(): return f'<p style="font-size:24px; font-weight:600; color:{BODY}; border:2px solid {GREY}; padding:4px 16px; border-radius:999px">Según cámaras</p>' if CAMARAS else ''
def head(tag, title, tagbg=GDK, size=64, cam=False):
    return (f'<div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">{pill(tag, tagbg)}{tagcam() if cam else ""}</div>'
            f'<h2 style="font-size:{size}px; font-weight:600; line-height:1.1; color:{TEXT}">{title}</h2></div>')
def nota(t): return f'<p style="font-size:22px; line-height:1.35; color:#7A8A80">{t}</p>'
def p(t, size=30, color=BODY, extra=''): return f'<p style="font-size:{size}px; line-height:1.4; color:{color}{extra}">{t}</p>'
def key(t, size=26): return f'<p style="font-size:{size}px; line-height:1.4; color:{GDK}; font-weight:600; border-left:6px solid {GMID}; padding:4px 0px 4px 20px">{t}</p>'
def legend(items, extra=''):
    s = ''.join(f'<div style="width:28px; height:28px; background:{c}; border-radius:6px"></div><p style="font-size:24px; color:{TEXT}; white-space:nowrap">{n}</p><div style="width:16px"></div>' for n, c in items)
    return f'<div style="display:flex; flex-direction:row; gap:12px; align-items:center">{s}{extra}</div>'
def spark(vals, w, h, col, lastcol, x0=10, y0=10):
    lo, hi = min(vals), max(vals); n = len(vals)
    pts = [(x0 + i * (w - 2 * x0) / (n - 1), y0 + (hi - v) / (hi - lo or 1) * (h - 2 * y0)) for i, v in enumerate(vals)]
    return (f'<svg aria-label="Evolución de {n} semanas" viewBox="0 0 {w} {h}" width="{w}" height="{h}" style="width:{w}px; height:{h}px">'
            f'<polyline fill="none" stroke="{col}" stroke-width="4" stroke-linejoin="round" points="' + ' '.join(f'{x:.0f},{y:.0f}' for x, y in pts) + '"/>'
            f'<circle cx="{pts[-1][0]:.0f}" cy="{pts[-1][1]:.0f}" r="8" fill="{lastcol}"/></svg>')
def minibars(vals, dark, light):
    mx = max(vals) or 1; out = ''; step = 342 / len(vals); bw = round(step * 0.62)
    for i, v in enumerate(vals):
        x = round(i * step + (step - bw) / 2); hgt = round(v / mx * 52)
        if v == 0: out += f'<rect x="{x}" y="66" width="{bw}" height="2" fill="{LINE}"/>'
        else: out += f'<rect x="{x}" y="{68 - hgt}" width="{bw}" height="{max(3, hgt)}" rx="3" fill="{dark if v == mx else light}"/>'
        out += f'<text x="{x + bw / 2:.0f}" y="96" text-anchor="middle" font-size="24" fill="{BODY}" font-family="IBM Plex Sans, Arial, sans-serif">{ini[i]}</text>'
    return f'<svg aria-label="Por día, del {LBL}" viewBox="0 0 342 100" width="342" height="100" style="width:342px; height:100px">{out}</svg>'
def daybars(vals, labels, colfn, H=360, bw=64, sub=None):
    mx = max(vals) or 1
    return ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600; color:{TEXT}; text-align:center">{v}</p><div style="width:{bw}px; height:{max(6, round(v / mx * H))}px; background:{colfn(i, v)}; border-radius:8px 8px 0 0"></div><p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center; white-space:nowrap">{labels[i]}</p>' + (f'<p style="font-size:24px; color:{BODY}; text-align:center; white-space:nowrap">{sub[i]}</p>' if sub else '') + '</div>' for i, v in enumerate(vals))
def note(big, txt, band, col=TEXT):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:8px solid {band}; border-radius:14px; padding:12px 20px"><p style="font-size:44px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; line-height:1.3; color:{BODY}">{txt}</p></div>'
def divider(id, num, title, sub, bg, accent):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:#F1F6F2; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px; gap:24px"><div style="flex:1"></div><p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p><h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1><p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p><div style="flex:1"></div>{footer(0, True)}</section>')
def tramos(cols_def, vals, colors, numcols, brackets, total_w=1664):
    s = sum(vals); ws = [round(v / s * total_w) for v in vals]; ws[vals.index(max(vals))] += total_w - sum(ws)
    grid = f'<div style="display:grid; grid-template-columns:repeat({len(vals)}, 1fr); gap:12px">' + ''.join(
        f'<div style="display:flex; flex-direction:column; gap:8px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="height:10px; background:{colors[i]}; border-radius:5px"></div><p style="font-size:24px; line-height:1.35; color:{BODY}">{b}</p></div>'
        for i, (a, b) in enumerate(cols_def)) + '</div>'
    nums = ''.join(f'<p style="width:{w}px; font-size:36px; font-weight:600; color:{numcols[i]}; text-align:center; white-space:nowrap">{v}</p>' for i, (w, v) in enumerate(zip(ws, vals)))
    bar = ''.join(f'<div style="width:{w}px; height:56px; background:{colors[i]}{"" if i == 0 else "; border-left:3px solid #F5F8F4"}"></div>' for i, w in enumerate(ws))
    br = ''
    for kind, a, b, label, col, tcol in brackets:
        w = sum(ws[a:b])
        br += f'<div style="width:{w}px"></div>' if kind == 'gap' else f'<div style="width:{w}px; display:flex; flex-direction:column; gap:8px; border-top:4px solid {col}; padding:10px 0px 0px 0px"><p style="font-size:28px; font-weight:600; color:{tcol}; text-align:center">{label}</p></div>'
    return grid + f'<div style="display:flex; flex-direction:column; gap:8px"><div style="display:flex; flex-direction:row">{nums}</div><div style="display:flex; flex-direction:row; border-radius:8px; overflow:hidden">{bar}</div><div style="display:flex; flex-direction:row; gap:0px">{br}</div></div>'
def hstack(rows, width=1000, bh=44, gap=10, c1=None, c2=None, lab_w=150, ticks=True):
    c1 = c1 or GMID; c2 = c2 or VMID
    mx = max((a or 0) + (b or 0) for _, a, b in rows) or 1
    top = 100 * ((mx + 99) // 100)
    out = ''
    for lab, a, b in rows:
        wa, wb = round((a or 0) / top * width), round((b or 0) / top * width)
        seg = lambda w, v, c: (f'<div style="width:{w}px; height:{bh}px; background:{c}; display:flex; flex-direction:row; align-items:center; justify-content:end; padding:0px 10px 0px 0px"><p style="font-size:24px; font-weight:700; color:#FFFFFF">{v}</p></div>' if v else '')
        out += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:{lab_w}px; font-size:26px; font-weight:600; color:{TEXT}; text-align:right; white-space:nowrap">{lab}</p>'
                f'<div style="display:flex; flex-direction:row; border-left:2px solid {TEXT}">{seg(wa, a, c1)}{seg(wb, b, c2)}</div></div>')
    if ticks:
        step = 100 if top <= 500 else 200
        tk = ''.join(f'<p style="width:{round(width * step / top)}px; font-size:24px; color:{BODY}">{v}</p>' for v in range(0, top, step))
        out += f'<div style="display:flex; flex-direction:row; gap:16px"><p style="width:{lab_w}px"></p><div style="display:flex; flex-direction:row">{tk}<p style="font-size:24px; color:{BODY}">{top}</p></div></div>'
    return f'<div style="display:flex; flex-direction:column; gap:{gap}px">{out}</div>'
HC1, HC2 = GMID, VMID
def kcard(label, big, band, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {band}; border-radius:14px; padding:24px 32px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p><p style="font-size:56px; font-weight:600; line-height:1.1; color:{col}">{big}</p></div>'
def kpi(label, big, col, delta, tone, vals):
    sp = spark(vals, 300, 80, GMID, GDK) if vals else ''
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p><div style="flex:1"></div>{sp}</div>')
def linechart(vals, labels, col, vmin, vmax, avgv, X0=168, Y0=380, W=1000, H=400, hollow=()):
    n = len(vals)
    xy = lambda i, v: (X0 + round(i * W / (n - 1)), Y0 + round((vmax - v) / (vmax - vmin) * H))
    out = f'<svg aria-label="Serie por comité, {labels[0]} a {labels[-1]}" viewBox="0 0 {W + 40} {H + 40}" width="{W + 40}" height="{H + 40}" style="position:absolute; left:{X0 - 20}px; top:{Y0 - 20}px; width:{W + 40}px; height:{H + 40}px">'
    for gl in range(5): out += f'<line x1="20" y1="{20 + gl * 100}" x2="{W + 20}" y2="{20 + gl * 100}" stroke="{LINE}" stroke-width="2"/>'
    ay = xy(0, avgv)[1] - Y0 + 20
    out += f'<line x1="20" y1="{ay}" x2="{W + 20}" y2="{ay}" stroke="{BODY}" stroke-width="2" stroke-dasharray="8 8"/>'
    pts = [xy(i, v) for i, v in enumerate(vals)]
    out += f'<polyline fill="none" stroke="{col}" stroke-width="5" stroke-linejoin="round" points="' + ' '.join(f'{x - X0 + 20},{y - Y0 + 20}' for x, y in pts) + '"/>'
    out += ''.join((f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="11" fill="{BG}" stroke="{col}" stroke-width="5"/>' if i in hollow else
                    f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="{11 if i == n - 1 else 6}" fill="{col}"/>') for i, (x, y) in enumerate(pts)) + '</svg>'
    for i, (x, y) in enumerate(pts):
        out += f'<p style="position:absolute; left:{x - 40}px; top:{y - 48}px; width:80px; text-align:center; font-size:24px; font-weight:600; color:{col}">{vals[i]}</p>'
        out += f'<p style="position:absolute; left:{x - 44}px; top:{Y0 + H + 24}px; width:88px; text-align:center; font-size:24px; color:{BODY}{"; font-weight:600" if i == n - 1 else ""}">{labels[i]}</p>'
    return out
def ctx(label, big, vals, col, sub):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:14px; padding:20px 24px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:end; justify-content:space-between; gap:16px"><p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>{spark(vals, 220, 70, col, col)}</div><p style="font-size:24px; color:{BODY}">{sub}</p></div>')
def box(big, lab, sub=''):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {PELM}; border-radius:14px; padding:18px 26px"><p style="font-size:24px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:56px; font-weight:600; line-height:1.05; color:{PEL}">{big}</p>' + (f'<p style="font-size:24px; color:{BODY}">{sub}</p>' if sub else '') + '</div>'
def lbox(lab, big, sub, band, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:80px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:26px; color:{BODY}">{sub}</p></div>'
def occ(a, sub, pc_, col): return f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div><p style="font-size:44px; font-weight:600; color:{col}">{pc_} %</p></div>'
def hbar(rows, width=620, col=BLU, lab_w=420, sub_w=None):
    """rows = [(etiqueta, sub, valor, color)] → barras horizontales con la cifra al final."""
    mx = max(v for _, _, v, _ in rows) or 1
    return '<div style="display:flex; flex-direction:column; gap:14px">' + ''.join(
        f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><div style="width:{lab_w}px; display:flex; flex-direction:column; gap:2px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{a}</p>'
        + (f'<p style="font-size:24px; color:{BODY}">{s}</p>' if s else '') + f'</div><div style="width:{max(8, round(v / mx * width))}px; height:40px; background:{c or col}; border-radius:0px 8px 8px 0px"></div>'
        f'<p style="font-size:30px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(v)}</p></div>' for a, s, v, c in rows) + '</div>'

# ------------------------------------------------------------------ 1 portada
modo_txt = ('' if not CAMARAS else 'Versión solo cámaras: la planilla de movimientos de estos días todavía no llegó' if X['modo'] == 'camaras' else f'Versión con cámaras: la planilla está incompleta (último Excel {PLAN.get("ultimoExcel")})')
add('portada', f'<section id="portada" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:{GDK}; font-family:{FONT}; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(14,40,28,0.82); border-left:6px solid #9CCBAE; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(30,18,52,0.82); border-left:6px solid #B9A8E0; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Logística · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Logística Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">{LBL_LARGO}</p><p style="width:700px; font-size:26px; line-height:1.35; color:#9CCBAE">{modo_txt}</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Logística Nodo Sur, semana {LBL} (lunes a domingo, {N} días). '
    + (f'Sin planilla de movimientos para estos días: todas las cifras salen de las cámaras ({RUNTXT}) y de los scripts por patente de scripts/estado-planta. Cada lámina dice su denominador y cómo se calibró contra la planilla de {CAL_LBL}. Cuando llegue la planilla se reemplazan los conteos.' if CAMARAS else RUNTXT)
    + f' Comparativos contra el comité anterior ({ANT_LBL}, {ANT_N} días): las cantidades se comparan por día.</aside></section>')

# ------------------------------------------------------------------ 2 resumen planta
def pcard(tag, tagcol, band, big, unit, line2, vals, dark, light, foot):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:22px 26px">'
            f'<p style="font-size:24px; font-weight:600; color:{tagcol}; text-transform:uppercase; letter-spacing:1px">{tag}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:10px"><p style="font-size:60px; font-weight:600; line-height:1.05; color:{tagcol}">{big}</p><p style="font-size:24px; color:{BODY}">{unit}</p></div>'
            f'<p style="font-size:24px; color:{TEXT}">{line2}</p>{minibars(vals, dark, light)}' + (f'<p style="font-size:24px; line-height:1.3; color:{BODY}">{foot}</p>' if CAMARAS else '') + '</div>')
def strip(t1, t2): return f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; border-left:8px solid #9AA8A0; padding:4px 0px 4px 18px"><p style="font-size:24px; font-weight:600; color:{TEXT}">{t1}</p><p style="font-size:24px; color:{BODY}">{t2}</p></div>'
imx = max(range(N), key=lambda i: R7['dia'][i])
_vsl = X['paquete']['actividad']['volcable_san_lorenzo']['porDia']
VPL0 = {f'V{n}': [sum(c['camiones'] for c in _vsl.get(d, {}).get('porCalle', []) if c['camara'] == f'Volcable {n}') for d in DAYS] for n in range(1, 6)} if not CAMARAS else None
if VPL0 and not sum(sum(v) for v in VPL0.values()): VPL0 = None
LQV = LC['visitas']; lq_tot = LQV['RIC'] + LQV['TER']
lq_dia = [LC['porDia'][d]['RIC'] + LC['porDia'][d]['TER'] for d in DAYS]
pel_dia = [PI['actual']['porDia'].get(d, {}).get('viajes', 0) for d in DAYS] if PI else [PE['viajesDia'][d] for d in DAYS]
section('resumen-planta', head('Planta', 'Qué entró a la planta, cuándo y cuánto tardó', VIO, cam=True)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + pcard('Soja · R7', GDK, GMID, f'{APR}{fmtn(R7["est"])}', 'operaciones' if PR7 else 'camiones', f'<b>{R7["total"]} min</b> puerta a puerta', R7['dia'], GDK, GMID, f'{days[imx]}: el día con más ' + ('operaciones.' if PR7 else 'recorridos.'))
    + pcard('Girasol', '#7A5608', '#E0A526', fmtn(GOPS or GI['rec']), 'operaciones' if GOPS else 'recorridos', (f'<b>{GSUM if not CAMARAS else GI["total"]} min</b> en planta' if GIR_OK else 'pocos camiones medidos'), GOPS_DIA or GI['dia'], '#7A5608', '#E0A526', f'{GI["rec"]} recorridos de cámara por la volcable 2.' if GOPS else 'Recorridos de la cámara de la volcable 2.')
    + (pcard('Líquidos', BLU, BMID, fmtn(LCW['total']['n']), 'movimientos', f'Terminal {sum(v["n"] for k, v in LCW["porPlantaSentido"].items() if k.startswith("TERMINAL"))} · Ricardone {sum(v["n"] for k, v in LCW["porPlantaSentido"].items() if k.startswith("RICARDONE"))}',
          [sum(n for pl in LCW['porDia'][d].values() for n in pl.values()) for d in DAYS], BLU, BMID, 'Planilla, criterio por producto (sección 04).') if LCW else
       pcard('Líquidos', BLU, BMID, fmtn(lq_tot), 'visitas', f'Terminal {LQV["TER"]} · Ricardone {LQV["RIC"]}', lq_dia, BLU, BMID, 'Estimación por cámaras, ver sección 04.'))
    + pcard('Pellet', PEL, PELM, fmtn(PEL_N) if PEL_OP else '0', PEL_U if PEL_OP else 'operativos', f'<b>{pt["ciclo"]} min</b> de ciclo' if PEL_OP else 'Sin transile al puerto', pel_dia, PEL, PELM, (f'{"Operativo corto" if PEL_CHICO else "Operativo"}: {y_([full[iD[d]] for d in pdays])}.') if pdays else 'Sin transile de pellet.')
    + '</div>' + (('<div style="display:flex; flex-direction:row; gap:32px">'
    + strip('Calada sólida Ricardone', f'{fmtn(CAL["camiones"])} recorridos de cámara · activa el {round(CAL["horas"] / HOURS * 100)} % de las horas')
    + (strip('Volcables puerto', f'{fmtn(sum(sum(v) for v in VPL0.values()))} descargas · ' + ' y '.join(f'{k} {round(sum(VPL0[k]) / sum(sum(v) for v in VPL0.values()) * 100)} %' for k in sorted(VPL0, key=lambda k: -sum(VPL0[k]))[:2])) if VPL0 else
       strip('Volcables puerto', f'{fmtn(VOL_TOT)} camiones leídos · ' + ' y '.join(f'{k} {round(sum(VOL[k]) / VOL_TOT * 100)} %' for k in sorted(VOL, key=lambda k: -sum(VOL[k]))[:2])))
    + strip('Silos Ricardone', f'{fmtn(SI["viajes"])} viajes de transile interno desde {SI_SILOS} · sin envío al puerto' if SI_OK else f'{fmtn(SIL["camiones"])} recorridos de cámara · transiles internos, sin envío al puerto' if SIL_INT else f'{fmtn(SIL["camiones"])} recorridos de cámara · sin transile R29' if not r29['metricas']['total'] else f'{fmtn(SIL["camiones"])} recorridos · {r29["metricas"]["total"]} transiles R29')
    + '</div>')),
    (f'Soja: {fmtn(R7["est"])} operaciones R7 de la planilla de la semana (TERMINAL · INGRESO · SOJA por volcable, día operativo del ingreso); por cámaras se leyeron {R7["viajes"]} viajes completos. ' if PR7 else '') + f'Semana {LBL} ({N} días), {RUNTXT}. Soja por cámaras: ≈ {fmtn(round(RC["viajes"] / K7["cobertura"]))} camiones = {R7["viajes"]} viajes completos leídos por patente (calada → egreso → ingreso y salida de San Lorenzo; r7-camaras.cjs) divididos por la cobertura medida en {CAL_LBL} ({K7["camara"]} viajes contra {K7["planilla"]} operaciones R7 de la planilla, {round(K7["cobertura"] * 100)} %). '
    f'La corrida da {R7["etl"]} recorridos R7 en final_circuits, una cifra del mismo orden. Puerta a puerta {R7["total"]} min, {P2P_SRC}. Barras de soja: ' + ('operaciones R7 de la planilla' if PR7 else 'recorridos R7 de la corrida') + f' por día operativo ({", ".join(map(str, R7["dia"]))}). '
    f'Girasol: {GI["rec"]} recorridos de la cámara de la volcable 2 (paquete del dashboard; la volcable 1 no aparece en la planilla desde el 28/09); en {CAL_LBL} esa cámara leyó 38 camiones contra 42 operaciones R6 de la planilla. Tiempo en planta = pre-ingreso → balanza de egreso, media de {GN_["total"]} camiones medidos por patente. '
    f'Líquidos: visitas de camión a la zona de líquidos (liquidos-camaras.cjs), no movimientos; calibración en la sección 04. Pellet: viajes de transile leídos por patente (pellet-camaras.cjs); en {fdm(PK["planillaPorDia"] and list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])} las cámaras vieron {PK["emparejados"]} de {PK["planillaEgresosPellet"]} viajes de la planilla ({round(PK["recall"] * 100)} %). '
    f'Calada sólida: {fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} de {HOURS} h. Volcables puerto: camiones distintos leídos por día en cada cámara de volcable (incluye el pellet de la V4). Silos: {SIL["camiones"]} recorridos.', gap=28)

# ------------------------------------------------------------------ 3 día a día (camiones adentro)
adentro = lambda x: max(1, round(x)) if x > 0 else 0   # con camiones en el día, al menos 1 adentro
ricA = [adentro(c / 24 * (m or 0) / 60) for c, m in zip(CAL['porDia'], R7['ricDia'])]
slA = [adentro(c / 24 * (m or 0) / 60) for c, m in zip(R7['dia'], R7['slzDia'])]
totA = [a + b for a, b in zip(ricA, slA)]
mxA = max(totA) or 1
cols = ''
for i in range(N):
    hs, hr = round(slA[i] / mxA * 330), round(ricA[i] / mxA * 330)
    cols += (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:end; align-items:center; gap:0px"><p style="font-size:28px; font-weight:600; line-height:1.2; color:{TEXT}; padding:0px 0px 6px 0px">{totA[i]}</p>'
             f'<div style="width:68px; display:flex; flex-direction:column; border-radius:6px 6px 0px 0px; overflow:hidden">'
             f'<div style="height:{max(hs, 18)}px; background:{VMID}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hs >= 24 else 0.75}; color:#F1F6F2">{slA[i]}</p></div>'
             f'<div style="height:{max(hr, 18)}px; background:{GDK}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hr >= 24 else 0.75}; color:#F1F6F2">{ricA[i]}</p></div></div>'
             f'<div style="align-self:stretch; display:flex; flex-direction:column; align-items:center; gap:2px; border-top:2px solid {GREY}; padding:8px 0px 0px 0px"><p style="font-size:24px; font-weight:600; line-height:1.2; color:{TEXT}; white-space:nowrap">{days[i]}</p><p style="font-size:24px; line-height:1.2; color:{BODY}">{R7["dia"][i]}</p></div></div>')
iA = max(range(N), key=lambda i: totA[i]); iB = min(range(N), key=lambda i: totA[i])
section('dia-a-dia', head('Planta', f'El {full[iA]} fue el día con más camiones adentro de la planta', VIO, 60, cam=True)
    + p('<b>Camiones adentro:</b> cuántos hay en promedio a cualquier hora. Sube si entran más o si tardan más en salir.', 26)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:40px; padding:16px 0px 0px 0px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Ricardone', GDK), ('San Lorenzo', VMID)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}; white-space:nowrap">Abajo: recorridos de soja R7 del día</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:0px">{cols}</div></div>'
    + '<div style="width:440px; display:flex; flex-direction:column; justify-content:center; gap:14px">'
    + note(totA[iA], f'camiones adentro el {full[iA]}: {ricA[iA]} en Ricardone y {slA[iA]} en San Lorenzo.', VIO)
    + note(f'{min(totA)}–{max(totA)}', f'por día en la semana; el más bajo, el {full[iB]}.', GLT)
    + note(slA[iA], f'en San Lorenzo el {full[iA]}: el puerto tardó {R7["slzDia"][iA]} min por camión.', GDK, GDK)
    + '</div></div>',
    'Camiones adentro = camiones del día por hora (camiones / 24) × horas que pasa cada uno adentro (ley de Little). '
    f'Ricardone: recorridos por la calada sólida del día ({", ".join(map(str, CAL["porDia"]))}) por el tiempo de la soja en Ricardone, pre-ingreso → egreso ({", ".join(map(str, R7["ricDia"]))} min). '
    f'San Lorenzo: recorridos R7 de la corrida por día operativo ({", ".join(map(str, R7["dia"]))}) por el tiempo de la soja en San Lorenzo, ingreso → salida ({", ".join(map(str, R7["slzDia"]))} min). '
    f'Por día (Ricardone / San Lorenzo / total): ' + ', '.join(f'{days[i].lower()} {ricA[i]}/{slA[i]}/{totA[i]}' for i in range(N)) + '. '
    f'Tiempos medidos por patente con cámaras (r7-camaras.cjs) sobre los viajes R7 de cada día ({", ".join(map(str, R7["totN"]))}). Con la planilla, San Lorenzo pasa a contar descargas R7 por volcable, como en el comité anterior.', gap=20)

# ------------------------------------------------------------------ soja
divider('div-soja', '01', 'Soja', 'Circuito R7 Ricardone → San Lorenzo: la semana día por día, por planta y por horario.', GDK, GLT)
v7 = [T7['ingreso'], T7['playa1'], T7['salida'], T7['interplanta'], T7['playaOsl'], T7['descarga'], T7['egreso']]
n7 = [N7['ingreso'], N7['playa1'], N7['salida'], N7['interplanta'], N7['playaOsl'], N7['descarga'], N7['egreso']]
ric_s, sl_s = sum(v7[:3]), sum(v7[4:])
d_tot = R7['total'] - PUB['total']
section('tramos-r7', head('Soja · R7', 'Tiempos medios por tramo', cam=True)
    + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('Salida', 'Calada → Salida Ricardone'), ('Interplanta', 'Salida Ricardone → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable puerto'), ('Egreso', 'Volcable puerto → Salida SLZ')],
             v7, [GLT, GDK, GMID, GREY, VIO, VMID, VXLT], [TEXT, GDK, TEXT, TEXT, VIO, VMID, TEXT],
             [('b', 0, 3, f'Ricardone · {ric_s} min ({hm(ric_s)})', GDK, GDK), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {sl_s} min ({hm(sl_s)})', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard(f'Tiempo total puerta a puerta · {hm(R7["total"])}', f'{R7["total"]} min', GDK, GDK)
    + kcard('Comparativo semana anterior' if RUN_T else f'Contra el comité anterior ({PUB["total"]})', f'{sgn(d_tot)} min', GMID, GDK)
    + (kcard('Total de camiones', fmtn(R7['est']), VMID, VIO) if RUN_T else kcard('Viajes medidos de punta a punta', fmtn(N7['total']), VMID, VIO)) + '</div>',
    (f'Circuito R7, tramos de la corrida {RUN["runId"]} (circuit_timing, operaciones R7 unidas a la planilla), igual que el comité publicado ({ANT_LBL}: Ricardone {PUB["ric"]}, San Lorenzo {PUB["slz"]}). Promedio por tramo (operaciones con el tramo): ' + ', '.join(f'{a} {v7[i]} ({n7[i]})' for i, a in enumerate(['ingreso', 'Playa 1', 'salida', 'interplanta', 'Playa OSL', 'descarga', 'egreso'])) + f'. Puerta a puerta = salida − ingreso de la planilla ({R7["total"]} min, {fmtn(N7["total"])} operaciones).') if RUN_T else
    f'Circuito R7, promedio de la semana por tramo en minutos (viajes con el tramo leído): ingreso {v7[0]} ({n7[0]}), Playa 1 {v7[1]} ({n7[1]}), salida {v7[2]} ({n7[2]}), interplanta {v7[3]} ({n7[3]}), Playa OSL {v7[4]} ({n7[4]}), descarga {v7[5]} ({n7[5]}), egreso {v7[6]} ({n7[6]}). '
    f'Suman {sum(v7)}; el puerta a puerta medido de punta a punta (pre-ingreso → salida de San Lorenzo) da {CAMT} sobre {N7["total"]} viajes: cada tramo se promedia sobre los viajes que lo tienen leído. '
    f'Método: viajes por patente con cámaras (r7-camaras.cjs), calada sólida → egreso → ingreso a San Lorenzo en menos de 90 min → salida; la descarga y el egreso solo cuando se leyó la volcable ({n7[5]} viajes). '
    f'Calibración en {CAL_LBL}: el mismo método da {K7["p2pCamara"]} min de puerta a puerta y la planilla {K7["p2pPlanilla"]}. Comité anterior ({ANT_LBL}, planilla): {PUB["total"]} min. '
    f'Mismo método en los dos períodos: {CAL_LBL} {TP["total"]} min (Ricardone {TP["ric"]}, San Lorenzo {TP["sl"]}) → esta semana {CAMT} (Ricardone {R7["ric"]}, San Lorenzo {R7["slz"]}).', gap=36)

# resumen soja
rk_tot = rank(TOT + [R7['total']], R7['total'])
ordinal = {1: 'el más bajo', 2: 'el 2.º más bajo', 3: 'el 3.º más bajo'}
d_ric, d_sl = R7['ric'] - TP['ric'], R7['slz'] - TP['sl']
quien = 'Ricardone' if d_ric < d_sl else 'San Lorenzo'
if RUN_T:
    d_ric, d_sl = R7['p1'] - PUB['p1'], R7['slz'] - PUB['slz']
    quien = 'Ricardone' if d_ric < d_sl else 'San Lorenzo'
    rk_p1 = rank(P1 + [R7['p1']], R7['p1']); rk_sl = rank(SLZ + [R7['slz']], R7['slz'])
section('resumen-soja', head('Soja · R7', 'Resumen de la semana: soja', cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('Puerta a puerta', f'{R7["total"]} min', GDK, f'{sgn(d_tot)} min vs. semana anterior', GXLT, TOT + [R7['total']])
    + (kpi('Espera Playa 1 · Ricardone', f'{R7["p1"]} min', GDK, ('La más baja desde junio' if rk_p1 == 1 else f'{sgn(d_ric)} vs. semana anterior'), GXLT, P1 + [R7['p1']])
       + kpi('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', VIO, ('La más baja desde junio' if rk_sl == 1 else f'{sgn(d_sl)} vs. semana anterior'), VLT, SLZ + [R7['slz']]) if RUN_T else
       kpi('Ricardone · ingreso, Playa 1 y salida', f'{R7["ric"]} min', GDK, f'{sgn(d_ric)} vs. {CAL_LBL}', GXLT, None)
       + kpi('San Lorenzo · ingreso a salida', f'{R7["slz"]} min', VIO, f'{sgn(d_sl)} vs. {CAL_LBL}', VLT, None))
    + kpi('Camiones R7 por día', f'{APR}{fmtn(r7_dia)}', GDK, f'{spct(pct(r7_dia, r7_dia_prev))} vs. semana anterior', GXLT, None)
    + '</div>' + (key(f'Semana {"liviana" if LIVIANA else "cargada" if PESADA else "de volumen parecido"} {"y rápida" if d_tot < 0 else "y más lenta" if d_tot > 0 else ""}: {fmtn(r7_dia)} camiones por día y {R7["total"]} min puerta a puerta, {ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio. '
                      + (f'Subió por Ricardone: Playa 1 pasó de {PUB["p1"]} a {R7["p1"]} min; San Lorenzo bajó de {PUB["slz"]} a {R7["slz"]}.' if d_tot > 0 and d_ric > 0 and d_sl < 0 else
                         f'Subió por San Lorenzo ({PUB["slz"]} → {R7["slz"]} min); Playa 1 quedó en {R7["p1"]} min ({PUB["p1"]} la semana anterior).' if d_tot > 0 and d_sl > 0 and d_ric < 0 else
                         f'La mejora vino de San Lorenzo ({PUB["slz"]} → {R7["slz"]} min); Playa 1 quedó en {R7["p1"]} min ({PUB["p1"]} la semana anterior).' if d_sl < 0 and d_sl < d_ric else
                         f'La mejora vino de Ricardone (Playa 1 {PUB["p1"]} → {R7["p1"]} min); San Lorenzo quedó en {R7["slz"]} min ({PUB["slz"]} la semana anterior).' if d_ric < 0 else
                         f'Playa 1 en {R7["p1"]} min ({PUB["p1"]} la semana anterior) y San Lorenzo en {R7["slz"]} ({PUB["slz"]}).')) if RUN_T else key(f'Semana {"liviana" if LIVIANA else "cargada" if PESADA else "de volumen parecido"} {"y rápida" if d_tot < 0 else "y más lenta" if d_tot > 0 else ""}: {"" if PR7 else "unos "}{fmtn(r7_dia)} camiones por día y {R7["total"]} min puerta a puerta, {ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio. Con el mismo método de cámaras, la mejora contra {CAL_LBL} vino más de {quien} (Ricardone {sgn(d_ric)}, San Lorenzo {sgn(d_sl)} min).', 28)),
    f'{APR}{fmtn(R7["est"])} {"operaciones" if PR7 else "camiones"} R7 en {N} días: {fmtn(r7_dia)} por día, contra {fmtn(r7_dia_prev)} por día del comité anterior ({fmtn(PUB["r7_ops"])} operaciones de la planilla en {ANT_N} días). ' + ('Cifra de la planilla. ' if PR7 else 'La cifra de esta semana es una estimación por cámaras (ver lámina 2). ') +
    (f'Playa 1 y San Lorenzo (playa OSL + descarga + egreso) son tramos de la corrida, el mismo método del comité publicado: Playa 1 {PUB["p1"]} → {R7["p1"]}, San Lorenzo {PUB["slz"]} → {R7["slz"]} min. Las líneas son la serie publicada desde el 17/06 más esta semana. ' if RUN_T else
    f'Ricardone y San Lorenzo se comparan contra {CAL_LBL} medido igual (cámaras por patente, misma PC): Ricardone {TP["ric"]} → {R7["ric"]}, San Lorenzo {TP["sl"]} → {R7["slz"]}. No se comparan contra los tramos publicados del comité anterior porque salen de otra muestra (recorridos unidos a una operación de la planilla). ') +
    f'Línea: puerta a puerta por fecha de comité, del 17/06 al comité anterior («Ant.», {ANT_LBL}: {PUB["total"]}), y el último punto es esta semana por cámaras.')

# hallazgo
top2 = sorted(range(N), key=lambda i: -R7['dia'][i])[:2]
valid = [i for i in range(N) if R7['totN'][i] >= 10]
islow = max(valid, key=lambda i: R7['totDia'][i]); ifast = min(valid, key=lambda i: R7['totDia'][i])
bars = daybars(R7['dia'], days, lambda i, v: GDK if i in top2 else GLT, 270, 52, [f'{m}' for m in R7['totDia']])
tit = (f'El {full[imx]} fue el día con más soja y también el más rápido' if ifast == imx else
       f'El {full[imx]} fue el día con más soja; el {full[islow]}, el más lento')
osl_d = [TD[d]['playaOsl']['mean'] for d in DAYS]; p1_d = [TD[d]['playa1']['mean'] for d in DAYS]
if RUN_T:
    _dt = lambda d, k: next((round(t['mediaMin']) for t in PQS['porDia'].get(d, {}).get('tramos', []) if isinstance(t, dict) and t['key'] == k and t.get('mediaMin') is not None), None)
    osl_d = [_dt(d, 'SL_INGRESO→SL_BALANZA_INGRESO') or c for d, c in zip(DAYS, osl_d)]; p1_d = [_dt(d, 'PREINGRESO→CALADA') or c for d, c in zip(DAYS, p1_d)]
causa = ('Playa OSL', osl_d[islow], 'San Lorenzo') if (R7['slzDia'][islow] - avg(R7['slzDia'])) > (R7['ricDia'][islow] - avg(R7['ricDia'])) else ('Playa 1', p1_d[islow], 'Ricardone')
section('hallazgo', '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:600px; display:flex; flex-direction:column; gap:28px">'
    + head('Soja · R7', tit, cam=True)
    + p(f'El {full[imx]} hubo {R7["dia"][imx]} {"operaciones" if PR7 else "recorridos"} de soja y el ciclo fue de {R7["totDia"][imx]} min. El {full[top2[1]]} le siguió en volumen ({R7["dia"][top2[1]]}), con {R7["totDia"][top2[1]]} min.', 28)
    + p(f'El {full[islow]} fue el día más lento: {R7["totDia"][islow]} min con {R7["dia"][islow]} {"operaciones" if PR7 else "recorridos"}.' + ('' if ifast == imx else f' El más rápido, el {full[ifast]}: {R7["totDia"][ifast]} min.'), 28)
    + key(f'El {full[islow]} el tiempo se fue en {causa[2]}: {causa[0]} llegó a {causa[1]} min (media de la semana {T7["playaOsl" if causa[0] == "Playa OSL" else "playa1"]}).')
    + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Días de mayor volumen', GDK), ('Resto', GLT)])
    + f'<p style="font-size:24px; color:{BODY}">{"Operaciones" if PR7 else "Recorridos"} de soja R7 por día y, abajo, minutos puerta a puerta</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{bars}</div></div></div>',
    ('Operaciones R7 de la planilla por día operativo del ingreso' if PR7 else 'Recorridos R7 de la corrida por día operativo (final_circuits, día del inicio en circuit_timing_journeys)') + ' y puerta a puerta medio del día por patente (r7-camaras.cjs, viajes medidos: ' + ', '.join(map(str, R7['totN'])) + '): '
    + ', '.join(f'{days[i].lower()} {R7["dia"][i]} / {R7["totDia"][i]} min' for i in range(N)) + '. '
    f'Playa 1 por día: {", ".join(map(str, p1_d))}; Playa OSL por día: {", ".join(map(str, osl_d))}. Días con menos de 10 viajes medidos no entran en «más lento» ni «más rápido». Sin cruce con mantenimiento para esta semana.')

# plantas
pchart = hstack([(days[k], R7['ricDia'][k], R7['slzDia'][k]) for k in range(N)], width=980, bh=40, gap=8)
var_r, var_s = max(R7['ricDia']) - min(R7['ricDia']), max(R7['slzDia']) - min(R7['slzDia'])
mas = 'San Lorenzo' if var_s > var_r else 'Ricardone'
section('plantas', head('Soja · R7', f'Tiempos por planta, día por día: {mas} fue la que más varió', cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Ricardone', HC1), ('San Lorenzo', HC2)])
    + f'{pchart}</div><div style="width:440px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Ricardone se movió entre <b>{min(R7["ricDia"])} y {max(R7["ricDia"])} min</b>. San Lorenzo, entre <b>{min(R7["slzDia"])} y {max(R7["slzDia"])} min</b>.', 28)
    + p(f'El pico de Ricardone fue el {full[R7["ricDia"].index(max(R7["ricDia"]))]} ({max(R7["ricDia"])} min); el de San Lorenzo, el {full[R7["slzDia"].index(max(R7["slzDia"]))]} ({max(R7["slzDia"])} min).', 28)
    + key(f'La variación de la semana se jugó en {mas}.', 28) + '</div></div>',
    f'Minutos promedio por planta y por día, medidos por patente con cámaras (r7-camaras.cjs). Ricardone = pre-ingreso → egreso; San Lorenzo = ingreso al puerto → salida. Viajes medidos por día: {", ".join(map(str, R7["totN"]))}. '
    f'Promedio de la semana: Ricardone {R7["ric"]} ({N7["ric"]} viajes), San Lorenzo {R7["slz"]} ({N7["sl"]} viajes).')

# cuartos
QCOL = {'Q4': GDK, 'Q3': '#7B1E3A', 'Q2': '#C9651A', 'Q1': '#C8372D'}
dayq = [sum(qd[q][i] for q in qd) for i in range(N)]
mxq = max(dayq) or 1
stack = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600">{dayq[i]}</p><div style="display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                + ''.join(f'<div style="width:68px; height:{round(qd[q][i] / mxq * 400)}px; background:{QCOL[q]}"></div>' for q in ('Q4', 'Q3', 'Q2', 'Q1'))
                + f'</div><p style="font-size:24px; font-weight:600; white-space:nowrap">{days[i]}</p></div>' for i in range(N))
qtot = sum(QN.values())
pq = {q: round(QN[q] / qtot * 100) for q in QN}
qrow = lambda q, lab: f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QCOL[q]}; border-radius:12px; padding:16px 24px"><p style="font-size:28px; font-weight:600; width:220px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QCOL[q]}">{pq[q]} %</p><p style="font-size:24px; color:{BODY}">{QN[q]}</p></div>'
qmax = max(pq, key=pq.get); otros = [pq[q] for q in pq if q != qmax]
QL = {'Q1': 'la noche (Q1)', 'Q2': 'la mañana (Q2)', 'Q3': 'el mediodía (Q3)', 'Q4': 'la tarde (Q4)'}
section('cuartos', head('Soja · R7', f'{cap(QL[qmax])} concentró el ingreso: {pq[qmax]} %', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:40px"><div style="flex:1; display:flex; flex-direction:row; gap:4px; align-items:end">{stack}</div><div style="width:480px; display:flex; flex-direction:column; gap:20px">'
    + qrow('Q1', 'Q1 · 22–04 h') + qrow('Q2', 'Q2 · 04–10 h') + qrow('Q3', 'Q3 · 10–16 h') + qrow('Q4', 'Q4 · 16–22 h')
    + key(f'{cap(QL[qmax])} fue el cuarto más cargado ({pq[qmax]} %); los otros tres quedaron entre {min(otros)} y {max(otros)} %.')
    + '</div></div>',
    f'Viajes R7 medidos por cámaras ({qtot}, r7-camaras.cjs) por cuarto del día operativo según la hora del pre-ingreso (o de la calada si no se leyó). Franjas: 22–04 / 04–10 / 10–16 / 16–22. '
    'Es una muestra (los viajes que las cámaras leyeron completos), no el total de camiones: sirve para el reparto entre cuartos, no para la cantidad.', bg=BG2)

# histórico
W_ = weeks + ['Actual']
section('historico', head('Soja · R7', 'Dónde queda la semana: ' + ('el tiempo más bajo desde junio' if rk_tot == 1 else f'{ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio'), cam=True)
    + legend([('Tiempo puerta a puerta (min) · rótulo = fecha del comité', GDK), (f'Promedio de la serie: {avg(TOT)}', BODY)])
    + linechart(TOT + [R7['total']], W_, GDK, 200, 500 if max(TOT) <= 500 else 600, avg(TOT), hollow=() if P2P_PLAN else (len(W_) - 1,))
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Ricardone · espera Playa 1', f'{R7["p1"]} min', P1 + [R7['p1']], GDK, f'Promedio desde junio: {avg(P1)}')
    + (ctx('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', SLZ + [R7['slz']], VMID, f'Promedio desde junio: {avg(SLZ)}') if RUN_T else
       ctx(f'San Lorenzo · {CAL_LBL} → esta semana', f'{R7["slz"]} min', [TP['sl'], R7['slz']], VMID, f'Ingreso → salida por cámaras ({TP["sl"]} → {R7["slz"]})'))
    + key(f'{R7["total"]} min contra {PUB["total"]} del comité anterior; Playa 1 en {R7["p1"]} min, {"debajo" if R7["p1"] < avg(P1) else "arriba"} del promedio de la serie ({avg(P1)})' + (f', y San Lorenzo en {R7["slz"]}, {"debajo" if R7["slz"] < avg(SLZ) else "arriba"} de su promedio ({avg(SLZ)}).' if RUN_T else '.')) + '</div>',
    f'Tiempo puerta a puerta R7 por comité (rótulo = fecha del comité, que informa la semana previa); «Ant.» = comité anterior ({ANT_LBL}, {PUB["total"]} min, planilla). '
    + (f'«Actual» = esta semana, planilla ({R7["total"]} min). ' if P2P_PLAN else f'«Actual» (círculo hueco) = esta semana medida por cámaras ({R7["total"]} min): el método se calibró en {CAL_LBL} ({K7["p2pCamara"]} por cámaras contra {K7["p2pPlanilla"]} de la planilla), así que es comparable con la serie; se confirma con la planilla. ')
    + f'Playa 1: serie publicada y esta semana por cámaras (en {CAL_LBL} el mismo método dio {TP["playa1"]} contra {PUB["p1"]} publicado para el período). San Lorenzo no se agrega a la serie publicada (suma de tramos de otra muestra, {PUB["slz"]} min en el comité anterior): se muestra la comparación por cámaras con el mismo método.', gap=24)

# ------------------------------------------------------------------ pellet (solo monitoreo)
divider('div-pellet', '02', 'Pellet', f'Sin operativo de transile de pellet al puerto en el período ({PE["viajes"]} {"viaje leído" if PE["viajes"] == 1 else "viajes leídos"} por cámaras).', PEL, '#E3C9A3') if not PEL_OP else divider('div-pellet', '02', 'Pellet', 'Transile de pellet de girasol de Ricardone a la volcable 4 del puerto: la tanda de esta semana contra la del 30/09–02/10.' if PI else 'Transile de pellet de girasol de Ricardone a las volcables del puerto: monitoreo de la semana.', PEL, '#E3C9A3')
if PI:
    # ---- pellet con el informe de transile de la semana: 1.ª tanda (30/09–02/10) contra 2.ª tanda (esta semana)
    A1, A2, PT = PI['anterior'], PI['actual'], PI['total']
    T1, T2 = 'Tanda del 30/09–02/10', 'Esta semana · 05–06/10'
    cyc = lambda a: a['ric'] + a['tramos']['interplanta'] + a['sl']
    # 1 · las dos tandas
    dv = [x['viajes'] for x in PI['dias']]
    pbars = daybars(dv, [x['lbl'] for x in PI['dias']], lambda i, v: PELL if PI['dias'][i]['tanda'] == 1 else PEL, 300, 72,
                    sub=[f'{x["camiones"]} cam.' if x.get('camiones') else '' for x in PI['dias']])
    section('pel-periodo', head('Pellet · transile', 'El pellet se movió en dos tandas: la de esta semana, con menos de la mitad de los camiones', PEL, 56)
        + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + legend([(T1, PELL), (T2, PEL)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}">Viajes al puerto por día</p>')
        + f'<div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{pbars}</div></div>'
        + '<div style="width:520px; display:flex; flex-direction:column; justify-content:center; gap:20px">'
        + lbox(T1, f'{fmtn(A1["toneladas"])} t', f'{A1["viajes"]} viajes · {A1["camiones"]} camiones<br>{A1["tandaTxt"]}', PELL, PEL)
        + lbox(T2, f'{fmtn(A2["toneladas"])} t', f'{A2["viajes"]} viajes · {A2["camiones"]} camiones<br>{A2["tandaTxt"]}', PEL, PEL)
        + '</div></div>'
        + key(f'Entre las dos tandas se movieron {fmtn(PT["toneladas"])} t de pellet de girasol de Ricardone al puerto en {PT["viajes"]} viajes, con {PT["camiones"]} camiones; todos descargaron en la volcable 4.'),
        f'Fuente: informe «Transile de pellet 30/09–06/10». 1.ª tanda {A1["tandaTxt"]}: {fmtn(A1["toneladas"])} t, {A1["viajes"]} viajes, {A1["camiones"]} camiones. 2.ª tanda {A2["tandaTxt"]}: {fmtn(A2["toneladas"])} t, {A2["viajes"]} viajes, {A2["camiones"]} camiones (coincide con los 56 ingresos de pellet por la volcable 4 del Excel de la semana).', gap=28)
    # 2 · tramos comparados, misma escala
    TRK = ['playa1', 'ptara', 'carga', 'interplanta', 'playaOsl', 'descarga', 'salida']
    TRL = ['Fila de ingreso (Playa 1)', 'Hasta Playa 3', 'Carga y balanza', 'Ricardone → San Lorenzo', 'Fila en Playa OSL', 'Balanza → volcable 4', 'Volcable → salida']
    TRC = [GLT, GMID, PELM, GREY, VIO, VMID, VXLT]
    TRT = ['#14281E', '#FFFFFF', '#FFFFFF', '#14281E', '#FFFFFF', '#FFFFFF', '#14281E']
    WMAX = 1240; cmax = max(cyc(A1), cyc(A2))
    def cbar(lbl, sub, a):
        segs = ''.join(f'<div style="width:{max(4, round(a["tramos"][k] / cmax * WMAX))}px; height:72px; background:{TRC[j]}; display:flex; align-items:center; justify-content:center{"" if j == 0 else "; border-left:3px solid " + BG}">'
                       + (f'<p style="font-size:26px; font-weight:700; color:{TRT[j]}">{a["tramos"][k]}</p>' if a['tramos'][k] / cmax * WMAX >= 34 else '') + '</div>' for j, k in enumerate(TRK))
        return (f'<div style="display:flex; flex-direction:column; gap:10px"><div style="display:flex; flex-direction:row; align-items:baseline; gap:16px"><p style="font-size:30px; font-weight:600; color:{TEXT}">{lbl}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div>'
                f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><div style="display:flex; flex-direction:row; border-radius:8px; overflow:hidden">{segs}</div><p style="font-size:44px; font-weight:600; color:{PEL}; white-space:nowrap">{cyc(a)} min</p></div></div>')
    leg = '<div style="display:grid; grid-template-columns:repeat(4, auto); gap:12px 28px; justify-content:start">' + ''.join(
        f'<div style="display:flex; flex-direction:row; align-items:center; gap:10px"><div style="width:24px; height:24px; background:{TRC[j]}; border-radius:5px"></div><p style="font-size:24px; color:{TEXT}; white-space:nowrap">{t}</p></div>' for j, t in enumerate(TRL)) + '</div>'
    small = [TRL[j] + ' ' + str(A2['tramos'][k]) for j, k in enumerate(TRK) if A2['tramos'][k] / cmax * WMAX < 34]
    section('pel-tramos', head('Pellet · transile', f'El mismo viaje, sin fila en el puerto: el ciclo bajó de {cyc(A1)} a {cyc(A2)} min', PEL, 56)
        + leg
        + '<div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:40px">'
        + cbar(T1, f'Ricardone {A1["ric"]} · San Lorenzo {A1["sl"]} min', A1)
        + cbar(T2, f'Ricardone {A2["ric"]} · San Lorenzo {A2["sl"]} min' + (f' · {", ".join(small)}' if small else ''), A2)
        + '</div>'
        + key(f'La diferencia está en el puerto: la fila en Playa OSL pasó de {A1["tramos"]["playaOsl"]} a {A2["tramos"]["playaOsl"]} min y de la balanza a la volcable, de {A1["tramos"]["descarga"]} a {A2["tramos"]["descarga"]}. Ricardone tardó casi lo mismo ({A1["ric"]} y {A2["ric"]} min).'),
        'Minutos promedio de cada tramo, en el orden del viaje, del informe de transile. Ricardone = Playa 1 + hasta Playa 3 + carga y balanza; San Lorenzo = Playa OSL + balanza → volcable 4 + volcable → salida; ciclo = Ricardone + interplanta + San Lorenzo. '
        + '; '.join(f'{t}: {A1["tramos"][k]} → {A2["tramos"][k]}' for t, k in zip(TRL, TRK)) + '.', gap=32)
    # 3 · por día
    DD = [x for x in PI['dias'] if x['viajes']]
    mxd = max(x['ric'] + x['sl'] for x in DD)
    def drow(x):
        now = x['tanda'] == 2
        c1, c2, tc = (HC1, HC2, '#FFFFFF') if now else ('#C3DCCB', '#D9D1EE', '#4A5D52')
        return (f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px; padding:10px 16px; border-radius:14px{"; background:" + PELL if now else ""}"><div style="width:300px; display:flex; flex-direction:column; gap:2px"><p style="font-size:30px; font-weight:{700 if now else 600}; color:{PEL if now else BODY}">{x["lbl"]}</p><p style="font-size:24px; color:{BODY}">{x["viajes"]} viajes · {x["camiones"]} camiones</p></div>'
                f'<div style="display:flex; flex-direction:row; border-left:2px solid {TEXT if now else LINE}">'
                f'<div style="width:{round(x["ric"] / mxd * 980)}px; height:{60 if now else 48}px; background:{c1}; display:flex; align-items:center; justify-content:end; padding:0px 12px 0px 0px"><p style="font-size:26px; font-weight:700; color:{tc}">{x["ric"]}</p></div>'
                f'<div style="width:{round(x["sl"] / mxd * 980)}px; height:{60 if now else 48}px; background:{c2}; display:flex; align-items:center; justify-content:end; padding:0px 12px 0px 0px"><p style="font-size:26px; font-weight:700; color:{tc}">{x["sl"]}</p></div></div>'
                + (f'<p style="font-size:30px; font-weight:700; color:{PEL}; white-space:nowrap">◀ esta semana</p>' if now else '') + '</div>')
    drows = ''.join(drow(x) for x in DD)
    d1 = [x for x in DD if x['tanda'] == 1]; d2 = [x for x in DD if x['tanda'] == 2]
    slow = max(d2, key=lambda x: x['ric'])
    section('pel-dias', head('Pellet · transile', f'Por día: el puerto pasó de {max(x["sl"] for x in d1)} minutos por viaje a menos de una hora', PEL, 56)
        + f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">{legend([("Ricardone", HC1), ("San Lorenzo", HC2)])}<p style="font-size:24px; color:{BODY}">Minutos por viaje</p></div>'
        + f'<div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:14px">{drows}</div>'
        + key(f'Con {min(x["camiones"] for x in d1)} a {max(x["camiones"] for x in d1)} camiones el puerto fue el cuello: {" y ".join(str(x["sl"]) for x in d1)} min por viaje. Con {d2[0]["camiones"]} camiones bajó a {d2[0]["sl"]}. El {slow["lbl"].split()[0].lower().replace("mar", "martes").replace("lun", "lunes")} {slow["lbl"].split()[1].split("/")[0]} se demoró la carga en Ricardone ({slow["ric"]} min, {slow["viajes"]} viajes).'),
        'Minutos por viaje en cada planta, por día, del informe de transile: ' + '; '.join(f'{x["lbl"]} {x["viajes"]} viajes, {x["camiones"]} camiones, Ricardone {x["ric"]} y San Lorenzo {x["sl"]} min' for x in DD) + '.', gap=28)
    # 4 · jornadas
    section('pel-jornadas', head('Pellet · transile', 'Con menos camiones y sin fila, nadie encadenó jornadas largas', PEL, 56)
        + '<div style="flex:1; display:flex; flex-direction:row; gap:40px; align-items:stretch">'
        + lbox(T1, A1['jornadaBig'], A1['jornadaTxt'], PELL, PEL)
        + lbox(T2, A2['jornadaBig'], A2['jornadaTxt'], PEL, PEL)
        + '</div>'
        + key(f'En la tanda del 30/09–02/10 cada camión hizo {fx(A1["viajes"] / A1["camiones"])} viajes y casi todos trabajaron más de 12 h seguidas. Esta semana, {fx(A2["viajes"] / A2["camiones"])} viajes por camión y ninguna jornada de más de 9 h.'),
        'Jornada seguida = lecturas del mismo camión sin cortes de más de unas horas, del informe de transile. 1.ª tanda: 44 de 49 camiones con más de 12 h seguidas; 26 con jornadas de más de 24 h (159 de los 242 viajes). 2.ª tanda: máximo 9 h.', gap=32)
    # 5 · en números
    nrows = [('Camiones', fmtn(A1['camiones']), fmtn(A2['camiones'])), ('Viajes', fmtn(A1['viajes']), fmtn(A2['viajes'])), ('Toneladas movidas', f'{fmtn(A1["toneladas"])} t', f'{fmtn(A2["toneladas"])} t'),
             ('Viajes por camión', fx(A1['viajes'] / A1['camiones']), fx(A2['viajes'] / A2['camiones'])), ('Horas con movimiento', f'{fx(A1["horas"])} h', f'{fx(A2["horas"])} h'), ('Toneladas por hora', f'{A1["tph"]} t/h', f'{A2["tph"]} t/h'),
             ('Tiempo en Ricardone por viaje', f'{A1["ric"]} min', f'{A2["ric"]} min'), ('Tiempo en San Lorenzo por viaje', f'{A1["sl"]} min', f'{A2["sl"]} min'), ('Ciclo por viaje', f'{cyc(A1)} min', f'{cyc(A2)} min')]
    ntab = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 8px 0px; border-bottom:2px solid {TEXT}"><p style="width:620px"></p><p style="width:380px; font-size:26px; font-weight:600; color:{BODY}; text-align:right">{T1}</p><p style="width:380px; font-size:26px; font-weight:600; color:{PEL}; text-align:right">{T2}</p></div>'
            + ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; border-bottom:1px solid {LINE}; padding:9px 0px{"; background:" + PELL if r[0] == "Ciclo por viaje" else ""}"><p style="width:620px; font-size:28px; color:{TEXT}; padding:0px 0px 0px 8px">{r[0]}</p><p style="width:380px; font-size:32px; font-weight:600; color:{TEXT}; text-align:right">{r[1]}</p><p style="width:380px; font-size:32px; font-weight:600; color:{PEL}; text-align:right">{r[2]}</p></div>' for r in nrows))
    section('pel-numeros', head('Pellet · transile', 'Las dos tandas, en números', PEL, 56)
        + f'<div style="display:flex; flex-direction:column">{ntab}</div>'
        + key(f'Esta semana se movieron {A1["tph"] - A2["tph"]} t/h menos, pero cada viaje tardó {cyc(A1) - cyc(A2)} min menos: el puerto despachó cada camión en {A2["sl"]} min contra {A1["sl"]}.'),
        'Del informe de transile (tabla comparativa). Ciclo = Ricardone + interplanta (17 min en las dos tandas) + San Lorenzo, con los tiempos de las láminas de tramos.', gap=24)
elif PEL_OP:
    prow = [(days[iD[d]], PI['actual']['porDia'][d]['ric'], PI['actual']['porDia'][d]['sl']) for d in pdays] if PI else [(days[iD[d]], PE['tramosDia'][d]['ric']['mean'], PE['tramosDia'][d]['sl']['mean']) for d in pdays]
    vv = sorted(PE['porVolcable'].items(), key=lambda kv: -kv[1])
    section('pellet-operativo', head('Pellet · transile', f'{"Un operativo corto" if PEL_CHICO else "Operativo de pellet"}: {fmtn(PEL_N)} {PEL_U}, el {y_([full[iD[d]] for d in pdays], last=" y el ")}', PEL, cam=True)
        + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:440px; display:flex; flex-direction:column; gap:16px">'
        + (box(fmtn(PEL_N), 'Viajes al puerto', f'{PEL_CAM} camiones · {fmtn(PI["actual"]["toneladas"])} t') if PI else box(fmtn(PPE['planillaEgresosPellet']), 'Egresos de pellet de la planilla', f'{PE["viajes"]} leídos por cámaras · {PEL_CAM} camiones') if PPE else box(fmtn(PE['viajes']), 'Viajes leídos por cámaras', f'{PE["camiones"]} camiones distintos'))
        + (box(f'{fx(PI["actual"]["horas"])} h', 'De operativo, en dos turnos', PI['actual']['tandaTxt']) if PI else box(f'{len(pl_blk)} tanda' + ('s' if len(pl_blk) != 1 else ''), ' y '.join(f'{b["inicio"][8:10]}/{b["inicio"][5:7]} {b["inicio"][11:13]}–{b["fin"][11:13]} h' for b in pl_blk)))
        + box(f'{pt["ciclo"]} min', 'Ciclo por viaje', f'contra {ptp["ciclo"]} en {PANT}')
        + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">{legend([("Ricardone", HC1), ("San Lorenzo", HC2)])}<p style="font-size:24px; color:{BODY}">Tiempo por viaje, día por día (min)</p></div>'
        + hstack(prow, width=900, bh=60, gap=18, lab_w=120)
        + '</div></div>'
        + key((f'Sin fila en el puerto: ' if pt['sl'] <= 0.6 * ptp['sl'] else f'En el puerto: ') + f'San Lorenzo tomó {pt["sl"]} min por viaje, contra {ptp["sl"]} en {PANT}. Descargó por la {PI["actual"]["volcable"] if PI else vv[0][0]}.' + (' ' + PI['actual']['jornada'] if PI else '')),
        (f'Transile de pellet de girasol de Ricardone al puerto, del informe de la semana (2.ª tanda, {PI["actual"]["tandaTxt"]}): {PEL_N} viajes, {PEL_CAM} camiones, {fmtn(PI["actual"]["toneladas"])} t, todos a la volcable 4. Por día: ' + '; '.join(f'{fdm(d)} {v["viajes"]} viajes, {v["camiones"]} camiones, Ricardone {v["ric"]} y San Lorenzo {v["sl"]} min' for d, v in PI['actual']['porDia'].items()) + f'. Operativo anterior (1.ª tanda, 30/09–02/10): {PI["anterior"]["viajes"]} viajes, {PI["anterior"]["camiones"]} camiones, {fmtn(PI["anterior"]["toneladas"])} t, Ricardone {ptp["ric"]} y San Lorenzo {ptp["sl"]} min.') if PI else
        f'Transile de pellet de girasol de Ricardone al puerto, solo con cámaras (pellet-camaras.cjs): balanza de egreso de Ricardone con Playa 3 o calle líquida antes, sin calada sólida, silo ni volcable de Ricardone, y lecturas del puerto en las 12 h siguientes. '
        f'Viajes por día: {", ".join(f"{fdm(d)} {PE["viajesDia"][d]}" for d in pdays)}; camiones por día: {", ".join(f"{fdm(d)} {PE["camionesDia"][d]}" for d in pdays)}. Volcable leída: {", ".join(f"{k} {v}" for k, v in vv)}. '
        f'Calibración contra la planilla ({fdm(list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])}): las cámaras vieron {PK["emparejados"]} de los {PK["planillaEgresosPellet"]} egresos de pellet de Ricardone ({round(PK["recall"] * 100)} %) y el {round(PK["precision"] * 100)} % de lo que vieron era pellet de la planilla. '
        + (f'La planilla tiene {PEL_N} egresos de pellet al puerto ({PEL_CAM} camiones). ' if PPE else f'Con esa cobertura, la semana rondaría {round(PE["viajes"] / PK["recall"])} viajes; la planilla dará el número. ') + f' Operativo anterior (comité {ANT_LBL}): {fmtn(PUB["pel_viajes"])} viajes de la planilla, ciclo publicado {PUB["pel_ciclo"]} min; con este mismo método de cámaras, ciclo {ptp["ciclo"]} y puerto {ptp["sl"]} min. Monitoreo: sin propuesta de puerto ni de flete.', gap=26)
    vp = [pt['playa1'], pt['ptara'], pt['carga'], pt['interplanta'], pt['playaOsl'], pt['descarga'], pt['salida']]
    vpn = [ptn['playa1'], ptn['ptara'], ptn['carga'], ptn['interplanta'], ptn['playaOsl'], ptn['descarga'], ptn['salida']]
    vpp = [ptp['playa1'], ptp['ptara'], ptp['carga'], ptp['interplanta'], ptp['playaOsl'], ptp['descarga'], ptp['salida']]
    ric_p, sl_p = sum(vp[:3]), sum(vp[4:])
    TRN = ['Playa 1', 'Acceso P3', 'Carga', 'Interplanta', 'Playa OSL', 'Descarga', 'Salida']
    imaxd = max(range(7), key=lambda i: vpp[i] - vp[i])
    section('pellet-tramos', head('Pellet · transile', 'Pellet: tiempos medios por tramo', PEL, cam=True)
        + tramos([('Playa 1', 'Pre-ingreso → Calle líquida'), ('Acceso P3', 'Calle líquida → Playa 3'), ('Carga', 'Playa 3 → Balanza egreso'), ('Interplanta', 'Balanza egreso → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable'), ('Salida', 'Volcable → Salida SLZ')],
                 [max(1, v or 0) for v in vp], [GLT, GMID, PELM, GREY, VIO, VMID, VXLT], [TEXT, TEXT, PEL, TEXT, VIO, VMID, TEXT],
                 [('b', 0, 3, f'Ricardone · {ric_p} min', PELM, PEL), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {sl_p} min', VMID, VIO)])
        + '<div style="display:flex; flex-direction:row; gap:24px">'
        + kcard(f'Ciclo completo por viaje · {hm(pt["ciclo"])}', f'{pt["ciclo"]} min', PELM, PEL)
        + kcard('Tanda del 30/09–02/10' if PI else 'Operativo anterior, mismo método', f'{ptp["ciclo"]} min', GMID, GDK)
        + kcard('Viajes por camión en la semana', fx(PEL_N / PEL_CAM), VMID, VIO) + '</div>'
        + key(f'La diferencia con {PANT} está en {TRN[imaxd]}: {vpp[imaxd]} → {vp[imaxd]} min. La carga en Ricardone tomó {pt["carga"]} min.'),
        (f'Tramos del informe de transile de la semana: ' + ', '.join(f'{a} {b}' for a, b in zip(TRN, vp)) + f'; ciclo {pt["ciclo"]} min (Ricardone {pt["ric"]} + interplanta {pt["interplanta"]} + San Lorenzo {pt["sl"]}). Operativo anterior (1.ª tanda): ' + ', '.join(f'{a} {b}' for a, b in zip(TRN, vpp)) + f', ciclo {ptp["ciclo"]} min.') if PI else
        f'Tramos medidos por cámaras sobre los {PE["viajes"]} viajes leídos (viajes con cada tramo: {", ".join(f"{a} {b}" for a, b in zip(TRN, vpn))}). Suman {sum(v or 0 for v in vp)}; el ciclo medido de punta a punta da {pt["ciclo"]} ({ptn["ciclo"]} viajes). '
        f'Operativo anterior con el mismo método ({fdm(list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])}, {PEP["viajes"]} viajes): ' + ', '.join(f'{a} {b}' for a, b in zip(TRN, vpp)) + f', ciclo {ptp["ciclo"]}.', gap=32)
    # histórico de operativos
    fd = lambda s_: f'{s_[8:10]}/{s_[5:7]}'
    cols_w = [170, 260, 140, 170, 250, 200, 140, 160]
    hdr = ['Comité', 'Período', 'Viajes', 'Camiones', 'Viajes por camión', 'Toneladas', 'Horas', 'Ciclo']
    def row(cells, bold=False, bg=None, col=TEXT):
        return (f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:10px 0px{"; background:" + bg if bg else ""}">'
                + ''.join(f'<p style="width:{w}px; font-size:26px; font-weight:{600 if bold or k == 0 else 400}; color:{col}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, cells))) + '</div>')
    PH = [dict(o, comite=('Ant.' if o['id'] == 'actual' else o['comite'])) for o in ANT['pelletHistorico']]
    horas_act = PI['actual']['horas'] if PI else round(sum(b['horas'] for b in pl_blk), 1)
    table = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 6px 0px">' + ''.join(f'<p style="width:{w}px; font-size:24px; font-weight:600; color:{BODY}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, hdr))) + '</div>'
             + ''.join(row([o['comite'] or '—', f'{fd(o["desde"])} a {fd(o["hasta"])}', fmtn(o['viajes']), str(o['camiones']), fx(o['viajesPorCamion']),
                            f'{fmtn(o["toneladas30"])} t', fx(o['horas']), f'{o["ciclo"]} min' if o['ciclo'] else '—']) for o in PH)
             + row(['Actual', f'{fd(pdays[0])} a {fd(pdays[-1])}', f'{fmtn(PEL_N)}{"" if PPE else "*"}', f'{PEL_CAM}{"" if PPE else "*"}', fx(PEL_N / PEL_CAM), (f'{fmtn(PI["actual"]["toneladas"])} t' if PI else f'{fmtn(PEL_N * 30)} t{"" if PPE else "*"}'), fx(horas_act), f'{pt["ciclo"]} min'], bold=True, bg=PELL, col=PEL))
    section('pellet-hist', head('Pellet · transile', 'Los operativos de pellet desde junio' + (': este fue el más chico' if PEL_CHICO else ''), PEL)
        + f'<div style="display:flex; flex-direction:column">{table}</div>'
        + '<div style="display:flex; flex-direction:row; gap:48px">'
        + p('Esta semana: 2.ª tanda del informe de transile (05/10 15:38 → 06/10 19:19).' if PI else f'Esta semana: viajes de la planilla; horas y ciclo, por cámaras ({PE["viajes"]} viajes leídos).' if PPE else f'* Según cámaras: viajes leídos, no viajes de la planilla. Con la cobertura medida ({round(PK["recall"] * 100)} %) serían unos {round(PE["viajes"] / PK["recall"])}.', 26, BODY, '; flex:1')
        + '<div style="flex:1">' + key(f'Operativo de {PEL_CAM} camiones y {fx(horas_act)} h de actividad, con ciclo de {pt["ciclo"]} min: el más corto de la serie.' if pt['ciclo'] < min(o['ciclo'] for o in PH if o['ciclo']) else f'Operativo de {PEL_CAM} camiones y {fx(horas_act)} h de actividad, con ciclo de {pt["ciclo"]} min.') + '</div></div>',
        'Operativos anteriores: planilla de movimientos (transile de pellet de girasol de Ricardone al puerto, sin patentes ficticias); camiones = patentes distintas; toneladas = viajes × 30; horas = tramos continuos de actividad; ciclo = el publicado en cada comité. '
        f'Esta semana: cámaras (pellet-camaras.cjs); horas = bloques de viajes leídos separados por más de 4 h; toneladas = viajes leídos × 30.' + (' Se reemplaza por la planilla cuando llegue.' if CAMARAS else ''), gap=24)

# ------------------------------------------------------------------ girasol
divider('div-girasol', '03', 'Girasol', 'Recepción de girasol en las volcables de Ricardone (R5 volcable 1 y R6 volcable 2).', VIO, '#B9A8E0')
if GIR_OK:
    g_pa = max(0, GI['calVolc'] - GI['desc'])          # calada → balanza de ingreso → Playa 3 (pesada bruta + acceso)
    gt_sum = 3 + GI['p1'] + g_pa + GI['desc'] + GI['tara']
    ga_pa = max(0, GAT['calVolc'] - GAT['descarga']); gat_sum = 3 + GAT['p1'] + ga_pa + GAT['descarga'] + GAT['tara']
    gv = [3, GI['p1'], g_pa, GI['desc'], GI['tara']]
    gmax = max(range(1, 5), key=lambda i: gv[i]); gnames = ['ingreso', 'Playa 1', 'la pesada bruta y el acceso a Playa 3', 'la descarga (Playa 3 → volcable)', 'la tara']
    section('girasol', head('Girasol · R5+R6', 'Girasol: tiempos medios por tramo', VIO)
        + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('P. Bruto y acceso P3', 'Calada → Balanza ingreso → Playa 3'), ('Descarga', 'Playa 3 → Volcable'), ('Tara', 'Volcable → Balanza egreso')],
                 gv, [GLT, GDK, GMID, VIO, VMID], [TEXT, GDK, TEXT, VIO, TEXT], [('b', 0, 5, f'Ricardone · {gt_sum} min ({hm(gt_sum)})', VIO, VIO)])
        + '<div style="display:flex; flex-direction:row; gap:24px">'
        + kcard('Tiempo total (suma de tramos)', f'{gt_sum} min · {hm(gt_sum)}', VIO, VIO)
        + kcard('Comparativo semana anterior', f'{sgn(gt_sum - PUB["g_total"])} min', GMID, GDK)
        + kcard('Total de camiones', fmtn(GOPS or GI['rec']), GDK, GDK) + '</div>'
        + key(f'El tramo más largo fue {gnames[gmax]} ({gv[gmax]} min). Contra la semana anterior, la descarga (Playa 3 → volcable y tara) pasó de {PUB["g_dt"]} a {GI["desc"] + GI["tara"]} min y Playa 1, de {PUB["g_p1"]} a {GI["p1"]}.' + (f' El {full[max(range(N), key=lambda i: GOPS_DIA[i])]} entraron {max(GOPS_DIA)} de los {fmtn(GOPS)} camiones.' if GOPS else '')),
        f'Girasol, medido por patente con cámaras (metricas-camaras.cjs), suma de tramos: ingreso 3, Playa 1 {GI["p1"]} ({GN_["p1"]} camiones), pesada bruta + acceso a Playa 3 {g_pa} (calada → volcable {GI["calVolc"]} menos Playa 3 → volcable; la balanza de ingreso no se leyó por separado), descarga {GI["desc"]} ({GN_["descarga"]}), tara {GI["tara"]} ({GN_["tara"]}) = {gt_sum} min. '
        f'Comparativo contra el comité publicado ({ANT_LBL}): {PUB["g_total"]} min (Playa 1 {PUB["g_p1"]}, descarga y tara {PUB["g_dt"]}). '
        + (f'Camiones = ingresos de girasol de Ricardone según la balanza ({", ".join(map(str, GOPS_DIA))} por día); la balanza no trae la plataforma, así que incluyen las descargas a silos Kepler (R4).' if GOPS_SGC else
           f'Camiones = operaciones de girasol de la planilla ({", ".join(map(str, GOPS_DIA))} por día).' if GOPS else f'Recorridos de la cámara de la volcable 2 por día: {", ".join(map(str, GI["dia"]))}.'), gap=32)
    GTA = GT + [gt_sum]; GPA = GP + [GI['p1']]; GDA = GD + [GI['desc'] + GI['tara']]
    rk_g = rank(GTA, gt_sum, low=False)
    section('girasol-hist', head('Girasol · R5+R6', 'Dónde queda la semana: ' + ('debajo del promedio desde junio' if gt_sum < avg(GT) else 'arriba del promedio desde junio'), VIO)
        + legend([('Tiempo total, suma de tramos (min) · rótulo = fecha del comité', VIO), (f'Promedio de la serie: {avg(GT)}', BODY)])
        + linechart(GTA, weeks + ['Actual'], VIO, 200, 500, avg(GT))
        + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
        + ctx('Espera Playa 1', f'{GI["p1"]} min', GPA, GDK, f'Promedio desde junio: {avg(GP)} · {rank(GPA, GI["p1"], low=False)}.ª más alta')
        + ctx('Descarga (Playa 3 → volcable y tara)', f'{GI["desc"] + GI["tara"]} min', GDA, VMID, f'Promedio desde junio: {avg(GD)}' + (' · mínimo de la serie' if GI['desc'] + GI['tara'] <= min(GDA) else ''))
        + key(f'{gt_sum} min contra {PUB["g_total"]} de la semana anterior: la descarga bajó de {PUB["g_dt"]} a {GI["desc"] + GI["tara"]} min, pero Playa 1 subió de {PUB["g_p1"]} a {GI["p1"]}.' if GI['p1'] > PUB['g_p1'] else f'{gt_sum} min contra {PUB["g_total"]} de la semana anterior.') + '</div>',
        f'Serie publicada por comité (suma de tramos de girasol), del 17/06 al comité anterior («Ant.», {ANT_LBL}: {PUB["g_total"]} min) y esta semana ({gt_sum} min, tramos por cámaras). Playa 1 y descarga + tara: series publicadas y esta semana.', gap=24)

# ------------------------------------------------------------------ líquidos
divider('div-liquidos', '04', 'Líquidos', 'Aceites, borras, glicerina e insumos químicos de Ricardone y la Terminal: movimientos de la semana.' if LCW else 'Aceites, borras, glicerina e insumos químicos: un criterio nuevo para contarlos y lo que vieron las cámaras en la semana.', BLU, '#A9C8E6')
LCX = LCW or LCR
LPS = LCX['porPlantaSentido']; LPF = LCX['porPlantaFamiliaSentido']
g = lambda k: LPS.get(k, {'n': 0, 'mediana': None, 'media': None})
TE, TI, RI, RE = g('TERMINAL_EMBARQUE · EGRESO'), g('TERMINAL_EMBARQUE · INGRESO'), g('RICARDONE · INGRESO'), g('RICARDONE · EGRESO')
ric_tot = RI['n'] + RE['n']
def crit(n, t, sub):
    return f'<div style="display:flex; flex-direction:row; gap:18px; align-items:start"><p style="width:52px; height:52px; border-radius:26px; background:{BLU}; color:#FFFFFF; font-size:28px; font-weight:600; text-align:center; line-height:52px">{n}</p><div style="flex:1; display:flex; flex-direction:column; gap:2px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{t}</p><p style="font-size:24px; line-height:1.35; color:{BODY}">{sub}</p></div></div>'
section('liq-criterio', head('Líquidos · criterio', 'Cómo contamos líquidos: por producto, por planta y por sentido', BLU)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:22px">'
    + crit(1, 'Por producto, no por circuito', 'Aceites a granel, borras, glicerinas e insumos químicos líquidos (metanol, metilato, ácidos, soda). Fuera: envasados, agua, alcohol y vinaza de Avellaneda, nitrógeno, sal glicerinosa.')
    + crit(2, 'Solo camiones', 'Sin patentes ficticias (TTTTTT, PPPPPP, XXXXXX): son traspasos por cañería, no camiones.')
    + crit(3, 'Ricardone y Terminal por separado', 'Renopack aparte: no tiene cámaras.')
    + crit(4, 'Cargas y descargas por separado', 'Egreso = carga, ingreso = descarga. Día operativo del ingreso (desde las 22 h) en todas las láminas.')
    + crit(5, 'Tiempo: mediana de la planilla', 'Ingreso → salida. La media se infla con los camiones que quedan de un día para otro.')
    + '</div><div style="width:640px; display:flex; flex-direction:column; gap:16px">'
    + f'<p style="font-size:24px; color:{BODY}">{ANT_LBL} recalculado con este criterio · movimientos de la planilla</p>'
    + note(fmtn(LCR['total']['n']), f'camiones de líquidos (el comité anterior publicó {fmtn(PUB["liq"])}).', BLU, BLU)
    + note(fmtn(TE['n'] + TI['n']), f'en la Terminal: {TE["n"]} cargas (mediana {TE["mediana"]} min) y {TI["n"]} descargas (mediana {TI["mediana"]} min).', BMID)
    + note(fmtn(ric_tot), f'en Ricardone: {RI["n"]} descargas (mediana {RI["mediana"]} min) y {RE["n"]} cargas. No eran 161: la cifra de «R8» sumaba la glicerina de la Terminal.', GLT)
    + '</div></div>',
    f'Criterio propuesto (pendiente de aprobación) y aplicado a {ANT_LBL} con liquidos-criterio.cjs sobre data/movimientos (nivel A, sin repetir external_operation_id). '
    f'De {fmtn(PUB["liq"])} publicados a {fmtn(LCR["total"]["n"])}: salen 29 movimientos con patente ficticia (traspasos por cañería) y 6 que no son líquidos (productos varios 3, nitrógeno 2, residuos 1); entran 48 insumos químicos de la Terminal y Ricardone (metanol 33, metilato 7, ácidos 5, soda 2, hipoclorito 1) que el filtro por circuito dejaba afuera. '
    f'«R8» publicado = 161: 90 eran glicerina de la Terminal (70 cargas, 20 descargas) con circuito R8 resuelto, 12 movimientos por cañería y 3 productos varios; camiones de líquidos de Ricardone: {ric_tot}. '
    f'Renopack ({sum(v["n"] for v in LCR["renopack"].values())} movimientos de aceite refinado a granel) queda aparte. Media puerta a puerta: Terminal cargas {TE["media"]}, descargas {TI["media"]}, Ricardone descargas {RI["media"]} min.', gap=28)
# por familia (período anterior recalculado)
FAMCOL = {'aceite': BLU, 'glicerina': BMID, 'borras': '#A9C8E6', 'insumos químicos': VMID, 'biodiésel': GREY, 'lecitina': GREY}
def famcol(planta, mx):
    rs = sorted([(k.split(' · ')[1], k.split(' · ')[2], v) for k, v in LPF.items() if k.startswith(planta)], key=lambda r: (r[1] != 'EGRESO', -r[2]['n']))
    out = ''
    for fam, se, v in rs:
        out += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:330px; font-size:26px; color:{TEXT}"><b>{fam}</b> · {"carga" if se == "EGRESO" else "descarga"}</p>'
                f'<div style="width:{max(6, round(v["n"] / mx * 330))}px; height:40px; background:{FAMCOL.get(fam, BLU)}; border-radius:0px 8px 8px 0px"></div>'
                f'<p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{v["n"]}</p><p style="font-size:24px; color:{BODY}; white-space:nowrap">· {v["mediana"]} min</p></div>')
    return out
mxf = max(v['n'] for v in LPF.values())
topk, topv = max(LPF.items(), key=lambda kv: kv[1]['n'])
tp_pl, tp_fam, tp_se = topk.split(' · ')
section('liq-productos', head('Líquidos' if LCW else 'Líquidos · criterio', f'Qué se mueve: {"cargas" if tp_se == "EGRESO" else "descargas"} de {tp_fam} en la {"Terminal" if tp_pl.startswith("TERMINAL") else "Ricardone"}, {round(topv["n"] / LCX["total"]["n"] * 100)} % de los ' + ('movimientos' if LCW else 'camiones'), BLU)
    + f'<p style="font-size:24px; color:{BODY}">' + (f'{LBL} · movimientos por producto y sentido · mediana puerta a puerta' if LCW else f'{ANT_LBL} · camiones de líquidos de la planilla por familia de producto y sentido · mediana puerta a puerta') + '</p>'
    + '<div style="flex:1; display:flex; flex-direction:row; gap:64px">'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:14px"><p style="font-size:30px; font-weight:600; color:{BLU}">Terminal · {TE["n"] + TI["n"]}</p>{famcol("TERMINAL", mxf)}</div>'
    + f'<div style="width:760px; display:flex; flex-direction:column; gap:14px"><p style="font-size:30px; font-weight:600; color:{BLU}">Ricardone · {ric_tot}</p>{famcol("RICARDONE", mxf)}</div></div>'
    + key(f'La Terminal hace el {round((TE["n"] + TI["n"]) / LCX["total"]["n"] * 100)} % de los ' + ('movimientos' if LCW else 'camiones') + f' de líquidos y el {round(TE["n"] / (TE["n"] + TI["n"]) * 100)} % de ellos son cargas; Ricardone casi solo descarga ({RI["n"]} de {ric_tot}).') + (nota('Productos, plantas y sentidos: planilla de movimientos (Excel).') if LCW else ''),
    ('' if LCW else 'Mismo criterio de la lámina anterior. ') + 'Familias: aceite (crudo, para refinar, refinado, oleico, desgomado, neutro), borras, glicerina (cruda, refinada, substandard), insumos químicos (metanol, metilato, ácidos, soda, hipoclorito). '
    + '; '.join(f'{k.replace("TERMINAL_EMBARQUE", "Terminal").replace("RICARDONE", "Ricardone").replace(" · EGRESO", " · cargas").replace(" · INGRESO", " · descargas")}: {v["n"]} (mediana {v["mediana"]} min, media {v["media"]})' for k, v in LPF.items()) + '.', gap=24)
LT = JC('liquidos-sl1-tramos.json') if LCW and os.path.exists(os.path.join(CAL_DIR, 'liquidos-sl1-tramos.json')) else None
if LT:
    TT = LT['tramos']; tk = ['ing>bal', 'bal>carga', 'carga>bals', 'bals>sal']
    tv = [TT[k]['mediana'] for k in tk]; tn = [TT[k]['n'] for k in tk]
    tsum = sum(tv); ace = LPF.get('TERMINAL_EMBARQUE · aceite · EGRESO', {'n': LT['operaciones'], 'mediana': LT['p2pMediana']})
    imt = max(range(4), key=lambda i: tv[i])
    TLAB = ['el ingreso a la balanza', 'la espera para cargar (balanza → carga)', 'la carga hasta la balanza de salida', 'la salida']
    prd = ' · '.join(f'{k.lower().replace("aceite ", "")} {v}' for k, v in sorted(LT['productos'].items(), key=lambda kv: -kv[1]))
    section('liq-tramos', head('Líquidos', f'Cargas de aceite en la Terminal: el tramo más largo es {TLAB[imt]}', BLU, 56)
        + tramos([('Ingreso', 'Ingreso → Balanza'), ('Espera y carga', 'Balanza → Carga OSL'), ('Pesada', 'Carga → Balanza salida'), ('Salida', 'Balanza → Salida')],
                 tv, ['#A9C8E6', BLU, BMID, '#CFE0F0'], [TEXT, BLU, BLU, TEXT], [('b', 0, 4, f'Terminal · {tsum} min ({hm(tsum)}), suma de medianas', BLU, BLU)])
        + '<div style="display:flex; flex-direction:row; gap:24px">'
        + kcard(f'Puerta a puerta · {hm(ace["mediana"])}', f'{ace["mediana"]} min', BLU, BLU)
        + kcard('Cargas de aceite en la semana', fmtn(ace['n']), BMID, BLU)
        + kcard('Productos', prd, '#A9C8E6', TEXT) + '</div>'
        + key(f'De los {ace["mediana"]} min de puerta a puerta, {tv[1]} se van entre la balanza y la carga en la playa OSL; pesar y salir lleva {tv[2] + tv[3]} min.')
        + nota(f'Circuito más usado (SL1, {ace["n"]} de {fmtn(LCW["total"]["n"])} movimientos). Cantidades y puerta a puerta: planilla (Excel). Tramos: mediana por cámaras ({", ".join(map(str, tn))} camiones medidos).'),
        f'Cargas de aceite a granel en la Terminal (planilla: TERMINAL_EMBARQUE · EGRESO · aceite, sin envasados ni patentes ficticias; día operativo del ingreso): {ace["n"]} movimientos ({prd}). '
        f'Tramos por patente con cámaras dentro de la estadía de la planilla (scripts/estado-planta/liquidos-tramos-terminal.py): SLZIngCamFrente → SLZBalIngFte {tv[0]} min ({tn[0]}), SLZBalIngFte → RenCargFte {tv[1]} ({tn[1]}), RenCargFte → SLZBalSC {tv[2]} ({tn[2]}), SLZBalSC → SLZSalidaC {tv[3]} ({tn[3]}); medianas. '
        f'Medias: ' + ', '.join(f'{TT[k]["media"]}' for k in tk) + f'. La suma de medianas ({tsum}) es menor que el puerta a puerta ({ace["mediana"]}) porque no todos los camiones tienen todas las lecturas.', gap=18)

# semana por cámaras
mxl = max(lq_dia) or 1
lbars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{LC["porDia"][d]["TER"] + LC["porDia"][d]["RIC"]}</p><div style="width:64px; display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                f'<div style="height:{round(LC["porDia"][d]["TER"] / mxl * 330)}px; background:{BLU}"></div><div style="height:{round(LC["porDia"][d]["RIC"] / mxl * 330)}px; background:#A9C8E6"></div></div><p style="font-size:24px; font-weight:600; color:{TEXT}; white-space:nowrap">{days[i]}</p></div>' for i, d in enumerate(DAYS))
kT, kR = LK['TER'], LK['RIC']
if LCW:
    lw = [(sum(LCW['porDia'][d].get('TERMINAL_EMBARQUE', {}).values()), sum(LCW['porDia'][d].get('RICARDONE', {}).values())) for d in DAYS]
    mxw = max(a + b for a, b in lw) or 1
    lbars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a + b}</p><div style="width:64px; display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                    f'<div style="height:{round(a / mxw * 330)}px; background:{BLU}"></div><div style="height:{round(b / mxw * 330)}px; background:#A9C8E6"></div></div><p style="font-size:24px; font-weight:600; color:{TEXT}; white-space:nowrap">{days[i]}</p></div>' for i, (a, b) in enumerate(lw))
ter_d, ter_dp = LQV['TER'] / N, LKV['TER'] / LKD
section('liq-semana', head('Líquidos · la semana', (f'{fmtn(LCW["total"]["n"])} movimientos de líquidos; la Terminal hizo {round(sum(v["n"] for k, v in LCW["porPlantaSentido"].items() if k.startswith("TERMINAL")) / LCW["total"]["n"] * 100)} %' if LCW else None) or (f'La Terminal mantuvo su ritmo: {round(ter_d)} visitas de camión por día' if abs(pct(ter_d, ter_dp)) <= 10 else f'La Terminal {"subió" if ter_d > ter_dp else "bajó"} a {round(ter_d)} visitas de camión por día ({spct(pct(ter_d, ter_dp))})'), BLU, cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Terminal San Lorenzo', BLU), ('Ricardone', '#A9C8E6')], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}">' + ('Movimientos de líquidos por día' if LCW else 'Visitas de camión a la zona de líquidos por día') + '</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{lbars}</div></div>'
    + '<div style="width:480px; display:flex; flex-direction:column; justify-content:center; gap:16px">'
    + (''.join(note(fmtn(v['n']), {'TERMINAL_EMBARQUE · EGRESO': 'cargas en la Terminal', 'TERMINAL_EMBARQUE · INGRESO': 'descargas en la Terminal', 'RICARDONE · INGRESO': 'descargas en Ricardone', 'RICARDONE · EGRESO': 'cargas en Ricardone'}.get(k, k) + (f' · mediana {v["mediana"]} min' if v.get('mediana') else ''), BLU if k.startswith('TERMINAL') else GLT, BLU if k.startswith('TERMINAL') else TEXT)
           for k, v in sorted(LCW['porPlantaSentido'].items(), key=lambda kv: -kv[1]['n'])) + '</div></div>' if LCW else '')
    + ('' if LCW else note(fmtn(LQV['TER']), f'visitas en la Terminal; {round(ter_dp)} por día en {CAL_LBL}. Cargas leídas en la playa OSL: {LC["terminalCargaDescarga"]["carga"]}.', BLU, BLU)
    + note(fmtn(LQV['RIC']), f'visitas en Ricardone ({fx(LQV["RIC"] / N)} por día; {fx(LKV["RIC"] / LKD)} en {CAL_LBL}).', GLT)
    + (note(fmtn(LCW['total']['n']), 'movimientos de líquidos en la planilla de la semana: ' + ', '.join(f'{k.replace("TERMINAL_EMBARQUE", "Terminal").replace("RICARDONE", "Ricardone").replace(" · EGRESO", " cargas").replace(" · INGRESO", " descargas")} {v["n"]}' for k, v in LCW['porPlantaSentido'].items()) + '.', BMID)
       if LCW else note(f'{round(kT["precision"] * 100)} %', f'de las visitas de la Terminal eran líquidos en la calibración; el resto, agua, residuos y varios.', BMID))
    + '</div></div>'),
    ('Movimientos de líquidos por día (Terminal/Ricardone): ' + ', '.join(f'{days[i].lower()} {a}/{b}' for i, (a, b) in enumerate(lw)) + '. Sin Renopack ni patentes ficticias.') if LCW else
    f'Estimación SOLO con cámaras (liquidos-camaras.cjs): visita = lecturas de una patente en una planta separadas por menos de 4 h. Terminal: entrada (SLZIngCamFrente o SLZBalIngFte) y alguna lectura de carga/descarga OSL, tanques (SLZTK400), balanza de líquidos o calada SL, sin volcable del puerto ni carga de sólido en Ricardone antes. '
    f'Ricardone: pre-ingreso y calle líquida o balanza 2, sin Playa 3, calada sólida, silo ni volcable, y sin ir a la Terminal después (eso es pellet o soja). '
    f'Calibración contra la planilla en {CAL_LBL} (criterio por producto): Terminal {kT["visitasCamara"]} visitas para {kT["movimientosPlanilla"]} movimientos de líquidos; {kT["conVisita"]} movimientos tuvieron visita ({round(kT["cobertura"] * 100)} %) y el {round(kT["precision"] * 100)} % de las visitas era un líquido ({kT["porFamiliaPlanilla"].get("agua", 0)} agua, {kT["porFamiliaPlanilla"].get("otro", 0)} otros productos). '
    f'Ricardone: {kR["visitasCamara"]} visitas para {kR["movimientosPlanilla"]} movimientos; cobertura {round(kR["cobertura"] * 100)} %, precisión {round(kR["precision"] * 100)} %: con tan pocos camiones por día, la cifra de Ricardone es solo indicativa. '
    f'Visitas por día (Terminal/Ricardone): ' + ', '.join(f'{days[i].lower()} {LC["porDia"][d]["TER"]}/{LC["porDia"][d]["RIC"]}' for i, d in enumerate(DAYS)) + '. Desde el 05/10 la cámara RenDescFte (descarga OSL) lee camiones; antes solo leía la de carga. No son movimientos: ' + ('la planilla dará cargas y descargas por producto.' if CAMARAS else 'los movimientos de la planilla, por planta y sentido, van en la nota de la derecha.'), gap=28)

# ------------------------------------------------------------------ sectores
divider('div-sectores', '05', 'Sectores', 'Calada, volcables y silos: dónde se concentró la actividad de la semana.', GDK, GLT)
calles = sorted([(f'Calle {k[-1]}', v) for k, v in CAL['porCalle'].items()] + [(f'Calle {n}', 0) for n in '123456' if f'RicCal0{n}' not in CAL['porCalle']], key=lambda x: -x[1])
ccol = [GDK, GDK, GLT, GLT, GXLT, GXLT]
crows = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:140px; font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="width:{max(6, round(b / (calles[0][1] or 1) * 560))}px; height:48px; background:{ccol[i]}; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(b)}</p></div>' for i, (a, b) in enumerate(calles))
calles_tot = sum(CAL['porCalle'].values())
c34 = CAL['porCalle'].get('RicCal04', 0) + CAL['porCalle'].get('RicCal03', 0)
p34 = round(c34 / calles_tot * 100)
cal_dia, cal_dia_prev = CAL['camiones'] / N, PUB['cal'] / ANT_N
c12 = [d for d in DAYS if CAL['calleDia'][d].get('RicCal01', 0) or CAL['calleDia'][d].get('RicCal02', 0)]
section('calada', head('Sectores · calada', ('Calada con menos recorridos por día, solo por las calles 3 y 4' if p34 >= 99 else f'Calada con menos recorridos por día: las calles 3 y 4 hicieron el {p34} %') if cal_dia < cal_dia_prev else f'Calada: las calles 3 y 4 hicieron el {p34} %', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · recorridos de cámara por calle ({calles_tot - CAL["camiones"]} pasaron por dos)</p><div style="display:flex; flex-direction:column; gap:20px">{crows}</div></div>'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Horas con actividad, sobre {HOURS}</p><div style="display:flex; flex-direction:column; gap:16px">'
    + occ('Ricardone sólida', f'{fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h', round(CAL['horas'] / HOURS * 100), GDK)
    + occ('Ricardone líquida', f'{fmtn(LIQ["camiones"])} recorridos en {LIQ["horas"]} h', round(LIQ['horas'] / HOURS * 100), VMID)
    + occ('San Lorenzo', f'{fmtn(CSL["camiones"])} recorridos en {CSL["horas"]} h', round(CSL['horas'] / HOURS * 100), VMID) + '</div></div></div>'
    + key(f'{fmtn(cal_dia)} recorridos por día, contra {fmtn(cal_dia_prev)} en el comité anterior ({round((1 - cal_dia / cal_dia_prev) * 100)} % menos). ' + (f'Las calles 1 y 2 abrieron solo el {y_([full[iD[d]] for d in c12], last=" y el ")}.' if c12 else 'Las calles 1 y 2 no abrieron: toda la semana con la 3 y la 4.')),
    f'Calada por calle, semana completa: ' + ', '.join(f'{a.lower()} {b}' for a, b in calles) + f'. Suman {fmtn(calles_tot)}, no {fmtn(CAL["camiones"])}, porque algunos recorridos pasaron por dos calles. Horas = horas con al menos una lectura, sobre {HOURS} ({N} días). '
    f'Por día: {", ".join(map(str, CAL["porDia"]))}. Pico: {CAL["pico"]} recorridos ({CAL["picoLabel"]}). Comité anterior: {fmtn(PUB["cal"])} recorridos en {ANT_N} días ({PUB["cal_h"]} h con actividad), con el transile R29 pasando por la calada. '
    f'Calada líquida {fmtn(LIQ["camiones"])} en {LIQ["horas"]} h (comité anterior {fmtn(PUB["liq_cal"])}; por día {", ".join(map(str, LIQ["porDia"]))}): cuenta también los camiones de pellet, que entran por la calle líquida rumbo a Playa 3. Fuente: paquete del dashboard sobre la {RUNTXT}.', gap=28)

def cell(v, col=GMID):
    if v >= 20: return f'<div style="width:44px; height:52px; background:{col}; border-radius:10px"></div>'
    if v > 0: return f'<div style="width:44px; height:52px; background:{GXLT}; border:3px solid {GLT}; border-radius:10px"></div>'
    return f'<div style="width:44px; height:52px; border:3px dashed {LINE}; border-radius:10px"></div>'
vrows_order = sorted(VOL, key=lambda k: -sum(VOL[k]))
mxv = max(sum(v) for v in VOL.values()) or 1
dini = [DOW[wd(d)][:2] for d in DAYS]
vrows = f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:24px; color:{BODY}"></p><p style="width:520px; font-size:24px; font-weight:600; color:{BODY}">Camiones leídos en la semana</p>' + ''.join(f'<p style="width:44px; font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in dini) + f'<p style="flex:1; font-size:24px; font-weight:600; text-align:right; color:{BODY}">Días</p></div>'
for i, k in enumerate(vrows_order):
    tot = sum(VOL[k]); top_ = i == 0
    vrows += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:32px; font-weight:600; color:{TEXT}">{k}</p><div style="width:520px; display:flex; flex-direction:row; align-items:center; gap:16px"><div style="width:{max(10, round(tot / mxv * 330))}px; height:52px; background:{VIO if top_ else GMID}; border-radius:0px 8px 8px 0px"></div><p style="font-size:30px; font-weight:600; color:{VIO if top_ else TEXT}; white-space:nowrap">{fmtn(tot)} · {round(tot / VOL_TOT * 100)} %</p></div>'
              + ''.join(cell(v, VIO if top_ else GMID) for v in VOL[k])
              + f'<p style="flex:1; font-size:32px; font-weight:600; text-align:right; color:{VIO if top_ else TEXT}">{sum(1 for v in VOL[k] if v >= 20)}</p></div>')
# cambio de volcable: último día con 20 o más de la principal y primer día con 20 o más de la segunda
v1_, v2_ = vrows_order[0], vrows_order[1]
last1 = max((i for i, v in enumerate(VOL[v1_]) if v >= 20), default=None); first2 = min((i for i, v in enumerate(VOL[v2_]) if v >= 20 and (last1 is None or i > last1)), default=None)
relevo = last1 is not None and first2 is not None and first2 > last1
vtit = f'La {v1_} descargó hasta el {full[last1]}; desde el {full[first2]}, la {v2_}' if relevo else f'La {v1_} sostuvo la semana'
vcx = None
vkey = (f'Del {full[first2]} en adelante la cámara de la {v1_} casi no leyó y la de la {v2_} tomó el volumen: hay que confirmar con la planilla y mantenimiento si fue un cambio de volcable o una falla de cámara.' if relevo else 'Las cámaras de volcables leen menos camiones que los que descargan, y la balanza (SGC) no trae la calle: el reparto por volcable sale de las cámaras.' if (GMV or {}).get("balanzaSgc") else 'Las cámaras de volcables leen menos camiones que los que descargan: la planilla dará las descargas por volcable.')
# con planilla: descargas R7 por calle declarada (panel volcable_san_lorenzo del paquete) confirman o no el relevo
VSL = X['paquete']['actividad']['volcable_san_lorenzo']['porDia']
VPL = {k: [sum(c['camiones'] for c in VSL.get(d, {}).get('porCalle', []) if c['camara'] == f'Volcable {k[1]}') for d in DAYS] for k in VOL}
if not CAMARAS and relevo and sum(VPL[v1_]) + sum(VPL[v2_]) > 0:
    lastp = max((i for i, v in enumerate(VPL[v1_]) if v > 0), default=None)
    solo = lastp + 1 if lastp is not None and lastp + 1 < N and all(VPL[v1_][i] == 0 for i in range(lastp + 1, N)) and VPL[v2_][lastp + 1] > 0 else None
    swp = min((i for i in range(N) if VPL[v2_][i] > VPL[v1_][i] and VPL[v1_][i] > 0), default=None)
    if solo is not None:
        vtit = f'La {v1_} descargó hasta el {full[lastp]}; desde el {full[solo]}, solo la {v2_}'
        vcx = f'La planilla confirma el cambio de volcable: desde el {full[solo]} descargó solo la {v2_}. En la semana, {v1_} {sum(VPL[v1_])} y {v2_} {sum(VPL[v2_])} descargas R7.'
        vkey = (f'La planilla confirma el cambio de volcable: ' + (f'el {full[swp]} se repartió ({v2_} {VPL[v2_][swp]}, {v1_} {VPL[v1_][swp]} descargas R7) y ' if swp is not None else '')
                + f'desde el {full[solo]} descargó solo la {v2_} ({y_([str(v) for v in VPL[v2_][solo:]])}). En la semana: {v1_} {sum(VPL[v1_])} y {v2_} {sum(VPL[v2_])} descargas R7 según planilla.')
    else:
        vkey = f'Descargas R7 por volcable según planilla: ' + ', '.join(f'{k} {sum(VPL[k])}' for k in vrows_order if sum(VPL[k])) + '.'
section('volcables', head('Sectores · volcables puerto', vtit, VIO, cam=True)
    + f'<div style="display:flex; flex-direction:column; gap:18px">{vrows}</div>'
    + legend([('20 camiones o más', GMID), ('Entre 1 y 19', GXLT)])
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p(f'{v1_} leyó el <b>{round(sum(VOL[v1_]) / VOL_TOT * 100)} %</b> de los camiones ({fmtn(sum(VOL[v1_]))} de {fmtn(VOL_TOT)}); la {v2_}, el {round(sum(VOL[v2_]) / VOL_TOT * 100)} %.' + (f' La V4 es la del pellet ({sum(VOL["V4"])}, el {y_([full[i] for i, v in enumerate(VOL["V4"]) if v >= 5])}).' if PEL_OP and any(v >= 5 for v in VOL['V4']) else ''), 28, BODY, '; flex:1')
    + '<div style="flex:1">' + key(vkey) + '</div></div>',
    f'Camiones distintos leídos por cada cámara de volcable del puerto (SLZVolcableC1 a C5) por día calendario, {LBL} (metricas-camaras.cjs). Incluye el pellet de la V4. Por día: '
    + '; '.join(f'{k} ' + '/'.join(map(str, VOL[k])) for k in vrows_order) + '. '
    + (f'Planilla (panel del dashboard: descargas R7 con la calle que declara la planilla) por día: ' + '; '.join(f'{k} ' + '/'.join(map(str, VPL[k])) for k in vrows_order if sum(VPL[k])) + '. ' if not CAMARAS else
       'Sin planilla, el panel del dashboard (descargas R7 con la calle que declara la planilla) da 0: por eso esta lámina usa las lecturas directas. ') +
    f'De los {R7["viajes"]} viajes R7 medidos por cámaras, {R7["viajes"] - RC["porVolcable"].get("sin lectura", 0)} tienen la volcable leída: ' + ', '.join(f'{k} {v}' for k, v in sorted(RC['porVolcable'].items(), key=lambda kv: -kv[1])) + '. '
    f'En {CAL_LBL}, la planilla asignó {", ".join(f"{k} {v}" for k, v in sorted(R7P.get("calibracion", {}).get("planillaPorVolcable", {}).items(), key=lambda kv: -kv[1]))} descargas R7.', gap=24)

VH = JC('volcables-historico.json') if os.path.exists(os.path.join(CAL_DIR, 'volcables-historico.json')) else None
if VH:
    MESN = {'2026-08': 'Agosto', '2026-09': 'Septiembre', '2026-10': 'Octubre'}
    MCOL = {'2026-08': '#B9CFE6', '2026-09': '#5B8DC0', '2026-10': VIO}
    mlast = DAYS[-1]
    MS = [m for m in sorted(VH['meses']) if m in MESN]
    VK = ['V1', 'V2', 'V3', 'V4', 'V5']
    def vmes(m, k):
        v = VH['meses'][m]['volcables'].get(k, {})
        return sum(v.get('porDia', [])[:int(mlast[8:10])]) if m == mlast[:7] else v.get('descargas', 0)
    mdias = {m: (int(mlast[8:10]) if m == mlast[:7] else VH['meses'][m]['dias']) for m in MS}
    mlbl = {m: (f'{MESN[m]} (1–{int(mlast[8:10])})' if m == mlast[:7] else MESN[m]) for m in MS}
    pdia = {m: {k: vmes(m, k) / mdias[m] for k in VK} for m in MS}
    mtot = {m: sum(vmes(m, k) for k in VK) for m in MS}
    vt = {k: sum(vmes(m, k) for m in MS) for k in VK}; vtt = sum(vt.values()) or 1
    mxp = max(v for m in MS for v in pdia[m].values()) or 1
    H = 300
    groups = ''
    for k in VK:
        bars = ''.join(f'<div style="display:flex; flex-direction:column; align-items:center; justify-content:end; gap:6px"><p style="font-size:24px; font-weight:{700 if m == mlast[:7] else 600}; color:{VIO if m == mlast[:7] else TEXT}">{round(pdia[m][k])}</p>'
                       f'<div style="width:62px; height:{max(4, round(pdia[m][k] / mxp * H))}px; background:{MCOL[m]}; border-radius:8px 8px 0px 0px"></div></div>' for m in MS)
        groups += (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:12px"><div style="display:flex; flex-direction:row; align-items:end; gap:8px; height:{H + 40}px">{bars}</div>'
                   f'<div style="align-self:stretch; border-top:2px solid {TEXT}; padding:10px 0px 0px 0px; display:flex; flex-direction:column; align-items:center; gap:2px"><p style="font-size:32px; font-weight:700; color:{TEXT}">{k}</p><p style="font-size:24px; color:{BODY}">{round(vt[k] / vtt * 100)} % desde agosto</p></div></div>')
    msin = sum(VH['meses'][m].get('sinCalle', 0) for m in MS)
    mo = MS[-1]; otop = max(VK, key=lambda k: pdia[mo][k]); vtop = max(VK, key=lambda k: vt[k])
    chips = ''.join(f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {MCOL[m]}; border-radius:12px; padding:14px 20px"><p style="font-size:24px; font-weight:600; color:{BODY}">{mlbl[m]}</p>'
                    f'<p style="font-size:40px; font-weight:600; line-height:1.05; color:{VIO if m == mo else TEXT}">{fmtn(mtot[m])}</p><p style="font-size:22px; color:{BODY}">descargas · {round(mtot[m] / mdias[m])} por día</p></div>' for m in MS)
    section('volcables-mes', head('Sectores · volcables puerto', f'Agosto a octubre: la {vtop} fue la volcable más usada', VIO)
        + legend([(mlbl[m], MCOL[m]) for m in MS], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}">Descargas por día de cada mes, por volcable</p>')
        + f'<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="flex:1; display:flex; flex-direction:row; gap:20px; align-items:end">{groups}</div>'
        + f'<div style="width:360px; display:flex; flex-direction:column; justify-content:center; gap:16px">{chips}</div></div>'
        + key(f'En {mlbl[mo].lower()} el puerto descargó {round(mtot[mo] / mdias[mo])} camiones por día, contra {round(mtot[MS[0]] / mdias[MS[0]])} en agosto. La {otop} siguió siendo la principal ({round(pdia[mo][otop])} por día, {round(vmes(mo, otop) / (mtot[mo] or 1) * 100)} % de octubre) y la V4 solo recibió pellet.')
        + nota('Planilla de movimientos: plataformas VOLCABLE PTO 1–5, día operativo del ingreso.' + (f' Desde el 15/10 la balanza no trae la calle: sale de la cámara de cada volcable ({fmtn(msin)} descargas sin lectura quedan fuera).' if msin else '')),
        f'Planilla de movimientos (scripts/estado-planta/volcables-historico.cjs): plataforma VOLCABLE PTO 1–5 de la Terminal, soja R7 y pata de puerto del pellet, día operativo del ingreso, sin patentes ficticias. Descargas por mes: '
        + ' '.join(f'{mlbl[m]}: ' + ', '.join(f'{k} {fmtn(vmes(m, k))}' for k in VK) + f' (total {fmtn(mtot[m])}, {mdias[m]} días).' for m in MS), gap=22)

if SI_OK:
    SD = SI['porDia']; IN = SI['internos']
    SIA = JC('silos-internos-anterior.json') if os.path.exists(os.path.join(CAL_DIR, 'silos-internos-anterior.json')) else None
    vj = [SD[d]['viajes'] for d in DAYS]; v2 = [SD[d]['volcable2'] for d in DAYS]; s7 = [SD[d]['aSilo7'] for d in DAYS]; sl = [SD[d]['sinLectura'] for d in DAYS]
    mxs = max(vj) or 1
    SLG = '#C9D3CE'
    sb = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{vj[i]}</p>'
                 f'<div style="width:72px; display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                 f'<div style="height:{round(sl[i] / mxs * 380)}px; background:{SLG}"></div><div style="height:{round(s7[i] / mxs * 380)}px; background:{GMID}"></div><div style="height:{round(v2[i] / mxs * 380)}px; background:{VMID}"></div></div>'
                 f'<p style="font-size:24px; font-weight:600; color:{TEXT}; white-space:nowrap">{days[i]}</p></div>' for i in range(N))
    tot = SI['viajes']; noct = sum(c['nocturnos'] for c in IN)
    cic = sorted(c['cicloMedianaMin'] for c in IN if c['cicloMedianaMin'])
    xl_n = sum(c['excel']['filas'] for c in IN); xl_kg = sum(c['excel']['kgsNeto'] for c in IN)
    dact = [full[i] for i in range(N) if vj[i]]
    sil_ant = silos_txt(SIA['internos']) if SIA and SIA['internos'] else ''
    tv2, ts7, tsl = sum(v2), sum(s7), sum(sl)
    section('silos', head('Sectores · silos Ricardone', f'Silos: {num_txt(len(IN))} camiones, {fmtn(tot)} viajes internos desde {SI_SILOS}', GDK, 56)
        + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + legend([('A la volcable 2', VMID), ('Al silo 7', GMID), ('Descarga sin lectura', SLG)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}">Viajes por día y destino</p>')
        + f'<div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{sb}</div></div>'
        + '<div style="width:600px; display:flex; flex-direction:column; justify-content:center; gap:16px">'
        + note(fmtn(tot), f'viajes: {y_([c["patente"] + " " + str(c["viajes"]) for c in IN])}, del {dact[0].lower()} al {dact[-1].lower()}; un viaje cada {cic[len(cic) // 2]} min por camión.', GDK, GDK)
        + note(f'{round(noct / tot * 100)} %', 'de los viajes, de noche (22 a 6 h)' + (': trabajaron las 24 horas.' if noct / tot >= 0.2 else '.'), VMID)
        + (note(fmtn(SIA['viajes']), f'viajes en el comité anterior ({ANT_LBL}), con {num_txt(len(SIA["internos"]))} camiones desde {sil_ant}.', GLT) if SIA else '')
        + '</div></div>'
        + key((f'El transile interno pasó de {fmtn(SIA["viajes"])} viajes a {fmtn(tot)} y pasó {('de ' + sil_ant).replace('de el ', 'del ')} {('a ' + SI_SILOS).replace('a el ', 'al ')}. ' if SIA and sil_ant and sil_ant != SI_SILOS else f'El transile interno pasó de {fmtn(SIA["viajes"])} viajes a {fmtn(tot)}. ' if SIA else '')
              + f'La planilla lo registra como «productos varios» ({xl_n} egresos, {fmtn(round(xl_kg))} kg): confirmar con la planta qué se movió y por qué.', 24),
        f'Transile interno: {SI["criterio"]} (scripts/estado-planta/silos-internos.py). Por día, viajes / a volcable 2 / a silo 7 / sin lectura: '
        + '; '.join(f'{days[i].lower()} {vj[i]}/{v2[i]}/{s7[i]}/{sl[i]}' for i in range(N)) + f'. Total: {tv2} a la volcable 2, {ts7} al silo 7, {tsl} sin lectura de descarga. '
        + 'Por camión: ' + '; '.join(f'{c["patente"]} {c["viajes"]} viajes (silos {", ".join(f"{k}: {v}" for k, v in c["silos"].items())}; destinos {", ".join(f"{k} {v}" for k, v in c["destinos"].items())}; ciclo mediano {c["cicloMedianaMin"]} min; {c["nocturnos"]} de noche'
                                     + (f'; lecturas mal leídas sumadas: {", ".join(c["alias"])}' if c['alias'] else '') + f'; planilla {c["excel"]["filas"]} filas {", ".join(c["excel"]["producto"]).lower()})' for c in IN) + '. '
        + 'Otras lecturas en silos: ' + '; '.join(f'{o["patente"]} ({", ".join(f"{k} {v}" for k, v in o["lecturas"].items())}; planilla: {", ".join(o["excel"]) or "sin movimiento"})' for o in SI['otros'] if sum(o['lecturas'].values()) >= 3) + '. '
        + f'El paquete del dashboard contó {SIL["camiones"]} recorridos en silos porque une las lecturas de cada camión en un solo recorrido por día.', gap=24)

sbars = daybars(SIL['porDia'], days, lambda i, v: GDK if v >= 5 else GLT, 380, 64)
silcam = SIL['porCalle']
section('silos-old' if SI_OK else 'silos', head('Sectores · silos Ricardone', 'Silos: transiles internos en Ricardone, sin envíos al puerto' if SIL_INT else 'Silos casi quietos: no hubo transile R29' if not r29['metricas']['total'] else f'Silos: {r29["metricas"]["total"]} transiles R29', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Recorridos de cámara en silos por día (carga y descarga)</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{sbars}</div></div>'
    + '<div style="width:480px; display:flex; flex-direction:column; gap:28px">'
    + p(f'<b>{SIL["camiones"]} recorridos</b> en silos en toda la semana, contra {fmtn(PUB["sil"])} en el comité anterior ({ANT_N} días).', 28)
    + p((f'Las cámaras de silos leyeron cargas ({sum(r29["silosCarga"])}) y descargas ({sum(r29["silosDesc"])}) de lunes a viernes: movimientos internos de la planta. Ninguno siguió al puerto (sin transile R29).' if SIL_INT else f'Ninguna patente hizo la vuelta del transile (carga en silo → calada → volcable del puerto).') + f' El comité anterior tuvo {fmtn(PUB["r29"])} transiles R29 en la planilla, del 24 al 29/09.' if not r29['metricas']['total'] else '', 28)
    + key('Pendiente: analizar los transiles internos de la semana (qué silos y con qué destino).' if SIL_INT else 'La soja de la semana entró directo por la calada; los silos no movieron soja al puerto.' if not r29['metricas']['total'] else 'Transile R29 activo.') + '</div></div>',
    f'Recorridos de cámara en silos por día ({", ".join(map(str, SIL["porDia"]))}); por cámara: ' + ', '.join(f'{k} {v}' for k, v in silcam.items()) + '. '
    f'Transile R29 por cámaras (metricas-camaras.cjs: carga en silo → calada → egreso → volcable del puerto): {r29["metricas"]["total"]} vueltas. Camiones leídos en carga de silo por día: {", ".join(map(str, r29["silosCarga"]))}. Con la planilla se confirma con los egresos SOJA · SILO_CHIEF.', gap=28)

# ------------------------------------------------------------------ cierre
def cx(big, title, txt, band):
    return f'<div style="display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.07); border:1px solid rgba(241,246,242,0.18); border-top:6px solid {band}; border-radius:16px; padding:24px 28px"><p style="font-size:48px; font-weight:600; line-height:1; color:#F1F6F2">{big}</p><h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{band}">{title}</h3><p style="font-size:24px; line-height:1.4; color:#D6E4DA">{txt}</p></div>'
add('cruces', f'<section id="cruces" data-transition="fade" style="background:{VIO}; color:#F1F6F2; font-family:{FONT}; padding:96px 128px 96px; display:flex; flex-direction:column; gap:28px"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, #2E1B4E 0%, #1F3A38 60%, #0B5638 100%)"></div>'
    f'<div style="display:flex; flex-direction:column; gap:12px"><p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Cierre · análisis general</p><h2 style="font-size:72px; font-weight:600; line-height:1.1; color:#F1F6F2">La semana en seis lecturas</h2></div>'
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cx(f'{R7["total"]} min', 'La soja, más rápida' if d_tot < 0 else 'La soja, más lenta' if d_tot > 0 else 'La soja, igual', f'Puerta a puerta {"de la planilla" if P2P_PLAN else "por cámaras"}, {sgn(d_tot)} min contra el comité anterior ({PUB["total"]}); {ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio.', GLT)
    + cx(f'{APR}{fmtn(r7_dia)}', 'Semana liviana' if LIVIANA else 'Semana cargada' if PESADA else 'Volumen parecido', f'Camiones R7 por día ({spct(pct(r7_dia, r7_dia_prev))}); la calada hizo {fmtn(cal_dia)} recorridos por día contra {fmtn(cal_dia_prev)}.', GLT)
    + (cx(f'{GSUM} min', 'Girasol, descarga más rápida' if GI['desc'] + GI['tara'] < PUB['g_dt'] else 'Girasol', f'Contra {PUB["g_total"]} de la semana anterior: descarga y tara {PUB["g_dt"]} → {GI["desc"] + GI["tara"]} min; Playa 1 {PUB["g_p1"]} → {GI["p1"]}.', GLT) if GIR_OK and not CAMARAS else
       cx(f'{GI["total"]} min', 'Girasol, sin la espera de septiembre', f'Por cámaras, contra {GAT["total"]} con el mismo método: la espera en Playa 3 bajó de {GAT["descarga"]} a {GI["desc"]} min.', GLT) if GIR_OK and GI['total'] < GAT['total'] else cx(fmtn(GI['rec']), 'Girasol', f'{GI["rec"]} recorridos por la volcable 2.', GLT))
    + cx(f'{v1_} → {v2_}' if relevo else v1_, 'Volcables del puerto', (vcx or f'Desde el {full[first2]} la cámara de la {v1_} casi no leyó y la {v2_} tomó el volumen. Revisar con mantenimiento.' if relevo else f'La {v1_} leyó el {round(sum(VOL[v1_]) / VOL_TOT * 100)} % de los camiones.'), '#B9A8E0')
    + (cx('Sin transile', 'Pellet', 'No hubo operativo de pellet al puerto en el período.', '#B9A8E0') if not PEL_OP else cx(f'{fmtn(PEL_N)} viajes', 'Pellet, operativo corto' if PEL_CHICO else 'Pellet', (f'{y_([full[iD[d]] for d in pdays])}, {PEL_CAM} camiones, ciclo de {pt["ciclo"]} min' + (' sin fila en el puerto.' if pt['sl'] <= 0.6 * ptp['sl'] else f', {pt["sl"]} en el puerto.') if PE['viajes'] else 'Sin transile de pellet.'), '#B9A8E0'))
    + (cx(fmtn(LCW['total']['n']), 'Líquidos de la semana', f'Terminal {TE["n"] + TI["n"]} ({TE["n"]} cargas, {TI["n"]} descargas) y Ricardone {ric_tot}.', '#B9A8E0') if LCW else
       cx(fmtn(LCR['total']['n']), 'Líquidos, con criterio nuevo', f'{ANT_LBL} recalculado por producto: Terminal {TE["n"] + TI["n"]}, Ricardone {ric_tot}. Falta aprobar el criterio y la planilla de esta semana.', '#B9A8E0'))
    + f'</div><div style="flex:1"></div><div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center"><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:180px; height:96px; object-fit:contain"><p style="font-size:24px; color:#C9D8CE">Comité de Logística Nodo Sur · {LBL}</p><img src="{BTZ_L}" alt="Bimtrazer" style="width:170px; height:80px; object-fit:contain"></div>'
    f'<aside>Lecturas para discutir en comité; no son conclusiones cerradas. Semana {LBL}, {"solo cámaras" if CAMARAS else "planilla y cámaras"} ({RUNTXT}). Soja: {APR}{fmtn(R7["est"])} {"operaciones de la planilla" if PR7 else "camiones estimados por cámaras"}, {R7["total"]} min puerta a puerta, {P2P_SRC}. '
    f'Ricardone {R7["ric"]} y San Lorenzo {R7["slz"]} min (en {CAL_LBL}, {TP["ric"]} y {TP["sl"]}). Pellet: {PEL_N} {PEL_U}. Transile R29: {r29["metricas"]["total"]}. Líquidos: {LQV["TER"]} visitas en la Terminal y {LQV["RIC"]} en Ricardone por cámaras.</aside></section>')

# ------------------------------------------------------------------ write
ORDER = ['portada', 'resumen-planta', 'dia-a-dia', 'div-soja', 'tramos-r7', 'resumen-soja', 'hallazgo', 'plantas', 'cuartos', 'historico',
         'div-pellet', 'pel-periodo', 'pel-tramos', 'pel-dias', 'pel-jornadas', 'pel-numeros', 'pellet-operativo', 'pellet-tramos', 'pellet-hist', 'div-girasol', 'girasol', 'girasol-hist',
         'div-liquidos', 'liq-criterio', 'liq-productos', 'liq-tramos', 'liq-semana', 'div-sectores', 'calada', 'volcables', 'volcables-mes', 'silos', 'cruces']
if LCW: slides = [x for x in slides if x[0] != 'liq-criterio']
ORDER = [o for o in ORDER if o in {i for i, _ in slides}]
slides = sorted([x for x in slides if x[0] in ORDER], key=lambda x: ORDER.index(x[0]))   # las láminas fuera del orden (p. ej. silos-old) no se escriben
for f in os.listdir(SL):
    if f.endswith('.html') and f[:-5] not in ORDER: os.remove(os.path.join(SL, f))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
SECC = [('s1', 'Portada, resumen de la planta y la semana día por día', 'portada'),
        ('s2', 'Soja: tiempos por tramo de R7, resumen, día por día, por planta, por horario y en contexto', 'div-soja'),
        ('s2b', 'Pellet: las dos tandas del transile, comparadas' if PI else 'Pellet: monitoreo del transile de la semana', 'div-pellet'),
        ('s3', 'Girasol: tiempos por tramo y comparación con el comité anterior', 'div-girasol'),
        ('s3b', 'Líquidos: qué se mueve y la semana' if LCW else 'Líquidos: criterio nuevo, qué se mueve y la semana por cámaras', 'div-liquidos'),
        ('s4', 'Sectores: calada, volcables del puerto y silos', 'div-sectores'),
        ('s5', 'Cierre', 'cruces')]
deck = {'v': 4, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, 'lists': 'css',
        'title': f'Comité de Logística Nodo Sur · {dd(DAYS[0])} – {dd(DAYS[-1])} {MES[int(DAYS[-1][5:7]) - 1][:3]}',
        'order': ORDER, 'cover': 'portada', 'faces': {'ibm-plex-sans': {'family': 'IBM Plex Sans', 'href': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap'}}, 'designSystems': [], 'sections': {k: {'description': d_, 'start': s} for k, d_, s in SECC if s in ORDER}}
json.dump(deck, open(os.path.join(OUT, 'project', 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# lo que este comité publica, para que el próximo lo use de «comité anterior» (datos_comite_semana.py lo lee)
lbl_c = lambda d: f'{int(d[8:10])}/{int(d[5:7])}'
ph = [dict(o, id=o['id'] if o['id'] != 'actual' else lbl_c(ANT_DAYS[-1]), comite=o['comite'] if o['id'] != 'actual' else lbl_c(ANT_DAYS[-1])) for o in ANT['pelletHistorico']]
if PI:   # tanda del informe de transile
    _a = PI['actual']; _d = sorted(PI['actual'].get('porDia') or {}) or pdays
    ph.append({'id': 'actual', 'comite': 'Actual', 'desde': _d[0], 'hasta': _d[-1], 'viajes': _a['viajes'], 'camiones': _a['camiones'], 'viajesPorCamion': round(_a['viajes'] / _a['camiones'], 1),
               'toneladas30': _a['toneladas'], 'horas': _a['horas'], 'ciclo': _a['ric'] + _a['tramos']['interplanta'] + _a['sl'], 'dias': len(_d)})
elif PEL_OP and 'horas_act' in globals():
    ph.append({'id': 'actual', 'comite': 'Actual', 'desde': pdays[0], 'hasta': pdays[-1], 'viajes': PEL_N, 'camiones': PEL_CAM, 'viajesPorCamion': round(PEL_N / PEL_CAM, 1),
               'toneladas30': PEL_N * 30, 'horas': horas_act, 'ciclo': pt['ciclo'], 'dias': len(pdays)})
json.dump({'dias': DAYS, 'comite': lbl_c(DAYS[-1]), 'modo': X['modo'],
           'series': dict(weeks=SER['weeks'] + [ANT.get('comite') or lbl_c(ANT_DAYS[-1])], TOT=TOT, P1=P1, SLZ=SLZ, GT=GT, GP=GP, GD=GD),
           'girasol': {'p1': GI['p1'], 'desc': GI['desc'], 'tara': GI['tara'], 'total': GSUM},
           'extras': {'girasol': {'ops': (X['girasol'].get('movimientos') or {}).get('operaciones') or GI['viajes']},
                      'liquidos': {'camiones': LCW['total']['n'] if LCW else LCR['total']['n']}, 'r29': {'ops': r29['metricas']['total']}},
           'pelletHistorico': ph}, open(os.path.join(D, 'publicado.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'slides': len(slides), 'R7': {k: v for k, v in R7.items()}, 'GI': GI, 'pellet': {'viajes': PE['viajes'], 'ciclo': pt['ciclo']}, 'liq': LQV, 'adentro': [ricA, slA, totA]}, ensure_ascii=False))
