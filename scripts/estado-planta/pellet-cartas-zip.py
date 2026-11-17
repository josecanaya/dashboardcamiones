"""Zip con las cartas de porte del operativo de pellet: una carta por archivo (registro completo de ARCA vía la API de agro),
ordenadas por camión y número de viaje, más un índice en Excel con los horarios de la línea de tiempo.
La API no trae el PDF oficial de ARCA: cada archivo es el registro de datos de la carta.
Uso: python scripts/estado-planta/pellet-cartas-zip.py <cartas-crudas.json> <pellet-linea-tiempo.json> <salida.zip>
"""
import json, sys, zipfile, io, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
sys.stdout.reconfigure(encoding='utf-8')
CR, TL, OUT = sys.argv[1:4]
C = json.load(open(CR, encoding='utf-8'))
T = json.load(open(TL, encoding='utf-8'))
loc = lambda s: (dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)) if s else None
ESTADO = {'CN': 'Confirmada', 'CF': 'Confirmación definitiva', 'AC': 'Activa', 'AN': 'Anulada', 'DD': 'Descargada', 'RE': 'Rechazada', 'VE': 'Vencida'}
num = lambda x: int(float(x)) if x not in (None, '') else None
wb = Workbook(); ws = wb.active; ws.title = 'Cartas de porte'
cols = ['Patente (chasis)', 'Acoplado', 'Viaje n.º', 'CTG', 'Estado', 'Emisión', 'Salida', 'Ingreso Ricardone', 'Salida puerto', 'Ciclo (h:mm)', 'Ciclo',
        'Bruto (kg)', 'Tara (kg)', 'Neto (kg)', 'Bruto descarga (kg)', 'Tara descarga (kg)', 'Neto descarga (kg)', 'CUIT chofer', 'CUIT transportista', 'Observaciones', 'Archivo']
F = lambda **k: Font(name='Arial', **k)
for j, c in enumerate(cols, 1):
    x = ws.cell(row=1, column=j, value=c); x.font = F(bold=True, color='FFFFFF'); x.fill = PatternFill('solid', start_color='5E4428', end_color='5E4428')
    x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.column_dimensions[get_column_letter(j)].width = [11, 10, 8, 14, 18, 15, 15, 16, 15, 11, 14, 11, 10, 10, 13, 13, 13, 14, 15, 28, 34][j - 1]
ws.row_dimensions[1].height = 32
z = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)
viajes = sorted(T['viajes'], key=lambda v: (v['p'], v['n']))
for i, v in enumerate(viajes, 2):
    c = C[v['ctg']]; tr, ld, cab = c.get('transport', {}), c.get('load', {}), (c.get('detail') or {}).get('cabecera', {})
    arch = f"cartas/{v['p']}/viaje-{v['n']:02d}_CTG-{v['ctg']}.json"
    z.writestr(arch, json.dumps(c, ensure_ascii=False, indent=2))
    pl = tr.get('plates') or []
    r = str(i)
    vals = [v['p'], pl[1] if len(pl) > 1 else None, v['n'], str(v['ctg']), ESTADO.get(c.get('arcaStateCode'), c.get('arcaStateCode')),
            loc(c.get('issueTime')), loc(c.get('departureTime')), dt.datetime.fromisoformat(v['ri']), dt.datetime.fromisoformat(v['se']),
            f'=I{r}-H{r}', f'=IF(J{r}<4/24,"menos de 4 h",IF(J{r}<=12/24,"de 4 a 12 h","más de 12 h"))',
            num(ld.get('grossWeightKg')), num(ld.get('tareWeightKg')), f'=IF(OR(L{r}="",M{r}=""),"",L{r}-M{r})',
            num(ld.get('unloadingGrossWeightKg')), num(ld.get('unloadingTareWeightKg')), f'=IF(OR(O{r}="",P{r}=""),"",O{r}-P{r})',
            tr.get('driverCuit'), tr.get('carrierCuit'), cab.get('observaciones'), arch]
    for j, val in enumerate(vals, 1):
        x = ws.cell(row=i, column=j, value=val); x.font = F()
        if j in (6, 7, 8, 9): x.number_format = 'dd/mm hh:mm'
        if j == 10: x.number_format = '[h]:mm'
        if j in (12, 13, 14, 15, 16, 17): x.number_format = '#,##0'
n = len(viajes) + 1
ws.cell(row=n + 2, column=1, value='Total').font = F(bold=True)
for col in ('L', 'M', 'N', 'O', 'P', 'Q'):
    x = ws[f'{col}{n + 2}']; x.value = f'=SUM({col}2:{col}{n})'; x.font = F(bold=True); x.number_format = '#,##0'
ws.cell(row=n + 3, column=1, value='Horarios de ingreso y salida: lecturas de cámara asignadas a cada carta (misma línea de tiempo del operativo). Pesos: los de la carta de porte en ARCA.').font = F(italic=True, size=9)
ws.freeze_panes = 'B2'; ws.auto_filter.ref = f'A1:U{n}'
buf = io.BytesIO(); wb.save(buf); z.writestr('indice-cartas-pellet.xlsx', buf.getvalue())
z.writestr('LEEME.txt', (
    'Cartas de porte del operativo de pellet de girasol, Ricardone (planta 21832) -> puerto San Lorenzo (planta 25567), 29/10 al 3/11/2026.\n'
    f'{len(viajes)} cartas de {len({v["p"] for v in viajes})} camiones.\n\n'
    'cartas/<patente>/viaje-NN_CTG-<numero>.json: registro completo de cada carta tal como figura en ARCA (estado, origen, destino, transporte, chofer, pesos e historial de estados), obtenido de la API de agro.\n'
    'indice-cartas-pellet.xlsx: una fila por carta con patente, viaje, CTG, estado, emisión, salida, ingreso a Ricardone y salida del puerto (cámaras), ciclo y pesos.\n\n'
    'El PDF oficial de cada carta no está disponible por la API: se descarga desde ARCA con el número de CTG.\n').encode('utf-8'))
z.close()
print('cartas', len(viajes), '->', OUT)
