# Recorrido de una captura en el reconocedor (En vivo)

Qué le pasa a cada captura de cámara desde antes de que exista hasta que termina como **paso guardado**,
**lectura errónea** o **alerta**. Es la definición acordada el 04/11/2026; el replay por capas
(`scripts/replay-capas-dia.mjs`) y el servidor (`server/plantState/service.mjs`) corren el mismo recorrido.
Si algo cambia, se cambia acá primero.

## Resumen en una línea por paso

| Paso | Qué hace | Dónde vive |
|---|---|---|
| 0 · Lote | Antes de la captura: quién puede venir y qué recorrido debería hacer | vínculo (`scripts/vinculo/cobertura.mjs`, `server/live/vinculo/`) |
| 1 · Cámara | Lee una patente (o algo) | DSS → TruckFlow |
| 2 · TruckFlow + ensamblador | Arma el paso: evento + alertas contiguas + frontal/trasera + repeticiones | `server/plantState/pasos.mjs`, `alertReads.mjs` |
| Capa 2 | Comparación exacta: cartas → bases → lote → SGC al final | `padronCartas.mjs`, `vehiculosPermitidos.mjs`, `backofficeIndex.mjs` |
| 3.1 | Primera corrección: errores comunes contra las patentes esperadas | `plateIdentification.mjs` (`weightedEditCost`, `CONFUSABLE` + aprendidas) |
| 3.2 | Asignación por lote: la captura va al paso pendiente del camión correcto | `applyVinculo` (`vinculoLive.mjs`) |
| 3.3 | Banco: corregidas por operaciones, confusiones de siempre | `aprendizaje.mjs` (`corregidos.json`, `learnConfusions`) |
| 3.4 | IA por imagen (apagada, `VISION_IA=1`) | `server/live/vision/` |
| ↺ | Toda corrección vuelve a la capa 2 | — |
| Final | Paso guardado · Lectura errónea confirmada · Alerta (capa 4) | `erroneasConfirmadas.mjs`, `alertStore.mjs` |

## Paso 0 · Lote (antes de la captura)

El lote es el universo de camiones que pueden aparecer y, para cada uno, el **recorrido previsto** (los nodos
que tiene que pisar). Sin recorrido previsto no se puede poner una patente en el camión correcto.

- Universo, en este orden: **carta de porte** vigente → **base sin carta** (MongoDB `backoffice_sin_carta`,
  solo si se vio ese día) → **SGC** como última instancia (visita de balanza que no está ni en carta ni en
  bases). Particulares no van al lote (no tienen recorrido de camión).
- Los viajes sin carta se arman en `server/live/vinculo/viajesSinCarta.mjs` (`viajesSinCarta`) y le llegan
  al vínculo por `VINCULO_EXTRA` (ctg `BASE:<patente>` o `SGC:<patente>:<ingreso>`, con `origen`).
- Recorrido previsto: el vínculo ajusta el circuito con los nodos vistos (carta + historial del camión).
  Cada paso esperado queda como `camara`, `reconstruido`, `deducido`, `en_curso` o `falta`.
- En vivo: lo rearma `vinculoLive` cada 5 min (`getExtra: armarLoteSinCarta` en el servidor).

## Paso 1 y 2 · Cámara, TruckFlow y ensamblador

TruckFlow entrega el evento del feed y, aparte, las alertas del DSS (las lecturas que no armaron journey,
con marca, color y tipo). El ensamblador (`pasos.mjs`) une en un solo **paso**:

- el evento y las alertas contiguas de esa cámara,
- frontal y trasera del mismo nodo (trasera 10–60 s),
- las repeticiones de la misma cámara; una lectura sin formato muy parecida (≥ 0,5, `REPEAT_SIMILARITY`)
  a la patente válida del paso es repetición, no un vehículo nuevo.

Hora operativa = `occurredAt` + 206 min; hora de alerta = campo UTC de la cámara + 3 h + 240 s.

## Capa 2 · Comparación exacta

Solo igualdad (normalizada): carta de porte vigente del día → Vehículos Permitidos (autorizaciones de
portería/comercial y las dos bases del back office) → lote → **Respaldo SGC** al final. Si coincide: paso
guardado. La lista histórica de balanza ya no da permiso.

## Capa 3 · Solo si la lectura vino mal

**3.1 Primera corrección.** Errores de lectura documentados (letra confundida, falta, sobra) contra las
patentes esperadas: cartas vigentes, base sin carta, particulares vistos ese día ±1 h y SGC dentro de su
visita (`universoExtra31`). Las confusiones de siempre (`CONFUSABLE`) más las aprendidas de las correcciones
de operaciones (`learnConfusions`, ≥ 3 veces: hoy DO 38 IT BD 89 08 CG 04 OQ NR EF EL).
Con todos los particulares de la base el 03/11 solo el 26 % de las correcciones era plausible; limitado a los
vistos ese día ±1 h, 81 %.

**3.2 Asignación por lote.** El vínculo asigna la captura (también la que solo llegó como alerta y no tiene
formato de patente) al paso pendiente del camión que corresponde; marca y color pesan. Umbral 0,5
(`VINCULO_MIN_PROB`). Corre **antes** de separar las lecturas ilegibles.

**3.3 Banco.** Lecturas ya corregidas por operaciones (`data/padron/corregidos.json`), no camiones
(`no-camiones.json`) y las patentes que siempre fallan.

