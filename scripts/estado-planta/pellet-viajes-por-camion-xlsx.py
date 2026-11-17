"""Anexo del operativo de pellet: viajes camión por camión en Excel (pedido 06/11).
Viaje = el mismo armado del anexo (transile-cartas-camaras.py): lecturas que el vínculo asignó a las cartas de pellet,
unidas por patente y cortadas cuando el camión vuelve a Ricardone después del puerto (o 8 h sin lecturas).
Ingreso = primera lectura de Ricardone (ingreso, pre-ingreso, calada o balanza de ingreso; si no hay, la primera del viaje).
Salida = egreso del puerto (egreso o balanza de egreso de San Lorenzo; si no hay, la última lectura del viaje).
Descanso = 6 h o más entre la salida del puerto y el ingreso siguiente a Ricardone (mismo corte que la lámina de flota).
Uso: python scripts/estado-planta/pellet-viajes-por-camion-xlsx.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.xlsx>
"""
import json, sys, collections, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
cartas = [x for x in json.load(open(CF, encoding='utf-8')) if x['typeCode'] == 284 and x.get('derivedProductCode') == 199
          and x['originPlant'] == '21832' and x['plant'] == '25567' and x.get('stateCode') != 'AN' and x.get('departure')]
cartas = [x for x in cartas if D0 <= od(loc(x['departure'])) <= D1]
CT = {x['ctg'] for x in cartas}
R = collections.defaultdict(dict)
for t in json.load(open(VF, encoding='utf-8'))['camiones']:
    if t['ctg'] in CT:
        for l in t['lecturas']: R[t['plate']][(l['at'], l['nodo'])] = (H(l['hora'], l['at'][:4]), l['nodo'])
trips = []
for p, dd in R.items():
    cur, last = {'p': p, 'L': []}, None
    for t, n in sorted(dd.values()):
        if cur['L'] and ((n.startswith('ricardone') and any(k.startswith('san_lorenzo') for _, k in cur['L'])) or (last and (t - last).total_seconds() > 8 * 3600)):
            trips.append(cur); cur = {'p': p, 'L': []}
        cur['L'].append((t, n)); last = t
    trips.append(cur)
trips = [x for x in trips if any(n == 'ricardone:Balanza Egreso' or n.startswith('san_lorenzo') for _, n in x['L'])]
first = lambda L, ns: next((t for t, n in L if n in ns), None)
lastn = lambda L, ns: next((t for t, n in reversed(L) if n in ns), None)
cpp = collections.defaultdict(list)
for c in cartas: cpp[c['plates'][0]].append(c)
V = []
for x in trips:
    L = x['L']
    ri = first(L, ('ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Balanza Ingreso'))
    be = first(L, ('ricardone:Balanza Egreso',)); si = first(L, ('san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso'))
    se = lastn(L, ('san_lorenzo:Egreso', 'san_lorenzo:Balanza Egreso'))
    est = []
    if not ri: ri = L[0][0]; est.append('ingreso')
    if not se: se = L[-1][0]; est.append('salida')
    if se <= ri: continue
    ref = be or si or ri
    c = min(cpp[x['p']], key=lambda c: abs((loc(c['departure']) - ref).total_seconds()), default=None)
    if c and abs((loc(c['departure']) - ref).total_seconds()) > 4 * 3600: c = None
    V.append({'p': x['p'], 'ri': ri, 'be': be, 'si': si, 'se': se, 'est': est, 'ctg': c['ctg'] if c else None,
              'kg': ((c.get('grossKg') or 0) - (c.get('tareKg') or 0)) if c else None})
V.sort(key=lambda v: (v['p'], v['ri']))
byp = collections.defaultdict(list)
for v in V: byp[v['p']].append(v)
for p, vs in byp.items():
    for i, v in enumerate(vs):
        v['n'] = i + 1
        v['next'] = vs[i + 1]['ri'] if i + 1 < len(vs) else None
desc = [(p, v['se'], v['next']) for p, vs in byp.items() for v in vs if v['next'] and (v['next'] - v['se']).total_seconds() >= 6 * 3600]
ncartas = collections.Counter(c['plates'][0] for c in cartas)
pats = sorted(set(byp) | set(ncartas), key=lambda p: (-ncartas.get(p, 0), p))

