# Reglas ETL — `etl_transform_v9`

Versión declarada en código: `ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v9'`  
(`src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts`)

Documento de referencia operativa para comité y transform. El contrato de salida Power BI sigue en [`ETL_POWER_BI_CONTRACT.md`](./ETL_POWER_BI_CONTRACT.md).

---

## 1. Resumen ejecutivo

`etl_transform_v9` clasifica **journeys** reconstruidos a partir de eventos y alertas Truckflow, con **dos capas**:

| Capa | Campo CSV | Valores |
|------|-----------|---------|
| **Técnica (matriz)** | `matrix_final_status` | `COMPLETO` · `DEDUCIDO` · `INCOMPLETO` · `ANOMALO` |
| **Ejecutiva (comité)** | `executive_status` | `VALIDO` · `PROBABLE` · `INCOMPLETO` · `ANOMALO` · `NO_EVALUABLE` |

Novedades respecto a versiones anteriores:

- **v7:** capa `PROBABLE`, inferencia sólida `RS_REC` / `RS_DESP`, fix líquido vs sólido, merge automático de fragmentos.
- **v8:** catálogo San Lorenzo (apoyo, no reemplaza Ricardone).
- **v9:** catálogo SL **corregido** (12 cámaras reales), secuencia R7 `S0→S1→S5→S7`, balanza SL = ingreso + **salida** (`SL_BALANZA_SALIDA`).

---

## 2. Flujo del pipeline

```
Eventos + alertas Truckflow
  → Paso 1: separar frontales / traseras (etlRearDevices)
  → Reconstrucción de journeys (patente + ventana temporal)
  → Candidatos merge (debug) + merge ejecutivo automático (etlJourneyMerge)
  → Clasificación técnica (DEFAULT_CIRCUIT_MATRIX + preliminaryCircuitCode)
  → Resolución circuito ejecutivo R* (EXECUTIVE_CIRCUIT_MATRIX)
  → Decisión ejecutiva (VALIDO / PROBABLE / …)
  → Apoyo San Lorenzo (etlSanLorenzoSupport) — solo refuerza, no reclasifica matriz Ricardone
  → Cruce alertas operativas (INVALID_ROUTE, INVALID_START_JOURNEY, …)
  → CSV finales + pb_* para Power BI
```

---

## 3. Paso 1 — Eventos y alertas frontales vs traseros

**Fuente única:** `src/features/real-truckflow/etlWorkbench/etlRearDevices.ts`

### Cámaras traseras Ricardone (excluidas del frente ETL)

- `RicIngCamTrasera`, `RicEgrCamTraser`
- `RicPreIngInTr`, `RicPreIngEgTr`
- `RicB1Egreso`, `RicB2Ingreso`, `RicB3Egreso`

### Cámaras traseras San Lorenzo (del catálogo)

- `SLZIngCamTrasera`
- `SLZBalIngTras`
- `SLZBalSC1Tras`, `SLZBalSC2Tras`
- `SLZSalidaC1Tras`, `SLZSalidaC2Tras`

**Regla:** solo eventos/alertas **frontales** entran en reconstrucción, matriz y capa ejecutiva. Las traseras van a CSV `rear_*` (debug).

### Alertas LPR

- `alertCode === 'LPR_MALFUNCTION'` → diagnóstico LPR (`pb_camera_lpr_analysis`), **no** alerta operativa.
- Todo lo demás (frontal) → alerta operativa candidata a cruce.

---

## 4. Merge de journeys fragmentados

**Archivo:** `etlJourneyMerge.ts` (aplicado en pipeline **antes** de clasificar).

### Candidatos (debug: `journey_merge_candidates.csv`)

| Parámetro | Valor |
|-----------|-------|
| Gap máximo entre journeys | **240 min (4 h)** — espera típica en calada/playa |
| Similitud patente mínima | **0,80** |
| Top candidatos exportados | **500** |

Tipos de match: `exact_plate` · `similar_plate` · `sequence_and_plate`.

