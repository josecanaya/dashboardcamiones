
# 8b · Capacidad: dónde está el cuello de botella
def cap(rec, hoy, cap_dia, nota, lim=False):
    c = '#B3412E' if lim else '#17302A'
    return (f'<tr><td style="line-height:1.35"><b>{rec}</b></td><td style="line-height:1.35">{hoy}</td>'
            f'<td style="text-align:right;font-weight:800;color:{c};font-size:32px">{cap_dia}</td><td style="line-height:1.35;color:#4A5A53">{nota}</td></tr>')

slides.append(f"""<section style="{LIGHT};gap:32px">
{marks()}{head('Propuesta · Capacidad del puerto', 'Hoy limita el volcable; al automatizar, el límite pasa a la balanza de San Lorenzo')}
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
