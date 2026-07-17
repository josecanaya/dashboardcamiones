# Result cache por ventana — plan de implementación (single-shot)

Objetivo: **procesar una vez por ventana `(from, to)` y consultar el resultado sin reprocesar**, tanto desde la UI (KPIs, calibración, anomalías, split producto) como desde el agente MCP. Si cambian reglas, se puede pisar; los runs viejos quedan accesibles por `run_id`.

Este doc es autosuficiente. Se puede ejecutar de corrido por un agente en una sola corrida (~12 min). Todos los cambios son aditivos salvo la sustitución de un botón en el UI.

---

## 0. Contexto (leer una vez)

Ya existe persistencia por corrida:

- `runs/<runId>/manifest.json` — `runId`, `status`, `startedAt`, `finishedAt`, `rulesVersion`, `input.inputHash`, `input.eventsPaths`, `input.movimientosRows`, `input.eventCount`, `output.tableCount`, `output.csvKeys`, `output.tableKeys`. Escrito por `scripts/run-etl-headless.ts`.
- `runs/<runId>/stats.json` — stats ejecutivos del transform.
- `runs/<runId>/tables/<name>.json` — cada tabla con `{ headers, rows }`.
- Endpoints existentes:
  - `POST /api/etl/runs` `{ eventsPaths?, from?, to?, skipSupabase? }` → `{ runId }` (`server/truckflow-local-server.mjs`).
  - `GET  /api/etl/runs` → lista de manifests.
  - `GET  /api/etl/runs/:id/summary` → `{ runId, manifest, stats }`.
  - `GET  /api/etl/runs/:id/tables` → `{ runId, tables: string[] }`.
  - `GET  /api/etl/runs/:id/tables/:name?limit&offset&col&eq` → `{ runId, name, headers, total, limit, offset, rows }`.
- Constantes clave:
  - `RUNS_ROOT = <repo>/runs` (server).
  - `ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v12'` en `src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts`.

Falta:
1. Índice por ventana `runs/_index/by-window.json`.
2. Hash que incluya `rulesVersion` para invalidar al cambiar reglas.
3. Endpoint `resolve-window`.
4. Tool MCP `resolve_window`.
5. UI que hidrate `transformResult` desde `runs/<id>/…` en lugar de correr Transform.
6. Regla en agentes: consultar antes que procesar.

---

## 1. Índice por ventana

### 1.1 Ubicación
`runs/_index/by-window.json`

### 1.2 Esquema
```json
{
  "version": 1,
  "entries": {
    "2026-06-15..2026-06-21": {
      "runId": "run_20260716_193045_abc123",
      "inputHash": "9f3c8ab21e12",
      "rulesVersion": "etl_transform_v12",
      "createdAt": "2026-07-17T18:04:11.000Z"
    }
  }
}
```

Reglas:
- Clave = `<from>..<to>` (siempre `YYYY-MM-DD..YYYY-MM-DD`).
- Se pisa cuando entra un run OK con el mismo par `(from,to)`.
- Runs viejos quedan en `runs/<runId>/` (no se borran); se pierden solo del índice.

### 1.3 Cuándo se escribe
Al final de `scripts/run-etl-headless.ts`, si el run terminó `status=ok` y hay `--from-day` + `--to-day` (o se pudieron inferir del min/max de días de eventos).

---

## 2. Hash con rulesVersion

En `scripts/run-etl-headless.ts` (línea ~208–211) el hash actual es:

```ts
const inputHash = createHash('sha256')
  .update(JSON.stringify({ events: args.eventsPaths, movimientosRows: preNormalizedMovimientos?.length ?? 0 }))
  .digest('hex')
  .slice(0, 12)
```

**Reemplazar** por:

```ts
const inputHash = createHash('sha256')
  .update(JSON.stringify({
    events: args.eventsPaths,
    movimientosRows: preNormalizedMovimientos?.length ?? 0,
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
    from: args.fromDay || null,
    to: args.toDay || null,
  }))
  .digest('hex')
  .slice(0, 12)
```

