
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
    ('Pellet: 64 camiones contratados para 2 viajes por día',
     'Con una segunda volcable el camión hace 3 a 4 viajes y el flete baja de $ 6.000 a $ 5.000 por tonelada',
     '$ 13,3 M en el operativo de octubre<br><span style="font-size:24px;font-weight:600">$ 101,2 M desde junio</span>'),
    ('Transile de silos al puerto: la espera para cargar bajó de 183 a 131 min',
     '52 min menos × 516 viajes = 447 horas de camión',
     '$ 14,7 M en 11 días'),
    ('Soja: el ciclo bajó de 7,4 h (julio) a 4,1 h (octubre)',
     '3,3 h menos × 109 camiones por día',
     '350 h de camión libres por día'),
]
ECO_SEG = [
    ('Doble ciclo con un solo contrato: 34 casos',
     '34 camiones × 34 t promedio',
     '1.160 t movidas sin respaldo'),
    ('Vuelven a Ricardone por exceso de kg: 21 casos',
     'Cada uno rehace el circuito: 21 × 6,4 h = 134 horas de camión',
     '$ 4,4 M'),
    ('Diferencia entre balanzas en el transile de soja: −0,29 %',
     '−27 t en 3 días (327 viajes, 48 camiones)',
     '−27 t en 3 días<br><span style="font-size:24px;font-weight:600">' + hole('valor por tonelada', 24) + '</span>'),
    ('Descarga en el Excel sin lectura de cámara en el puerto',
     'AAE877: 29.460 kg cargados en silo, sin pasar por el puerto según las cámaras',
     '29,5 t sin evidencia'),
]
NOTE = 'Hora de camión: $ 180.000 por viaje ÷ 5 h 29 min de vuelta, la tarifa del pellet del comité de octubre = $ 32.800 por hora.'
slides.append(econ('Resultados de los comités · Lo que vale', 'Logística: lo que encontramos, en pesos y en horas', ECO_LOG, NOTE, 5))
slides.append(econ('Resultados de los comités · Lo que protegemos', 'Seguridad: lo que encontramos, en toneladas y en pesos', ECO_SEG, NOTE, 6))
