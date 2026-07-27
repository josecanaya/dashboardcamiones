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
  'src/components/realDiagnostics/LiveCameraMonitor.tsx',
  'src/pages/RealJourneyDiagnosticsPageLegacy.tsx',
  'src/pages/RealJourneyDiagnosticsView.tsx',
  'src/services/powerBiEtlExportBuilder.ts',
  'src/services/realJourneyEventsMapper.ts',
  'src/services/rearCameraFilter.ts',
  'src/services/realEventOperationalTime.test.ts',
  'src/services/truckflowTransform/classify.ts',
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
  // Tests de etl-core pueden apuntar a workbench mientras se migran tipos (Fase 1).
  if (rel.startsWith('src/etl-core/') && rel.endsWith('.test.ts')) return
  // Excepción temporal Fase 1: reports/ y pipelineTypes pueden importar etlWorkbench.
  if (rel.startsWith('src/etl-core/reports/')) return
  if (rel === 'src/etl-core/domain/pipelineTypes.ts') return
  if (!/from ['"][^'"]*etlWorkbench\//.test(src)) return
  if (!ETLWORKBENCH_IMPORT_BASELINE.has(rel)) {
    violations.push(`[freeze-etlWorkbench] ${rel} importa etlWorkbench (no está en la línea base)`)
  }
})

// Regla 2: etl-core es puro — sin DOM, sin React, sin imports hacia features/pages/services
walk(path.join(ROOT, 'src', 'etl-core'), ['.ts'], (p, src) => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/')
  if (rel.endsWith('.test.ts')) return
  if (/\b(document|window|navigator)\./.test(src)) {
    violations.push(`[etl-core-puro] ${rel} usa API de navegador`)
  }
  if (/from ['"]react['"]/.test(src)) {
    violations.push(`[etl-core-puro] ${rel} importa react`)
  }
  // Excepción temporal Fase 1: reports/ y pipelineTypes pueden referir etlWorkbench.
  if (rel.startsWith('src/etl-core/reports/') && /etlWorkbench\//.test(src)) {
    return
  }
  if (rel === 'src/etl-core/domain/pipelineTypes.ts') return
  if (/from ['"][^'"]*(features\/|pages\/|\.\.\/services\/)/.test(src)) {
    violations.push(`[etl-core-puro] ${rel} importa features/pages/services`)
  }
})

// Línea base congelada 2026-07-26: archivos que todavía importan masterCircuitCatalog.
// CIRCUIT_CATALOG (src/etl-core/domain) es la única fuente de verdad de circuitos;
// masterCircuitCatalog queda relegado a presentación (3D / páginas legacy).
// NO agregar entradas: si un archivo nuevo necesita circuitos, usa CIRCUIT_CATALOG.
const MASTER_CATALOG_IMPORT_BASELINE = new Set([
  'src/components/IfcViewer.tsx',
  'src/pages/HistoricalOperationalPage.tsx',
  'src/features/real-truckflow/etlWorkbench/powerBiCommitteeExecutive.ts',
  'src/lib/kpi5.utils.ts',
  'src/lib/kpi5Multinivel.utils.ts',
])

/** Quita comentarios para que las reglas miren código real, no documentación. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Regla 3: masterCircuitCatalog no se importa desde código de clasificación/ETL nuevo
walk(path.join(ROOT, 'src'), ['.ts', '.tsx'], (p, src) => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/')
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return
  if (rel === 'src/data/masterCircuitCatalog.ts') return
  if (!/from ['"][^'"]*masterCircuitCatalog['"]/.test(src)) return
  if (!MASTER_CATALOG_IMPORT_BASELINE.has(rel)) {
    violations.push(
      `[catalogo-unico] ${rel} importa masterCircuitCatalog (usar CIRCUIT_CATALOG de etl-core)`
    )
  }
})

// Regla 4: no reintroducir mapas de equivalencia fabricados entre códigos de circuito
walk(path.join(ROOT, 'src'), ['.ts', '.tsx'], (p, src) => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/')
  if (rel.endsWith('.test.ts')) return
  if (/MATRIX_CODE_TO_LEGACY_TRIP_BASES/.test(stripComments(src))) {
    violations.push(
      `[catalogo-unico] ${rel} reintroduce MATRIX_CODE_TO_LEGACY_TRIP_BASES ` +
        `(equivalencias fabricadas: idx%2 -> B1/B2, E{min(idx+1,5)})`
    )
  }
})

if (violations.length) {
  console.error('VIOLACIONES DE ARQUITECTURA:')
  for (const v of violations) console.error(' - ' + v)
  process.exit(1)
}
console.log('check-arch-rules: OK')
