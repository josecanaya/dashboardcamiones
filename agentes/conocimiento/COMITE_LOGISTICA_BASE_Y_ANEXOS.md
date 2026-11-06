# Comité de Logística · deck base y anexos

> Mapa general (fuentes, En vivo, comités, índice de documentos): `docs/SISTEMA_NODO_SUR.md`.

Estándar fijado el 02/11/2026 a partir del comité 23–29/10 (último trabajado, 25 láminas).
Complementa `COMITE_LOGISTICA_COMO_SE_ARMA.md` (flujo y scripts). Regla: **la base va siempre**;
los **anexos** solo cuando la semana trae ese hecho (operativo de pellet, transile interno, etc.).

## 1 · Fuentes de datos: qué manda en cada cosa

| Qué se mide | Fuente que manda | Para qué se usan las otras |
|---|---|---|
| **Cantidad de viajes** (recepción, despacho, transiles) | **Cartas de porte ARCA** (API agro): `node --env-file=.env.local scripts/cruce-cartas-sin-carta/bajar-cartas-api.mjs DESDE HASTA data/arca/api/cartas-<rango>.json` | SGC: producto, plataforma, kg y control cruzado. Si el SGC tiene huecos (vista de 24 h, tarea horaria caída), las cartas igual cuentan. |
| **Tiempo en planta** (permanencia, ponderado) | **SGC**: salida − ingreso de balanza, viajes finalizados, día operativo (22 h) de la salida | Cámaras solo si falta el SGC y rotulado aparte. |
| **Tiempos por tramo** (Playa 1, Playa 3, Playa OSL, descarga, ida/vuelta) | **Cámaras con el algoritmo de vínculo** (cartas + lote + DSS), no lecturas crudas por patente | La corrida ETL (circuit_timing) para soja R7, igual que lo publicado. |
| Reconstruir pasos que faltan | **Siempre el algoritmo**: `scripts/vinculo/cobertura.mjs` (worktree `claude/dss-vinculo-e5702c`, con `VINCULO_DATA` y `VINCULO_CARTAS`) | Nunca rellenar a mano ni con promedios. |

Reglas de medición:
- Hora operativa de cámaras = occurredAt + 206 min; día operativo desde las 22 h; cuartos Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22.
- Una lectura de cámara no es un viaje. No mezclar tiempos completos del SGC con recorridos parciales de cámara como si fueran lo mismo.
- En una misma lámina y entre láminas que se comparan, **una sola fuente y una sola medida** (media en todo el deck; si se usa mediana, decirlo).
- Transiles con varias vueltas por día: unir lecturas por patente y cortar el viaje cuando vuelve a Ricardone después del puerto; salida de Ricardone = Balanza Egreso.
- Cifras redondas, sin «≈», nunca fallas de cámara en las láminas; calada trabaja por tandas (espera alta con poco volumen no es falta de capacidad).

## 2 · Deck base (va siempre)

| # | Lámina | Contenido | Fuente |
|---|---|---|---|
| 1 | Portada | período (viernes a jueves, o el que se pida), plantas | — |
| 2 | **Tiempo en planta ponderado por producto** | horas por viaje por planta y producto, ponderado por viajes; mes y semana contra la anterior; Nodo Sur definido en la lámina | SGC (`ponderado_mes.py`, `ponderado_general.py`, `permanencia.py`) |
| 3 | Planta: qué entró | tarjetas soja R7, girasol, líquidos, pellet; calada, volcables, silos | cartas + SGC |
| 4 | Planta: camiones adentro por día | ley de Little por planta | cámaras (vínculo) |
| 5–11 | **Soja R7** | separador · tramos · resumen · día por día · por planta · cuartos · histórico desde junio | corrida ETL + SGC; día por día y por planta con la misma fuente |
| — | **Girasol** | según la semana: recepción R5/R6 (tramos + histórico) y/o despacho R12 (tramos + camiones y cartas); el histórico de recepción va siempre | SGC + cartas + vínculo |
| — | **Líquidos** | la semana (1 lámina: movimientos por día, por planta, producto y sentido) + por punto de carga (1 lámina) | SGC + cámaras |
| — | Otros productos | una lámina si aparece un producto que no es habitual (ej. cártamo en el silo Chief) | SGC + vínculo |
| — | **Sectores** | separador · calada · volcables · silos | cámaras + SGC |
| último | Cierre | seis lecturas de la semana | todo |

## 3 · Anexos (solo cuando pasa)

