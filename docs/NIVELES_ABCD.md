# Modelo de niveles A → B → C → D → E (v14)

> La ley del modelo de datos. Toda pregunta de negocio se responde con una tabla
> de este árbol. Lo que no está acá es derivado o insumo, y no es fuente de verdad.

## El árbol

```
A  movimientos_contrato          Excel de contrato        data/movimientos/<día>/movimientos.json
B  truckflow_events              eventos de cámara        data/truckflow/<día>/event-list.json
                │
                ▼
C  operaciones                   A × B  — el nodo fuerte
   ├── C_operaciones_con_camara      el movimiento tiene evidencia de cámara
   └── C_operaciones_sin_camara      no la tiene, con el motivo a la vista
                │
                ▼
D  circuitos                     partición del universo que C cita
   ├── D_circuitos_validos           COMPLETO + DEDUCIDO
   ├── D_circuitos_anomalos          comportamiento anómalo afirmable
   ├── D_circuitos_incompletos       cobertura insuficiente
   ├── D_camiones_sin_contrato       la cámara lo vio, el Excel no lo tiene
   └── D_descartados                 residuo: sin evidencia para afirmar nada
                │
                ▼
E  kpi                           D × C
   ├── E_kpi_circuito                agregado por circuito
   └── E_kpi_operacion               detalle por operación
```

**Regla de dependencia:** cada nivel se construye sólo desde el anterior. Nadie
saltea. Si una pregunta necesita saltar un nivel, el modelo está mal, no la
pregunta.

## Reglas de negocio

### 1. Tiempos: los da la cámara

Truckflow es la fuente de los tiempos. El Excel es **sólo respaldo** cuando falta
cobertura de cámara. La resolución pasa en C, y cada fila declara qué usó:

| `time_source` | Significado |
|---|---|
| `CAMARA` | Ambos extremos los dio la cámara |
| `CAMARA_PARCIAL_EXCEL` | Un extremo de cámara, el otro del Excel |
| `EXCEL_RESPALDO` | Sin cobertura utilizable: ambos del Excel |
| `SIN_TIEMPO` | Ni cámara ni Excel tienen horas válidas |

E publica `porcentaje_camara_pura` por circuito: una mediana sostenida en 80% de
respaldo Excel no significa lo mismo que una sostenida en cámara, y quien la lee
tiene que poder verlo sin abrir otra tabla.

### 2. Precedencia en D

```
ANOMALO  >  INCOMPLETO  >  DEDUCIDO  >  COMPLETO
```

Un recorrido con anomalía afirmable **no puede** salir COMPLETO. En v13 sí podía:
había 52 journeys que eran COMPLETO y BEHAVIORAL a la vez, alimentando los KPI de
logística como si fueran limpios.

### 3. Umbral de evidencia: más de 3 lecturas

Para afirmar un comportamiento anómalo o declarar un camión sin contrato hacen
falta **más de 3 eventos de cámara**. Con 3 o menos no se puede afirmar nada, y
decirlo es más honesto que contarlo. Los que no llegan van a `D_descartados` con
el motivo.

Excepción: `executive_bucket = ANOMALO` entra siempre — ya es un veredicto del ETL.

### 4. Llave única de journey

Un solo `journey_key` canónico, compartido por C, D y E. Hay **tres formatos** de
uid conviviendo en el ETL, y confundirlos costaba caro:

| Formato | Ejemplo | Origen |
|---|---|---|
| crudo | `d50b1d90-9f05-4458-a599-631f0127070f` | journey reconstruido |
| fusionado | `merged_329523c2-a2d__c7c3fe96-fa2` | dos journeys unidos, 12 chars por parte |
| **ciclo** | `c4a26b1a-9532-…__cycle_2` | vueltas del mismo camión, hasta 7 por semana |

El formato de ciclo no estaba documentado. Truncar el uid a 12 caracteres —que
es lo que hacía todo consumidor para religar— colapsaba las 7 vueltas de un
camión en una sola llave: **205 recorridos de 2.384 se perdían en silencio.**

`canonicalJourneyKey()` preserva la vuelta y ordena las partes de un fusionado,
así que `merged_B__A` y `merged_A__B` son la misma llave. Nadie más parte strings.

Cuando el Excel cita un uid crudo que corresponde a varias vueltas, C desempata
por **solape temporal** con la ventana de la operación. Tomar todas las vueltas
daría una duración igual al día entero.

