# Plan de limpieza — Dashboard_camiones (12/11)

Diagnóstico medido el 12/11 sobre la rama `automatizacion`. Nada se borró todavía.

## 1. Dónde está el peso

| Qué | Tamaño | Comentario |
|---|---|---|
| Historia git (`.git`) | **2,8 GB** + 104 MB de basura `tmp_obj` | Casi todo son fotos y decks versionados |
| Archivos versionados | 9.781 archivos, ~4 GB | **2,5 GB son .jpg** (4.921 fotos), 357 MB .pptx, 450 MB .json |
| `reportes/` versionado | **3,2 GB** (7.357 archivos) | `logistica/` 1,5 GB, `cruce-sistema-truckflow/` 1,4 GB |
| Preparado sin commitear | 2.091 archivos nuevos, ~590 MB | 1.636 de `reportes/logistica`, el `.bak` de 60 MB, **`mcp-google-slides/.tokens/tokens.json.enc`** |
| Worktrees `.claude/worktrees/` | **5,3 GB** | 3 de 4 ya están unidos a `automatizacion` |
| Otros grandes versionados | `ETL_CLASSIFICATION_MATRIX.csv` 58 MB, `data/plate-identification-archive.json` 66 MB + `.bak` 60 MB, `runs/windows` 103 MB (está en `.gitignore` pero igual versionado), `outputs/` 132 MB, `docs/` 112 MB, `artifacts/` 63 MB, `graphify-out/` 18 MB, `powerbi-export/` 22 MB | |

**Regla propuesta:** git guarda **código + docs vigentes + configuración**. Fotos, decks generados, salidas de corridas y datos operativos van a una carpeta de datos fuera del repo (y a Drive para los entregables).

## 2. Código: qué se usa y qué no

### server/ — sano
- Los 69 módulos se usan (4 por scripts o por `spawn`). **Nada para borrar.**
- Endpoints sin cliente: `/api/etl/agent/*` (chat del agente, `etl-agent-chat.mjs`) → **candidato a sacar**. `dss-captures/*` y `movimientos/range|ingest` (era Excel) → revisar.
- 4 tests con `node:test` excluidos de vitest y sin script npm → portarlos a vitest o agregar `npm run test:node`.
- 3 tests fallan desde antes (reportWorkbook, reducer backlog, relevanceCleaner).

### scripts/ — el desorden está acá (281 archivos, 5 lenguajes)
| Estado | Archivos |
|---|---|
| En package.json | 21 |
| Citados por doc vigente / importados / lanzados | 143 |
| Uso puntual ya cumplido (auditorías jun–oct, `demostracion/`, `deck-reconocimiento-pptx/`, `_debug`, replays sueltos) | **48** |
| Sin ninguna referencia | **69** (≈25 son trabajo nuevo de esta semana: no tocar) |

Familias duplicadas (vigente en **negrita**):
- Deck comité logística: `gen_deck.py`, `gen_deck_camaras.py`, `gen_comite_logistica.py`, `_rango.py` → **`comite_semana.py` + `gen_comite_logistica_semana.py`**.
- Informe diario / Slides de septiembre: 12 scripts → **`informe-diario.ts`**; el resto archivar en bloque.
- Reconocimiento por cámara: 7 scripts → **`informe-capas-dias.mjs`**.
- **Segundo lector crudo:** `scripts/cruce-sistema-truckflow/lecturas.mjs` (su propio skew de 206 min) lo usan todos los `cruce-cartas-camaras/` → pasar a **`server/reconocedor/lecturas.mjs`**. Es la duplicación más riesgosa.
- Lote: `scripts/demostracion/lote.mjs` duplica **`server/plantState/loteCore.mjs`**.
- Fotos DSS: ~15 scripts que hacen `camera-captures/find` + `image` → un helper.
- Oracle SGC: cliente Python (`scripts/sgc`) y Node (`server/sgc/sgcSource.mjs`) con la conexión repetida.
- `reconocido.py` reimplementa `lecturas.mjs` → que llame al .mjs (como ya hace `lib-reconocido.cjs`) o test de paridad.