Efecto: bump de `ETL_TRANSFORM_RULES_VERSION` marca cualquier ventana como *stale* automáticamente.

---

## 3. Cambios en `scripts/run-etl-headless.ts`

### 3.1 Import + helper de índice

Al final de los imports actuales, agregar:

```ts
import { join, dirname } from 'node:path'
// (join ya está importado; verificar antes de duplicar)
```

Después de `writeCatalog(args.outRoot)` (~línea 159), agregar:

```ts
function updateWindowIndex(opts: {
  outRoot: string
  fromDay: string | null
  toDay: string | null
  runId: string
  inputHash: string
  rulesVersion: string
}): void {
  if (!opts.fromDay || !opts.toDay) return
  const indexPath = join(opts.outRoot, '_index', 'by-window.json')
  mkdirSync(dirname(indexPath), { recursive: true })
  let doc: { version: number; entries: Record<string, any> } = { version: 1, entries: {} }
  if (existsSync(indexPath)) {
    try {
      const raw = JSON.parse(readFileSync(indexPath, 'utf8'))
      if (raw && typeof raw === 'object' && raw.entries) doc = raw
    } catch { /* índice corrupto, reescribir */ }
  }
  const key = `${opts.fromDay}..${opts.toDay}`
  doc.entries[key] = {
    runId: opts.runId,
    inputHash: opts.inputHash,
    rulesVersion: opts.rulesVersion,
    createdAt: new Date().toISOString(),
  }
  writeFileSync(indexPath, JSON.stringify(doc, null, 2), 'utf8')
}
```

### 3.2 Llamar al índice después del run OK

Dentro del bloque de éxito del headless (después de escribir el `manifest.json` final con `status: 'ok'`), agregar:

```ts
const eventDaysSorted = events
  .map((e) => String(e.occurredAt ?? '').slice(0, 10))
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort()
const effectiveFrom = args.fromDay || eventDaysSorted[0] || null
const effectiveTo = args.toDay || eventDaysSorted[eventDaysSorted.length - 1] || null
updateWindowIndex({
  outRoot: args.outRoot,
  fromDay: effectiveFrom,
  toDay: effectiveTo,
  runId,
  inputHash,
  rulesVersion: out.rulesVersion ?? ETL_TRANSFORM_RULES_VERSION,
})
```

Colocarlo **antes** de la línea `console.log(runId)` (contrato CLI).

---

## 4. Nuevos endpoints en `server/truckflow-local-server.mjs`

Insertar **inmediatamente después** del bloque `GET /api/etl/runs` existente (buscar el bloque `app.get('/api/etl/runs', async (req, res) => { ... })`), antes de `GET /api/etl/runs/:id/summary`.

### 4.1 `GET /api/etl/resolve-window?from=&to=`

```js
function readWindowIndex() {
  const p = path.join(RUNS_ROOT, '_index', 'by-window.json')
  if (!existsSync(p)) return { version: 1, entries: {} }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    return raw && typeof raw === 'object' && raw.entries ? raw : { version: 1, entries: {} }
  } catch {
    return { version: 1, entries: {} }
  }
}

const CURRENT_RULES_VERSION = 'etl_transform_v12'

app.get('/api/etl/resolve-window', (req, res) => {
  const from = String(req.query.from ?? '').trim()
  const to = String(req.query.to ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: 'Enviá from & to en formato YYYY-MM-DD' })
    return
  }
  const key = `${from}..${to}`
  const idx = readWindowIndex()
  const entry = idx.entries[key]
  if (!entry) {
    res.status(404).json({ error: 'window_not_cached', from, to })
    return
  }
  const runDir = path.join(RUNS_ROOT, entry.runId)
  if (!existsSync(runDir)) {
    res.status(404).json({ error: 'run_missing', from, to, runId: entry.runId })
    return
  }
  const stale = String(entry.rulesVersion || '') !== CURRENT_RULES_VERSION
  res.json({
    from, to,
    runId: entry.runId,
    inputHash: entry.inputHash,
    rulesVersion: entry.rulesVersion,
    createdAt: entry.createdAt,
    stale,
    currentRulesVersion: CURRENT_RULES_VERSION,
  })
})
```

