"""Línea de tiempo del operativo de pellet por patente, un bloque por carta de porte (pedido 06/11).
Viaje = carta de porte de pellet Ricardone (21832) → puerto (25567), sin anuladas: la carta es la verdad.
Horarios = lecturas de cámara del camión (vínculo) alrededor de la salida de la carta:
  ingreso = primera lectura en Ricardone después de la salida de la carta anterior del mismo camión (hasta 8 h antes);
  salida  = última lectura de egreso del puerto antes de la salida de la carta siguiente (hasta 10 h después).
Si falta una de las dos, se estima con la salida de la carta y la mediana del operativo, y el bloque va en tono claro.
Uso: python scripts/estado-planta/pellet-linea-tiempo-xlsx.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.xlsx>
"""
import json, sys, collections, statistics as st, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
cartas = [x for x in json.load(open(CF, encoding='utf-8')) if x['typeCode'] == 284 and x.get('derivedProductCode') == 199
          and x['originPlant'] == '21832' and x['plant'] == '25567' and x.get('stateCode') != 'AN' and x.get('departure')]
cartas = [x for x in cartas if D0 <= od(loc(x['departure'])) <= D1]
plate = lambda c: c['plates'][0]
CT = {x['ctg'] for x in cartas}
R = collections.defaultdict(set); RV = collections.defaultdict(set)
for t in json.load(open(VF, encoding='utf-8'))['camiones']:
    if t['ctg'] in CT:
        for l in t['lecturas']:
            R[t['plate']].add((H(l['hora'], l['at'][:4]), l['nodo']))
            if (l.get('camara') or '').startswith('SLZVolcableC'): RV[t['plate']].add((H(l['hora'], l['at'][:4]), 'V' + l['camara'][-1]))
RIC_IN = ('ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Balanza Ingreso', 'ricardone:Playa 3')
SL_OUT = ('san_lorenzo:Egreso', 'san_lorenzo:Balanza Egreso')
byp = collections.defaultdict(list)
for c in cartas: byp[plate(c)].append(c)
V = []
for p, cs in byp.items():
    cs.sort(key=lambda c: c['departure']); L = sorted(R.get(p, ()))
    prev_se = None
    for i, c in enumerate(cs):
        dep = loc(c['departure'])
        # el ingreso se busca desde que el camión salió del puerto en el viaje anterior, sin tope de horas:
        # si volvió y esperó toda la noche en Playa 3, eso es fila, no descanso (caso TOE184 31/10, revisado 06/11)
        a = prev_se or (loc(cs[i - 1]['departure']) if i else dep - dt.timedelta(hours=8))
        b = min(loc(cs[i + 1]['departure']) if i + 1 < len(cs) else dep + dt.timedelta(hours=10), dep + dt.timedelta(hours=10))
        ri = next((t for t, n in L if a < t <= dep + dt.timedelta(minutes=30) and n in RIC_IN), None)
        se = next((t for t, n in reversed(L) if dep <= t < b and n in SL_OUT), None)
        # si la cámara no leyó el ingreso o la salida, se usa la primera lectura del camión en Ricardone
        # o la última en el puerto de ese viaje (lectura real); la mediana queda solo si no hay ninguna
        ri_c = ri or next((t for t, n in L if a < t <= dep + dt.timedelta(minutes=30) and n.startswith('ricardone')), None)
        se_c = se or next((t for t, n in reversed(L) if dep <= t < b and n.startswith('san_lorenzo')), None)
        vol = next(((t, k) for t, k in sorted(RV.get(p, ())) if dep <= t < b), (None, None))
        prev_se = se or se_c
        V.append({'p': p, 'n': i + 1, 'ctg': c['ctg'], 'dep': dep, 'ri': ri, 'se': se, 'ri_c': ri_c, 'se_c': se_c, 'tv': vol[0], 'vol': vol[1]})
