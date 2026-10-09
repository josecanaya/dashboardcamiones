# Evidencia histórica para inventario por visita y nodo

Análisis solo lectura ejecutado el 08/10/2026. No se regeneró ETL ni se reclasificó ningún circuito. Script reproducible: `inspect_history.py`; evidencia completa: `historical_nodes_evidence.json`.

## Cobertura y denominadores

- Fuente B: 149 archivos diarios `data/truckflow/<día>/event-list.json`, del 12/05 al 07/10/2026, sin días faltantes en ese intervalo. Son archivos disponibles, no prueba de disponibilidad continua de cada cámara.
- Se retuvieron eventos `eventCategory=physical` con dispositivo y se deduplicaron por `id`: 490.471 eventos y 130.346 valores `journeyUid`. Son registros del feed, **no visitas ni movimientos comerciales**.
- Se inspeccionaron 19 corridas semanales lunes→domingo con `manifest.status=ok` y `final_circuits`: 18/05–04/10, con una semana sin corrida semanal estándar (10–16/08). Ventanas ad hoc solapadas se excluyen. La primera semana parcial 12–17/05 tampoco entra en este agregado.
- Versiones: diez corridas v13, dos v14, cuatro v16 y tres v17. No mezclar sus proporciones de circuitos como si fueran etiquetas homogéneas de entrenamiento. Últimas v17: `2026-09-14_2026-09-20`, `2026-09-21_2026-09-27`, `2026-09-28_2026-10-04`.
- Para identidad/secuencia se usa fuente B; `final_circuits` sirve como respaldo de circuito adjudicado. Para movimientos comerciales corresponde C/Excel; para tiempos certificados, `circuit_timing_summary` y `circuit_timing_journeys` según las instrucciones del proyecto. El informe no convierte transiciones crudas en KPI certificados.

## Hallazgos que afectan directamente la implementación

**Un `journeyUid` no equivale a una visita.** El UID `1adc0686-8185-4eb0-8924-679061b40b11` para NAH953 aparece en eventos de balanzas el 12, 13 y 22 de mayo. Otras llaves también se reutilizan en vueltas/días. La máquina de estados necesita `visitId` propio: secuencia temporal causal, entrada/reentrada, cierre local y continuidad entre plantas. No conservar eternamente un pendiente porque comparte el UID.

**Balanza ingreso y egreso de Ricardone tienen el mismo código S4, pero distintos `node.id`.** En `modelo_nodo_sur.json` son `ricardone:Balanza Ingreso` y `ricardone:Balanza Egreso`. La identificación por código lógico solo pierde la fase. Preservar cámara, nodo físico, fase propuesta y posición del recorrido.

El feed respalda una fase operativa habitual, pero no una obligación absoluta por nombre del dispositivo:

| Transición física adyacente, mismo UID y diferencia >0 hasta 8 horas | n | Mediana minutos |
|---|---:|---:|
| RicB1Ingreso → RicB2Egreso | 5.259 | 83,669 |
| RicB1Ingreso → RicS6Playa3 | 2.265 | 6,063 |
| RicB3Ingreso → RicB3Egreso | 1.743 | 22,979 |
| RicVolcable1 → RicB2Egreso | 1.436 | 24,041 |
| RicB3Egreso → RicB3Ingreso | 390 | 42,221 |

Son transiciones observadas de captura, no pruebas de identidad física ni de descarga: puede faltar un nodo intermedio, existir un mal OCR o haberse reutilizado el UID. Las muestras/fechas están en el JSON. El umbral de ocho horas es filtro exploratorio, no recomendación de expiración rígida.

Dispositivos Ric B1/B2/B3 no son parejas frente/trasera: se ven sobre todo RicB1Ingreso (15.409 registros), RicB2Egreso (15.250), RicB3Ingreso (4.003) y RicB3Egreso (2.439); RicB1Egreso tiene 111 y RicB2Ingreso solo uno. No inferir indisponibilidad ni equivalencia entre cámaras con esos totales, pero tampoco imponer que B1Ingreso tenga que emparejarse con B1Egreso.

**Volver a balanza puede ser legítimo.** Entre observaciones consecutivas de balanza (ignorando otros nodos), se observan 2.864 pares ingreso→egreso con alguna captura de proceso intermedia y 7.349 sin ella; 1.251 egreso→ingreso sin proceso intermedio. No consumir una patente permanentemente después del primer S4 o prohibir todos los retrocesos. Consumir la instancia del paso esperado de esa visita; un nuevo paso requiere una nueva expectativa o excepción explícita.

