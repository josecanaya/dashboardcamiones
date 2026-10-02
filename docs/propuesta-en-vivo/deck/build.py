# -*- coding: utf-8 -*-
"""Deck 'Ingeniería logística del Nodo Sur' sobre el PPTX 'Truckflow Vicentin · Propuesta en vivo'."""
import copy, os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_MARKER_STYLE
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'Truckflow_Vicentin_Propuesta_en_vivo.pptx')
OUT = os.path.join(HERE, '..', 'Ingenieria_logistica_Nodo_Sur.pptx')

F = 'Arial'
MONO = 'Consolas'
C = dict(ink='13202E', navy='0E1A2B', bg='F5F6F2', bg2='EEF2F4', surf='FCFDFB', line='D2DBE0', muted='4A5868',
         foot='5B6776', blue='0F6FA8', blue2='1A8FD0', green='0B5638', green2='3A8F63', amber='8A5200', amber2='C27C0E',
         amberbg='FBE9C8', bluebg='DCEEF8', greenbg='DCEDE1', light='EEF2F4', grey='C9CAC8')


def rgb(h):
    return RGBColor.from_string(h)


prs = Presentation(SRC)
SW, SH = prs.slide_width, prs.slide_height
orig = list(prs.slides)


# ---------------- helpers ----------------
def set_bg(slide, color):
    f = slide.background.fill
    f.solid()
    f.fore_color.rgb = rgb(color)


def box(slide, x, y, w, h, fill=None, line=None, radius=0.06, lw=0.75, shape=None, dash=False):
    shp = slide.shapes.add_shape(shape or (MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE),
                                 Inches(x), Inches(y), Inches(w), Inches(h))
    if radius and (shape is None):
        shp.adjustments[0] = radius
    if fill:
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
    else:
        shp.fill.background()
    if line:
        shp.line.color.rgb = rgb(line)
        shp.line.width = Pt(lw)
        if dash:
            from pptx.enum.dml import MSO_LINE
            shp.line.dash_style = MSO_LINE.DASH
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    shp.text_frame.text = ''
    return shp


def text(slide, x, y, w, h, content, size=14, bold=False, color='ink', font=F, align='l', anchor='t',
         spacing=None, italic=False, after=0):
    """content: str | list of paragraphs; paragraph = str | list of runs (text, {opts})"""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {'t': MSO_ANCHOR.TOP, 'm': MSO_ANCHOR.MIDDLE, 'b': MSO_ANCHOR.BOTTOM}[anchor]
    paras = content if isinstance(content, list) else [content]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = {'l': PP_ALIGN.LEFT, 'c': PP_ALIGN.CENTER, 'r': PP_ALIGN.RIGHT}[align]
        if spacing:
            para.line_spacing = spacing
        if after:
            para.space_after = Pt(after)
        runs = p if isinstance(p, list) else [(p, {})]
        for rt, opt in runs:
            r = para.add_run()
            r.text = rt
            fnt = r.font
            fnt.name = opt.get('font', font)
            fnt.size = Pt(opt.get('size', size))
            fnt.bold = opt.get('bold', bold)
            fnt.italic = opt.get('italic', italic)
            fnt.color.rgb = rgb(C.get(opt.get('color', color), opt.get('color', color)))
    return tb


def bullets(slide, x, y, w, h, items, size=13, color='muted', after=4, marker='•'):
    paras = [[(f'{marker}  ', {'color': 'blue', 'bold': True}), (it, {})] for it in items]
    return text(slide, x, y, w, h, paras, size=size, color=color, after=after)


def header(slide, eyebrow, title, ecol='blue', sub=None):
    text(slide, 0.89, 0.89, 11.9, 0.26, eyebrow, size=12, bold=True, color=ecol)
    text(slide, 0.89, 1.2, 11.9, 0.6, title, size=30, bold=True)
    if sub:
        text(slide, 0.89, 1.86, 11.6, 0.6, sub, size=15, color='muted')


def footer(slide, left, dark=False):
    text(slide, 0.89, 6.82, 10.5, 0.26, left, size=11, color='9FB0C0' if dark else 'foot')


def pill(slide, x, y, label, kind='blue'):
    fill, col = {'blue': ('bluebg', 'blue'), 'green': ('greenbg', 'green'), 'amber': ('amberbg', 'amber'),
                 'grey': ('light', 'muted'), 'navy': ('navy', 'EEF2F4')}[kind]
    w = 0.108 * len(label) + 0.36
    box(slide, x, y, w, 0.3, fill=C.get(fill, fill), radius=0.5)
    text(slide, x, y, w, 0.3, label, size=10.5, bold=True, color=col, align='c', anchor='m')
    return w


def card(slide, x, y, w, h, fill='surf', line='line'):
    return box(slide, x, y, w, h, fill=C[fill], line=C[line], radius=0.05)


def arrow(slide, x1, y1, x2, y2, color='muted', w=1.5, dash=False):
    ln = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    ln.line.color.rgb = rgb(C.get(color, color))
    ln.line.width = Pt(w)
    if dash:
        from pptx.enum.dml import MSO_LINE
        ln.line.dash_style = MSO_LINE.DASH
    lnxml = ln.line._get_or_add_ln()
    tail = lnxml.makeelement(qn('a:tailEnd'), {'type': 'triangle', 'w': 'med', 'len': 'med'})
    lnxml.append(tail)
    return ln


def circle_num(slide, x, y, n, fill='navy', color='FFFFFF', d=0.42):
    box(slide, x, y, d, d, fill=C.get(fill, fill), shape=MSO_SHAPE.OVAL, radius=0)
    text(slide, x, y, d, d, str(n), size=14, bold=True, color=color, align='c', anchor='m')


def notes(slide, t):
    slide.notes_slide.notes_text_frame.text = t


def new_slide(bg='bg'):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    set_bg(s, C[bg])
    return s


# ---------------- edición de láminas existentes ----------------
def para_set(slide, old, new, size=None, color=None):
    """Reemplaza el texto de un párrafo completo que empieza con `old` (mantiene el formato del primer run)."""
    hit = False
    for sh in slide.shapes:
        if not sh.has_text_frame:
            continue
        for p in sh.text_frame.paragraphs:
            if p.text.replace('\xa0', ' ').strip().startswith(old.strip()) and p.runs:
                p.runs[0].text = new
                for r in p.runs[1:]:
                    r.text = ''
                if size:
                    p.runs[0].font.size = Pt(size)
                if color:
                    p.runs[0].font.color.rgb = rgb(color)
                hit = True
    assert hit, f'no encontrado: {old}'