m_in = st.median((v['dep'] - v['ri']).total_seconds() for v in V if v['ri'])
m_out = st.median((v['se'] - v['dep']).total_seconds() for v in V if v['se'])
for v in V:
    v['est'] = not (v['ri_c'] and v['se_c'])          # tono claro solo si hubo que estimar sin ninguna lectura
    v['aprox'] = not (v['ri'] and v['se']) and not v['est']   # se usó otra lectura de la misma planta
    v['ri'] = v['ri'] or v['ri_c'] or v['dep'] - dt.timedelta(seconds=m_in)
    v['se'] = v['se'] or v['se_c'] or v['dep'] + dt.timedelta(seconds=m_out)
for p in byp:   # un viaje no puede empezar antes de que termine el anterior del mismo camión
    vs = sorted((v for v in V if v['p'] == p), key=lambda v: v['n'])
    for x, y in zip(vs, vs[1:]):
        if y['ri'] < x['se']: y['ri'] = x['se']
# ---------- Excel: una fila por patente, columnas de 30 min
F = 'Arial'; f = lambda **k: Font(name=F, **k)
fill = lambda c: PatternFill('solid', start_color=c, end_color=c)
OSC, CLA, EST1, EST2, VUE, DES = '5E4428', '9A7650', 'D9C4A6', 'E8DCC8', 'F3EADF', 'D9D9D9'
SL = 30; step = dt.timedelta(minutes=SL)
t0 = min(v['ri'] for v in V).replace(minute=0); t1 = max(v['se'] for v in V)
S = []
while t0 <= t1: S.append(t0); t0 += step
pats = sorted(byp, key=lambda p: (-len(byp[p]), p))
wb = Workbook(); ws = wb.active; ws.title = 'Línea de tiempo'
ws['A1'] = 'Operativo de pellet Ricardone → puerto: un bloque por viaje (carta de porte), de que entra a Ricardone hasta que sale del puerto'
ws['A1'].font = f(bold=True, size=13)
ws['A2'] = (f'{len(cartas)} viajes · {len(byp)} camiones · columnas de {SL} min · el número es el viaje del camión; dos tonos para separar viajes seguidos; '
            'tono claro = horario estimado (faltó la lectura de ingreso o de salida); beige = vuelta y fila hasta el viaje siguiente; gris = descanso de 6 h o más')
ws['A2'].font = f(size=9, italic=True)
leg = [(OSC, 'viaje'), (CLA, 'viaje siguiente'), (EST1, 'horario estimado'), (VUE, 'vuelta / fila'), (DES, 'descanso ≥ 6 h')]
for k, (c, t) in enumerate(leg):
    ws.cell(row=3, column=3 + k * 14).fill = fill(c); ws.cell(row=3, column=4 + k * 14, value=t).font = f(size=9)
R0 = 6; C0 = 3
ws.column_dimensions['A'].width = 10; ws.column_dimensions['B'].width = 7
ws.cell(row=R0 - 1, column=1, value='Patente').font = f(bold=True, size=9); ws.cell(row=R0 - 1, column=2, value='Viajes').font = f(bold=True, size=9)
DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
sep = Side(style='thin', color='14281E')
for k, s in enumerate(S):
    col = C0 + k; ws.column_dimensions[get_column_letter(col)].width = 1.9
    if s.minute == 0 and s.hour % 2 == 0:
        x = ws.cell(row=R0 - 1, column=col, value=s.hour); x.font = f(size=7)
    if (s.hour == 0 and s.minute == 0) or k == 0:
        ws.cell(row=R0 - 2, column=col, value=f'{DIAS[s.weekday()]} {s.day}/{s.month}').font = f(bold=True, size=9)
