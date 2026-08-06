# Plan: agregar cámaras nuevas a la secuencia del circuito (Ricardone)

> Contexto: se van a instalar cámaras nuevas de forma progresiva (empezando por
> **S6 = playa, una sola cámara**). Van a quedar **entre puntos de tramos ya
> definidos**, con cobertura parcial al principio. Objetivo: dejar un plan para
> integrarlas **sin romper** la clasificación de circuitos ni el KPI de tiempos.
> Fecha: 2026-08-04. **Es plan — no se implementó nada.**

---

## 1. Dónde está definida "la secuencia de cámaras" (mapa exacto por capa)

La secuencia no vive en un solo lugar: son **7 capas**, y cada cámara/punto
existe (o no) en cada una. Este es el inventario:

| # | Capa | Archivo | Qué define para Ricardone |
|---|---|---|---|
| 1 | **Cámara física → punto lógico** | `src/etl-core/domain/eventNormalization.ts` → `RIC_DEVICE_POINT_MAP` | `deviceCode` → `INGRESO/PREINGRESO/CALADA/BALANZA_*/VOLCABLE/CELDA16_*/LIQUIDO/EGRESO`. **Puerta de entrada**: sin entrada acá, el evento es `UNKNOWN`. |
| 2 | **sectorCode → S-code** | `src/data/realSectorCodeMap.ts` → `REAL_SECTOR_CODE_MAP` | `RICARDONE_*` → S. Hoy: S0 ingreso · S1 preingreso · S2 calada · S3 egreso · S4 balanza · S9 volcable/celda16. **No hay S5/S6/S7/S8.** |
| 3 | **Secuencia S-code por circuito** (valida completo/anómalo) | `src/etl-core/domain/circuitCatalog.ts` → `baseSequence` + `*_ALLOWED_SEQUENCES` | Plantillas S0–S10 (ej. R5 `S0 S1 S2 S4 S6 S7 S9 S4 S10`). |
| 4 | **Cadenas lógicas de circuito** | `src/features/real-truckflow/etlWorkbench/validCircuitMatrix.ts` | `R7_RIC_LOGICAL_PREFIX`, prefijos transile — en códigos **lógicos**, no S. |
| 5 | **Orden de tramos + KPI + topes** | `etlSegmentTiming.ts` (`LOGICAL_TRANSITION_ORDER`, labels) + `etlSegmentTimingRules.ts` (KPI chains, `*_MAX_MINUTES` por transición) | Un tramo = par de puntos consecutivos, con tope de minutos. |
| 6 | **Capacidad/saturación por S-code** | `src/config/sectorCapacityByPlant.ts` | Ricardone **S6 = playa (141)**, S7/S8 = pulmón (fallback). |
| 7 | **Taxonomía de negocio** | `src/data/masterCircuitCatalog.ts` → `secuenciaCamaras` | Secuencias en S-code para el comité. |

---

## 2. El problema de fondo (por qué agregar hoy es conflictivo)

**Hay tres numeraciones de S-code que NO coinciden** para Ricardone, y el flujo
de clasificación ni siquiera usa S-codes:

- Capa 2 (`realSectorCodeMap`): S3 = egreso, S4 = balanza, S9 = volcable. **No define S5/S6/S7/S8.**
- Capa 3 (`circuitCatalog` baseSequences): usa S5, S6, S7, S9, S10 con **otro** significado.
- Capa 6 (`sectorCapacityByPlant`): **S6 = playa.**
- Capa 1 (la que clasifica) habla en **códigos lógicos** (VOLCABLE, CALADA…), **no en S-codes**.

Consecuencias directas:
1. **"Playa" no existe como punto lógico de Ricardone hoy** — no hay ningún
   `logicalCode` de playa en `RIC_DEVICE_POINT_MAP` (sí existe `SL_PLAYA`, pero es
   de San Lorenzo, y solo en el timing). Así que **S6/playa es un punto NUEVO** en
   el modelo Ricardone, no un renombre.
2. Meter "S6" a ojo en una sola capa deja las otras 6 hablando idiomas distintos
   → recorridos que pasan por la cámara nueva se leerían como fuera de secuencia
   (INCOMPLETO/ANOMALO) en vez de válidos.

---

## 3. El riesgo específico de "insertar entre dos puntos ya definidos"

