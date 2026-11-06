# Sistema Nodo Sur · mapa único (leer primero)

Punto de entrada para cualquier sesión: qué está prendido, cómo está armado En vivo, de dónde sale cada dato y cómo se
arman los comités. Vigente al **06/11/2026**. Si algo de acá cambia, se actualiza este documento en el mismo commit; los
demás documentos son el detalle (índice en la sección 7).

## 1 · Estado hoy

| Qué | Estado |
|---|---|
| Rama de trabajo | **`automatizacion`**, en GitHub y al día (06/11): se le unió `claude/laminas-vinculo`, que quedó igual. Lo nuevo va a `automatizacion`. |
| Servidor local 8787 (En vivo + API del ETL) | **Apagado** al 06/11. Se levanta con `node server/truckflow-local-server.mjs` (o `pnpm run server:truckflow`). Lo usan varias sesiones: avisar antes de reiniciarlo. |
| Reconocedor por capas (sección 3) | Commiteado y medido en el replay. **En vivo no lo corre todavía**: el usuario decidió no pasarlo hasta bajar las alertas (hoy 170–225 por día; objetivo: una alerta por vehículo, 17–28 por día). |
| Vínculo (lote: cada captura al camión más probable) | En el servidor desde el 03/11 (`f8d1a31`): corre cada 5 min y completa lo que el reconocedor deja abierto. Fuera de línea reconstruye el 02/11 con 99,3 % de viajes completos. |
| Bases del back office (particulares y sin carta) | MongoDB local `127.0.0.1:27017`. 1.203 particulares y 340 sin carta aceptados al 04/11. |
| Sistema de camiones (SGC, balanza Vicentin) | El server lo consulta cada 2 min por VPN; histórico 01/05→05/11 en `data/sgc/_historico/`. **Nunca rangos de más de 5 días por consulta.** |
| IA por imagen | Apagada (`VISION_IA=1` la prende). |

## 2 · En vivo: cómo está armado

```
Cámaras (DSS) ──► Microservicio Enesimal (100.54.73.142:8090)
                    ├─ journey-event/list  (lecturas con viaje; nunca trae traseras, sin eventId ni marca)
                    └─ alert/list          (lecturas sueltas, traseras, marca/color/tamaño del DSS)
                          │ cada 10 s
                          ▼
Servidor local 8787 · server/plantState/service.mjs (buffer 24 h por planta)
  1. alertReads.mjs        las alertas se vuelven lecturas (con atributos)
  2. pasos.mjs             ensamblador: evento + alertas + frontal/trasera + repeticiones = un paso
  0. vinculoLive.mjs       lote cada 5 min (cartas → base sin carta → SGC): quién puede venir y qué le falta
  3. plateIdentification   capas 2 y 3 (sección 3) por paso
  4. erroneasConfirmadas / alertStore   paso guardado · lectura errónea confirmada · alerta
  5. reducer.mjs           estado de planta (zonas, sectores, camiones adentro)
                          ▼
/api/truckflow/live/*  (plant-state, trucks, captures, identifications, alertas, vehicles, stream)
                          ▼
Página En vivo (src/pages/LiveMonitorPage.tsx): plano = camiones de granos con carta vigente;
el resto en «Vehículos»; «Alertas» = lo que ninguna capa identificó.
```

- Hora operativa = `occurredAt` + 206 min (`liveEventTime.mjs`). Para comparar eventos con alertas del microservicio,
  filtrar las dos por `createdAt`.
- Interruptores (variables de entorno): `IDENTIFICATION_PASOS=0` (sin ensamblador), `VINCULO_LIVE=0` /
  `VINCULO_APPLY=0` (sin vínculo), `IDENTIFICATION_PADRON=0`, `IDENTIFICATION_BALANZA=0`, `IDENTIFICATION_APRENDIZAJE=0`,
  `VISION_IA=1`. Lista completa en `docs/RECONOCEDOR_RECORRIDO_CAPTURA.md`.
- Hechos del terreno que el código ya tiene en cuenta: la trasera llega 10–60 s después de su frontal; la balanza del
  puerto lee la cola (trasera = frente del camión siguiente); la portería de San Lorenzo lee entrada y salida; Salida 2
  de Ricardone lee a los que van a Playa 3 (no es egreso); Salida 1 no tiene cámara.

