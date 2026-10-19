import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reunion.html')

FONT = "font-family:'Plus Jakarta Sans', Arial, sans-serif"
LIGHT = f"background:#F5F4EE;color:#17302A;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column"
MONO = "font-family:'IBM Plex Mono', Courier New, monospace"


def marks(dark=False):
    a, b = ('#3FA06E', '#A48AD8') if dark else ('#1F6E4A', '#6B46A8')
    return (f'<div style="position:absolute;left:128px;top:72px;width:48px;height:8px;background:{a};border-radius:4px"></div>'
            f'<div style="position:absolute;left:184px;top:72px;width:24px;height:8px;background:{b};border-radius:4px"></div>')


def head(kicker, title, size=56, dark=False):
    kc = '#D9A441' if dark else '#1F6E4A'
    return (f'<div style="display:flex;flex-direction:column;gap:16px"><p style="font-size:24px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:{kc}">{kicker}</p>'
            f'<h2 style="font-size:{size}px;font-weight:800;line-height:1.12;width:1664px">{title}</h2></div>')


def foot(n, dark=False):
    c, b = ('#BCD3C7', '#C9B6EE') if dark else ('#5F6B66', '#6B46A8')
    return f'<p style="position:absolute;left:128px;bottom:64px;width:1664px;font-size:24px;color:{c}"><b style="color:{b}">NODO SUR</b> · {n}</p>'


def hole(text, size=26, dark=False):
    """Dato pendiente: recuadro punteado."""
    c, bd = ('#BCD3C7', '#6E8F80') if dark else ('#8A918D', '#B8BCC2')
    return f'<span style="display:inline-block;font-size:{size}px;color:{c};border:2px dashed {bd};border-radius:8px;padding:2px 12px">[{text}]</span>'


slides = []

# 1 · Carátula
slides.append(f'''<section style="background:#0B5638;color:#F1F6F2;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:28px">
<img src="img/mosaico.jpg" alt="" style="position:absolute;left:0;top:0;width:1920px;height:1080px;object-fit:cover">
<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;background:linear-gradient(120deg, rgba(11,86,56,0.90) 0%, rgba(14,74,51,0.78) 55%, rgba(46,27,78,0.82) 100%)"></div>
<img src="img/nva_light.png" alt="Nueva Vicentin Argentina" style="position:absolute;left:128px;top:112px;width:280px;height:150px;object-fit:contain">
<img src="img/btz_light.png" alt="Bimtrazer" style="position:absolute;left:1560px;top:128px;width:232px;height:110px;object-fit:contain">
<div style="flex:1"></div>
<div style="position:relative;display:flex;flex-direction:column;gap:28px">
<h1 style="font-size:120px;font-weight:800;line-height:1.05;width:1550px;color:#FFFFFF">Alineamiento Proyecto Cámaras</h1>
<p style="font-size:56px;font-weight:700;line-height:1.1;color:#C9E3D3">Próximos pasos</p>
<div style="width:160px;height:8px;background:#9CCBAE;border-radius:4px"></div>
<p style="font-size:40px;line-height:1.3;color:#D6E4DA">Nodo Sur · 14 de octubre de 2026</p>
</div>
</section>''')

# 2 · Resultados de los comités en números
MESES = [('Jun', 3, 3, 0), ('Jul', 5, 3, 2), ('Ago', 6, 0, 6), ('Sep', 8, 0, 8), ('Oct 1–11', 2, 0, 2)]  # (mes, total, conjuntos, separados)

def barras():
    mx = 8; h = 300
    cols = ''
    for m, tot, conj, sep in MESES:
        hc = round(h * conj / mx); hs = round(h * sep / mx)
        cols += (f'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px">'
                 f'<p style="font-size:32px;font-weight:800;color:#EEF3EF">{tot}</p>'
                 f'<div style="width:72px;display:flex;flex-direction:column">'
                 + (f'<div style="height:{hs}px;background:#A48AD8;border-radius:6px 6px 0 0"></div>' if hs else '')
                 + (f'<div style="height:{hc}px;background:#3FA06E;border-radius:{"0" if hs else "6px 6px"} 0 0"></div>' if hc else '')
                 + f'</div><p style="font-size:26px;color:#BCD3C7">{m}</p></div>')
    return cols

def stat(num, label):
    return (f'<div style="display:flex;flex-direction:column;gap:6px;border-left:6px solid #A48AD8;padding-left:24px">'
            f'<p style="font-size:80px;font-weight:800;line-height:1">{num}</p><p style="font-size:28px;line-height:1.3;color:#CFE0D7">{label}</p></div>')

ROLES = ['Gerentes generales', 'Gerentes de planta', 'Calada', 'Movimientos internos', 'Coordinación de playa']
chips = ''.join(f'<p style="font-size:26px;color:#EEF3EF;background:#1E4D3B;border:1px solid #3FA06E;border-radius:999px;padding:8px 22px">{r}</p>' for r in ROLES)

