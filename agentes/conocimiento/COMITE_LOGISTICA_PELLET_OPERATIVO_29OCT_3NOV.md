# Anexo «Operativo de pellet» · 29/10 → 3/11/2026 · receta para terminar el comité

Traspaso del 05/11/2026. Complementa `COMITE_LOGISTICA_BASE_Y_ANEXOS.md` (estándar base + anexos) y
`COMITE_LOGISTICA_COMO_SE_ARMA.md` (flujo general). Este documento deja **todo lo necesario para rehacer y
terminar el anexo de pellet de esta semana** y las decisiones que el usuario fue tomando, para no repetirlas.

El anexo ya está generado y revisado en láminas (ver §6). Lo que falta del comité de la semana está en §8.

## 1 · Qué quedó hecho y dónde está

Carpeta de referencia (en git solo `pellet-operativo.json` y `png/`; `entradas/` pesa 21 MB y queda solo en disco, rehacerla con los pasos 1 y 3 de §3 si falta):
`reportes/logistica/2026-10-30_2026-11-05/pellet-operativo-29oct-3nov/`

| Archivo | Qué es |
|---|---|
| `pellet-operativo.json` | salida de `transile-cartas-camaras.py` (todo lo que leen las láminas del anexo) |
| `png/anx-18…24-*.png` | las 7 láminas ya renderizadas (divisoria + 6) para ver cómo debe quedar |
| `entradas/cartas-api_2026-10-26_2026-11-04.json` | cartas de porte ARCA (2169; pellet = tipo 284 / derivado 199) |
| `entradas/cobertura-vinculo_2026-10-28_2026-11-03.json` | salida del algoritmo de vínculo (lecturas de cámara por camión, 19 MB) |
| `entradas/choferes-api_2026-10-26_2026-11-04.json` | CTG → cuitChofer / cuitTransportista (solo para la conclusión de choferes, §5) |

Código nuevo o modificado (sin commit al 05/11, el usuario decide cuándo):
- `scripts/estado-planta/transile-cartas-camaras.py` (nuevo): viajes por cartas + tiempos por cámaras + flota.
- `scripts/estado-planta/gen_comite_logistica_semana.py`: bloque de anexos (antes de `ORDER = [`).
- `scripts/estado-planta/comite_semana.py`: `--carpeta`, `--pellet-desde`, pasos de cartas / vínculo / anexos.
- `scripts/estado-planta/render_laminas.py` (nuevo): renderiza láminas a PNG con Chrome headless.
- `scripts/cruce-cartas-sin-carta/bajar-choferes-api.mjs` (nuevo).
- Otros scripts nuevos de la base: `ponderado-producto.py`, `calada-producto.py`, `despachos-cartas.py`,
  `tramos-circuitos.py`, `liquidos-puntos.py`, `calles-volcables-sgc.py`.

## 2 · Reglas del usuario para este anexo (no re-discutir)

1. **Viajes = cartas de porte ARCA** (fuente de verdad desde 2/11). Pellet: `typeCode 284`, `derivedProductCode 199`,
   origen 21832 (Ricardone) → 25567 (puerto); excluir estado `AN` (anuladas).
2. **Tiempos = cámaras con el algoritmo de vínculo** (`scripts/vinculo/cobertura.mjs`), no lecturas crudas.
3. El operativo se toma **desde el 29/10** (las cartas empiezan ahí; el 28 solo hay lecturas sueltas). El gráfico
   por hora muestra solo días con ≥ 50 cartas (30/10 → 2/11).
4. Un solo **ciclo** en todo el anexo: `CIC = Ricardone + ida + puerto` (medias) = **356 min**, comparable con la
   serie publicada. No mezclar con la mediana ni con el ciclo que incluye la vuelta.
5. Gráfico de espera por hora: barras apiladas, **Ricardone verde, San Lorenzo violeta**, sin franja día/noche
   («no aporta»), valores dentro, total arriba, máximo en rojo, escala común entre las dos láminas.
