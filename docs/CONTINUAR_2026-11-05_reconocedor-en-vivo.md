# Continuar · reconocedor de En vivo (05/11/2026)

Dónde quedó el reconocedor de patentes de En vivo y qué falta. Rama `claude/laminas-vinculo`.
Antes de tocar nada, leer `docs/RECONOCEDOR_RECORRIDO_CAPTURA.md`: es la definición acordada del recorrido de
una captura (paso 0 lote → capa 2 exacta → 3.1/3.2/3.3/3.4 → paso guardado / lectura errónea confirmada / alerta).
Si algo cambia, se cambia ahí primero. Antecedente: `docs/CONTINUAR_2026-11-05_backoffice-y-capas.md`.

## Estado en vivo

- **El código está commiteado pero En vivo no lo corre todavía:** hay que reiniciar el 8787
  (`node server/truckflow-local-server.mjs`). Pedir permiso antes: el server lo comparte otra sesión.
  El 05/11 estaba apagado.
- **Decisión del usuario: no pasar a En vivo hasta limpiar las alertas.** Con lo commiteado quedan unas
  170–225 alertas por día; es demasiado (ver «Pendiente 1»).

## Últimos cambios (commits de esta rama)

| Commit | Qué hace |
|---|---|
| f013e24 | Trae el lote viejo de `claude/lote-en-vivo` y lo mide en el replay. Apagado (`LOTE=1` para comparar). |
| 3c559fc | **Recorrido acordado, en replay y En vivo.** Lote sin carta (base sin carta + SGC como última instancia, `server/live/vinculo/viajesSinCarta.mjs`, pasado al vínculo por `VINCULO_EXTRA`); 3.1 contra cartas + bases + particulares vistos ±1 h + SGC (`universoExtra31`); el vínculo mira las ilegibles antes de descartarlas (`service.mjs`); ilegible junto a un paso guardado de la misma cámara = lectura errónea confirmada (`server/plantState/erroneasConfirmadas.mjs`, ventana 5 min en cámaras de parada, 60 s en las de paso, mismo nodo 60 s); el resto va a Alertas agrupado por racimo (`refreshAlerts` manda `items` + `erroneas`, tipo `lectura_ilegible`); confusiones aprendidas (`learnConfusions`); `REPEAT_SIMILARITY` en el ensamblador. |
| 9b04c74 | **Respaldo SGC mira todas las lecturas del tramo** (`enBalanza` en `plateIdentification.mjs`), no solo la primera: AH829SU quedaba «sin registro» por leerse 35 min antes del ingreso. El replay guarda `cobertura.json` del vínculo. |

Interruptores: `LOTE_UNIVERSO=0`, `UNIVERSO_31=0`, `VINCULO_ANTES=0` (replay), `ERRONEA_CONFIRMADA=0` (replay),
`VINCULO_APPLY=0`, `VINCULO_LIVE=0`.

## Números (replay por capas, recorrido actual)

| Día | Pasos | Alertas | Errónea confirmada | Nota |
|---|---|---|---|---|
| 01/11 | 1828 | 169 | 112 | domingo; sin cartas del 01/11 en `data/padron` |
| 02/11 | 4396 | 179 | 143 | |
| 03/11 | 2756 | 212 | 100 | |
| 04/11 | 3428 | 225 | 131 | día re-bajado completo el 05/11 |

Composición del 03/11: 121 ilegibles sin asignar (+7 en la misma alerta), 65 sin registro, 26 dudosas.
Con foto propia: 93–95 % de los pasos de camiones con carta; dónde estuvo el camión: 99,8 %.

Correr un día: `node --max-old-space-size=8192 scripts/replay-capas-dia.mjs AAAA-MM-DD <carpeta>` (MongoDB
arriba). Tests: `npx vitest run server` (fallan 3 que ya fallaban: reportWorkbook, reducer backlog, relevanceCleaner).

## Pendiente (en orden)

1. **Alerta por vehículo, no por captura** (propuesto y aceptado en principio; no implementado). Alerta =
   (a) camión sin carta ni base visto en 2 o más pasos; (b) camión de granos sin carta (ya existe);
   (c) camión del lote con paso faltante: una alerta por camión («a X le falta Balanza») con las ilegibles
   cercanas como candidatas, el resto de ilegibles a un registro, no a Alertas; (d) dudosas que el lote no
   resuelve (si el candidato ya tiene pasos guardados ese día → «corregido por lote»). Livianos sin registro
   → cola de candidatos de particulares, no alerta. Estimado: 20–28 alertas/día el 03/11, 17–20 el 02/11.
   Medir en el replay de los cuatro días antes de llevarlo a En vivo.
2. **Respaldo SGC demasiado corto para líquidos:** `BEFORE_INGRESO_MS` = 30 min en `balanzaRegistry.mjs`.
   El 04/11 siete camiones de aceite de girasol (LKT119, PEA114, MRV482, AH717AW, AA996WD, LIF292, AH135DG)
   se leyeron ~2 h antes de su ingreso y quedaron «sin registro». Probar una ventana mayor (o por producto /
   visita del mismo día) y medir que no tape casos reales.
3. **Pasos deducidos (~110/día sin foto):** 36 sin captura en la ventana, ~45 con capturas guardadas en otro
   camión, ~20 con una alerta adentro (solo 21 alertas/día caen en un hueco). El replay ya guarda
   `cobertura.json` para cruzarlos.
4. Viajes SGC del lote casi no reciben lecturas (03/11: 11 de 204 ofrecidos).
5. Cartas: `data/padron/` empieza el 02/11; para días anteriores el replay usa el padrón del día siguiente.

## Anexo de seguridad

El informe de vehículos sin registro (01 al 04/11) y cómo repetirlo: `docs/ANEXO_SEGURIDAD_SIN_REGISTRO.md`.