def shape_by_text(slide, start):
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.startswith(start):
            return sh
    raise KeyError(start)


def remove_shape(sh):
    sh._element.getparent().remove(sh._element)


def fonts_to_safe(slide):
    for sh in slide.shapes:
        tfs = []
        if sh.has_text_frame:
            tfs.append(sh.text_frame)
        if getattr(sh, 'has_table', False) and sh.has_table:
            for row in sh.table.rows:
                for cell in row.cells:
                    tfs.append(cell.text_frame)
        for tf in tfs:
            for p in tf.paragraphs:
                for r in p.runs:
                    n = r.font.name
                    if n == 'IBM Plex Mono':
                        r.font.name = MONO
                    elif n in (None, 'IBM Plex Sans', 'Space Grotesk'):
                        r.font.name = F


S_COVER, S_INST, S_BAL, S_LIVE, S_DATO, S_JSON, S_END = orig[0], orig[2], orig[4], orig[5], orig[6], orig[9], orig[14]

# 1 · Portada
para_set(S_COVER, 'De medir la semana', 'Ingeniería logística')
para_set(S_COVER, 'a gestionar el turno', 'del Nodo Sur')
para_set(S_COVER, 'TruckFlow como base', 'La base para automatizar la operación de camiones de Ricardone y San Lorenzo: '
         'nodos, eventos en tiempo real y un modelo único de la planta.')
notes(S_COVER, 'Presentamos un proyecto de ingeniería logística: construir la base que permite automatizar la operación de '
      'camiones del Nodo Sur. La pregunta de hoy es si tiene sentido llevárselo a Vicentin.')

# 3 · Instalado
para_set(S_INST, 'Servidor, red y VPN', 'Servidor y red en planta')
para_set(S_INST, 'HPE con DSS', 'DSS, TF Edge y enlace entre las dos plantas')
notes(S_INST, 'La infraestructura ya está instalada y paga: 60 cámaras con IA, el Edge en planta y TruckFlow en la nube. '
      'Se probó punta a punta el 15/09. Todo lo que proponemos se apoya en esto: no hay obra.')

# 4 · En vivo
para_set(S_LIVE, 'LO QUE YA EXISTE', 'LO QUE YA EXISTE · LA PLANTA EN VIVO')
para_set(S_LIVE, 'Lo que ya funciona sobre TruckFlow', 'La planta en vivo, ya hoy')
para_set(S_LIVE, '1 comando', '5 playas')
para_set(S_LIVE, 'arma el informe diario', 'con capacidad, ocupación y espera medidas entre cámaras')
notes(S_LIVE, 'Esto no es un prototipo: es el tablero que usa la planta. Muestra cuántos camiones hay en cada playa, '
      'cuánto esperan y contra qué capacidad. Es la primera capa de lo que proponemos.')

# 5 · El dato
para_set(S_DATO, 'El 73 % del ciclo de la soja es espera', 'El 73 % del ciclo es espera en las playas')
remove_shape(shape_by_text(S_DATO, 'Los puntos tienen capacidad'))
cd = CategoryChartData()
cd.categories = ['10/06', '18/06', '24/06', '08/07', '15/07', '23/07', '31/07', '07/08', '14/08', '28/08', '04/09', '11/09', '18/09']
cd.add_series('Ciclo total R7 (min)', (376, 338, 316, 383, 304, 433, 389, 421, 346, 296, 379, 276, 334))
gf = S_DATO.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(0.89), Inches(5.12), Inches(11.56), Inches(1.62), cd)
ch = gf.chart
ch.has_legend = False
ch.has_title = True
ch.chart_title.text_frame.text = 'Y no baja: ciclo total de R7 en cada comité, min (276 a 433)'
tr = ch.chart_title.text_frame.paragraphs[0].runs[0]
tr.font.size, tr.font.bold, tr.font.name, tr.font.color.rgb = Pt(12), True, F, rgb(C['ink'])
pl = ch.plots[0]
pl.has_data_labels = True
dl = pl.data_labels
dl.position = XL_LABEL_POSITION.ABOVE
dl.font.size, dl.font.name, dl.font.color.rgb = Pt(10), F, rgb(C['ink'])
ser = pl.series[0]
ser.format.line.color.rgb = rgb(C['amber2'])
ser.format.line.width = Pt(2.25)
ser.smooth = False
ser.marker.style = XL_MARKER_STYLE.CIRCLE
ser.marker.size = 6
ser.marker.format.fill.solid()
ser.marker.format.fill.fore_color.rgb = rgb(C['amber2'])
ser.marker.format.line.color.rgb = rgb(C['amber2'])
va = ch.value_axis
va.minimum_scale, va.maximum_scale = 200, 500
va.visible = False
va.has_major_gridlines = False
ca = ch.category_axis
ca.tick_labels.font.size, ca.tick_labels.font.name = Pt(10), F
ca.tick_labels.font.color.rgb = rgb(C['muted'])
ca.format.line.color.rgb = rgb(C['line'])
notes(S_DATO, 'El camión de soja pasa 245 de sus 334 minutos esperando en dos playas: Playa 1 en Ricardone y Playa OSL en el '
      'puerto. En 13 comités el ciclo no bajó. El comité del 14/08 lo dijo: la calada no limita, el tiempo se define aguas abajo.')

# 10 · Lógica del nodo (Balanza egreso)
para_set(S_BAL, 'MODELO DE NODOS', 'LA LÓGICA DEL NODO · UN NODO REAL: BALANZA EGRESO DE RICARDONE')
para_set(S_BAL, 'Cada nodo sabe', 'Cada nodo sabe de dónde vienen y a dónde van')
para_set(S_BAL, 'Playa de egreso → Salida 1', 'Playa de salida → Salida 1')
para_set(S_BAL, 'El sistema de camiones dice si sigue', 'El sistema de camiones dice si sigue a Playa de salida o vuelve a Calada.')
para_set(S_BAL, 'Fuente: Matriz de circuitos', 'Fuente: modelo de nodos del Nodo Sur · lo mismo está definido para los 33 nodos')
notes(S_BAL, 'Así razona un nodo. La balanza de egreso sabe que un camión solo puede llegar desde 11 lugares y que sale por '
      'dos caminos según el tipo de movimiento. Con la cámara y el sistema de camiones, cada paso se valida solo y un desvío '
      'se avisa en el momento.')