### Merge automático (productivo)

Se **aplican** merges con **todas** estas condiciones:

| Condición | Valor |
|-----------|-------|
| `gapMinutes` | **≤ 240 (4 h)** |
| `priority` | `alta` |
| `should_review` | `false` |
| Tipo | **`exact_plate`** **o** **`sequence_and_plate`** con similitud OCR **≥ 0,92** |

- **`exact_plate`:** misma patente tras `normalizePlateStrict`.
- **`sequence_and_plate`:** patente similar (≥ 0,80 candidato, ≥ 0,92 auto) **y** secuencias lógicas complementarias (fragmentos encadenables).
- **`similar_plate`** sin secuencia complementaria: solo CSV debug, **no** auto-merge.

Constantes: `EXECUTIVE_MERGE_AUTO_GAP_MINUTES`, `EXECUTIVE_MERGE_OCR_AUTO_SIM` en `etlJourneyMerge.ts`.

Fragmentos residuales con **≤ 2 eventos** y **sin egreso operativo** → comité **`FRAGMENTO_SIN_CIERRE_OPERATIVO`** (ANOMALÍAS).

Los journeys fusionados reciben `journeyUid` prefijo `merged_`.

---

## 5. Capa técnica — Matriz de puntos lógicos

**Archivo:** `finalCircuitScoring.ts` → `DEFAULT_CIRCUIT_MATRIX`

Evalúa secuencia de **puntos lógicos Ricardone** (`INGRESO`, `PREINGRESO`, `CALADA`, `BALANZA_INGRESO`, …) colapsando repeticiones consecutivas.

| `matrix_final_status` | Significado |
|----------------------|-------------|
| `COMPLETO` | Todos los puntos esperados del circuito técnico presentes |
| `DEDUCIDO` | Secuencia respetada con huecos (puntos faltantes) |
| `INCOMPLETO` | Eventos insuficientes o secuencia no concluyente |
| `ANOMALO` | Secuencia ilógica / no respeta orden |

---

## 6. Capa ejecutiva — Estados y motivos

### Estados (`executive_status`)

| Estado | Uso en comité |
|--------|----------------|
| **VALIDO** | Circuito con matriz `COMPLETO` o `DEDUCIDO` y cobertura OK |
| **PROBABLE** | Inferido (sólidos `RS_*`, apoyo SL, secuencia sin matriz completa) |
| **INCOMPLETO** | Matriz `INCOMPLETO` — faltan eventos o ingreso/egreso operativo |
| **ANOMALO** | Matriz `ANOMALO` con circuito habilitado |
| **NO_EVALUABLE** | Sin secuencia configurada, cobertura &lt; 60 %, sin punto fuerte, o `SIN_PUNTO` |

### Reglas de elegibilidad ejecutiva

Un circuito R* es evaluable como `VALIDO` solo si:

1. Tiene **secuencia configurada** (`baseSequence` o `allowedSequences`).
2. `coveragePercent ≥ 60` **y** `hasStrongPoint === true` en su config.
3. Matriz = `COMPLETO` → `executive_reason = CIRCUITO_COMPLETO`, `valid_detail = COMPLETO`.
4. Matriz = `DEDUCIDO` → `executive_reason = CIRCUITO_DEDUCIDO_VALIDO`, `valid_detail = DEDUCIDO`.

Si no hay secuencia: `NO_EVALUABLE` + `CONFIG_ERROR_MISSING_SEQUENCE`.  
Si cobertura/punto fuerte fallan: `NO_EVALUABLE` + `CIRCUITO_NO_EVALUABLE_POR_COBERTURA`.

### Ingreso / egreso operativo

- **Ingreso:** presencia de `INGRESO` y/o `PREINGRESO` en secuencia lógica.
- **Egreso:** presencia de `EGRESO`, `BALANZA_EGRESO`, o dispositivo `RicB2Egreso`.

---

## 7. Líquido vs sólido (regla crítica)

