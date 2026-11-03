# Continuar: reconocedor por pasos, universo del 02/11 y vínculo (03/11/2026)

Traspaso de la sesión del 03/11 (rama `automatizacion`). Todo lo de abajo está commiteado salvo lo marcado como
pendiente. Para seguir, leer primero «Dónde quedamos» y «Siguiente paso».

## Dónde quedamos

- **En vivo usa el reconocedor de patentes, no el vínculo.** El reconocedor (`server/plantState/plateIdentification.mjs`)
  es conservador: si no llega al 60 % deja la captura sin asignar. El 02/11 dejó 542 pasos sin identificar y ahí estaban
  casi todos los huecos de los recorridos (Volcables SL de la soja: 26 de 28 huecos tenían una captura sin asignar).
- **El algoritmo que reconstruye bien es el vínculo** (`scripts/vinculo/cobertura.mjs`, unido desde la rama
  `claude/dss-vinculo-e5702c` en el commit `9cfc3e7`): cartas de porte como universo y cada captura sin dueño al camión
  más probable. El 02/11: 159 camiones con carta, **149 de 150 viajes terminados completos (99,3 %), 1.370 de 1.371 pasos
  (99,9 %)** — cámara 86 %, reconstruido 9 %, deducido 3 %. Lista camión por camión:
  `reportes/reconocimiento-pasos/2026-11-02/recorridos-vinculo.md`.
- **Falta llevar el vínculo al envío de En vivo** (era la pregunta con la que empezó la sesión: «¿se usa el algoritmo en
  el envío?»). Hoy corre solo como script.

## Siguiente paso: el vínculo en el envío

> **Hecho el 03/11 (camino 1):** `server/live/vinculo/vinculoLive.mjs` corre `cobertura.mjs` cada 5 min sobre lo que
> el servidor tiene en memoria (lecturas + alertas de las dos plantas y las cartas del padrón; `VINCULO_OUT` para no
> escribir en reportes/) y el servicio aplica sus asignaciones como capa `vinculo` a lo que el reconocedor dejó sin
> resolver (≥ 50 %, `VINCULO_MIN_PROB`; por debajo queda como sugerencia y se ve en Alertas). Estado:
> `GET /api/truckflow/live/vinculo`. Apagar: `VINCULO_LIVE=0` (no corre) o `VINCULO_APPLY=0` (corre, no aplica).
> Primera corrida: 260 camiones con carta, 1.310 capturas, 1,3 s; asignó 25 casos que el reconocedor dejaba abiertos.
> Lo que sigue abierto son sobre todo patentes válidas «fuera del sistema» (98 livianos → Vehículos Permitidos;
> 41 tamaño camión sin carta ni registro). Queda el camino 2 (núcleo en funciones puras) como mejora.

`cobertura.mjs` es un script de 530 líneas que corre de punta a punta (sin funciones exportadas). Por cada captura
repartida guarda en `cobertura.json` → `capturas[]` la cámara, la hora, la patente leída y `rivales` (camiones con su
probabilidad); por camión, `camiones[].status` (cámara / reconstruido / deducido / en curso / falta) y `huecos`.
Dos caminos:

1. **Tarea de fondo en el servidor** (rápido): cada N minutos correr el vínculo sobre el día que el servidor tiene en
   memoria (eventos + alertas + cartas del padrón) y usar sus asignaciones para completar los casos que el reconocedor
   dejó pendientes, como una capa nueva (`vinculo`) en `server/plantState/algorithmLayers.mjs`. Se aplican como links
   (`applyLinks`) o items asignados en `withIdentifications` (`server/plantState/service.mjs`).
2. **Núcleo en un módulo** (prolijo): separar de `cobertura.mjs` la carga de capturas, la clasificación por carta y el
   reparto de capturas sin dueño en funciones puras, y llamarlas desde `identifyRaw`.

Cuidado: el vínculo necesita las cartas vigentes (el padrón del día: `data/padron/<día>.json` o la API), no la copia
`data/arca/arca_consignment_notes.json` (llega al 27/10).