# ---------------- Excel
F = 'Arial'; f = lambda **k: Font(name=F, **k)
PEL, PELL, GRIS, VERDE = '5E4428', 'E3C9A3', 'D9D9D9', 'DCEDE1'
fill = lambda c: PatternFill('solid', start_color=c, end_color=c)
thin = Side(style='thin', color='D3E2D7')
FMT_DT, FMT_HM = 'dd/mm hh:mm', '[h]:mm'
wb = Workbook()

def cab(ws, row, cols, widths):
    for j, (c, w) in enumerate(zip(cols, widths), 1):
        x = ws.cell(row=row, column=j, value=c); x.font = f(bold=True, color='FFFFFF'); x.fill = fill(PEL)
        x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[row].height = 32; ws.freeze_panes = ws.cell(row=row + 1, column=2)

# Viajes
wv = wb.active; wv.title = 'Viajes'
cols = ['Patente', 'Viaje n.º', 'Carta de porte (CTG)', 'Ingreso Ricardone', 'Salida puerto', 'Ciclo (h:mm)', 'Ciclo (min)',
        'Próximo ingreso a Ricardone', 'Hasta volver (h:mm)', '¿Descansó?', 'Neto (t)', 'Nota']
cab(wv, 1, cols, [11, 9, 16, 17, 17, 12, 11, 20, 13, 11, 9, 30])
for i, v in enumerate(V, 2):
    r = str(i)
    vals = [v['p'], v['n'], v['ctg'], v['ri'], v['se'], f'=E{r}-D{r}', f'=ROUND(F{r}*1440,0)', v['next'],
            f'=IF(H{r}="","",H{r}-E{r})', f'=IF(H{r}="","fin del operativo",IF(I{r}>=6/24,"Sí","No"))',
            round(v['kg'] / 1000, 1) if v['kg'] else None,
            ('sin lectura de ' + ' ni '.join(v['est']) + ': se usó la lectura más cercana') if v['est'] else ('sin carta asociada' if not v['ctg'] else '')]
    for j, val in enumerate(vals, 1):
        x = wv.cell(row=i, column=j, value=val); x.font = f(); x.border = Border(bottom=thin)
        if j in (4, 5, 8): x.number_format = FMT_DT
        if j in (6, 9): x.number_format = FMT_HM
        if j in (2, 6, 7, 9, 10, 11): x.alignment = Alignment(horizontal='center')
nV = len(V) + 1
wv.auto_filter.ref = f'A1:L{nV}'

# Por camión
wc = wb.create_sheet('Por camión')
cols = ['Patente', 'Viajes (cartas de porte)', 'Viajes medidos', 'Primer ingreso', 'Última salida', 'Horas en el operativo',
        'Horas en viaje', 'Ciclo medio (min)', 'Descansos (≥ 6 h)', 'Horas de descanso', '% del tiempo en viaje']
cab(wc, 1, cols, [11, 12, 10, 17, 17, 13, 12, 12, 12, 12, 12])
for i, p in enumerate(pats, 2):
    r = str(i)
    vals = [p, ncartas.get(p, 0), f'=COUNTIF(Viajes!$A$2:$A${nV},A{r})',
            f'=IF(C{r}=0,"",_xlfn.MINIFS(Viajes!$D$2:$D${nV},Viajes!$A$2:$A${nV},A{r}))',
            f'=IF(C{r}=0,"",_xlfn.MAXIFS(Viajes!$E$2:$E${nV},Viajes!$A$2:$A${nV},A{r}))',
            f'=IF(C{r}=0,"",(E{r}-D{r})*24)', f'=SUMIF(Viajes!$A$2:$A${nV},A{r},Viajes!$F$2:$F${nV})*24',
            f'=IF(C{r}=0,"",ROUND(AVERAGEIF(Viajes!$A$2:$A${nV},A{r},Viajes!$G$2:$G${nV}),0))',
            f'=COUNTIFS(Descansos!$A$2:$A${len(desc) + 1},A{r})', f'=SUMIF(Descansos!$A$2:$A${len(desc) + 1},A{r},Descansos!$D$2:$D${len(desc) + 1})',
            f'=IF(OR(F{r}="",F{r}=0),"",G{r}/F{r})']
    for j, val in enumerate(vals, 1):
        x = wc.cell(row=i, column=j, value=val); x.font = f(); x.border = Border(bottom=thin)
        if j in (4, 5): x.number_format = FMT_DT
        if j in (6, 7, 10): x.number_format = '0.0'
        if j == 11: x.number_format = '0%'
        if j > 1: x.alignment = Alignment(horizontal='center')
wc.auto_filter.ref = f'A1:K{len(pats) + 1}'

