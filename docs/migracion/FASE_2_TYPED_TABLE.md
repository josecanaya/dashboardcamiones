# FASE 2 — Intercambio tipado (`TypedTable`) en lugar de CSV strings

> Problema que resuelve: el pipeline emite `csv: Record<string, string>` y la UI
> re-parsea con `parseCsvToRecords` (~50 llamadas). Objetivo: las filas tipadas viajan
> como arrays; el CSV se genera SOLO al exportar/descargar.
> Estrategia: agregar `tables` AL LADO de `csv` (compatibilidad total), migrar
> consumidores de a uno, y recién al final quitar claves de `csv`.

---

## Paso 2.1 — Crear TypedTable

Creá `src/etl-core/typedTable.ts`:

```ts
import { recordsToCsv } from './csv'

/** Tabla tipada: filas + orden de columnas. CSV solo como serialización al borde. */
export type TypedTable<T extends Record<string, unknown> = Record<string, unknown>> = {
  readonly name: string
  readonly headers: readonly (keyof T & string)[]
  readonly rows: readonly T[]
}

export function makeTable<T extends Record<string, unknown>>(
  name: string,
  headers: readonly (keyof T & string)[],
  rows: readonly T[]
): TypedTable<T> {
  return { name, headers, rows }
}

export function tableToCsv<T extends Record<string, unknown>>(t: TypedTable<T>): string {
  return recordsToCsv([...t.headers], t.rows as unknown as Record<string, unknown>[])
}
```

Test `src/etl-core/typedTable.test.ts`: crear una tabla de 2 filas, verificar
`tableToCsv` produce cabecera + 2 líneas y respeta el orden de headers.

**Verificación:** R2 estándar. **Commit:** `fase2: TypedTable en etl-core`

## Paso 2.2 — Piloto: transile externo emite TypedTable

1. En `etl-core/reports/transileExternoCiclo.ts`, agregá (sin borrar nada):
   ```ts
   export function transileExternoTables(report: TransileExternoReport): {
     operaciones: TypedTable<TransileExternoOperation & Record<string, unknown>>
     sessions: TypedTable<TransileExternoSession & Record<string, unknown>>
   } { /* construir con makeTable usando OPERATION_HEADERS / SESSION_HEADERS */ }
   ```
   (exportá los arrays de headers si eran privados).
2. Las funciones `*Csv()` existentes pasan a implementarse como
   `tableToCsv(transileExternoTables(...).operaciones)` — mismo output byte a byte.
3. Verificación: golden verde (los hashes CSV NO deben cambiar) + tests del módulo.

**Commit:** `fase2: transile externo emite TypedTable (CSV derivado)`

## Paso 2.3 — `EtlTransformOutput.tables` opcional

1. En `etlTransformPipeline.ts`, agregá al tipo `EtlTransformOutput`:
   ```ts
   /** Fase 2: artefactos tipados. Las claves espejan las de csv. Opcional durante migración. */
   tables?: Record<string, import('../../../etl-core/typedTable').TypedTable>
   ```
2. En `etlMovimientosContratoIntegration.ts`, además del bloque `csv`, construí
   `tables` para las claves del piloto (`transile_externo_operaciones`, `_sessions`,
   `_summary`) usando el paso 2.2, y propagalo hasta el output del pipeline.
3. Verificación R2 (golden intacto: `csv` no cambió).

**Commit:** `fase2: pipeline expone tables junto a csv (piloto transile externo)`

## Paso 2.4 — Migrar el panel piloto a filas tipadas

1. `TransileExternoCicloPanel.tsx`: agregá props opcionales
   `operations?: TransileExternoOperation[]` y `summary?: TransileExternoSummary`.
   Si vienen, usalas directo (sin `parseCsvToRecords`); si no, caé al parseo CSV actual.
2. En `PostTransformOptionalActions.tsx`, pasale
   `wb.transformResult?.tables?.transile_externo_operaciones?.rows` (casteado al tipo).
3. Verificación: R2 + revisar el panel manualmente si hay entorno (`npm run dev`).

**Commit:** `fase2: panel transile externo consume filas tipadas`

## Paso 2.5 — Repetir el patrón 2.2→2.4 para el resto (iterativo)

Orden sugerido (de menos a más acoplado). UNA clave por commit:

1. `transile_interno_volcable_*` (espejo exacto del piloto)
2. `liquid_movements_*`
3. `excel_operations_with_truckflow` (la tabla grande del merge)
4. `final_circuits` / clasificación
5. Resto de claves consumidas por paneles (buscá consumidores con:
   `grep -rn "csv\.<clave>" src --include="*.tsx"`)

Para cada una: función `*Tables()` en el módulo emisor → clave en `tables` →
consumidor migra → golden intacto.

**Commit (por clave):** `fase2: <clave> tipada end-to-end`

## Paso 2.6 — 🛑 STOP-HUMANO: decidir si `csv` interno se poda

Cuando TODOS los consumidores UI usen `tables`, proponer al usuario eliminar del
output las claves `csv` que nadie lee (dejando `toCsv` disponible para exports).
Requiere actualizar el golden (paso explícito, único caso permitido: el snapshot
de hashes se regenera y el diff se presenta al usuario).

## ✅ Criterio de salida de la Fase 2

- `tables` cubre todas las claves con consumidor UI.
- Cero llamadas nuevas a `parseCsvToRecords` en paneles migrados
  (`grep -rn "parseCsvToRecords" src/features/real-truckflow/components`).
- Golden verde (o regenerado con aprobación explícita del usuario en 2.6).
