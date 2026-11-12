# Plan · un solo reconocedor para toda consulta de camiones

Estado: **listo para ejecutar** (escrito el 10/11/2026). Pensado para que lo ejecute un agente sin contexto previo,
fase por fase. Leer antes: `docs/SISTEMA_NODO_SUR.md` (mapa) y `docs/RECONOCEDOR_RECORRIDO_CAPTURA.md` (definición
acordada de las capas; si algo cambia, se cambia ahí primero).

## Objetivo

Toda consulta de camiones por cámara (comités, informes, cruces, En vivo, agentes) usa **el mismo mecanismo**:

1. **Paso 0 · lote**: quién puede venir (cartas → base sin carta → sistema de camiones) y qué recorrido debe hacer.
2. **Ensamblador de pasos**: evento + alertas contiguas + frontal/trasera + repeticiones = un paso. Marca, color y
   tipo salen **de las alertas** (nunca una consulta al DSS por captura).
3. **Capas**: 2 exacta → 3.1 parecidas → **3.2 asignación por lote (vínculo)** → 3.3 banco → 4 alerta.

Nadie lee `data/truckflow/<día>/event-list.json` crudo para decidir qué camión pasó por dónde.

## Diagnóstico (revisado el 10/11 sobre el código de `automatizacion`)

**En vivo ya corre el mecanismo** (`server/plantState/service.mjs`, `identifyRaw`): suma las alertas como lecturas
y sus atributos (`alertReadEvents`, `withAlertAttributes`), ensambla pasos (`ensamblarPasos`), corre capa 2/3.1/3.3
(`identifyFragments`, con el universo ampliado `universoExtra31` armado en `truckflow-local-server.mjs:334`) y aplica
el lote (`applyVinculo`, con `vinculoLive` cada 5 min y los viajes sin carta por `VINCULO_EXTRA`).

Lo que **no** funciona así:

| # | Falla | Dónde |
|---|---|---|
| A | En vivo, la evidencia de marca/color (`autoEvidenceTick`) le pregunta al DSS por cada captura, aunque cada ítem y cada candidato ya traen `attributes` de las alertas. | `server/dssPhotoLookup.mjs` (`computeEvidence`, `autoEvidenceTick`) |
| B | El resultado del reconocedor no queda guardado por día en un lugar fijo: cada análisis vuelve a correr el replay en una carpeta distinta de `reportes/`. | `scripts/replay-capas-dia.mjs` |
| C | **~40 scripts leen `event-list.json` crudo** y usan la patente como la leyó la cámara: no ven alertas, traseras, correcciones ni lote. Entre ellos los del Comité de Seguridad y varios del de Logística. | lista en la fase 3 |
| D | El replay puede correr degradado sin avisar: sin sistema de camiones del día (fin de semana), sin `data/padron/<día>.json`, con el día de cámaras cortado. | `scripts/replay-capas-dia.mjs` |
| E | Nada impide que un script nuevo vuelva a leer el crudo. | — |

Ya corregido el 10/11 (no rehacer): rótulo 3.2 = lote en `CAPA_DE_REGLA` (`replay-capas-dia.mjs`) y en
`informe-capas-dias.mjs`; `attrsAt` del replay lee las alertas (1 min por día en vez de 14);
`scripts/seguridad-sin-registro/conteo-bases.mjs` y `revisar.mjs`; `scripts/sgc/csv-a-ingresos.cjs`;
`scripts/padron/padron-dias.mjs`; receta semanal en `docs/SISTEMA_NODO_SUR.md` §5.2.

## Reglas para quien ejecute

- Rama `automatizacion`. **No commitear ni pushear sin que el usuario lo pida**; al terminar cada fase, avisar qué cambió.
- No reiniciar el servidor 8787 sin avisar (lo usan otras sesiones). MongoDB local tiene que estar arriba.
- Sistema de camiones (SGC): nunca rangos de más de 5 días por consulta (`scripts/sgc/consultar_rango.py` ya parte).
- No cambiar la lógica de las capas ni los umbrales: este plan solo **unifica por dónde pasa todo**.
- Una fase por vez, con su verificación. Si una verificación no da, parar y avisar; no «arreglar» el número.
- `data/padron/`, `data/sgc/`, `data/truckflow/` y lo nuevo `data/reconocido/` están fuera de git.

## Línea de base para verificar (replay del 10/11, carpeta `reportes/reconocimiento-capas/semana-02-08/`)

| Día | Pasos | Capa 2 | 3.1 | 3.2 | 3.3 | Leída | Errónea | Capa 4 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-11-04 | 3428 | 2618 | 278 | 168 | 16 | 39 | 136 | 173 |
| 2026-11-07 | 2781 | 2125 | 220 | 138 | 3 | 1 | 117 | 177 |

(Los `capas.json` de esa carpeta se generaron antes del cambio de rótulo: ahí el vínculo figura como 3.1; al
re-correr con el código actual tiene que dar estos números.) Si después de una fase el 04/11 no da igual, la fase
rompió algo.

---

## Fase 1 · El «día reconocido» como dato fijo

**Qué:** un comando único deja el resultado del reconocedor en `data/reconocido/<día>/` y se niega a correr degradado.

