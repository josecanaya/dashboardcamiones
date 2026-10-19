# 5 · Situación actual: grafo + lectura por nodo
def color(v):
    return '#1F6E4A' if v >= 80 else ('#A3701A' if v >= 65 else '#B3412E')

# (punto, total, día, noche) · estudio de septiembre
NODOS = [('Ingreso Ric', 78, 93, 64), ('Preingreso Ric', 90, 94, 87), ('Calada Ric', 82, 85, 80), ('Bal. ingreso Ric', 70, 71, 68),
         ('Playa 3 Ric', 67, 79, 52), ('Descarga S7 Ric', 83, 95, 71), ('Tolva Chief Ric', 61, 76, 45), ('Volcable 1 Ric', 93, 94, 92),
         ('Volcable 2 Ric', 73, 78, 67), ('Bal. egreso Ric', 83, 87, 79), ('Salida Ric', 74, 84, 65),
         ('Ingreso SL', 81, 85, 78), ('Bal. ingreso SL', 78, 86, 70), ('Carga OSL', 64, 70, 50), ('Volcables SL', 71, 94, 53),
         ('Líquidos SL', 69, 70, 66), ('Bal. egreso SL', 31, 46, 17), ('Egreso SL', 86, 89, 84)]

def fix(p, dia, noche):
    if p.startswith('Bal.'):
        return 'Manipulación humana', '#B3412E'
    if dia - noche >= 15:
        return 'Iluminación nocturna', '#A3701A'
    return 'Limpieza / mantenimiento', '#2E6DA4'

trs = ''
for i, (p, tot, dia, noc) in enumerate(sorted(NODOS, key=lambda r: r[1])):
    bg = 'background:#EAE8DF;' if i % 2 else ''
    f, fc = fix(p, dia, noc)
    trs += (f'<tr style="{bg}"><td style="padding:3px 12px;line-height:1.15">{p}</td>'
            f'<td style="padding:3px 12px;line-height:1.15;text-align:right;font-weight:700;color:{color(tot)}">{tot} %</td>'
            f'<td style="padding:3px 12px;line-height:1.15;color:{fc}">{f}</td></tr>')

slides.append(f\'\'\'<section style="{LIGHT};gap:24px">
{marks()}{head('Situación actual · Lectura de cámaras', 'Cuánto lee cada punto de la planta y qué hay que corregir')}
<div style="display:flex;gap:24px;align-items:flex-start">
<div style="width:1000px;display:flex;flex-direction:column;gap:24px">
<img src="img/modelo-nodos.png" alt="Grafo de nodos de Ricardone y Puerto San Lorenzo conectados por los circuitos" style="width:1000px;height:420px;object-fit:contain;background:#FDFCF9;border-radius:12px">
<div style="display:flex;gap:24px;align-items:stretch">
<div style="display:flex;flex-direction:column;gap:6px;background:#143D2E;color:#EEF3EF;padding:22px 28px;border-radius:12px">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:#C9B6EE">PROMEDIO SEPTIEMBRE</p>
<p style="font-size:72px;font-weight:800;line-height:1">75 %</p>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center">
<p style="font-size:24px"><b style="color:#B3412E">Manipulación humana</b> · balanzas: se mueve la cámara</p>
<p style="font-size:24px"><b style="color:#A3701A">Iluminación nocturna</b> · leen bien de día y mal de noche</p>
<p style="font-size:24px"><b style="color:#2E6DA4">Limpieza / mantenimiento</b> · leen poco todo el día</p>
</div>
</div>
</div>
<table style="font-size:24px;width:640px">
<tr style="background:#143D2E"><th style="padding:6px 12px;color:#EEF3EF">Punto</th><th style="padding:6px 12px;text-align:right;color:#EEF3EF">Lee</th><th style="padding:6px 12px;color:#EEF3EF">Qué corregir</th></tr>
{trs}
</table>
</div>
{foot(5)}
</section>\'\'\')

