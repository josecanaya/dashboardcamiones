# Comité de Logística semanal · cómo se arma el deck

Guía para el agente que arma el comité. Dice qué corre, de dónde sale cada lámina y qué revisar
antes de publicar. **Desde el 15/10/2026 los movimientos salen de la balanza (SGC), no del Excel**;
la sección 3 dice qué cambia por eso.

## 1 · El flujo

Un comando por semana (lunes → domingo):

```bash
python scripts/estado-planta/comite_semana.py --desde <lunes> --hasta <domingo>
```

(`--excel <xlsx>` solo para semanas viejas con planilla Excel; con SGC no hace falta: los movimientos
ya están en `data/movimientos/<día>`.)

| Paso | Qué hace | Lee | Escribe |
|---|---|---|---|
| 1 | (solo con `--excel`) ingesta de la planilla | Excel | `data/movimientos/<día>/movimientos.json` |
| 2 | corrida ETL de la semana (levanta el server si está apagado) | eventos de cámara + `data/movimientos` | `runs/windows/<desde>_<hasta>/` |
| 3 | cálculos | corrida, `data/movimientos`, eventos crudos | `reportes/logistica/<semana>/comite-logistica/calculo/*.json` |
| 4 | `datos_comite_semana.py` junta todo | `calculo/` + corrida + comité anterior | `datos.json` |
| 5 | `gen_comite_logistica_semana.py` arma las láminas | `datos.json` | `deck/project/slides/*.html` |
| 6 | publicar (lo hace Claude, aparte) | `deck/assets.json` dice el artifact | — |

Cálculos del paso 3 (todos en `scripts/estado-planta/`):

| Script | Qué mide | ¿Usa movimientos? |
|---|---|---|
| `paquete-periodo.ts` | lo mismo que «Cargar rango» del dashboard: actividad de sectores, tiempos de soja/girasol, panel de volcables del puerto por calle | sí, vía la corrida ETL |
| `r7-camaras.cjs` | soja R7 por patente (calada → egreso → SL); con movimientos, cuenta las operaciones R7 | sí: `TERMINAL_EMBARQUE · INGRESO · SOJA · VOLCABLE_PTO*` |
| `pellet-camaras.cjs` | viajes de pellet Ricardone → puerto; con movimientos, cuenta egresos | sí: `RICARDONE · EGRESO · PELLETS GIRASOL`, `entregado_por_a` |
| `liquidos-camaras.cjs` | visitas a la zona de líquidos; calibra contra movimientos | sí: planta, producto, sentido |
| `liquidos-criterio.cjs` | líquidos por producto, planta y sentido | sí: planta, producto, `movement_type`, horas |
| `metricas-camaras.cjs` | girasol, R29, sectores, calles, horas activas | no (solo cámaras) |
| `volcables-historico.cjs` | descargas por volcable del puerto por mes | sí: `^VOLCABLE_PTO_[1-5]$` |
| `silos-internos.py` | transile interno del silo 7 | cruza con movimientos («productos varios») |

**Modo** (`datos.json → modo`): `planilla` si todos los días de la semana tienen movimientos, hay filas
con `source_date` posterior al domingo y la corrida trae movimientos; si no, `parcial` o `camaras`.
En modo `camaras` cada cifra dice «según cámaras» y su calibración. Con SGC el domingo se completa
recién cuando hay salidas del lunes: armar el deck el lunes después del mediodía.

## 2 · De dónde sale cada lámina (modo planilla)

| Lámina | Fuente | Campos de movimientos que usa |
|---|---|---|
| portada, resumen-planta | todo lo de abajo | — |
| dia-a-dia, cuartos | operaciones R7 por día operativo del ingreso | planta, producto, plataforma `VOLCABLE_PTO*`, `external_ingreso_at` |
| resumen-soja, historico | operaciones R7 + puerta a puerta = salida − ingreso (paquete) | ídem + `external_salida_at` |
| tramos-r7, plantas | tramos de cámara de la corrida (operaciones R7 unidas a movimientos) | matching patente + horas |
| hallazgo | R7 vs comité anterior | ídem |
| girasol, girasol-hist | operaciones R5+R6 del paquete (ETL) | **plataforma `VOLCABLE_1/2`, `KEPPLER_n`** |
| pel-* (pellet) | egresos de pellet de Ricardone; horas y ciclo por cámaras | planta, producto, `movement_type`, **`entregado_por_a`** |
| liq-criterio, liq-productos, liq-semana | `liquidos-criterio.cjs` | producto, planta, `movement_type`, horas |
| liq-tramos | cargas de aceite en la Terminal + tramos de cámara | producto, planta, sentido |
| calada | paquete (cámaras) | — |
| volcables | panel del dashboard: descargas R7 **por calle declarada** | **plataforma `VOLCABLE_PTO_1..5`** |
| volcables-mes | `volcables-historico.cjs` | **plataforma `VOLCABLE_PTO_1..5`** |
| silos | cámaras + cruce con movimientos «productos varios» | **producto PRODUCTOS VARIOS** |

## 3 · Qué cambia con el SGC

