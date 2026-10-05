# Comité de Logística 24/09–04/10 · cómo se calculó

Deck: https://claude.ai/artifact/SxeVbx2h3pxKuaAf6nfMRF (versión 16; la 15 era la semana 24–30/09).
Generador: `scripts/estado-planta/gen_comite_logistica_rango.py` (misma maqueta que `gen_comite_logistica.py`) sobre `../datos.json`.

## Corridas (reglas `etl_transform_v17`)

| Días | Corrida | Por qué |
|---|---|---|
| 24–27/09 | `runs/windows/2026-09-21_2026-09-27` (versionada) | Sin cambios. |
| 28–30/09 | `runs/windows/2026-09-28_2026-10-04` (versionada) | Tiene las cámaras del 27–29/09, que en esta PC no están. |
| 01–04/10 | `corrida-2026-09-28_2026-10-04-reprocesada/` | Misma ventana semanal, reprocesada el 05/10 con la planilla 28/09–04/10 y los eventos 30/09–04/10. **No pisa la versionada.** |

Paquete oficial (como «Cargar rango» del dashboard): `../../revision-001/paquete.json`, hecho con `build-range.ts`
(`npx tsx … <dir corrida reprocesada> 2026-09-24 2026-10-04`).

## Qué sale de dónde

- Soja R7 (operaciones, tramos, día, cuartos, plantas), girasol por día, calada/volcables/silos: paquete.
- Líquidos, transile de pellet, R29, girasol R5/R6 y su mediana: `extras.cjs` sobre `excel_operations_with_truckflow`
  compuesta (criterios verificados contra lo publicado para 24–30/09: R7, girasol 208/843, pellet 307/62/8.369 t y R29 coinciden;
  líquidos coincide en los días cuyo Excel no cambió).
- Tiempos de líquidos: `liqt2.cjs` (circuit_timing_journeys + segment_timing_legs por fecha de inicio; reproduce exacto R8 34/240,6 y SL1 10/269,8 de 24–30/09).
- Girasol por tramo: publicado 24–30/09 + (media de cámaras 24/09–04/10 − media 24–30/09), ponderado por camiones medidos (`metricas-oct.json`).
- Pellet por tramo: cámaras 24–30/09 (`pellet-operativo.json` de la semana) + 01/10 (`pellet-oct.json`), ponderado por n. Planilla del operativo: `pellet-24-04-planilla.json`.
- R29: no hubo transile del 01 al 04/10; tramos de 24–29/09.

## Cambios contra el deck 24–30/09 por la planilla completa

El Excel del 01/10 trae movimientos que ingresaron el 29 y el 30/09: el 30/09 pasa de 100 a 116 operaciones R7 y
24–30/09 da 390 líquidos (antes 383). La mediana de girasol se recalculó con un criterio reproducible (814 para 24–30, antes 861).
