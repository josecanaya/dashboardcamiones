# 8 · Propuesta: Balanzas automáticas
def flow(n, t, c):
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:8px;background:#FDFCF9;border:3px solid {c};border-radius:12px;padding:20px 20px">'
            f'<p style="font-size:24px;font-weight:700;color:{c}">{n}</p><p style="font-size:26px;line-height:1.35">{t}</p></div>')

arrow = '<p style="font-size:44px;font-weight:800;color:#6B46A8;align-self:center">→</p>'
slides.append(f"""<section style="{LIGHT};gap:40px">
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
<h3 style="font-size:30px;font-weight:700">Qué hace falta</h3>
<p style="font-size:26px;line-height:1.4">PLC de barreras automáticas que lea el peso de la balanza</p>
<p style="font-size:26px;line-height:1.4">Fotocélulas en cada balanza</p>
<p style="font-size:26px;line-height:1.4">Conexión con el sistema de camiones y con TruckFlow</p>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:#143D2E;color:#EEF3EF;padding:28px 32px;border-radius:12px">
<h3 style="font-size:30px;font-weight:700;color:#7CC29C">Qué gana la planta</h3>
<p style="font-size:26px;line-height:1.4">El operario ya no carga el peso a mano en el sistema.</p>
<p style="font-size:26px;line-height:1.4;color:#CFE0D7">Sin errores de tipeo y sin esperar a que alguien registre la pesada.</p>
</div>
</div>
{foot(8)}
</section>""")

# 9 · Convivencia y modernización
def bullet(x, c, dark=False):
    col = '#CFE0D7' if dark else '#17302A'
    return f'<p style="font-size:26px;line-height:1.4;color:{col};border-left:6px solid {c};padding-left:18px">{x}</p>'

slides.append(f"""<section style="{LIGHT};gap:40px">
{marks()}{head('Propuesta · Cómo convivimos con lo que hay', 'Hoy conviven los dos sistemas; todo lo nuevo se construye sobre TruckFlow')}
<div style="display:flex;gap:32px">
<div style="flex:1;display:flex;flex-direction:column;gap:16px;background:#FDFCF9;border:1px solid #DCD9CE;border-top:8px solid #D9A441;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#A3701A">CORTO PLAZO · CONVIVIR</p>
<h3 style="font-size:36px;font-weight:800">Sistema de camiones</h3>
{bullet('Monitorea todo el flujo de camiones', '#D9A441')}
{bullet('Lo operan operarios en distintos puntos', '#D9A441')}
{bullet('Pesos, patentes y otros datos se cargan a mano', '#D9A441')}
<p style="font-size:26px;line-height:1.4;font-weight:700;padding-top:6px">Las cámaras y el algoritmo se suman sin cambiar la operación.</p>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:16px;background:#143D2E;color:#EEF3EF;border-radius:14px;padding:32px 36px">
<p style="font-size:24px;font-weight:700;letter-spacing:3px;color:#7CC29C">LARGO PLAZO · MODERNIZAR</p>
<h3 style="font-size:36px;font-weight:800">TruckFlow</h3>
{bullet('Cada mejora automatiza un proceso: más fluido, independiente y centralizado', '#7CC29C', True)}
{bullet('Los datos se cargan solos desde cámaras, balanzas y PLC', '#7CC29C', True)}
{bullet('Un solo sistema con todo el circuito de cada camión', '#7CC29C', True)}
{bullet('Asistentes de IA conectados por MCP que responden consultas y avisan desvíos', '#7CC29C', True)}
</div>
</div>
{foot(9)}
</section>""")

