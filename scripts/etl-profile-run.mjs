#!/usr/bin/env node
/**
 * Wrapper: ejecuta scripts/etl-profile-run.ts vía vite-node (TypeScript ETL).
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const tsEntry = resolve(__dirname, 'etl-profile-run.ts')
const args = process.argv.slice(2)

const env = { ...process.env, ETL_PROFILE: process.env.ETL_PROFILE ?? 'true' }
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, ['vite-node', tsEntry, ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