Nota: `CURRENT_RULES_VERSION` se hardcodea acá **igual** que en `etlTransformPipeline.ts`. Si algún día se bumpea, se cambia en **los dos lugares** (o se puede refactorizar leyendo desde un JSON compartido, pero fuera de scope).

### 4.2 Extender `POST /api/etl/runs` con `force`

En `POST /api/etl/runs` (~línea 693), después de `const skipUpload = req.body?.skipSupabase === true`, agregar:

```js
const force = req.body?.force === true
```

Y **antes** del `spawnSync`, agregar el short-circuit:

```js
if (!force && req.body?.from && req.body?.to) {
  const idxKey = `${String(req.body.from)}..${String(req.body.to)}`
  const idx = readWindowIndex()
  const hit = idx.entries[idxKey]
  if (hit && existsSync(path.join(RUNS_ROOT, hit.runId))) {
    const stale = String(hit.rulesVersion || '') !== CURRENT_RULES_VERSION
    if (!stale) {
      res.json({ runId: hit.runId, cached: true, supabase: null })
      return
    }
  }
}
```

Efecto:
- Si el frontend/agente llama `POST /api/etl/runs {from,to}` y ya hay un run vigente, se devuelve el `runId` cacheado en ms, sin spawnear.
- `{from, to, force: true}` fuerza reprocesar (usado por el botón "Recalcular").

---

## 5. Tool MCP `resolve_window`

### 5.1 `agentes/src/agentes/etl_client.py`

Agregar método a `EtlClient`:

```python
def resolve_window(self, from_day: str, to_day: str) -> dict[str, Any]:
    return self._request(
        "GET", "/api/etl/resolve-window",
        params={"from": from_day, "to": to_day},
    )
```

Y función de módulo al final:

```python
def resolve_window(from_day: str, to_day: str) -> dict[str, Any]:
    return get_client().resolve_window(from_day, to_day)
```

### 5.2 `agentes/src/agentes/tools.py`

Agregar `_tool` en `TOOLS` (después de `get_circuit_catalog`):

```python
_tool(
    "resolve_window",
    (
        "Devuelve el run_id ya cacheado para una ventana (from,to). Usar SIEMPRE antes de run_etl "
        "cuando el usuario pregunta por un rango o día — evita reprocesar. "
        "Si stale=true, las reglas cambiaron y conviene run_etl con force=true; caso contrario, "
        "usar list_tables/query_table/get_summary con el run_id devuelto."
    ),
    {
        "from_day": {"type": "string", "description": "Inicio inclusive YYYY-MM-DD."},
        "to_day": {"type": "string", "description": "Fin inclusive YYYY-MM-DD."},
    },
    required=["from_day", "to_day"],
),
```

En `dispatch_tool`, agregar el branch (junto a los otros):

```python
if name == "resolve_window":
    return c.resolve_window(str(args["from_day"]), str(args["to_day"]))
```

### 5.3 Habilitar en subagentes

Editar los 4 archivos `.claude/agents/*.md` y agregar `mcp__etl__resolve_window` al campo `tools:` (coma separada, misma línea, primer lugar):

- `.claude/agents/knowledge-truckflow.md`
- `.claude/agents/knowledge-contratos.md`
- `.claude/agents/seguridad.md`
- `.claude/agents/comunicador.md`

Ejemplo (truckflow):
```
tools: mcp__etl__resolve_window, mcp__etl__list_runs, mcp__etl__list_tables, mcp__etl__query_table, mcp__etl__explain_journey, mcp__etl__get_summary, mcp__etl__get_circuit_catalog
```

---

## 6. Regla del orquestador

Editar `CLAUDE.md` (raíz). Reemplazar el bloque "Reglas:" por:

