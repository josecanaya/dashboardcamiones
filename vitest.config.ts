import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.mjs'],
  exclude: ['**/node_modules/**', '**/.claude/**', 'server/analytics/metrics.test.mjs', 'server/dssPhotoLookup.test.mjs', 'server/plantState/identificationDecisions.test.mjs', 'server/plantState/identificationArchive.test.mjs'],
  maxWorkers: 4,
} })
