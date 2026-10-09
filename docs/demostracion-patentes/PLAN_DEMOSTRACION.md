# Plan: demostración de la tesis de reconocimiento de patentes

Documento autocontenido para ejecutar en otra sesión de Claude con acceso a este repo.
Fecha del plan: 08/10/2026. Contexto: presentación «Hipótesis y tesis de patentes» (14 láminas,
artifact https://claude.ai/artifact/VSu95VPvN45gZXp1jpP5vc) y su explicativo
https://claude.ai/artifact/57xp75Q19VMk6QZP4DDti1.

## 1. Qué hay que demostrar

Problema: de cada 100 camiones que pasan por un punto, la cámara lee bien ~75 (septiembre: 83 de día,
67 de noche). Este trabajo trata las **leídas mal**: hay lectura pero no es la patente del camión.

Para cada lectura dudosa, cada candidato (camión conocido) y la opción **«nunca visto»** (vehículo
todavía no leído) responden tres preguntas cuyo producto es el puntaje:

- **H1 · ¿Podía estar ahí?** Cada nodo y franja tiene un `pInicio` = probabilidad de que el vehículo sea
  nunca visto. El resto, `1 − pInicio`, se reparte entre los camiones conocidos. Pesan el máximo los que
  tienen ese nodo como próximo paso de su circuito; un cuarto, los que llegan saltando una cámara.
- **H2 · ¿La cámara leería eso?** Frecuencia de cada tipo de error: leyó bien ≈ 79 % (Calada de día),
  confusión típica 1/91, letra de menos 1/240, letra cualquiera cambiada 1/2.040, patente exacta de un
  camión que nunca vino 1/16.200, dos letras cambiadas 1/4 millones. Valores iniciales, a medir por cámara.
- **H3 · ¿Se ve igual?** Color, marca y tipo del DSS, como razones de verosimilitud:
  - marca: coincide ×4,75, no coincide ×0,20;
  - color: coincide ×1,2 (blanco) a ×10,8 (rojo), no coincide ×0,73;
  - tipo: coincide ×1,09, grande/mediano ×0,76, camión/auto ×0,3.
- **H4 · «Nunca visto» compite igual:** prior = `pInicio` y verosimilitud = la de una patente nueva leída bien,
  o la de una lectura dañada.

`P(candidato) = puntaje / (Σ puntajes + puntaje de nunca visto)`. Regla: **asignar si P ≥ θ**.

- **Tesis 1 · Exactitud:** cuando se asigna, es el camión real en **≥ 98 %** de los casos.
- **Tesis 2 · Cobertura:** se resuelve sola una parte medible de las leídas mal, sin asignaciones equivocadas.

Criterio estadístico: cota inferior exacta (Clopper-Pearson, unilateral, 95 %) ≥ 0,98. Hace falta:

| Errores | Asignaciones necesarias |
|---|---|
| 0 | 149 |
| 1 | ≈ 236 |
| 2 | ≈ 314 |

Estado previo (replay 06–07/10, 114 decisiones de operaciones, sin color ni marca, `scripts/replay-node-model.mjs`):

- el modelo acierta 82/114 (el sistema anterior, 68);
- en 27 casos la respuesta correcta en ese momento era «nunca visto»;
- correcciones con P ≥ 98 %: 5/6. Falló FMI166→EMI166; era FMT166 (E/F entre dos camiones reales) y la marca lo habría resuelto.

## 2. Regla de oro: calibración separada de prueba

- **Calibración = septiembre 2026.** Hay Excel completo y feed de cámaras; el análisis efectivo es 01–22/09,
  ver la sección 7. Con septiembre se miden `pInicio`, los errores por cámara y los pesos de atributos, y se elige θ.
- **Prueba = 01–07/10/2026.** El feed y el Excel ya están en disco; el DSS lo exporta el usuario.
- **Preregistro:** antes de correr la prueba se congelan el código, los parámetros y θ (commit y hash en
  `docs/demostracion-patentes/preregistro.json`). Si después se toca algo, esa semana queda «quemada» y se
  prueba con otra (por ejemplo, 08–14/10).
- **Causalidad:** cada lectura se evalúa solo con lo que se sabía a su hora. Nada de lecturas posteriores,
  ni del Excel, ni de decisiones de operaciones.

## 3. Datos y dónde están

| Fuente | Ruta | Notas |
|---|---|---|
| Feed TruckFlow por día | `data/truckflow/<día>/event-list.json` (+ `alert-list.json`) | 01–07/10: 12.015 lecturas, 509 con formato inválido |
| Excel de movimientos por día | `data/movimientos/<día>/movimientos.json` | 01–07/10: 2.438 movimientos. Verdad independiente de las cámaras |
| DSS 01–07/10 | **lo exporta el usuario** (sección 4) | color, marca, tipo y confianza de cada lectura |
| Modelo de nodos | `docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json` | fuente única de nodos, cámaras y circuitos |
| Prior histórico de circuitos | `server/plantState/data/circuitPriorHistorico.json` | |
| Tabla `pInicio` por nodo y franja | `server/plantState/data/pInicioNodos.json` | la generan `scripts/p-inicio-camaras.mjs` y luego `scripts/p-inicio-nodos.mjs` |
| Flota de patentes | `server/plantState/data/flotaPatentes.json` | 12.789 patentes válidas distintas vistas en septiembre |
| Modelo de la tesis (en evaluación) | `server/plantState/nodeModelScore.mjs` (+ test) | `scoreWithNodeModel`, `readLikelihood`, `neverSeenReadLikelihood`, `pInicioTable` |
| Algoritmo en vivo actual | `server/plantState/plateIdentification.mjs` | universo, doble lectura, inventario por visita (`visitInventory.mjs`) |
| Atributos (H3) | `server/plantState/identificationEvidence.mjs` | `scoreCandidates`, `compareAttribute`, razones de verosimilitud |
| Atributos medidos 24–30/09 | `outputs/reconocimiento_20260924_30/atributos_entre_camaras.json` | acuerdo entre capturas, no exactitud visual |
| Decisiones de operaciones | `data/plate-identification-log.jsonl` | sirve de control, no como verdad principal (sesgo de selección) |
| Informe de reconocimiento por cámara | `scripts/informe-reconocimiento-camaras.ts` | esperados por circuito Excel contra leídos; base para «pasos faltantes» |
| Replays existentes | `scripts/replay-node-model.mjs`, `scripts/replay-inventory-reasons.mjs`, `scripts/audit-plate-semi-auto.mjs` | |

### Relojes (crítico)

- **Hora operativa del feed** = `occurredAt + 206 min`; usar `getEventLiveInstantMs` de `server/plantState/liveEventTime.mjs`.
- **DSS** = hora real de la cámara = hora operativa del feed **− 240 s** exactos. Una lectura del DSS y la
  del feed coinciden en ±5 s después de ese ajuste.
- Excel: horas de ingreso y salida de balanza/portería, en hora local Argentina (UTC−3).

## 4. Qué tiene que exportar el usuario del DSS

Todas las cámaras de patentes (LPR) de Ricardone y San Lorenzo, **01/10 00:00 a 07/10 23:59**. Una fila por
lectura, con:

- fecha y hora de la cámara;
- cámara o canal (el nombre como figura en el DSS, para mapearlo al `deviceCode` del feed);
- patente leída y confianza;
- color, marca y tipo de vehículo;
- carril o sentido, si existe.

Las fotos no hacen falta: se piden por API solo para la muestra de auditoría (sección 6, Fase 2.4). Sirve CSV o Excel, por día o por cámara. Guardarlo en `data/dss-export/2026-10-01_07/`.

Alternativa sin export: la API `POST /ipms/api/v1.1/fusion/vehicle-capture/record/fetch/page` con
`{currentPage, page, pageSize, startTime, endTime (epoch s como string), channelIds:[channelId]}`
(implementada en `server/dss-live.mjs`). Hay que paginar por cámara y día. Atención: el DSS limita las
consultas (HTTP 429) y la cuenta admite **una sola sesión**: no correrla en paralelo con el servidor en vivo.
El punto de entrada `/api/truckflow/camera-captures/find` busca de a una lectura (±5 s) y no sirve para volumen.

## 5. Hipótesis de trabajo sobre la verdad

El Excel de movimientos no depende de las cámaras: dice qué camiones estuvieron en planta, con qué
circuito y entre qué horas. La verdad de cada leída mal se construye por **asignación a pasos faltantes**,
sin usar el modelo.

## 6. Fases

### Fase 0 — Congelar (preregistro)
1. Recalcular `pInicioNodos.json` **solo con septiembre** y guardarlo como versión fechada.
2. Fijar los parámetros de H2 (tabla de errores) y H3 (razones de verosimilitud) calibrados en septiembre.
3. Elegir θ con septiembre (Fase 5) y escribir `docs/demostracion-patentes/preregistro.json`: commit,
   hashes de los archivos de parámetros, θ, definición de «leída mal» y de la verdad.

### Fase 1 — Dataset unificado de la semana de prueba
- Script nuevo `scripts/demostracion/build-dataset.mjs` (salida en `outputs/demostracion_2026-10-01_07/`):
  - unir el feed (event-list + alert-list) y el export del DSS por cámara y hora (DSS + 240 s ≈ feed ± 5 s);
  - agregar color, marca, tipo y confianza a cada lectura del feed;
  - las lecturas del DSS que no están en el feed se guardan aparte (traseras, autos): sirven para H4.
- Definir **leída mal**: formato inválido, o patente válida que no figura en el Excel del período y no es el
  ingreso de un camión nuevo.

### Fase 2 — Construir la verdad (sin cámaras ni modelo)
1. Por cada movimiento del Excel: la secuencia de nodos con cámara que **debía** pasar según su circuito
   (`resolved_executive_circuit_code`) y la ventana [ingreso, salida]. Reusar la lógica de esperados de
   `scripts/informe-reconocimiento-camaras.ts`.
2. **Pasos faltantes:** pasos esperados sin lectura buena de esa patente en el nodo, acotados entre sus
   lecturas buenas anterior y siguiente.
3. Para cada leída mal en el nodo N a la hora t:
   - **firme:** exactamente un camión con paso faltante en N compatible con t → verdad = ese camión;
   - **ambigua:** dos o más → fuera del cálculo de exactitud; se reporta aparte o se resuelve con fotos;
   - **sin match:** ninguno → verdad = «nunca visto / no camión».
4. **Auditoría de la verdad:** 100 etiquetas firmes al azar, revisadas por una persona con las dos fotos
   del DSS lado a lado (preparar una página HTML con las fotos). Así se estima el error de la propia
   etiqueta. Si supera el 1 %, ajustar la construcción antes de seguir.

### Fase 3 — Verificar cada hipótesis
Para cada una, predicho contra observado en septiembre y en la semana de prueba:

- **H1:** % de «nunca vistos» por nodo y franja (día 06–18 / noche) contra `pInicio`. Pasa si cae dentro del
  intervalo de confianza de cada nodo con suficientes datos.
- **H2:** matriz de errores **por cámara**, medida con dobles lecturas del mismo camión (bien en una cámara,
  mal en otra, dentro de la misma visita): confusiones por par de caracteres y posición, borrados e
  inserciones. Comprobar si pares como 6↔8 (CFK006→CFK008) son frecuentes en alguna cámara. Suavizar
  (Laplace/Bayes) para que un par visto una vez no se vuelva regla.
- **H3:** razones de verosimilitud de color, marca y tipo **por cámara**, con los datos del DSS. Ejemplo:
  Preingreso ve «negro» camiones blancos.
- **H4:** calibración: de los casos con P(nunca visto) ≈ x, ¿qué fracción realmente lo eran?

Si una hipótesis no se cumple en un nodo, la tesis se acota a donde sí se cumple; por ejemplo, «vale en
Calada y Balanzas, no en Renova». Ese también es un resultado válido.

### Fase 4 — Correr la regla sobre la semana de prueba
Script `scripts/demostracion/run-rule.mjs`: para cada leída mal, en orden temporal y solo con información
previa a su hora (como `replay-node-model.mjs`), calcular candidatos y «nunca visto» con
`scoreWithNodeModel` + atributos del DSS. Guardar P, la decisión (asigna o se abstiene) y la evidencia.

### Fase 5 — Contar y cerrar
- **Resultado:** matriz decisión contra verdad (aciertos, errores, abstenciones), total, por nodo y por día/noche.
- **Curva exactitud–cobertura** según θ: θ se elige en septiembre, el menor que mantiene ≥ 98 %, y se
  aplica **sin cambios** a octubre.
- **Cota Clopper-Pearson** de la exactitud en octubre.
- **Revisión caso por caso de cada error:** ¿falló una hipótesis, la verdad o el umbral?
- **Salida:** `docs/demostracion-patentes/RESULTADO.md` + JSON con cada caso.

### Fase 6 — Reconstruir lo que falta
Con θ validado, aplicar la regla a todo septiembre: reconstruir los pasos leídos mal y actualizar el
informe de reconocimiento por cámara («75 % leídas bien» → «X % identificadas», mostrando aparte las
recuperadas). Si la semana no alcanza los 149 casos sin error, repetir las fases 1–5 con 08–14/10.

## 7. Cuidados conocidos (no repetir errores)

- **Excel de septiembre:** los días 23–24/09 quedan fuera, y también el Ingreso SL del 17 al 24/09 y el
  Ingreso Ricardone frente desde el 24/09 (`data/camaras-exclusiones-2026-09.json`). Universo: solo
  `planta_normalized` RICARDONE / TERMINAL_EMBARQUE; AVELLANEDA, RENOPACK y LOS_CORRALES no tienen cámaras Nodo Sur.
- Las patentes ficticias XXXXXX / PPPPPP / TTTTTT del Excel quedan afuera.
- **Calada SL** no se mide. **SLZTK400 / Renova** es cámara de acceso compartido, no paso obligado. **SLZCalCam** no existe.
- Las **traseras** leen la patente del acoplado: no se comparan contra el Excel.
- Muchas lecturas reales están solo en `alert-list.json` (INVALID_ROUTE / INVALID_JOURNEY_START con la
  patente en la descripción; LPR_MALFUNCTION = patente inválida).
- El `journeyUid` del proveedor se reutiliza entre vueltas: separar visitas por tiempo y reentrada
  (`visitRowsAt` en `server/plantState/visitInventory.mjs`).
- **Egreso SL C1/C2 y Balanzas B1/B2/B3** son carriles distintos: dos lecturas casi simultáneas pueden ser dos camiones.
- **Autos y camionetas** entran por Egreso SL (21 %) y Renova (40–51 %). Camión = patente que pasó por un nodo de proceso.
- Recepción Silo Chief (R4) descarga en S7. La balanza de egreso SL (SLZBalSC2Fte) lee poco desde el 14/09.
- **Pares de camiones reales casi iguales:** MFY738/MFY788, OJD501/OJO501, AF060AZ/AF068AZ, AB912RO/AB912PO
  (con atributos iguales), FMI166/FMT166/EMI166. Son los casos que ponen a prueba la tesis.
- **Nunca afirmar «100 %»** ni «identidad confirmada» en informes; las cifras van con su denominador.

## 8. Qué tiene que hacer el usuario

1. Exportar el DSS de 01–07/10 (sección 4) en `data/dss-export/2026-10-01_07/`.
2. Dedicar 30–60 min a la auditoría de 100 etiquetas con fotos (Fase 2.4).
3. Confirmar que el Excel 01–07/10 está completo y si hubo cámaras caídas esa semana.

## 9. Orden sugerido para la otra sesión

1. Leer este archivo y la memoria del proyecto: `identificacion-patentes-en-vivo`,
   `modelo-nodos-nunca-visto`, `inventario-visita-reglas-en-evaluacion` e `informe-reconocimiento-camaras`.
2. Fase 0 y Fase 2 con septiembre y 01–07/10. No necesitan el DSS.
3. Fase 3 sin H3. Cuando llegue el export, Fase 1 completa + H3.
4. Fases 4–5 y el resultado. Fase 6 solo si T1 se sostiene.