**3.4 IA por imagen.** Opus por CLI, nunca API. Apagada.

Toda patente corregida vuelve a la capa 2 (`vuelveA` en el replay).

## Final

- **Paso guardado:** lo resolvió la capa 2 o una corrección de la capa 3.
- **Lectura errónea (confirmada):** solo cuando sabemos de qué paso es. Una lectura ilegible sin asignar es
  errónea confirmada si la **misma cámara** leyó un paso guardado dentro de su ventana, o el **mismo nodo**
  dentro de 60 s (`server/plantState/erroneasConfirmadas.mjs`):
  - 5 min en cámaras donde el camión se detiene: balanzas, calada, playas, TK400, volcables, carga/descarga;
  - 60 s en cámaras de paso.
  También la descartada por operaciones.
- **Alerta (capa 4):** todo lo demás, con los datos para completar el paso perdido. Las ilegibles seguidas
  en la misma cámara (dentro de su ventana) son **una sola alerta** (`agrupa`). Tipos: `lectura_ilegible`,
  `camion_granos_sin_carta`, lectura dudosa, sin registro.

En el servidor: `getIdentifications(site)` devuelve `items` (bandeja de operaciones), `erroneas` (alertas de
ilegibles, una por racimo) y `erroneasConfirmadas` (cuántas se unieron a un paso). `refreshAlerts` manda
`items` + `erroneas` al `alertStore`.

## Interruptores

| Variable | Por defecto | Efecto |
|---|---|---|
| `LOTE_UNIVERSO=0` | prendido | lote solo con cartas (sin base sin carta ni SGC) |
| `UNIVERSO_31=0` | prendido | 3.1 solo contra cartas |
| `VINCULO_ANTES=0` (replay) | prendido | el vínculo mira después de descartar las ilegibles (como antes) |
| `ERRONEA_CONFIRMADA=0` (replay) | prendido | sin unir ilegibles a pasos guardados ni agrupar alertas |
| `VINCULO_APPLY=0` / `VINCULO_LIVE=0` | prendido | sin vínculo en vivo |
| `LOTE=1` (replay) | apagado | lote viejo (balanza + recorrido por producto), solo para comparar |

## Cómo medir un día

```bash
node --max-old-space-size=8192 scripts/replay-capas-dia.mjs 2026-11-03
```

Necesita MongoDB local (bases del back office) y, para metadatos, el 8787 arriba. Deja
`reportes/reconocimiento-capas/<día>/capas.json`: `porCapa`, `porDetalle`, `alertas`, `loteVinculo`
(estado de los pasos esperados por origen), `viajesSinCarta` y cada paso en `pasosDetalle`.

## Resultados (replay)

«Antes» = recorrido del 03/11 a la mañana (ilegibles de alerta descartadas sin mirar, lote solo cartas,
3.1 solo cartas). «Ahora» = este documento.

| | 02/11 antes | 02/11 ahora | 03/11 antes | 03/11 ahora |
|---|---|---|---|---|
| Pasos | 4410 | 4396 | 2782 | 2756 |
| Correcciones (capa 3) | 356 | 567 | 232 | 379 |
| Asignadas por el lote (vínculo) | 24 | 207 | 9 | 130 |
| Captura errónea tirada sin mirar | sí | 0 | 367 | 0 |
| Lectura errónea confirmada | — | 143 | — | 100 |
| **Alertas** | 63 | **184** | 96 | **212** |

Por capa «ahora»: 02/11 = capa 2 3488, 3.1 493, 3.2 24, 3.3 33, errónea 143, alerta 197 filas (184 alertas);
03/11 = capa 2 2046, 3.1 354, 3.2 4, 3.3 17, errónea 100, alerta 219 filas (212 alertas).

Composición de las alertas «ahora»: 03/11 = 121 ilegibles sin asignar (+7 en la misma alerta),
65 sin registro, 26 lectura dudosa; 02/11 = 126 ilegibles (+13), 33 sin registro, 25 dudosas.
Las correcciones de 3.1 dan 80–81 % plausibles (la patente final está en carta/base del día).

Sin mitigar (todas las ilegibles sin asignar como alerta) eran 319 (03/11) y 323 (02/11). Las alertas que
suben respecto de «antes» son capturas que antes se tiraban sin mirar: ahora o se unen a un paso guardado
o quedan para completar pasos perdidos.

Lote (`loteVinculo`, pasos esperados por estado), 03/11: carta 159 viajes (1160 por cámara, 85
reconstruidos, 72 deducidos, 3 faltan); base sin carta 29 viajes (102 cámara, 9 faltan); SGC 11 viajes con
lecturas de 204 ofrecidos. 02/11: carta 182, base 37, SGC 12 de 189.

## Abierto

- Viajes SGC en el lote casi no reciben lecturas (03/11: 11 de 204 ofrecidos). Investigar si la ventana o el circuito
  ajustado los deja afuera.
- La ventana de 5 min en cámaras de parada puede unir la ilegible de un segundo camión al paso del primero;
  ese camión, si tiene carta, lo completa el lote como `deducido`.
- En vivo, los «pasos guardados» para confirmar erróneas son las lecturas válidas del feed y los ítems
  asignados (el replay usa capa 2/3); puede confirmar algunas más que el replay.
