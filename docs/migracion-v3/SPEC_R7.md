# R7 — Especificación funcional (para reescritura limpia)

> Extraída del código v2 y **validada contra datos reales** de la ventana
> `2026-07-13 .. 2026-07-19` (4.215 movimientos Excel, 24.077 eventos de cámara).
> Fecha: 2026-07-28.
>
> **Este documento NO describe la implementación actual: describe qué ES R7.**
> Es el insumo para escribirlo de cero. Cuando el código v3 y este documento
> discrepen, gana este documento (y si el documento está mal, se corrige acá primero).

---

## 1. Qué es R7 en términos de negocio

**Camión que ingresa por Ricardone y descarga soja en los volcables del puerto de
San Lorenzo (Terminal de Embarque).**

Es un circuito **inter-planta**: arranca en Ricardone y termina en San Lorenzo. Eso lo hace
distinto de todos los demás — los otros circuitos viven en una sola planta. De ahí salen
casi todas sus particularidades: el tramo "puente" entre plantas, la cobertura de cámara
incompleta, y el solapamiento con SL1.

**Es el circuito más importante del sistema por volumen:**

| Métrica | Valor | % del total |
|---|---|---|
| Movimientos Excel R7 | **2.481** | 59% de 4.215 |
| Journeys de cámara clasificados R7 | **1.544** | 65% de 2.384 |

> ⚠️ **Los dos números no son comparables** y la diferencia (~940) no es un error: son
> denominadores distintos. Ver §6.

---

## 2. La regla de decisión (lo que sorprende)

R7 **no se decide por la secuencia de cámaras. Se decide por la plataforma del Excel.**

En los datos reales, el 100% de los R7 se resolvió con `resolution_source = EXCEL_PLATFORM_PRODUCT`.
Ni un solo caso se resolvió por ruta de cámara.

### 2.1 Regla primaria (Excel → R7)

```
plataforma normalizada empieza con "VOLCABLE_PTO_"   →  R7
   (o la plataforma original matchea /VOLCABLE\s+PTO/)
```

Y nada más. **No exige planta, ni producto, ni tipo de movimiento.** Distribución real:

| `platform_normalized` | Movimientos |
|---|---|
| `VOLCABLE_PTO_3` | 956 |
| `VOLCABLE_PTO_2` | 774 |
| `VOLCABLE_PTO_5` | 746 |
| `VOLCABLE_PTO_4` | **5** |

> `VOLCABLE_PTO_4` con 5 movimientos contra ~800 de sus hermanos: o es una plataforma que
> casi no se usa, o son cargas mal tipeadas. **Decisión pendiente** (§8.1).

**Ojo con la colisión de nombres:** `VOLCABLE_PTO_*` (puerto San Lorenzo → R7) es una
plataforma **distinta** de `VOLCABLE_1/2` (Ricardone → R5/R6). Sólo las distingue el sufijo
`PTO`. Es una trampa evidente para una reescritura; en v3 los nombres deben ser
inequívocos (`SL_VOLCABLE_3` vs `RIC_VOLCABLE_1`).

### 2.2 Perfil real de un R7 (uniformidad casi total)

| Campo | Valor observado |
|---|---|
| `movement_type` | `INGRESO` — **2.481 / 2.481 (100%)** |
| `planta_normalized` | `TERMINAL_EMBARQUE` — **2.481 / 2.481 (100%)** |
| `product_normalized` | `SOJA` 2.476 (99,8%) · `PELLETS GIRASOL` **5** (0,2%) |

Los 5 de `PELLETS GIRASOL` contradicen "R7 = ruta de soja". **Decisión pendiente** (§8.2).

### 2.3 Evidencia de cámara (secundaria, y débil)

Secuencia técnica esperada (`S0 → S1 → S2 → S3` = Ricardone), con variantes aceptadas:

```
S0 S1 S2 S3        (base)
S0 S1 S3           (sin S2)
S0 S1 ESPERA S3    (con espera)
S0 S2 S1 S3        (S1/S2 invertidos)
```

Si además aparece la cadena extendida de San Lorenzo (`SL_BALANZA_INGRESO`, `SL_CALADA`,
`SL_DESCARGA` o `SL_EGRESO`), el circuito técnico es **`CIRCUITO_R7_MIXTO`** en lugar de
`CIRCUITO_SAN_LORENZO`. Cobertura de cámara declarada: **80%**.

**Pero en la práctica la ruta casi nunca valida:**

| `route_quality` | Movimientos | |
|---|---|---|
| `ROUTE_NO_EVALUABLE` | 2.194 | **88%** |
| `ROUTE_UNKNOWN` | 221 | 9% |
| `ROUTE_NO_DISCHARGE_POINT` | 66 | 3% |

