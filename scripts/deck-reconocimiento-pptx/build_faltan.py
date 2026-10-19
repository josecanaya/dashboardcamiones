"""Lámina nueva: los pasos que el lote no pudo ubicar (slide14.xml, va en la posición 10)."""
import re, sys

UNP = sys.argv[1]
f = f'{UNP}/ppt/slides/slide14.xml'
x = open(f, encoding='utf8').read()
sps = {re.search(r'name="([^"]*)"', m.group(0)).group(1): m.group(0) for m in re.finditer(r'<p:sp\b.*?</p:sp>', x, re.S)}
pics = re.findall(r'<p:pic>.*?</p:pic>', x, re.S)
FONT = '<a:latin typeface="IBM Plex Sans" pitchFamily="34" charset="0"/><a:ea typeface="IBM Plex Sans" pitchFamily="34" charset="-122"/><a:cs typeface="IBM Plex Sans" pitchFamily="34" charset="-120"/>'
nid = [200]

def nxt():
    nid[0] += 1
    return nid[0]

def esc(t): return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def geom(s, x0, y0, w, h):
    s = re.sub(r'<a:off x="\d+" y="\d+"/><a:ext cx="\d+" cy="\d+"/>', f'<a:off x="{x0}" y="{y0}"/><a:ext cx="{w}" cy="{h}"/>', s, count=1)
    return re.sub(r'<p:cNvPr id="\d+" name="[^"]*">', f'<p:cNvPr id="{nxt()}" name="Item {nid[0]}">', s, count=1)

def set_text(s, t): return re.sub(r'<a:t>[^<]*</a:t>', f'<a:t>{esc(t)}</a:t>', s, count=1)

def rect(x0, y0, w, h, color, radius=False):
    g = '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 6000"/></a:avLst></a:prstGeom>' if radius else '<a:prstGeom prst="rect"><a:avLst></a:avLst></a:prstGeom>'
    i = nxt()
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="Shape {i}"></p:cNvPr><p:cNvSpPr/><p:nvPr></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x0}" y="{y0}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>{g}<a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln></a:ln></p:spPr></p:sp>'

def line(x0, y0, w, color='D3E2D7'):
    i = nxt()
    return f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{i}" name="Line {i}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="{x0}" y="{y0}"/><a:ext cx="{w}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>'

def text(x0, y0, w, h, paras, algn='l'):
    """paras: lista de párrafos; cada párrafo es lista de runs (texto, tamaño pt*100, negrita, color)."""
    ps = []
    for runs in paras:
        sz = max(r[1] for r in runs)
        rr = ''.join(f'<a:r><a:rPr lang="es-AR" sz="{s}"{" b=\"1\"" if b else ""} dirty="0"><a:solidFill><a:srgbClr val="{c}"/></a:solidFill>{FONT}</a:rPr><a:t xml:space="preserve">{esc(t)}</a:t></a:r>' for t, s, b, c in runs)
        ps.append(f'<a:p><a:pPr algn="{algn}" indent="0" marL="0"><a:lnSpc><a:spcPct val="110000"/></a:lnSpc><a:spcAft><a:spcPts val="300"/></a:spcAft><a:buNone/></a:pPr>{rr}<a:endParaRPr lang="es-AR" sz="{sz}" dirty="0"/></a:p>')
    i = nxt()
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="Text {i}"></p:cNvPr><p:cNvSpPr txBox="1"/><p:nvPr></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x0}" y="{y0}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst></a:avLst></a:prstGeom><a:noFill/><a:ln></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>{"".join(ps)}</p:txBody></p:sp>'

DARK, MUTED, GREEN, RED, VIOLET = '14281E', '4A5D52', '0B5638', 'B3261E', '4B3D7A'
out = []
out.append(set_text(geom(sps['Text 0'], 812800, 711200, 4300000, 289520), 'LOS PASOS QUE FALTAN · SEMANA 12 AL 18'))
out.append(set_text(sps['Text 1'], 'Falta 1 camión de 540: ADS392, 8 de 3.432 pasos (0,2 %); ninguna cámara leyó su patente'))

# Tabla
X0, W = 812800, 10566400
COLS = [(889000, 1250000, 'Camión'), (2200000, 2050000, 'Circuito · visita (Excel)'), (4380000, 3000000, 'Pasos sin ubicar'), (7520000, 3780000, 'Qué vio la cámara')]
HY, HH = 1843881, 314920
out.append(rect(X0, HY, W, HH, GREEN))
for cx, cw, lab in COLS:
    out.append(text(cx, HY + 50800, cw, 238720, [[(lab, 1200, True, 'F1F6F2')]]))

