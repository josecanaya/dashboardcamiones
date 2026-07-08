
# =================================================================
# XLSX BASE (tabla base usada en la presentacion)
# =================================================================
wb=openpyxl.Workbook()
# hoja 1: muestra ejecutiva
ws=wb.active; ws.title="Muestra"
ws.append(["Metrica","Valor"])
for k,v in [
 ("Periodo", f"{PERIOD_A} a {PERIOD_B}"),
 ("Eventos Truckflow", EX["eventCount"]),
 ("Alertas", EX["alertCount"]),
 ("Circuitos reconstruidos", CO["final_circuits_count"]),
 ("Clasificados", CO["final_classified_count"]),
 ("Incompletos/revision", CO["final_incomplete_count"]),
 ("Validos", EX["validos"]),
 ("Completos", EX["completos"]),
 ("Incompletos", EX["incompletos"]),
 ("Anomalos", EX["anomalos"]),
 ("Deducidos", EX["deducidos"]),
 ("Alertas LPR", EX["lprAlerts"]),
 ("Alertas operativas", EX["operationalAlerts"]),
 ("Alertas operativas cruzadas", EX["operationalAlertsCrossed"]),
 ("Coherencia", CO.get("coherenceLabel","")),
]:
    ws.append([k,v])
# hoja 2: circuitos (totales)
ws2=wb.create_sheet("Circuitos")
ws2.append(["Codigo","Nombre","Estado","n_viajes","media_min","desvio_min","mediana_min","p90_min"])
for code,r in circ_sum.items():
    ws2.append([code,r["circuit_name"],r["executive_status"],int(fnum(r["n_journeys"])),
                round(fnum(r["mean_total_min"]),1),round(fnum(r["std_total_min"]),1),
                round(fnum(r["median_total_min"]),1),round(fnum(r["p90_total_min"]),1)])
# hoja 3: tramos
ws3=wb.create_sheet("Tramos")
ws3.append(["Circuito","Desde","Hasta","Tramo","n","media_min","desvio_min","mediana_min","p90_min"])
for r in seg_kpi:
    ws3.append([r["executive_circuit_code"],r["from_logical"],r["to_logical"],r["transition_label"],
                int(fnum(r["n"])),round(fnum(r["mean_min"]),1),round(fnum(r["std_min"]),1),
                round(fnum(r["median_min"]),1),round(fnum(r["p90_min"]),1)])
# hoja 4: movimientos por producto (Excel)
ws4=wb.create_sheet("Movimientos_Producto")
ws4.append(["Producto","Movimientos","Kg_neto","Toneladas","Categoria"])
for p in sorted(prod_n,key=lambda x:-prod_n[x]):
    ws4.append([p,prod_n[p],round(prod_kg[p],0),round(prod_kg[p]/1000,1),"LIQUIDO/ACEITE" if is_liquid(p) else "SOLIDO"])
# hoja 5: aceite/liquidos cohortes
ws5=wb.create_sheet("Aceite_Liquidos")
ws5.append(["Metrica","Valor"])
ws5.append(["Movimientos aceite/liquidos (Excel)",aceite_n])
ws5.append(["Toneladas aceite/liquidos",round(aceite_kg/1000,1)])
for k,v in LIQ.items():
    if isinstance(v,dict):
        for k2,v2 in v.items(): ws5.append([f"cohorte_{k2}",v2])
    else:
        ws5.append([k,v])
xlsx_path=os.path.join(OUT,STEM+"_base.xlsx")
wb.save(xlsx_path)
print("XLSX guardado:",xlsx_path)

