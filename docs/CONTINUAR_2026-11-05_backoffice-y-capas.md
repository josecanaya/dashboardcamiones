# Back office de vehículos autorizados y capas del reconocedor (02–05/11/2026)

Traspaso para probar todo desde otra cuenta. Rama `automatizacion`, commits `68065ba` a `ac7b437` (sin push).
Todo corre en esta PC: servidor `server/truckflow-local-server.mjs` en el puerto 8787 y MongoDB local.

## 1. Qué se armó

1. **Dos bases NoSQL del back office** (MongoDB), independientes, solo con vehículos **aceptados**:
   - `backoffice_particulares`: particulares y servicio que vienen siempre (agua, residuos, combustible,
     movimientos internos de Vicentin, camionetas y autos del personal).
   - `backoffice_sin_carta`: camiones que vienen a **cargar** (o descargar) productos **sin carta de porte**
     (aceites, glicerinas, borras, químicos…).
   - Los **camiones de granos no van a ninguna base**: se resuelven con la carta de porte; sin carta, son alerta.
2. **Páginas de carga** en `http://<pc>:8787/autorizaciones`: Portería (particulares y contratistas) y
   Despachos y descargas (comercial). Guardan en la base que corresponde.
3. **En vivo usa las bases** en la capa 2 «¿Quién es?» y las alertas dicen «camión de granos sin carta».
4. **Simulación por capas** de un día completo (`scripts/replay-capas-dia.mjs`), igual que En vivo.

## 2. Requisitos para probar

| Qué | Dónde | Notas |
|---|---|---|
| MongoDB 8.0 | servicio de Windows `MongoDB`, `127.0.0.1:27017` | ya instalado. Otras bases de ese Mongo (`contracts`, `payment_methods`…) **no son nuestras: no tocarlas**. |
| Servidor | `node server/truckflow-local-server.mjs` (8787) | al arrancar debe decir `[padron] MongoDB backoffice_particulares + backoffice_sin_carta` y `[backoffice] 1203 particulares + 340 sin carta, 424 camiones de granos rechazados`. |
| DSS | por VPN, variables en `.env` | solo para fotos y para la capa 3.2 (marca, color, tipo). |
| Datos locales | `data/` (fuera de git) | `data/truckflow/<día>` (lecturas), `data/padron/<día>.json` (cartas), `data/movimientos` y `data/sgc` (balanza), **`data/padron/backoffice-descartados.json`** (rechazados: solo existe en esta PC). |
| Driver | `mongodb` en `package.json` | `npm install` si falta. |

**Desde otra PC**: copiar las dos bases (`mongodump --db backoffice_particulares` y `--db backoffice_sin_carta`,
`mongorestore` del otro lado) y `data/padron/backoffice-descartados.json`. Sin Mongo, el servidor arranca igual:
las autorizaciones van a `data/padron/autorizaciones.json` y la capa 2 queda sin bases.

**Páginas de revisión (claude.ai)**: son privadas de la cuenta que las creó. Para verlas desde otra cuenta hay que
compartirlas desde el menú Compartir de cada página:
- Revisión de las dos bases con decisiones: https://claude.ai/artifact/1eEA1y11WnrjrdHvdhv18o
- Camiones de granos sin carta (02–04/11): https://claude.ai/artifact/Ufb3NvTcigzam8iH6kjNdw
- Capas del reconocedor 02 y 03/11: https://claude.ai/artifact/UQVbiTCkCdFrYvcQxpqFBV

## 3. Las bases

Código: `server/live/padron/padronDb.mjs` (`connectBackofficeDb('particulares' | 'sin_carta')`).
Variables opcionales: `PADRON_MONGO_URL`, `PARTICULARES_DB`, `SIN_CARTA_DB`.

Colecciones de cada base:

| Colección | Qué guarda |
|---|---|
| `vehiculos` | **solo aceptados**, una ficha por patente (chasis o acoplado) con `decision` {estado, categoria, nota, por, at} |
| `candidatos` | lo que el historial propone y nadie decidió (o quedó «a revisar») |
| `movimientos` | pasos por balanza de esas patentes |
| `capturas` | lecturas de cámara de esas patentes (hora operativa) |
| `autorizaciones` | lo que cargan portería (en particulares) y comercial (en sin carta) |

Estado al 05/11:

