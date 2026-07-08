
# =================================================================
# CALIDAD DE EVIDENCIA
# =================================================================
s=slide(); logo(s); title_bar(s,"Calidad de la evidencia y cobertura")
tot_circ=CO["final_circuits_count"]; clas=CO["final_classified_count"]; inc=CO["final_incomplete_count"]
ev_cards=[
 ("Eventos Truckflow",R(EX["eventCount"]),"lecturas de camara",BLUE),
 ("Alertas",R(EX["alertCount"]),"del periodo",NAVY),
 ("Circuitos reconstruidos",R(tot_circ),"journeys",GREEN),
 ("Clasificados",R(clas),f"{clas/tot_circ*100:.0f}% de la muestra",GREEN),
 ("Incompletos / revision",R(inc),f"{inc/tot_circ*100:.0f}% de la muestra",ORANGE),
 ("Alertas LPR (lectura patente)",R(EX["lprAlerts"]),"fallas de lectura",RED),
]
for i,(t,v,u,col) in enumerate(ev_cards):
    x=Inches(0.7)+(i%3)*Inches(4.05); y=Inches(1.55)+(i//3)*Inches(1.6)
    rrect(s,x,y,Inches(3.8),Inches(1.35),CARDBG,CARDBORDER,1.2,0.08)
    textbox(s,x,y+Inches(0.15),Inches(3.8),Inches(0.35),t,11,GREY,True,PP_ALIGN.CENTER)
    textbox(s,x,y+Inches(0.5),Inches(3.8),Inches(0.55),v,26,col,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
    textbox(s,x,y+Inches(1.02),Inches(3.8),Inches(0.25),u,9,GREY,False,PP_ALIGN.CENTER)
textbox(s,Inches(0.7),Inches(5.0),Inches(12),Inches(1.9),"",11,GREY)
add_multiline(s.shapes[-1],[
 (f"Coherencia global del periodo: {CO.get('coherenceLabel','-')}.",12,NAVY,True),
 (f"Circuitos con ingreso operativo: {R(CO['circuitos_con_ingreso_operativo'])}  -  con egreso operativo: {R(CO['circuitos_con_egreso_operativo'])}.",10,GREY,False),
 (f"Alertas operativas cruzadas contra journeys: {R(EX['operationalAlertsCrossed'])} de {R(EX['operationalAlerts'])}.",10,GREY,False),
 ("La clasificacion, el filtrado de camaras traseras y la reconstruccion de journeys se ejecutan con el mismo pipeline ETL del software del repo (etl_transform_v12).",10,LGREY,False),
])

# =================================================================
# ANOMALIAS (ejemplos reales)
# =================================================================
anom=read_csv("final_circuits.csv")
def _isanom(r):
    lab=(r.get("executive_bucket_label","")+"|"+r.get("executive_status",""))
    return ("nómalo" in lab.lower()) or ("nomalo" in lab.lower()) or ("ANOMAL" in lab.upper())
anom_rows=[r for r in anom if _isanom(r) and (r.get("executive_anomaly_reason","") or r.get("executive_reason",""))]
seen=set(); ejemplos=[]
for r in anom_rows:
    pl=r.get("truck_plate","") or r.get("normalized_plate","")
    if not pl or pl in seen: continue
    seen.add(pl)
    ejemplos.append(r)
    if len(ejemplos)>=6: break
if len(ejemplos)<6:
    for r in anom_rows:
        pl=r.get("truck_plate","") or r.get("normalized_plate","") or "(sin patente)"
        if r in ejemplos: continue
        ejemplos.append(r)
        if len(ejemplos)>=6: break

s=slide(); logo(s); title_bar(s,"Anomalias y desvios")
textbox(s,Inches(0.7),Inches(1.22),Inches(12),Inches(0.4),
        f"Del periodo: {R(EX['anomalos'])} journeys anomalos y {R(EX['incompletos'])} incompletos (sobre {R(CO['final_circuits_count'])} reconstruidos).",11,GREY,False)
# --- izquierda: motivos de anomalia (conteo) ---
from collections import Counter as _C
reason_ct=_C()
for r in anom:
    if _isanom(r):
        rs=r.get("executive_anomaly_reason","") or r.get("executive_reason","") or "SIN_MOTIVO"
        reason_ct[rs]+=1
textbox(s,Inches(0.7),Inches(1.75),Inches(5.6),Inches(0.35),"MOTIVOS DE ANOMALIA (conteo)",12,NAVY,True)
y=Inches(2.2)
for rs,ct in reason_ct.most_common(6):
    rrect(s,Inches(0.7),y,Inches(5.5),Inches(0.62),CARDBG,CARDBORDER,1,0.08)
    textbox(s,Inches(0.9),y+Inches(0.05),Inches(3.9),Inches(0.52),str(rs).replace("_"," ").title()[:34],11,NAVY,True,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(4.9),y+Inches(0.05),Inches(1.1),Inches(0.52),R(ct),16,RED,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
    y+=Inches(0.72)
# --- derecha: ejemplos con secuencia ---
textbox(s,Inches(6.6),Inches(1.75),Inches(6.0),Inches(0.35),"EJEMPLOS DE RECORRIDO ANOMALO",12,NAVY,True)
y=Inches(2.2)
ejs=[r for r in anom if _isanom(r) and (r.get("truck_plate") or r.get("normalized_plate"))][:5]
if not ejs: ejs=[r for r in anom if _isanom(r)][:5]
for r in ejs:
    rrect(s,Inches(6.6),y,Inches(6.0),Inches(0.78),CARDBG,CARDBORDER,1,0.06)
    pl=r.get("truck_plate","") or r.get("normalized_plate","") or "(patente no leida)"
    reason=r.get("executive_anomaly_reason","") or r.get("executive_reason","")
    seq=(r.get("logical_sequence_front","") or "")[:60]
    textbox(s,Inches(6.8),y+Inches(0.05),Inches(2.0),Inches(0.36),pl,13,NAVY,True,PP_ALIGN.LEFT)
    textbox(s,Inches(8.9),y+Inches(0.07),Inches(3.5),Inches(0.32),str(reason).replace("_"," ").title()[:34],9,RED,False,PP_ALIGN.LEFT)
    textbox(s,Inches(6.8),y+Inches(0.42),Inches(5.6),Inches(0.32),seq,8,GREY,False,PP_ALIGN.LEFT)
    y+=Inches(0.88)

# =================================================================
# CONCLUSIONES
# =================================================================
s=slide(); logo(s); title_bar(s,"Conclusiones ejecutivas")
r7m=circ_total("R7")[0]; calada=step_val("R7",("PREINGRESO","CALADA"))[0]
esp=step_val("R7",("SL_INGRESO","SL_BALANZA_INGRESO"))[0]
concl=[
 (f"R7 / Soja es el circuito dominante: {R(circ_total('R7')[2])} viajes COMPLETOS, tiempo medio total {r7m:.0f} min ({r7m/60:.1f} h).",),
 (f"El principal punto de tension sigue en Calada ({calada:.0f} min promedio) y en la Espera de Balanza en San Lorenzo ({esp:.0f} min), que concentran la mayor parte del tiempo del circuito.",),
 (f"Girasol (R5/R6 Volcable) mantiene una muestra chica ({circ_total('R5')[2]+circ_total('R6')[2]} viajes); R6 muestra tiempos mas altos y mayor dispersion que R5.",),
 (f"Aceite / liquidos: {R(aceite_n)} movimientos en Excel, pero las plataformas de aceite no tienen punto de camara S10 instrumentado; la trazabilidad de aceite queda pendiente de cierre de camaras.",),
 (f"Calidad de evidencia: {CO['final_classified_count']} de {CO['final_circuits_count']} circuitos clasificados ({CO['final_classified_count']/CO['final_circuits_count']*100:.0f}%); {R(EX['lprAlerts'])} alertas LPR indican puntos de lectura de patente a mejorar.",),
]
y=Inches(1.6)
for (txt,) in concl:
    dot=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(0.8),y+Inches(0.12),Inches(0.16),Inches(0.16))
    dot.fill.solid(); dot.fill.fore_color.rgb=GREEN; dot.line.fill.background(); dot.shadow.inherit=False
    textbox(s,Inches(1.15),y,Inches(11.3),Inches(0.95),txt,13,NAVY,False,PP_ALIGN.LEFT)
    y+=Inches(1.02)

# =================================================================
# PROXIMOS PASOS
# =================================================================
s=slide(); logo(s); title_bar(s,"Proximos pasos")
pasos=[
 "Cerrar los puntos de camara pendientes (especialmente S10 de aceite / lineas liquidas) para completar la trazabilidad de aceite y refinados.",
 "Reducir la Espera de Balanza en San Lorenzo, principal componente evitable del tiempo total de R7.",
 "Ampliar la muestra de Girasol (R5/R6) y revisar la dispersion de R6.",
 "Continuar la calibracion del sistema y la mejora de la lectura de patentes (LPR) para bajar el % de journeys incompletos.",
 "Consolidar el cruce Excel (Movimientos por Contrato) con Truckflow para conciliar volumenes por contrato y producto.",
]
y=Inches(1.7)
for i,txt in enumerate(pasos,1):
    rrect(s,Inches(0.9),y,Inches(0.55),Inches(0.55),BLUE,radius=0.3)
    textbox(s,Inches(0.9),y,Inches(0.55),Inches(0.55),str(i),18,WHITE,True,PP_ALIGN.CENTER,MSO_ANCHOR.MIDDLE)
    textbox(s,Inches(1.7),y,Inches(10.8),Inches(0.85),txt,13,NAVY,False,PP_ALIGN.LEFT,MSO_ANCHOR.MIDDLE)
    y+=Inches(0.95)
textbox(s,Inches(0.9),Inches(6.9),Inches(11),Inches(0.4),f"Periodo analizado: {PERIOD_A} a {PERIOD_B}  -  Datos: Truckflow + Movimientos por Contrato (Excel).",9,LGREY,False)

# =================================================================
# GUARDAR PPTX
# =================================================================
pptx_path=os.path.join(OUT,STEM+".pptx")
prs.save(pptx_path)
print("PPTX guardado:",pptx_path,"slides=",len(prs.slides._sldIdLst))
