# Encargo v3 — Rediseño y reconstrucción de la interfaz de Truckflow

> Pegá este documento completo como prompt.
>
> **Qué cambió respecto de la v2**: ahora tenés libertad de diseño **y de
> desarrollo**, y el entregable no es un plan: es el software mejorado. El plan
> es un medio. Además se agrega una etapa obligatoria de **ingeniería de costos
> de tokens** antes de tocar nada.

---

## 0. Cómo quiero que trabajes

Esto es lo más importante del encargo. Leelo dos veces.

**Accioná.** Ya tuvimos documentos. Lo que necesito es la app mejor. Un plan
perfecto que no se ejecuta vale cero.

**El ciclo es siempre el mismo:**

1. **Triaje de costos** (§4). Antes de tocar nada, clasificá el trabajo en
   *mecánico* y *de criterio*, y estimá el costo en tokens de cada tarea.
2. **Lo de criterio lo hacés vos, ahora.** Todo lo que requiera decidir —
   dirección visual, jerarquía de información, arquitectura de componentes,
   estructura de navegación, cómo se rompe una pantalla eterna en algo usable —
   lo ejecutás vos, en código, en este repo.
3. **Lo mecánico lo dejás documentado**, no lo ejecutás. Una ficha por tarea, con
   el formato exacto de §4.2, para que después lo corra un agente barato. Cada
   ficha tiene que ser ejecutable sin criterio propio: si el que la ejecuta tiene
   que decidir algo, la ficha está mal escrita y la tarea no era mecánica.
4. **Verificá lo que hiciste.** Corré la app, miralas, sacá capturas. `npm test`
   y `npm run check:arch` tienen que pasar.
5. **Reportá** en el formato de §6.

**Si tenés que elegir entre hacer una tarea más o documentar mejor: hacela.**

---

## 1. El producto

Tablero de **trazabilidad de camiones** de la planta de Ricardone y el puerto de
San Lorenzo (Vicentin). Cruza lecturas de cámaras (Truckflow), el Excel de
movimientos por contrato y un ETL propio que reconstruye el recorrido de cada
camión y lo clasifica en circuitos (R1, R5, R7…).

**Dos usos, dos ritmos:**

- **Operaciones**, todo el día: qué pasa ahora, dónde se forma cola, qué cámara
  mirar. Es el Home (`/`).
- **Dirección**, semanal: cómo venimos, cuánto tarda cada tramo, qué anomalías
  hubo. Son las pantallas de Estadísticas, y de ahí sale el material de comité.

**Stack actual** (no es una restricción, es un punto de partida): React 18.3 ·
TypeScript 5.6 · Vite 5 · react-router-dom 6 · Tailwind 3.4 · Recharts 3 · sin
librería de componentes. Backend local Express 5 en `server/*.mjs`, ~30
endpoints. Datos en Supabase/Postgres y corridas guardadas en
`runs/windows/<desde>_<hasta>/`. 86 archivos de test con Vitest.

---

## 2. Los tres problemas que ya conocemos

No son los únicos: encontrá los demás. Pero estos tres están medidos y son los
que más molestan.

### 2.1 No hay criterios estéticos unificados

Cada pantalla se diseñó sola. Evidencia:

- **Dos lenguajes visuales conviviendo**: barra lateral violeta oscura
  (`bg-[#1a1136]`, textos `violet-*`) contra contenido claro (`slate-*` sobre
  blanco). No hay una decisión: hay dos.
- **Los tokens existen y casi nadie los usa.** `tailwind.config.js` define
  `surface`, `primary`, `success`, `warning`, `anomaly`; el código escribe
  `slate-200`, `#0B1220`, `#22C55E` a mano, archivo por archivo.
  `src/index.css` tiene 18 líneas y solo fija la tipografía.
- **Escala tipográfica descontrolada**: conviven `text-[9px]`, `[9.5px]`,
  `[10px]`, `[10.5px]`, `[11px]`, `[11.5px]`, `[12.5px]`, `[13px]`, `[34px]` en
  una misma pantalla.
- **Componentes copiados, no compartidos**: tarjeta de KPI, tabla, chip de
  estado, panel lateral, modal y skeleton están reimplementados en cada pantalla
  con clases distintas. No existe `src/components/ui/`.
