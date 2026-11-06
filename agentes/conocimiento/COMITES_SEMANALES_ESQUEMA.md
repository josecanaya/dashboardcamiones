# Comités semanales (Logística + Seguridad) · esquema para hacerlos automáticos

> **Superado en parte (06/11/2026).** No conoce las cartas de porte como fuente de viajes ni el vínculo. Empezar por `docs/SISTEMA_NODO_SUR.md` (sección 5) y `COMITE_LOGISTICA_BASE_Y_ANEXOS.md`.

Estado al 21/10/2026. Complementa `COMITE_LOGISTICA_COMO_SE_ARMA.md` (detalle lámina por lámina de
Logística) y `reportes/logistica/<semana>/PROMPT-cierre-con-excel.md` (cierre manual de una semana).

## 1 · Qué hace falta por semana (lunes → domingo)

| Insumo | Dónde queda | Cómo llega hoy | Automático |
|---|---|---|---|
| Cámaras (eventos + alertas) del sábado previo al lunes siguiente | `data/truckflow/<día>/event-list.json`, `alert-list.json` | a mano: server arriba + `POST /api/truckflow/export-period {startDate,endDate}` | **no** |
| Movimientos (balanza) | `data/movimientos/<día>/movimientos.json` | SGC por VPN, tarea de Windows «BIMtrazer SGC guardado» cada hora | **sí** (si la VPN está) |
| Movimientos de días con corte de SGC | ídem, `SOURCE.json = excel` | Excel `MovimientosPorContrato` + `scripts/ingest-movimientos.ts` | no |
| Correcciones de patentes de «En vivo» | server local (`/api/truckflow/live/corrections`) | vivas en el server | sí, si el server está arriba |
| Corrida ETL de la semana | `runs/windows/<lunes>_<domingo>/` | `comite_semana.py` la reprocesa | sí (dentro del comando) |
| Fotos DSS de los casos de seguridad | `<semana>/comite-seguridad/fotos/`, `fotos.json` | `fotos-dss.cjs` con VPN, caso por caso | no |
| Curación de casos de seguridad | `casos-excluidos.json`, `casos-extra.json` | a mano, después de mirar fotos | **no (y no debe serlo)** |
| Publicación | artifact (`deck/assets.json`) + PPTX (`deck_a_pptx.py`) | a mano | no |

## 2 · Comandos (todo existe hoy)

```bash
# 0. server del ETL
node server/truckflow-local-server.mjs
# 1. cámaras de la semana (sábado previo → lunes siguiente, por la hora operativa +206 min)
curl -X POST http://127.0.0.1:8787/api/truckflow/export-period -H "Content-Type: application/json" -d "{\"startDate\":\"<sáb>\",\"endDate\":\"<lun>\"}"
# 2. Logística: corrida + cálculos + datos.json + láminas
python scripts/estado-planta/comite_semana.py --desde <lunes> --hasta <domingo>
# 3. Seguridad: detección + doble ciclo + láminas
node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts <lunes> <domingo>
python scripts/estado-planta/seguridad-doble-ciclo.py <lunes> <domingo> reportes/logistica/<lunes>_<domingo>/comite-seguridad
python scripts/estado-planta/gen_comite_seguridad.py reportes/logistica/<lunes>_<domingo>/comite-seguridad
# 4. PPTX (lámina = imagen)
python scripts/estado-planta/deck_a_pptx.py <deck/project> <carpeta blobs> <salida.pptx>
```

## 3 · Huecos para que corra solo

1. **Descarga de cámaras sin tarea programada.** Es el único insumo que hoy depende de alguien.
   Falta un `scripts/truckflow/descargar-dias.mjs` (o tarea de Windows diaria, 06:00) que llame a
   `export-period` para ayer y antes de ayer (re-bajar el día anterior completa el que se bajó a medias).
2. **Seguridad no tiene orquestador.** Logística tiene `comite_semana.py`; Seguridad son 3 comandos
   sueltos. Falta `comite_seguridad_semana.py` (o un `--seguridad` en `comite_semana.py`) que también
   copie `casos-excluidos.json` / `casos-extra.json` vacíos y avise qué casos necesitan foto.
3. **Chequeo de preparación («¿se puede armar?»).** Antes de correr, un paso que diga por día:
   cámaras sí/no y cantidad, movimientos sí/no y fuente (sgc/excel), huecos del SGC en
   `data/sgc/_polls.jsonl` > 24 h, y si el domingo ya tiene salidas del lunes. Si falta algo, el deck
   sale en modo `parcial`/`camaras` y lo dice; nunca un 0 de un campo vacío.
4. **Disparador semanal.** Lunes 14:00 (con SGC el domingo se completa recién con salidas del lunes):
   preparación → Logística → Seguridad → aviso con el resumen de modo y casos. La revisión humana
   (fotos, excluidos, comparación contra lo publicado) queda como paso explícito antes de publicar.
5. **Histórico de seguridad.** Después de presentar hay que sumar la barra a
   `comite-seguridad-historico.json`. Hoy se olvida (05–11/10 no está cargado). Que el orquestador lo
   proponga con la fecha del comité.
6. ~~Rangos de más de una semana~~ **(resuelto 21/10)**: `comite_semana.py --desde X --hasta Y` con un
   período cualquiera corre las ventanas semanales lunes→domingo que lo cubren y las compone (paquete
   por tramos, `datos_comite_semana.py` con corridas separadas por coma). Seguridad acepta cualquier rango.
7. ~~Comité anterior fijo en 24/09–04/10~~ **(resuelto 21/10)**: cada comité deja `publicado.json`
   (sus cifras, la serie desde junio y el histórico de pellet) y el siguiente lo toma con
   `--anterior reportes/logistica/<período>/comite-logistica`. Hay que pasarlo siempre (el default sigue
   siendo 24/09–04/10).

## 4 · Revisión humana que no se automatiza

- Fotos DSS de cada caso de seguridad y decisión de excluir (cambios de calle en el momento, cargas de
  cáscara que parecen descargas, etc.).
- Criterio de líquidos y cualquier regla nueva: mostrar las dos cifras, no elegir.
- Comparar contra lo publicado (`Desktop\Jose\comites\<Mes>`) y series desde junio.
- Reglas fijas del deck: nunca mostrar fallas de lectura de cámaras; día con volumen bajo = validar en planta.