## 3 · El reconocedor por capas (resumen)

Definición única y acordada: **`docs/RECONOCEDOR_RECORRIDO_CAPTURA.md`** (cambiar ahí primero).

| Paso | Qué hace |
|---|---|
| 0 · Lote | Antes de la captura: quién puede venir (cartas, base sin carta, SGC al final) y qué recorrido debe hacer. |
| 1–2 · Cámara + ensamblador | Una lectura; el paso junta evento, alertas, frontal, trasera y repeticiones. |
| Capa 2 | Comparación exacta: cartas de porte → Vehículos Permitidos / bases del back office → lote → respaldo SGC. |
| 3.1 | Corrección de errores comunes contra las patentes esperadas. |
| 3.2 | El vínculo asigna la captura al paso pendiente del camión correcto (marca y color pesan; umbral 0,5). |
| 3.3 | Banco: lo que corrigió operaciones (`corregidos.json`, `no-camiones.json`, clasificación manual por foto). |
| 3.4 | IA por imagen (apagada). |
| Final | Paso guardado · lectura errónea confirmada · alerta. Toda corrección vuelve a la capa 2. |

## 4 · Fuentes de datos: qué manda en cada cosa

| Pregunta | Fuente que manda | Dónde está / cómo se actualiza |
|---|---|---|
| **Cuántos viajes** (recepción, despacho, transiles) | **Cartas de porte ARCA** | API agro: `node --env-file=.env.local scripts/cruce-cartas-sin-carta/bajar-cartas-api.mjs DESDE HASTA data/arca/api/cartas-<rango>.json`. Padrón del día en `data/padron/<día>.json` (desde el 02/11). `data/arca/arca_consignment_notes.json` es una copia vieja (hasta el 27/10). |
| Producto, plataforma, kg, control cruzado | SGC (balanza) | `data/sgc/<día>/ingresos.json`, `data/movimientos/<día>/movimientos.json` (`SOURCE.json` = sgc desde el 15/10). Si falta un día, se cuenta con cartas. |
| **Tiempos y recorridos por camión** | Cámaras a través del **vínculo** | `scripts/vinculo/cobertura.mjs` (sección 6). |
| Quién puede estar sin carta | Bases del back office (MongoDB) + autorizaciones | `npm run padron:armar` (~80 s); páginas `/autorizaciones` en el 8787. |
| Qué aprendió el reconocedor | `data/padron/corregidos.json`, `no-camiones.json`, `clasificacion-manual.json` | `node server/live/padron/aprendizaje.mjs` (también cada hora en el server). Todo `data/padron` está **fuera de git**. |
| Cámaras crudas del día | Microservicio | `POST http://127.0.0.1:8787/api/truckflow/export-period {startDate,endDate}` → `data/truckflow/<día>/`. El archivo del día puede quedar cortado: verificar el último evento. |

Decisión pendiente del usuario: en el flujo final el cruce de «quién es» va contra **cartas + Vehículos Permitidos + los
que llevan remito** (despachos y descargas sin carta; falta elegirles nombre), no contra el SGC. Script listo:
`scripts/cruce-pasos-padron.mjs`. Hoy se sigue usando el SGC.

## 5 · Comités semanales

### 5.1 Logística

Detalle lámina por lámina: `agentes/conocimiento/COMITE_LOGISTICA_BASE_Y_ANEXOS.md` (vigente). Un comando arma base + anexos:

```bash
python scripts/estado-planta/comite_semana.py --desde <vie> --hasta <jue> --anterior <carpeta comité anterior> [--pellet-desde <día>]
```

Antes, en orden:
1. Server arriba y cámaras exportadas de la semana y del día siguiente; revisar el último evento de cada día.
2. Cartas de la semana (API) y SGC por día (`SOURCE.json`); si falta un día de SGC, contar con cartas.
3. Vínculo de la semana (sección 6) para los tiempos de los anexos.
4. Correr el comando, renderizar, cruzar las cifras repetidas entre láminas y publicar.

