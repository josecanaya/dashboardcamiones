# Comité de Logística 05/10–11/10 · cómo se calculó

Semana lunes 05/10 → domingo 11/10/2026. **Versión solo cámaras**: en esta PC la planilla
(MovimientosPorContrato) llega hasta el 04/10. Cada cifra de cámara dice su denominador y cómo
se calibró contra la planilla de 30/09–04/10 (días con planilla y cámaras en esta PC).

Generador: `scripts/estado-planta/gen_comite_logistica_semana.py` (misma maqueta que
`gen_comite_logistica_rango.py`, sin fechas fijas) sobre `../datos.json`, que arma
`scripts/estado-planta/datos_comite_semana.py`.

## Corrida

`runs/windows/2026-10-05_2026-10-11` · `etl_transform_v17` · 10.836 eventos (event-list 04/10 a 11/10) · 0 movimientos.
Lanzada con `POST /api/etl/runs {"from":"2026-10-05","to":"2026-10-11"}` (server `npm run server:truckflow`).
Sin planilla, los niveles C/D/E quedan vacíos (todo cae en `D_camiones_sin_contrato` / `D_descartados`): se usan
`final_circuits`, `circuit_timing_journeys`, `segment_timing_legs` y las tablas de sectores.

## Qué sale de dónde

| Lámina | Fuente | Calibración (30/09–04/10) |
|---|---|---|
| Soja R7 · cantidad | `r7-camaras.cjs`: viajes por patente calada → egreso → ingreso SLZ (≤ 90 min) → salida SLZ. 309 viajes ÷ cobertura 0,635 ≈ 487. La corrida da 491 recorridos R7 en `final_circuits` (mismo orden). | 338 viajes de cámara contra 532 operaciones R7 de la planilla (TERMINAL · INGRESO · SOJA · VOLCABLE_PTO_n) |
| Soja R7 · tiempos | `r7-camaras.cjs` (no depende de las cámaras de volcables del puerto, que leen poco y desde el 09/10 casi nada en V5) | puerta a puerta 264 por cámaras contra 268 de la planilla (paquete revision-002) |
| Soja · por día (barras) | recorridos R7 de la corrida por día operativo del inicio | — |
| Girasol | `metricas-camaras.cjs` (patente: calada → volcable de Ricardone) y cámara de la volcable 2 (paquete) | volcable 2: 38 camiones de cámara contra 42 operaciones R6 (01–04/10). Comparativo con el mismo script sobre 24/09–04/10 de la PC de la oficina (`calculo-pc/metricas-camaras.json` del comité anterior) |
| Transile R29 | `metricas-camaras.cjs` (silo → calada → volcable del puerto): 0 vueltas; silos 13 recorridos | — |
| Pellet | `pellet-camaras.cjs`: balanza egreso Ricardone con Playa 3 o calle líquida antes, sin calada/silo/volcable Ricardone, y lecturas del puerto en 12 h | 181 de 243 viajes de la planilla (74 %), precisión 98 % |
| Líquidos · criterio | `liquidos-criterio.cjs` sobre 24/09–04/10 (data/movimientos) → `liquidos-criterio-anterior.json` | 479 contra 466 publicados (ver abajo) |
| Líquidos · semana | `liquidos-camaras.cjs`: visitas de camión a la zona de líquidos | Terminal: 196 visitas para 175 movimientos; cobertura 73 %, precisión 66 % (el resto: agua, residuos, varios). Ricardone: precisión 47 %, solo indicativa |
| Calada, calada líquida, calada SL, volcable Ricardone, silos | `paquete.json` (`paquete-periodo.ts`, como «Cargar rango» del dashboard) | no dependen de la planilla |
| Volcables del puerto | camiones distintos leídos por cada cámara SLZVolcableC1–C5 por día (`metricas-camaras.cjs`). El panel del dashboard da 0 sin planilla | — |

Comparativos: contra el comité anterior (24/09–04/10, `reportes/logistica/2026-09-24_2026-10-04/comite-logistica/datos.json`
y su paquete revision-002) cuando la métrica es comparable; si no, contra 30/09–04/10 medido con el mismo método en esta PC.

## Líquidos · criterio propuesto (pendiente de aprobación)

Por **producto** (no por circuito), **solo camiones** (sin TTTTTT/PPPPPP/XXXXXX), **Ricardone y Terminal por separado**
(Renopack aparte), **cargas y descargas por separado**, día operativo del ingreso, tiempo = mediana de la planilla.

24/09–04/10 con este criterio: 479 = Terminal 311 cargas + 111 descargas, Ricardone 53 descargas + 4 cargas.
Contra los 466 publicados: −29 patentes ficticias (cañería), −6 no líquidos (productos varios 3, nitrógeno 2, residuos 1),
+48 insumos químicos (metanol 33, metilato 7, ácidos 5, soda 2, hipoclorito 1).
«R8 = 161» publicado: 90 eran glicerina de la Terminal con circuito R8 resuelto, 12 movimientos por cañería y 3 productos
varios; Ricardone tuvo 57 camiones de líquidos.

## Cuando llegue la planilla (Excel del 13/10 en adelante)

Un solo comando (desde la raíz del repo o del worktree; los datos se leen de `VICENTIN_ROOT`, por defecto el repo principal):

```bash
python scripts/estado-planta/comite_semana.py --desde 2026-10-05 --hasta 2026-10-11 --excel <MovimientosPorContrato_20261012.xlsx> <MovimientosPorContrato_20261013.xlsx>
```

Hace: ingesta (`scripts/ingest-movimientos.ts` → `data/movimientos/<día>`), corrida ETL con `force` (levanta el server si está
apagado), paquete, `r7-camaras`, `pellet-camaras`, `liquidos-camaras`, `liquidos-criterio` de la semana, `metricas-camaras`,
`datos.json` y el deck. Termina con un resumen: modo, movimientos de planilla por día y último Excel cargado.

**Cuándo pasa a «planilla»** (`datos.json → planilla.completa`): todos los días de la semana tienen movimientos, el último
Excel cargado (`source_date` de las filas) es posterior al domingo y la corrida tiene movimientos. Si falta algo queda en
«parcial»/«cámaras» y el deck sigue con los conteos de cámaras (la portada lo dice).

En modo planilla:
- Soja R7: operaciones de la planilla por día (TERMINAL · INGRESO · SOJA por volcable, día operativo del ingreso) y puerta a puerta
  de la planilla (paquete, salida − ingreso, como los comités anteriores). Tramos y tiempos por planta siguen por cámaras.
- Girasol: operaciones R5+R6 del paquete. Pellet: egresos de pellet de Ricardone al puerto (sin despachos a terceros).
- Líquidos: movimientos de la semana con el criterio por producto (`liquidos-criterio.json`); las visitas de cámara quedan como apoyo.

Publicar: subir los archivos de `deck/project/` que cambiaron al artifact de `deck/assets.json`
(https://claude.ai/artifact/BLSZxYCY8QWkuMNqGxKNHo). Probado en modo planilla sobre 30/09–03/10: 452 operaciones R7,
puerta a puerta 274 (por día 269/230/315/299, igual que el paquete oficial), pellet 242 viajes, líquidos 190.
