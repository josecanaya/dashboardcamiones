# Simulador logístico mock (independiente)

Proyecto separado del dashboard para generar JSON mock en disco y probar el flujo de trazabilidad.

## Flujo

`RAW CAMERA EVENTS -> CAMERA EVENTS ENRICHED -> CAMIONES EN PLANTA -> HISTORICO -> ALERTAS`

## Regla clave RAW vs ENRICHED

- `raw_camera_events.json` solo usa datos ANPR reales:
  - `eventType`, `snapshotTime`, `plateNo`, `region`, `targetPlateSize`, `logo`, `vehicleType`
- `camera_events_enriched.json` agrega datos internos:
  - `eventId`, `plant`, `cameraId`, `sector`, `inferredTruckId`, `inferredCircuitCode`, `source`, `imageUrl`

En RAW no se incluye `plant`, `sector`, `cameraId`, `truckId`, `circuitCode`, alertas ni estado.

## Estructura

- `src/data`: catálogos (`cameras.ts`, `circuits.ts`, `trucks.ts`)
- `src/engine`: generadores y motor (`rawGenerator.ts`, `enrichment.ts`, `stateEngine.ts`, `outputWriter.ts`, `simulation.ts`)
- `src/scenarios`: escenarios (`buildScenario.ts`)
- `src/types`: contratos (`contracts.ts`)
- `src/index.ts`: ejecución puntual
- `src/service.ts`: modo servicio
- `scripts/start-simulator.cjs` y `scripts/stop-simulator.cjs`
- `public/mock-data/<scenario>/`: salidas JSON (ruta que consume el dashboard)

## Escenarios

- `normal`
- `anomalies`
- `high-load`
- `week_snapshot`: Día 7 a las 12:00. Totales semanales: Ricardone 4000, San Lorenzo 3000, Avellaneda 600. Hoy = 1/7. Ricardone: 30% circuito A7 (San Lorenzo), 70% otros. San Lorenzo: 60% A1 (Descarga sólidos), 40% otros.
- `march_full`: Simulación realista del mes de marzo completo. Promedio/día: Ricardone 700, San Lorenzo 500, Avellaneda 250. ~45.000 viajes en total (31 días).
- `live`: Modo servicio. Cada 20s reales = 10 min simulados en planta. Genera 5 camiones por tick. El histórico se acumula.

## Comandos

Instalar:

```bash
npm install
```

Simulación puntual:

```bash
npm run simulate
npm run simulate -- --scenario=normal
npm run simulate -- --scenario=anomalies
npm run simulate -- --scenario=high-load
npm run simulate -- --scenario=week_snapshot
npm run simulate -- --scenario=march_full
npm run simulate -- --scenario=live
```

Modo live (servicio): `npm run simulate:start -- --scenario=live --intervalSec=20`. Cada tick: 20s real = 10 min simulado, 5 camiones al histórico.

Para que el dashboard consuma un escenario: `localStorage.setItem('logistics.mock.scenario', 'march_full')` (o `week_snapshot`, etc.) y recargar.

Modo servicio:

```bash
npm run simulate:start
npm run simulate:start -- --scenario=high-load --intervalSec=10
npm run simulate:stop
```

## Archivos generados por escenario

Dentro de `public/mock-data/<scenario>/` (ruta que consume el dashboard):

1. `raw_camera_events.json`
2. `camera_events_enriched.json`
3. `camiones_en_planta.json`
4. `historico_recorridos.json`
5. `alertas_operativas.json`
