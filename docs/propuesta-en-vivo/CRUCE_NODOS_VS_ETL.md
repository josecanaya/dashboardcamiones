# Cruce: modelo de nodos (fuente de verdad) vs ETL

Fecha: 29-09-2026 · `rulesVersion` **etl_transform_v17**.

**Fuente única de verdad:** `modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json` (33 nodos,
50 circuitos, 5 playas). Evidencia: feed real 20–27/09
(`data/truckflow/*/event-list.json`) y corrida `runs/windows/2026-09-21_2026-09-27`.

## Cómo fluye

```
Matriz de Vicentin (xlsx, intacta)
  → fuente/sur_model.py        correcciones documentadas + cámaras (fuente/camaras_por_nodo.json)
  → datos/modelo_nodo_sur.json  EL MODELO (y el explorador HTML)
  → scripts/nodo-sur-sync.mjs   → src/etl-core/domain/nodoSur.generated.ts (no editar)
  → src/etl-core/domain/nodoSur.ts   lectura: nodo por cámara/sectorCode, secuencia de cámaras
  → circuitCatalog.ts (baseSequence = modelo) · committeeClassification · circuitPrefix.mjs (en vivo)
```

Para cambiar un nodo, una cámara o un circuito: editar `sur_model.py` / `camaras_por_nodo.json`,
correr `python sur_explorer.py` (en `fuente/`, luego mover `sur_data.json` → `datos/modelo_nodo_sur.json`
y el HTML), después `node scripts/nodo-sur-sync.mjs`. Los tests `nodoSur.test.ts` y
`circuitCatalog.invariants.test.ts` fallan si el catálogo se separa del modelo.

## Decisiones aplicadas al modelo (29-09-2026)

| # | Decisión | Efecto |
|---|---|---|
| 1 | Salida 1 (S10) no tiene cámara | nodo punteado; las recepciones se validan hasta Balanza egreso |
| 2 | R8 es solo Ricardone; calada en Ricardone → líquido al puerto es otro circuito | **R35 nuevo**: Ingreso › Preingreso › Calada › Salida 2 › SL Ingreso › Balanza ingreso › Carga y descarga › Balanza egreso › Egreso |
| 3 | R26–R32 en el puerto van por volcables, no por Carga OSL | pata SL = Ingreso › Playa OSL › Balanza ingreso › Volcables › Balanza egreso › Egreso (como R7) |
| 4 | R26 salía por Salida 1 con dos pasos 8 | vuelve a Calada y sale por Salida 2, como todo transile al puerto |
| 5 | No existe la recepción directa a volcables del puerto | no se agrega circuito; SL1 = Recepción Carga OSL (como el modelo) |
| 6 | Silo Chief tiene cámara: las del sector S8 | Silo Chief = S8, comparte cámaras con Tolva silo Chief (el circuito decide cuál) |
| 7 | "Playa espera Volcables" no existe: es **Playa OSL** | entre Ingreso SL y Balanza ingreso (antes de Calada si la hay), sin cámara; en R7, R26–R32, R34, SL2, SL3 |
| 8 | R33/R34 saltaban del paso 8 al 10 | pasos renumerados |
| 9 | **Playa 1** entre Preingreso y Calada | nodo nuevo en todo circuito que pasa Preingreso → Calada |
| 10 | **Playa demorado**: después de Calada, antes de Balanzas o Salida 2 | nodo nuevo como **desvío** (solo camión demorado): no es paso de ningún circuito, se dibuja punteado |
| 11 | Las playas son **áreas**: sin cámara propia ni dato del sistema de camiones, se miden por las cámaras de entrada y salida; ahí pasa ~70 % del ciclo | `area: true` + capacidad; color ámbar en el explorador. Playa 1 = 300 · Playa demorado = 20 · Playa 3 = 100 · Playa de salida (ex "Playa de egreso") = 4 · Playa OSL = 150 |

## Cámaras por nodo (feed real)

TruckFlow manda `sectorCode` = `<planta>-S<n>` (`2-` Ricardone, `1-` San Lorenzo), los códigos del
modelo. Detalle en `fuente/camaras_por_nodo.json`. Nodos sin cámara: Salida 1, Silo Australiano,
Tolvas Celda 09/10/11, Líquidos, Playa de egreso (Ricardone); Playa OSL, Cargadero (San Lorenzo).
La única cámara de salida de Ricardone (RicEgrCamFrente, `2-S3`) es Salida 2.

