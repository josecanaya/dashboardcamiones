# Descargas sin carta de porte — Nodo Sur, 28/09–25/10/2026

Fuentes: cartas ARCA `data/arca/arca_consignment_notes.json` (9.730 cartas, entradas desde 25/09) ×
descargas = movimientos INGRESO de Ricardone, Terminal de Embarque y Renopack en `data/movimientos`
(Excel hasta 18/10, SGC 19–25/10). Día = día de ingreso. Toneladas = kgs_neto.

Cruce:
- Excel: por CTG del Excel contra la base ARCA; si no, por patente (chasis o acoplado) con partida de la carta entre −120 h y +48 h del ingreso.
- SGC (sin CTG): solo por patente. Validación sobre el Excel: el método por patente encuentra 2.215/2.215 de los casos con CTG y 0/536 de los sin CTG.
- Excluidos: 25 vagones de tren (soja Cargill 28/09, patente numérica), 16 ajustes contables (patente VENTA/VVVV/no válida, pesos de miles de t), 11 SGC con baja/rechazo.
- «Con CTG fuera de base»: ACGIRASOL OLEICO y ACEITE GIRASOL PARA REFINAR traen CTG en el Excel (107/107, prefijo 3003…) pero la carta no está en la exportación ARCA. En la semana SGC (sin CTG) se clasifican igual **por producto** (88 camiones), no por cruce.

Cuidado con la semana 19–25/10: SGC tiene huecos (19/10 17:30 → 20/10 09:36) y menos cobertura de productos varios que el Excel.

Re-correr: `node scripts/cruce-cartas-sin-carta/cruce.mjs <tmp>/cruce.json && node .../rep.mjs <tmp>/cruce.json <tmp>/rows.json && node .../final.mjs <tmp>/rows.json <carpeta>`

## Totales por semana (descargas Nodo Sur)

| Semana | Fuente | Descargas | Con carta | Con CTG fuera de base | **Sin carta** | t sin carta | % t sin carta |
|---|---|--:|--:|--:|--:|--:|--:|
| 2026-09-28 | excel | 1442 | 1178 | 64 | **200** | 4829 | 11.3 % |
| 2026-10-05 | excel | 821 | 610 | 2 | **209** | 4771 | 20.1 % |
| 2026-10-12 | excel+sgc | 616 | 445 | 42 | **129** | 3054 | 16.7 % |
| 2026-10-19 | sgc | 1002 | 785 | 87 | **130** | 3455 | 11.1 % |

## Productos sin carta: camiones y toneladas netas por semana

| Producto | 09-28 | 10-05 | 10-12 | 10-19 | Total cam. | Total t | Prom. cam/día | Prom. t/día |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| AGUA INDUSTRIAL | 43 · 1176 t | 42 · 1146 t | 31 · 851 t | 35 · 957 t | 151 | 4129 | 5.4 | 147 |
| ACEITE GIRASOL REFINADO | 17 · 474 t | 41 · 1199 t | 8 · 234 t | 44 · 1277 t | 110 | 3184 | 3.9 | 114 |
| ACEITE SOJA REFINADO | 22 · 647 t | 23 · 681 t | 28 · 902 t | 11 · 324 t | 84 | 2555 | 3.0 | 91 |
| GLICERINA | 35 · 1062 t | 32 · 979 t | 5 · 152 t | 9 · 268 t | 81 | 2462 | 2.9 | 88 |
| METANOL | 20 · 703 t | 4 · 137 t | 12 · 419 t | 5 · 179 t | 41 | 1439 | 1.5 | 51 |
| PRODUCTOS VARIOS | 42 · 304 t | 55 · 381 t | 33 · 244 t | 13 · 123 t | 143 | 1052 | 5.1 | 38 |
| METILATO DE SODIO | 6 · 175 t | 3 · 90 t | — | 3 · 86 t | 12 | 351 | 0.4 | 13 |
| ESCORIA | 2 · 65 t | 2 · 60 t | 5 · 149 t | — | 9 | 274 | 0.3 | 10 |
| ACIDO CLORHIDRICO | 2 · 62 t | 2 · 54 t | 1 · 30 t | 3 · 84 t | 8 | 230 | 0.3 | 8 |
| SODA CAUSTICA LIQUIDA | 2 · 64 t | — | 1 · 34 t | 1 · 30 t | 4 | 127 | 0.1 | 5 |
| NITROGENO LIQUIDO | 3 · 30 t | 2 · 13 t | 2 · 19 t | 2 · 33 t | 9 | 95 | 0.3 | 3 |
| SOLVENTE HEXANO | — | — | — | 4 · 94 t | 4 | 94 | 0.1 | 3 |
| RESIDUOS ORG | 2 · 11 t | 2 · 15 t | 2 · 14 t | — | 6 | 40 | 0.2 | 1 |
| ACIDO FOSFORICO | 1 · 26 t | — | — | — | 1 | 26 | 0.0 | 1 |
| GAS OIL | 2 · 21 t | — | — | — | 2 | 21 | 0.1 | 1 |
| ACIDO CITRICO ANHIDRO | — | 1 · 18 t | — | — | 1 | 18 | 0.0 | 1 |
| HIPOCLORITO DE SODIO | 1 · 8 t | — | 1 · 5 t | — | 2 | 13 | 0.1 | 0 |
| **Total** | **200 · 4829 t** | **209 · 4771 t** | **129 · 3054 t** | **130 · 3455 t** | **668** | **16109** | **23.9** | **575** |