slides.append(f'''<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:64px">
{marks(True)}{head('Resultados de los comités', '24 informes en 18 semanas, cada uno con datos de toda la planta', 56, True)}
<div style="display:flex;gap:64px;align-items:stretch">
<div style="flex:1;display:flex;flex-direction:column;gap:28px;justify-content:center">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:#C9B6EE">LO QUE MOSTRARON LOS DATOS · LA SOJA, DESDE MAYO</p>
<div style="display:flex;gap:28px"><div style="flex:1;display:flex;flex-direction:column;gap:6px"><p style="font-size:96px;font-weight:800;line-height:1">66 %</p><p style="font-size:26px;line-height:1.3;color:#CFE0D7">de las toneladas fueron soja: 1,6 millones</p></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><p style="font-size:96px;font-weight:800;line-height:1">6,5 h</p><p style="font-size:26px;line-height:1.3;color:#CFE0D7">tarda un camión de soja desde que entra a Ricardone hasta que sale del puerto</p></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><p style="font-size:96px;font-weight:800;line-height:1">42 min</p><p style="font-size:26px;line-height:1.3;color:#CFE0D7">en movimiento: el resto es espera</p></div></div>
<div style="display:flex;width:1060px;height:100px;border-radius:10px;overflow:hidden"><div style="width:41%;background:#D9A441;display:flex;flex-direction:column;justify-content:center;padding:0 16px"><p style="font-size:24px;font-weight:800;color:#17302A">Espera para calar en Ricardone</p><p style="font-size:24px;color:#17302A">2,7 h · 41 %</p></div><div style="width:48%;background:#E3B95E;display:flex;flex-direction:column;justify-content:center;padding:0 16px;border-left:3px solid #143D2E"><p style="font-size:24px;font-weight:800;color:#17302A">Espera en el puerto hasta descargar</p><p style="font-size:24px;color:#17302A">3,1 h · 48 %</p></div><div style="width:11%;background:#3FA06E;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:0 6px"><p style="font-size:24px;font-weight:800;color:#0F2A20">0,7 h</p><p style="font-size:24px;color:#0F2A20">11 %</p></div></div>
<p style="font-size:24px;line-height:1.4;color:#CFE0D7">En verde, el tiempo en movimiento · 41.489 camiones de soja al puerto desde el 15 de mayo. <b style="color:#EEF3EF">De cada 10 horas, el camión pasa casi 9 esperando.</b></p>
</div>
<div style="width:440px;display:flex;flex-direction:column;gap:36px;justify-content:center">
{stat('2,4 M', 'toneladas analizadas en 79.484 movimientos')}
{stat('3.100 t', 'en 92 recorridos anómalos detectados, a 34 t por camión')}
</div>
</div>
<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:#C9B6EE;padding-right:8px">PARTICIPARON</p>{chips}
</div>
{foot(2, True)}
</section>''')


# 3 y 4 · Logística / Seguridad: hallazgo → decisión → estado
STATUS = {'Hecho': '#1F6E4A', 'En evaluación': '#A3701A', 'Monitoreo': '#2E6DA4', 'Control': '#6B46A8'}

def decisions(kicker, title, n, items, empty=0):
    rows = ''
    allrows = items + [None] * empty
    for i, it in enumerate(allrows):
        bg = 'background:#EAE8DF;' if i % 2 else ''
        if it is None:
            rows += (f'<tr style="{bg}"><td>{hole("hallazgo", 24)}</td><td>{hole("decisión o propuesta", 24)}</td>'
                     f'<td>{hole("estado", 24)}</td></tr>')
        else:
            a, b, st = it
            rows += (f'<tr style="{bg}"><td style="line-height:1.4">{a}</td><td style="line-height:1.4">{b}</td>'
                     f'<td style="font-weight:700;color:{STATUS[st]}">● {st}</td></tr>')
    return f'''<section style="{LIGHT};gap:36px">
{marks()}{head(kicker, title)}
<table style="font-size:28px;width:1664px">
<tr style="background:#143D2E"><th style="width:42%;color:#EEF3EF">Qué encontramos</th><th style="width:42%;color:#EEF3EF">Qué se decidió</th><th style="width:16%;color:#EEF3EF">Estado</th></tr>
{rows}
</table>
{foot(n)}
</section>'''