# Descansos
wd = wb.create_sheet('Descansos')
cab(wd, 1, ['Patente', 'Desde (salida del puerto)', 'Hasta (vuelve a Ricardone)', 'Horas'], [11, 22, 24, 9])
for i, (p, a, b) in enumerate(sorted(desc, key=lambda x: (x[0], x[1])), 2):
    for j, val in enumerate([p, a, b, f'=(C{i}-B{i})*24'], 1):
        x = wd.cell(row=i, column=j, value=val); x.font = f(); x.border = Border(bottom=thin)
        if j in (2, 3): x.number_format = FMT_DT
        if j == 4: x.number_format = '0.0'; x.alignment = Alignment(horizontal='center')

# Camiones a la vez (por hora)
wh = wb.create_sheet('Camiones a la vez')
cab(wh, 1, ['Hora', 'En viaje a esa hora (entre ingreso a Ricardone y salida del puerto)', 'Descansando a esa hora (≥ 6 h)', 'Ingresos a Ricardone', 'Salidas del puerto'], [17, 22, 14, 13, 13])
h0 = min(v['ri'] for v in V).replace(minute=0); h1 = max(v['se'] for v in V).replace(minute=0)
HH = []
while h0 <= h1: HH.append(h0); h0 += dt.timedelta(hours=1)
nD = len(desc) + 1
for i, h in enumerate(HH, 2):
    r = str(i)
    vals = [h, f'=COUNTIFS(Viajes!$D$2:$D${nV},"<="&A{r},Viajes!$E$2:$E${nV},">"&A{r})',
            f'=COUNTIFS(Descansos!$B$2:$B${nD},"<="&A{r},Descansos!$C$2:$C${nD},">"&A{r})',
            f'=COUNTIFS(Viajes!$D$2:$D${nV},">="&A{r},Viajes!$D$2:$D${nV},"<"&A{r}+1/24)',
            f'=COUNTIFS(Viajes!$E$2:$E${nV},">="&A{r},Viajes!$E$2:$E${nV},"<"&A{r}+1/24)']
    for j, val in enumerate(vals, 1):
        x = wh.cell(row=i, column=j, value=val); x.font = f()
        x.number_format = FMT_DT if j == 1 else '0'
        if j > 1: x.alignment = Alignment(horizontal='center')
from openpyxl.chart import LineChart, Reference
ch = LineChart(); ch.title = 'Camiones en viaje y descansando, hora por hora'; ch.height = 9; ch.width = 30
ch.add_data(Reference(wh, min_col=2, min_row=1, max_col=3, max_row=len(HH) + 1), titles_from_data=True)
ch.set_categories(Reference(wh, min_col=1, min_row=2, max_row=len(HH) + 1)); ch.y_axis.title = 'camiones'
wh.add_chart(ch, 'G2')

# Línea de tiempo (una fila por patente, una columna por hora)
wt = wb.create_sheet('Línea de tiempo')
wt['A1'] = 'Línea de tiempo del operativo: una fila por camión, una columna por hora'; wt['A1'].font = f(bold=True, size=13)
leg = [(PEL, 'en viaje (de que entra a Ricardone hasta que sale del puerto); el número es el viaje n.º'), (PELL, 'vuelta y espera hasta el próximo viaje (menos de 6 h)'), (GRIS, 'descanso (6 h o más)')]
for k, (c, t) in enumerate(leg):
    wt.cell(row=2, column=2 + k * 12).fill = fill(c); x = wt.cell(row=2, column=3 + k * 12, value=t); x.font = f(size=9)
R0 = 5; wt.column_dimensions['A'].width = 10; wt.column_dimensions['B'].width = 7
wt.cell(row=R0 - 1, column=1, value='Patente').font = f(bold=True); wt.cell(row=R0 - 1, column=2, value='Viajes').font = f(bold=True)
DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
for k, h in enumerate(HH):
    col = 3 + k; wt.column_dimensions[get_column_letter(col)].width = 2.6
    x = wt.cell(row=R0 - 1, column=col, value=h.hour); x.font = f(size=7); x.alignment = Alignment(horizontal='center')
    if h.hour == 0 or k == 0:
        y = wt.cell(row=R0 - 2, column=col, value=f'{DIAS[h.weekday()]} {h.day}'); y.font = f(bold=True, size=9)
    if h.hour == 0:
        for rr in range(R0 - 1, R0 + len(pats)): wt.cell(row=rr, column=col).border = Border(left=Side(style='thin', color='14281E'))