### src/ (frontend) — pocos archivos muertos, mucho peso arrastrado
- Rutas vivas: `/` `/en-vivo`, `/en-vivo/detalle`, `/simulacion`, `/datos`.
- Solo 1 archivo inalcanzable (`auditSlS1ExcelCoverage.ts`) + 9 *shims* `@deprecated` de 2 líneas.
- **Hallazgo principal:** `PointHistoryModal → PointHistoryLastWeek → CaladaCamerasPanel` mete **27.600 líneas del ETL** (`etlSegmentTiming`, `etlCircuitClassificationIndex`, `etlExcelFirstMerge`…) en el bundle de En vivo, que sin eso pesa ~11.700. Cortar esa cadena (que el panel pida los datos al server).
- Exports sin uso: `analyticsKpi` 23/25, `liveCameraDiagnostics` 22/27, `liveOperationalCatalog` 21/23, `chartExport` 7/8… restos de Estadísticas.
- Deps: `jspdf` y `html-to-image` solo las usan funciones que nadie llama → quitar. `recharts` + `react-is` solo por `CaladaCamerasPanel`.
- `check-arch-rules.mjs` y `tools/splice_real_page*.py` apuntan a archivos ya borrados.

### Duplicación transversal (src ↔ server ↔ scripts)
- **Skew +206 min** definido en ~33 archivos.
- **Normalizar patente**: 7 funciones `normalizePlate` + variantes + el regex en línea en 60 archivos.
- **Hora del evento**: `src/services/live/liveEventTime.ts` ≡ `server/plantState/liveEventTime.mjs`.
- **Catálogos de cámaras/sectores**: 5 en src, copias en server y códigos a mano en ~15 scripts, aunque ya existe `nodoSur.generated.ts` como fuente única.
- Formato de hora repetido en 12 componentes (ya existe `fmtShort`).

## 3. Plan por fases (de menor a mayor riesgo)

Cada fase en su commit. **Gate** antes de cada commit: `npm test` (baseline: 3 fallos preexistentes), `npm run check:arch`, `npm run check:lectores`, `npm run build`, `npm run smoke:etl`, y para fases que toquen lectores: `npm run reconocer` de 1 día y comparar `data/reconocido/<día>/`.

### F0 — Urgente, antes del próximo commit
1. Sacar del área de preparación `mcp-google-slides/.tokens/` y agregarla a `.gitignore` (token OAuth cifrado, no va al repo).
2. Sacar del área de preparación `data/plate-identification-archive.json.bak` y `.vacio-1120`; agregar `*.bak` al `.gitignore`.
3. Decidir si los 1.636 archivos nuevos de `reportes/logistica` (350 MB) se commitean (ver F2: propuesta = no).
4. `git gc --prune=now` para la basura `tmp_obj` (104 MB).
5. Commitear `docs/PLAN_RECONOCEDOR_UNICO.md`: lo citan `CLAUDE.md`, `SISTEMA_NODO_SUR.md` y `check-lectores-crudos.mjs`, pero **no está en git**.
6. No commitear `docs/propuesta-en-vivo/habilitacion-vehiculos.zip` (17 MB, preparado).
7. `git rm` de lo ya borrado del disco: 15 archivos de `artifacts/codex/` y `patentes-pendientes-prueba.jpg`.

### F1 — Disco local, sin riesgo (~5 GB)
- Quitar los worktrees ya unidos: `blissful-dewdney`, `dss-vinculo`, `peaceful-varahamihira` (+ sus ramas). **Conservar** `heuristic-snyder` / `claude/lote-en-vivo` (4 commits sin unir).
- Borrar `.chart-data-*` (5), `.codex-build/`, `Nueva carpeta/` y `Nueva carpeta (2)/` (vacías), `server-redesign.*.log`, `dist/`, `tsconfig.tsbuildinfo`, `scripts/output/`, `__pycache__/` (y sumarlo al `.gitignore`).
- Elegir un gestor: hay `package-lock.json` y `pnpm-lock.yaml` → dejar npm, borrar el de pnpm, regenerar el lock.