Y la calidad de cruce Excel↔cámara:

| `match_quality` | Movimientos | |
|---|---|---|
| `EXTERNAL_MATCH_FRAGMENTED` | 1.359 | 55% |
| `EXTERNAL_MATCH_EXACT` | 717 | 29% |
| `NO_TRUCKFLOW_EVIDENCE` | 221 | 9% |
| `EXTERNAL_MATCH_PROBABLE` | 183 | 7% |
| `EXTERNAL_MATCH_WIDE_WINDOW` | 1 | — |

> **Conclusión para v3:** R7 es un circuito **dirigido por Excel con confirmación de cámara
> opcional y habitualmente parcial**. Cualquier diseño que exija secuencia completa de
> cámaras para clasificar R7 va a perder ~90% de los casos. La cámara sirve para *tiempos* y
> *anomalías*, no para *decidir que es R7*.

---

## 3. Desambiguación R7 ↔ SL1 (el solapamiento real)

R7 y SL1 (Recepción interna San Lorenzo) **comparten cámaras de San Lorenzo**. La pregunta
es siempre la misma: *¿el camión venía de Ricardone, o ya estaba en San Lorenzo?*

Reglas, en orden:

1. **Es R7** si: hay `SL_INGRESO` **y** hay `INGRESO` o `PREINGRESO` (Ricardone),
   **y** no aparece ninguno de: `VOLCABLE`, `CELDA16_CARGA`, `CELDA16_DESCARGA`, `LIQUIDO`,
   `BALANZA_INGRESO`, `BALANZA_EGRESO`, `BALANZA`.
   *(Los bloqueadores indican una recepción Ricardone completa instrumentada — o sea, el
   camión descargó en Ricardone y nunca fue al puerto.)*
2. **No es SL1** si hay evidencia Ricardone (cámaras `Ric*`, o marcadores lógicos de
   Ricardone) y **no** hay `SL_INGRESO`. Un recorrido de Ricardone no puede etiquetarse
   como recepción interna de San Lorenzo.
3. **Es SL1** si: hay evidencia operativa de San Lorenzo, **cero** eventos de cámaras `Ric*`
   y cero marcadores lógicos de Ricardone, y al menos 2 eventos.
4. **Es transile (R26), no R7**, si aparece Celda 16 **y** `SL_INGRESO` **y** evidencia
   Ricardone: el orden relativo decide el sentido (C16 antes de SL → C16→SL;
   SL antes de C16 → SL→C16). El transile se evalúa **antes** que R7.
5. Sin evidencia suficiente para separar → **`NO_DIFERENCIABLE`** (no se fuerza).

**Guarda de producto:** los líquidos/aceite **nunca** son R7. R7 es ruta de sólidos. Hoy
esto se aplica con una segunda pasada correctiva; en v3 debe ser parte de la regla, no un
parche posterior.

---

## 4. Tiempos

Dos definiciones distintas que **no hay que confundir** (fue fuente de error):

### 4.1 Tiempo total puerta a puerta — desde Excel

```
tiempo_total = external_salida_at − external_ingreso_at      (ambos del Excel)
```

**No se calcula desde los eventos de cámara.** La cadena de cámaras corta en la última
cámara vista, que no es la salida real — subestima sistemáticamente.

Distribución real (n = 2.481; **los 2.481 tienen ambos timestamps**, cobertura 100%):

| | minutos | horas |
|---|---|---|
| p10 | 262 | 4,4 |
| p50 | **516** | **8,6** |
| p90 | 796 | 13,3 |
| máx | **1.810** | **30,2** |

> El máximo de 1.810 min **supera el tope de 1.440** (`MAX_DURATION_MINUTES`, 24 h) que hoy
> se usa para clampear. O sea: hay R7 reales que el clamp está recortando. **Decisión
> pendiente** (§8.3).

### 4.2 Tiempos por tramo — desde cámaras

Cuatro medidas, sobre eventos frontales ordenados:

| Tramo | Desde | Hasta |
|---|---|---|
| `ricDuration` | primer evento | primer `EGRESO` de Ricardone |
| `bridgeDuration` | `EGRESO` Ricardone | `SL_INGRESO` |
| `slDuration` | `SL_INGRESO` | último evento SL |
| `totalDuration` | primer evento | último evento |

Reglas: los instantes usan el **instante operativo** del evento (no el crudo); una duración
≤ 0 se descarta como 0; si el total es ≤ 0 no hay resultado. `bridgeDuration` sólo existe si
`SL_INGRESO` viene **después** del `EGRESO` de Ricardone.