for i, p in enumerate(pats):
    r = R0 + i
    wt.cell(row=r, column=1, value=p).font = f(bold=True, size=9); wt.cell(row=r, column=2, value=ncartas.get(p, 0)).font = f(size=9)
    vs = byp.get(p, [])
    for k, h in enumerate(HH):
        he = h + dt.timedelta(hours=1); c = wt.cell(row=r, column=3 + k)
        tv = next((v for v in vs if v['ri'] < he and v['se'] >= h), None)
        if tv:
            c.fill = fill(PEL)
            if tv['ri'] >= h: c.value = tv['n']; c.font = f(size=7, color='FFFFFF', bold=True); c.alignment = Alignment(horizontal='center')
            continue
        gap = next((v for v in vs if v['next'] and v['se'] < he and v['next'] >= h), None)
        if gap: c.fill = fill(GRIS if (gap['next'] - gap['se']).total_seconds() >= 6 * 3600 else PELL)
    wt.row_dimensions[r].height = 14
wt.freeze_panes = wt.cell(row=R0, column=3)

# Cómo leerlo (primera hoja)
wl = wb.create_sheet('Cómo leerlo', 0)
wl.column_dimensions['A'].width = 34; wl.column_dimensions['B'].width = 90
wl['A1'] = 'Operativo de pellet Ricardone → puerto · viajes camión por camión'; wl['A1'].font = f(bold=True, size=14)
filas = [('Período', f'{dt.date.fromisoformat(D0):%d/%m} al {dt.date.fromisoformat(D1):%d/%m} (día operativo de 22 a 22 h)'),
         ('Viajes (cartas de porte)', len(cartas)), ('Camiones', len(ncartas)), ('Viajes medidos en la hoja Viajes', f'=COUNTA(Viajes!A2:A{nV})'),
         ('Ciclo medio (min)', f'=ROUND(AVERAGE(Viajes!G2:G{nV}),0)'), ('Máximo de camiones en viaje a la vez', f"=MAX('Camiones a la vez'!B2:B{len(HH) + 1})"),
         ('Descansos de 6 h o más', f'=COUNTA(Descansos!A2:A{nD})'), ('', ''),
         ('Hojas', ''), ('Viajes', 'Un renglón por viaje: ingreso a Ricardone, salida del puerto, ciclo y cuánto tardó en volver. Se puede filtrar por patente.'),
         ('Por camión', 'Resumen de cada camión: viajes, primer ingreso, última salida, horas en viaje y horas de descanso.'),
         ('Descansos', 'Cada vez que un camión estuvo 6 h o más entre la salida del puerto y el siguiente ingreso a Ricardone.'),
         ('Camiones a la vez', 'Hora por hora: cuántos camiones estaban en viaje, cuántos descansando, ingresos y salidas.'),
         ('Línea de tiempo', 'Una fila por patente y una columna por hora: marrón = en viaje (con el n.º de viaje), beige = vuelta, gris = descanso.'),
         ('', ''), ('Cómo se mide', 'Ingreso = primera lectura del camión en Ricardone (ingreso, pre-ingreso, calada o balanza). Salida = egreso del puerto. Ciclo = salida − ingreso (no incluye la vuelta).'),
         ('', 'Viajes = cartas de porte de pellet Ricardone → puerto. Horarios = lecturas de las cámaras asignadas a cada carta. Si faltó la lectura de ingreso o de salida, se usó la más cercana del mismo viaje (columna Nota).'),
         ('', 'Descanso = 6 h o más sin viajar, el mismo corte de la lámina de flota del comité.')]
for i, (a, b) in enumerate(filas, 3):
    wl.cell(row=i, column=1, value=a).font = f(bold=bool(a) and i < 11 or a == 'Hojas' or a == 'Cómo se mide')
    x = wl.cell(row=i, column=2, value=b); x.font = f(); x.alignment = Alignment(wrap_text=True, vertical='top')
wl['B4'].comment = Comment('Cartas de porte ARCA de pellet (tipo 284, derivado 199), Ricardone 21832 → puerto 25567, sin anuladas.', 'BIMtrazer')
wb.save(OUT)
print('solapados', sum(1 for v in V if v['next'] and v['se'] > v['next']), 'viajes', len(V), 'camiones', len(pats), 'descansos', len(desc), 'horas', len(HH), 'estimados', sum(1 for v in V if v['est']), 'sin carta', sum(1 for v in V if not v['ctg']))