```md
Reglas:
1. Si la pregunta menciona una ventana de fechas (día o rango), llamá **primero** `resolve_window(from_day, to_day)`.
   - Si devuelve `run_id` con `stale: false` → usar `get_summary`/`list_tables`/`query_table`/`explain_journey` sobre ese `run_id`. **No** llamar `run_etl`.
   - Si devuelve 404 (`window_not_cached`) o `stale: true` → recién ahí `run_etl(from_day, to_day)`; luego re-consultar con `resolve_window`.
2. Sin ventana explícita, usar `list_runs` para elegir la corrida más reciente útil.
3. Nunca inventar cifras, patentes ni circuitos. Toda cifra sale de una tool.
4. Para explicar un R* usá `get_circuit_catalog`; para un journey/patente, `explain_journey`.
5. Respondé en español, conciso, citando `run_id`, `rulesVersion` y las tablas usadas.
```

Y agregar la tool al listado inicial (línea ~10):

```md
Tools MCP disponibles (`mcp__etl__*`):
`resolve_window`, `run_etl`, `list_runs`, `get_summary`, `list_tables`, `query_table`,
`get_circuit_catalog`, `explain_journey`, `generar_pptx_comite`.
```

---

## 7. UI — hidratar sin reprocesar

Objetivo: al elegir período en Análisis local, si hay run cacheado, se carga `transformResult` **desde disco**. Si no, botón "Procesar" habilitado (sigue el flujo actual).

### 7.1 Nuevo cliente HTTP: `src/features/real-truckflow/api/etlRunCacheApi.ts`

Crear archivo nuevo:

```ts
/**
 * Cliente del cache por ventana. Todo lo devuelto viene ya materializado en runs/<runId>/.
 */

function base(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return '/api/etl'
  const env = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ETL_API_PREFIX : undefined
  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '')
  return '/api/etl'
}

export type ResolveWindowResult = {
  from: string
  to: string
  runId: string
  inputHash: string
  rulesVersion: string
  createdAt: string
  stale: boolean
  currentRulesVersion: string
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown
  try { body = text ? JSON.parse(text) : {} } catch { throw new Error(`Respuesta no JSON (${res.status})`) }
  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : text
    throw new Error(err || `HTTP ${res.status}`)
  }
  return body as T
}

export async function resolveWindow(from: string, to: string): Promise<ResolveWindowResult | null> {
  const url = `${base()}/resolve-window?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 404) return null
  return parseJson<ResolveWindowResult>(res)
}

export async function getRunSummary(runId: string): Promise<{
  runId: string
  manifest: Record<string, unknown>
  stats: Record<string, unknown>
}> {
  const res = await fetch(`${base()}/runs/${encodeURIComponent(runId)}/summary`, { cache: 'no-store' })
  return parseJson(res)
}

export async function listRunTables(runId: string): Promise<string[]> {
  const res = await fetch(`${base()}/runs/${encodeURIComponent(runId)}/tables`, { cache: 'no-store' })
  const body = await parseJson<{ tables: string[] }>(res)
  return body.tables ?? []
}

export async function fetchRunTable(runId: string, name: string): Promise<{
  headers: string[]
  rows: Record<string, unknown>[]
}> {
  const url = `${base()}/runs/${encodeURIComponent(runId)}/tables/${encodeURIComponent(name)}?limit=10000`
  const res = await fetch(url, { cache: 'no-store' })
  return parseJson(res)
}