# Apéndice A · evento
para_set(S_JSON, 'LA PROPUESTA · EL DATO', 'APÉNDICE · EL EVENTO ENRIQUECIDO')
para_set(S_JSON, '  "tarjeta"', '  "confirmacion": { "fuentes": 2, "ok": true }')
para_set(S_JSON, 'Confirmar identidad con la tarjeta', 'Confirmar cada paso con dos fuentes')
notes(S_JSON, 'Detalle técnico: así se ve un evento cuando se le suma el sistema de camiones y la confirmación del nodo.')

# Cierre
para_set(S_END, 'Aprobar la fase 1', 'Decidir llevarle esta propuesta a Vicentin')
para_set(S_END, 'Demo del tablero', 'Demo en vivo: la planta y sus playas con datos del día')
para_set(S_END, 'La espera en playas', 'La base y su próximo paso: que usen su propia IA sobre TruckFlow')
para_set(S_END, 'TruckFlow como base', 'Qué necesitamos de Vicentin: acceso al sistema de camiones y a las balanzas')
notes(S_END, 'La decisión de hoy es si llevamos esto a Vicentin. Propuesta de reunión: demo en vivo, la base y el próximo paso '
      'con IA, y lo que necesitamos de ellos.')

# ---------------- láminas nuevas ----------------
FOOT = 'Truckflow Vicentin · propuesta interna'

# 2 · En una lámina
s2 = new_slide('bg')
header(s2, 'EN UNA LÁMINA', 'La base hoy, su IA mañana, la planta sola después')
cols = [('AHORA · LA BASE', 'green', 'Nodos, eventos y un modelo de la planta',
         ['Cada paso de cada camión, en segundos', 'Sistema de camiones integrado, sin tocarlo', 'Doble confirmación de cada paso']),
        ('PRÓXIMO PASO · IA ABIERTA', 'blue', 'Vicentin usa su propia IA sobre la base',
         ['Desde ChatGPT, Claude o Copilot', 'Avisos y automatizaciones que arman ellos', 'Sin depender de nosotros']),
        ('HORIZONTE', 'amber', 'La planta se opera sola',
         ['El nodo detecta, decide y ejecuta', 'Destino según capacidad libre', 'Flota de transiles planificada'])]
for i, (tag, k, ttl, its) in enumerate(cols):
    x = 0.89 + i * 3.92
    card(s2, x, 2.25, 3.7, 3.0)
    pill(s2, x + 0.28, 2.52, tag, k)
    text(s2, x + 0.28, 3.02, 3.2, 0.75, ttl, size=19, bold=True)
    bullets(s2, x + 0.28, 3.9, 3.25, 1.3, its, size=13)
    if i < 2:
        arrow(s2, x + 3.72, 3.75, x + 3.9, 3.75, color='grey', w=2)
box(s2, 0.89, 5.6, 11.56, 0.72, fill=C['navy'], radius=0.08)
text(s2, 1.2, 5.6, 11.0, 0.72, 'Decisión de hoy: presentarle a Vicentin la base, con el próximo paso y el horizonte a la vista.',
     size=16, color='EEF2F4', anchor='m')
footer(s2, FOOT)
notes(s2, 'Tres tiempos. Lo que proponemos ahora es la base: nodos, eventos y el modelo de la planta, con el sistema de camiones '
      'integrado. El próximo paso es abrirla para que Vicentin use su propia IA. El horizonte, que es el porqué de todo, es una '
      'planta que se opera sola.')

# 6 · R7 sobre el grafo
s6 = new_slide('surf')
header(s6, 'EL DATO SOBRE EL MODELO · CIRCUITO R7, SOJA', 'Dónde se va el tiempo: el recorrido de la soja', ecol='amber')
s6.shapes.add_picture(os.path.join(HERE, 'graph_r7.png'), Inches(0.89), Inches(1.95), width=Inches(11.56))
text(s6, 0.89, 6.44, 11.56, 0.34,
     [[('La calada no limita: trabaja a demanda de las playas. ', {'bold': True}),
       ('El tiempo se define aguas abajo, en las playas que ningún sistema ve.', {})]], size=14)
footer(s6, 'Circuito R7, semana 10–16/09, 2.557 camiones · Comité de Logística del 18/09 · en ámbar, las playas con su capacidad')
notes(s6, 'Este es el recorrido de la soja sobre el modelo de nodos. Los dos carteles ámbar son las dos playas donde el camión '
      'pasa 245 minutos. El traslado entre plantas son 12 y la descarga 42. El problema no está en los puntos con cámara, está '
      'en los espacios entre ellos.')

# 7 · Por qué automatizar necesita esta base
s7 = new_slide('bg')
header(s7, 'LA BASE', 'Automatizar exige saber tres cosas a la vez',
       sub='Hoy cada una vive por separado. El proyecto las une en un solo evento, y con eso cualquier tarea logística se puede automatizar.')
trip = [('1', 'Dónde está cada camión', 'TruckFlow', 'un evento por paso, en segundos, con foto', 'YA FUNCIONA', 'green'),
        ('2', 'Cómo es la planta', 'Modelo de nodos', '33 nodos, 50 circuitos, 5 playas con capacidad', 'HECHO', 'green'),
        ('3', 'Qué vino a hacer', 'Sistema de camiones', 'contrato, cupo, producto y destino asignado', 'SE SUMA', 'blue')]
for i, (n, q, src, det, st, k) in enumerate(trip):
    x = 0.89 + i * 2.95
    card(s7, x, 2.75, 2.75, 2.45)
    circle_num(s7, x + 0.25, 2.98, n)
    pill(s7, x + 0.8, 3.04, st, k)
    text(s7, x + 0.25, 3.6, 2.35, 0.6, q, size=17, bold=True)
    text(s7, x + 0.25, 4.25, 2.35, 0.3, src, size=13, bold=True, color='blue')
    text(s7, x + 0.25, 4.58, 2.35, 0.55, det, size=12, color='muted')