LOG = [
    ('La mayoría de los camiones llegaba de noche y se acumulaba en el ingreso.',
     'Abrir el cupo cada 2 horas, repartido a lo largo del día.', 'Hecho'),
    ('La flota de transiles está sobredimensionada y el circuito no es fluido.',
     'Mejorar el flujo y bajar lo que se paga por tonelada movida: el camionero lo compensa con más viajes.', 'En evaluación'),
    ('Medimos cuánto tarda cada tramo de cada circuito, camión por camión.',
     'Informe semanal de tiempos por tramo en el comité.', 'Monitoreo'),
    ('Las esperas largas se concentran en Playa 3 y Calada, según la franja del día.',
     'Seguir las esperas por franja y por punto.', 'Monitoreo'),
    ('Medimos la actividad de cada sector: caladas, volcables, balanzas y silos, por hora y por día.',
     'Informe semanal de actividad por sector para ordenar personal y turnos.', 'Monitoreo'),
]
SEG = [
    ('Camiones con doble registro de ingreso: iban al puerto y, a pedido del entregador, volvían a Ricardone a recalar.',
     'Una vez que salen de Ricardone, el entregador ya no puede trabar la descarga en el puerto.', 'Hecho'),
    ('Se permite un excedente de 500 kg; muchos camiones vuelven con 550 kg y tienen que rehacer todo el circuito desde cero.',
     'Ampliar la tolerancia para que no reinicien el circuito.', 'En evaluación'),
    ('Camiones que tardan más de 30 minutos entre Ricardone y San Lorenzo y después no pasan por calada.',
     'Se registran los casos y se controla que se cumpla la regla.', 'Control'),
]

slides.append(decisions('Resultados de los comités · Logística', 'Logística: qué encontramos y qué se decidió', 3, LOG, 0))
slides.append(decisions('Resultados de los comités · Seguridad', 'Seguridad: qué encontramos y qué se decidió', 4, SEG, 0))

# 4b · Justificación económica
def econ(kicker, title, rows, note, n):
    trs = ''
    for i, (a, b, v) in enumerate(rows):
        bg = 'background:#EAE8DF;' if i % 2 else ''
        trs += (f'<tr style="{bg}"><td style="line-height:1.35">{a}</td><td style="line-height:1.35;color:#4A5A53">{b}</td>'
                f'<td style="line-height:1.25;font-weight:800;color:#1F6E4A;font-size:32px">{v}</td></tr>')
    return f"""<section style="{LIGHT};gap:32px">
{marks()}{head(kicker, title)}
<table style="font-size:26px;width:1664px">
<tr style="background:#143D2E"><th style="width:36%;color:#EEF3EF">Qué encontramos</th><th style="width:40%;color:#EEF3EF">Cómo se calcula</th><th style="width:24%;color:#EEF3EF">Valor</th></tr>
{trs}
</table>
<p style="font-size:24px;line-height:1.4;color:#5F6B66">{note}</p>
{foot(n)}
</section>"""

ECO_LOG = [
    ('Transile de Ricardone al puerto desde mayo: 4.874 viajes, 132.000 t de pellet y soja',
     '132.000 t × $ 6.000 por tonelada de flete',
     '$ 794 M pagados'),
    ('El camión hace 2 viajes por día; con el circuito fluido hace 3 a 4 y el flete baja a $ 5.000 por tonelada',
     '132.000 t × $ 1.000 menos por tonelada',
     '$ 132 M menos<br><span style="font-size:24px;font-weight:600;color:#A3701A">todavía no se bajó</span>'),
    ('Celda 16: 100.000 t por mover al puerto',
     '3.333 viajes: $ 600 M a la tarifa de hoy, $ 500 M con el circuito fluido y la mitad de los camiones',
     '$ 100 M menos'),
]
ECO_SEG = [
    ('Doble ciclo con un solo contrato: 34 casos',
     '34 camiones × 34 t promedio',
     '1.160 t sin respaldo<br><span style="font-size:24px;font-weight:600">USD 429.000</span>'),
    ('Vuelven a Ricardone por exceso de kg: 21 casos',
     'Cada uno rehace el circuito: 21 × 6,4 h',
     '134 h de camión'),
    ('Diferencia entre balanzas en el transile de soja: −0,29 %',
     '−27 t en 3 días (327 viajes, 48 camiones)',
     '−27 t en 3 días<br><span style="font-size:24px;font-weight:600">USD 10.000</span>'),
    ('Descarga en el Excel sin lectura de cámara en el puerto',
     'AAE877: 29.460 kg cargados en silo, sin pasar por el puerto según las cámaras',
     '29,5 t sin evidencia<br><span style="font-size:24px;font-weight:600">USD 10.900</span>'),
]
NOTE = 'Flete del transile: $ 180.000 por viaje de 30 t = $ 6.000 por tonelada (comité de octubre). Viajes y toneladas: Excel de movimientos, egresos de Ricardone al puerto, del 15/05 al 13/10.'
NOTE_SEG = 'Toneladas por camión: promedio de soja del Excel de movimientos (34 t). Soja a USD 370 por tonelada.'
slides.append(econ('Resultados de los comités · Lo que vale', 'Logística: lo que pagamos de transile y lo que se puede bajar', ECO_LOG, NOTE, 5))
slides.append(econ('Resultados de los comités · Lo que protegemos', 'Seguridad: lo que encontramos, en toneladas y en dólares', ECO_SEG, NOTE_SEG, 6))

