# Mapa de planta para mantenimiento y descarga de camiones: resumen

El mapa está en `mapa_planta_mantenimiento.json`. Se regenera con `python construir_mapa.py`. Los datos intermedios (OT, elementos del IFC) quedan en `trabajo/`.

## Lo más importante

**El IFC no sirve para armar el flujo del grano.** Los modelos NVA_Ricardone y NVA_puerto22 no tienen puertos conectados, sistemas de distribución ni equipos. Solo tienen volúmenes de edificio (techos y modelos genéricos) con etiquetas BTZ por sector.

Por eso ningún vínculo tiene confianza **alta**. El flujo sale de dos fuentes:
- **La descripción de los activos en el maestro.** Sobre todo las válvulas, que dicen de dónde a dónde descargan (por ejemplo, «VALVULA PV1 D DESCARGA DESDE PV1 A CR2»).
- **El texto de las OT**, citado con su número.

El IFC se usa solo para ubicar cada activo en el volumen de su sector (`ifc_sector`). Además, en cinco casos el volumen corresponde a un nodo del circuito: Calada, Celda 16, Silos Kepler, Balanza y Pre-ingreso.

**El efecto de cada equipo no está cargado a mano: se calcula.** Se saca el equipo del grafo y se mira si el grano todavía llega a algún destino:
- Si no llega, el equipo **detiene** la plataforma.
- Si llega por otro camino, le **reduce la capacidad**.

Para los CCM, trafos y otros servicios se hace lo mismo, sacando el proveedor junto con todo lo que depende de él.

## Cuánto se cargó

| | Total | Alta | Media | Baja |
|---|--:|--:|--:|--:|
| Activos | 1.077 | | | |
| Vínculos de flujo del grano | 141 | 0 | 96 | 45 |
| Dependencias de servicio | 400 | 0 | 195 | 205 |
| Impactos sobre la descarga | 1.283 | 0 | 334 | 949 |

Efecto de los impactos: 90 detienen, 349 reducen capacidad, 174 demoran y 670 no tienen efecto (por ejemplo, aireación o válvulas bajo celda).

Hay 86 activos que están en el mapa pero no se pudieron ligar a ninguna plataforma; figuran con `plataformas_excel: []` y el motivo. Otros 385 del alcance se revisaron y no se encontró ningún vínculo: van aparte, en `activos_revisados_sin_cadena`, con el motivo.

## Plataformas con la cadena incompleta

- **ACEITE (Ricardone) y ACEITE_PTO:** en el maestro no está el equipo de carga o descarga. Del puerto solo aparecen la balanza de lecitina y el tanque TK2.
- **VOLCABLE_PTO_1 a 4:** la cadena llega a la Celda 3, la Celda 4 y los silos 4 a 7. Tres ramas quedan abiertas: el elevador EL1 (no se encontró a dónde descarga), los pendulares y el silo diario.
- **VOLCABLE_1 y 2:** llegan a las celdas de materia prima 4 y 5, con confianza baja. La cinta crucero 2 queda sin destino.
- **CELDA_16, KEPPLER_1 y 2, SILO_CHIEF_2, CARGA_SILO_10 y 11:** completas, pero la mayoría de los tramos intermedios salen del nombre del equipo.
- **Celdas 1 y 2 del puerto:** según el mapa, no están en el camino de los camiones. Se cargan por EL4 y C05.

## Las 5 correcciones más importantes al borrador

1. **Cada par de volcables del puerto tiene su propia cinta de recepción.** PV1 y PV2 solo descargan a CR1 y CR2. PV3 y PV4 solo descargan a CR1 y CR0. CR1 la usan los cuatro. Eso explica que se prendan y apaguen de a pares.
   - El borrador ponía todas las cintas CR0 a CR6 como comunes a los cuatro volcables.
   - Las cintas CR3, CR4 y CR6 no vienen de camiones: son de vagones y del silo 4. Aun así, los vagones ocupan CR1 y CR2 cuando descargan.
2. **PV5 no depende de la secadora.** Tiene un desvío por el redler R32 hacia las cintas de transferencia CT1 y CT2. Lo que detiene a PV5 es el redler R31, la noria EL7 y el CCM de la secadora. La secadora, los quemadores y el desterrador solo le reducen la capacidad.
3. **El almacenaje del puerto se separó en carga y extracción.** El borrador tomaba todo TE-ALM- como aguas abajo.
   - Carga (sí frena la recepción): cintas C6 a C9 y CSS, carros, CT1 y CT2.
   - Extracción (no frena la recepción): las 127 válvulas bajo las celdas, las cintas bajo celdas y silos, y la aireación.