**Líquido solo si pasó por `RicCalLiq`.** Sin esa cámara → se trata como **sólido**.

| Patrón en secuencia lógica | Circuito ejecutivo | Condición extra |
|----------------------------|-------------------|-----------------|
| Calada **antes** balanza ingreso | **R8** recepción líquida | `RicCalLiq` presente |
| Balanza ingreso **y** egreso **antes** de calada | **R16** despacho líquido | `RicCalLiq` presente |
| Calada → balanzas **sin** segunda calada tras balanza egreso, **sin** `RicCalLiq` | **RS_REC** | recepción sólida inferida |
| Calada → balanzas → **segunda calada** (antes de egreso), **sin** `RicCalLiq` | **RS_DESP** | despacho sólido inferido |
| Sin patrón claro | **SIN_PUNTO** | → `NO_EVALUABLE` |

Código técnico `DESPACHO_SIN_PUNTO_INSTRUMENTADO` se resuelve con `inferSolidExecutiveCircuit()` (RS_REC / RS_DESP / SIN_PUNTO).

### PROBABLE para sólidos inferidos (`RS_REC` / `RS_DESP`)

Si `frontEventCount ≥ 4` **y** hay ingreso **y** egreso operativo → `PROBABLE` + `CIRCUITO_PROBABLE_INFERIDO`.  
Si no → permanece `INCOMPLETO`.

---

## 8. Matriz ejecutiva de circuitos (R*)

**Archivo:** `finalCircuitScoring.ts` → `EXECUTIVE_CIRCUIT_MATRIX`

| Código | Etiqueta | Cobertura | Punto fuerte | Alias técnico |
|--------|----------|-----------|--------------|---------------|
| **R1** | Recepción Celda 16 | 67 % | Sí | `CIRCUITO_CELDA16_DESCARGA` |
| **R5** | Recepción Volcable 1 | 67 % | Sí | `CIRCUITO_VOLCABLE_1_2` (sin RicVolcable2) |
| **R6** | Recepción Volcable 2 | 67 % | Sí | `CIRCUITO_VOLCABLE_1_2` (con RicVolcable2) |
| **R7** | Recepción / derivación San Lorenzo | 80 % | Sí | `CIRCUITO_SAN_LORENZO` |
| **R8** | Recepción Mercadería Líquida | 63 % | Sí | — (por patrón RicCalLiq) |
| **R9** | Despacho Celda 16 | 78 % | Sí | `CIRCUITO_CELDA16_CARGA` |
| **R16** | Despacho Mercadería Líquida | 75 % | Sí | — (por patrón RicCalLiq) |
| **R19** | Transile C16 Volcable 1 | 67 % | Sí | `TRANSILE_VOLCABLE_BALANZA` |
| **R20** | Transile C16 Volcable 2 | 67 % | Sí | `TRANSILE_VOLCABLE_BALANZA` |
| **R26** | Transile externo C16 SLZ | 60 % | Sí | — |
| **R34** | Transile externo Líquidos SLZ 2 | 64 % | Sí | — |
| **RS_REC** | Recepción sólida inferida | 50 % | No | calada → balanzas (sin 2.ª calada) |
| **RS_DESP** | Despacho sólido inferido | 50 % | No | calada → balanzas → calada |
| **SIN_PUNTO** | Sin punto instrumentado | 0 % | No | no clasificable |

### Secuencia R7 (San Lorenzo) — v9

**Base instalada hoy:** `S0 → S1 → S5 → S7`

Variantes permitidas (incluyen sectores planificados S2/S3 aún no instalados):

- `S0, S1, S3`
- `S0, S1, S5, S7`
- `S0, S1, ESPERA, S5, S7`
- `S0, S2, S1, S5, S7`

---

## 9. Catálogo San Lorenzo (12 cámaras)

**Fuente única:** `src/data/sanLorenzoCameraCatalog.ts`

### Instaladas (frontales ETL + puntos fuertes)