# 6b · Esperar cuesta capacidad
SEM_ROWS = """<tr style=""><td style="color:#EEF3EF">Semana del 24/08</td><td style="text-align:right;color:#EEF3EF">2.949</td><td style="text-align:right;color:#EEF3EF">95.138</td><td style="text-align:right;font-weight:800;color:#EEF3EF">6,6 h</td><td style="text-align:right;color:#CFE0D7">2,7 h</td></tr><tr style=""><td style="color:#EEF3EF">Semana del 01/06</td><td style="text-align:right;color:#EEF3EF">2.779</td><td style="text-align:right;color:#EEF3EF">89.687</td><td style="text-align:right;font-weight:800;color:#7CC29C">5,5 h</td><td style="text-align:right;color:#CFE0D7">1,7 h</td></tr><tr style="background:#1E4D3B;"><td style="color:#EEF3EF">Semana del 07/09</td><td style="text-align:right;color:#EEF3EF">2.654</td><td style="text-align:right;color:#EEF3EF">85.051</td><td style="text-align:right;font-weight:800;color:#7CC29C">5,6 h</td><td style="text-align:right;color:#CFE0D7">2,5 h</td></tr><tr style=""><td style="color:#EEF3EF">Semana del 10/08</td><td style="text-align:right;color:#EEF3EF">2.636</td><td style="text-align:right;color:#EEF3EF">85.328</td><td style="text-align:right;font-weight:800;color:#E3B95E">7,1 h</td><td style="text-align:right;color:#CFE0D7">2,5 h</td></tr><tr style=""><td style="color:#EEF3EF">Semana del 29/06</td><td style="text-align:right;color:#EEF3EF">2.630</td><td style="text-align:right;color:#EEF3EF">85.293</td><td style="text-align:right;font-weight:800;color:#E3B95E">8,1 h</td><td style="text-align:right;color:#CFE0D7">3,9 h</td></tr><tr style="background:#1E4D3B;"><td style="color:#EEF3EF">Semana del 13/07</td><td style="text-align:right;color:#EEF3EF">2.596</td><td style="text-align:right;color:#EEF3EF">84.146</td><td style="text-align:right;font-weight:800;color:#E3B95E">8,7 h</td><td style="text-align:right;color:#CFE0D7">4,1 h</td></tr>"""
slides.append(f"""<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:36px">
{marks(True)}{head('Resultados de los comités · El precio del desorden', 'Semanas de mucha actividad: mismo volumen, de 5,6 a 8,7 h de ciclo', 56, True)}
<div style="display:flex;gap:40px;align-items:flex-start">
<table style="font-size:26px;width:1020px">
<tr style="background:#0F2A20"><th style="color:#C9B6EE">Semana</th><th style="text-align:right;color:#C9B6EE">Camiones</th><th style="text-align:right;color:#C9B6EE">Toneladas</th><th style="text-align:right;color:#C9B6EE">Ciclo</th><th style="text-align:right;color:#C9B6EE">Espera para calar</th></tr>
{SEM_ROWS}
</table>
<div style="flex:1;display:flex;flex-direction:column;gap:22px">
<div style="display:flex;flex-direction:column;gap:6px;border-top:6px solid #D9A441;padding-top:18px"><p style="font-size:64px;font-weight:800;line-height:1">4.550</p><p style="font-size:26px;line-height:1.3;color:#CFE0D7">camiones por semana podría descargar el puerto con los volcables de hoy; el récord fue 2.949</p></div>
<div style="display:flex;flex-direction:column;gap:6px;border-top:6px solid #D9A441;padding-top:18px"><p style="font-size:64px;font-weight:800;line-height:1">+52.000 t</p><p style="font-size:26px;line-height:1.3;color:#CFE0D7">por semana de mucha actividad con el circuito fluido: <b style="color:#E3B95E">USD 19 M</b> de mercadería, a USD 370</p></div>
</div>
</div>
<p style="font-size:24px;line-height:1.4;color:#BCD3C7">Semanas con más de 2.500 camiones descargados en el puerto, del 15/05 al 12/10, granos y pellet · sistema de camiones (Excel de movimientos). Ciclo: de entrar a Ricardone a salir del puerto.</p>
{foot(7, True)}
</section>""")

# 5 · Situación actual: grafo + lectura por nodo
def color(v):
    return '#1F6E4A' if v >= 80 else ('#A3701A' if v >= 50 else '#B3412E')

# (punto, total, día, noche) · estudio de septiembre
NODOS = [('Ingreso Ric', 78, 93, 64), ('Preingreso Ric', 90, 94, 87), ('Calada Ric', 82, 85, 80), ('Balanza ingreso Ric', 70, 71, 68),
         ('Playa 3 Ric', 67, 79, 52), ('Descarga silos Ric', 83, 95, 71), ('Carga silo Chief Ric', 61, 76, 45), ('Volcables Ric', 87, 90, 85),
         ('Balanza egreso Ric', 83, 87, 79), ('Salida Ric', 74, 84, 65),
         ('Ingreso SL', 81, 85, 78), ('Balanza ingreso SL', 78, 86, 70), ('Carga OSL SL', 64, 70, 50), ('Volcables SL', 71, 94, 53),
         ('Líquidos SL', 69, 70, 66), ('Balanza egreso SL', 31, 46, 17), ('Egreso SL', 86, 89, 84)]