Un tramo hoy es un par consecutivo A→B con un tope de minutos. Insertar un punto
P **entre** A y B:
- parte el tramo A→B en **A→P y P→B** → el tope de A→B ya no aplica igual;
- si P se agrega como **obligatorio** en la secuencia esperada, todo recorrido
  que **no** pasó por la cámara nueva (cobertura parcial al inicio) pasa a estar
  **incompleto** → falso degradado del KPI y de la clasificación;
- las reglas de anomalía que dependen del **orden** (regresión, saltos) pueden
  disparar de más si P aparece intercalado sin estar previsto.

---

## 4. El patrón que ya existe y que hay que reusar: **punto OPCIONAL**

El catálogo de San Lorenzo ya modela cámaras "planificadas pero sin lecturas"
con `installed: false` y sectores "no instalada". Y en el pipeline v3 (2.0) ya
separamos **`secuenciaEsperada`** (ordena, sirve para detectar regresión) de
**`puntosRequeridos`** (lo que exige COMPLETO). Ese es el mecanismo correcto para
cobertura progresiva:

> Una cámara nueva entra como **punto opcional**: está en el ORDEN esperado (para
> ubicarla entre A y B y poder medir el tramo cuando aparece), pero **NO** en los
> puntos REQUERIDOS. Así, mientras la cobertura es parcial, su ausencia no rompe
> nada; cuando la cobertura madura, se promueve a requerido.

---

## 5. Plan de alta (checklist atómico, por cámara/punto nuevo)

Para que las 7 capas no se desincronicen, cada alta se hace como **un solo cambio
atómico** que toca todas las capas relevantes a la vez:

1. **Definir el punto lógico nuevo** (ej. `PLAYA` para Ricardone) — nombre por
   FUNCIÓN, no por S-code (para no chocar con las 3 numeraciones).
2. **Capa 1** — `RIC_DEVICE_POINT_MAP`: `deviceCode` de la cámara nueva → ese
   `logicalCode`, con `pointType`, `pointLabel`, frente/trasera, strong-point.
3. **Capa 2** — `REAL_SECTOR_CODE_MAP`: `sectorCode` nuevo → su S-code (definir
   S6 Ricardone acá si se adopta la numeración de capa 6).
4. **Capa 5** — `LOGICAL_TRANSITION_ORDER`: insertar el punto en el ORDEN, entre
   A y B. Definir el tope del tramo nuevo en `etlSegmentTimingRules.ts` **solo si**
   se quiere medir A→P y P→B por separado; si no, dejar el rollup A→B.
5. **Capa 3/4** — secuencias de circuito: agregar el punto como **opcional**
   (variante permitida), NO tocar `baseSequence`/`puntosRequeridos` hasta que la
   cobertura sea alta.
6. **Capa 6** — `sectorCapacityByPlant`: capacidad del sector nuevo (si aplica
   saturación).
7. **UI 2.0** — `PUNTO_LABEL` en `src/domain/catalogos.ts`.
8. **Reproceso + gate**: correr el ETL de las ventanas, regenerar
   `journey_timeline` (`npx tsx scripts/build-journey-timeline.ts --all`) y el
   **golden test** (`npx vitest run ...etlGoldenMaster`). Mover capas 1/3/5 toca
   clasificación: el golden tiene que quedar verde.

---

## 6. Recomendación estructural (antes de agregar la 2ª o 3ª cámara)

El dolor real es **3 numeraciones S-code inconsistentes**. Antes de sumar varias
cámaras progresivas conviene **una sola fuente de verdad de sectores Ricardone**
(igual que `sanLorenzoCameraCatalog.ts` para el puerto): un catálogo
`ricardoneCameraCatalog.ts` con `deviceCode · sectorCode · logicalSector (S) ·
logicalCode · label · installed · strongPoint · rearExcluded`, del que se
deriven las capas 1, 2 y 6. Con eso, agregar una cámara = **una fila** en un solo
archivo, y las inconsistencias no pueden volver a aparecer.

---

## 9. Estado con DATOS REALES (ventana 2026-07-27_2026-08-02, 25.302 eventos)

Los eventos de las 6 cámaras ya llegan (Playa3 2.577, S7 DescLínea1 2.662, etc.).
Re-corrido el ETL con la normalización nueva. **Integrado y verde**:

- **Reconocidas**: 0 eventos en UNKNOWN. Aparecen en las secuencias.
- **KPI / Logística (lado Excel)**: sus operaciones ya se clasifican por
  plataforma en su circuito real — **R3=471 (Kepler 1), R4=38 (Kepler 2)**,
  R5/R6 (volcables). Es lo que lee Logística (product→circuito), así que el KPI
  de esas operaciones ya es correcto.
- **Timeline / recorridos**: los puntos `PLAYA` (579), `DESPACHO_S7` (470),
  `CARGA_S8` aparecen con hora en `journey_timeline`.
- **Anomalías**: participan (26 BEHAVIORAL entre los 526 recorridos con punto
  nuevo) y **no generan falsos ANOMALO** por ser puntos extra.
- **Gate**: golden + 65 tests núcleo verdes. (Los 2 fallos de `etlSegmentTiming`
  son PREEXISTENTES — confirmado con `git stash`, son los del handoff.)

### KPI de tramos (agregado)
Se sumaron los puntos nuevos a las cadenas KPI como waypoints OPCIONALES
(`PLAYA` en `RECEPTION_BALANZA_KPI_CHAIN` → R1/R5/R6; `DESPACHO_S7` en
`KEPLER_KPI_CHAIN` → R3/R4). Con `TEMPLATE_SKIP_ROLLUP_MAX_INDEX_GAP=3`, insertar
un punto sube los gaps de 1→2 (siguen válidos) → el histórico y el golden no
cambian. Verificado con datos reales:

| Circuito | Tramo | n | media |
|---|---|---|---|
| R5 | balanza ingreso → playa 3 | 11 | 6,1m |
| R6 | balanza ingreso → playa 3 | 10 | 7,2m |
| R1 | balanza ingreso → playa 3 | 15 | 11,9m |
| R1 | playa 3 → balanza egreso | 59 | 6,7m |

**S6/Playa ya aparece en tramos/KPI.** `DESPACHO_S7`/`CARGA_S8` (S7/S8) todavía
NO, porque sus recorridos están en RS_REC en el lado-cámara y el KPI solo procesa
COMPLETOS con circuito real → ver caveat.

### Fase — Secuencias por circuito + S7 split (con datos reales)
- **S7 partido en dos puntos**: `DESCARGA_S7` (líneas 1/2) y `CARGA_S7` (carga).
  `S6=PLAYA`, `S8=CARGA_S8`.
- **Fuente única de secuencias por circuito** en `EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE`
  con la descarga en el medio (ya no rollup balanza→balanza). Verificado:
  - R1: balanza ing → **celda16 descarga (67m)** → **playa 3 (15m)** → balanza egr
  - R9: balanza ing → **celda16 carga** → **playa 3** → balanza egr
  - R3/R4/R11 (DESCARGA_S7), R12 (CARGA_S8), R21/R22/R23/R24 (transile): plantillas
    definidas y listas.
- **Gate**: golden + 132 tests núcleo verdes (solo 2 fallos Volcable preexistentes).

### Pendientes reales (misma raíz, NO shippeados sin gate)
1. **R5/R6 (volcable)**: la estadía se mide con el rollup Excel-first balanza→balanza
   (subsistema `synthesizeDischargeRollupLegs*`). Partirlo en playa→volcable rompe 3
   tests reales de ese subsistema → rework aparte.
2. **S7/S8 en KPI**: las plantillas están, pero los recorridos S7/S8 quedan RS_REC en
   el lado-cámara (gap excel-first) y el KPI solo procesa COMPLETOS → no aparecen aún.
