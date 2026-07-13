# FASE 0 — Red de seguridad

> Prerequisito de todo lo demás. Al terminar esta fase, cualquier regresión del
> pipeline se detecta con un test, y ningún código nuevo puede acoplarse a
> `etlWorkbench` sin que un script lo denuncie.

---

## Paso 0.1 — Ampliar el golden master con hash de todos los CSVs

**Objetivo:** el golden actual (`etlGoldenMaster.test.ts`) congela stats ejecutivos.
Hay que congelar TAMBIÉN el contenido de cada CSV de salida, para que mover código
(Fases 1–3) no pueda cambiar ni un byte del output sin que se note.

**Acciones:**

1. Abrí `src/features/real-truckflow/etlWorkbench/etlGoldenMaster.test.ts`.
2. Agregá dentro del `describe` existente este segundo test (adaptá el import de
   `createHash` que ya está en el archivo):

```ts
  it('congela hash de cada CSV de salida en fixture S', async () => {
    const events = fixtureEvents as import('../../../services/realJourneyEvents.types').RealJourneyEventDto[]
    const out = await runEtlTransform({
      events,
      alerts: [],
      mergeWindowHours: 4,
      loadedEventFilesCount: 1,
      loadedAlertFilesCount: 0,
    })
    const hashes: Record<string, string> = {}
    for (const key of Object.keys(out.csv).sort()) {
      hashes[key] = createHash('sha256').update(out.csv[key] ?? '').digest('hex').slice(0, 16)
    }
    expect(hashes).toMatchSnapshot()
  })
```

3. Corré `npx vitest run src/features/real-truckflow/etlWorkbench/etlGoldenMaster.test.ts`.
   La primera corrida CREA el snapshot (verás "1 snapshot written"). Corré una segunda
   vez y confirmá que pasa.

**Verificación:** ambos tests del archivo verdes en la segunda corrida.

**Commit:** `fase0: golden master congela hash de todos los CSVs de salida`

---

## Paso 0.2 — Script de reglas arquitectónicas (freeze)

**Objetivo:** denunciar (a) imports nuevos hacia `etlWorkbench` desde fuera de la
feature, (b) uso de `document`/`window` dentro del futuro `src/etl-core`.

**Acciones:**

1. Creá `scripts/check-arch-rules.mjs` con este contenido exacto:

```js
#!/usr/bin/env node
/**
 * Reglas arquitectónicas de la migración (rama automatizacion).
 * Falla (exit 1) si se violan. Ver docs/migracion/README.md.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const violations = []

function walk(dir, exts, cb) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(p, exts, cb)
    } else if (exts.some((e) => name.endsWith(e))) {
      cb(p, readFileSync(p, 'utf8'))
    }
  }
}

// Línea base congelada 2026-07-13: archivos fuera de la feature que YA importaban
// etlWorkbench. Permitidos hasta que las fases 1-3 los migren. NO agregar entradas.
const ETLWORKBENCH_IMPORT_BASELINE = new Set([
  'src/services/rearCameraFilter.ts',
  'src/services/realEventOperationalTime.test.ts',
  'src/services/truckflowTransform/contractFirst/contractExcelFirstEvidence.ts',
  'src/services/truckflowTransform/contractFirst/contractExcelParser.ts',
  'src/services/truckflowTransform/contractFirst/contractFieldNormalizer.ts',
  'src/services/truckflowTransform/contractFirst/contractFirst.types.ts',
  'src/services/truckflowTransform/contractFirst/contractFirstAudit.ts',
  'src/services/truckflowTransform/contractFirst/contractFirstProgress.ts',
  'src/services/truckflowTransform/contractFirst/contractIntegrationRun.ts',
  'src/services/truckflowTransform/contractFirst/contractTruckflowMerge.ts',
  'src/services/truckflowTransform/contractFirst/contractFirstCliAdapter.ts',
])

// Regla 1: nadie nuevo importa etlWorkbench desde fuera de features/real-truckflow
walk(path.join(ROOT, 'src'), ['.ts', '.tsx'], (p, src) => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/')
  if (rel.startsWith('src/features/real-truckflow/')) return
  if (!/from ['"][^'"]*etlWorkbench\//.test(src)) return
  if (!ETLWORKBENCH_IMPORT_BASELINE.has(rel)) {
    violations.push(`[freeze-etlWorkbench] ${rel} importa etlWorkbench (no está en la línea base)`)
  }
})

// Regla 2: etl-core es puro — sin DOM, sin React, sin imports hacia features/pages/services
walk(path.join(ROOT, 'src', 'etl-core'), ['.ts'], (p, src) => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/')
  if (/\b(document|window|navigator)\./.test(src)) {
    violations.push(`[etl-core-puro] ${rel} usa API de navegador`)
  }
  if (/from ['"]react['"]/.test(src)) {
    violations.push(`[etl-core-puro] ${rel} importa react`)
  }
  if (/from ['"][^'"]*(features\/|pages\/|\.\.\/services\/)/.test(src)) {
    violations.push(`[etl-core-puro] ${rel} importa features/pages/services`)
  }
})

if (violations.length) {
  console.error('VIOLACIONES DE ARQUITECTURA:')
  for (const v of violations) console.error(' - ' + v)
  process.exit(1)
}
console.log('check-arch-rules: OK')
```

2. Agregá el script a `package.json` → `"scripts"`:
   `"check:arch": "node scripts/check-arch-rules.mjs"` y encadenalo al test:
   cambiá `"test": "vitest run"` por `"test": "node scripts/check-arch-rules.mjs && vitest run"`.
3. Corré `npm run check:arch` → debe imprimir `check-arch-rules: OK`.

**Verificación:** `npm run check:arch` OK. Prueba negativa: agregá temporalmente
`import '' from '../features/real-truckflow/etlWorkbench/etlCsv'` en un archivo de
`src/services`, corré el script (debe FALLAR), y revertí el cambio.

**Commit:** `fase0: script check-arch-rules (freeze etlWorkbench + pureza etl-core)`

---

## Paso 0.3 — Línea base de errores tsc documentada

**Objetivo:** dejar registrado cuántos errores pre-existentes tiene `tsc` para que
los pasos siguientes puedan comparar (regla R5 del README).

**Acciones:**

1. Corré: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` y anotá el número.
2. Creá `docs/migracion/TSC_BASELINE.md` con:
   - fecha, número de errores, y el comando usado.
   - la salida completa de `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS"`.

**Verificación:** el archivo existe y el número coincide con una segunda corrida.

**Commit:** `fase0: línea base de errores tsc pre-existentes`

---

## ✅ Criterio de salida de la Fase 0

- Golden master con 2 tests verdes (fingerprint + hashes CSV).
- `npm test` corre check-arch-rules antes de vitest.
- `TSC_BASELINE.md` existe.
- `PROGRESO.md` con los 3 pasos marcados.
