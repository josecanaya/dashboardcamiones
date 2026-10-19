# 2 · Resultados de los comités en números
MESES = [('Jun', 3, 3, 0), ('Jul', 5, 3, 2), ('Ago', 6, 0, 6), ('Sep', 8, 0, 8), ('Oct', 2, 0, 2)]  # (mes, total, conjuntos, separados)

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

slides.append(f'''<section style="background:#143D2E;color:#F5F4EE;{FONT};padding:112px 128px 160px;display:flex;flex-direction:column;gap:40px">
{marks(True)}{head('Resultados de los comités', '24 informes en 18 semanas, cada uno con datos de toda la planta', 56, True)}
<div style="display:flex;gap:64px;align-items:stretch">
<div style="flex:1;display:flex;flex-direction:column;gap:16px">
<div style="display:flex;gap:16px;align-items:flex-end;height:390px;border-bottom:2px solid #3E6B58;padding-bottom:4px">{barras()}</div>
<div style="display:flex;gap:28px">
<p style="font-size:24px;color:#BCD3C7"><b style="color:#3FA06E">■</b> logística y seguridad juntas</p>
<p style="font-size:24px;color:#BCD3C7"><b style="color:#A48AD8">■</b> por separado, desde el 31/07</p>
</div>
</div>
<div style="width:520px;display:flex;flex-direction:column;gap:36px;justify-content:center">
{stat('2,2 M', 'toneladas analizadas en 71.828 movimientos')}
{stat('49', 'circuitos de camión analizados')}
</div>
</div>
<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
<p style="font-size:24px;font-weight:700;letter-spacing:2px;color:#C9B6EE;padding-right:8px">PARTICIPARON</p>{chips}
</div>
{foot(2, True)}
</section>''')