## Qué se hizo hoy (commits)

| Commit | Qué |
|---|---|
| `afbb34e` | **Ensamblador de pasos** (`server/plantState/pasos.mjs`): la unidad del reconocedor es el paso (repeticiones de la misma cámara, doble disparo con captura vacía, frontal + trasera del mismo nodo alineadas en orden de fila con el desfase medido por cámara y guarda de carta). La cuenta suma «otros esperados», acepta candidatos sin parecido para lecturas ilegibles y pesa marca + color del DSS. Apagar con `IDENTIFICATION_PASOS=0`. |
| `70cabd6` | Replay de un día por pasos, cruce con el sistema de camiones (SGC), fotos del DSS y clasificación manual por foto como fuente del aprendizaje. |
| `9cfc3e7` | Unión de la rama del vínculo + `VINCULO_CARTAS` en `cobertura.mjs`. |
| (este) | Scripts de recorridos y cruce con el padrón, reportes del 02/11, copia de la clasificación y este traspaso. |

El servidor en vivo (8787) se reinició con el ensamblador (`pnpm run server:truckflow`, pestaña «servidor en vivo» del
panel de la terminal).

## Hallazgos que conviene no volver a descubrir

- **El feed de Enesimal (`journey-event`) nunca trae traseras**: llegan solo como alertas (`LPR_MALFUNCTION`,
  `UNMATCHED_TAIL_OBSERVATION`, `TRAILER_MISMATCH`). Los eventos no traen `eventId` ni marca/color; las alertas sí
  (payload del DSS). Pedido pendiente a Enesimal: que `journey-event` traiga el `eventId` de la cámara.
- En 6 h, más de un tercio de las lecturas reales llega solo como alerta (Ricardone 137 de 385, San Lorenzo 282 de 739).
  `journey-event/list` filtra por `occurredAt` (206 min atrasado): para comparar con alertas, filtrar las dos por `createdAt`.
- **La trasera se lee 10–60 s después de su frontal** (pares confirmados por la carta chasis ↔ acoplado);
  `SLZBalIngTras` ≈ 0 s. Los pares de `TRAILER_MISMATCH` de Enesimal daban ~17 min: están mal emparejados.
- **En la balanza de San Lorenzo las cámaras leen la cola**: la trasera lee la patente delantera del camión que sigue y la
  frontal al de atrás a segundos (DN828 era MDN828, no EQE422).
- **La portería de San Lorenzo lee entrada y salida** (Egreso SL antes de la balanza = entrada).
- **Recorridos reales del 02/11** (no los del catálogo de circuitos):
  - Soja: Ingreso → Preingreso → Calada → Salida 2 → Ingreso SL → Balanza ingreso SL → Volcables SL → Balanza egreso SL → Egreso SL (R7).
  - Girasol de silos: Ingreso → Preingreso → pasa por Salida 2 → Playa 3 → Balanza → sale por Salida 1 (sin cámara) → puerto. Casi nunca Calada. En Celda 16 no se espera nada.
- Caso I91 (Silo Keppler, 10:31–10:34): 5 alertas de un camión Volkswagen blanco; el reconocedor viejo las daba a
  NKU970 (Naveco) con 96 % y era FXL391. Con el ensamblador + la cuenta nueva quedan en un solo paso, pendiente.

## Universo del 02/11 (clasificación manual por foto)

- Replay: `node scripts/replay-pasos-dia.mjs 2026-11-02` → `reportes/reconocimiento-pasos/2026-11-02/pasos-por-camion.*`.
- Cruce con el SGC: `node scripts/cruce-pasos-sgc.mjs 2026-11-02` → `cruce-sgc.*`.
- Fotos del DSS (vía el server): `node scripts/fotos-pasos-dss.mjs 2026-11-02 "<regex de quien>" [salida.json]`
  (las fotos quedan en `reportes/reconocimiento-pasos/2026-11-02/fotos/`, 100 MB, no commiteadas).