Base: portada · **tiempo en planta ponderado por producto** · qué entró · camiones adentro · soja R7 (tramos, día por
día, por planta, cuartos, histórico desde junio) · girasol · líquidos · calada (incluida calada por producto y Playa 1) ·
volcables (y uso por mes) · silos · cierre. Anexos solo cuando pasa: **operativo de pellet** (receta en
`COMITE_LOGISTICA_PELLET_OPERATIVO_29OCT_3NOV.md`), transile interno de silos, R29, despachos a terceros, «últimos
comités» solo a pedido. Carpeta de cada semana: `reportes/logistica/<desde>_<hasta>/comite-logistica/`
(`deck/assets.json` dice a qué artifact se publica).

Reglas del usuario (no re-discutir):
- Viajes = cartas de porte; tiempos = vínculo; SGC = producto, kg y control.
- **El texto visible nunca menciona la fuente ni sus huecos** (Excel, planilla, SGC, sistema de camiones, cámaras,
  días faltantes): eso va solo en notas del orador. Buscarlo antes de publicar.
- **Respetar lo que el usuario cambió en el deck**: láminas borradas siguen borradas, su orden y su estilo se copian al
  generador (`QUITAR`/`ORDER`/`PEL_ORD` en `gen_comite_logistica_semana.py`); publicar solo las láminas que cambian.
- Conclusiones sin obviedades; un día con volumen bajo es «a validar con planta», no «datos incompletos».
- Soja Ricardone → puerto = R7 (calada en Ricardone, descarga en el puerto), no transile.
- Pellet: viaje = carta; descanso = 6 h o más entre salida del puerto e ingreso siguiente a Ricardone; Playa 3 nocturna
  es fila; Salida 2 no es egreso (`pellet-linea-tiempo-xlsx.py`).
- Camiones adentro nunca 0 si hubo actividad; líquidos sin explicar el criterio.

### 5.2 Seguridad

```bash
node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts <desde> <hasta>
python scripts/estado-planta/seguridad-doble-ciclo.py <desde> <hasta> reportes/logistica/<desde>_<hasta>/comite-seguridad
python scripts/estado-planta/gen_comite_seguridad.py reportes/logistica/<desde>_<hasta>/comite-seguridad
```

- Anexo «vehículos sin registro»: paso a paso en `docs/ANEXO_SEGURIDAD_SIN_REGISTRO.md` (replay por capas +
  `scripts/seguridad-sin-registro/` listar, fotos, recorrido). **Antes de presentar un caso**: buscar la patente y sus
  parecidas en padrón, SGC y movimientos, y mirar la foto del DSS (el tipo que da el DSS no es confiable).
- Reglas: **ningún dato de kilos**; interplanta contra **20 min**; camionetas y livianos no son caso (van a la ficha de
  Vehículos Permitidos); rechazados en la balanza del puerto → mirar si el ingreso quedó de baja.
- Curar casos a mano después de ver fotos (`casos-excluidos.json`, `casos-extra.json`) y sumar la semana a
  `comite-seguridad-historico.json` después de presentar.
- Falta un orquestador como el de Logística (hoy son tres comandos).

## 6 · Herramientas de análisis

| Para qué | Comando |
|---|---|
| **Recorrido de cada camión de un día** (cámara / reconstruido / deducido / falta) | `VINCULO_DATA=<carpeta con truckflow/<día>/{event,alert}-list.json completos> VINCULO_CARTAS=data/arca/api/cartas-<rango>.json node --max-old-space-size=8192 scripts/vinculo/cobertura.mjs DESDE HASTA` → `reportes/vinculo/<desde>_<hasta>/cobertura.json`. Necesita una carpeta `dss-export` (puede estar vacía). |
| **Simular En vivo un día por capas** (alertas, erróneas, cobertura) | `node --max-old-space-size=8192 scripts/replay-capas-dia.mjs AAAA-MM-DD <carpeta>` (MongoDB arriba). Medir acá todo cambio antes de llevarlo a En vivo. |
| Replay simple por pasos + cruce con SGC + fotos + clasificación por foto | `scripts/replay-pasos-dia.mjs`, `scripts/cruce-pasos-sgc.mjs`, `scripts/fotos-pasos-dss.mjs`; flujo en `docs/CONTINUAR_2026-11-03_reconocedor-y-vinculo.md`. |
| Simulador del vínculo (qué camiones compiten por cada captura) | `scripts/vinculo/simulador-server.mjs` (puerto 8820). |
| Bases del back office | `npm run padron:armar`; revisión en el artifact de back office (sección 7). |
| SGC por rango | `python scripts/sgc/consultar_rango.py` (parte en lotes de 5 días; `--simular` para ver los lotes). |
| Tests | `npx vitest run server` (fallan 3 desde antes: reportWorkbook, reducer backlog, relevanceCleaner). |

