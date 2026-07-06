# Benchmark ETL (fixture M)

Generado tras implementación de profiling y optimizaciones (Tandas A–C).

## Cómo reproducir

```bash
# Fixture pequeño (CI / golden)
npx vitest run src/features/real-truckflow/etlWorkbench/etlGoldenMaster.test.ts

# Perfil wall-clock + spans (mock-data ~semana)
set ETL_PROFILE=true
node scripts/etl-profile-run.mjs public/mock-data/realdata/journey-events_2026-05-04_2026-05-10.json
```

Salida: `scripts/output/etl-profile-last.json` con `spans`, `totalWallMs`, `heapMb`.

## Riesgos pendientes

- Dos motores de clasificación (Workbench vs `circuitEtlV2` / comité) — optimizar uno no acelera el otro.
- Prefilter fuzzy Excel-first: mantener `etlExcelFirstMerge.test.ts` en cada cambio de umbral OCR.
- `npm run build` sigue fallando por errores TS preexistentes fuera de `etlWorkbench`; validar con vitest etlWorkbench.
- Paridad CLI Transform completo vs UI Workbench aún no unificada (`run-truckflow-transform-local.mjs` solo Contract-first acotado).

## Cambios de performance aplicados

| Área | Cambio |
|------|--------|
| LPR merge | Ventana 60 min + scans ordenados por `minW` |
| Alertas operativas | Índice `Map` patente → journeys |
| Merge Truckflow | Fuzzy solo en pool misma longitud de patente |
| Tramo 2 | Cache `journeyDeviceSectorLogical` / `getCollapsedLogicalCodes` por uid |
| Paso 1–2 | CSV debug solo si `ETL_DEV_MODE` o `emitDebugCsv` |
| Observabilidad | `ETL_PROFILE` / `VITE_ETL_PROFILE`, `etlProfile.ts` |