def fix(p, dia, noche):
    if p == 'Balanza egreso SL':
        return 'Manipulación humana', '#B3412E'
    if p in ('Calada Ric', 'Volcables SL'):
        return 'Mejorar calidad de imagen', '#6B46A8'
    if p == 'Preingreso Ric' or dia - noche >= 15:
        return 'Iluminación nocturna', '#A3701A'
    return 'Limpieza / mantenimiento', '#2E6DA4'

trs = ''
for i, (p, tot, dia, noc) in enumerate(sorted(NODOS, key=lambda r: -r[1])):
    bg = 'background:#EAE8DF;' if i % 2 else ''
    f, fc = fix(p, dia, noc)
    trs += (f'<tr style="{bg}"><td style="padding:3px 12px;line-height:1.15">{p}</td>'
            f'<td style="padding:3px 12px;line-height:1.15;text-align:right;font-weight:700;color:{color(tot)}">{tot} %</td>'
            f'<td style="padding:3px 12px;line-height:1.15;color:{fc}">{f}</td></tr>')

slides.append(f'''<section style="{LIGHT};gap:24px">
{marks()}{head('Situación actual · Lectura de cámaras', 'Cuánto lee cada punto y qué corregir')}
<div style="display:flex;gap:24px;align-items:flex-start">
<div style="width:880px;display:flex;flex-direction:column;gap:24px">
<img src="img/modelo-nodos.png" alt="Grafo de nodos de Ricardone y Puerto San Lorenzo conectados por los circuitos" style="width:880px;height:420px;object-fit:contain;background:#FDFCF9;border-radius:12px">
<div style="display:flex;gap:24px;align-items:stretch">
<div style="display:flex;flex-direction:column;gap:6px;background:#143D2E;color:#EEF3EF;padding:22px 28px;border-radius:12px">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:#C9B6EE">PROMEDIO SEPTIEMBRE</p>
<p style="font-size:72px;font-weight:800;line-height:1">75 %</p>
</div>
</div>
</div>
<table style="font-size:27px;width:760px;white-space:nowrap">
<tr style="background:#143D2E"><th style="padding:6px 12px;color:#EEF3EF">Punto</th><th style="padding:6px 12px;text-align:right;color:#EEF3EF">Lee</th><th style="padding:6px 12px;color:#EEF3EF">Qué corregir</th></tr>
{trs}
</table>
</div>
{foot(5)}
</section>''')


# 6 · Algoritmo
def step(n, t, d, c):
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:10px;background:#FDFCF9;border:1px solid #DCD9CE;border-top:8px solid {c};border-radius:12px;padding:26px 28px">'
            f'<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:{c}">{n}</p><h3 style="font-size:30px;font-weight:700">{t}</h3>'
            f'<p style="font-size:26px;line-height:1.4">{d}</p></div>')

slides.append(f'''<section style="{LIGHT};gap:40px">
{marks()}{head('Situación actual · El algoritmo', 'Con el algoritmo, el recorrido de cada camión pasa del 75 % al 99 %')}
<div style="display:flex;gap:24px">
{step('1', 'Universo conocido', 'Sabemos qué camiones están en planta y qué paso de su circuito les falta.', '#1F6E4A')}
{step('2', 'Candidatos', 'Cuando una cámara saca una foto, compiten solo los que tienen ese punto pendiente.', '#6B46A8')}
{step('3', 'La cuenta', 'Paso esperado × patente × marca y color: gana el más probable y la patente se corrige sola.', '#C9922E')}
</div>
<div style="display:flex;flex-direction:column;gap:14px">
<div style="display:flex;align-items:center;gap:24px"><p style="font-size:28px;font-weight:700;width:280px">Solo cámaras</p><div style="width:1000px;height:64px;background:#2E6DA4;border-radius:8px;display:flex;align-items:center;padding:0 20px"><p style="font-size:30px;font-weight:800;color:#F5F4EE">75 %</p></div></div>
<div style="display:flex;align-items:center;gap:24px"><p style="font-size:28px;font-weight:700;width:280px">Cámara + algoritmo</p><div style="width:1320px;height:64px;background:#1F6E4A;border-radius:8px;display:flex;align-items:center;padding:0 20px"><p style="font-size:30px;font-weight:800;color:#F5F4EE">99 %</p></div></div>
<p style="font-size:24px;color:#5F6B66">Pasos registrados de cada camión. Cuando el algoritmo corrige una patente, acierta 98 de cada 100.</p>
</div>
{foot(6)}
</section>''')