filas = [
    ('ADS392', '8 pasos · las dos plantas',
     [[('R7 · soja Ricardone → puerto', 1300, True, DARK)], [('Mar 13/10 19:47 → 20:57', 1200, False, MUTED)]],
     [[('Ricardone: Preingreso, Calada y Salida', 1200, False, DARK)], [('Puerto: Ingreso, Balanza ingreso, Volcables, Balanza egreso y Egreso', 1200, False, DARK)]],
     [[('Ninguna cámara leyó la patente. Solo un fragmento ', 1200, False, DARK), ('A92', 1200, True, VIOLET), (' en el volcable 5 a las 20:37, la plataforma que figura en el Excel.', 1200, False, DARK)],
      [('Hay que revisar las fotos del DSS de esa noche.', 1100, False, MUTED)]]),
]
RH = 1180000
y = HY + HH
for pat, sub, circ, pasos, vio in filas:
    out.append(rect(X0, y, W, RH, 'FCFDFB'))
    out.append(text(COLS[0][0], y + 110000, COLS[0][1], RH - 160000, [[(pat, 1600, True, RED)], [(sub, 1100, False, MUTED)]]))
    out.append(text(COLS[1][0], y + 110000, COLS[1][1], RH - 160000, circ))
    out.append(text(COLS[2][0], y + 110000, COLS[2][1], RH - 160000, pasos))
    out.append(text(COLS[3][0], y + 110000, COLS[3][1], RH - 160000, vio))
    y += RH
    out.append(line(X0, y, W))

# Antes / después
BY, BH = y + 300000, 1300000
out.append(rect(X0, BY, W, BH, 'E3ECE5', radius=True))
out.append(text(X0 + 230000, BY + 150000, 2350000, BH - 250000, [[('Antes de la corrección', 1200, True, GREEN)], [('34 pasos · 1 %', 2000, True, DARK)], [('en 7 camiones', 1200, False, MUTED)]]))
out.append(text(X0 + 2750000, BY + 150000, W - 2980000, BH - 250000, [
    [('Recuperados: ', 1200, True, DARK), ('AVB781', 1200, True, GREEN), (' (leyó IVB7874 y el DSS lo tomó por un auto) · ', 1200, False, DARK), ('STN281', 1200, True, GREEN), (' (STK281 en el puerto, sin lectura en Ricardone) · ', 1200, False, DARK), ('GFP699', 1200, True, GREEN), (' (glicerina del puerto, no de Ricardone) · ', 1200, False, DARK), ('AD602QY', 1200, True, GREEN), (' (visita de 18 h) · ', 1200, False, DARK), ('OJP930', 1200, True, GREEN), (' · ', 1200, False, DARK), ('GZI868', 1200, True, GREEN), (' (lecturas cortadas GZI04 y GZI, que arrancan igual que su patente)', 1200, False, DARK)],
    [('Fuera del lote: ', 1200, True, DARK), ('ROO085', 1200, True, DARK), (' tenía ingreso y salida en el mismo minuto y ninguna cámara lo vio: registro sin visita.', 1200, False, DARK)],
    [('Pasa a faltante: ', 1200, True, DARK), ('ADS392', 1200, True, RED), (' figuraba completo por una lectura asignada 6 h después de su salida.', 1200, False, DARK)],
]))

foot = set_text(sps['Text 101'], 'Algoritmo por lote · pasos = camiones del lote que debían pasar por el nodo según su circuito · hora de Argentina · 10')
out.append(foot)

start = x.index('</p:grpSpPr>') + len('</p:grpSpPr>')
end = x.index('</p:spTree>')
x = x[:start] + ''.join(out) + ''.join(pics) + x[end:]
open(f, 'w', encoding='utf8').write(x)

# Notas
import glob, os
rels = open(f'{UNP}/ppt/slides/_rels/slide14.xml.rels', encoding='utf8').read()
m = re.search(r'Target="\.\./notesSlides/(notesSlide\d+\.xml)"', rels)
if m:
    nf = f'{UNP}/ppt/notesSlides/{m.group(1)}'
    n = open(nf, encoding='utf8').read()
    nota = ('Pasos que el algoritmo por lote no pudo ubicar en la semana del 12 al 18 de octubre, después de la corrección del 19/10: '
            '8 de 3.432 (0,2 %), todos de ADS392 (R7, 13/10): ninguna lectura, solo «A92» en el volcable 5. GZI868 se recuperó con lecturas cortadas que arrancan igual que la patente. Correcciones: lecturas con caracteres de más (IVB7874 → AVB781), no descartar como auto una lectura parecida a un camión '
            'pendiente, ingreso del Excel como ancla con patente casi exacta, circuito según la planta del movimiento, registros sin visita fuera del lote, '
            'ventana de visita hasta la salida del Excel y lectura posterior en una salida de planta como confirmación.')
    n = re.sub(r'<a:t>[^<]*</a:t>', f'<a:t>{esc(nota)}</a:t>', n, count=1)
    open(nf, 'w', encoding='utf8').write(n)
print('ok', 'notas' if m else 'sin notas')