| Sector | deviceCode | sectorCode Truckflow | Punto lógico | Punto fuerte |
|--------|------------|----------------------|--------------|--------------|
| **S0** Ingreso | `SLZIngCamFrente` | `PUERTO_SAN_LORENZO_INGRESO_CAMIONES` | `SL_INGRESO` | Sí |
| **S1** Balanza ingreso | `SLZBalIngFte` (+ alias `slzbalingfte`) | `PUERTO_SAN_LORENZO_BALANZA_INGRESO` | `SL_BALANZA_INGRESO` | Sí |
| **S5** Balanza salida | `SLZBalSC1Fte`, `SLZBalSC2Fte` | `PUERTO_SAN_LORENZO_BALANZA_SALIDA` | `SL_BALANZA_SALIDA` | Sí |
| **S7** Egreso | `SLZSalidaC1Fte`, `SLZSalidaC2Fte` | `PUERTO_SAN_LORENZO_EGRESO_CAMIONES` | `SL_EGRESO` | Sí |

### Traseras (excluidas ETL, solo debug/rear CSV)

`SLZIngCamTrasera`, `SLZBalIngTras`, `SLZBalSC1Tras`, `SLZBalSC2Tras`, `SLZSalidaC1Tras`, `SLZSalidaC2Tras`

### Planificadas, no instaladas (`installed: false`)

| Sector | deviceCode | Punto lógico |
|--------|------------|--------------|
| S2 Calada | `SLZCalCam` | `SL_CALADA` |
| S3 Enlace | `SLZEnlace31Cam` | `SL_ENLACE` |
| S4 Descarga | `SLZDescCam` | `SL_DESCARGA` |

Eventos de cámaras `installed: false` **no** cuentan en apoyo SL.

---

## 10. Apoyo ejecutivo San Lorenzo

**Archivo:** `etlSanLorenzoSupport.ts`  
**Principio:** refuerza la decisión Ricardone; **no** cambia el circuito asignado ni la matriz técnica.

### Corroboración SL (`hasSlCorroboration`)

Verdadero si cualquiera:

- `SL_INGRESO` + al menos **2** puntos SL distintos en el journey, **o**
- al menos un **punto fuerte** SL instalado, **o**
- balanza SL completa: `SL_BALANZA_INGRESO` + `SL_BALANZA_SALIDA`

### Refuerzos por circuito

| Circuito | De → A | Condiciones | `executive_reason` |
|----------|--------|-------------|-------------------|
| **R7** | INCOMPLETO → PROBABLE | corroboración SL + ingreso SL + ≥ 2 puntos SL | `SL_CORROBORACION_R7` |
| **R7** | INCOMPLETO/PROBABLE → VALIDO | punto fuerte SL + ingreso operativo Ricardone | `SL_PUNTO_FUERTE_R7` |
| **RS_REC / RS_DESP** | INCOMPLETO → PROBABLE | corroboración SL + ≥ 3 eventos frontales | `SL_CORROBORACION_SOLIDO` |
| **RS_REC / RS_DESP** | PROBABLE → VALIDO | balanza SL completa + ingreso y egreso operativo | `SL_BALANZA_COMPLETA_SOLIDO` |
| **Cualquiera** | NO_EVALUABLE → PROBABLE | corroboración SL + ≥ 4 eventos frontales + ingreso operativo | `SL_CORROBORACION_GENERICO` |

### Columnas debug en `debug_matrix_classification.csv`

- `sl_support_points`
- `sl_support_strong_points`
- `sl_support_corroboration` (`yes` / `no`)

### Métricas en `transform_summary` / UI Transform

- `sl_front_events`
- `sl_journeys_corroboration`
- `sl_journeys_executive_reinforced` (motivos `SL_*`)

---

## 11. Cruce alertas operativas

Alertas frontales (≠ `LPR_MALFUNCTION`) se cruzan con journeys por:

- `journey_uid_exact`
- `plate_sector_device_time`
- `plate_sector_time`
- `plate_within_journey_window`

Códigos especiales documentados:

| Código API | Efecto en journey |
|------------|-------------------|
| `INVALID_ROUTE` | `hasInvalidRoute` |
| `INVALID_START_JOURNEY` | `hasInvalidJourneyStart` |

Campos en `pb_final_circuits.csv`: ver [`ETL_POWER_BI_CONTRACT.md`](./ETL_POWER_BI_CONTRACT.md).

---

## 12. Archivos fuente (mapa rápido)

| Regla | Archivo |
|-------|---------|
| Versión + pipeline | `etlTransformPipeline.ts` |
| Matriz R*, líquido/sólido, estados ejecutivos | `finalCircuitScoring.ts` |
| Merge automático | `etlJourneyMerge.ts` |
| Traseras | `etlRearDevices.ts` |
| Catálogo SL | `sanLorenzoCameraCatalog.ts` |
| Apoyo SL | `etlSanLorenzoSupport.ts` |
| Sectores / normalización | `realSectorCodeMap.ts`, `realEventNormalization.ts` |
| Export Power BI | `powerBiLoad.ts`, `powerBiCommitteeExecutive.ts` |
| Contrato salida | `ETL_POWER_BI_CONTRACT.md` |

---

## 13. Tests de regresión

- `finalCircuitScoring.test.ts` — matriz, líquido/sólido, R7, PROBABLE
- `etlSanLorenzoSupport.test.ts` — catálogo SL y refuerzos ejecutivos
- `powerBiLoad.test.ts` — columnas pb_*

Ejecutar:

```bash
npm test -- --run src/features/real-truckflow/etlWorkbench/finalCircuitScoring.test.ts src/features/real-truckflow/etlWorkbench/etlSanLorenzoSupport.test.ts
```

---

## 14. Nota operativa — datos Truckflow San Lorenzo

El ETL **no filtra** sectores SL distintos al ingreso. Si en planta solo llegan eventos `SLZIngCamFrente` / `PUERTO_SAN_LORENZO_INGRESO_CAMIONES`, el apoyo SL opera con la evidencia disponible; balanza y egreso SL requieren que Truckflow publique esos `deviceCode` y `sectorCode`.

Validación en consola en vivo: panel **「Diagnóstico API · sectorCode · deviceCode」** (`LiveCameraMonitor.tsx`).

---

## 15. Addendum `etl_transform_v10` — clasificación comité (3 categorías)

Versión en código: `ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v10'`

### 15.1 Categorías comité

| `committee_group` | Incluye (mapeo) |
|-------------------|-----------------|
| **COMPLETOS** | `matrix_final_status` COMPLETO o DEDUCIDO; `executive_status` VALIDO; reconstrucción con evidencia suficiente |
| **VARIACIONES_OPERATIVAS** | Secuencia contemplada en matriz S\* (`allowedSequences`) o R7: `ESPERA_EN_CALADA`, `DOBLE_PREINGRESO` |
| **ANOMALIAS** | INCOMPLETO, ANOMALO, NO_EVALUABLE, NO_DIFERENCIABLE, **SIN_PUNTO**, fragmentos, SL interno pendiente |

**Regla clave:** DEDUCIDO → COMPLETOS (no a variaciones).

### 15.2 San Lorenzo — ruta R7 vs circuito interno

`ETL_SL_EXECUTIVE_SUPPORT_ENABLED = false` y `ETL_SL_INTERNAL_CLASSIFICATION_ENABLED = false` en `etlSanLorenzoSupport.ts`.

- **R7 (ruta Ric→SL)** sigue activo: preliminar `CIRCUITO_SAN_LORENZO` → circuito ejecutivo **R7** con matriz lógica `INGRESO / PREINGRESO / CALADA / EGRESO`.
- **Circuito interno SL** (secuencia S0→S1→S5→S7, cámaras S1/S5/S7) **no** se evalúa esta semana.
- **No** se aplica el bloque comité `CAMARAS_SLZ_S1_S5_S7_PENDIENTES` masivo sobre la ruta R7.
- Ingreso SLZ queda como **corroboración** (punto fuerte) para deducción; apoyo ejecutivo SL desactivado.