# 7 · Ejemplo paso a paso: UUL425
slides.append(f'''<section style="{LIGHT};gap:32px">
{marks()}{head('Situación actual · Un caso real, paso a paso', 'La cámara no leyó nada parecido a la patente, y aun así sabemos qué camión es')}
<div style="display:flex;gap:40px;align-items:flex-start">
<img src="img/ej-uul.png" alt="Izquierda: de noche la salida de San Lorenzo lee A26027 sobre un Mercedes viejo. Derecha: el mismo Mercedes 13 minutos antes en el volcable, leído UUL425" style="width:960px;height:312px;object-fit:cover;border-radius:12px">
<div style="flex:1;display:flex;flex-direction:column;gap:16px">
<div style="display:flex;flex-direction:column;gap:4px"><p style="font-size:24px;font-weight:700;color:#1F6E4A">1 · 05:26 · VOLCABLE 4</p><p style="font-size:26px;line-height:1.35">Lee bien <b>UUL425</b> mientras descarga.</p></div>
<div style="display:flex;flex-direction:column;gap:4px"><p style="font-size:24px;font-weight:700;color:#8E2F20">2 · 05:39 · SALIDA SAN LORENZO</p><p style="font-size:26px;line-height:1.35">Lee <b>A26027</b>: ninguna letra en común.</p></div>
<div style="display:flex;flex-direction:column;gap:4px"><p style="font-size:24px;font-weight:700;color:#6B46A8">3 · QUIÉN PODÍA SER</p><p style="font-size:26px;line-height:1.35">Solo UUL425 tenía la salida pendiente.</p></div>
<div style="display:flex;flex-direction:column;gap:4px"><p style="font-size:24px;font-weight:700;color:#C9922E">4 · LA FOTO CONFIRMA</p><p style="font-size:26px;line-height:1.35">Mismo Mercedes, mismo color.</p></div>
</div>
</div>
<div style="display:flex;flex-direction:column;gap:8px;background:#143D2E;padding:22px 32px;border-radius:12px">
<p style="font-size:26px;color:#CFE0D7">Paso <b style="color:#7CC29C">×1, único candidato</b> · Patente <b style="color:#C9B6EE">×1, no aporta</b> · Marca y color <b style="color:#E3B95E">×6,26</b> · Nuevo en el circuito <b style="color:#9DC3EA">0,35</b></p>
<p style="font-size:36px;font-weight:700;color:#EEF3EF">P(UUL425) = 6,26 ÷ (6,26 + 0,35) = <span style="color:#7CC29C">95 %</span> · se corrige solo</p>
</div>
{foot(7)}
</section>''')

# 7b · Hábitos en planta
slides.append(f'''<section style="{LIGHT};gap:40px">
{marks()}{head('Situación actual · Lo que suma a la lectura', 'Tres hábitos simples que ayudan a que la cámara vea la patente', 60)}
<div style="display:flex;gap:40px;align-items:stretch">
<div style="flex:1;display:flex;flex-direction:column;gap:24px">
<div style="display:flex;flex-direction:column;gap:8px;background:#FDFCF9;padding:26px 32px;border:1px solid #DCD9CE;border-left:10px solid #1F6E4A;border-radius:12px">
<h3 style="font-size:32px;font-weight:700">Ingreso y Preingreso iluminados</h3>
<p style="font-size:26px;line-height:1.4">Es donde cada camión entra a la lista. Si ahí se lee bien de noche, todo el recorrido se sostiene.</p>
</div>
<div style="display:flex;flex-direction:column;gap:8px;background:#FDFCF9;padding:26px 32px;border:1px solid #DCD9CE;border-left:10px solid #6B46A8;border-radius:12px">
<h3 style="font-size:32px;font-weight:700">Luces apagadas en Preingreso y balanzas</h3>
<p style="font-size:26px;line-height:1.4">Son puntos de control: de noche los faros encandilan la cámara y borran la patente.</p>
</div>
<div style="display:flex;flex-direction:column;gap:8px;background:#FDFCF9;padding:26px 32px;border:1px solid #DCD9CE;border-left:10px solid #C9922E;border-radius:12px">
<h3 style="font-size:32px;font-weight:700">Distancia entre camiones en Calada</h3>
<p style="font-size:26px;line-height:1.4">Cuando llegan pegados, uno tapa la patente del otro o la cámara toma el techo del camión.</p>
</div>
</div>
<div style="width:640px;display:flex;flex-direction:column;gap:14px">
<img src="img/luces.png" alt="De noche en Preingreso, los faros encendidos alrededor de la patente PDD400 encandilan la cámara" style="width:640px;height:398px;object-fit:cover;border-radius:12px">
<p style="font-size:24px;line-height:1.4;color:#5F6B66">Preingreso Ricardone, 05/10 de noche: con los faros encendidos sobre la patente, la cámara leyó PQD400 en lugar de PDD400.</p>
</div>
</div>
{foot(8)}
</section>''')


# 8b · Capacidad: dónde está el cuello de botella
def cap(rec, hoy, cap_dia, nota, lim=False):
    c = '#B3412E' if lim else '#17302A'
    return (f'<tr><td style="line-height:1.35"><b>{rec}</b></td><td style="line-height:1.35">{hoy}</td>'
            f'<td style="text-align:right;font-weight:800;color:{c};font-size:32px">{cap_dia}</td><td style="line-height:1.35;color:#4A5A53">{nota}</td></tr>')