1. Crear `scripts/reconocer.mjs` (`npm run reconocer -- DESDE HASTA [--forzar]`), que por cada día:
   - **Verifica entradas** y corta con un mensaje que diga el comando que falta:
     - `data/truckflow/<día>/event-list.json` y `alert-list.json` existen, y el último `createdAt` del `alert-list`
       es ≥ 23:30 del día (día completo). Si no: `POST http://127.0.0.1:8787/api/truckflow/export-period`.
     - `data/padron/<día>.json` existe. Si no: bajar cartas (`scripts/cruce-cartas-sin-carta/bajar-cartas-api.mjs`)
       y `node scripts/padron/padron-dias.mjs <cartas.json> <día>`.
     - `data/sgc/<día>/ingresos.json` existe. Si no: `consultar_rango.py` + `scripts/sgc/csv-a-ingresos.cjs` +
       `scripts/sgc/traer-sgc-vm.mjs`. Con `--sin-sgc` sigue, pero marca el día como `sinSgc: true`.
     - MongoDB responde en `127.0.0.1:27017`.
   - Corre `scripts/replay-capas-dia.mjs <día> data/reconocido/<día>` (proceso hijo, `--max-old-space-size=8192`),
     de a un día por vez.
   - Escribe `data/reconocido/<día>/manifest.json`: `{ dia, generadoAt, sinSgc, entradas: { <archivo>: { size, mtimeMs } }, codigo: <hash corto de git HEAD> }`
     con event-list, alert-list, padrón (día −2…+1), sgc (día −2…+2), `corregidos.json`, `no-camiones.json`.
   - Si el manifest existe y las entradas no cambiaron, **no** vuelve a correr (salvo `--forzar`).
2. En `scripts/replay-capas-dia.mjs`, agregar a cada elemento de `pasosDetalle`:
   - `ids`: ids de los registros del feed (`event-list`) que forman el paso, y `alertIds`: los de alerta.
   - `journeyUid` del registro principal del feed (o `null` si el paso solo llegó por alerta).
   - `base`: `'carta' | 'permitidos' | 'sgc' | 'ninguna'` de la patente final, con la misma regla que
     `baseDe` en `scripts/seguridad-sin-registro/conteo-bases.mjs` (mover esa función a
     `server/reconocedor/baseDe.mjs` y usarla desde los dos).
   - `attributes` del paso (marca, color, tipo), si los tiene.
3. `package.json`: `"reconocer": "node scripts/reconocer.mjs"`.

**Verificación:** `npm run reconocer -- 2026-11-04 2026-11-04` da la línea de base; una segunda corrida no re-procesa;
borrar `data/sgc/2026-11-04` (moverlo a un lado) hace que corte con el mensaje del comando. Dejar todo como estaba.

## Fase 2 · Un solo lector

**Qué:** dos módulos (JS y Python) por los que pasa cualquier script que quiera lecturas de cámaras.

1. `server/reconocedor/lecturas.mjs`:
   - `pasosReconocidos(desde, hasta, { root })` → pasos de `data/reconocido/<día>/capas.json` de esos días, sin los
     de capa `lectura_erronea`. Si falta un día o su manifest está vencido (entradas cambiadas), **lanza un error**
     con el texto `Falta reconocer <día>: npm run reconocer -- <día> <día>`.
   - `eventosReconocidos(desde, hasta, { root })` → los registros de `event-list.json` **con la misma forma de
     siempre**, pero: `truckPlate` y `normalizedPlate` = patente final del paso (la original queda en
     `truckPlateLeida`); se descartan los registros de pasos `lectura_erronea`; se agregan como registros
     sintéticos los pasos que solo llegaron por alerta y tienen patente final (`deviceCode`, `occurredAt` =
     hora operativa − 206 min, `eventCategory: 'physical'`, `soloAlerta: true`); cada registro lleva `capa`,
     `detalle` y `base`. Es el reemplazo directo de leer el archivo crudo.
2. `scripts/estado-planta/reconocido.py`: lo mismo para Python (`pasos_reconocidos`, `eventos_reconocidos`).
3. Tests (`server/reconocedor/lecturas.test.mjs`, vitest): con un `capas.json` y un `event-list` chicos de ejemplo,
   que la patente corregida reemplace a la leída, que la errónea desaparezca, que el paso solo-alerta aparezca y
   que un día faltante lance el error.

**Verificación:** `npx vitest run server/reconocedor`; y para el 04/11, contar patentes distintas con
`eventosReconocidos` contra el crudo e informar la diferencia (no hay número esperado: es para el usuario).

## Fase 3 · Pasar los scripts activos al lector único

Cambiar **solo la carga de datos** (la función que hoy abre `event-list.json`) por `eventosReconocidos` /
`eventos_reconocidos`. No tocar la lógica de cada script. Si el script tenía su propio parche de correcciones
(por ejemplo `corrections` en `comite-seguridad-deteccion.ts` línea ~87, o `ren` en `seguridad-doble-ciclo.py`),
dejarlo apagado detrás de una variable de entorno, no borrarlo.

