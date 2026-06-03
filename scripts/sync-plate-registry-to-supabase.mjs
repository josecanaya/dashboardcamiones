/**
 * Sincroniza data/truck-registry/registry.json → Supabase truck_plate_registry.
 * Inserta entradas activas que no existan ya (por plate_normalized).
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import '../server/load-env.mjs'
import { createServerSupabaseClient } from '../server/supabase-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const REGISTRY_FILE = path.join(PROJECT_ROOT, 'data', 'truck-registry', 'registry.json')

function normalizePlate(raw) {
  let s = String(raw ?? '').trim().toUpperCase()
  s = s.replace(/[\s-]+/g, '')
  s = s.replace(/[^A-Z0-9]/g, '')
  return s
}

const supabase = createServerSupabaseClient()
if (!supabase) {
  console.error('Falta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const raw = await fs.readFile(REGISTRY_FILE, 'utf8')
const doc = JSON.parse(raw)
const entries = (doc.entries ?? []).filter((e) => e.active && normalizePlate(e.plate))

const { data: existing, error: readErr } = await supabase
  .from('truck_plate_registry')
  .select('plate_normalized, active')
if (readErr) {
  console.error('[sync] Error leyendo Supabase:', readErr.message)
  process.exit(1)
}

const activePlates = new Set(
  (existing ?? []).filter((r) => r.active).map((r) => String(r.plate_normalized))
)

const toInsert = []
for (const e of entries) {
  const plate = normalizePlate(e.plate)
  if (!plate || activePlates.has(plate)) continue
  activePlates.add(plate)
  toInsert.push({
    plate,
    category: e.category,
    active: true,
    exclude_from_analytics: e.excludeFromAnalytics !== false,
    label: e.label ?? null,
    notes: e.notes ?? null,
    created_by: e.createdBy ?? 'sync:registry.json',
  })
}

if (toInsert.length === 0) {
  console.info('[sync] Nada que insertar — Supabase ya tiene todas las patentes del JSON')
  process.exit(0)
}

const { data: inserted, error: insertErr } = await supabase
  .from('truck_plate_registry')
  .insert(toInsert)
  .select('id, plate_normalized')

if (insertErr) {
  console.error('[sync] Error insertando:', insertErr.message)
  process.exit(1)
}

console.info(`[sync] OK — ${inserted.length} patentes insertadas en Supabase`)
for (const row of inserted) {
  console.info(`  + ${row.plate_normalized}`)
}
