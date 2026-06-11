# CLI local — Truckflow Transform / Contract-first

## Modos

### 1. Validación de datos locales (sin Excel)

Comprueba que existan `event-list.json` y `alert-list.json` por día.

```bash
node scripts/run-truckflow-transform-local.mjs --from 2026-06-04 --to 2026-06-06
# alias: --start / --end
```

### 2. Contract-first (Excel + Truckflow)

Requiere `event-list.json` por día (alertas opcionales). Ejecuta `scripts/contract-first-cli-runner.ts` vía `npx tsx`.

```bash
node scripts/run-truckflow-transform-local.mjs \
  --from 2026-06-04 --to 2026-06-04 \
  --excel "C:/ruta/MovimientosPorContrato_20260604.xlsx" \
  --data-root data/truckflow \
  --out scripts/output/contract-first
```

O: `npm run contract-first:local -- --from ... --to ... --excel ...`

## Salidas (modo Contract-first)

En `--out` (default `scripts/output/contract-first/`):

| Archivo | Descripción |
|---------|-------------|
| `excel_operations_with_truckflow.csv` | Una fila por operación Excel + evidencia |
| `merged_truckflow_movimientos.csv` | Journey Truckflow ↔ contrato |
| `movimientos_without_truckflow_match.csv` | Excel sin match journey |
| `truckflow_without_movimiento_match.csv` | Truckflow sin fila contrato |
| `excel_no_truckflow_evidence_diagnostics.csv` | Diagnóstico Excel-first |
| `clean_journeys_for_analysis.csv` | Journeys listos para análisis (misma lógica Workbench) |
| `contract-first-run-meta.json` | Metadatos de la corrida |

## Limitaciones actuales (Etapa 4)

- **Orden pipeline:** reconstrucción Truckflow mínima (mapper + preliminar) → merge Contract-first. **No** corre matriz/comité Workbench ni reclasifica post-merge.
- **Segmentos/KPI tiempos:** `skipKpiTiemposArtifacts: true` (igual que tramo 2 del Workbench).
- **Alertas:** se leen del disco si existen; el merge Contract-first actual no las consume en esta CLI.
- **Dependencia:** `npx tsx` (descarga bajo demanda) para ejecutar TypeScript.

## Implementación

- Entrada: `src/services/truckflowTransform/contractFirst/contractFirstCliAdapter.ts`
- Runner: `scripts/contract-first-cli-runner.ts`
- Integración: `runMovimientosContratoIntegration` (misma que UI Workbench)

## Próximo paso documentado

Excel + Truckflow limpio → merge → **luego** clasificación Workbench/comité → Power BI.

## Referencias

- `docs/TRUCKFLOW_TRANSFORM_BACKEND_USAGE.md`
- `server/truckflow-local-server.mjs` (export JSON)
