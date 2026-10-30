# Prompt · Comité de Logística 23–28/10/2026 (para otra sesión de Claude Code)

Copiá todo lo que sigue como primer mensaje en una sesión nueva de Claude Code abierta en `C:\Users\Usuario\Desktop\Dashboard_camiones` (rama `automatizacion`).

---

Armá el comité semanal de Logística Nodo Sur (Ricardone + Puerto San Lorenzo, Vicentin) del **23/10 al 28/10/2026** como deck del tipo Slides de Claude Artifacts, en español. **Dos focos únicos** (no va la sección «Últimos comités» del mes):

1. **Transiles de la semana**: pellet al puerto, soja de silos al puerto (R29) y transile interno de silos (silos 7/8 → volcable 2). Viajes, camiones, ciclo, ritmo por día y cuarto (Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22), contra la semana anterior.
2. **Indicador nuevo: permanencia por planta, producto y operación, ponderada por viajes.**

## Contexto y reglas del repo (leé antes de empezar)
- `CLAUDE.md` del repo y la memoria del proyecto (MEMORY.md). Claves: día operativo desde las 22 h; hora operativa de cámaras = occurredAt + 206 min; ventanas ETL solo semanales lunes→domingo (`runs/windows/2026-10-19_2026-10-25` y `2026-10-26_2026-11-01`); nunca contar con `merged_truckflow_movimientos`.
- Guía del deck: `agentes/conocimiento/COMITE_LOGISTICA_COMO_SE_ARMA.md`. Pipeline: `scripts/estado-planta/comite_semana.py --desde 2026-10-23 --hasta 2026-10-28 --carpeta <copia de trabajo> --anterior reportes/logistica/2026-10-12_2026-10-22/comite-logistica` (genera calculo/ + deck con `gen_comite_logistica_semana.py`). En Windows los archivos del repo suelen quedar bloqueados (Errno 22): generá en una copia en el scratchpad y después copiá al repo `reportes/logistica/2026-10-23_2026-10-28/comite-logistica`.
- Transiles ya tienen scripts: `silos-internos.py` (transile interno), `pellet-camaras.cjs`, `toneladas-periodos.cjs` (grupos pellet/r29), y el informe de transile de pellet (`pellet-calesita*`). La sección «Últimos comités» del generador (bloque `if SC:` → SEP_IDS) **no va**: sacala del ORDER de este deck.
- Planilla: `data/movimientos/<día>/movimientos.json` (SGC desde 15/10; `SOURCE.json` dice la fuente). Si un día del SGC viene incompleto y hay Excel `MovimientosPorContrato_YYYYMMDD.xlsx` en Descargas, se reemplaza como se hizo con 15, 16 y 18/10 (copia `.sgc-incompleto.json`, `SOURCE.json` con `excelOverride: true`, `npx tsx scripts/ingest-movimientos.ts --excel …`). En el Excel «PLANTA SAN LORENZO» = Ricardone.
- Cámaras: `data/truckflow/<día>/event-list.json`; si falta un día, `POST http://127.0.0.1:8787/api/truckflow/export-period {"startDate","endDate"}` (server: `node server/truckflow-local-server.mjs`). La API se migró el 23/10 a 100.54.73.142:8090; el servidor viejo tiene un hueco 14:30–16:10 del 23/10: informalo si afecta.
- **Semana de comparación 16–22/10 con huecos**: el 17/10 no tiene planilla y el 19 y 20/10 tienen 146 y 138 filas del SGC (contra ~340 de un día normal: casi seguro incompletos). Buscá `MovimientosPorContrato_20261017/19/20.xlsx` en Descargas y reemplazalos como arriba; si no están, pedíselos al usuario antes de calcular la variación y la mezcla constante, o informá la limitación en la lámina (no compares contra días cortos como si fueran completos). Del 23 al 28/10 la planilla está completa (SGC, 110–339 filas por día; el 25 es domingo).
- Exportá cámaras y re-corré ETL (`POST /api/etl/runs {"from","to","force":true,"skipSupabase":true}`) de las semanas 19–25 y 26/10–1/11 antes de calcular.
- La calada de Ricardone trabaja por tandas (junta camiones en Playa 1 y los cala juntos): espera alta con poco volumen no es falta de capacidad.