- **Dos logos rotos en toda la app**: `src/app/AppShell.tsx:66` y `:80` apuntan a
  `/logo_sinfondo.png` y `/logo.png`, y `public/` no los tiene. Se ve el texto
  alternativo en el encabezado y en la barra lateral de todas las pantallas.

### 2.2 Páginas eternas, densas y poco intuitivas

Todo se apila en un único scroll vertical, sin secciones, sin navegación interna,
sin jerarquía. Medido:

| Pantalla | Líneas | Tablas | Gráficos | Botones | `useState` |
|---|---|---|---|---|---|
| `tabs/SeguridadTab.tsx` (Anomalías) | **1780** | 0 | 0 | 16 | 14 |
| `tabs/TransformEtlTab.tsx` | **1665** | 4 | 5 | 17 | 8 |
| `tabs/KpiTiemposTab.tsx` | 990 | 2 | 0 | 8 | 8 |
| `tabs/CaladaCamerasPanel.tsx` | 969 | 2 | 5 | 3 | 3 |
| `pages/PlantHome.tsx` (Home) | 475 | 1 | 0 | 1 | 6 |

Con viewport de 950 px, varias pantallas pasan las **dos pantallas de alto**
—Transform 1873 px, Home 1694 px, Calada 1628 px, Descargas 1492 px— y eso es
con el estado vacío o parcial: con un período cargado crecen bastante más.

El usuario no sabe qué hay más abajo, ni qué es importante, ni por dónde empezar.
**Resolvelo como te parezca** —secciones, subrutas, navegación interna,
divulgación progresiva, lo que sea— pero que se entienda sin manual.

### 2.3 El flujo histórico es repetitivo y lento

Este es el que más caro sale en tiempo de uso. Hoy, para ver datos de un período:

1. **Extracción** (`/estadisticas/datos/extraccion`): elegir días, bajar y leer
   los JSON de eventos y alertas.
2. **Transform ETL** (`/estadisticas/datos/transform`): correr el proceso.
3. Recién ahí los indicadores y reportes muestran algo.

Todo vive en un contexto de **1155 líneas**,
`src/features/real-truckflow/etlWorkbench/EtlWorkbenchContext.tsx`, que expone
`loadWindowOrOffer`, `recomputeWindow`, `hydrateSavedWindow`,
`ensureWindowEventsLoaded`, `loadComposedRange`, `kpiTiemposPrepared`,
`transformBusy`, `windowEventsBusy`… es decir: **varios caminos distintos para
dejar los mismos datos en memoria**, y cada pantalla exige que el usuario los
haya recorrido en el orden correcto.

Síntomas: el mismo período se vuelve a elegir y cargar en cada pantalla; cambiar
de pestaña puede perder lo preparado; no se ve qué está cacheado
(`runs/windows/…`, con `resolve-window` devolviendo `stale`) y qué se va a
reprocesar; las ventanas guardadas son semanas lunes→domingo y los rangos que no
son semanas se componen uniendo corridas, y nada de eso es visible.

**Lo que espero**: elegir el período una vez y que alcance para toda la app, con
el estado de cada período a la vista (listo / hay que procesar / faltan días).
**Cómo lo lográs es tuyo.** Lo único que no se toca es el cálculo del ETL: lo que
cambia es quién decide y cuándo, no cómo se computa.

---

## 3. Libertad y límites

### 3.1 Tenés libertad total en

- **Dirección visual completa**: paleta, tema (claro/oscuro/ambos), tipografía,
  escala, densidad, iconografía, grilla, tono. No te estoy pidiendo un estilo;
  te estoy pidiendo *un* estilo, aplicado en serio y de punta a punta.
- **Navegación y arquitectura de información**: la barra lateral, las secciones,
  las rutas, cómo se agrupan las pantallas, qué se fusiona y qué se separa.
- **Arquitectura del front**: partir componentes gigantes, crear
  `src/components/ui/`, cambiar el manejo de estado, reorganizar carpetas,
  introducir una librería de componentes (shadcn, Radix, lo que sea) si la
  justificás, cambiar cómo se cargan los datos en el cliente.