**Salida 2 de Ricardone es puente habitual a San Lorenzo.** El modelo y `circuitPrefix.mjs` ubican RicEgrCamFrente en S3. Salida 1/S10 no tiene cámara. En la fuente hay 13.148 transiciones RicEgrCamFrente→SLZIngCamFrente, mismo UID y hasta ocho horas. No cerrar el recorrido global al ver S3: cerrar presencia Ricardone y pasar a tránsito esperado San Lorenzo cuando el circuito es compatible. Si falta entrada SL, retener como tránsito/cobertura incompleta, sin inventar presencia SL.

También hay continuación después de S3 hacia RicS6Playa3 (167), RicIngCamFrente (117) y RicB1Ingreso (71), bajo ese mismo filtro. Esas observaciones impiden tratar S3 como absorción irreversible. Reentrada a Ricardone abre nueva instancia de visita o excepción según evidencia; no se redefine el circuito desde estos conteos.

**TK400 no debe ser egreso universal ni descarga demostrada.** Catálogo de perfiles: dispositivo `SLZTK400`, sector `INGRESO_RENOVA`, lógico `SL_S8`, nodo `san_lorenzo:Carga/Descarga Renova`. Su nombre físico no autoriza cerrar toda visita del puerto ni atribuir producto. La pertinencia y la identidad se resuelven por separado.

## Reglas concretas recomendadas

1. Construir expectativas mediante posiciones de los circuitos del modelo, manteniendo todas las continuaciones compatibles. Una captura confirmada avanza/consume el paso de la visita; no reserva todos los destinos posibles como si fueran certezas.
2. En volcable, priorizar visitas con balanza ingreso/calado/entrada compatibles que todavía no tengan descarga y fase posterior confirmada. No exigir todas las cámaras: una ausencia observacional crea una excepción recuperable.
3. Duplicados de cámara cercana o pareja de frente/trasera comparten paso; un cambio de carril no abre automáticamente nueva visita. Una vuelta posterior con proceso intermedio sí puede abrir nuevo paso de balanza.
4. Reentradas y transferencias usan límites temporales explícitos y motivos visibles. Esperados, cobertura incompleta, tránsito, tardío y cerrado deben ser estados distintos. El tardío conserva posibilidad de recuperación humana.
5. Una lectura posterior puede ayudar al operador retrospectivamente, pero no habilita automatismo causal ni entrenamiento/evaluación que mire el futuro.
6. Aprender confusiones de caracteres y atributos desde decisiones humanas con fecha, cámara y visita; no entrenar con los descartes automáticos como si fueran verdad humana. Mantener evaluación temporal separada por visita y matrícula.

## Comités y fuentes de modelo

- `reportes/logistica/2026-09-24_2026-09-30/revision-003/control.json`: respaldo trazable del comité 24–30/09, `rulesVersion=etl_transform_v17`, corridas `2026-09-21_2026-09-27` y `2026-09-28_2026-10-04`; usa `final_circuits`, `circuit_timing_journeys`, `segment_timing_legs` y actividad por punto. No aporta fotos/etiquetas de verdad independientes: procede de las mismas fuentes.
- `artifacts/codex/actualizacion-octubre/INFORME.md`: el adicional 1–3/10 es un escenario agregado de actividad, no movimientos ni identidades certificadas; no se incorpora como verdad de entrenamiento.
- `outputs/reconocimiento_20260924_30/transiciones_nodos.py`: el modelo previo de transiciones agrupa por patente, confianza DSS >=80, salto hasta seis horas, **sin segmentación de visita**. Sus aristas fuera del modelo pueden ser cobertura incompleta/vueltas/OCR; no son rutas nuevas automáticamente válidas.
- `outputs/reconocimiento_20260924_30/prior_circuitos_historico.py`: mezcla versiones históricas y enumera clasificación ejecutiva disponible. Usar como orientación suavizada/versionada, no garantía de candidato correcto ni verificación independiente.
- Fuente topológica: `docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json`, cruzada con `docs/propuesta-en-vivo/CRUCE_NODOS_VS_ETL.md`; códigos lógicos actuales en `server/plantState/circuitPrefix.mjs`; dispositivos/sectores en `server/plantState/sectorProfiles.mjs`.

Nota de hora: `server/plantState/liveEventTime.mjs` vigente suma 206 minutos a `occurredAt`; el texto pegado de la auditoría anterior hablaba de 240 segundos. El análisis anterior usa diferencia entre timestamps fuente, que no cambia por un offset global constante. Los cortes de visita/día deben usar el helper común vigente y registrar la versión/offset aplicado.
