# Informe de ejecución — rediseño UI

Fecha: 15-09-2026. Rama: `automatizacion`. Continuación del checkpoint en `CONTINUAR.md` (trabajo que el agente anterior dejó sin cerrar).

## Qué se cerró en esta tanda

1. **TypeScript:** `npx tsc -b --pretty false` → **191 errores** (igual al baseline). Sin errores nuevos atribuibles al rediseño.
2. **Loader histórico:** `EtlWorkbenchContext` — `resetLoadedState` vs `clearLoaded`; revisión en `loadWindowOrOffer` / `recomputeWindow` / `hydrateSavedWindow` / `loadComposedRange`; intento fallido/incompleto **no** invalida el período activo; éxito publica atómico. Extracción ya sincroniza fechas del intento (`periodInspection` sin output).
3. **Disclosure:** al abrir, `resize` para que Recharts midan ancho.
4. **T-01 / T-02 / T-03:** tipografía `text-xs` en SavedWindowsPicker y LiveCameraPlayerModal; `role="dialog"` + `aria-modal` + `aria-label` en el panel del modal.
5. **Documentación:** `CRITERIOS.md`, este informe, tablero y continuidad actualizados.

## Ya implementado (agente anterior, validado en código)

- AppShell + `appShell.css`, `HistoricalWorkspace`, `historicalPeriodLoader` (+ 7 tests), UI kit (`Interface`, `PagedList`), Home (`PlantHome` + css), Disclosure en Transform/Calada, PagedList en Anomalías, auto-KPI al abrir Tiempos.

## Pruebas

- Focal: `historicalPeriodLoader.test.ts` — 7/7 OK.
- `npm test -- --maxWorkers=2`: **4 files / 7 tests failed**, 92 files / 871 passed (~181s). Los 2 timeouts del baseline (reducer 5s, generateClassificationMatrixCsv 120s) **no reproducen** con menos workers; quedan 7 fallos semánticos ETL preexistentes.
- `npm run check:arch`: OK.
- `npx tsc -b`: **191** errores (sin regresión).
- Evidencia: `outputs/work/{test-after,arch-after,tsc-current}.log`.

## Limitaciones verificadas / pendientes

- Partición física de tabs gigantes: no hecha.
- Unificación total de tokens (`text-[10px]` etc. fuera de T-01/T-02): no hecha.
- Foco trap del diálogo de cámaras: fuera de T-03.
- `postcss.config.js`: una copia de trabajo lo había borrado (rompe Tailwind/layout). Se dejó restaurado al HEAD; **no** es entregable del rediseño ni se stagea como cambio propio si coincide con HEAD.
- Cambios ajenos (`.gitignore`, README borrado, server, scripts DSS, etc.): **no** incluidos en commits de esta entrega.
- Validación manual con backend 8787 + DSS en vivo: depende del entorno del usuario; no se inventaron capturas.

## Commits propios (unidades)

Ver `git log` tras la entrega; unidades previstas: marco/Home, período histórico, secciones UI, T-01, T-02+T-03, docs.