- **Refactors profundos** del código de interfaz, incluidas las 1780 líneas de
  `SeguridadTab` y las 1665 de `TransformEtlTab`.
- **Proponer cambios en las reglas de arquitectura** (`scripts/check-arch-rules.mjs`)
  si alguna estorba de verdad. No las rompas en silencio: cambialas
  explícitamente, con el porqué, en su propio commit.

### 3.2 Límites duros

Son cuatro, y ninguno es sobre estética o estructura. Son sobre **que los datos
sigan siendo verdad** y **que no se rompa lo que ya funciona**:

1. **No se pierde funcionalidad.** Antes de tocar una pantalla, escribí su
   inventario de funciones (qué filtra, qué exporta, qué abre, qué persiste). El
   rediseño se valida contra ese inventario. Si algo se elimina, tiene que estar
   dicho y justificado, no desaparecido.
2. **Ningún número inventado.** Si un dato no está, la UI dice «sin dato», nunca
   un cero ni una estimación. Vale también para estados de ejemplo y maquetas.
3. **Reglas de dominio que son correctitud, no estilo** (están en `CLAUDE.md`):
   - **Hora operativa** = `occurredAt` + 206 min de desfasaje del sensor, vía
     `src/services/live/liveEventTime.ts`. **Nunca** `createdAt`: se amontona con
     los backlogs de subida y genera picos falsos.
   - **Tablas canónicas** (`docs/RUNS_TABLAS_CANONICAS.md`): los conteos de
     movimientos salen de `excel_operations_with_truckflow`; la clasificación
     ejecutiva, de `final_circuits.executive_bucket`; los tiempos, de
     `circuit_timing_summary`. Prohibido contar con
     `merged_truckflow_movimientos`. Siempre hay que mostrar el denominador:
     «X movimientos según Excel» ≠ «X recorridos de cámara».
   - **`CIRCUIT_CATALOG`** (`src/etl-core/domain/circuitCatalog.ts`) es la única
     fuente de verdad de circuitos y sus secuencias.
   - Los cuartos de día son Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22.
4. **`npm test` y `npm run check:arch` pasan al final de cada tarea.** Hoy
   `tsc -b` tira **191 errores**, 179 concentrados en
   `src/features/real-truckflow`: no los heredes en silencio, pero tampoco los
   arregles todos de una — proponé cómo bajarlos.

### 3.3 El calendario manda

**El viernes 18-09-2026 hay que exponer datos con esta app.**

- **Antes del viernes** solo entra lo que no puede romper nada y se revierte en
  un minuto: logos, textos, contraste, estados vacíos, arreglos cosméticos
  aislados. Nada que toque el flujo de datos, el ETL, ni las pantallas de las
  que sale el material.
- **Después del viernes**, todo lo demás.
- Decilo explícito en el reporte: qué entra antes y qué queda para después.

### 3.4 Dos decisiones ya tomadas

1. **El Home es el estado de planta en vivo** (`/` → `src/pages/PlantHome.tsx`).
   Su diseño se puede rehacer entero; su rol, no.
2. **La parte histórica no pierde alcance.** Todo lo que hoy se puede sacar de
   ahí se tiene que poder seguir sacando: es de donde salen los datos que se
   presentan. Lo que se arregla es cómo se llega, no qué hay.

---

## 4. Ingeniería de costos de tokens

**Primera entrega, antes de tocar código.** El objetivo es no gastar un modelo
caro en trabajo mecánico.

### 4.1 Cómo clasificar

Una tarea es **mecánica** (→ ficha para agente barato) si se cumplen las cuatro:

- el resultado correcto es **único y describible** de antemano;
- no hay que elegir entre alternativas razonables;
- se verifica con un comando o con una observación binaria;
- si algo no coincide con lo escrito, lo correcto es **parar**, no improvisar.

Ejemplos típicos: reemplazar N usos de un patrón por un componente ya creado;
renombrar; mover archivos; borrar código muerto ya confirmado; aplicar tokens en
lugar de hex sueltos; agregar `aria-label` donde falta; partir un archivo por
límites ya definidos.

Es **de criterio** (→ la hacés vos) si hay que decidir: dirección visual,
jerarquía, qué se muestra y qué se esconde, cómo se corta una pantalla, qué
componentes existen y con qué props, cómo se rediseña el flujo de período, qué
se borra de verdad.