arrow(s7, 9.75, 3.97, 10.05, 3.97, color='ink', w=2.25)
box(s7, 10.12, 2.75, 2.33, 2.45, fill=C['navy'], radius=0.05)
text(s7, 10.35, 2.98, 1.9, 0.3, 'RESULTADO', size=10.5, bold=True, color='6CC1F2')
text(s7, 10.35, 3.32, 1.95, 0.9, 'Un evento enriquecido y confirmado', size=17, bold=True, color='FFFFFF')
text(s7, 10.35, 4.35, 1.95, 0.8, 'la materia prima de cualquier automatización', size=12, color='B8C4CE')
text(s7, 0.89, 5.55, 11.56, 0.6,
     [[('Sin esta base, automatizar es imposible: ', {'bold': True}),
       ('nadie puede decidir por la planta si no sabe dónde está cada camión, cómo es la planta y qué vino a hacer.', {})]],
     size=14)
footer(s7, FOOT)
notes(s7, 'Para que una máquina tome una decisión logística necesita tres cosas al mismo tiempo. Dónde está el camión, que ya lo '
      'da TruckFlow. Cómo es la planta, que ya lo tenemos en el modelo de nodos. Y qué vino a hacer, que está en el sistema de '
      'camiones. Unirlas es el proyecto.')

# 8 · El nodo
s8 = new_slide('bg2')
header(s8, 'EL NODO · LA UNIDAD DEL PROYECTO', 'El nodo: un lugar, un Edge y una lógica',
       sub='Cada punto de la planta es un nodo. Su Edge recibe todas las señales del lugar, las confirma y emite un solo evento.')
text(s8, 0.89, 2.62, 3.2, 0.26, 'ENTRADAS', size=11, bold=True, color='blue')
ins = [('Cámaras de patente', 'frontal y trasera', 'HOY', 'green'),
       ('Balanzas PLC + fotocélulas', 'peso y posición', 'SE SUMA', 'blue'),
       ('Identificación del chofer', 'y sensores nuevos', 'DESPUÉS', 'grey')]
for i, (t1, t2, st, k) in enumerate(ins):
    y = 2.95 + i * 0.98
    card(s8, 0.89, y, 3.3, 0.82)
    text(s8, 1.07, y + 0.1, 3.0, 0.3, t1, size=13, bold=True)
    text(s8, 1.07, y + 0.46, 1.95, 0.3, t2, size=10.5, color='muted')
    pw = 0.108 * len(st) + 0.36
    pill(s8, 0.89 + 3.3 - pw - 0.12, y + 0.44, st, k)
    arrow(s8, 4.2, y + 0.41, 4.62, 3.95, color='grey', w=1.25)
box(s8, 4.65, 2.62, 4.35, 3.0, fill=C['navy'], radius=0.04)
text(s8, 4.92, 2.82, 3.8, 0.3, 'EDGE DEL NODO · EN PLANTA', size=11, bold=True, color='6CC1F2')
funcs = [('Confirma', 'el paso con dos fuentes'), ('Valida', 'de dónde viene y a dónde puede seguir'),
         ('Completa', 'lo que falta con los nodos vecinos'), ('No pierde', 'guarda y reenvía si se corta la red'),
         ('Pone la hora', 'real del lugar en cada evento')]
for i, (a, b) in enumerate(funcs):
    text(s8, 4.92, 3.2 + i * 0.46, 3.9, 0.4, [[(a + '  ', {'bold': True, 'color': 'FFFFFF'}), (b, {'color': 'B8C4CE'})]], size=13)
arrow(s8, 9.02, 4.12, 9.45, 4.12, color='ink', w=2.25)
card(s8, 9.5, 2.62, 2.95, 1.55)
text(s8, 9.72, 2.82, 2.6, 0.26, 'SALIDA', size=11, bold=True, color='blue')
text(s8, 9.72, 3.12, 2.6, 0.95, 'Un evento confirmado por paso, a TruckFlow', size=15, bold=True)
box(s8, 9.5, 4.35, 2.95, 1.27, fill=C['amberbg'], line=C['amber2'], radius=0.05, dash=True)
text(s8, 9.72, 4.5, 2.6, 0.26, 'HORIZONTE · EL NODO ACTÚA', size=10.5, bold=True, color='amber')
text(s8, 9.72, 4.8, 2.6, 0.75, 'barrera, semáforo y llamado de camiones desde la playa', size=12, color='ink')
text(s8, 0.89, 5.95, 11.56, 0.5,
     [[('Escala solo: ', {'bold': True}), ('sumar un sensor es sumar una entrada a un nodo; sumar un punto es sumar un nodo al modelo.', {})]],
     size=14)
footer(s8, FOOT)
notes(s8, 'El nodo es la unidad de todo. Tiene un lugar físico, un Edge que recibe todas las señales de ese punto y la lógica del '
      'modelo. Hoy entran las cámaras; se suman las balanzas con PLC y fotocélulas, que asocian el peso a la patente sin que nadie '
      'la tipee. El Edge confirma, valida, completa y no pierde nada. En el horizonte, el mismo Edge actúa.')

# 9 · Modelo de nodos
s9 = new_slide('surf')
header(s9, 'EL MODELO DE NODOS · 33 NODOS · 50 CIRCUITOS · 5 PLAYAS', 'Una sola versión de la planta')
s9.shapes.add_picture(os.path.join(HERE, 'graph_full.png'), Inches(0.89), Inches(1.9), width=Inches(11.56))
leg = [('con cámara', 'ink', False, False), ('sin cámara', '8A97A5', False, True), ('playa: área de espera · capacidad', 'amber2', True, False)]
x = 0.89
for lab, col, area, dash in leg:
    box(s9, x, 6.5, 0.22, 0.22, fill=C['amberbg'] if area else C['surf'], line=C.get(col, col), shape=MSO_SHAPE.OVAL, radius=0,
        lw=2, dash=dash)
    text(s9, x + 0.3, 6.47, 3.2, 0.28, lab, size=11.5, color='muted')
    x += 0.4 + 0.085 * len(lab) + 0.3
arrow(s9, x, 6.61, x + 0.45, 6.61, color='amber2', w=1.75, dash=True)
text(s9, x + 0.55, 6.47, 3, 0.28, 'desvío: solo camión demorado', size=11.5, color='muted')
footer(s9, 'Fuente: modelo de nodos del Nodo Sur (matriz de circuitos + relevamiento de cámaras y capacidades) · cada línea es un circuito')
notes(s9, 'Este es el modelo de las dos plantas: 33 nodos y 50 circuitos. Cuanto más oscura la línea, más circuitos comparten esa '
      'conexión. En ámbar, las 5 playas con su capacidad. Es la fuente única: el tablero, los informes y la IA leen esto.')