4. **Los silos Kepler tienen dos líneas separadas.**
   - Sur: rampa 6 → norias N-10 y N-10/A → cinta CSS KW-1 → silos 1 a 5.
   - Norte: rampa 7 → noria N-11 → cinta CSS KW-3 → silos 6 a 10.

   Las cintas CBS KW son de extracción, no de recepción. El borrador metía las dos rampas y las CBS en las dos plataformas.
5. **Ricardone quedó con menos equipos en cada cadena.**
   - Se sacaron las prelimpiezas 1 y 2 de la cadena de la secadora: no hay nada que las vincule a un volcable.
   - Se sacaron las celdas de materia prima «PR-PLYMP-SLO-DMP» del grupo común. Solo la celda 5 tiene una OT que la conecta, vía el redler RCR-2.
   - En la Celda 16, el paso obligado es la torre MC16, la cinta sobre la celda y su carro. La cinta bajo volcables no lo es.

## Respuestas a las preguntas del pedido

1. **Cintas de cada volcable del puerto:**
   - PV1 y PV2 descargan a CR1 y CR2. PV3 y PV4 descargan a CR1 y CR0. PV5 va al redler R31 y a la secadora.
   - De ahí, CR0, CR1 y CR2 caen a los elevadores EL1 y EL2. CR0 también cae al EL3.
   - EL2 y EL3 siguen a la cinta C01 (y de ahí a la Celda 4) o a la CT2 (y de ahí a la Celda 3 y los silos 4 a 7).
2. **Secadora CEDAR de Ricardone:** según el mapa, recibe de la noria N-08 del volcable 2 por la CSG-3, y de la noria N-04. Es confianza baja.
   - Con OT en la secadora, los datos muestran demora y no cero. Eso sugiere que existe un bypass, que no se encontró.
   - No se pudo saber si pasa todo el girasol o solo el húmedo.
3. **CSG-3 y cruceros:** sí, están aguas abajo de los volcables 1 y 2.
   - CSG-3 solo está en el camino del volcable 2.
   - Solo el tramo RCR-2 → silo 5 tiene una OT que lo diga.
4. **Rampas del EAM y plataformas del Excel** (supuesto a confirmar):

   | Plataforma del Excel | Rampa del EAM |
   |---|---|
   | VOLCABLE_1 | 1 |
   | VOLCABLE_2 | 2 |
   | CELDA_16 | 8 y 10 |
   | KEPPLER_1 | 7 (norte) |
   | KEPPLER_2 | 6 (sur) |
   | SILO_CHIEF_2 | silo de expedición Chief 02 |

   Las rampas 3, 4, 5 y 9 no tienen plataforma en el Excel.
5. **Qué se apaga junto si cae un CCM o un trafo** (confianza baja):

   | Si cae | Se detienen |
   |---|---|
   | Trafo de entrada, trafo de 1600 kVA o CCM de la torre de manipuleo | los 5 volcables del puerto |
   | CCM de la secadora | PV5 |
   | CCM de silos KW | Keppler 1 y 2 |
   | CCM de Celda 16 o trafo de Celda 16 | Celda 16 |
   | CCM de playa y materia prima | volcables 1 y 2 |
   | Trafo de silos MP y SP | volcables 1 y 2, Kepler, Chief y los silos 10 y 11 |
   | CCM bajo Celda 4, bajo Celda 3 y bajo silos | nada: solo reducen la capacidad |

6. **Caladores necesarios:** no hay dato en el EAM.
   - En 2026, el calador 1 tuvo 29 OT, el 2 tuvo 18 y el 3 tuvo 8.
   - Se cargaron como grupo redundante que genera demora, aguas arriba de todas las plataformas. Eso incluye las del puerto por el circuito R7.

## Lo que no se pudo resolver

En `validacion_casos`, 10 de los 12 casos quedan explicados: 6 del todo y 4 en parte. Los 2 que el mapa no explica:
- **celda4_0916:** el EL2 también puede desviar a los silos por la CT2, así que el mapa no explica por qué PV1 y PV2 quedaron en cero.
- **pv3_0902:** PV3 y PV4 tienen las mismas válvulas y los mismos destinos, así que el mapa no puede distinguir cuál se frena.

Además:
- A dónde descarga el elevador EL1.
- Qué CCM (piso 0 o piso 2 de la torre) alimenta los volcables y las cintas de recepción.
- Para qué lado va la válvula P38 entre la tolva de PV5 y la CT1.
- El camino real del girasol en Ricardone.
- Los enclavamientos de los filtros de mangas. Se cargaron como no bloqueantes: como máximo reducen la capacidad.
- Los equipos de carga de líquidos.

Las 14 preguntas, con a quién hacérselas, están en `preguntas_abiertas`.