**Ante la duda, es de criterio.** Una ficha mal escrita cuesta más que hacer la
tarea.

### 4.2 Formato de una ficha (para agente barato)

Una por archivo, en `docs/rediseno/tareas/`, más un índice
`docs/rediseno/TABLERO.md` con el estado de cada una.

```markdown
# T-07 · Reemplazar los chips de estado por `EstadoChip`

- **Tipo**: mecánica · **Ejecuta**: agente barato · **Costo estimado**: ~15 k tokens
- **Depende de**: T-03 (existe `src/components/ui/EstadoChip.tsx`)

## Leer (solo esto)
- `src/components/ui/EstadoChip.tsx`
- `src/features/real-truckflow/tabs/SeguridadTab.tsx` (líneas 340-420)

## Editar
- `src/features/real-truckflow/tabs/SeguridadTab.tsx`

## Hacer
1. …pasos literales, sin decisiones abiertas…

## No hacer
- …

## Verificar
`npm test && npm run check:arch`, y en /estadisticas/indicadores/anomalias los
chips se ven igual que antes.

## Si algo no coincide
Parar y reportar. No improvisar.
```

### 4.3 Tabla de costos

Entregá, antes de empezar a ejecutar:

| # | Tarea | Tipo | Ejecuta | Tokens estimados | Por qué |
|---|---|---|---|---|---|

Con el total por columna y la conclusión: cuánto del trabajo se puede delegar.

---

## 5. Inventario verificado del repo (15-09-2026)

Verificalo igual, pero no arranques de cero.

### 5.1 Rutas y pantallas