# 11 · Playas
s11 = new_slide('bg')
header(s11, 'LAS PLAYAS · NODOS VIRTUALES', 'Las playas: donde el camión pasa el 70 % del ciclo', ecol='amber',
       sub='No tienen cámara propia ni aparecen en el sistema de camiones. El modelo las mide entre la cámara de entrada y la de salida: sin instalar nada.')
pls = [('Playa 1', 'Ricardone', '300', 'entre Preingreso y Calada', '126 min', 'soja, 10–16/09'),
       ('Playa demorado', 'Ricardone', '20', 'después de Calada, solo el camión demorado', '—', 'desvío'),
       ('Playa 3', 'Ricardone', '100', 'antes de volcables, celda y silos', '128 min', 'pellet, 14–15/09'),
       ('Playa de salida', 'Ricardone', '4', 'entre Balanza egreso y Salida 1', '—', 'paso corto'),
       ('Playa OSL', 'San Lorenzo', '150', 'entre Ingreso y Balanza ingreso', '119 min', 'soja; pellet 140–179')]
for i, (n, pl_, cap, where, wait, wsrc) in enumerate(pls):
    x = 0.89 + i * 2.33
    card(s11, x, 2.72, 2.2, 3.05)
    box(s11, x + 0.2, 2.92, 0.62, 0.62, fill=C['amberbg'], line=C['amber2'], shape=MSO_SHAPE.OVAL, radius=0, lw=2.5)
    text(s11, x + 0.2, 2.92, 0.62, 0.62, cap, size=13, bold=True, color='amber', align='c', anchor='m')
    text(s11, x + 0.92, 2.97, 1.2, 0.5, 'camiones de capacidad', size=10, color='muted')
    text(s11, x + 0.2, 3.7, 1.9, 0.32, n, size=15, bold=True)
    text(s11, x + 0.2, 4.02, 1.9, 0.26, pl_, size=11, color='blue', bold=True)
    text(s11, x + 0.2, 4.32, 1.85, 0.6, where, size=11, color='muted')
    text(s11, x + 0.2, 5.0, 1.9, 0.4, wait, size=20, bold=True, color='amber' if wait != '—' else 'grey')
    text(s11, x + 0.2, 5.42, 1.9, 0.28, 'espera · ' + wsrc if wait != '—' else wsrc, size=10, color='muted')
box(s11, 0.89, 6.0, 11.56, 0.6, fill=C['navy'], radius=0.08)
text(s11, 1.2, 6.0, 11.0, 0.6, 'Con capacidad y ocupación en vivo, la playa deja de ser un lugar donde se espera y pasa a ser un lugar que se gestiona.',
     size=14, color='EEF2F4', anchor='m')
footer(s11, 'Capacidad: dato de planta (29/09) · esperas: comités de Logística del 04/09 al 18/09')
notes(s11, 'Las playas son el lugar de trabajo. No tienen cámara ni figuran en el sistema de camiones, pero el modelo las mide '
      'con las cámaras de su entrada y su salida. Cada una tiene capacidad relevada con planta. Las esperas son las de los comités.')

# 12 · Doble confirmación
s12 = new_slide('bg2')
header(s12, 'DOBLE CONFIRMACIÓN', 'Un recorrido completo y confiable, paso por paso',
       sub='Cada paso se confirma con dos fuentes. Si una falta, el modelo lo completa con las otras. Es lo mínimo para que una máquina decida.')
srcs = [('La cámara', 've el paso', 'patente, hora y foto'), ('Sistema de camiones', 'dice qué debía pasar', 'contrato, cupo, producto y plataforma asignada'),
        ('El modelo de nodos', 'dice qué se espera', 'de dónde viene, a dónde va, qué circuito')]
for i, (a, b, c) in enumerate(srcs):
    x = 0.89 + i * 2.62
    card(s12, x, 2.72, 2.42, 1.62)
    text(s12, x + 0.22, 2.9, 2.0, 0.3, a, size=14, bold=True)
    text(s12, x + 0.22, 3.25, 2.0, 0.3, b, size=12, bold=True, color='blue')
    text(s12, x + 0.22, 3.6, 2.0, 0.65, c, size=11.5, color='muted')
    if i < 2:
        text(s12, x + 2.42, 3.3, 0.2, 0.4, '+', size=18, bold=True, color='muted', align='c')
arrow(s12, 8.72, 3.53, 9.1, 3.53, color='ink', w=2.25)
box(s12, 9.15, 2.72, 3.3, 1.62, fill=C['navy'], radius=0.05)
text(s12, 9.4, 2.9, 2.9, 0.3, 'PASO CONFIRMADO', size=10.5, bold=True, color='6CC1F2')
text(s12, 9.4, 3.2, 2.9, 1.0, 'o un aviso en el momento, cuando no coinciden', size=15, bold=True, color='FFFFFF')
card(s12, 0.89, 4.62, 5.66, 1.72, fill='surf')
pill(s12, 1.1, 4.8, 'CASO REAL · 14–15/09', 'amber')
text(s12, 1.1, 5.2, 5.25, 1.1, [[('Debía descargar en el volcable 2 y descargó en el 5. ', {'bold': True}),
                                 ('Solo se detecta cruzando la plataforma asignada en el sistema de camiones con la cámara del volcable.', {})]],
     size=13)
card(s12, 6.79, 4.62, 5.66, 1.72, fill='surf')
pill(s12, 7.0, 4.8, 'LA OTRA MITAD · JULIO', 'blue')
text(s12, 7.0, 5.2, 5.25, 1.1, [[('La cámara ve el patrón, el sistema de camiones dice por qué: ', {'bold': True}),
                                 ('los 36 recorridos anómalos de julio se explicaron por exceso de kg, falta de cupo o error del transportista.', {})]],
     size=13)