## Invariantes

Se verifican en cada corrida y quedan en `manifest.json → output.niveles`. Una
corrida que los rompe no es publicable.

1. **C cubre todo el Excel** — `con_camara + sin_camara = filas de A`.
2. **D es una partición** — los cinco archivos suman el universo y ninguna llave
   aparece en dos.
3. **C no cita journeys fuera de D** — la fisura de v13: C citaba 1.828 prefijos
   que ningún recorrido respaldaba.
4. **Llave canónica estable** — toda llave citada ya es su forma canónica.

## Números de referencia (2026-07-13 → 2026-07-19)

| Nivel | Tabla | Filas |
|---|---|---|
| A | movimientos de Excel | 4.215 |
| B | eventos de cámara | 24.077 |
| C | `C_operaciones_con_camara` | **3.281** |
| C | `C_operaciones_sin_camara` | 934 |
| D | `D_circuitos_validos` | **1.001** |
| D | `D_circuitos_anomalos` | 214 |
| D | `D_circuitos_incompletos` | 1.290 (357 absorbidos) |
| D | `D_camiones_sin_contrato` | 82 |
| D | `D_descartados` | 2.611 |
| E | circuitos con KPI | 7 · 100% cámara pura |

Congelados en `src/etl-core/levels/levels.test.ts`. Si cambian, cambió el modelo:
hay que explicar por qué, no ajustar el test.

## Formato

**CSV es el formato canónico** en `runs/windows/<id>/tables/`. Se escribe también
un espejo `.json` porque el endpoint de tablas y el front ya consumen esa forma
(y devuelven todo como string, así que no se pierde tipado que existiera).

## Cómo se regenera

Los niveles son una reorganización determinística de lo que la corrida ya
produjo, así que se pueden reconstruir sin reprocesar el ETL:

```bash
npx tsx scripts/build-levels.ts --all           # las 13 ventanas
npx tsx scripts/build-levels.ts --run 2026-07-13_2026-07-19
npx tsx scripts/build-levels.ts --all --check   # verifica sin escribir
```

Sale con código 1 si algún invariante falla. Las corridas nuevas los generan
solas: `run-etl-headless.ts` llama a `persistLevels()` después de persistir las
tablas.

## Qué pasa con las 28 tablas de v13

Siguen escribiéndose. Cambia su estatus: son **insumo del modelo** (las cuatro que
alimentan los niveles) o **derivadas** (el resto). Ninguna es fuente de verdad
para una pregunta de negocio.

| Tabla v13 | Rol en v14 |
|---|---|
| `excel_operations_with_truckflow` | insumo de C |
| `final_circuits` | insumo de D |
| `clean_journeys_for_analysis` | insumo de D (absorción de huérfanos) |
| `journey_timeline` | insumo (conteo de eventos, timeline por punto) |
| `circuit_timing_summary` / `_journeys` | reemplazadas por E |
| `merged_truckflow_movimientos` | derivada — **nunca** para contar |
| `debug_matrix_classification` | derivada — taxonomía intermedia |
| resto | derivadas |

## Patas del recorrido

E publica las tres patas (Ricardone / puente / San Lorenzo) por circuito
(`ric_media_min`, `ric_p90_min`, `ric_n`, y sus equivalentes `bridge_*` y `sl_*`)
y por operación (`ric_min`, `bridge_min`, `sl_min`). Salen de
`circuit_timing_journeys`, **re-llaveadas a `journey_key`**: esa tabla usa la
forma vieja `merged_A__B`, que contra la llave canónica daba cero coincidencias.
Ningún consumidor joinea ya contra el uid viejo.

La `n` baja tramo a tramo (R7: ric 651, puente 32, SL 0) porque la cámara no
cubre todo el recorrido. Es real y se muestra; no se rellena.

## Pendiente

- Los **357 recorridos absorbidos** entran a `D_circuitos_incompletos` con
  `clasificacion = NO_CLASIFICADO`: el Tramo 2 nunca los clasificó y no se les
  inventa un bucket. Correr la clasificación sobre ellos los movería a D o D',
  y es la mejora de mayor rendimiento pendiente.
- `D_descartados` tiene 2.611 filas en la ventana de referencia, casi todas
  journeys citados por C con ≤3 lecturas. Vale revisar si el umbral de 3 es el
  correcto para todos los circuitos o debería depender del largo esperado.