## Sin carta por planta

| Planta | Camiones | t |
|---|--:|--:|
| TERMINAL_EMBARQUE | 348 | 7804 |
| RENOPACK | 239 | 6257 |
| RICARDONE | 81 | 2048 |

## Diario: sin carta (camiones · t)

| Día | Fuente | Descargas | Sin carta | t sin carta | Top producto |
|---|---|--:|--:|--:|---|
| 2026-09-28 | excel | 226 | 28 | 697 | AGUA INDUSTRIAL 6, ACEITE GIRASOL REFINADO 6, PRODUCTOS VARIOS 5 |
| 2026-09-29 | excel | 196 | 38 | 767 | PRODUCTOS VARIOS 13, AGUA INDUSTRIAL 7, ACEITE GIRASOL REFINADO 7 |
| 2026-09-30 | excel | 292 | 29 | 681 | AGUA INDUSTRIAL 7, PRODUCTOS VARIOS 7, GLICERINA 5 |
| 2026-10-01 | excel | 305 | 30 | 641 | PRODUCTOS VARIOS 9, ACEITE SOJA REFINADO 8, AGUA INDUSTRIAL 6 |
| 2026-10-02 | excel | 173 | 37 | 906 | ACEITE SOJA REFINADO 8, PRODUCTOS VARIOS 7, AGUA INDUSTRIAL 6 |
| 2026-10-03 | excel | 133 | 19 | 553 | AGUA INDUSTRIAL 6, GLICERINA 5, METANOL 5 |
| 2026-10-04 | excel | 117 | 19 | 585 | GLICERINA 8, AGUA INDUSTRIAL 5, METANOL 5 |
| 2026-10-05 | excel | 187 | 43 | 960 | PRODUCTOS VARIOS 14, AGUA INDUSTRIAL 7, ACEITE GIRASOL REFINADO 7 |
| 2026-10-06 | excel | 180 | 38 | 841 | PRODUCTOS VARIOS 11, ACEITE GIRASOL REFINADO 7, AGUA INDUSTRIAL 6 |
| 2026-10-07 | excel | 95 | 34 | 818 | ACEITE GIRASOL REFINADO 9, PRODUCTOS VARIOS 7, GLICERINA 7 |
| 2026-10-08 | excel | 140 | 38 | 752 | PRODUCTOS VARIOS 12, ACEITE GIRASOL REFINADO 9, AGUA INDUSTRIAL 6 |
| 2026-10-09 | excel | 135 | 35 | 796 | PRODUCTOS VARIOS 11, ACEITE GIRASOL REFINADO 9, AGUA INDUSTRIAL 6 |
| 2026-10-10 | excel | 64 | 10 | 289 | AGUA INDUSTRIAL 6, GLICERINA 4 |
| 2026-10-11 | excel | 20 | 11 | 315 | AGUA INDUSTRIAL 5, GLICERINA 5, ACIDO CLORHIDRICO 1 |
| 2026-10-12 | excel | 15 | 6 | 173 | AGUA INDUSTRIAL 3, GLICERINA 3 |
| 2026-10-13 | excel | 90 | 21 | 448 | PRODUCTOS VARIOS 9, ACEITE SOJA REFINADO 7, AGUA INDUSTRIAL 4 |
| 2026-10-14 | excel | 91 | 25 | 525 | PRODUCTOS VARIOS 8, ACEITE SOJA REFINADO 7, AGUA INDUSTRIAL 5 |
| 2026-10-15 | excel | 101 | 24 | 577 | ACEITE SOJA REFINADO 7, PRODUCTOS VARIOS 6, AGUA INDUSTRIAL 5 |
| 2026-10-16 | excel | 99 | 26 | 559 | PRODUCTOS VARIOS 7, ACEITE SOJA REFINADO 7, AGUA INDUSTRIAL 4 |
| 2026-10-17 | excel | 139 | 19 | 527 | AGUA INDUSTRIAL 5, METANOL 5, PRODUCTOS VARIOS 3 |
| 2026-10-18 | excel | 81 | 8 | 244 | AGUA INDUSTRIAL 5, METANOL 3 |
| 2026-10-19 | sgc | 47 | 11 | 279 | ACEITE GIRASOL REFINADO 4, AGUA INDUSTRIAL 3, PRODUCTOS VARIOS 2 |
| 2026-10-20 | sgc | 124 | 17 | 476 | ACEITE GIRASOL REFINADO 7, AGUA INDUSTRIAL 3, ACEITE SOJA REFINADO 2 |
| 2026-10-21 | sgc | 205 | 36 | 986 | ACEITE GIRASOL REFINADO 14, AGUA INDUSTRIAL 5, PRODUCTOS VARIOS 4 |
| 2026-10-22 | sgc | 196 | 27 | 778 | ACEITE GIRASOL REFINADO 10, GLICERINA 6, AGUA INDUSTRIAL 5 |
| 2026-10-23 | sgc | 183 | 22 | 553 | ACEITE GIRASOL REFINADO 9, AGUA INDUSTRIAL 7, PRODUCTOS VARIOS 3 |
| 2026-10-24 | sgc | 166 | 11 | 247 | AGUA INDUSTRIAL 7, PRODUCTOS VARIOS 2, SOLVENTE HEXANO 2 |
| 2026-10-25 | sgc | 81 | 6 | 137 | AGUA INDUSTRIAL 5, PRODUCTOS VARIOS 1 |