> `totalDuration` (§4.2) **≠** `tiempo_total` (§4.1). El primero es "lo que vio la cámara",
> el segundo es "lo que duró la operación". En v3 deben tener nombres que no se puedan
> confundir: `camera_span_min` vs `operation_total_min`.

---

## 5. Bug encontrado en el código actual (no reproducir)

En `inferCircuitFromExternalMovimiento` hay una **rama muerta**:
[etlPlatformCircuitInference.ts:134](../../src/features/real-truckflow/etlWorkbench/etlPlatformCircuitInference.ts)

```ts
if (isSanLorenzoVolcablePtoPlatform(platform) || /VOLCABLE\s+PTO/.test(original)) {
  return circuitFromCode('R7', 'platform')          // ← línea ~96: siempre gana
}
// ...
if (plant === 'TERMINAL_EMBARQUE') {
  if (isSanLorenzoVolcablePtoPlatform(platform)) {
    return circuitFromCode('R7', 'platform')        // ← línea ~136: INALCANZABLE
  }
```

La segunda condición nunca puede ser verdadera. Es inocua (mismo resultado), pero sugiere que
alguien intentó exigir `planta = TERMINAL_EMBARQUE` para R7 y quedó a medias. **La
especificación real es la de §2.1: sólo plataforma.** Que el 100% de los datos tenga
`TERMINAL_EMBARQUE` es una consecuencia, no un requisito.

---

## 6. Denominadores (la regla que v3 debe hacer imposible de violar)

| Pregunta | Tabla correcta | Valor R7 |
|---|---|---|
| ¿Cuántos **movimientos** R7 hubo? | `excel_operations_with_truckflow` | **2.481** |
| ¿Cuántos **recorridos de cámara** R7? | `final_circuits` | **1.544** |
| ¿Cuánto **duró** un R7? | Excel: `salida − ingreso` | p50 = 516 min |

Nunca contar movimientos sobre `merged_truckflow_movimientos` ni sobre
`movimientos_without_truckflow_match`. En v3 esto no debe ser una regla escrita en un
`CLAUDE.md`: la tabla declara su `grain` y si es contable, y la herramienta lo dice sola.

---

## 7. Casos borde que los tests de v3 deben cubrir

Derivados de los datos reales, no inventados:

1. **Excel sin evidencia de cámara** (221 casos, 9%) → sigue siendo R7, con `route_quality`
   degradado. No se descarta.
2. **Match fragmentado** (1.359 casos, 55%) → el journey se parte en varios; el movimiento
   Excel es uno solo. Es el caso **mayoritario**, no la excepción.
3. **`VOLCABLE_PTO_4`** (5 casos) → plataforma casi sin uso.
4. **`PELLETS GIRASOL`** (5 casos) → producto que no es soja en ruta de soja.
5. **Duración > 24 h** (al menos 1 caso, 1.810 min) → excede el clamp actual.
6. **Ricardone completo sin ir al puerto** → tiene cámaras Ricardone pero no `SL_INGRESO`:
   **no es R7 ni SL1**.
7. **Transile C16 ↔ SL** → tiene `SL_INGRESO` y evidencia Ricardone pero también Celda 16:
   es **R26**, y se evalúa antes que R7.
8. **Líquido en plataforma de puerto** → nunca R7.

---

## 8. Decisiones que necesito antes de escribir el código

### 8.1 `VOLCABLE_PTO_4` — ¿plataforma real o error de carga?
5 movimientos contra ~800 de PTO_2/3/5. Si es error de carga, v3 debería marcarlo como
anomalía de datos en lugar de aceptarlo silenciosamente.

### 8.2 Los 5 `PELLETS GIRASOL` en R7 — ¿R7 acepta no-soja?
Opciones: (a) R7 es "cualquier sólido por volcable de puerto" y soja es sólo lo que más pasa;
(b) R7 es soja y esos 5 son un circuito distinto o un error. Cambia si la regla de producto
es un filtro o un atributo.

### 8.3 Tope de duración — ¿se clampea a 24 h o se reporta el real?
Hay R7 de 30 h. Clampear cambia el p90 y el promedio que se reportan a dirección.
Recomiendo: **guardar el valor real** y clampear sólo en la visualización, con una bandera
`excede_tope`. Así el KPI no miente y el gráfico no se rompe.

### 8.4 ¿La cáscara es TypeScript/Node?
Todo lo de acá es agnóstico al lenguaje, pero necesito saberlo para escribir el módulo.
También: ¿corre en un proceso Node plano, o hay framework (Nest/Fastify/Hono)?