slides.append(f"""<section style="{LIGHT};gap:32px">
{marks()}{head('Propuesta · Capacidad del puerto', 'Al automatizar, el cuello de botella pasa a la balanza')}
<table style="font-size:26px;width:1664px">
<tr style="background:#143D2E"><th style="width:22%;color:#EEF3EF">Recurso en San Lorenzo</th><th style="width:30%;color:#EEF3EF">Cómo trabaja</th><th style="width:18%;text-align:right;color:#EEF3EF">Camiones por día</th><th style="width:30%;color:#EEF3EF">Escenario</th></tr>
{cap('Volcables, hoy', '3 a 4 plataformas en uso, 1 camión cada 7 min, 2 h 15 min de limpiezas por día', '650', 'Hoy es el cuello: el mejor día de soja llegó a 582', True)}
{cap('Volcables, con las 5', '5 plataformas en uso', '930', 'Supera a la balanza')}
{cap('Balanza, hoy', '38 camiones por hora, 1,5 min por pesaje, compartida con pellet y líquidos', '900', 'Pasa a ser el cuello', True)}
{cap('Balanza automática', 'Pesaje sin carga manual: ' + hole('min por pesaje', 24), hole('—', 28), 'Lo que define la capacidad del puerto')}
</table>
<p style="font-size:28px;line-height:1.4;background:#EAE8DF;padding:24px 32px;border-radius:12px">Abrir más volcables sin automatizar la balanza solo mueve la cola. <b>La reingeniería de las balanzas es la que libera capacidad.</b></p>
{foot(9)}
</section>""")


# 8 · Propuesta: Balanzas automáticas
def flow(n, t, c):
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:8px;background:#FDFCF9;border:3px solid {c};border-radius:12px;padding:20px 20px">'
            f'<p style="font-size:24px;font-weight:700;color:{c}">{n}</p><p style="font-size:28px;line-height:1.35">{t}</p></div>')

arrow = '<p style="font-size:44px;font-weight:800;color:#6B46A8;align-self:center">→</p>'
slides.append(f"""<section style="{LIGHT};gap:32px">
{marks()}{head('Propuesta · Balanzas automáticas', 'El camión sube a la balanza, se pesa, se registra solo y la barrera se abre')}
<div style="display:flex;gap:12px;align-items:stretch">
{flow('1 · LLEGA', 'Las fotocélulas detectan el camión en posición', '#2E6DA4')}{arrow}
{flow('2 · SE LEE', 'La cámara lee la patente', '#1F6E4A')}{arrow}
{flow('3 · SE PESA', 'El PLC lee el peso de la balanza', '#6B46A8')}{arrow}
{flow('4 · SE REGISTRA', 'Patente y peso pasan solos al sistema de camiones y a TruckFlow', '#C9922E')}{arrow}
{flow('5 · SE ABRE', 'El PLC abre la barrera', '#1F6E4A')}
</div>
<div style="display:flex;gap:24px">
<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:#EAE8DF;padding:28px 32px;border-radius:12px">
<h3 style="font-size:34px;font-weight:700">Qué hace falta</h3>
<p style="font-size:27px;line-height:1.35">PLC de barreras automáticas que lea el peso de la balanza</p>
<p style="font-size:27px;line-height:1.35">Fotocélulas en cada balanza</p>
<p style="font-size:27px;line-height:1.35">Conexión con el sistema de camiones y con TruckFlow</p>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:#143D2E;color:#EEF3EF;padding:28px 32px;border-radius:12px">
<h3 style="font-size:34px;font-weight:700;color:#7CC29C">Qué gana la planta</h3>
<p style="font-size:27px;line-height:1.35">El operario ya no carga el peso a mano en el sistema.</p>
<p style="font-size:27px;line-height:1.35;color:#CFE0D7">Sin errores de tipeo y sin esperar a que alguien registre la pesada.</p>
</div>
</div>
{foot(8)}
</section>""")

# 9 · Convivencia y modernización
def bullet(x, c, dark=False):
    col = '#CFE0D7' if dark else '#17302A'
    return f'<p style="font-size:30px;line-height:1.4;color:{col};border-left:6px solid {c};padding-left:18px">{x}</p>'

