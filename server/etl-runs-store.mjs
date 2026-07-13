/**
 * Persistencia remota de corridas ETL en Supabase (tabla etl_runs + Storage bucket etl-runs).
 * Disco local (runs/<runId>/) sigue siendo la fuente de la API; esto es réplica durable.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createServerSupabaseClient } from './supabase-client.mjs'

const BUCKET = 'etl-runs'
const RUNS_TABLE = 'etl_runs'
const TABLES_TABLE = 'etl_run_tables'

function contentTypeFor(fileName) {
  if (fileName.endsWith('.json')) return 'application/json'
  if (fileName.endsWith('.csv')) return 'text/csv'
  if (fileName.endsWith('.txt')) return 'text/plain'
  return 'application/octet-stream'
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} objectPath
 * @param {Buffer} body
 * @param {string} contentType
 */
async function uploadObject(supabase, objectPath, body, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, body, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Storage upload ${objectPath}: ${error.message}`)
  return objectPath
}

/**
 * Sube una corrida local completa a Supabase.
 * @param {string} runDir ruta absoluta a runs/<runId>/
 * @returns {Promise<{ runId: string, tableCount: number, storagePrefix: string } | null>}
 *   null si Supabase no está configurado.
 */
export async function uploadEtlRunFromDisk(runDir) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return null

  const abs = path.resolve(runDir)
  const manifestPath = path.join(abs, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Sin manifest.json en ${abs}`)
  }

  const manifest = readJson(manifestPath)
  const runId = String(manifest.runId || path.basename(abs)).trim()
  if (!runId) throw new Error('manifest sin runId')

  const storagePrefix = `${runId}/`
  const statsPath = path.join(abs, 'stats.json')
  const logsPath = path.join(abs, 'logs.txt')
  const stats = existsSync(statsPath) ? readJson(statsPath) : null

  await uploadObject(
    supabase,
    `${storagePrefix}manifest.json`,
    Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    'application/json'
  )
  if (existsSync(statsPath)) {
    await uploadObject(
      supabase,
      `${storagePrefix}stats.json`,
      readFileSync(statsPath),
      'application/json'
    )
  }
  if (existsSync(logsPath)) {
    await uploadObject(supabase, `${storagePrefix}logs.txt`, readFileSync(logsPath), 'text/plain')
  }

  const tablesDir = path.join(abs, 'tables')
  const tableRows = []
  if (existsSync(tablesDir)) {
    const files = readdirSync(tablesDir)
    const names = new Set(
      files
        .filter((n) => n.endsWith('.json') || n.endsWith('.csv'))
        .map((n) => n.replace(/\.(json|csv)$/i, ''))
    )
    for (const tableName of [...names].sort()) {
      const jsonName = `${tableName}.json`
      const csvName = `${tableName}.csv`
      let storageJsonPath = null
      let storageCsvPath = null
      let rowCount = null

      if (files.includes(jsonName)) {
        const buf = readFileSync(path.join(tablesDir, jsonName))
        storageJsonPath = await uploadObject(
          supabase,
          `${storagePrefix}tables/${jsonName}`,
          buf,
          'application/json'
        )
        try {
          const doc = JSON.parse(buf.toString('utf8'))
          if (Array.isArray(doc.rows)) rowCount = doc.rows.length
        } catch {
          /* ignore */
        }
      }
      if (files.includes(csvName)) {
        storageCsvPath = await uploadObject(
          supabase,
          `${storagePrefix}tables/${csvName}`,
          readFileSync(path.join(tablesDir, csvName)),
          'text/csv'
        )
      }
      tableRows.push({
        run_id: runId,
        table_name: tableName,
        row_count: rowCount,
        storage_json_path: storageJsonPath,
        storage_csv_path: storageCsvPath,
      })
    }
  }

  const row = {
    run_id: runId,
    status: String(manifest.status || 'ok'),
    rules_version: manifest.rulesVersion ?? null,
    started_at: manifest.startedAt ?? null,
    finished_at: manifest.finishedAt ?? null,
    input: manifest.input ?? {},
    output: manifest.output ?? {},
    stats,
    error: manifest.error ?? null,
    storage_prefix: storagePrefix,
  }

  const { error: upsertErr } = await supabase.from(RUNS_TABLE).upsert(row, { onConflict: 'run_id' })
  if (upsertErr) {
    throw new Error(`etl_runs upsert: ${upsertErr.message}`)
  }

  if (tableRows.length) {
    const { error: delErr } = await supabase.from(TABLES_TABLE).delete().eq('run_id', runId)
    if (delErr) throw new Error(`etl_run_tables delete: ${delErr.message}`)
    const { error: insErr } = await supabase.from(TABLES_TABLE).insert(tableRows)
    if (insErr) throw new Error(`etl_run_tables insert: ${insErr.message}`)
  }

  return { runId, tableCount: tableRows.length, storagePrefix }
}

/** Lista manifests remotos (orden started_at desc). */
export async function listEtlRunsFromSupabase(limit = 50) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('run_id, status, rules_version, started_at, finished_at, input, output, error, storage_prefix')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`etl_runs list: ${error.message}`)
  return (data || []).map((r) => ({
    runId: r.run_id,
    status: r.status,
    rulesVersion: r.rules_version,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    input: r.input,
    output: r.output,
    error: r.error,
    storagePrefix: r.storage_prefix,
    source: 'supabase',
  }))
}
