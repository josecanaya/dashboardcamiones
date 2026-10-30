# Informe de Logística · puesta al día de mediados de septiembre a octubre (para el comité ampliado)

**Para qué:** al comité se suma gente nueva y las semanas del 12 al 21/10 tuvieron poca actividad. El informe pone el
período en contexto con los últimos comités, para que no quede solo una semana floja. Solo logística.

## Alcance: 5 períodos, uno por comité

| Comité | Período | Fuente de las cifras |
|---|---|---|
| 18/9 | 10–16/09 | PDF `Desktop\Jose\comites\09-Septiembre\Reporte de Logistica 18_9.pdf` + ficha en `agentes/conocimiento/HISTORICO_COMITES.md` |
| 28/9 | 17–23/09 | PDF `09-Septiembre\Presentacion Comite Logistica 28-9.pptx (1).pdf` |
| 4/10 | 24/09–04/10 | PDF `10-Octubre\Comité de Logística Nodo Sur · 24 sep – 4 oct…pdf` + `reportes/logistica/2026-09-24_2026-10-04/comite-logistica/datos.json` |
| 11/10 | 05–11/10 | PDF `10-Octubre\Comité de Logística Nodo Sur · 5 – 11 oct…pdf` + `reportes/logistica/2026-10-05_2026-10-11/comite-logistica/publicado.json` |
| Hoy | 12–21/10 | `reportes/logistica/2026-10-12_2026-10-21/comite-logistica/datos.json` y `calculo/` (deck https://claude.ai/artifact/SevH7aavu2Tiph7RLcXHCg) |

Regla (memoria «comparar contra lo publicado»): las cifras de comités pasados son las **publicadas** en los PDF; las
semanas se comparan **por día** porque los períodos tienen largos distintos (7, 7, 11, 7 y 10 días).

## Láminas (unas 10, mismo formato del deck: líneas con valores, tarjetas con mini-gráfico, logos)

1. Portada «Logística Nodo Sur · de septiembre a octubre».
2. Cómo leer el informe: qué es R7, Playa 1, puerta a puerta, cuartos Q1–Q4 (una lámina, sin método ni pasos).
3. Volumen por día de cada comité: soja R7, girasol, líquidos, pellet (línea por producto, 5 puntos).
4. Soja R7 en el tiempo: puerta a puerta, Playa 1 y San Lorenzo (serie desde junio, como «historico»).
5. Girasol en el tiempo (serie publicada + período actual).
6. Pellet: los operativos de transile (tabla de pellet-hist: 11/9, 18/9, 4/10, 11/10, hoy sin operativo).
7. Líquidos: cargas de la Terminal y descargas de Ricardone por día; lo nuevo, el oleico en Ricardone.
8. Transile interno de silos: 28/09–02/10 (silo 7, 141 cargas), 05–09/10 (43), 16–20/10 (silo 8, 214).
9. Qué cambió en octubre: balanza SGC en lugar del Excel, poca soja, transile al puerto parado desde el 07/10.
10. Cierre: tres o cuatro lecturas para discutir.

## Cómo hacerlo rápido (30 min)

1. Extraer de los 4 PDF las cifras por comité (soja R7 operaciones y días, puerta a puerta, Playa 1, San Lorenzo,
   girasol total y operaciones, pellet viajes y ciclo, líquidos camiones) a `reportes/logistica/informe-sep-oct/datos.json`.
   Para 18/9 y 28/9 usar `HISTORICO_COMITES.md` si el PDF no trae algo; no inventar: lo que falte, «s/d».
2. El período actual sale de `2026-10-12_2026-10-21/comite-logistica/datos.json`, `publicado.json` (series) y
   `calculo/silos-internos*.json`, `liquidos-*.json`.
3. Armar las láminas con un script chico `scripts/estado-planta/gen_informe_sep_oct.py` que reuse las funciones de
   `gen_comite_logistica_semana.py` (linechart, ctx, note, kpi, footer) o copiar las láminas ya hechas (historico,
   girasol-hist, pellet-hist, silos, liq-oleico) del deck 12–21.
4. Publicar como deck nuevo del tipo Slides, copiando logos y fotos aéreas desde SevH7aavu2Tiph7RLcXHCg.
5. Revisar cada lámina convertida a imagen (`render.py`) antes de publicar.

## Pendiente de decidir con José

- ¿Incluye el 22/10 (completo mañana al mediodía)?
- ¿Va como deck aparte o como sección al principio del comité 12–21?
