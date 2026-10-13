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

```bash
npx tsx scripts/ingest-movimientos.ts --excel <MovimientosPorContrato_2026101X.xlsx>   # uno por día; el del día D trae D-1/D-2
# reprocesar la ventana (server arriba): POST /api/etl/runs {"from":"2026-10-05","to":"2026-10-11","force":true}
export VICENTIN_ROOT=<raíz con data/ y runs/>
C=reportes/logistica/2026-10-05_2026-10-11/comite-logistica/calculo
npx tsx scripts/estado-planta/paquete-periodo.ts $C/paquete.json 2026-10-05 2026-10-11 "$VICENTIN_ROOT/runs/windows/2026-10-05_2026-10-11:2026-10-05:2026-10-11"
node --max-old-space-size=4096 scripts/estado-planta/r7-camaras.cjs 2026-10-05 2026-10-11 $C/r7-camaras.json
node --max-old-space-size=4096 scripts/estado-planta/pellet-camaras.cjs 2026-10-05 2026-10-11 $C/pellet-camaras.json
node --max-old-space-size=4096 scripts/estado-planta/liquidos-camaras.cjs 2026-10-05 2026-10-11 $C/liquidos-camaras.json
node scripts/estado-planta/liquidos-criterio.cjs 2026-10-05 2026-10-11 $C/liquidos-criterio.json
node --max-old-space-size=4096 scripts/estado-planta/metricas-camaras.cjs $C/metricas-camaras.json 2026-09-28 2026-10-05 7
python scripts/estado-planta/datos_comite_semana.py reportes/logistica/2026-10-05_2026-10-11/comite-logistica 2026-10-05 2026-10-11 "$VICENTIN_ROOT/runs/windows/2026-10-05_2026-10-11" "$VICENTIN_ROOT/reportes/logistica/2026-09-24_2026-10-04/comite-logistica"
python scripts/estado-planta/gen_comite_logistica_semana.py reportes/logistica/2026-10-05_2026-10-11/comite-logistica
```

Con planilla de la semana, `r7-camaras.cjs`, `pellet-camaras.cjs` y `liquidos-camaras.cjs` agregan solos el bloque
`calibracion` de la misma semana y el generador toma de ahí los conteos (operaciones R7 por día, egresos de pellet,
movimientos de líquidos por planta y sentido). Los tiempos siguen saliendo de cámaras por patente (calibrados).
Probado sobre 30/09–04/10: toma 532 operaciones R7 y el día a día 116/131/99/106/80 de la planilla.
