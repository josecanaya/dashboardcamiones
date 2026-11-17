# Camiones con el mismo patrón que CXV575 (01/07 → 04/11/2026)

**Período:** desde el 01/07 (pedido del usuario el 05/11). Mayo y junio tienen huecos en el Excel de movimientos
(16–18/05, 26–28/05, 22–28/06) y producían falsos «sin sistema», como AE131JP, un camión de granos. El 31/10
queda fuera porque ese día no hay Excel ni SGC.

**Patrón:** cruza Balanza 1 ingreso → Balanza 2 egreso en Ricardone (≥ 25 min, sin calada) **sin movimiento
en el sistema** (Excel por contrato hasta el 14/10, SGC desde el 15/10; cualquier planta, ingreso −2 h …
salida +2 h), **sin carta de porte** (ARCA + `data/padron`), **sin alta en el back office** (MongoDB
`backoffice_particulares` / `backoffice_sin_carta`) y que no es liviano/servicio (`no-camiones.json`,
`clasificacion-manual.json`). Se descartan las visitas con posible mala lectura (patente parecida con
movimiento en la franja).

Fuente: `scripts/cruce-sistema-truckflow/barrera-sin-sistema.mjs --mes <mes>` (cache de lecturas al 04/11) +
`scripts/cruce-sistema-truckflow/cruce-registro-huella.mjs` → `mismo-patron-CXV575.json` →
`scripts/seguridad-sin-registro/datos-mismo-patron.py` → `fichas-mismo-patron.json` →
`scripts/seguridad-sin-registro/fichas-mismo-patron.py` → `fichas-balanza-sin-pesar.html`
(publicado: https://claude.ai/artifact/53PMhrQNmjjDYpBC55Xbs1).

## Reincidentes (2 o más pasadas sin pesar desde el 01/07): 8 camiones, 33 pasadas

| Patente | Pasadas | Días | Únicas veces en la balanza (desde 01/07) |
|---|---|---|---|
| **MTM450** | 8 | 28/07, 30/07, 04/08, 13/08, 25/08, 27/08, 04/09, 08/09 | 28/09 ×2, egreso varios en Ricardone «movimiento almacenes Ricardone → Puerto» (Vicentin) |
| **FQI716** | 6 | 28/07, 04/08, 13/08, 25/08, 08/09, 01/10 | 17/09, ingreso varios en el puerto «trabajo varios» |
| **LPZ703** | 4 | 14/08, 08/09, 14/09, 29/09 (hasta 4 h 25 m adentro) | 15/09, egreso varios en el puerto «carga un contenedor obrador» |
| **AF831ID** | 4 | 20/07, 12/08, 28/08, 17/09 | nunca |
| **RSW086** | 3 | 27/08, 04/09, 11/09 (hasta 6 h 55 m adentro) | 10/09 y 16/10, ingreso varios en el puerto «trabajo varios» |
| **CXV575** | 3 | 15/07, 16/07, 02/11 (13/07 sin la huella completa) | 11/09, ingreso varios en Ricardone «tierra para Mastrodicasa», desde San Lorenzo |
| **AF241DX** | 3 | 26/08, 04/09, 11/09 | 17/07 y 24/07, egresos en el puerto, DHSH SRL (retiro de obrador, IBC de lecitina) |
| **OAA734** | 2 | 06/07, 20/07 | 22/09, ingreso varios en el puerto (La Casa de la Construcción SRL) |

## Puerto San Lorenzo (sumado el 05/11)

Mismo patrón en el puerto: **Balanza de ingreso** (SLZBalIngFte) y 25 min o más después **Balanza de salida**
(SLZBalSC1Fte / SLZBalSC2Fte) o, en su lugar, el **Egreso** (SLZSalidaC1Fte / C2Fte), porque la cámara de salida
anduvo mal mucho tiempo. Sin calada (SLZCalado), sin sistema ±2 h, desde el 01/07.
Script: `scripts/cruce-sistema-truckflow/balanza-sl-sin-sistema.mjs` → `sl/visitas-sl.csv`, `sl/p1-sl.json`,
cruce en `sl/cruce-sl.json`. 284 pasadas de 202 patentes; casi todas tienen alta en el back office
(residuos, agua, internos) o carta.

| Patente | Pasadas en el puerto | Además en Ricardone | Única vez en la balanza | Fotos |
|---|---|---|---|---|
| **AB531CT** | 19/10, 23/10, 03/11 (pasa por los tanques, TK400) | — | 05/10, ingreso varios en el puerto «dejó un contenedor» | Iveco Tector con hidrogrúa roja, leyenda **«SOLMEC»** |
| **NAD656** | 23/10, 04/11 | 14/08 | 07/09, ingreso varios en el puerto «trabajo varios» | Mercedes-Benz Atego con hidrogrúa, leyenda **«LH Servicios Industriales»** |
| **AB127BY** | 21/10 (pasa por los tanques) | 08/07 | 13/10, ingreso varios en el puerto, Argent Export SA (descarga de IBC en Renova) | Iveco Tector blanco, caja roja |
| **AF241DX** | 19/08 (pasa por los tanques) | 26/08, 04/09, 11/09 | ver arriba | — |

AB531CT y NAD656 coincidieron el 23/10 en el puerto. En las fotos de los tanques de AB127BY (21/10) y de la
balanza de salida SC1 de NAD656 (23/10) aparece otro vehículo: el DSS les asignó mal la patente y no se usan.

**Ojo con el SGC (desde el 15/10):** la vista de balanza no trae los movimientos administrativos ni los que no
tienen contrato (residuos, «productos varios»), así que desde esa fecha un «sin sistema» de un camión de servicio
puede ser un ingreso que la vista no muestra. Por eso conviene el pedido de ampliación de la vista. Las pasadas
del puerto de AB531CT, NAD656 y AB127BY son de esa época.

**Total con el puerto: 11 camiones, 41 pasadas** (después del cruce con la vista SGC con historia, abajo).

## Vista SGC con historia (05/11)

Desde el 05/11 la vista `CAMIONESACTIVOS24HORAS` se puede consultar por cualquier rango de `FECHAINGRESO`
(`scripts/sgc/consultar_rango.py DESDE HASTA --csv …`). Bajada del 01/05 al 05/11: 107.831 ingresos en
`data/sgc/_historico/` (fuera de git).

- **AE131JP confirmado camión de granos:** soja a Celda 16S el 18/05 (03:22 → 06:09) y a Chief 4 el 27/05
  (05:17 → 09:52), exactamente las horas de las cámaras.
- **AF241DX:** el 19/08 tiene un ingreso en el puerto (11:49 → 15:36) **dado de baja**: esa pasada del puerto
  tiene registro y sale. Le quedan 3 pasadas en Ricardone.
- **Ninguno de los otros 10 aparece en la vista** en las fechas de sus pasadas (ni con un carácter de diferencia).
- **La vista sigue sin traer la mayoría de los «productos varios»:** contra el Excel (mayo–14/10), trae el 97 %
  de los movimientos de granos y aceites, pero le falta el **61 % de los de productos varios, residuos y
  chatarra** (1.581 de 2.571). Por ejemplo, no están las pesadas de MTM450 (28/09), FQI716 (17/09), LPZ703
  (15/09), AB531CT (05/10) ni AB127BY (13/10) que sí figuran en el Excel. Por eso, para camiones de servicio la
  vista no alcanza, y desde el 15/10 (sin Excel) un «sin sistema» puede ser un ingreso que la vista no muestra.
  Es lo que falta pedir en la ampliación de la vista.

Quedaron fuera al cortar en el 01/07: NAD656 y AH498JW (una sola pasada desde julio) y AE131JP.

**AE131JP (fuera):** camión de granos. Sus visitas del 18/05 y el 27/05 tienen forma de descarga (Ingreso →
Preingreso → Balanza 1 → Balanza 2) y caen en días sin Excel. Buscado en los 317 Excel del repo y de Descargas,
con hasta un carácter de diferencia: solo figura el 01/07 en el puerto.

**Días con Excel incompleto desde julio** (ingresos o salidas < 150, sin contar domingos): 10–12/10 (fin de semana
largo), 19/10 y 31/10 (sin datos, excluido).

### Fotos del DSS (05/11)

Fotos de escena en `fotos-mismo-patron/` (`<día>_<patente>_<n>.jpg`, detalle en `veh.json`; entrada armada con
`scripts/cruce-sistema-truckflow/fotos-entrada-huella.mjs`). En todas, la placa de la foto coincide con la leída
y es un camión. Faltan las del 27–28/08 (export roto de esos días).

| Patente | Qué se ve |
|---|---|
| MTM450 | Mercedes-Benz Atego gris/blanco, caja con hidrogrúa roja |
| FQI716 | Volkswagen (Worker) gris, caja playa con barandas |
| LPZ703 | Ford Cargo blanco |
| AF831ID | Mercedes-Benz Atego blanco, caja con barandas |
| RSW086 | Mercedes-Benz viejo, amarillo, con hidrogrúa roja |
| CXV575 | Tractor blanco «AMEX» con batea; el DSS lo tipifica camioneta/sedán por error |
| AF241DX | Tractor Mercedes-Benz Axor blanco |
| OAA734 | Iveco Tector blanco, caja playa |

**Coincidencias de día (posible misma flota / mismo trabajo):** MTM450 y FQI716 cruzan las balanzas los mismos
días 28/07, 04/08, 13/08, 25/08 y 08/09 (LPZ703 también el 08/09); MTM450 y RSW086 el 27/08; MTM450, RSW086 y
AF241DX el 04/09; RSW086 y AF241DX el 11/09, el día en que CXV575 sí se pesó; AF831ID y OAA734 el 20/07.

**Lectura:** todos son «productos varios» cuando aparecen en la balanza: obradores, contratistas, movimiento
de almacenes. El patrón es de camión de servicio/obra que entra sin pasar por el sistema las otras veces.
Falta saber a quién presta servicio cada uno en las visitas sin registro.

## Una sola pasada con el patrón, octubre–noviembre (limpios)

AB531FN (02/10, 3 h 57 m), CGO960 (05/10), OMP741 (06/10), MDM839 (17/10, 3 h 26 m), AC071XK (19/10, con 2
pesadas «varios» el 16–19/10), EOW676 (20/10, 2 h 12 m), AE848KL (20/10, 22:54), SQK498 (21/10), OYO513
(29/10), KST146 (03/11, ya en el anexo), FDM335 (04/11).

## Descartados por el cruce (no son el mismo caso)

- Con alta en el back office (`particulares`: interno, residuos, agua, camión; `sin_carta`: descarga):
  VNA879, AH733KN, BTS626, OEV688, HMJ492, MSE565, FQX760, FEA810, AE260HD, AD278IZ, KQG451, AB472AR,
  KPI699, AG332BP, AC612CX, AD836GM, AB544UW, AF443TR, FOR199, HDG891, KWN853, AG401ID, AD249GD, AH341SS.
- Livianos / particulares: OCB815, IMH787, AC956KY, AI217QP, AF778ZI, AA317IV, KGY149, AE264XY, AG644XU,
  NAH953, OTV765, AC656IE (servicio), entre otros.
- Con carta de porte: EVL273, RDL445, AH091UQ.

## Límites

- Una «visita» corta a las 6 h sin lecturas de frente: las dos vueltas de CXV575 del 02/11 cuentan como una.
- Las alertas de cámara y las traseras no entran en la huella; con el recorrido completo
  (`scripts/seguridad-sin-registro/recorrido.mjs`) pueden aparecer más pasadas.
- Antes de presentar un caso: fotos del DSS (`fotos.mjs`) para confirmar que es camión y que la patente está bien leída.