footer(s12, 'Fuente: comités de Seguridad del 14/08 (resumen de julio, 36 casos) y del 18/09')
notes(s12, 'La doble confirmación es la garantía de que el dato es completo. La cámara ve, el sistema de camiones dice qué debía '
      'pasar y el modelo dice qué se espera. Un ejemplo real: un camión con volcable 2 asignado descargó en el 5. Y al revés: las '
      'anomalías de julio se explicaron con datos del sistema de camiones.')

# 13 · Arquitectura
s13 = new_slide('bg2')
header(s13, 'ARQUITECTURA', 'Liviana, en la nube y preparada para IA')
blk = [('NODOS · EN PLANTA', 'Cámaras, balanzas y Edge', 'confirman cada paso', 'green'),
       ('TRUCKFLOW · NUBE', 'Un evento por paso', 'microservicios livianos', 'navy'),
       ('MODELO DE NODOS', 'La planta en datos', 'nodos, playas, capacidades, circuitos', 'green'),
       ('PUERTA ABIERTA', 'APIs + MCP', 'estándar para asistentes de IA', 'blue'),
       ('QUIÉN LO USA', 'Tablero, torre e informes', 'y la IA que Vicentin ya usa', 'grey')]
for i, (tag, t1, t2, k) in enumerate(blk):
    x = 0.89 + i * 2.35
    dark = k == 'navy'
    box(s13, x, 2.1, 2.1, 1.75, fill=C['navy'] if dark else C['surf'], line=None if dark else C['line'], radius=0.05)
    text(s13, x + 0.18, 2.27, 1.8, 0.26, tag, size=10, bold=True, color='6CC1F2' if dark else ('green' if k == 'green' else 'blue' if k == 'blue' else 'muted'))
    text(s13, x + 0.18, 2.6, 1.8, 0.6, t1, size=14.5, bold=True, color='FFFFFF' if dark else 'ink')
    text(s13, x + 0.18, 3.2, 1.8, 0.6, t2, size=11, color='B8C4CE' if dark else 'muted')
    if i < 4:
        arrow(s13, x + 2.11, 2.97, x + 2.34, 2.97, color='ink', w=2)
box(s13, 2.35, 4.35, 3.4, 1.0, fill=C['light'], line=C['grey'], radius=0.05)
text(s13, 2.55, 4.47, 3.1, 0.26, 'SISTEMA DE CAMIONES · VICENTIN', size=10, bold=True, color='muted')
text(s13, 2.55, 4.77, 3.1, 0.5, 'contrato, cupo, producto: se lee por SFTP o API, no se toca', size=11.5, color='ink')
arrow(s13, 4.05, 4.33, 4.05, 3.88, color='muted', w=1.75)
pr = [('Microservicios livianos', 'cada pieza escala y se actualiza sola; nada depende de una PC en planta'),
      ('Un solo modelo de la planta', 'tablero, informes y la IA leen exactamente lo mismo'),
      ('Preparada para IA', 'cualquier asistente consulta y opera por una puerta estándar')]
for i, (a, b) in enumerate(pr):
    x = 0.89 + i * 3.92
    card(s13, x, 5.62, 3.7, 0.95)
    text(s13, x + 0.2, 5.75, 3.35, 0.3, a, size=13, bold=True)
    text(s13, x + 0.2, 6.05, 3.35, 0.5, b, size=11, color='muted')
footer(s13, FOOT)
notes(s13, 'La arquitectura es liviana: microservicios en la nube, un evento por paso y el modelo de nodos en el centro. El '
      'sistema de camiones de Vicentin se lee, no se toca. Y todo sale por una puerta abierta: APIs y MCP, el estándar que usan '
      'los asistentes de IA para consultar y operar sistemas.')

# 14 · Ventajas
s14 = new_slide('bg')
header(s14, 'VENTAJAS', 'Qué cambia frente a lo que hay hoy en planta',
       sub='No reemplaza al sistema de camiones: le da operación en tiempo real y lo abre a la automatización.')
rows = [('Hoy en planta', 'Con esta arquitectura'),
        ('La operación se registra cuando se cierra y se exporta a Excel', 'Un evento por paso, en segundos, mientras el camión se mueve'),
        ('Sistemas pensados para personas que cargan datos', 'Microservicios en la nube con APIs abiertas: la IA consulta y opera de forma nativa'),
        ('Identificación con tarjeta', 'Patente + foto, confirmada con una segunda fuente'),
        ('Cada sistema con sus datos, por separado', 'Un solo modelo de la planta que todos leen'),
        ('Crecer es un proyecto de sistemas', 'Crecer es sumar un sensor a un nodo o un nodo al modelo'),
        ('Depende de la red y de una PC', 'El nodo trabaja solo si se corta la red y reenvía después')]
tb = s14.shapes.add_table(len(rows), 2, Inches(0.89), Inches(2.62), Inches(11.56), Inches(3.9)).table
tb.columns[0].width = Inches(4.9)
tb.columns[1].width = Inches(6.66)
for r, (a, b) in enumerate(rows):
    for cix, val in enumerate((a, b)):
        cell = tb.cell(r, cix)
        cell.margin_left = cell.margin_right = Inches(0.14)
        cell.margin_top = cell.margin_bottom = Inches(0.06)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.fill.solid()
        cell.fill.fore_color.rgb = rgb(C['navy'] if r == 0 else (C['surf'] if cix == 0 else 'EAF4FB'))
        tf = cell.text_frame
        tf.text = ''
        run = tf.paragraphs[0].add_run()
        run.text = val
        run.font.name, run.font.size = F, Pt(12.5 if r else 12)
        run.font.bold = r == 0 or cix == 1
        run.font.color.rgb = rgb('FFFFFF' if r == 0 else (C['muted'] if cix == 0 else C['ink']))
footer(s14, FOOT)
notes(s14, 'Esta es la ventaja competitiva frente a lo que hay: tiempo real en vez de cierre, datos abiertos en vez de sistemas '
      'cerrados, un solo modelo en vez de datos sueltos, y una base que crece de a un nodo.')

# 15 · Su propia IA
s15 = new_slide('surf')
header(s15, 'PRÓXIMO PASO · IA ABIERTA', 'Que Vicentin arme sus automatizaciones con su propia IA')
chat = [('Avisame cuando un camión salga de Ricardone al puerto sin calar.', 'Listo: te aviso en el momento, con patente, hora y foto.'),
        ('Mandale un mensaje al jefe de turno cuando Playa 1 pase de 250 camiones.', 'Aviso activado para Playa 1 (capacidad 300).'),
        ('¿Qué destino tiene más lugar ahora para la soja?', 'Te respondo con la ocupación de cada destino en este momento.'),
        ('Todos los días a las 7, decime qué camiones estuvieron más de 3 horas en planta.', 'Programado: informe diario a las 07:00.')]