3. **"Igual para anomalías"**: las anomalías usan `DEFAULT_CIRCUIT_MATRIX` (técnico),
   el KPI usa `EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE` (ejecutivo) — dos fuentes distintas.
   Unificar (+#1 +#2) es el refactor de fuente única (catálogo Ricardone) que
   destraba las tres de una.

### Reconciliación excel-first S7/S8 — HECHO (2026-08-05)
Los recorridos que pasan por S7/S8 (DESCARGA_S7 / CARGA_S7 / CARGA_S8) sin cámara
de silo ya **no** quedan en `RS_REC`: se reclasifican **excel-first** a su R-code
real. La plataforma del Excel decide (Kepler→R3/R4, etc.), **no** una regla de
cámara — evitando el fallo del intento previo (default volcable misclasificaba
Kepler como R5).

- **Dónde**: `etlS7S8ExcelReclassify.ts` (helper leaf) + un único override en
  `etlTransformPipeline.ts`, justo tras `resolveExecutiveCircuitConfigForJourney`.
  Se arma `patente → circuito` desde `inp.preNormalizedMovimientos`
  (`inferCircuitFromExternalMovimiento`) y, si el recorrido es RS_REC/RS_DESP/
  SIN_PUNTO **y** pasó por S7/S8, se reemplaza el circuito ejecutivo. Como el
  override es **antes** del cálculo de matriz/bucket/comité/KPI, todo el downstream
  (final_circuits, comité y KPI) se recalcula consistente para el R-code real.
- **Verificado (ventana 2026-07-27_2026-08-02)**: de 243 recorridos por S7/S8,
  **R3=167 · R4=24** (191 reclasificados), aparecen en comité como COMPLETOS/
  DEDUCIDO. Solo **21 quedan RS_REC**: son patentes **sin** movimiento Excel con
  plataforma resoluble → no se adivina (excel-first estricto).
- **KPI descarga (balanza-only)**: R3/R4 ya estaban en
  `CIRCUITS_WITH_BALANZA_STAY_ROLLUP` con rollup balanza→balanza **excel-first**;
  si no hay horario de descarga, el tramo se descarta (no se fabrica). La
  reclasificación es lo que hace que estos recorridos **reciban** ese tratamiento.
- **Gate**: golden master verde + 596 tests núcleo. Los 3 fallos restantes
  (2 Volcable + 1 R27) son **preexistentes** (confirmado con `git stash` sobre
  HEAD puro), ajenos a este cambio.
- **NO shippeado a propósito**: unificar clasificación/KPI/anomalías en una sola
  fuente sigue siendo el refactor de la reversión (instrucción explícita). Acá no
  se unificó: solo se reconcilió el circuito excel-first, y el resto del pipeline
  ya recalcula solo. La ruta de **subida por UI** (que normaliza el Excel dentro
  de la integración, sin `preNormalizedMovimientos` antes del loop) no tiene el
  mapa disponible → ahí S7/S8 seguiría RS_REC en final_circuits; las corridas
  reales (headless/servidor, backup local) sí lo tienen.

---

## 8. Alta base (capa 1, puntos opcionales) — HECHO

Confirmado por el usuario: **numeración de la matriz = única fuente de verdad**;
**S7 y S8 = un punto lógico cada uno**.

Implementado y verde (golden + 125 tests núcleo):
- `eventNormalization.ts` → `RIC_DEVICE_POINT_MAP`: 6 deviceCodes nuevos →
  3 puntos lógicos: `PLAYA` (S6), `DESPACHO_S7` (S7, 3 cámaras), `CARGA_S8`
  (S8, 2 cámaras). Dejan de ser UNKNOWN cuando lleguen sus eventos.
- `realSectorCodeMap.ts` → altas aditivas S6/S7/S8.

**Puntos OPCIONALES**: reconocidos, pero todavía NO exigidos en las secuencias de
circuito ni en `puntosRequeridos` → la cobertura parcial durante la instalación
no degrada clasificación ni KPI.

Pendiente (etapas siguientes, cada una con su gate):
1. **Reconciliar los S-codes viejos** de Ricardone en `realSectorCodeMap.ts`
   (Celda16 S9→S5, S3 egreso→Salida 2, etc.) a la matriz. Cambia coberturas
   existentes → requiere golden + revisión.
2. **Promover a requerido** e insertar en las secuencias de circuito
   (`circuitCatalog.ts`) cuando la cobertura de cada cámara madure.
3. **Tramos y topes** (`etlSegmentTimingRules.ts`) para los nuevos pares (ej.
   Balanza Ingreso→Playa 3→descarga) si se quiere medirlos por separado.

---

## 7. (Referencia) Datos del alta

| dato | ejemplo |
|---|---|
| `deviceCode` que reportará la cámara de playa | ? |
| `sectorCode` que va a traer el evento | ? (¿`RICARDONE_PLAYA`?) |
| Entre qué dos puntos ya definidos queda (A→B) | ? (¿PREINGRESO→CALADA? ¿CALADA→BALANZA?) |
| Frente o trasera | ? |
| ¿Es strong-point (corrobora circuito)? | ? |

Con eso lo doy de alta como **punto opcional** siguiendo el checklist §5, sin
romper la cobertura parcial, y corro el golden test.
