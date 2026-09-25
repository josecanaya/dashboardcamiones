# Informe diario de logística

Una presentación en Google Slides (portada + 6 láminas, con el diseño del semanal) que se emite **cada día, para el día anterior**,
con las mismas métricas y reglas que el semanal del comité.

## Cómo se arma

```
npm run informe:diario:procesar -- 2026-09-24
        │
        ├─ POST /api/truckflow/export-one-day      ← cámaras del día desde la nube
        ├─ repair-missing-journey-uid.mjs          ← solo si > 50 % de eventos sin journeyUid
        ├─ POST /api/etl/runs {lunes..domingo, force}  ← la semana calendario, sin ventanas ad-hoc
        │
        ├─ buildLogisticsReportPackage(día, día)   ← MISMO paquete que el semanal
        ├─ buildDailyExtras                        ← movimientos Excel, anomalías, demorados
        │
        ├─ reportes/logistica/diario/<día>/revision-NNN/{paquete,diario,control}.json
        └─ informe-diario-slides.mjs               ← presentación viva + copia fechada
```

Sin `--procesar` (`npm run informe:diario -- <día>`) usa la corrida guardada que cubra el día y
no baja ni reprocesa nada. Sin fecha, toma el día anterior (hora Argentina).

| Flag | Qué hace |
|---|---|
| `--procesar` | baja cámaras, repara journeyUid si hace falta, reprocesa la semana |
| `--sin-slides` | solo la revisión local (sirve para cargar historial) |
| `--forzar` | publica aunque falte el Excel de movimientos del día |
| `--dry` | calcula y muestra las conclusiones; no escribe en Google |

**Sin Excel de movimientos del día no se publica** (sale con código 3): productos, circuitos y
puerta a puerta darían cero y pisarían la presentación con un informe incompleto. El Excel se
sigue cargando a mano (`/api/movimientos/ingest`); es la única dependencia manual que queda.

## Qué contiene

Un reporte de **actividad de la planta en el día**, no un informe técnico: parte del Excel de
Movimientos y lo completa con la corrida del dashboard. Pocas palabras, cifras grandes. **No
muestra nada de la calidad de lectura de cámaras** (cobertura, tramos deducidos, métricas no
publicables): si una métrica no se puede publicar, no aparece; el detalle queda en
`control.json`.

| Lámina | Contenido | Fuente |
|---|---|---|
| 1 Actividad de planta | camiones, toneladas, ingresos, egresos; camiones y t por producto; 3–4 destacados | Excel |
| 2 Productos y plantas | camiones por producto y por planta | Excel |
| 3 Movimiento por hora | ingresos y salidas por hora, con el pico | Excel |
| 4 Descarga y calada | top 10 plataformas (Excel) + calada Ricardone y descarga puerto por hora | Excel + corrida |
| 5 Soja al puerto | puerta a puerta, en Ricardone / traslado / en el puerto, minutos por etapa (se oculta si no hay dato) | corrida |
| 6 Para revisar | reglas de oro del día y demoras > 30 min (o «Sin novedades») | corrida |

## Reglas que se respetan

- Anomalías: solo `anomaly_kind = BEHAVIORAL` (cobertura de cámara no es conducta), una por
  patente y regla, R6 solo en R7, sin patentes de servicio del registro (se lee la base en vivo,
  `/api/truckflow/plate-registry`; si no responde, el JSON local y se avisa).
- Demorados: umbrales de `SEGMENT_DEMORA_THRESHOLD_MINUTES` (hoy 30 min en CALADA→EGRESO y
  EGRESO→SL_INGRESO), los legs que el KPI de tiempos deja afuera.
- Comparaciones: contra el promedio de hasta 7 días anteriores **con informe y con Excel**;
  con menos de 3 días no se publica variación.
- Destacados (`destacadosDia`): máximo 4 líneas cortas; volumen −50 % = «validar con planta».
  No se listan reglas cuya evidencia es la falta de registro (R12, revisión manual).
- Diseño: todo lo que no es gráfico se borra y se redibuja en cada corrida desde
  `informe-diario-slides.mjs`; un ajuste de formato va en el código. Los gráficos viven en la
  hoja y se reinsertan vinculados (reciben el estilo del semanal: `estiloGraficosHoja`).
- Exclusiones: `reportes/logistica/diario/<día>/exclusiones.json`, mismo formato que el semanal.

## Destino en Google

La presentación del diario es una **copia de la semanal**, reducida a la portada y 6 láminas: hereda
la foto de la planta, los logos y el estilo de título. En cada corrida el script conserva esos
elementos (`destino.plantilla.conservar`), reescribe título y fecha, y redibuja el contenido con
los marcos y colores del semanal. No se exporta PDF.

`reportes/logistica/diario/destino.json` guarda la presentación, la hoja y el `chartId` de cada
gráfico. Cada publicación deja además una **copia fechada** («Informe diario DD-MM-AAAA»; si se
rehace el día, la nueva lleva «(rev. N)»).

## Automatización (paso 2, todavía no activada)

La corrida diaria queda en un solo comando: `npm run informe:diario:procesar` a las 07:00.
Necesita el ETL API (8787) y el MCP de Google Slides (8790) arriba en la máquina, y el Excel
de movimientos del día anterior cargado antes de esa hora.
