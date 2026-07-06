# AGENTS.md

## Cursor Cloud specific instructions

### Qué es este proyecto
Dashboard web **Truckflow** (React + TypeScript + Vite + Tailwind) de trazabilidad
de camiones en plantas. Los datos son **reales**: se leen de la **API Truckflow**
(`http://138.36.237.33:8090`, endpoints `/journey-event/list` y `/alert/list`) y se
**enriquecen con Excel "Movimientos por Contrato" (XLSX)** que el usuario sube desde la
UI. El pipeline ETL clasifica journeys en circuitos. El árbol `simulador/` y los JSON en
`public/mock-data/` (escenarios `normal`, `march_full`, etc.) son un generador mock
**legacy**; el flujo vigente es el de datos reales (`src/features/real-truckflow/`,
`src/services/realTruckflowApi.ts`).

### Gestor de paquetes: pnpm (no npm)
`npm install` **falla** por un conflicto de peer deps (`three` vs `web-ifc-three`). Usar
siempre **pnpm**. Son **dos paquetes independientes** con lockfiles separados (no es un
workspace pnpm): la raíz y `simulador/`. El update script ya corre `pnpm install` en
ambos. Al instalar, pnpm avisa "Ignored build scripts" (esbuild/core-js): es inofensivo,
Vite y Vitest funcionan igual.

### Ejecutar (dev)
- Dashboard: `pnpm dev` -> `http://localhost:5173`. En dev, Vite proxya `/journey-api` ->
  API Truckflow (evita CORS); ver `vite.config.ts`.
- La **API externa suele devolver `[]`** para muchos rangos de fecha (servicio fuera de
  nuestro control). Para probar el pipeline con datos reales sin depender de la API, hay
  un snapshot real incluido en `public/mock-data/realdata/journey-events_*.json`:
  en la UI ir a pestaña **"Analisis local"** -> desplegar **"Alternativa: subir JSON
  sueltos"** -> subir ese JSON -> **"PROCESAR TODO (1+2+3)"**. Da miles de eventos ->
  journeys -> circuitos clasificados.
- Servidor local opcional `pnpm run server:truckflow` (puerto 8787): descarga la API a
  disco (`data/truckflow/`) y expone el registro de patentes. Requiere variables Supabase
  en `.env` (ver `.env.example`). **No es necesario** para levantar el dashboard; sin el,
  las acciones de la pestaña "Extraccion" muestran "Servidor local Truckflow no disponible
  en 8787".

### Tests / typecheck / build
- Tests: `pnpm test` (Vitest). Hay **3 tests que fallan de base** en
  `src/features/real-truckflow/etlWorkbench/etlSegmentTiming.test.ts` (aserciones de
  logica de negocio, no del entorno); el resto (~451) pasan.
- **No hay ESLint** configurado ni script `lint`. El chequeo estatico es `npx tsc -b`.
- `pnpm build` (`tsc -b && vite build`) **falla actualmente** por errores de tipos
  preexistentes (p. ej. TS6133 no usados, incompatibilidades en `.test.ts`). El modo dev
  (`vite`) no corre `tsc`, por eso el dashboard funciona igual en desarrollo. No arreglar
  estos errores salvo pedido explicito.