## Criterios del indicador de permanencia (obligatorios)
Referencia conceptual: R. Ghilardi, «Aumento de la capacidad máxima de descarga de camiones en empresa agroexportadora», UNR, 2021 (p. 29: tiempos promedio del circuito de recepción por producto y mes). Usá ese enfoque de desagregación; **no** le atribuyas una fórmula de ponderación que no documenta.
1. **Qué se mide**: permanencia por viaje = egreso − ingreso de planta (SGC/planilla: `external_ingreso_at` → `external_salida_at`). Indicá los eventos. Separá la espera previa al ingreso cuando exista (cámaras: pre-ingreso). No confundas permanencia con tiempo efectivo de carga/descarga.
2. **Desagregá** por planta × producto × operación: viajes finalizados, promedio y variación contra 16–22/10 (o la semana anterior equivalente). Separá recepción, despacho y transiles; circuitos con operaciones distintas, por separado antes de consolidar.
3. **Promedio general ponderado por viajes**: Σ(promedio del grupo × viajes del grupo) ÷ total de viajes. Grupos excluyentes, cada viaje una sola vez; verificá que coincida con el promedio directo de los tiempos individuales. Nada de promedio de promedios. Sin ponderar por toneladas (si se agrega, como indicador aparte y rotulado).
4. **Desempeño vs mezcla**: si sube el promedio general, verificá si empeoraron los tiempos dentro de cada grupo o si creció la participación de grupos lentos. No concluir pérdida de eficiencia solo por el promedio general.
5. **Mezcla constante**: pesos = participación por viajes de la semana anterior, aplicados a los promedios de ambas semanas; indicá la referencia. Si falta un grupo en una semana, no ponerlo en cero: informar la limitación.
6. **Dónde están las demoras** (si hay registros): ingreso/preingreso, espera de calada (Playa 1), calada, espera de balanza, carga/descarga, egreso, en la secuencia de cada circuito; sin sumar intervalos superpuestos. Hechos medidos ≠ hipótesis de causa. Tramos de cámaras salen de las corridas (`paquete-periodo.ts` / tablas de circuit_timing), rotulados como recorridos de cámara.
7. **Calidad**: permanencias completas = ingreso y egreso válidos, semana por fecha de egreso. Mostrá aparte los camiones aún en planta con permanencia acumulada. Informá excluidos, duplicados (`external_operation_id`), patentes ficticias (XXXXXX/PPPPPP/TTTTTT), productos sin identificar y cobertura de la fuente por día. Una lectura de cámara no es un viaje; no mezcles tiempos de sistema con recorridos parciales de cámara.

**Tabla principal**: Planta | Producto | Operación/circuito | Viajes finalizados | Participación | Tiempo promedio | Promedio semana anterior | Variación.
**Cierre breve**: ¿qué productos/operaciones concentran volumen y demoras? ¿el cambio semanal es por tiempos de atención, por mezcla o ambos? ¿en qué etapa intervenir y con qué evidencia?
No inventes tiempos objetivo, capacidades, causas ni datos faltantes; las capacidades de la tesis no son límites ni metas.

## Deck (Claude Artifacts, tipo Slides)
- **Entregable = el artifact de Slides** (no un PPTX). Período: **del 23/10 al 28/10/2026**, inclusive (6 días operativos).
- **Modelo de formato**: `C:\Users\Usuario\Downloads\Comite logistica 23.pptx` (32 láminas, el comité 12–22/10 exportado). Leelo con la skill pptx antes de diseñar y copiá su lenguaje visual: portada con las dos plantas, divisores numerados («01 · Soja»…) con el pie «Comité de Logística Nodo Sur · <fechas> · <n.º>», volanta en mayúsculas (`SOJA · R7`, `SECTORES · SILOS RICARDONE`), título que ya es la conclusión con la cifra, tarjetas de cifra grande y cierre «La semana en N lecturas». Contenido a reaprovechar como base de Transiles: láminas 7 (pellet: ciclo y tandas) y 29–31 (silos: viajes por día y destino, los camiones del transile interno, ritmo por cuarto). Las láminas 2–11 («Últimos comités») **no van**; soja/girasol/líquidos/sectores solo si sirven de contexto a los dos focos.
- Deck anterior publicado (mismo contenido que el PPTX): https://claude.ai/artifact/SevH7aavu2Tiph7RLcXHCg. Creá un deck **nuevo** para 23–28/10 desde el tipo Slides. Logos y aéreas: los blob ids están en `reportes/logistica/2026-10-12_2026-10-22/comite-logistica/deck/assets.json` (si el deck nuevo no los tiene, subí las imágenes como assets).
- Estilo (memoria `comite-logistica-deck-preferencias`, `informe-diseno-reglas-comite`, `presentacion-estado-planta-estilo`): verde NVA + violeta, logos en todas, enteros, sin «≈», nunca fallas de cámara, conclusiones sin obviedades, gráficos SVG (el visor descarta `div` con ancho en %), líneas horizontales en el tiempo (no verticales), barras horizontales apiladas para sectores.
- Estructura sugerida: portada · resumen de la semana · **Transiles** (2–3 láminas) · **Permanencia** (tabla principal, mezcla constante, etapas de demora, calidad de datos) · cierre con las tres preguntas.
- Renderizá cada lámina para revisarla antes de publicar. Antes de publicar en un artifact existente, leé `project/deck.json` (puede haber ediciones guardadas desde la página).
- No hagas commit hasta que el usuario lo pida; nunca commitees los archivos de Seguridad de otra sesión.

## Compartir
El acceso de josecanaya1889@gmail.com se da desde el menú **Share** de la página del artifact (Claude no puede cambiar permisos).
