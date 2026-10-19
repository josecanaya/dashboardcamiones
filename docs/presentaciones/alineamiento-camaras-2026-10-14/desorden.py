
# 6b · El precio del desorden
def big(n, l, sub=''):
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:10px;border-top:6px solid #D9A441;padding-top:22px">'
            f'<p style="font-size:84px;font-weight:800;line-height:1">{n}</p><p style="font-size:28px;line-height:1.3;color:#EEF3EF">{l}</p>'
            + (f'<p style="font-size:24px;line-height:1.35;color:#BCD3C7">{sub}</p>' if sub else '') + '</div>')

slides.append(f"""<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:56px">
{marks(True)}{head('Resultados de los comités · El precio del desorden', 'Lo que cuesta un camión parado, sumado desde junio', 60, True)}
<div style="display:flex;gap:40px">
{big('100.000 h', 'de camiones de soja esperando para calar', '38.591 camiones × 2,6 h · Excel de movimientos')}
{big('$ 3.281 M', 'es lo que valen esas horas de camión', 'a $ 32.800 la hora: lo paga la cadena y vuelve en la tarifa del flete')}
{big('$ 101 M', 'de flete de pellet de más', 'flota de 64 camiones para un trabajo de 34')}
</div>
<p style="font-size:30px;line-height:1.4;background:#1E4D3B;padding:26px 34px;border-radius:12px">Y es un piso: no suma la espera en el puerto, que es todavía mayor. <b style="color:#E3B95E">Ordenar el flujo vale más que cualquier obra.</b></p>
{foot(7, True)}
</section>""")
