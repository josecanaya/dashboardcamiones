# Prompt · cierre de los 3 informes 05/10–11/10 con el Excel

Pegar en Claude Code (en la PC del trabajo, dentro del repo `dashboard`), después de dejar los Excel
`MovimientosPorContrato_*.xlsx` en la carpeta Descargas (o decirle dónde están).

---

Repo dashboard, rama `automatizacion`. Leé CLAUDE.md. Respondé en español.

OBJETIVO: completar con el Excel los tres informes de la semana **05/10 al 11/10/2026**, que se armaron el 12/10 solo
con cámaras: **Comité de Logística**, **Comité de Seguridad** e **Informe de reconocimiento de cámaras**. No inventar
patentes ni cifras: todo sale de los datos y de los scripts del repo.

PASO 0 · Preparar
1. `git pull origin automatizacion`. Si hay cambios locales, avisame antes de tocarlos.
2. `npm install` si falta `node_modules` (hace falta `tsx`).
3. Server del ETL arriba: `node server/truckflow-local-server.mjs` (puerto 8787). Verificá `GET /api/truckflow/health`.
4. Cámaras: tienen que existir `data/truckflow/2026-10-04` … `2026-10-12` (event-list.json + alert-list.json). Si faltan
   días, buscá en el repo cómo se bajan (server / API Truckflow) y bajalos; si no se puede, decime cuáles faltan y seguí
   con lo que haya, marcándolo en cada informe.
5. Excel: buscá en Descargas los `MovimientosPorContrato_2026100X/1X.xlsx` (el del día D trae D-1 y D-2; hacen falta los
   que cubren del 05/10 al 11/10, o sea del 20261006 al 20261013). Listame cuáles encontraste y qué días cubren antes de seguir.

PASO 1 · Cargar el Excel y reprocesar la semana
1. `npx tsx scripts/ingest-movimientos.ts --excel <archivo>` por cada Excel. Verificá que quede
   `data/movimientos/2026-10-05` … `2026-10-11/movimientos.json` y decime cuántas filas tiene cada día.
2. Reprocesar la ventana: `POST /api/etl/runs {"from":"2026-10-05","to":"2026-10-11","force":true}` (o `mcp__etl__run_etl`).
   Confirmá en `runs/windows/2026-10-05_2026-10-11/manifest.json` que `movimientosRows` > 0.

PASO 2 · Comité de Logística
Un comando (ya hace la ingesta y el reproceso si le pasás los Excel; si ya los cargaste en el PASO 1, agregá `--sin-etl`):
```
python scripts/estado-planta/comite_semana.py --desde 2026-10-05 --hasta 2026-10-11 --sin-etl
```
Detalle en `reportes/logistica/2026-10-05_2026-10-11/comite-logistica/calculo/README.md` («Cuando llegue la planilla»).
`VICENTIN_ROOT` = la raíz con `data/` y `runs/` (por defecto, el repo principal). El resumen final dice el modo:
solo pasa a «planilla» si todos los días 05–11/10 tienen movimientos, el último Excel es posterior al 11/10 y la corrida
tiene movimientos; si queda en «parcial»/«cámaras», decime qué días faltan y no publiques como definitivo.
Contame qué cifras cambiaron respecto de la versión solo cámaras (R7, girasol, pellet, líquidos, puerta a puerta).
El criterio nuevo de líquidos sigue pendiente de mi aprobación: mostrame los dos números (criterio viejo y nuevo) y no
elijas por mí. Para actualizar la presentación publicada (artifact https://claude.ai/artifact/BLSZxYCY8QWkuMNqGxKNHo),
leela primero y publicá sobre esa misma URL solo los archivos de `deck/project/` que cambiaron.

PASO 3 · Comité de Seguridad
```
node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts 2026-10-05 2026-10-11
python scripts/estado-planta/gen_comite_seguridad.py reportes/logistica/2026-10-05_2026-10-11/comite-seguridad
```
Ver `reportes/logistica/2026-10-05_2026-10-11/comite-seguridad/README.md`. Con el Excel el detector solo:
- confirma o descarta la vuelta a Ricardone candidata (BWA132, 09/10) y cualquier otra;
- completa la columna Excel de las calles y agrega volcable declarado ≠ calle de la cámara;
- recalcula camionetas/utilitarios sin Excel contra el Excel de la semana;
- saca el «provisorio» del histórico.
Si las correcciones de En vivo del server de esta PC difieren de la copia guardada (`correcciones-en-vivo.json`),
decímelo antes de pisarla. Mostrame el antes y el después de cada sección (vueltas, calles, interplanta, camionetas) y
revisá en una vista previa que las 13+ láminas no se desborden. Si hay capturas de DSS disponibles (con VPN), ofrecé
sumarlas vía `fotos.json`.

PASO 4 · Informe de reconocimiento de cámaras (necesita el Excel: el denominador son los movimientos)
```
npx tsx scripts/informe-reconocimiento-camaras.ts --from 2026-10-05 --to 2026-10-11
node scripts/informe-reconocimiento-camaras-html.mjs 2026-10-05_2026-10-11 "Reconocimiento por cámara · 05/10 al 11/10/2026"
```
Leé la cabecera del script (`--exclusiones`): si hay días o puntos fuera de servicio esta semana, preguntame antes de excluir.
Compará con el informe anterior (`reportes/camaras/2026-09-01_2026-09-30/`) y marcá las cámaras que bajaron (las de
volcables del puerto leyeron poco y la V5 casi nada desde el 09/10, según el comité de logística).

PASO 5 · Cierre
1. Resumen corto por informe: qué cambió con el Excel, qué quedó pendiente y por qué.
2. Commit en `automatizacion` con los scripts y `reportes/` actualizados (no subir `data/` ni `runs/`) y push a origin.
3. Después de presentar, agregar el comité de seguridad a `scripts/estado-planta/comite-seguridad-historico.json`
   (barra con la fecha del comité y casos por tipo) — preguntame la fecha.