box(s15, 0.89, 1.95, 6.9, 4.65, fill=C['bg2'], line=C['line'], radius=0.03)
text(s15, 1.12, 2.08, 6.4, 0.26, 'CHATGPT · CLAUDE · COPILOT · LO QUE USEN', size=10, bold=True, color='muted')
y = 2.45
for q, a in chat:
    box(s15, 3.0, y, 4.55, 0.5, fill=C['navy'], radius=0.25)
    text(s15, 3.18, y, 4.2, 0.5, q, size=11, color='FFFFFF', anchor='m')
    box(s15, 1.12, y + 0.55, 4.3, 0.42, fill='FFFFFF', line=C['line'], radius=0.25)
    text(s15, 1.3, y + 0.55, 4.0, 0.42, a, size=11, color='ink', anchor='m')
    y += 1.03
steps = [('1', 'La base expone una puerta estándar para IA (MCP) y APIs'),
         ('2', 'Vicentin conecta el asistente que ya usa'),
         ('3', 'Arman avisos y automatizaciones en lenguaje natural'),
         ('4', 'Nosotros mantenemos la base; ellos crean')]
for i, (n, t) in enumerate(steps):
    yy = 2.0 + i * 0.78
    circle_num(s15, 8.15, yy, n, fill='blue', d=0.4)
    text(s15, 8.7, yy + 0.02, 3.75, 0.6, t, size=13)
box(s15, 8.1, 5.28, 4.35, 1.32, fill=C['navy'], radius=0.06)
text(s15, 8.35, 5.28, 3.95, 1.32, 'No hacemos cada automatización: damos la base para que cualquiera la haga.', size=14.5,
     bold=True, color='FFFFFF', anchor='m')
footer(s15, 'Ejemplos de pedidos en lenguaje natural · MCP: estándar abierto para que los asistentes de IA consulten y operen sistemas')
notes(s15, 'El próximo paso no es que nosotros programemos cada aviso. Es abrir la base para que la gente de Vicentin, desde el '
      'asistente que ya usa, pida lo que necesita: avisos, reportes, consultas. Esto moderniza la operación sin reemplazar nada.')

# 16 · Horizonte
s16 = new_slide('navy')
text(s16, 0.89, 0.89, 11.9, 0.26, 'HORIZONTE · POR QUÉ HACEMOS ESTO', size=12, bold=True, color='F2C66D')
text(s16, 0.89, 1.2, 11.9, 0.6, 'La planta automatizada', size=30, bold=True, color='FFFFFF')
loop = ['El nodo detecta', 'El sistema decide', 'El nodo ejecuta']
for i, t in enumerate(loop):
    x = 0.89 + i * 3.1
    box(s16, x, 2.05, 2.7, 0.62, fill='1B2B42', line='2B3C53', radius=0.5)
    text(s16, x, 2.05, 2.7, 0.62, t, size=15, bold=True, color='FFFFFF', align='c', anchor='m')
    if i < 2:
        arrow(s16, x + 2.72, 2.36, x + 3.08, 2.36, color='F2C66D', w=2)
hz = [('Llamado desde la playa', 'Se libera lugar en volcables y el nodo de Playa 1 llama al próximo camión.'),
      ('Destino según capacidad libre', 'Hoy la calada está sobrada y los volcables de Ricardone llegan al 76 %: el destino se asigna solo.'),
      ('Identificación sin tarjeta', 'Patente y foto confirmadas en cada nodo: la base para dejar la tarjeta RFID.'),
      ('Flota de transiles planificada', 'Hoy un camión hace 2,1 a 2,8 viajes por día entre plantas. Más viajes por día permiten negociar menos tarifa por tonelada.')]
