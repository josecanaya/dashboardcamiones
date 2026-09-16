# Estado de ejecución

16-09-2026. Este archivo es el tablero vigente para el cierre; reemplaza los pendientes ambiguos del checkpoint anterior.

- Hecho ahora: retirar entrada Transform, redirigir URLs viejas a Resumen ejecutivo, conservar resultados/exports. Validación y commit se registran en ENTREGA.md.
- R01: hecho · commit `11da843` · `npx vitest run src/features/real-truckflow/api/etlRunCacheApi.test.ts --maxWorkers=2` (11/11 verdes) + `npm run check:arch` OK. `fetchRunTable` ahora pagina en `limit=10000` desde offset 0 hasta acumular `total`, valida coincidencia de headers/total/offset entre páginas y rechaza páginas vacías antes de completar. Sin cambios en servidor ni en cálculo ETL.
- R02: hecho · commit `b1cdbfe` · `npx vitest run server/sourceAvailability.test.mjs --maxWorkers=2` (13/13 verdes) + `npm run check:arch` OK. Nuevo módulo `server/sourceAvailability.mjs` (`inspectSourceFile`/`getSourceAvailability`, paralelismo ≤4 días) y `POST /api/truckflow/source-availability` en `truckflow-local-server.mjs` (solo import + handler agregados; resto del archivo con cambios concurrentes del usuario sin tocar). Cliente `postSourceAvailability` en `truckflowLocalServerApi.ts`. Sede global se detecta por `siteFilter === null` explícito (no ausencia de la clave); ventana `queryStart/queryEnd` que cubre el día completo sin `siteFilter` → `unknown`, nunca global implícito.
- R03: pendiente · agente económico · 5 k.
- R04: pendiente · agente económico · 8 k.
- R05: pendiente · agente económico · 6 k.
- R06: pendiente · agente económico · 6 k.
- R07: pendiente · agente económico · 5 k.
- R08: pendiente · agente económico · 3 k.
- R09: pendiente · agente económico · 3 k.
- R10: pendiente · agente económico · 5 k.
- R11: pendiente · agente económico · 5 k.

Al completar: sustituir pendiente por hecho y agregar commit + comandos + resultado. Si aparece un bloqueo, registrar archivo/ancla, comportamiento esperado/observado y última prueba; no marcarlo terminado.