6. Estilo: sin «≈», enteros, sin rótulo de fuente, nunca fallas de cámara, conclusiones sin obviedades.
7. **Trabajo de corrido** (lámina de flota): descanso = **6 h o más sin lecturas después de un egreso**, donde
   egreso = `san_lorenzo:Egreso`, `ricardone:Salida 2` o cualquier `Balanza Egreso`. Un hueco largo después de
   otra cámara (ej. esperando en Playa 3) cuenta como trabajo. Se cambia con la variable `PAUSA_H` (por defecto 6).
8. No commitear hasta que el usuario lo pida. Nunca commitear los archivos de Seguridad
   (`comite-seguridad-deteccion.ts`, `gen_comite_seguridad.py`, carpetas `comite-seguridad`, `barrera-sin-sistema`).

## 3 · Receta paso a paso (rehacer el anexo)

Todo desde la raíz del repo. Requisitos: API local arriba (`node server/truckflow-local-server.mjs`, puerto 8787),
`.env.local` con las llaves de agro, VPN al DSS solo si se quieren fotos.

```bash
# 1) Cartas de la semana (API agro; lleva ~1 min por rango)
node --env-file=.env.local scripts/cruce-cartas-sin-carta/bajar-cartas-api.mjs 2026-10-26 2026-11-04 data/arca/api/cartas-2026-10-26_2026-11-04.json

# 2) Exportar cámaras (si falta el día; solo el export, el ETL lo corre el usuario)
#    POST http://127.0.0.1:8787/api/truckflow/export-period  {"startDate":"2026-10-28","endDate":"2026-11-04"}

# 3) Vínculo de lecturas — se corre DESDE el worktree (ahí vive la opción VINCULO_CARTAS, aún sin commit)
cd .claude/worktrees/dss-vinculo-e5702c
VINCULO_DATA=<repo>/data VINCULO_CARTAS=<repo>/data/arca/api/cartas-2026-10-26_2026-11-04.json \
  node --max-old-space-size=8192 scripts/vinculo/cobertura.mjs 2026-10-28 2026-11-03
#    → reportes/vinculo/2026-10-28_2026-11-03/cobertura.json  (dentro del worktree)

# 4) Viajes, tramos, esperas por hora y flota
python scripts/estado-planta/transile-cartas-camaras.py \
  data/arca/api/cartas-2026-10-26_2026-11-04.json \
  .claude/worktrees/dss-vinculo-e5702c/reportes/vinculo/2026-10-28_2026-11-03/cobertura.json \
  2026-10-28 2026-11-03 <carpeta comité>/calculo/pellet-operativo.json pellet
#    PAUSA_H=6 por defecto. Imprime resumen: cartas, camiones, toneladas, corrido > 12 h.

# 5) Generar el deck (lee <carpeta>/calculo/pellet-operativo.json) y renderizar láminas del anexo
python scripts/estado-planta/gen_comite_logistica_semana.py <carpeta comité>
RENDER_OUT=<carpeta png> python scripts/estado-planta/render_laminas.py anx <carpeta comité>/deck/project \
  div-pel-op pel-op-viajes pel-op-flota pel-op-tramos pel-op-hist pel-op-playas-1 pel-op-playas-2
```

Atajo: `python scripts/estado-planta/comite_semana.py --desde 2026-10-30 --hasta 2026-11-05 --anterior reportes/logistica/2026-10-23_2026-10-29/comite-logistica --pellet-desde 2026-10-29 [--sin-etl]`
hace los pasos 1, 3, 4 y 5 (más la base). Cuidado: sobrescribe `calculo/`.

Dónde está el cálculo en el código del generador: `gen_comite_logistica_semana.py`, buscar `pellet-operativo`
(`PO = ...`) y `ANEXO_IDS`. El orden: `ANEXO_IDS` va antes de `cruces`; si existe `pel-op-hist` se descartan las
láminas viejas de pellet de la semana (`div-pellet`, `pel-*`, `pellet-operativo`, `pellet-tramos`, `pellet-hist`).