## Qué estaba mal en el ETL y qué se corrigió

| Problema | Corrección |
|---|---|
| El clasificador no leía el feed actual (`2-S3`): la secuencia observada quedaba vacía y no se detectaban variaciones (recalado, doble balanza, vuelta a ingreso) | `journeyExecutiveSectorSequence` lee el código del feed / la cámara vía `nodoSur` |
| `circuitCatalog.ts` escrito a mano: 16 circuitos con recorrido distinto al modelo (S7 agregado, S10 inexistente, SL1–SL3 con la secuencia de volcables copiada) | `baseSequence` = proyección del modelo a cámaras, para todos |
| Faltaban 23 circuitos (R2, R10–12, R17, R18, R21–25, R33, R35, SL4–15) | agregados, **sin clasificar por secuencia** (`enabledForClassification: false`) |
| `realSectorCodeMap`: Celda 16 = S9 (chocaba con Volcable) | S5 |
| En vivo (`circuitPrefix.mjs`): egreso = S10, no leía `2-Sx`, etiquetas viejas | egreso S3, lee el feed, etiquetas del modelo |
| Excel: `platform.includes('CELDA')` mandaba **Celda 171 de Avellaneda a R1** (75 movimientos por semana) | solo `CELDA_16`; Avellaneda no recibe circuito del Nodo Sur |
| `CURRENT_RULES_VERSION` del servidor copiado a mano | v17 (las ventanas v16 quedan vencidas) |

**Impacto medido** (semana 21–27/09, misma entrada, código viejo vs nuevo): circuitos, buckets
ejecutivos y anomalías **idénticos**; 9 recorridos R8 pasan de COMPLETOS a VARIACIONES
(recalado, doble paso por balanza, vuelta a ingreso); 75 movimientos de Avellaneda dejan de
contarse como R1. Tests: los mismos 7 fallos que ya existían, 8 tests nuevos en verde.

## Capacidades en el tablero en vivo (29-09-2026)

| Playa | Dónde | Antes | Ahora |
|---|---|---|---|
| Playa 1 | `plantGraph.mjs` Z2 · `sectorProfiles.mjs` Preingreso · `sectorCapacityByPlant.ts` S1 | 263 físico / 450 operativo | 300 |
| Playa demorado | Z3 (→ Balanza) y Z4 (→ Salida 2), una sola área partida por destino | 39 c/u (era la calada) | 20 c/u |
| Playa 3 | Z6 · `sectorProfiles.mjs` S6 · `sectorCapacityByPlant.ts` S6 | 141 físico / 30 operativo | 100 físico / **30 operativo (se mantiene)** |
| Playa de salida | Z8 (ex "Balanza → Egreso") | sin dato | 4 |
| Playa OSL | SL Z0 (ya estaba) · `sectorCapacityByPlant.ts` SL S0 | 150 / densidad 92 | 150 |

## Pendiente (fase siguiente)

1. **Otras definiciones escritas a mano que todavía no leen el modelo:** matriz técnica
   `DEFAULT_CIRCUIT_MATRIX` (finalCircuitScoring.ts, nombres lógicos), plantillas de tramos
   (etlSegmentTiming.ts), `kpiCircuitMatrix.ts`, patrones de cámara de `realCommitteePipeline.ts`,
   listas de cámaras de `eventNormalization.ts`, `sectorProfiles.mjs`, `liveOperationalCatalog.ts`
   y `sanLorenzoCameraCatalog.ts`. Deben derivarse de `nodoSur`.
2. **R3/R4:** el Excel manda `KEPPLER_2` → R4, pero en el modelo R4 es Silo Chief. ¿Keppler 2 es
   Silo Chief o falta un nodo Keppler 2?
3. **R27/R28:** el ETL los asigna por producto (girasol); en el modelo son Silo Australiano y Silo
   Keppler (transile de la vuelta). Definir si el circuito lo da la plataforma o el producto.
4. **R35:** existe en el modelo pero el ETL todavía no lo asigna (los ~22 camiones por semana que
   calan líquido en Ricardone y descargan en el puerto siguen como R8). Falta la regla Excel.
5. **SL1:** el alias técnico `CIRCUITO_SL_RECEPCION` (volcables del puerto) sigue apuntando a SL1;
   con la decisión 5, esos camiones son la pata SL de R7/transiles.
6. Re-correr las demás ventanas guardadas (v16 → v17). Las imágenes PNG de `imagenes/` son de la
   versión anterior del modelo.