- Páginas de clasificación (artifacts privados): https://claude.ai/artifact/D9aYMWumMqwXBe727Ayzqo (88 fuera del SGC) y
  https://claude.ai/artifact/Y47tsjJJKgJMcqmdAS4qV6 (51 por confirmar, con la patente parecida del SGC).
- Lo clasificado va a `data/padron/clasificacion-manual.json` (ignorado en git; **copia en
  `reportes/reconocimiento-pasos/2026-11-02/clasificacion-manual.json`**) y lo toma `server/live/padron/aprendizaje.mjs`:
  camión → patente real, `real` → par lectura mala → camión, auto/moto/máquina/otro → no camiones.
  Rearmar a mano: `node server/live/padron/aprendizaje.mjs`.
- Resultado: «sin registro» 138 → 14. Pendientes de decidir: AF708IV, AF798IV (nota con su misma patente, sin tipo),
  TNE931, ELU998; 6 sin foto en el DSS (AF316PR, MKV260, MZJ130, NWZ036, OVS998, PHM505).

## Decisiones del usuario

- Por ahora el cruce va contra el sistema de camiones (SGC). **En el flujo real futuro**: cartas de porte + Vehículos
  Permitidos + «los que llevan remito» (despachos y descargas sin carta; el usuario no quiere ese nombre, falta elegir
  otro: «Cargas sin carta», «Movimientos autorizados», «Despachos y descargas autorizados»). Script listo:
  `scripts/cruce-pasos-padron.mjs` (separa `vehiculos-permitidos.json` en Permitidos y remito por categoría de producto,
  más `data/padron/autorizaciones.json`, que hoy no existe).
- Reconstruir recorridos con el vínculo, no con el reconocedor ni con el catálogo de circuitos.

## Scripts y reportes

| Archivo | Para qué |
|---|---|
| `scripts/replay-pasos-dia.mjs` | Día entero (24 h del microservicio) con ensamblador + reconocedor, camión por camión; guarda `pasosDetalle` y `sueltos` (pasos sin identificar). |
| `scripts/cruce-pasos-sgc.mjs` / `scripts/cruce-pasos-padron.mjs` | Quién es cada «sin registro» contra el SGC (hoy) o contra el padrón (futuro). |
| `scripts/fotos-pasos-dss.mjs` | Una foto del DSS por patente. |
| `scripts/recorridos-faltantes.mjs` | Recorrido por viaje contra el recorrido real del grupo (sale de los datos del día) y relleno simple de huecos. **Superado por el vínculo**: sirvió para ver que los huecos eran capturas sin asignar. |
| `scripts/vinculo/cobertura.mjs` | El vínculo. Un día con datos completos: `VINCULO_DATA=<carpeta con truckflow/<día>/{event,alert}-list.json completos> VINCULO_CARTAS=data/arca/api/cartas-<rango>.json node scripts/vinculo/cobertura.mjs DÍA DÍA`. El archivo local `data/truckflow/<día>` puede estar cortado (el del 02/11 llega a las 15:56); se baja completo del microservicio. Necesita una carpeta `dss-export` (puede estar vacía). |
| `reportes/reconocimiento-pasos/2026-11-02/` | pasos-por-camion, cruce-sgc, cruce-padron, recorridos, recorridos-vinculo, clasificacion-manual. |
| `reportes/vinculo/2026-11-02_2026-11-02/cobertura.json` | Salida completa del vínculo del 02/11. |

## Otras cosas abiertas

- Celda 16 y Volcable no tienen ninguna lectura en el día: confirmar si tienen cámara o está mal asociada al nodo.
- La rama `claude/lote-en-vivo` (lote en vivo, `loteCore.mjs`) sigue sin unir.
- El worktree `.claude/worktrees/dss-vinculo-e5702c` tiene un cambio sin commitear de otra sesión en
  `scripts/vinculo/simulador-server.mjs` (no se trajo).
- Las tarjetas de capturas de I91 siguen mostrando NKU970 desde el archivo de identificaciones (archivadas; no se aplican al plano).
- Tests: fallan dos desde antes de esta sesión (`reducer.test.mjs` capacidad 300 y `relevanceCleaner.test.mjs` sin suite).