## 4 · Cómo se arman los viajes y los tiempos (`transile-cartas-camaras.py`)

- Las lecturas del vínculo se unen **por patente** (solo las de CTG de pellet). Un viaje nuevo empieza cuando el
  camión vuelve a Ricardone después de haber estado en el puerto, **o** tras más de 8 h sin lecturas (cortes de
  lecturas sueltas de antes del operativo).
- Día operativo = 22 h; el día del viaje es el de la Balanza Egreso de Ricardone (o el del ingreso al puerto).
- Tramos (minutos): `ric` (ingreso→balanza egreso), `playa3` (Playa 3→balanza egreso), `ida`, `playaOsl`
  (ingreso SL→balanza ingreso SL), `descarga` (→plataforma volcables), `puerto` (ingreso→egreso SL), `vuelta`.
- `esperaPorHora`: camiones con la espera abierta en esa hora (Playa 3→Balanza Egreso; Ingreso SL→Balanza Ingreso SL).
- `flota`: por camión `viajes` (cartas), `viajesCamara`, `corridoMax`, `tramosMas12`; global `tramosCorridos`
  (ordenado), `corridoPorCamion` (buckets <8, 8–12, 12–18, 18–24, >24 h), `camionesCorridoMas12`, `pausaCorte`.

## 5 · Resultados de este operativo (para las conclusiones)

- **571 cartas, 58 camiones, 15.222 t**; 563 viajes armados por cámaras; 9,8 viajes por camión
  (VJG112 hizo 17; EUV766 y HNE318, 15). Cartas por día: 29/10 22 · 30/10 104 · 31/10 122 · 1/11 110 · 2/11 193 · 3/11 20.
- **Ciclo CIC 356 min**. Medias por tramo: Ricardone 147, Playa 3 129, ida 26, Playa OSL 102, descarga 63,
  puerto 183. El cuello cambia por día: 31/10 manda el puerto (Playa OSL 263 min, puerto 378); 1/11 manda la
  carga en Ricardone (Playa 3 283 min); 2/11 cae todo (Ricardone 103, puerto 139) con el mayor volumen.
- **Picos de espera simultánea**: máximo 27 camiones en Playa 3 y 36 en Playa OSL; 46 a la vez el sáb 31/10
  a las 9 h (10 Ricardone + 36 San Lorenzo) y 48 el lun 2/11 a las 10 h.
- **Flota**: 54 de 58 camiones pasaron 12 h de corrido y 48 pasaron las 24 h (descanso 6 h tras un egreso);
  tramos más largos: TOE184 107 h (12 viajes), VJG112 103 h (17), EUV766 98 h, BVS300 96 h, TAC436 95 h.
  Casi ningún camión paró 6 h tras egresar: salían y volvían a la fila enseguida.
- **Choferes**: la carta declara **un solo chofer por camión** en todo el operativo (60 CUIT para 60 patentes,
  también en los tramos de 100 h). Es lo que declara el transportista al emitir; puede no reflejar relevos.
  Las cámaras **no alcanzan** para confirmar relevos: de día la Balanza Egreso de Ricardone
  (`RicB2Egreso`) y la Salida C1 de San Lorenzo (`SLZSalidaC1Fte`) muestran a la persona al volante; de noche
  ninguna sirve (en TOE184, 5 de 14 viajes sin foto útil, todos nocturnos). Solo el color de la ropa se distingue;
  pelo y contextura no. **No se hace comparación de caras ni proceso automático** (dato biométrico). Frase
  sugerida para el comité: «la carta declara un solo chofer por camión; las cámaras no permiten confirmar relevos,
  sobre todo de noche; hace falta registrar al chofer en portería o balanza».
  Referencia: memoria `carta-cuit-chofer`; script `bajar-choferes-api.mjs`. No armar la hoja de cabinas para los
  48 camiones (esfuerzo alto, resultado débil).

