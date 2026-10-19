# 10 · Próximos pasos
def item(x, c):
    return f'<p style="font-size:28px;line-height:1.4;color:#EEF3EF;border-left:6px solid {c};padding-left:18px">{x}</p>'

slides.append(f"""<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:40px">
{marks(True)}{head('Próximos pasos', 'Lo que pedimos aprobar y lo que sigue', 60, True)}
<div style="display:flex;gap:32px;align-items:stretch">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:#1E4D3B;border-top:8px solid #D9A441;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#E3B95E">SOLICITUD DE APROBACIÓN · PROPUESTA ENESIMAL</p>
<h3 style="font-size:40px;font-weight:800">Reingeniería de las balanzas sobre TruckFlow</h3>
{item('Integración de las balanzas por PLC, con fotocélulas: peso y posición del camión', '#E3B95E')}
{item('Cada paso confirmado con dos fuentes: cámara y balanza', '#E3B95E')}
{item('Comandos desde TruckFlow: barrera, semáforo y llamado de camiones, con aprobación', '#E3B95E')}
{item('Acceso al sistema de camiones y a las balanzas por parte de Vicentin', '#E3B95E')}
<p style="font-size:26px;line-height:1.5;color:#CFE0D7;padding-top:6px">Inversión: {hole('monto', 26, True)} · Plazo: {hole('plazo', 26, True)}</p>
</div>
<div style="flex:2;display:flex;flex-direction:column;gap:16px;background:#1E4D3B;border-top:8px solid #A48AD8;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#C9B6EE">AVANCE · NODO NORTE</p>
<h3 style="font-size:40px;font-weight:800">Instalación de cámaras</h3>
{item('Solicitud de instalación de las cámaras', '#C9B6EE')}
{item('Pedir presupuesto a A y T', '#C9B6EE')}
{item('Con esa respuesta, definir cómo seguimos', '#C9B6EE')}
</div>
</div>
{foot(10, True)}
</section>""")