Orden (primero Seguridad, que es lo que se presenta esta semana):

| Grupo | Archivos |
|---|---|
| Seguridad | `scripts/estado-planta/comite-seguridad-deteccion.ts` (carga en línea ~63), `scripts/estado-planta/seguridad-doble-ciclo.py` (~20), `scripts/estado-planta/vehiculos-sin-sistema.ts`, `scripts/cruce-cartas-camaras/viajes-sin-carta.mjs`, `scripts/seguridad-sin-registro/recorrido.mjs` |
| Logística (los llama `comite_semana.py`) | `metricas-camaras.cjs`, `liquidos-puntos.py`, `liquidos-ricardone-ingresos.py`, `tramos-circuitos.py`, `calles-volcables-sgc.py`, `otros-productos.py`, `silos-internos.py` (todos en `scripts/estado-planta/`) |
| Informes | `scripts/informe-diario.ts`, `scripts/informe-reconocimiento-camaras.ts` (este compara leído contra real: usar `truckPlateLeida`) |

No migrar (son el propio reconocedor, sus insumos o históricos): `scripts/replay-*.mjs`, `scripts/vinculo/*`,
`scripts/cruce-sistema-truckflow/*`, `scripts/demostracion/*`, `scripts/repair-missing-journey-uid.mjs`,
`scripts/padron/armar-bases-backoffice.mjs`, `scripts/audit-*.mjs`, `scripts/find-*.mjs`, el ETL
(`run-etl-headless.ts`, `contract-first-cli-runner.ts`, `run-truckflow-transform-local.mjs`), `server/*`, `src/*`.

**Verificación por script:** correrlo para 2026-11-02 → 2026-11-08 antes y después, guardar las dos salidas y
dejar un resumen de qué cambió (casos que aparecen, casos que desaparecen) en
`reportes/reconocedor-unico/<script>.md`. El usuario decide si el cambio es correcto; no ajustar para que dé igual.

## Fase 4 · En vivo

1. **Evidencia sin DSS (falla A).** En `server/dssPhotoLookup.mjs`, `computeEvidence` usa primero
   `item.attributes` y `candidate.attributes` (ya vienen de las alertas vía `rowsAttributes` en
   `plateIdentification.mjs`). Al DSS va solo si faltan los dos **y** `EVIDENCE_DSS=1`. Las fotos para mostrar en la
   tarjeta siguen saliendo del DSS (eso no cambia).
2. **El día cerrado queda reconocido solo.** En `server/truckflow-local-server.mjs`, una tarea que a las 03:45
   (cuando ya llegó lo de la noche) corre `scripts/reconocer.mjs` para el día anterior como proceso hijo, si
   `RECONOCER_AUTO !== '0'`. Si falla, lo registra en el log con el motivo.
3. **Consulta por API.** `GET /api/truckflow/reconocido?desde=&hasta=&patente=` → pasos de
   `pasosReconocidos` (404 con el comando a correr si falta el día). Es lo que tienen que usar los agentes.
4. Revisar que la página En vivo no muestre rótulos viejos de capa (buscar `atributos_dss` y `3.1` en `src/`).

**Verificación:** `npx vitest run server` (fallan 3 desde antes: reportWorkbook, reducer backlog, relevanceCleaner;
no deben fallar otros). Con el server arriba 10 minutos, en el log no hay consultas `[identificación] … con DSS`
y `GET /api/truckflow/reconocido?desde=2026-11-04&hasta=2026-11-04` devuelve 3.292 pasos (3.428 menos 136 erróneas).

## Fase 5 · Que no se pueda volver atrás

1. `scripts/check-lectores-crudos.mjs`: lista los archivos de `scripts/`, `server/`, `agentes/` que mencionan
   `event-list` y no están en la lista permitida de la fase 3 («No migrar») ni son el lector único; sale con error
   si encuentra alguno. `package.json`: `"check:lectores": "node scripts/check-lectores-crudos.mjs"`.
2. Herramienta MCP `camiones_reconocidos(desde, hasta, patente?)` en el servidor MCP `etl` (carpeta `agentes/`),
   que llama al endpoint de la fase 4.3.
3. Documentos: en `CLAUDE.md`, que la regla «Camiones por cámara» apunte a `npm run reconocer` y al lector único;
   en `docs/SISTEMA_NODO_SUR.md` §4 y §6, la fila «Cámaras crudas del día» pasa a decir que se usan solo a través
   de `data/reconocido/`; reemplazar los pasos 4–5 de la «Receta semanal» por `npm run reconocer`.

**Verificación:** `npm run check:lectores` pasa; un archivo de prueba que lea `event-list.json` lo hace fallar.

---

## Qué queda afuera (decisiones del usuario, no tocar en este plan)

- Alerta por vehículo y no por captura (`docs/CONTINUAR_2026-11-05_reconocedor-en-vivo.md`, pendiente 1).
- El ETL de semanas (`runs/windows`) y las tools `mcp__etl__*` de tablas: siguen con sus datos; lo de camiones por
  cámara va por `camiones_reconocidos`.
- Pasar el cruce de «quién es» del sistema de camiones al padrón (pendiente 6 del mapa).