export async function requestRunEtl(from: string, to: string, opts?: { force?: boolean }): Promise<{ runId: string; cached?: boolean }> {
  const res = await fetch(`${base()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, skipSupabase: true, force: opts?.force === true }),
  })
  return parseJson(res)
}
```

### 7.2 Reconstruir `EtlTransformOutput` desde disco

Crear `src/features/real-truckflow/etlWorkbench/etlTransformOutputFromDisk.ts`:

```ts
import type { EtlTransformOutput } from './etlTransformPipeline'
import { fetchRunTable, getRunSummary, listRunTables } from '../api/etlRunCacheApi'

/**
 * Reconstruye un EtlTransformOutput a partir de runs/<runId>/ (stats.json + tables/*).
 * No corre el pipeline: hidrata la vista con el resultado ya materializado.
 */
export async function loadTransformOutputFromRun(runId: string): Promise<EtlTransformOutput> {
  const [summary, tableNames] = await Promise.all([getRunSummary(runId), listRunTables(runId)])
  const tables: Record<string, { headers: string[]; rows: Record<string, unknown>[] }> = {}
  const csv: Record<string, string> = {}
  for (const name of tableNames) {
    const t = await fetchRunTable(runId, name)
    tables[name] = t
    csv[name] = serializeCsv(t.headers, t.rows)
  }
  const rulesVersion = String((summary.manifest?.rulesVersion as string) ?? '')
  return {
    csv,
    tables: tables as unknown as EtlTransformOutput['tables'],
    stats: summary.stats as EtlTransformOutput['stats'],
    rulesVersion: rulesVersion as EtlTransformOutput['rulesVersion'],
  }
}

function serializeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  if (!headers.length) return ''
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}
```

### 7.3 Contexto: `loadWindowOrOffer` + estado de cache

Editar `src/features/real-truckflow/etlWorkbench/EtlWorkbenchContext.tsx`:

**Imports** (agrupar con los existentes cerca de `getMovimientosRange`):
```ts
import { resolveWindow, requestRunEtl, type ResolveWindowResult } from '../api/etlRunCacheApi'
import { loadTransformOutputFromRun } from './etlTransformOutputFromDisk'
```

**Tipo `Ctx`** — agregar campos junto a `transformResult`:
```ts
  cachedWindow: ResolveWindowResult | null
  loadWindowOrOffer: (from: string, to: string) => Promise<{ cached: boolean; stale?: boolean } | null>
  recomputeWindow: (from: string, to: string) => Promise<void>
```

**Estado** — junto a los otros `useState`:
```ts
  const [cachedWindow, setCachedWindow] = useState<ResolveWindowResult | null>(null)
```

**Callbacks** — antes de `useMemo<Ctx>`:

```ts
  const loadWindowOrOffer = useCallback(
    async (from: string, to: string) => {
      setTransformError(null)
      let hit: ResolveWindowResult | null = null
      try {
        hit = await resolveWindow(from, to)
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
        setCachedWindow(null)
        return null
      }
      if (!hit) {
        setCachedWindow(null)
        return { cached: false }
      }
      setCachedWindow(hit)
      if (hit.stale) return { cached: true, stale: true }
      try {
        const out = await loadTransformOutputFromRun(hit.runId)
        startTransition(() => { setTransformResult(out) })
        setTransformTramoCompleted(3)
        setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
        return { cached: true, stale: false }
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
        return { cached: true, stale: false }
      }
    },
    []
  )

  const recomputeWindow = useCallback(
    async (from: string, to: string) => {
      setTransformError(null)
      setTransformBusy(true)
      try {
        const { runId } = await requestRunEtl(from, to, { force: true })
        const hit = await resolveWindow(from, to)
        setCachedWindow(hit)
        const out = await loadTransformOutputFromRun(runId)
        startTransition(() => { setTransformResult(out) })
        setTransformTramoCompleted(3)
        setTransformTramoStatus({ 1: 'done', 2: 'done', 3: 'done' })
      } catch (e) {
        setTransformError(e instanceof Error ? e.message : String(e))
      } finally {
        setTransformBusy(false)
      }
    },
    []
  )
```

**Exportar** en el `useMemo<Ctx>` (agregar en el objeto de retorno y en el array de deps):
```ts
      cachedWindow,
      loadWindowOrOffer,
      recomputeWindow,
```

### 7.4 UI: usar el cache en Análisis local

Editar `src/features/real-truckflow/tabs/AnalisisLocalTab.tsx`.

**Después** de `void wb.loadLocalPeriod(periodStart, periodEnd)` en el handler del botón "Cargar período" (buscar `onClick={() => void wb.loadLocalPeriod(...)}`), envolver así:

```tsx
onClick={async () => {
  const ok = await wb.loadLocalPeriod(periodStart, periodEnd)
  if (ok) await wb.loadWindowOrOffer(periodStart, periodEnd)
}}
```

**Debajo** del grid de KPIs y **arriba** del article "Pasos 1 a 3", agregar un banner de estado del cache:

```tsx
{wb.cachedWindow ?
  <div
    className={`rounded-2xl border px-4 py-3 text-sm ${
      wb.cachedWindow.stale ?
        'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-emerald-300 bg-emerald-50 text-emerald-950'
    }`}
  >
    {wb.cachedWindow.stale ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Cache disponible para {wb.cachedWindow.from} → {wb.cachedWindow.to} pero{' '}
          <strong>reglas cambiaron</strong> ({wb.cachedWindow.rulesVersion} → {wb.cachedWindow.currentRulesVersion}).
        </span>
        <button
          type="button"
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          onClick={() => void wb.recomputeWindow(wb.cachedWindow!.from, wb.cachedWindow!.to)}
        >
          Recalcular
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Resultado <strong>en caché</strong> · run <span className="font-mono text-xs">{wb.cachedWindow.runId}</span> · reglas {wb.cachedWindow.rulesVersion} · {wb.cachedWindow.createdAt.slice(0,10)}
        </span>
        <button
          type="button"
          className="rounded-lg border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          onClick={() => void wb.recomputeWindow(wb.cachedWindow!.from, wb.cachedWindow!.to)}
        >
          Recalcular
        </button>
      </div>
    )}
  </div>
: null}
```

Renombrar el botón grande "Procesar todo" → **"Procesar y guardar"** (misma acción, mensaje coherente). Buscar el `<TransformPhaseStepper` y el label `runAllInProgress` en `TransformPhaseStepper.tsx` si querés dejarlo alineado; opcional para esta fase.

---

## 8. Criterios de aceptación (verificación manual)

Ejecutar en orden. Todos deben pasar.

### 8.1 Backend
```powershell
# Reiniciar server
node server/truckflow-local-server.mjs
```

1. `curl "http://127.0.0.1:8787/api/etl/resolve-window?from=2026-06-15&to=2026-06-21"` → **404** con `{"error":"window_not_cached", ...}` (no hay cache aún).
2. `curl -X POST http://127.0.0.1:8787/api/etl/runs -H "Content-Type: application/json" -d '{"from":"2026-06-15","to":"2026-06-21","skipSupabase":true}'` → responde `{runId}`, NO `cached`.
3. Repetir el mismo POST → **debe responder** `{runId, cached: true}` (short-circuit).
4. Repetir `resolve-window` → **200** con `stale: false` y el mismo `runId`.
5. Verificar en disco: existe `runs/_index/by-window.json` con la entrada `2026-06-15..2026-06-21`.
6. Forzar recálculo: `POST /api/etl/runs {from,to,force:true}` → un run_id nuevo, y el índice apunta al nuevo.

### 8.2 Reglas cambiadas
1. Cambiar temporalmente `ETL_TRANSFORM_RULES_VERSION` en `etlTransformPipeline.ts` a `'etl_transform_v12_test'`.
2. Cambiar la constante `CURRENT_RULES_VERSION` en `truckflow-local-server.mjs` al mismo valor.
3. Reiniciar server (Node importa el .mjs; el JS lee la constante en `mjs`, así que solo hace falta reiniciar el server para que el endpoint compare contra el nuevo valor).
4. `resolve-window` sobre la ventana anterior → `stale: true`.
5. Revertir cambios.

### 8.3 MCP
```powershell
claude mcp list       # etl connected
# En Claude Code:
```
- Pregunta: "resumime la ventana 2026-06-15 a 2026-06-21".
- Esperado: el agente llama primero `resolve_window`, después `get_summary` con el `run_id`. **No** llama `run_etl`.

### 8.4 UI
1. Abrir Análisis local, elegir semana 2026-06-15 → 2026-06-21, "Cargar período".
2. Banner verde "Resultado en caché" aparece, KPIs y anomalías se pintan al toque sin “Procesar todo”.
3. Cambiar la semana a una no cacheada → sin banner; botón "Procesar y guardar" habilitado.
4. Volver a la semana cacheada → banner verde vuelve a aparecer, resultado instantáneo.
5. Botón "Recalcular" en el banner → dispara `run_etl force`, cuando termina el banner queda con el nuevo `runId` y `createdAt`.

---

## 9. Archivos tocados (mapa completo)

Crear:
- `runs/_index/by-window.json` (lo crea el runner en la primera corrida OK con from/to).
- `src/features/real-truckflow/api/etlRunCacheApi.ts`
- `src/features/real-truckflow/etlWorkbench/etlTransformOutputFromDisk.ts`

Editar:
- `scripts/run-etl-headless.ts` — hash con `rulesVersion`; helper `updateWindowIndex`; llamado al final del run OK.
- `server/truckflow-local-server.mjs` — `readWindowIndex`, `CURRENT_RULES_VERSION`, `GET /api/etl/resolve-window`, short-circuit en `POST /api/etl/runs`.
- `agentes/src/agentes/etl_client.py` — método `resolve_window`.
- `agentes/src/agentes/tools.py` — tool `resolve_window` en `TOOLS` + branch en `dispatch_tool`.
- `.claude/agents/knowledge-truckflow.md`, `knowledge-contratos.md`, `seguridad.md`, `comunicador.md` — agregar `mcp__etl__resolve_window` a `tools:`.
- `CLAUDE.md` — reglas actualizadas.
- `src/features/real-truckflow/etlWorkbench/EtlWorkbenchContext.tsx` — imports, estado `cachedWindow`, callbacks `loadWindowOrOffer` / `recomputeWindow`, exportarlos en el `Ctx`.
- `src/features/real-truckflow/tabs/AnalisisLocalTab.tsx` — llamar `loadWindowOrOffer` tras `loadLocalPeriod`, agregar banner de estado + botón "Recalcular".

Total: 3 archivos nuevos + 9 editados.

---

## 10. Orden estricto de implementación

1. **Backend estático** (sin correr): editar `run-etl-headless.ts` (hash + helper + call), editar `truckflow-local-server.mjs` (endpoint + short-circuit). Compilar mental / lint.
2. **Verificar Backend** con los pasos 8.1.
3. **MCP**: `etl_client.py` + `tools.py`. Test: en Python, `from agentes.etl_client import resolve_window; resolve_window('2026-06-15','2026-06-21')`.
4. **UI cache**: `etlRunCacheApi.ts` + `etlTransformOutputFromDisk.ts` + edits en `EtlWorkbenchContext.tsx` + `AnalisisLocalTab.tsx`.
5. **Agentes**: editar `CLAUDE.md` + los 4 `.claude/agents/*.md`.
6. **Verificación completa** (8.3 + 8.4).

## 11. Anti-alcance (NO hacer)

- No mover archivos existentes, no renombrar tools.
- No modificar el pipeline ETL (`etlTransformPipeline.ts`, `etlTransformPhaseRunner.ts`, `etlTransformContractFirst.ts`, etc.).
- No borrar el flujo de "Procesar" en la UI: sigue funcionando como fallback cuando no hay cache. Solo se agrega el camino cacheado.
- No introducir dependencias nuevas (todo con `fs`, `fetch`, `httpx` ya presentes).
- No tocar Supabase upload; el short-circuit responde `supabase: null`.

## 12. Notas de compatibilidad

- Runs viejos sin `input.inputHash` o sin `rulesVersion` no aparecen en el índice hasta que se haga una nueva corrida. Se pueden repoblar corriendo `run_etl` sobre cada ventana histórica; opcional.
- El índice es un JSON pequeño (~1KB por entrada). Puede vivir tranquilo en git si querés (agregarlo a git; `runs/` sigue gitignored salvo `_index/`). Para incluirlo, agregar `!runs/_index/` en `.gitignore` **después** de la línea que ignora `runs/`.
