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
  // Tests de etl-core pueden apuntar a workbench mientras se migran tipos (Fase 1).
  if (rel.startsWith('src/etl-core/') && rel.endsWith('.test.ts')) return
  // Excepción temporal Fase 1: reports/ puede importar etlWorkbench (tipos/helpers).
  if (rel.startsWith('src/etl-core/reports/')) return
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
  // Excepción temporal Fase 1: reports/ puede importar de etlWorkbench
  // hasta que los tipos se muevan a domain/ (Paso 1.5). Quitar al cerrar Fase 1.
  if (rel.startsWith('src/etl-core/reports/') && /etlWorkbench\//.test(src)) {
    return
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
