/**
 * Aplica supabase/migrations/20260603120000_truck_plate_registry.sql vía DATABASE_URL (.env)
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import '../server/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const SQL_PATH = path.join(
  PROJECT_ROOT,
  'supabase',
  'migrations',
  '20260603120000_truck_plate_registry.sql'
)

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error('Falta DATABASE_URL en .env')
  process.exit(1)
}

const sql = await fs.readFile(SQL_PATH, 'utf8')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.info('[migrate] OK — truck_plate_registry aplicado en Supabase')
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('already exists')) {
    console.info('[migrate] Objetos ya existían — sin cambios')
  } else {
    console.error('[migrate] Error:', msg)
    process.exit(1)
  }
} finally {
  await client.end()
}