nR = len(pats)
for i, p in enumerate(pats):
    r = R0 + i; vs = sorted((v for v in V if v['p'] == p), key=lambda v: v['n'])
    ws.cell(row=r, column=1, value=p).font = f(bold=True, size=9)
    x = ws.cell(row=r, column=2, value=f'=COUNT(C{r}:{get_column_letter(C0 + len(S) - 1)}{r})-COUNTBLANK(C{r}:C{r})*0')
    x.value = len(vs); x.font = f(size=9); x.alignment = Alignment(horizontal='center')
    visto = set()
    for k, s in enumerate(S):
        e = s + step; c = ws.cell(row=r, column=C0 + k)
        if s.hour == 0 and s.minute == 0: c.border = Border(left=sep)
        ov = lambda v: (min(v['se'], e) - max(v['ri'], s)).total_seconds()
        v = max((v for v in vs if v['ri'] < e and v['se'] > s), key=ov, default=None)
        if v:
            col_ = (EST1 if v['n'] % 2 else EST2) if v['est'] else (OSC if v['n'] % 2 else CLA)
            c.fill = fill(col_); c.value = v['n']
            start = v['n'] not in visto
            visto.add(v['n'])
            c.font = f(size=7, bold=True, color=('FFFFFF' if not v['est'] else '14281E') if start else col_)
            c.alignment = Alignment(horizontal='center')
            if start: c.border = Border(left=Side(style='medium', color='FFFFFF'))
            continue
        prev = next((x for x in reversed(vs) if x['se'] <= s), None); nxt = next((x for x in vs if x['ri'] >= e), None)
        if prev and nxt:
            c.fill = fill(DES if (nxt['ri'] - prev['se']).total_seconds() >= 6 * 3600 else VUE)
    ws.row_dimensions[r].height = 13
# fila de totales: camiones en viaje en cada media hora (fórmula)
rt = R0 + nR + 1
ws.cell(row=rt, column=1, value='En viaje').font = f(bold=True, size=9)
for k in range(len(S)):
    L_ = get_column_letter(C0 + k)
    x = ws.cell(row=rt, column=C0 + k, value=f'=COUNT({L_}{R0}:{L_}{R0 + nR - 1})'); x.font = f(size=6); x.alignment = Alignment(horizontal='center', text_rotation=90)
ws.row_dimensions[rt].height = 22
ws.cell(row=rt + 1, column=1, value='Máximo a la vez').font = f(bold=True, size=9)
ws.cell(row=rt + 1, column=2, value=f'=MAX(C{rt}:{get_column_letter(C0 + len(S) - 1)}{rt})').font = f(bold=True, size=9)
ws.freeze_panes = ws.cell(row=R0, column=C0)
# detalle mínimo de cada bloque (para quien quiera ver la hora exacta)
wd = wb.create_sheet('Horarios por viaje')
cols = ['Patente', 'Viaje n.º', 'Carta de porte (CTG)', 'Ingreso Ricardone', 'Salida puerto', 'Ciclo (h:mm)', 'Horario']
for j, (h, w) in enumerate(zip(cols, [11, 9, 16, 17, 17, 12, 12]), 1):
    x = wd.cell(row=1, column=j, value=h); x.font = f(bold=True, color='FFFFFF'); x.fill = fill(OSC); wd.column_dimensions[get_column_letter(j)].width = w
for i, v in enumerate(sorted(V, key=lambda v: (v['p'], v['n'])), 2):
    for j, val in enumerate([v['p'], v['n'], v['ctg'], v['ri'], v['se'], f'=E{i}-D{i}', 'estimado' if v['est'] else 'medido'], 1):
        x = wd.cell(row=i, column=j, value=val); x.font = f()
        if j in (4, 5): x.number_format = 'dd/mm hh:mm'
        if j == 6: x.number_format = '[h]:mm'
wd.freeze_panes = 'B2'; wd.auto_filter.ref = f'A1:G{len(V) + 1}'
wb.save(OUT)
import os
if os.environ.get('JSON_OUT'):
    iso = lambda t: t.strftime('%Y-%m-%dT%H:%M') if t else None
    json.dump({'viajes': [{'p': v['p'], 'n': v['n'], 'ctg': v['ctg'], 'ri': iso(v['ri']), 'se': iso(v['se']), 'est': v['est'], 'aprox': v['aprox'], 'tv': iso(v['tv']), 'vol': v['vol']} for v in sorted(V, key=lambda v: (v['p'], v['n']))],
               'camiones': pats, 'cartas': len(cartas)}, open(os.environ['JSON_OUT'], 'w', encoding='utf-8'), ensure_ascii=False)
print('viajes', len(V), 'camiones', len(pats), 'estimados', sum(v['est'] for v in V), 'mediana ingreso→salida carta', round(m_in / 60), 'salida carta→egreso', round(m_out / 60))
