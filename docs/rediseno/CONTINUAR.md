# Continuidad del rediseño Truckflow — leer primero

## Encargo

Repo: `C:/Users/Usuario/Desktop/Dashboard_camiones`, rama `automatizacion`. Prompt en `docs/PROMPT_REDISENO_UI.md` (ajeno: no commitear sin revisar). Límite del viernes retirado. DSS operativo: no tocar credenciales/puente.

## Estado al cerrar esta tanda (15-09-2026)

- Base `691e40e` + arch `12936ee`.
- Rediseño UI + período histórico + secciones: código en working tree / commits propios de la entrega (ver INFORME.md).
- T-01, T-02, T-03: **aplicadas**.
- `tsc -b`: 191 errores (baseline sin regresión).
- Suite: fallos ETL/timeouts preexistentes; no “enverdecer” cambiando dominio.
- Vite `:5173` / API `:8787`: no reiniciar backend a ciegas.

## Archivos propios del rediseño

- `src/app/AppShell.tsx`, `appShell.css`
- `src/components/ui/*`
- `src/pages/PlantHome.tsx`, `plantHome.css`
- `HistoricalWorkspace.tsx`, `historicalPeriodLoader.ts` (+ test)
- `EtlWorkbenchContext.tsx` (carga/revisión; sin cambiar cálculos ETL)
- Tabs: `KpiTiemposTab`, `TransformEtlTab`, `CaladaCamerasPanel`, `SeguridadTab`, `ExtraccionDatosTab` (sync fechas)
- `SavedWindowsPicker.tsx`, `LiveCameraPlayerModal.tsx` (T-01–T-03)
- `docs/rediseno/*` (inventario, criterios, informe, tablero, capturas, tareas)

## No stagear / no sobrescribir (ajenos)

`.gitignore`, README eliminado, RESUMEN_AMPLIACION_TRUCKFLOW.md eliminado, `server/truckflow-local-server.mjs`, `docs/PROMPT_REDISENO_UI.md`, `scripts/audit-camaras-rtsp.mjs`, `server/go2rtc-supervisor.mjs`, `ETL_CLASSIFICATION_MATRIX.csv`. Si `postcss.config.js` aparece borrado otra vez: restaurar al HEAD (Tailwind); no pelear el borrado en commits ajenos.

## Próximos pasos (siguiente agente)

1. Validación manual Home + período + Disclosure + Anomalías + cámaras con datos reales.
2. Fichar partición de componentes gigantes y unificación de tokens con límites cerrados.
3. Opcional: foco del diálogo de cámaras (tarea nueva, no ampliar T-03).
4. No modificar tests/cálculos ETL de los 9 fallos baseline salvo bug real demostrado.

## Decisiones vigentes

1. Rango incompleto: no publicar parciales en flujo principal.
2. Marca: Vicentin textual.
3. Corridas obsoletas: avanzada con señal; principal exige vigencia.