# =================================================================
# MD RESUMEN EJECUTIVO
# =================================================================
def pesos(n): return R(n)
r7=circ_total("R7"); r5=circ_total("R5"); r6=circ_total("R6"); r8=circ_total("R8")
calada=step_val("R7",("PREINGRESO","CALADA")); esp=step_val("R7",("SL_INGRESO","SL_BALANZA_INGRESO"))
desc=step_val("R7",("SL_BALANZA_INGRESO","SL_EGRESO"))
md=f"""# Comite de seguridad y eficiencia - Nueva Vicentin Argentina
## Resumen ejecutivo | Periodo {PERIOD_A} a {PERIOD_B}

> Datos calculados con el mismo pipeline ETL del software del repo (etl_transform_v12) sobre
> `data/truckflow/` (eventos/alertas de camara) + `data/Movimientos/` (Movimientos por Contrato, Excel).
> Los tiempos por tramo salen de Truckflow; los volumenes por producto salen del Excel.

## 1. Tamano de la muestra
- **Eventos Truckflow:** {pesos(EX['eventCount'])}  ·  **Alertas:** {pesos(EX['alertCount'])}
- **Circuitos reconstruidos:** {pesos(CO['final_circuits_count'])}  ·  **Clasificados:** {pesos(CO['final_classified_count'])} ({CO['final_classified_count']/CO['final_circuits_count']*100:.0f}%)  ·  **Incompletos/revision:** {pesos(CO['final_incomplete_count'])}
- **Validos:** {pesos(EX['validos'])} (completos {pesos(EX['completos'])}, deducidos {pesos(EX['deducidos'])})  ·  **Anomalos:** {pesos(EX['anomalos'])}
- **Coherencia global:** {CO.get('coherenceLabel','-')}

## 2. Volumen de movimientos (Excel Movimientos por Contrato)
- **Total movimientos:** {pesos(tot_mov)} en {round(tot_kg/1e6,1)} kilotoneladas.
- **Solidos:** {pesos(solidos_n)} movimientos  ·  **Liquidos/aceite:** {pesos(liquidos_n)} movimientos.
- **Por planta:** Terminal de Embarque {pesos(planta_n.get('TERMINAL DE EMBARQUE',0))}, San Lorenzo {pesos(planta_n.get('PLANTA SAN LORENZO',0))}, Avellaneda {pesos(planta_n.get('PLANTA AVELLANEDA',0))}.
- **Cobertura Excel:** los Movimientos por Contrato cubren fecha de ingreso 25/06 a 05/07; no hay movimientos de 22 a 24/06 en el Excel (los tiempos de tramo de esos dias salen de Truckflow).

## 3. Circuitos (tiempos totales, Truckflow COMPLETOS)
| Circuito | Descripcion | Viajes | Media (min) | Desvio (min) | Mediana (min) |
|---|---|---|---|---|---|
| R7 | Ricardone -> San Lorenzo (Soja) | {r7[2]} | {r7[0]:.0f} | {r7[1]:.0f} | {fnum(circ_sum['R7']['median_total_min']):.0f} |
| R5 | Volcable 1 (Girasol) | {r5[2]} | {r5[0]:.0f} | {r5[1]:.0f} | {fnum(circ_sum['R5']['median_total_min']):.0f} |
| R6 | Volcable 2 (Girasol) | {r6[2]} | {r6[0]:.0f} | {r6[1]:.0f} | {fnum(circ_sum['R6']['median_total_min']):.0f} |
| R8 | Recepcion mercaderia liquida | {r8[2]} | {r8[0]:.0f} | {r8[1]:.0f} | {fnum(circ_sum['R8']['median_total_min']):.0f} |

## 4. R7 / Soja - tramos principales
- **Calada (preingreso -> calada):** {calada[0]:.0f} min (n={calada[2]}) - principal punto de tension.
- **Espera Balanza (San Lorenzo):** {esp[0]:.0f} min (n={esp[2]}).
- **Descarga (balanza in -> egreso SL):** {desc[0]:.0f} min (n={desc[2]}).

## 5. Aceite / liquidos
- **{aceite_n} movimientos** de aceite/liquidos en Excel ({round(aceite_kg/1e6,1)} kt).
- Operaciones de plataforma aceite (Excel): {int(LIQ.get('aceite_platform_excel_ops',0))}; capturadas por camara S10 de Truckflow: {int(LIQ.get('aceite_platform_s10_captured',0))}.
- Cohortes liquido: SL San Lorenzo {int(LIQ.get('cohort_sl_liquido_san_lorenzo',0))}, transile externo Ric->SL {int(LIQ.get('cohort_transile_externo_ric_sl',0))}, recepcion liquida Ric {int(LIQ.get('cohort_liquido_recepcion_ric',0))}.
- **Hallazgo:** las plataformas de aceite no tienen punto de camara S10 instrumentado -> trazabilidad de aceite pendiente de cierre de camaras.

## 6. Calidad de evidencia
- Alertas LPR (fallas de lectura de patente): {pesos(EX['lprAlerts'])}.
- Alertas operativas: {pesos(EX['operationalAlerts'])} (cruzadas contra journeys: {pesos(EX['operationalAlertsCrossed'])}).

## 7. Proximos pasos
1. Cerrar puntos de camara pendientes (S10 aceite / lineas liquidas).
2. Reducir la Espera de Balanza en San Lorenzo (principal componente evitable de R7).
3. Ampliar la muestra de Girasol (R5/R6) y revisar la dispersion de R6.
4. Continuar la calibracion y mejora de lectura de patentes (LPR).
5. Consolidar el cruce Excel <-> Truckflow por contrato y producto.

---
*Advertencias de cobertura:* periodo corregido a 22/06-05/07 (el 21/06 ya estaba en el comite anterior).
Las presentaciones de referencia (`data/ejemplos/`) son PDF, no PPTX; este PPTX reconstruye el estilo, no clona el master original.
"""
md_path=os.path.join(OUT,STEM+"_resumen.md")
open(md_path,"w",encoding="utf-8").write(md)
print("MD guardado:",md_path)
print("LISTO. Entregables en",OUT)
