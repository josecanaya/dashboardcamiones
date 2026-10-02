# Líquidos — contexto del especialista

## Perímetro confirmado por el usuario

Nodo Sur: `RICARDONE` + `TERMINAL_EMBARQUE`. Excluir `RENOPACK` de movimientos, toneladas, patentes, permanencias, recorridos y candidatos de seguridad. Fuente: instrucción del usuario del 02/10/2026. Un vínculo físico en el grafo no amplía este universo. Separar granel de envasados y registros de trasvases con patente ficticia; declarar si la fecha usada es ingreso o archivo.

Fuente estructurada: `contexto.json`, entrada `products.liquidos`.

## Conocimiento recuperado

- Calada líquida incluye camiones de transile; no sumar como producto líquido — `scripts/estado-planta/gen_comite_logistica.py`, observada_en_codigo.
- Separación de líquidos en excel_extra existe; clasificación exacta debe reconstruirse — `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/excel_extra.json`, pendiente.

## Recetas del informe

- **Ingresos y egresos de líquidos** (`liquidos.actividad`): LIQX.camiones/ingresos/egresos/media/mediana; productor y criterio exacto pendientes. Fuente `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/excel_extra.json`, selector `liquidos`. Unidad: operaciones/vehículos por confirmar. Estado: pendiente.
- **Paso por calada líquida** (`liquidos.camaras`): RicCalLiq; rama trips excluye carga silo en 8h; sector incluye transile; cámara sola no identifica aceite. Fuente `scripts/estado-planta/metricas-camaras.cjs`, selector `is.liq y trips.liq`. Unidad: recorridos o patentes según agregación. Estado: observada_en_codigo.

## Seguridad y comunicación

producto líquido vs paso transile, faltante cobertura balanzas, equipo declarado vs observado. Entregar al comunicador el contrato de README; conservar ID de cada caso compartido.

## Ausencia de actividad

Verificar cobertura de operaciones del período y faltantes. Cero cámara no significa cero producto. Informar uno de los cuatro estados del README. Si faltan datos, publicar limitación, no cifra cero.

## Informe reconstruido y tiempos — 24–30/09/2026

Receta y evidencia: `salidas/liquidos-24-30/rehacer/tiempos-reconstruir.mjs`, `tiempos.json`, `tiempos-cohorte-comun.json`, `analisis.json` y `seguridad-offset.json`. No trasladar esas cifras a otro período.

- Universo por fecha de ingreso: líquidos a granel con patente utilizable; excluir envasados y patentes ficticias. Fecha de archivo es un corte distinto.
- Permanencia Excel = salida menos ingreso; no equivale a tiempo de carga/descarga. Publicar media, mediana, p90 y muestra; conservar demoras largas válidas.
- Cámaras: usar matched_journey_uids de la misma corrida, patente, intervalo Excel y pares A/B del mismo journey. Excluir UID compartido entre operaciones de la misma planta. Una coincidencia por matrícula sola no confirma atribución.
- Reloj: el método histórico y ETL v17 usan raw +206 minutos. Coherencia interna contrastada con campos canónicos y código `server/plantState/liveEventTime.mjs`; no hay certificación externa de reloj. Preservar raw y corregido. No cruzar raw contra Excel como si tuvieran el mismo reloj.
- Mostrar tramos de recepción y despacho separados. Sólo sumar medias de una cohorte común con todos los tramos y las mismas fronteras; rotular intervalo observado por cámaras, no puerta a puerta Excel.
- Nodo de bombeo Ricardone sin cámara; RicCalLiq es calada. Área de aceites Terminal no marca inicio/fin del bombeo. Renopack sin pares atribuibles en la receta validada: informar falta de medición.
- Los candidatos VOLCABLE del primer informe requerían revisión de reloj. La revisión +206 reduce 10 movimientos/9 patentes a 9/8 y muestra lecturas inmediatamente anteriores a salida Excel: validar cámara e imagen antes de inferir conducta.

## Entrega vigente de líquidos y circuitos interplanta

Informe: salidas/liquidos-24-30/artefacto/index.html; evidencia: resumen.json y recorridos.json de esa carpeta. Sustituye los PPTX anteriores. Nodo Sur = Ricardone + Terminal de Embarque, excluyendo Renopack: 307 movimientos / 113 patentes.
R35 es calada Ricardone y descarga líquida Terminal, sin presumir carga en Ricardone. Nueve secuencias temporales candidatas con cinco tramos comunes; UID distinto entre plantas impide confirmar circuito.
R33 es carga Ricardone y continuación a OSL Terminal. R34 continúa por Playa OSL, calada y balanza hasta líquidos Terminal. Carga Ricardone sin cámara; dos despachos Excel no acreditan destino SLZ. No inventar sus tiempos.
Un nombre de dispositivo no equivale a la planta comercial Excel: excluir actividad Renopack sin quitar nodos físicos válidos de Terminal.
