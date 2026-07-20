# Subagentes Claude + carpeta `runs/` — fuente única por ventana

Fecha: 2026-07-20 (actualizado: layout estable `windows/`).

---

## 1. Qué son las “4 skills” del chat

En la UI (“4 skills”) no hay archivos Skill aparte: son los **4 subagentes** de Claude Code en `.claude/agents/*.md`. El orquestador los invoca con la tool `Task`.

| Subagente | Tools MCP clave | Dominio |
|-----------|-----------------|---------|
| **knowledge-truckflow** | `resolve_window`, `query_table`, `explain_journey`, `get_summary` | Cámaras, journeys, tiempos, R* |
| **knowledge-contratos** | `resolve_window`, `query_table`, `run_etl` | Producto, plataforma, transiles, Excel |
| **seguridad** | `resolve_window`, `query_table`, `explain_journey` | Anomalías, alertas |
| **comunicador** | `resolve_window`, `get_summary`, `generar_pptx_comite` | Resumen dirección + PPTX |

---

## 2. Layout de `runs/` (fuente de verdad)

```
runs/
  _catalog/circuits.json
  _index/by-window.json          # ventana from..to → runId estable
  windows/
    2026-07-13_2026-07-20/       # UNA carpeta por ventana; se PISA al Process
      manifest.json              # fromDay, toDay, rulesVersion, layout
      stats.json
      logs.txt
      tables/*.json              # solo tablas NÚCLEO (sin CSV)
      debug/                     # opcional (--persist-debug)
```

### Reglas

1. **runId = `<from>_<to>`** (ej. `2026-07-13_2026-07-20`), no timestamp.
2. Cada Process / Recalcular de la misma ventana **borra y reescribe** `windows/<runId>/`.
3. `by-window.json` apunta a ese mismo id.
4. El agente usa siempre `resolve_window(from, to)` antes de `query_table`.
5. Ventanas solapadas (`13..19` vs `13..20`) son **dos** carpetas distintas — no mezclar.

### Tablas núcleo (las que el agente debe usar)

`final_circuits`, `debug_matrix_classification`, `excel_operations_with_truckflow`,
`external_movimientos_contrato_normalized`, `merged_truckflow_movimientos`,
`segment_timing_kpi`, `circuit_timing_summary`, `circuit_timing_journeys`,
`liquid_movements_*`, `transile_*`, `transform_summary`, etc.

Lista completa: `src/etl-core/runs/etlRunsLayout.ts` → `ETL_RUN_CORE_TABLES`.

Eventos crudos, LPR merge, merge candidates, etc. **no** se persisten por default (solo con `--persist-debug`).

### Limpieza legacy

```bash
node scripts/cleanup-runs-orphans.mjs          # dry-run
node scripts/cleanup-runs-orphans.mjs --apply  # borra timestamp huérfanos
```

Tras el GC, **reprocesá** las ventanas que uses (`force`) para regenerar bajo `windows/`.

---

## 3. Flujo Process → agente

```
data/truckflow + data/movimientos
        ↓
POST /api/etl/runs { from, to, force? }
        ↓
runs/windows/<from>_<to>/   (pisado)
        ↓
by-window.json actualizado
        ↓
resolve_window → query_table / get_summary
```

| Acción | ¿Pisa disco? |
|--------|--------------|
| Process misma ventana | **Sí** — misma carpeta |
| Process otra ventana | Nueva carpeta `windows/<otra>/` |
| Cache hit (sin force, reglas vigentes) | No reprocesa |

---

## 4. Checklist

1. Server `:8787` reiniciado.
2. `GET /api/etl/resolve-window?from=2026-07-13&to=2026-07-20` → `runId` tipo `2026-07-13_2026-07-20`.
3. Existe `runs/windows/2026-07-13_2026-07-20/tables/final_circuits.json`.
4. No hay (o quedan pocas) carpetas `YYYYMMDD-HHMMSS-hex` en la raíz de `runs/`.
