
# =================================================================
# Circuit OVERVIEW slide (step cards + stacked bar + total card)
# =================================================================
def overview_slide(code, titulo, steps, total_label_color):
    s=slide(); logo(s); title_bar(s,titulo)
    vals=[]
    for lab,sub,trans,color in steps:
        m,sd,n=step_val(code,trans); vals.append((lab,m,color,sub,n))
    ncards=len(vals); gap=Inches(0.15); margin=Inches(0.6)
    cw=(SW-2*margin-(ncards-1)*gap)/ncards
    y=Inches(1.45); ch=Inches(1.9)
    for i,(lab,m,color,sub,n) in enumerate(vals):
        x=margin+i*(cw+gap)
        rrect(s,x,y,cw,ch,WHITE,CARDBORDER,1.2,0.08)
        cc=s.shapes.add_shape(MSO_SHAPE.OVAL,x+Inches(0.12),y+Inches(0.12),Inches(0.32),Inches(0.32))
        cc.fill.solid(); cc.fill.fore_color.rgb=NAVY; cc.line.fill.background(); cc.shadow.inherit=False
        textbox(s,x+Inches(0.12),y+Inches(0.13),Inches(0.32),Inches(0.3),str(i+1),12,WHITE,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
        textbox(s,x+Inches(0.5),y+Inches(0.14),cw-Inches(0.55),Inches(0.35),lab,11,NAVY,True)
        textbox(s,x+Inches(0.14),y+Inches(0.55),cw-Inches(0.28),Inches(0.5),sub,7.5,GREY,False,PP_ALIGN.LEFT)
        textbox(s,x+Inches(0.14),y+Inches(1.05),cw-Inches(0.28),Inches(0.6),f"{m:.0f}",26,NAVY,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
        textbox(s,x+Inches(0.14),y+Inches(1.62),cw-Inches(0.28),Inches(0.25),f"min - n={n}",8,GREY,False,PP_ALIGN.CENTER)
    bar_steps=[(lab,m,color) for lab,m,color,_,_ in vals]
    p=chart_stacked_segments(bar_steps,f"stack_{code}.png"); s.shapes.add_picture(p,Inches(0.6),Inches(3.7),width=Inches(12.1))
    lx=Inches(0.7); ly=Inches(5.25)
    total_min=sum(m for _,m,_ in bar_steps) or 1
    for lab,m,color in bar_steps:
        dot=s.shapes.add_shape(MSO_SHAPE.OVAL,lx,ly+Inches(0.02),Inches(0.14),Inches(0.14))
        dot.fill.solid(); dot.fill.fore_color.rgb=RGBColor.from_string(color[1:]); dot.line.fill.background(); dot.shadow.inherit=False
        textbox(s,lx+Inches(0.2),ly-Inches(0.03),Inches(2.0),Inches(0.3),f"{lab} ({m/total_min*100:.1f}%)",9,GREY)
        lx+=Inches(2.05)
        if lx>Inches(11): lx=Inches(0.7); ly+=Inches(0.35)
    tm,tsd,tn=circ_total(code)
    rrect(s,Inches(0.7),Inches(6.05),Inches(5.2),Inches(1.05),CARDBG,CARDBORDER,1.2,0.08)
    textbox(s,Inches(0.95),Inches(6.2),Inches(2.6),Inches(0.75),"TIEMPO MEDIO TOTAL\nDEL CIRCUITO",11,GREY,True,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(3.6),Inches(6.15),Inches(1.5),Inches(0.75),f"{tm:.0f}",30,total_label_color,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(5.0),Inches(6.35),Inches(0.8),Inches(0.4),"min",12,GREY,False,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(3.6),Inches(6.75),Inches(2.0),Inches(0.3),f"({tm/60:.2f} horas)",10,GREY,False,PP_ALIGN.CENTER)
    rrect(s,Inches(6.3),Inches(6.05),Inches(6.4),Inches(1.05),CARDBG,CARDBORDER,1.2,0.08)
    textbox(s,Inches(6.55),Inches(6.2),Inches(6.0),Inches(0.35),f"Muestra COMPLETOS del circuito: {R(tn)} viajes - desvio total {tsd:.0f} min",11,NAVY,True,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(6.55),Inches(6.62),Inches(6.0),Inches(0.35),"Tiempos por tramo calculados desde Truckflow (camaras), igual que el software.",9,GREY,False,PP_ALIGN.LEFT)
    return s

overview_slide("R7","Circuito R7  |  Producto: Soja",R7_STEPS,GREEN)

# =================================================================
# Tramo detail slide
# =================================================================
def tramo_slide(code,circ_titulo,tramo_label,trans,color):
    s=slide(); logo(s); title_bar(s,f"{circ_titulo}  |  Tramo: {tramo_label}")
    m,sd,n=step_val(code,trans)
    durs=legs_by_circ_trans.get((code,trans[0],trans[1]),[])
    all_m=np.mean([fnum(r["mean_min"]) for r in seg_kpi if (r["from_logical"],r["to_logical"])==trans]) if seg_kpi else m
    cards=[("Tiempo medio",f"{m:.0f}","min",NAVY),
           ("Desviacion estandar",f"{sd:.0f}","min",BLUE),
           ("Mediana",f"{(np.median(durs) if durs else m):.0f}","min",NAVY),
           ("P90",f"{(np.percentile(durs,90) if durs else 0):.0f}","min",RED),
           ("Camiones (n)",f"{n}","viajes",GREEN)]
    cw=Inches(2.28); x0=Inches(0.7); y=Inches(1.5)
    for i,(t,v,u,col) in enumerate(cards):
        x=x0+i*(cw+Inches(0.1))
        rrect(s,x,y,cw,Inches(1.15),CARDBG,CARDBORDER,1.2,0.09)
        textbox(s,x,y+Inches(0.12),cw,Inches(0.3),t,10,GREY,True,PP_ALIGN.CENTER)
        textbox(s,x,y+Inches(0.42),cw,Inches(0.55),v,26,col,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
        textbox(s,x,y+Inches(0.92),cw,Inches(0.2),u,9,GREY,False,PP_ALIGN.CENTER)
    p=chart_scatter(durs,m,f"scatter_{code}_{trans[0]}_{trans[1]}.png",color=color)
    s.shapes.add_picture(p,Inches(0.7),Inches(3.0),width=Inches(7.6))
    rrect(s,Inches(8.5),Inches(3.0),Inches(4.2),Inches(3.6),CARDBG,CARDBORDER,1.2,0.06)
    textbox(s,Inches(8.7),Inches(3.2),Inches(3.8),Inches(0.4),f"Lectura del tramo {tramo_label}",12,NAVY,True)
    dist=m-all_m
    add_multiline(textbox(s,Inches(8.7),Inches(3.7),Inches(3.8),Inches(2.7),"",10,GREY),[
        (f"Tiempo medio semanal: {m:.0f} min",11,NAVY,True),
        (f"Desvio estandar: {sd:.0f} min",10,GREY,False),
        (f"Distancia al promedio general: {dist:+.0f} min",10,(RED if dist>0 else GREEN),True),
        (f"Muestra: {n} camiones COMPLETOS",10,GREY,False),
        ("",8,GREY,False),
        ("Fuente: tiempos entre camaras Truckflow (mismo calculo KPI del software del repo).",9,LGREY,False),
    ])
    return s

tramo_slide("R7","Circuito R7","Calada",("PREINGRESO","CALADA"),SEG_COLORS[1])
tramo_slide("R7","Circuito R7","Espera Balanza (San Lorenzo)",("SL_INGRESO","SL_BALANZA_INGRESO"),SEG_COLORS[4])
tramo_slide("R7","Circuito R7","Descarga (Balanza San Lorenzo)",("SL_BALANZA_INGRESO","SL_EGRESO"),SEG_COLORS[5])

# =================================================================
# R5/R6 Girasol
# =================================================================
GIR_STEPS=[
 ("Ingreso","Ingreso a Preingreso",("INGRESO","PREINGRESO"),SEG_COLORS[0]),
 ("Calada","Preingreso a Calada",("PREINGRESO","CALADA"),SEG_COLORS[1]),
 ("Espera Balanza","Calada a Balanza",("CALADA","BALANZA_INGRESO"),SEG_COLORS[4]),
]
overview_slide("R5","Circuito R5  |  Producto: Girasol (Volcable 1)",GIR_STEPS,ORANGE)
overview_slide("R6","Circuito R6  |  Producto: Girasol (Volcable 2)",GIR_STEPS,ORANGE)

# =================================================================
# ACEITE / LIQUIDOS
# =================================================================
s=slide(); logo(s); title_bar(s,"Circuito Aceite / Liquidos  |  R8 + San Lorenzo")
tm,tsd,tn=circ_total("R8")
COH=LIQ.get("by_cohort",{})
cards=[("Operaciones aceite (Excel)",R(int(LIQ.get("aceite_platform_excel_ops",0))),"movimientos",ORANGE),
       ("Recepcion liquida R8",R(tn),"viajes Truckflow",BLUE),
       ("SL - liquido San Lorenzo",R(int(COH.get("sl_liquido_san_lorenzo",0))),"cohorte",GREEN),
       ("Transile externo Ric a SL",R(int(COH.get("transile_externo_ric_sl",0))),"cohorte",NAVY)]
for i,(t,v,u,col) in enumerate(cards):
    x=Inches(0.7)+(i%2)*Inches(6.2); y=Inches(1.5)+(i//2)*Inches(1.35)
    rrect(s,x,y,Inches(5.9),Inches(1.15),CARDBG,CARDBORDER,1.2,0.08)
    textbox(s,x+Inches(0.2),y+Inches(0.13),Inches(3.6),Inches(0.85),t,12,GREY,True,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    textbox(s,x+Inches(3.9),y+Inches(0.1),Inches(1.4),Inches(0.7),v,24,col,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
    textbox(s,x+Inches(3.9),y+Inches(0.78),Inches(1.9),Inches(0.3),u,9,GREY,False,PP_ALIGN.CENTER)
r8bars=[(lab,step_val("R8",tr)[0],c) for lab,tr,c in [
    ("Ingreso",("INGRESO","PREINGRESO"),SEG_COLORS[0]),
    ("Calada",("PREINGRESO","CALADA"),SEG_COLORS[1]),
    ("Calada-Liquido",("CALADA","LIQUIDO"),SEG_COLORS[3]),
    ("Liquido-Balanza",("LIQUIDO","BALANZA_INGRESO"),SEG_COLORS[5])] if step_val("R8",tr)[0]>0]
if r8bars:
    p=chart_stacked_segments(r8bars,"stack_R8.png"); s.shapes.add_picture(p,Inches(0.7),Inches(4.35),width=Inches(11.0))
    # leyenda tramos R8
    lx=Inches(0.9)
    for lab,mn,c in r8bars:
        dot=s.shapes.add_shape(MSO_SHAPE.OVAL,lx,Inches(5.62),Inches(0.14),Inches(0.14))
        dot.fill.solid(); dot.fill.fore_color.rgb=RGBColor.from_string(c[1:]); dot.line.fill.background(); dot.shadow.inherit=False
        textbox(s,lx+Inches(0.2),Inches(5.58),Inches(2.5),Inches(0.3),f"{lab} ({mn:.0f} min)",9,GREY)
        lx+=Inches(2.7)
textbox(s,Inches(0.7),Inches(6.15),Inches(12),Inches(1.1),
        f"Aceite y liquidos: {R(aceite_n)} movimientos en Excel ({R(aceite_kg/1e6,1)} kt). "
        f"Plataformas de aceite (ACEITE / ACEITE_OSL / ACEITE_PTO) sin punto de camara S10 instrumentado: "
        f"{int(LIQ.get('aceite_platform_s10_captured',0))} capturados por Truckflow, de {int(LIQ.get('aceite_platform_excel_ops',0))} operaciones -> "
        f"trazabilidad de aceite pendiente de cierre de camaras S10.",
        11,NAVY,False,PP_ALIGN.LEFT)

print("circuit slides ok")