| Anexo | Cuándo | Qué lleva | Fuente |
|---|---|---|---|
| **Operativo de pellet** | hay cartas de pellet en la semana (tipo 284, derivado 199, planta 21832 → 25567) | viajes por día y camiones (cartas) · tramos por día con el cuello de botella de cada día (Playa 3 / carga en Ricardone, Playa OSL / descarga en el puerto, ida, vuelta) · ciclo · viajes por camión · comparación con los operativos desde junio | cartas (cantidades) + vínculo (tiempos) + `pelletHistorico` |
| **Transile interno de silos** | `silos-internos.py` detecta camiones con ≥3 viajes por día desde los silos 7/8 | viajes por día y destino · camiones con foto · ritmo por cuarto · cómo lo registra la planilla | cámaras (vínculo) + SGC |
| Transile R29 (soja de silos al puerto) | hay egresos SOJA · SILO_CHIEF hacia el puerto | viajes, tramos y destino | cartas + vínculo |
| Despacho a terceros | cartas de salida de Vicentin a otra planta (ej. girasol a Molinos Agro, 21832 → 408411) | viajes por camión, cartas y destino | cartas + SGC |
| Últimos comités / resumen del mes | **solo si se pide** (gente nueva, semana con poca actividad) | actividad y tiempos por comité; no va por defecto | serie de comités |

> **Operativo de pellet 29/10–3/11/2026:** receta completa, decisiones y cifras en
> `COMITE_LOGISTICA_PELLET_OPERATIVO_29OCT_3NOV.md` (láminas `pel-op-*`: viajes, flota, tramos, histórico, espera por hora en playas).

## 4 · Pasos de la semana

1. Exportar cámaras de la semana y del día siguiente; verificar `journeyUid` y el último evento de cada día.
2. Bajar las cartas de la semana (API) y revisar el SGC por día (`data/movimientos/<día>/SOURCE.json`): si falta un día, contar con cartas y avisar.
3. Correr las ventanas ETL semanales que cubren el período y el vínculo de lecturas.
4. Cálculos de la base (`comite_semana.py`) y los de cada anexo que corresponda.
5. Generar, renderizar cada lámina, cruzar las cifras repetidas entre láminas (totales de líquidos, % de volcables, esperas) y publicar.

## 5 · Qué está automatizado (02/11/2026)

Un comando arma base + anexos:

```bash
python scripts/estado-planta/comite_semana.py --desde <vie> --hasta <jue> --anterior <carpeta comité anterior> [--pellet-desde <día>]
```

Además de lo de `COMITE_LOGISTICA_COMO_SE_ARMA.md`, ahora corre (todo en `scripts/estado-planta/`, salida en `calculo/`):

| Script | Salida | Lámina |
|---|---|---|
| `../cruce-cartas-sin-carta/bajar-cartas-api.mjs` | `cartas.json` | fuente de viajes de los anexos |
| `ponderado-producto.py` (desde junio + mes; girasol con `data/cache/girasol-comites.json`) | `ponderado-producto.json` | **permanencia** (base, después de la portada) |
| vínculo `scripts/vinculo/cobertura.mjs` del worktree `dss-vinculo-e5702c` (`VINCULO_DATA`, `VINCULO_CARTAS`) | `reportes/vinculo/<desde>_<hasta>/cobertura.json` del worktree | tiempos de los anexos |
| `transile-cartas-camaras.py` | `pellet-operativo.json` | **anexo pellet**: `div-pel-op`, `pel-op-viajes`, `pel-op-tramos` (+ `pellet-hist`) antes del cierre; reemplaza al pellet de la semana |
| (mismo `pellet-operativo.json`, `esperaPorHora`) | — | **anexo pellet** `pel-op-playas`: línea de tiempo de camiones esperando por hora en Playa 3 y Playa OSL (pedido de operaciones, 02/11) |
| `calada-producto.py` | `calada-producto.json` | **sectores** `calada-producto` (después de `calada`): camiones calados por producto y por día (pedido del sector de calado, 02/11); el pellet en transile no se cuenta |
| `despachos-cartas.py` | `despachos-cartas.json` | **anexo despachos** (si hay ≥ 10 viajes) |
| `tramos-circuitos.py`, `liquidos-puntos.py`, `calles-volcables-sgc.py [capturas-dss.json]` | JSON del mismo nombre | todavía no los lee el generador (ver abajo) |

`--pellet-desde`: si el operativo empezó antes del período (ej. 29/10), el anexo lo toma completo.
«Últimos comités» solo aparece si en `calculo/` hay `serie-comites.json` (anexo a pedido).

Falta:
- Que el generador use `tramos-circuitos.json` (girasol R12 y líquidos por circuito), `liquidos-puntos.json` (líquidos por punto de carga) y `calles-volcables-sgc.json` (volcables por calle con el SGC) en vez de las versiones viejas.
- Otros productos (cártamo): generalizar `cartamo.py` a cualquier producto nuevo.
- Anexo de transile interno con el algoritmo: hoy usa `silos-internos.py` (lecturas directas).
- ~~`VINCULO_CARTAS` vive en la rama `claude/dss-vinculo-e5702c`~~: unida el 03/11 (`9cfc3e7`); el vínculo se corre desde el repo, sin el worktree.