slides.append(f"""<section style="{LIGHT};gap:40px">
{marks()}{head('Propuesta · Cómo convivimos con lo que hay', 'Hoy conviven los dos sistemas; todo lo nuevo se construye sobre TruckFlow')}
<div style="display:flex;gap:32px">
<div style="flex:1;display:flex;flex-direction:column;gap:16px;background:#FDFCF9;border:1px solid #DCD9CE;border-top:8px solid #D9A441;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#A3701A">CORTO PLAZO · CONVIVIR</p>
<h3 style="font-size:42px;font-weight:800">Sistema de camiones</h3>
{bullet('Monitorea todo el flujo de camiones', '#D9A441')}
{bullet('Lo operan operarios en distintos puntos', '#D9A441')}
{bullet('Pesos, patentes y otros datos se cargan a mano', '#D9A441')}
<p style="font-size:30px;line-height:1.4;font-weight:700;padding-top:6px">Las cámaras y el algoritmo se suman sin cambiar la operación.</p>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:16px;background:#143D2E;color:#EEF3EF;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#7CC29C">LARGO PLAZO · MODERNIZAR</p>
<h3 style="font-size:42px;font-weight:800">TruckFlow</h3>
{bullet('Cada mejora automatiza un proceso: más fluido, independiente y centralizado', '#7CC29C', True)}
{bullet('Los datos se cargan solos desde cámaras, balanzas y PLC', '#7CC29C', True)}
{bullet('Un solo sistema con todo el circuito de cada camión', '#7CC29C', True)}
{bullet('Asistentes de IA conectados por MCP que responden consultas y avisan desvíos', '#7CC29C', True)}
</div>
</div>
{foot(9)}
</section>""")


# 10 · Próximos pasos
def item(x, c):
    return f'<p style="font-size:28px;line-height:1.4;color:#EEF3EF;border-left:6px solid {c};padding-left:18px">{x}</p>'

slides.append(f"""<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:40px">
{marks(True)}{head('Próximos pasos', 'Lo que pedimos aprobar y lo que sigue', 60, True)}
<div style="display:flex;gap:32px;align-items:stretch">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:#1E4D3B;border-top:8px solid #D9A441;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#E3B95E">SOLICITUD DE APROBACIÓN · PROPUESTA ENESIMAL</p>
<h3 style="font-size:40px;font-weight:800">Reingeniería de las balanzas</h3>
{item('PLC de barrera automática que lee el peso de la balanza', '#E3B95E')}
{item('Fotocélulas para ubicar el camión en la balanza', '#E3B95E')}
{item('Patente y peso pasan solos al sistema de camiones y a TruckFlow', '#E3B95E')}
</div>
<div style="flex:2;display:flex;flex-direction:column;gap:16px;background:#1E4D3B;border-top:8px solid #A48AD8;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#C9B6EE">AVANCE · NODO NORTE</p>
<h3 style="font-size:40px;font-weight:800">Instalación de cámaras</h3>
{item('Solicitud de instalación de las cámaras', '#C9B6EE')}
{item('Pedir presupuesto a A&amp;T con el mismo esquema del Nodo Sur', '#C9B6EE')}
{item('Con esa respuesta, definir cómo seguimos', '#C9B6EE')}
</div>
</div>
{foot(10, True)}
</section>""")


HEAD = '''<meta charset="utf-8">
<title>Reunión Nodo Sur</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
/* Layout: láminas 16:9 apiladas, cada una escalada al ancho disponible. Paleta fija del deck (verde NVA + violeta), un solo tema. */
:root{--ground:#DCD9CE;--ink:#17302A;--line:#C9C5B8;color-scheme:light}
html,body{background:var(--ground);color:var(--ink)}
body{font-family:'Plus Jakarta Sans',Arial,sans-serif;padding-inline:16px;padding-block:24px 48px}
.deck{max-width:1280px;margin-inline:auto;display:flex;flex-direction:column;gap:24px}
.frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:8px;box-shadow:0 2px 10px rgba(23,48,42,.18);max-width:100%}
.frame>section{position:absolute;left:0;top:0;width:1920px;height:1080px;box-sizing:border-box;transform-origin:0 0;transform:scale(var(--k,.5))}
.frame *{box-sizing:border-box;margin:0}
.frame table{border-collapse:collapse}
.frame th,.frame td{padding:16px 20px;text-align:left;vertical-align:top;line-height:1.35;border-bottom:1px solid var(--line)}
.frame th{font-weight:700}
</style>'''
JS = '''<script>
(function(){var fs=[].slice.call(document.querySelectorAll('.frame'));function fit(){fs.forEach(function(f){f.style.setProperty('--k',f.clientWidth/1920)})}
fit();window.addEventListener('resize',fit);if(window.ResizeObserver){var ro=new ResizeObserver(fit);fs.forEach(function(f){ro.observe(f)})}})();
</script>'''
body = '\n'.join(f'<div class="frame" aria-label="Lámina {i}">{s}</div>' for i, s in enumerate(slides, 1))
open(OUT, 'w', encoding='utf-8').write(HEAD + '\n<main class="deck">\n' + body + '\n</main>\n' + JS)
print(len(slides), 'láminas')

# Numeración de pies según el orden real
import re as _re
_h = open(OUT, encoding='utf-8').read()
_parts = _h.split('<div class="frame" aria-label="Lámina ')
for _i in range(1, len(_parts)):
    _parts[_i] = _re.sub(r'(NODO SUR</b>) · \d+', rf'\g<1> · {_i}', _parts[_i])
open(OUT, 'w', encoding='utf-8').write('<div class="frame" aria-label="Lámina '.join(_parts))