| Base | Aceptados | Candidatos |
|---|---|---|
| particulares | 1.203: 987 particular, 80 camión de servicio, 60 interno, 49 residuos, 22 combustible, 5 agua | 87 |
| sin carta | 340: 267 cargan, 73 descargan | 297 (todos de 1 solo viaje) |

Rechazados: 429 en `data/padron/backoffice-descartados.json` (424 camiones de granos, 3 camiones, 2 sin carta).

**Rearmar** con el historial (unos 80 s): `npm run padron:armar` (`scripts/padron/armar-bases-backoffice.mjs`).
- Sin carta = productos de `server/live/padron/autorizaciones/comun/productos.json` sin CTG (vacío o ceros)
  en Ricardone y Terminal de Embarque.
- Particulares = balanza de agua/residuos/combustible/productos varios (2 viajes o más) + patentes que solo ve la
  cámara (nunca pesadas ni con carta) en 3 días o más, sin acoplados ni malas lecturas.
- **Reglas automáticas** (pedido del 04/11): todo liviano entra solo a particulares; todo sin carta con 2 viajes
  o más entra solo a sin carta.
- Lo aceptado se conserva aunque deje de venir; los rechazados no vuelven a aparecer.

## 4. Páginas de carga (`/autorizaciones`)

Código: `server/live/padron/autorizaciones.mjs` y `server/live/padron/autorizaciones/*.html` (motor común `comun/comun.js`).

- **Portería** (`/autorizaciones/porteria`): Particular o Contratista, «¿Ingreso a zona operativa?» Sí/No, patente,
  nombre, empresa (contratista), planta, fechas y horario.
- **Despachos y descargas** (`/autorizaciones/comercial`): Despachar o Descargar, chasis y acoplado, cliente,
  producto (buscador sobre la lista fija; si no está, «Otro producto: …»), transportista, chofer, planta, fechas
  y mail/pedido/remito.
- Patentes: solo formato argentino (ABC123, AB123CD, 123ABC, A123BCD) salvo que se marque «Patente de otro país».
- Al escribir la patente muestra su ficha de las bases (viajes sin carta, capturas).
- Sin usuarios: quien carga pone su nombre arriba. Falta autenticación antes de llevarlo a otra máquina.

## 5. En vivo

Capa 2 «¿Quién es?», en orden (`server/live/padron/vehiculosPermitidos.mjs`, `server/plantState/padronCartas.mjs`):
1. Autorización con fecha cargada en las páginas.
2. Bases del back office (`server/live/padron/backofficeIndex.mjs`, en memoria, recarga cada 2 min).
3. Carta de porte vigente.
4. **Respaldo SGC**: el vehículo pesó ese día (balanza).

La **lista histórica de balanza ya no da permiso** (05/11): tapaba cartas vigentes y autorizaba a cualquiera
que hubiera pesado alguna vez. Queda solo para la ficha de las páginas.

Alertas (`server/live/alerts/alertStore.mjs`):
- **Camión de granos sin carta**: patente rechazada como granos o con carta en el padrón. Si la carta es de otro
  día, sigue siendo alerta y dice qué carta tiene y de qué fecha.
- **Se cierran solas** cada minuto si la carta llega tarde al padrón o la patente se acepta en las bases (últimos 3 días).
- **Corrección manual** desde el panel de Alertas (patentes parecidas, «leyó bien», escribir la patente, descartar):
  queda guardada aunque la alerta sea de otro día.
- **Captura errónea**: texto sin formato de patente que solo llegó como alerta del DSS. No va a la bandeja (serían
  cientos por día).

## 6. Simulación por capas

```
node --max-old-space-size=8192 scripts/replay-capas-dia.mjs 2026-11-02
```

Salida: `reportes/reconocimiento-capas/<día>/capas.json` (resumen y cada paso). Corre igual que En vivo:
ensamblador de pasos (feed + lecturas de alerta, frontal y trasera juntas), cartas, bases, respaldo SGC, 3.2 con
marca/color/tipo del DSS (pide al 8787, con caché; `METADATOS=0` lo saltea), banco de corregidas y vínculo
(`VINCULO=0` lo saltea). La IA (3.4) está apagada también en vivo.

Resultado al 05/11:

| | 02/11 | 03/11 |
|---|---|---|
| Pasos | 4.410 | 2.782 |
| **2 · ¿Quién es?** | 3.491 (79 %) | 2.071 (74 %) |
|   carta / particulares / sin carta / respaldo SGC | 2.422 / 731 / 242 / 96 | 1.123 / 578 / 211 / 159 |
| 3.1 parecidas (incluye vínculo) | 299 | 209 |
| 3.2 metadatos | 24 | 6 |
| 3.3 banco | 33 | 17 |
| Captura errónea (no va a la bandeja) | 482 | 367 |
| **4 · Alerta** | 63 (35 sin registro, 28 dudosas) | 96 (69 sin registro, 27 dudosas) |

## 7. Pruebas sugeridas

1. **Servidor**: reiniciar el 8787 y verificar las dos líneas del log del punto 2.
2. **Capa 2 por patente**: `http://127.0.0.1:8787/api/truckflow/agro/permitidos?plate=IMH787` → `particular`
   (base particulares). `?plate=AAE877` → `null` (pesó en septiembre, ya no tiene permiso).
3. **Ficha en la página**: abrir `/autorizaciones/comercial`, escribir `RUK692` → «Vino 179 veces sin carta…».
4. **Validaciones**: en Portería escribir `ASDASDAS4` → error de formato; marcar «Patente de otro país» → la acepta.
   En Despachos y descargas, el producto solo se elige de la lista o con «Otro producto».
5. **Alta de una autorización**: cargar una de prueba y confirmar que aparece en Mongo
   (`backoffice_particulares.autorizaciones` o `backoffice_sin_carta.autorizaciones`). Anularla después.
6. **Alertas**: `http://127.0.0.1:8787/api/truckflow/live/alertas?site=ricardone&day=<día>` → abiertas con
   `tipo: camion_granos_sin_carta` para granos; las que tenían carta tardía deben aparecer resueltas
   (`resolved.by: carta_porte`).
7. **Corrección manual**: en el panel de Alertas de En vivo, corregir una alerta de un día anterior y verificar
   que queda resuelta al recargar.
8. **Simulación**: correr el punto 6 para un día nuevo y comparar con la tabla.
9. **Rearmar las bases**: `npm run padron:armar` y verificar que los aceptados siguen (1.203 y 340 o más) y que
   los rechazados no aparecen como candidatos.

## 8. Pendiente y decisiones abiertas

- **Captura errónea**: 482 y 367 pasos por día que nadie identifica. El vínculo podría asignar 167 y 120 si se le
  dieran antes de descartarlas (hoy En vivo las descarta primero). Decidir si se hace.
- **Respaldo SGC**: todavía resuelve 96 y 159 pasos por día; si se saca el SGC, esos pasan a alerta.
- **Vigencia de cartas de girasol de silos**: con carta de partida de 2 días antes quedan como alerta; decidido
  que una carta de otro día no vale.
- **Candidatos**: 87 de particulares (productos varios, sin clase, colectivos…) y 297 de sin carta con 1 viaje.
- **Autenticación** de las páginas y **destino definitivo** de Mongo (al lado de las cartas de porte o en la
  máquina del microservicio): sin definir. Cambiar `PADRON_MONGO_URL` al moverlo.
- **3.2 Metadatos** resuelve poco (24 y 6 pasos): solo entra cuando hay un candidato claro.
- La IA (3.4) sigue apagada.

## 9. Archivos

| Archivo | Qué hace |
|---|---|
| `server/live/padron/padronDb.mjs` | conexión a las dos bases, store de autorizaciones, ficha por patente |
| `server/live/padron/backofficeIndex.mjs` | bases en memoria para la capa 2 y lista de camiones de granos rechazados |
| `server/live/padron/vehiculosPermitidos.mjs` | capa 2: autorizaciones y bases (historial de balanza solo para la ficha) |
| `server/live/padron/autorizaciones.mjs` + `autorizaciones/` | API y páginas de carga |
| `server/live/alerts/alertStore.mjs` | alertas: granos sin carta, cierre por carta tardía, resolución manual |
| `server/plantState/algorithmLayers.mjs` | resumen de capas de En vivo («Capa 2 · Respaldo SGC») |
| `server/truckflow-local-server.mjs` | conecta todo |
| `scripts/padron/armar-bases-backoffice.mjs` | `npm run padron:armar` |
| `scripts/replay-capas-dia.mjs` | simulación de un día por capas |
| `data/padron/backoffice-descartados.json` | rechazados (fuera de git) |
