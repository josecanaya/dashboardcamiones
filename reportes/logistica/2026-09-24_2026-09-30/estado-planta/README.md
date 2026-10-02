# Estado general de la planta · semana 24–30/09/2026 (solo cámaras)

Semana sin Excel de movimientos: el deck (17 láminas) se armó solo con las lecturas de cámaras.

- Deck publicado: https://claude.ai/artifact/3TjKPGseF7MpV59yNf3wvt (privado; se comparte desde Share).
- Métricas: `metricas-camaras.json`, generado por `scripts/estado-planta/metricas-camaras.cjs`.
  La semana anterior (17–23/09) se recalcula con la misma regla, así la comparación es pareja;
  por eso sus cifras no coinciden con las del deck 17–23, que partía del Excel.
- Criterio: camiones distintos por día y sector (hora operativa = occurredAt + 206 min);
  soja = calada Ricardone → egreso → volcable puerto por patente; girasol = calada → volcable 1/2.
  Los tiempos son promedios de los camiones con lectura en todo el tramo.
- Corridas ETL usadas solo como respaldo: `2026-09-21_2026-09-27` y `2026-09-28_2026-10-04` (v17).

## Regenerar

```bash
node --max-old-space-size=4096 scripts/estado-planta/metricas-camaras.cjs reportes/logistica/2026-09-24_2026-09-30/estado-planta/metricas-camaras.json
python scripts/estado-planta/gen_deck_camaras.py reportes/logistica/2026-09-24_2026-09-30/estado-planta reportes/logistica/2026-09-24_2026-09-30/estado-planta/metricas-camaras.json
```

Los logos ya están copiados como assets del artifact (ids en `gen_deck_camaras.py`).