### F2 — Sacar datos de git (lo que más pesa)
1. Crear una carpeta de datos fuera del repo (p. ej. `Desktop\NodoSur_datos\`) con `reportes/`, `outputs/`, `artifacts/`, `RUTA/`, `powerbi-export/`, `runs/windows/`, `data/plate-identification-*`, `ETL_CLASSIFICATION_MATRIX.csv`, `panel-volcable-moderno.html`, las .jpg de la raíz. Los scripts leen la ruta desde una variable (`NODO_SUR_DATA`), con default a la ubicación actual para no romper nada.
2. `git rm --cached` + `.gitignore` para esas rutas. El repo deja de crecer desde ese commit.
3. **Opcional, decisión aparte:** reescribir la historia (`git filter-repo`) para bajar los 2,8 GB del `.git`. Es destructivo y obliga a re-clonar en todos lados (incluido `origin` y la VM). Alternativa: dejar la historia como está.

### F3 — Código muerto
- Mover a `scripts/_archivo/` (no borrar de entrada; borrar después de un mes sin uso): los 48 de uso puntual, la familia Slides de septiembre, los 4 generadores de deck viejos, `cruce-cartas-sin-carta/` salvo `bajar-cartas-api.mjs`, `video-capas/dia29/`.
- Borrar: los 9 shims de `src/` (reemplazando sus imports), `auditSlS1ExcelCoverage.ts`, `tools/splice_real_page*.py`, funciones sin uso de `chartExport.ts` + deps `jspdf` y `html-to-image`, exports sin uso de `analyticsKpi`/`liveCameraDiagnostics`/`liveOperationalCatalog`.
- Sacar `etl-agent-chat.mjs` y sus 3 endpoints si se confirma que no hay chat.
- Limpiar `check-arch-rules.mjs` (referencias a archivos borrados) y las excepciones de `check-lectores-crudos.mjs`.
- Antes de mover: grep en `src/`, `server/`, `scripts/`, `tools/`, `agentes/` y `CAPA DE AGENTES/` (hay scripts que solo se nombran en comentarios del server o se lanzan por ruta armada).

### F4 — Reutilizable (módulos compartidos)
Crear `shared/` en JS plano (.mjs con tipos JSDoc) que puedan importar `src`, `server` y `scripts` sin tsx:
1. `shared/tiempo.mjs` — `SKEW_MINUTOS = 206`, instante operativo, formato AR. Reemplaza los ~33 lugares y los gemelos `liveEventTime`.
2. `shared/patente.mjs` — una sola `normalizarPatente` (+ variante OCR). Reemplaza las 7 funciones y el regex en línea.
3. `shared/catalogo.mjs` — cámaras, dispositivos y sectores derivados de `nodoSur.generated`; los scripts dejan de escribir códigos a mano.
4. `shared/dss.mjs` — buscar captura + bajar imagen (reemplaza ~15 scripts de fotos).
5. Unificar `cruce-sistema-truckflow/lecturas.mjs` con `server/reconocedor/lecturas.mjs`; `demostracion/lote.mjs` con `loteCore.mjs`.
6. Python: `reconocido.py` y `consultar_rango.py` como únicos puntos de entrada; test de paridad .py ↔ .mjs.

### F5 — Hacerlo más liviano
- Cortar la cadena `PointHistoryLastWeek → CaladaCamerasPanel → ETL` (−27k líneas del bundle de En vivo).
- Partir `server/truckflow-local-server.mjs` (1.885 líneas) en routers por dominio, como ya están `agro/`, `sgc/`, `logisticsReport/`.
- Partir `gen_comite_logistica_semana.py` (2.259 líneas) en una sección por módulo (soja, girasol, líquidos, calada, volcables, pellet, anexos).
- Pendientes de julio: `etlTransformPipeline` (3.207) y la unificación de catálogos de circuitos.

### F6 — Información (docs)
De 92 `.md` en `docs/`, **15 son vigentes** (7 citados por `SISTEMA_NODO_SUR.md`/`CLAUDE.md` + 8 que cita el código). El resto (~77) es histórico.
- `docs/SISTEMA_NODO_SUR.md` sigue siendo el índice único; suma una línea que apunte a `docs/_archivo/`.
- A `docs/_archivo/`: `rediseno/` (26), `migracion/` (9), `migracion-v3/`, `simulador/` (frente pausado; el último estado es `TRASPASO_2026-10-16.md`), `ux-en-vivo-2026-10-07/`, `auditoria-patentes-2026-10-08/`, `test-transversal-2026-10-07/`, las sesiones `CONTINUAR_*` viejas, los 4 de agente/informe de septiembre, los 3 `TRUCKFLOW_TRANSFORM_*` de junio, `RUNS_TABLAS_CANONICAS.md` (se declara superado).
- Entregables cerrados con binarios (`propuesta-en-vivo` 57 MB, `demostracion-patentes` 26 MB, `presentaciones` 22 MB, `informe-integral` 7 MB): binarios a la carpeta de datos o Drive; en git quedan solo los .md vigentes.
- Raíz: `PLAN_REFACTOR_ETL_AGENTES.md`, `memory/`, `.cursor/`, `Main.dc.html`, `panel-volcable-moderno.html`, las .jpg → `_archivo` o borrar. **`index.html` no se toca** (es la entrada de Vite).
- **Agentes:**
  - El MCP que corre hoy está en `agentes/prototipo-mcp-local/` (su README dice “prueba de concepto”). Renombrar a `agentes/mcp_etl/` y corregir README.
  - `agentes/README.md`, `.codex/config.toml` y `.mcp.json` indican tres lanzadores distintos → dejar uno.
  - `CAPA DE AGENTES/` (capa Codex del 02/10, 201 MB en disco) no la referencia nada vigente → archivar y sacar de git.
  - `agentes/conocimiento/`: fusionar `COMITE_LOGISTICA_COMO_SE_ARMA.md` y `COMITES_SEMANALES_ESQUEMA.md` en `COMITE_LOGISTICA_BASE_Y_ANEXOS.md`.
- **Contradicciones a resolver:**
  - `CLAUDE.md`/`AGENTS.md` regla 6 manda a `RUNS_TABLAS_CANONICAS.md`, que dice estar superado por `NIVELES_ABCD.md`.
  - `CLAUDE.md` pide `resolve_window` primero, y el MCP actual ya no expone esa tool.
  - `AGENTS.md` no conoce `SISTEMA_NODO_SUR.md` ni la regla 8 → alinearlo con `CLAUDE.md` o reducirlo a un puntero.
  - Reconocedor: 4 docs se pisan (`PLAN_RECONOCEDOR_UNICO`, `RECONOCEDOR_RECORRIDO_CAPTURA`, dos `CONTINUAR_*`) → uno vigente, el resto a `_archivo`.
- `graphify-out/`, `RUTA/`, `powerbi-export/`, `scratchpad/` (121 MB) fuera de git o borrados (se regeneran).
- **Ojo:** `outputs/cartas-porte` puede tener CUIT de choferes → revisarlo antes de moverlo a cualquier lugar compartido.

## 4. Decisiones que necesito del usuario
1. ¿Dónde viven los datos fuera del repo (carpeta local, OneDrive, Drive)?
2. ¿Reescribir la historia git para recuperar los 2,8 GB, o solo cortar desde ahora?
3. ¿`CAPA DE AGENTES/` y `.codex/` siguen en uso (¿se usa Codex)?
4. ¿El chat del agente en la app (`/api/etl/agent/*`) se retira?

## 5. Resultado esperado
| | Hoy | Después de F0–F2 | Después de F3–F5 |
|---|---|---|---|
| Carpeta en disco | `.git` 2,8 GB + versionados ~4 GB + worktrees 5,3 GB + datos locales | −5,3 GB (worktrees) y −0,1 GB (basura git) | igual |
| Archivos versionados | 9.781 | ~1.500 | ~1.350 |
| Repo nuevo clonado | ~2,8 GB | 2,8 GB (o <100 MB si se reescribe la historia) | — |
| scripts/ activos | 281 | 281 | ~165 + `_archivo/` |
| Bundle En vivo | ~39k líneas | — | ~12k líneas |