## 7 · Índice de documentos

| Documento | Estado | Para qué |
|---|---|---|
| `docs/SISTEMA_NODO_SUR.md` | **vigente · leer primero** | este mapa |
| `docs/RECONOCEDOR_RECORRIDO_CAPTURA.md` | **vigente · fuente única** | recorrido de una captura y las capas |
| `docs/CONTINUAR_2026-11-05_reconocedor-en-vivo.md` | **vigente** | estado del reconocedor, números por día y pendientes en orden |
| `docs/CONTINUAR_2026-11-05_backoffice-y-capas.md` | vigente | bases MongoDB, páginas /autorizaciones, pruebas |
| `docs/ANEXO_SEGURIDAD_SIN_REGISTRO.md` | vigente | anexo de seguridad paso a paso |
| `agentes/conocimiento/COMITE_LOGISTICA_BASE_Y_ANEXOS.md` | **vigente** | deck de Logística: base, anexos, scripts |
| `agentes/conocimiento/COMITE_LOGISTICA_PELLET_OPERATIVO_29OCT_3NOV.md` | vigente (receta) | anexo de pellet |
| `docs/CONTINUAR_2026-11-03_reconocedor-y-vinculo.md` | histórico (superado por el del 05/11 para el estado) | ensamblador de pasos, universo del 02/11, hallazgos de cámaras |
| `agentes/conocimiento/COMITE_LOGISTICA_COMO_SE_ARMA.md` | **superado en parte** (19/10, modo planilla/ETL) | detalle del flujo de `comite_semana.py` y láminas viejas |
| `agentes/conocimiento/COMITES_SEMANALES_ESQUEMA.md` | **superado en parte** (21/10) | insumos y comandos; no conoce cartas como fuente ni el vínculo |
| `agentes/conocimiento/HISTORICO_COMITES.md` | referencia | estructura de los comités presentados jun–sep |
| `docs/CONTINUAR_EN_CASA*.md`, `docs/CONTINUAR_PPTX_EDITABLE.md` | históricos | sesiones de octubre |

Artifacts de trabajo (privados del usuario): informe de Logística 29/10–05/11 `claude.ai/artifact/HhUkczPtEPdg1GrTCogsJ5`,
anexo de seguridad `claude.ai/artifact/9Yemr5ZDCtYDFqzUwB8NH7`, revisión del back office
`claude.ai/artifact/1eEA1y11WnrjrdHvdhv18o`, clasificación por foto del 02/11 `claude.ai/artifact/D9aYMWumMqwXBe727Ayzqo`
y `claude.ai/artifact/Y47tsjJJKgJMcqmdAS4qV6`.

## 8 · Pendientes (todos juntos, en orden)

1. **Alerta por vehículo y no por captura** (aceptado, sin implementar) y recién entonces pasar el reconocedor por capas
   a En vivo. Detalle en `CONTINUAR_2026-11-05_reconocedor-en-vivo.md`, pendiente 1.
2. Respaldo SGC corto para líquidos (`BEFORE_INGRESO_MS` 30 min en `balanzaRegistry.mjs`): camiones de aceite leídos
   ~2 h antes del ingreso quedan sin registro.
3. Pasos deducidos (~110 por día sin foto) y viajes SGC del lote que casi no reciben lecturas.
4. Vínculo como módulo (hoy el server corre el script como proceso aparte).
5. Comités: orquestador de Seguridad; que el generador de Logística lea `tramos-circuitos.json`, `liquidos-puntos.json`,
   `calles-volcables-sgc.json`; generalizar otros productos (cártamo); anexo de transile interno con el vínculo.
6. Nombre para «los que llevan remito» y pasar el cruce de «quién es» del SGC al padrón.
7. Pedido a Enesimal: `eventId` de la cámara en `journey-event`. Pedido a Vicentin: columnas faltantes del SGC
   (`docs/sgc/PEDIDO_COLUMNAS_VISTA.md`).
8. Ruta de VPN al SGC que se pierde al reiniciar (agregarla al `.ovpn`).
