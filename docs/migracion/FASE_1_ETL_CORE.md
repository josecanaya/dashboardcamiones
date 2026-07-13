# FASE 1 — Extraer `src/etl-core/` (mecánica, con shims)

> Método: **mover archivo + dejar shim de re-export en la ruta vieja**. Ningún
> consumidor se entera; el golden no puede romperse. Los shims se limpian al final.
> Regla R1: el contenido movido queda idéntico salvo rutas de import.

## Estructura destino

```
src/etl-core/
  domain/      ← tipos y catálogos (sin lógica de IO)
  ingest/      ← lectura de xlsx/json → filas tipadas
  transform/   ← funciones puras del pipeline
  reports/     ← detectores y reportes derivados (transiles, líquidos, kpi)
  csv.ts       ← serialización CSV pura (SIN descarga browser)
```

## Receta general "mover con shim" (usar en cada paso)

Para mover `src/features/real-truckflow/etlWorkbench/X.ts` → `src/etl-core/<capa>/X.ts`:

1. `git mv src/features/real-truckflow/etlWorkbench/X.ts src/etl-core/<capa>/X.ts`
2. En el archivo movido, ajustá SOLO las rutas de import relativas que se rompieron.
3. Creá el shim `src/features/real-truckflow/etlWorkbench/X.ts`:
   ```ts
   /** @deprecated Movido a etl-core (Fase 1). Importar de src/etl-core/<capa>/X. */
   export * from '../../../etl-core/<capa>/X'
   ```
4. Si existe `X.test.ts`, movelo junto al módulo (`git mv ... src/etl-core/<capa>/X.test.ts`)
   y ajustá sus imports.
5. Verificá (regla R2): tsc sin errores nuevos + golden verde + tests del módulo verdes
   + `npm run check:arch` OK.

---

## Paso 1.1 — Separar CSV puro de la descarga browser

**Objetivo:** `etlCsv.ts` mezcla lo puro (`csvEscapeCell`, `recordsToCsv`) con
`triggerBrowserCsvDownload` (usa `document`). Separarlos.

**Acciones:**

1. Creá `src/etl-core/csv.ts` y mové allí `csvEscapeCell` y `recordsToCsv`
   (cortá y pegá el cuerpo exacto desde `etlCsv.ts`).
2. Dejá `src/features/real-truckflow/etlWorkbench/etlCsv.ts` así:
   ```ts
   /** @deprecated Lo puro vive en etl-core/csv. Aquí queda solo la descarga browser. */
   export { csvEscapeCell, recordsToCsv } from '../../../etl-core/csv'

   export function triggerBrowserCsvDownload(filename: string, csvText: string): void {
     // ← cuerpo original SIN CAMBIOS
   }
   ```
3. Verificación estándar (R2).

**Commit:** `fase1: etl-core/csv.ts (separado de descarga browser)`

## Paso 1.2 — Mover módulos hoja puros (sin dependencias internas)

Aplicá la receta general, en este orden (uno por uno, verificando entre cada uno):

| Módulo | Destino |
|---|---|
| `etlTimestampNormalize.ts` | `etl-core/domain/timestamps.ts` — ojo: el shim re-exporta desde el nuevo nombre |
| `etlExternalNormalization.ts` | `etl-core/ingest/externalNormalization.ts` |
| `etlRearDevices.ts` | `etl-core/domain/rearDevices.ts` |
| `etlCsvParse.ts` | `etl-core/csvParse.ts` |

Nota: si un módulo importa algo de `services/` (ej. `xlsx`), las dependencias npm
(`xlsx`) están bien; imports a `src/services/*` NO están permitidos en etl-core
(check:arch lo denuncia). Si te pasa, ese módulo todavía no se mueve — anotalo en
PROGRESO.md y seguí con el siguiente.

**Commit (uno por módulo):** `fase1: mover <módulo> a etl-core`

## Paso 1.3 — Mover los detectores transile (piloto de reports/)

1. Receta general para:
   - `transileInternoVolcable.ts` (+ test) → `etl-core/reports/transileInternoVolcable.ts`
   - `transileExternoCiclo.ts` (+ test) → `etl-core/reports/transileExternoCiclo.ts`
2. Estos módulos importan `auditSlCameraExcelCoverage`, `etlSegmentTiming` (tipos),
   `etlExcelFirstMerge` (tipos) y `etlExternalMovimientosContrato` (tipos). Para no
   arrastrar todo ahora: cambiá esos imports a **`import type`** donde sean solo tipos
   (la mayoría lo son) apuntando a la ruta vieja de etlWorkbench, y agregá una
   excepción TEMPORAL en check-arch-rules.mjs:
   ```js
   // Excepción temporal Fase 1: reports/ puede importar TIPOS de etlWorkbench
   // hasta que los tipos se muevan a domain/ (Paso 1.5). Quitar al cerrar Fase 1.
   ```
   (la regla 2 debe permitir `import type ... from '...etlWorkbench/...'` — detectalo
   con la subcadena `import type` en la línea).
3. Verificación estándar. Los tests movidos deben pasar desde su nueva ubicación.

**Commit:** `fase1: transiles interno/externo a etl-core/reports (piloto)`

## Paso 1.4 — Mover normalizadores compartidos de services a domain

**Objetivo:** cortar los imports `etlWorkbench → services` empezando por lo más usado.

1. Receta general (origen `src/services/`):
   - `argentinaPlate.ts` → `etl-core/domain/argentinaPlate.ts` (shim en services)
   - `realEventNormalization.ts` → `etl-core/domain/eventNormalization.ts`
   - `realJourneyEvents.types.ts` → `etl-core/domain/journeyEvents.types.ts`
2. Shims en `src/services/` idénticos al patrón de la receta.
3. Verificación estándar.

**Commit:** `fase1: normalizadores y tipos de journey a etl-core/domain`

## Paso 1.5 — Mover los tipos de intercambio del pipeline

1. Los tipos `ExternalMovimientoContratoNormalized`, `ExcelOperationWithTruckflowRow`,
   `TruckflowJourneyForMerge`, `ClassifiedJourneyForTiming` son los contratos entre
   etapas. Crear `etl-core/domain/pipelineTypes.ts` que los **re-exporte** desde sus
   archivos actuales (solo `export type`). Los módulos de `etl-core` pasan a importar
   de ahí. (La implementación se moverá en Fase 2/3; ahora solo se centraliza el contrato.)
2. Quitá la excepción temporal del Paso 1.3 si ya no hace falta; si hace falta,
   dejala anotada en PROGRESO.md.

**Commit:** `fase1: contratos de pipeline centralizados en etl-core/domain/pipelineTypes`

## Paso 1.6 — 🛑 STOP-HUMANO: revisión de cierre de fase

Presentale al usuario: lista de módulos movidos, shims creados, excepciones activas
de check-arch, y el resultado del golden. El usuario decide si se avanza a Fase 2.

## ✅ Criterio de salida de la Fase 1

- `src/etl-core/` existe con `csv`, `csvParse`, `domain/`, `ingest/`, `reports/`.
- Golden verde, tsc sin errores nuevos, `npm run check:arch` OK.
- Todos los shims tienen `@deprecated` y no queda ningún import roto.