for i, (a, b) in enumerate(hz):
    x = 0.89 + (i % 2) * 5.85
    y = 3.02 + (i // 2) * 1.55
    box(s16, x, y, 5.6, 1.35, fill='132238', line='2B3C53', radius=0.05)
    text(s16, x + 0.25, y + 0.18, 5.1, 0.32, a, size=15, bold=True, color='FFFFFF')
    text(s16, x + 0.25, y + 0.55, 5.1, 0.75, b, size=12, color='B8C4CE')
text(s16, 0.89, 6.25, 11.56, 0.4, 'Las personas pasan de registrar a supervisar las excepciones.', size=14, italic=True, color='F2C66D')
footer(s16, 'Capacidad: estudio de capacidades por circuito · viajes por camión: transiles R29–R32, 4 semanas de agosto y septiembre', dark=True)
notes(s16, 'Este es el porqué. Con la base, el nodo que hoy lee mañana actúa: llama al camión cuando hay lugar, el destino se '
      'asigna según la capacidad libre, la identificación no necesita tarjeta y la flota de transiles se planifica para hacer '
      'más viajes por día, lo que abre la negociación de la tarifa por tonelada.')

# 17 · Fases
s17 = new_slide('bg')
header(s17, 'CÓMO AVANZAMOS', 'Un proyecto de ingeniería por fases, sobre lo que ya está')
ph = [('1', 'Base en la nube', ['TruckFlow, modelo de nodos y tablero en la nube', 'Catálogo y salud de cada nodo'], 'una sola versión de la planta'),
      ('2', 'Sistema de camiones', ['Lectura por SFTP o API', 'Evento enriquecido y doble confirmación'], 'cada paso con contexto'),
      ('3', 'Nodos Edge y balanzas', ['Reforzar el Edge de cada nodo', 'Sumar balanzas PLC + fotocélulas'], 'datos completos, sin pérdidas')]
for i, (n, ttl, its, val) in enumerate(ph):
    x = 0.89 + i * 2.62
    card(s17, x, 2.1, 2.45, 2.95)
    text(s17, x + 0.2, 2.25, 0.5, 0.45, n, size=24, bold=True, color='blue2')
    text(s17, x + 0.2, 2.72, 2.1, 0.6, ttl, size=15, bold=True)
    bullets(s17, x + 0.2, 3.38, 2.1, 1.05, its, size=11.5)
    text(s17, x + 0.2, 4.45, 2.1, 0.5, [[('Valor: ', {'bold': True}), (val, {})]], size=11.5, color='blue')
box(s17, 8.75, 2.1, 1.75, 2.95, fill=C['bluebg'], radius=0.05)
text(s17, 8.9, 2.28, 1.5, 0.26, 'PRÓXIMO PASO', size=10, bold=True, color='blue')
text(s17, 8.9, 2.6, 1.5, 1.2, 'IA abierta: MCP y APIs para su propia IA', size=13.5, bold=True)
box(s17, 10.62, 2.1, 1.83, 2.95, fill=C['amberbg'], line=C['amber2'], radius=0.05, dash=True)
text(s17, 10.77, 2.28, 1.55, 0.26, 'HORIZONTE', size=10, bold=True, color='amber')
text(s17, 10.77, 2.6, 1.55, 1.2, 'Automatización: el nodo actúa', size=13.5, bold=True)
card(s17, 0.89, 5.3, 11.56, 1.3, fill='surf')
text(s17, 1.12, 5.44, 3.0, 0.3, 'POR QUÉ ES BARATO', size=11, bold=True, color='green')
cheap = ['Infraestructura instalada y paga', 'Sin obra ni reemplazo de sistemas', 'Por fases, cada una con valor propio',
         'Parte entra en las 20 h/mes de evolutivo', 'Nube e IA se pagan por uso']
for i, t in enumerate(cheap):
    x = 1.12 + (i % 3) * 3.75
    yy = 5.8 + (i // 3) * 0.36
    text(s17, x, yy, 3.6, 0.32, [[('✓  ', {'bold': True, 'color': 'green2'}), (t, {})]], size=12)
footer(s17, 'Plazos y presupuesto: a estimar · Truckflow Vicentin · propuesta interna')
notes(s17, 'Son tres fases de base, cada una con valor propio, y después el próximo paso de IA abierta. La automatización queda '
      'como horizonte. Es barato porque la infraestructura ya está, no hay obra y no se reemplaza el sistema de camiones.')

# Apéndice B · capacidades
sB = new_slide('bg')
header(sB, 'APÉNDICE · CAPACIDAD CONTRA USO', 'Hay capacidad instalada mientras los camiones esperan')
rows = [('Circuito', 'Recurso que limita', 'Capacidad semanal', 'Uso real semanal', 'Lectura'),
        ('R7 · soja a volcables SL', 'Balanzas SL (38/h)', '6.317', '2.058–2.949', '33–47 %'),
        ('R5 + R6 · volcables Ricardone', 'Volcables 1 y 2', '644–805', '301–489', 'hasta 76 %: el más exigido'),
        ('R1 · Celda 16', 'Recepción de la celda', '1.848', '0', 'sin uso'),
        ('R3 · Silo Keppler', 'Descarga Keppler', '612–765', '0–227', 'por campañas'),
        ('R8 · líquidos Ricardone', 'Descarga de líquidos', '672', '42–160', '6–24 %'),
        ('SL1 · aceite OSL', 'Carga/descarga OSL', '924', '132–207', '14–22 %'),
        ('SL2 · aceite puerto', 'Carga/descarga puerto', '924', '47–104', '5–11 %'),
        ('R30–R32 · pellet al puerto', 'Carga SP (4/h) y flota', '4/h en el operativo', 'hasta 696', 'en el techo: manda la flota')]
tbl = sB.shapes.add_table(len(rows), 5, Inches(0.89), Inches(2.0), Inches(11.56), Inches(4.3)).table
for ci, wv in enumerate((3.1, 2.55, 1.9, 1.8, 2.21)):
    tbl.columns[ci].width = Inches(wv)
for r, row in enumerate(rows):
    for ci, val in enumerate(row):
        cell = tbl.cell(r, ci)
        cell.margin_left = cell.margin_right = Inches(0.12)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.fill.solid()
        cell.fill.fore_color.rgb = rgb(C['navy'] if r == 0 else (C['surf'] if r % 2 else 'F0F3F5'))
        tf = cell.text_frame
        tf.text = ''
        run = tf.paragraphs[0].add_run()
        run.text = val
        run.font.name, run.font.size = F, Pt(12)
        run.font.bold = r == 0 or ci == 0
        run.font.color.rgb = rgb('FFFFFF' if r == 0 else C['ink'])
        if ci >= 2:
            tf.paragraphs[0].alignment = PP_ALIGN.LEFT
footer(sB, 'Capacidad: estudio de capacidades por circuito (09/09) · uso: movimientos del Excel, semanas del 17/08 al 20/09')
notes(sB, 'Detalle para preguntas. La capacidad sale del estudio de capacidades por circuito; el uso, del Excel de movimientos de '
      'cinco semanas. Salvo los volcables de Ricardone y el pellet, que depende de la flota, hay capacidad ociosa.')

# ---------------- orden final ----------------
new = [s2, s6, s7, s8, s9, s11, s12, s13, s14, s15, s16, s17, sB]
order = [S_COVER, s2, S_INST, S_LIVE, S_DATO, s6, s7, s8, s9, S_BAL, s11, s12, s13, s14, s15, s16, s17, S_END, S_JSON, sB]
keep = set(id(s) for s in order)
sldIdLst = prs.slides._sldIdLst
id_by_slide = {}
for sldId, s in zip(list(sldIdLst), list(prs.slides)):
    id_by_slide[id(s)] = sldId
for sldId, s in zip(list(sldIdLst), list(prs.slides)):
    if id(s) not in keep:
        prs.part.drop_rel(sldId.rId)
        sldIdLst.remove(sldId)
for el in list(sldIdLst):
    sldIdLst.remove(el)
for s in order:
    sldIdLst.append(id_by_slide[id(s)])

# números de página y fuentes seguras
for i, s in enumerate(order, 1):
    fonts_to_safe(s)
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip().isdigit() and len(sh.text_frame.text.strip()) == 2 \
                and abs(sh.left - Inches(12.24)) < Inches(0.2):
            remove_shape(sh)
    if s not in (S_COVER, S_END):
        dark = s is s16
        text(s, 12.05, 6.82, 0.45, 0.26, f'{i:02d}', size=11, color='9FB0C0' if dark else 'foot', align='r')

prs.save(OUT)
print('ok', OUT, len(order), 'láminas')