La vista `SGC_PROD.CamionesActivos24horas` trae patente, acoplado, producto, planta, ingreso,
salida, pesos y NROINGRESO. Se guarda cada hora (tarea de Windows «BIMtrazer SGC guardado»,
`scripts/sgc/snapshot-sgc.mjs`) y genera `data/movimientos/<día de salida>` con
`SOURCE.json = sgc`. Lo que no trae se infiere y queda marcado en `normalization_warnings`
(`server/sgc/sgcMovimientos.mjs`).

Comparación contra el Excel del 14/10, misma franja horaria (68 movimientos en las dos fuentes):

| Campo | SGC vs Excel |
|---|---|
| patente, planta, producto, kg neto | iguales en 68/68 |
| ingreso / salida | iguales al minuto (el SGC trae segundos) |
| `mov` (E/I) | 66/68; con el guardado horario se toma del primer peso (132 de 159 el 15/10) |
| plataforma | 42/68: volcables del puerto llegan como `VOLCABLE_PTO_SGC` (sin calle); girasol de Ricardone (`VOLCABLE_2`, `KEPPLER_2`) y tanques quedan vacíos |
| cobertura | todo el grano y el aceite de Nodo Sur está; faltan residuos, chatarra, productos varios y movimientos administrativos (EA/IA) |
| calado, CTG, contrato, entregado por/a, humedad | vacíos (el transile se arma con CTG sintético `SGC_TR_<nro>`) |

Estado de cada lámina con SGC:

| Lámina | Estado | Por qué / qué hacer |
|---|---|---|
| soja R7 (cantidad, día a día, cuartos, puerta a puerta) | **OK** | `VOLCABLE_PTO_SGC` pasa el filtro `^VOLCABLE_PTO`. Revisar que `planillaPorVolcable` no sirve (sale `VC`) |
| tramos R7, plantas | OK | salen de cámaras |
| líquidos | **OK** | el criterio es por producto, no usa plataforma. Ojo: `movement_type` puede ser inferido (`SGC_MOV_FROM_HISTORY`) |
| calada | OK | solo cámaras |
| girasol | **corregido** | sin plataforma el ETL no resuelve R5/R6. `datos_comite_semana.py → girasol.movimientos` cuenta `RICARDONE · INGRESO · GIRASOL` por día operativo (Excel: solo volcables 1/2; SGC: todas, incluyen Kepler R4, ~15 %); la lámina lo usa si hay filas SGC y lo dice en la nota |
| volcables (puerto, por calle) | **degrada** | el panel del dashboard da 0 sin calle → la lámina usa lecturas de cámara (como en modo cámaras) |
| volcables-mes | **corregido** | a las filas `VOLCABLE_PTO_SGC` les asigna la calle la cámara SLZVolcableC1–C5 que leyó la patente o el acoplado entre ingreso y salida (14/10: 10 de 15 con lectura, 10/10 iguales al Excel). Las sin lectura van en `sinCalle` y la nota de la lámina las menciona |
| pellet | **corregido** | en el Excel «entregado a PUERTO» = `es_de_vuelta` en el 100 % de los egresos de pellet de Ricardone. Sin ese dato (SGC) va al puerto si el transile se emparejó; `pellet-camaras.cjs` además acepta el viaje si las cámaras lo vieron (±90 min) y cuenta el resto en `sgcSinDestinoPuerto`. Sin probar con pellet real del SGC: los transiles están parados |
| silos | **degrada** | el SGC no trae «productos varios»: la nota de «registros en la planilla» da 0. Omitir esa nota |
| corrida ETL | degrada | operaciones sin plataforma se descartan del comité ejecutivo (`etlCircuitClassificationIndex.ts:1518`); falsos «volcable sin calada» (R12) por no haber calado |

## 4 · Revisión antes de publicar

1. `data/sgc/_polls.jsonl` / `_snapshot.log`: que no haya huecos de más de 24 h en la semana. Un hueco = ingresos perdidos; decirlo en la portada.
2. `datos.json → planilla.porDia`: ningún día en 0 sin explicación (día de volumen bajo = validar en planta, no «datos incompletos»).
3. Contar en `normalization_warnings` cuántos `mov` son `SGC_MOV_FROM_HISTORY`/`DEFAULT`; si son muchos en líquidos, avisar que cargas/descargas son inferidas.
4. Girasol, volcables por calle, volcables-mes y pellet: confirmar que la lámina cayó al método de cámaras y que lo dice; nunca publicar un 0 que viene de un campo vacío.
5. Transile: los transiles están casi parados desde el 07/10; 0 transiles puede ser real.
6. No mostrar fallas de lectura de cámaras en el deck (regla del comité).
7. Comparar contra lo publicado (`Desktop\Jose\comites\<Mes>`), series desde junio.

## 5 · Pendientes para que el SGC alcance al Excel

- Pedido a Vicentin de columnas (MOV, PLATAFORMA, ESDEVUELTA, CTG, FECHACALADO, ENTREGADOPOR…): `docs/sgc/PEDIDO_COLUMNAS_VISTA.md`. Si llegan, `sgcMovimientos.mjs` las toma solas.
- A verificar con el primer operativo de pellet en SGC: que la pata de Ricardone figure como RICARDONE (la vista usa planta = destino) y que el emparejamiento de transile la encuentre.
- Pendiente en el ETL (no bloquea el deck): operaciones sin plataforma descartadas del comité ejecutivo y falsos R12.