Navegación en `src/app/sectors.ts`, ruteo en `src/App.tsx`, más redirecciones de
rutas viejas en `LEGACY_ROUTE_REDIRECTS`.

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/` | En vivo (plano de planta) | `src/pages/PlantHome.tsx` |
| `/estadisticas/indicadores/tiempos` | KPI tiempos | `tabs/KpiTiemposTab.tsx` |
| `/estadisticas/indicadores/calada` | Calada | `tabs/CaladaTab.tsx` + `CaladaCamerasPanel.tsx` |
| `/estadisticas/indicadores/descargas` | Descargas | `tabs/DescargasTab.tsx` |
| `/estadisticas/indicadores/anomalias` | Anomalías | `tabs/SeguridadTab.tsx` |
| `/estadisticas/reportes/calibracion` | Calibración | `app/postTransformRoutes.tsx` |
| `/estadisticas/reportes/liquidos` | Líquidos S10 | ídem |
| `/estadisticas/reportes/transile-interno` | Transile interno | ídem |
| `/estadisticas/reportes/transile-externo` | Transile externo | ídem |
| `/estadisticas/reportes/base-datos` | Base de datos | ídem |
| `/estadisticas/datos/extraccion` | Extracción | `tabs/ExtraccionDatosTab.tsx` |
| `/estadisticas/datos/analisis-local` | Análisis local | `tabs/AnalisisLocalTab.tsx` |
| `/estadisticas/datos/transform` | Transform ETL | `tabs/TransformEtlTab.tsx` |
| `/producto/:id` | Ficha de producto | `tabs/ProductoTransformTab.tsx` |

### 5.2 Lo más frágil

`src/pages/PlantHome.tsx`, `server/plantState/`, `src/components/nvai/`,
`src/components/plant/` y `src/services/live/plantStateApi.ts` son **archivos sin
commitear y sin tests de UI**. Son lo más nuevo y lo más fácil de perder en un
refactor. **Primera tarea de todas: commitearlos.**

### 5.3 Candidatos a limpieza (16 sin referencia aparente)

Confirmá uno por uno antes de borrar — puede haber import dinámico o uso desde
`server/`:

```
src/features/real-truckflow/components/LoadedPeriodSummary.tsx
src/features/real-truckflow/components/ProductFilterSelect.tsx
src/features/real-truckflow/components/StatusBadge.tsx
src/features/real-truckflow/etlWorkbench/etlCanonicalCsvExport.ts
src/features/real-truckflow/siteScopeFilters.ts
src/features/real-truckflow/tabs/InicioTab.tsx     ← pantalla huérfana, ya no ruteada
src/features/real-truckflow/workspaceConstants.ts
src/services/live/liveExport.ts
src/services/live/liveTruckflowFeed.ts
src/services/nearbyAlertResearch.ts
src/services/realCameraCoverage.ts
src/services/realIncompleteAnalysis.ts
src/services/realJourneyDepurationMap.ts
src/services/realPlateQuality.ts
src/services/truckflowEventosPresentation.ts
src/vite-env.d.ts                                   ← falso positivo: es ambiente, se queda
```

### 5.4 Placeholders visibles al usuario

En el Home: «Últimas detecciones · sin dato · El feed de detecciones individuales
llega en una tarea posterior» y «Serie horaria del día aún no disponible en el
snapshot». Decidí si se completan o se sacan; no los dejes prometiendo.

### 5.5 Planes vigentes

- `docs/PLAN_PLANT_STATE_EJECUCION.md` — plan T01–T22 del Home. Varias tareas ya
  están hechas: revisá cuáles quedaron abiertas antes de proponer algo que las
  pise.
- `docs/migracion/` (FASE_0 a FASE_5 + `PROGRESO.md`) y `docs/migracion-v3/` —
  migración de arquitectura en curso. Este encargo no la reemplaza.
- `docs/RUNS_TABLAS_CANONICAS.md`, `docs/NUEVAS_CAMARAS_RICARDONE.md`,
  `docs/POC_DSS_LIVE.md`.

### 5.6 El plano del Home: qué ya se intentó y falló

1. **Calcar el modelo IFC** (329 losas en SVG): exacto y **ilegible**.
2. **Esquema abstracto** de rectángulos generados por código: se vio pobre.

**Lo que quedó**: una vista cenital real (PNG estilo plano técnico) como capa
fija, con los puntos de control encima posicionados en **porcentaje** del ancho y
alto de la imagen (`public/plant/ricardone/plantZones.json`), y los recorridos
derivados de las secuencias reales de `CIRCUIT_CATALOG`. Esa decisión funciona;
el resto de la pantalla es tuyo. Pendiente: `S10` (Egreso), `S3` (salida a San
Lorenzo) y la cámara `RicS7Carga` no tienen posición confirmada y están
declarados como «sin ubicar» a propósito.

---

## 6. Qué quiero recibir

En este orden, y con el código ya cambiado en el repo:

**A. Tabla de costos** (§4.3) — antes de ejecutar.

**B. Criterios estéticos, escritos y aplicados.** Un documento corto
(`docs/rediseno/CRITERIOS.md`) con la decisión visual: tokens con sus valores y
dónde se declaran, escala tipográfica, espaciado, cómo se usa el color, cómo se
ven los estados vacíos / de carga / de error. Corto y tajante: son las reglas que
después se aplican en todos lados.

**C. Lo que ejecutaste**, pantalla por pantalla: qué cambió, por qué, captura
antes y después, y el inventario de funciones que verificaste que siguen estando.

**D. Las fichas mecánicas** en `docs/rediseno/tareas/` + `TABLERO.md`.

**E. Qué entra antes del viernes y qué después.**

**F. Preguntas abiertas** — máximo 10, solo lo que no se puede decidir leyendo el
repo, cada una con la opción que recomendás. No frenes el trabajo esperando
respuesta: asumí tu recomendación, dejala anotada y seguí.

---

## 7. Criterios de aceptación

- El software cambió: hay commits, no solo documentos.
- Cualquier pantalla tocada mantiene todas sus funciones, y eso está verificado
  contra un inventario escrito.
- Los criterios estéticos están escritos y se aplican igual en todas las
  pantallas tocadas.
- No queda ninguna pantalla en la que no se entienda qué es lo importante.
- `npm test` y `npm run check:arch` pasan.
- Se puede saber, sin preguntarte, qué falta y quién lo hace.

## 8. Anti-objetivos

- Entregar un plan en vez de código.
- Un rediseño lindo que perdió una función que alguien usaba.
- Gastar el modelo caro en renombrar variables.
- Tocar el ETL, la clasificación de circuitos o el modelo de datos «de paso».
- Romper la presentación del viernes.
