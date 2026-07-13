# Guía de migración — rama `automatizacion`

> Guía autocontenida para ejecutar la migración del ETL hacia `etl-core` puro +
> API de corridas + agentes Python. Diseñada para ser implementada **paso a paso
> por un modelo/agente económico** sin contexto previo de la conversación.
> Contexto de negocio y diagnóstico: ver `PLAN_REFACTOR_ETL_AGENTES.md` (raíz).

## Cómo usar esta guía (leer antes de tocar nada)

1. Trabajás en la rama git `automatizacion`. Verificá: `git branch --show-current`.
2. Las fases se ejecutan **en orden**. Dentro de una fase, los pasos se ejecutan en orden.
3. Cargá SOLO el archivo de la fase actual (`FASE_N_*.md`) + este README. No cargues las otras fases.
4. Al terminar cada paso, marcá la casilla en `PROGRESO.md` y hacé el commit indicado.
5. Los pasos marcados **🛑 STOP-HUMANO** requieren una decisión o un dato del usuario.
   Detenete y preguntá; no improvises.

## Reglas de oro (obligatorias en todos los pasos)

- **R1 — Mover no es reescribir.** Al mover un archivo, el contenido queda idéntico
  salvo las rutas de import. Nunca "aproveches" para renombrar funciones, cambiar
  lógica ni "mejorar" código. La lógica de negocio está validada con datos reales.
- **R2 — Verificación tras CADA paso.** Como mínimo:
  ```
  npx tsc --noEmit -p tsconfig.json
  npx vitest run src/features/real-truckflow/etlWorkbench/etlGoldenMaster.test.ts
  ```
  Si el paso tocó módulos con tests propios, correlos también. Si el golden falla,
  el paso está mal: revertí (`git checkout -- .` + `git clean -fd` de lo nuevo) y reintentá.
  NUNCA actualices el snapshot del golden para "hacerlo pasar", salvo que el paso
  lo indique explícitamente.
- **R3 — Un commit por paso.** Mensaje: el indicado en el paso. Terminar con la línea
  `Co-Authored-By: <tu firma de agente>`.
- **R4 — Sin dependencias nuevas** salvo que el paso lo indique explícitamente.
- **R5 — tsc tiene errores pre-existentes** en archivos ajenos (ej. `realCameraCoverage.ts`,
  `realJourneyCycleSplit.test.ts`, `truckflowTransform/index.ts`). Criterio: tu paso
  no debe AGREGAR errores nuevos. Compará contra la línea base con:
  `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c error` antes y después.
- **R6 — Convención de comentarios**: en español, estilo JSDoc breve, igual que el
  código existente. Sin comentarios que expliquen "qué hice" (eso va en el commit).

## Mapa de fases

| Fase | Archivo | Resumen | Riesgo |
|---|---|---|---|
| 0 | `FASE_0_RED_SEGURIDAD.md` | Ampliar golden test + freeze arquitectónico | Bajo |
| 1 | `FASE_1_ETL_CORE.md` | Crear `src/etl-core/` y mover módulos puros con shims | Bajo (mecánico) |
| 2 | `FASE_2_TYPED_TABLE.md` | Tablas tipadas en lugar de CSV interno | Medio |
| 3 | `FASE_3_CATALOGO_UNICO.md` | Un catálogo de circuitos; borrar clasificadores legacy | Alto (requiere criterio) |
| 4 | `FASE_4_SERVICIO_PERSISTENCIA.md` | Corridas headless por API + persistencia por runId | Medio |
| 5 | `FASE_5_AGENTES_PYTHON.md` | MCP + orquestador + subagentes en Python | Medio |

## Hechos del repo verificados (2026-07-13) — confiá en esto

- Entry point del pipeline: `runEtlTransform()` en
  `src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts` (línea ~753).
- Golden test EXISTENTE y verde: `src/features/real-truckflow/etlWorkbench/etlGoldenMaster.test.ts`
  (fixture: `tests/fixtures/etl/s-events-slice.json`, array de `RealJourneyEventDto`).
- No hay config de ESLint en el repo. El freeze arquitectónico se hace con un script Node.
- `src/pages/RealJourneyDiagnosticsPageLegacy.tsx` **ESTÁ VIVA** (App → RealJourneyDiagnosticsPage
  → RealTruckflowPage → Legacy). NO borrarla.
- Server backend: `server/truckflow-local-server.mjs` (Express, endpoints `/api/truckflow/*`).
- CLI headless existente: `scripts/run-truckflow-transform-local.mjs` +
  `scripts/contract-first-cli-runner.ts` (corre vía `npx tsx`).
- Tests: `npx vitest run <ruta>` · Typecheck: `npx tsc --noEmit -p tsconfig.json`.
- Imports que `etlWorkbench` hace hacia `src/services` (15 módulos):
  analyticsKpi, argentinaPlate, circuitPlateOcr, liveCameraDiagnostics,
  realEventNormalization, realEventOperationalTime, realJourneyCycleSplit,
  realJourneyEvents.types, realJourneyEventsMapper, realJourneyQuality,
  realPlateAudit, realPreliminaryCircuit, realTruckflowApi,
  truckPlateRegistryFilter, truckflowTransform/contractFirst/contractFirstCliAdapter.