Cuando se reactive SL interno, además de la ruta R7 se volverá a evaluar el cierre de planta SL con secuencia S*.

### 15.3 Orden de clasificación comité

Implementado en `committeeClassification.ts` → `resolveCommitteeClassification()`.

### 15.4 Archivos nuevos / modificados v10

| Componente | Archivo |
|----------|---------|
| Clasificación comité | `committeeClassification.ts` |
| Apoyo SL desactivado | `etlSanLorenzoSupport.ts` |
| Pipeline + columnas CSV | `etlTransformPipeline.ts` |
| Export pb_* | `powerBiCommitteeExecutive.ts`, `powerBiLoad.ts` |

### 15.5 Tests v10

- `committeeClassification.test.ts` (14 casos)
- `etlSanLorenzoSupport.test.ts` (apoyo desactivado)
- `powerBiLoad.test.ts` (columnas `committee_*`)

```bash
npm test -- --run src/features/real-truckflow/etlWorkbench/committeeClassification.test.ts src/features/real-truckflow/etlWorkbench/etlSanLorenzoSupport.test.ts src/features/real-truckflow/etlWorkbench/powerBiLoad.test.ts
```

### 15.6 Variaciones operativas vs anomalías (acordado comité)

**Principio:** variación = circuito reconocido + desvío contemplado + cierre operativo. Anomalía = todo lo demás con motivo explícito.

| Ámbito | COMPLETOS | VARIACIONES_OPERATIVAS | ANOMALÍAS |
|--------|-----------|------------------------|-----------|
| **R1/R5/R6/R9… (S\*)** | Matriz COMPLETO/DEDUCIDO con evidencia | Recalado, espera playa, doble S4, loop S6/S7, etc. (`allowedSequences`) | Secuencia no contemplada, incompleto |
| **R7 Ric→SL** | Ingreso + cierre Ric **o** ingreso SLZ; calada omitida OK; deducido con evidencia | `ESPERA_EN_CALADA` (≥4 h entre calada y egreso, **sin** ingreso SLZ) | Sin cierre, fragmento |
| **R7 + ingreso SLZ tras espera calada** | COMPLETO (ruta San Lorenzo, no rechazo) | — | — |
| **RS_REC / RS_DESP** | Patrón claro o DEDUCIDO con calada+egreso | — (solo S\* en instrumentados) | Orden sin patrón |
| **SIN_PUNTO** | — | — | Siempre `NO_DIFERENCIABLE` (aunque haya ≥4 eventos) |
| **Fragmentos** | — | — | ≤2 evt sin egreso → `FRAGMENTO_SIN_CIERRE_OPERATIVO` |

**R7 — reglas lógicas (excepción acotada a ruta Ric→SL):**

| Señal | Comité |
|-------|--------|
| Sin calada, ingreso+preingreso+egreso (± SL ingreso) | **COMPLETO** |
| Sin egreso Ric, con ingreso SLZ | **COMPLETO** (cierre SLZ) |
| Espera calada ≥ **240 min**, sin SL ingreso, con egreso Ric | **VARIACIÓN** `ESPERA_EN_CALADA` |
| Espera calada ≥ 240 min **con** SL ingreso | **COMPLETO** (Ric→SL) |
| Doble PREINGRESO ≥ **5 min** y circuito continúa | **VARIACIÓN** `DOBLE_PREINGRESO` |
| Doble PREINGRESO &lt; 5 min | Ruido Truckflow (colapsar en secuencia, no variación) |

**No implementado:** `RECHAZO_OPERATIVO` (sin herramientas de detección aún).

**Reglas mantenidas:** variación detectada + cierre operativo → **VARIACIONES** (prioridad sobre COMPLETO/DEDUCIDO). Variaciones en sectores **S\*** para circuitos instrumentados; R7 usa reglas lógicas acotadas arriba.