## 6 · Láminas del anexo (ids y qué lleva cada una)

| Orden | id | Contenido |
|---|---|---|
| 1 | `div-pel-op` | divisoria del anexo |
| 2 | `pel-op-viajes` | viajes y camiones por día (barras) + viajes por camión, CIC, ida/vuelta |
| 3 | `pel-op-flota` | izquierda: camiones por n.º de viajes (1–4, 5–8, 9–12, 13+); derecha: camiones por tramo más largo sin descansar 6 h; notas (camiones >24 h, tramo más largo, viajes del que más hizo) y «los más largos» con patente, horas, viajes y fechas |
| 4 | `pel-op-tramos` | tramos apilados por día (medianas) con el cuello de botella del día; título usa `CIC` |
| 5 | `pel-op-hist` | operativos de pellet desde junio (`publicado.json` → `pelletHistorico`, de la carpeta `--anterior`) + este; ciclo = CIC |
| 6–7 | `pel-op-playas-1` / `-2` | camiones esperando por hora, 30–31/10 y 1–2/11: Ricardone verde / San Lorenzo violeta |

Vista previa de cómo deben verse: `reportes/logistica/2026-10-30_2026-11-05/pellet-operativo-29oct-3nov/png/`.

## 7 · Trampas conocidas

- `render_laminas.py` necesita Chrome o Edge instalados; las láminas cargan fuentes de Google Fonts (con internet).
- Si el anexo sale con el pie «23/10–29/10»: la carpeta de trabajo se copió del comité anterior; corregir el
  período en el generador/`datos.json` antes de publicar.
- `bajar-cartas-api.mjs` descarta el chofer al normalizar; por eso existe `bajar-choferes-api.mjs`.
- La vista SGC `CamionesActivos24horas` cubre solo 24 h (el 31/10 se perdió): para pellet no importa porque se
  cuenta con cartas, pero avisarlo si se usa el SGC en la base.
- Sin el worktree `.claude/worktrees/dss-vinculo-e5702c` (rama `claude/dss-vinculo-e5702c`, con `VINCULO_CARTAS`
  sin commit) no se puede correr el vínculo con cartas. **No borrarlo** hasta mergear esa opción. Mientras tanto
  `entradas/cobertura-vinculo_…json` permite rehacer los pasos 4 y 5 sin correrlo de nuevo.
- Variable `PAUSA_H` = horas de descanso del «trabajo de corrido»; la lámina y las notas leen `pausaCorte` del JSON.
- Si el nombre de un bucket tiene tilde (`más de 24 h`) y se imprime desde PowerShell, puede salir con el
  carácter roto; el JSON está bien (UTF-8).

## 8 · Qué falta para cerrar el comité de la semana (no hecho)

1. **ETL manual del usuario** para las ventanas 26/10–1/11 y 2/11–… (soja R7 y base); después correr
   `comite_semana.py … --sin-etl --pellet-desde 2026-10-29`.
2. Que el generador use `tramos-circuitos.json` (girasol R12, líquidos por circuito), `liquidos-puntos.json` y
   `calles-volcables-sgc.json` en vez de las versiones viejas.
3. Otros productos (cártamo): generalizar `cartamo.py`.
4. Anexo de transile interno con el algoritmo (hoy usa `silos-internos.py`).
5. Corregir el período del pie y revisar todas las láminas renderizadas; cruzar cifras repetidas entre láminas.
6. Publicar (versión única en Drive con `sync-informe-slides.mjs`, o el visor HTML propio): **no se pidió todavía**.
7. Mergear la rama `claude/dss-vinculo-e5702c` (opción `VINCULO_CARTAS`) para no depender del worktree.
8. Commitear cuando el usuario lo indique (ver §2, punto 8).
