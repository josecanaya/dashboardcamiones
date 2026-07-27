/**
 * Export CSV canónico limpio.
 *
 * Reemplaza el aparato PowerBI (que re-derivaba capas denormalizadas y las
 * empaquetaba por triplicado). Acá NO se reprocesa nada: se toman las tablas
 * canónicas que el Transform ya produjo en `transformResult.csv` y se sirven
 * tal cual, sin sobreabundancia. Una tabla = un CSV plano.
 *
 * Fuente única de verdad de las tablas: ver docs/RUNS_TABLAS_CANONICAS.md y la
 * regla 6 de CLAUDE.md (conteos → excel_operations_with_truckflow; clasificación
 * → final_circuits; tiempos → circuit_timing_*).
 */
import { zipSync, strToU8 } from 'fflate'

export type CanonicalCsvTable = {
  /** Clave en transformResult.csv (nombre de tabla canónica). */
  key: string
  /** Nombre de archivo de descarga. */
  filename: string
  /** Etiqueta corta para el botón. */
  label: string
  /** Qué contiene, en una línea. */
  hint: string
}

/**
 * Allowlist de tablas a exportar. Deliberadamente corta: solo lo canónico,
 * sin capas de diagnóstico ni duplicados. Para sumar una tabla, agregá su
 * clave acá; no se toca nada más.
 */
export const CANONICAL_CSV_TABLES: readonly CanonicalCsvTable[] = [
  {
    key: 'excel_operations_with_truckflow',
    filename: 'operaciones_excel_truckflow.csv',
    label: 'Operaciones',
    hint: 'Movimientos Excel + match Truckflow (producto, plataforma, circuito resuelto).',
  },
  {
    key: 'final_circuits',
    filename: 'circuitos_finales.csv',
    label: 'Circuitos finales',
    hint: 'Clasificación ejecutiva/comité por recorrido (executive_bucket).',
  },
  {
    key: 'circuit_timing_summary',
    filename: 'tiempos_por_circuito.csv',
    label: 'Tiempos (resumen)',
    hint: 'Media, desvío y percentiles de tiempo total por circuito.',
  },
  {
    key: 'circuit_timing_journeys',
    filename: 'tiempos_por_recorrido.csv',
    label: 'Tiempos (recorridos)',
    hint: 'Tiempo total y por tramo de cada recorrido completo.',
  },
  {
    key: 'alerts_operational',
    filename: 'alertas_operativas.csv',
    label: 'Alertas',
    hint: 'Alertas operativas cruzadas con recorridos.',
  },
  {
    key: 'transile_externo_operaciones',
    filename: 'transile_externo.csv',
    label: 'Transile externo',
    hint: 'Operaciones de transile externo (soja/girasol/pellet).',
  },
] as const

export type CanonicalNamedCsv = { key: string; filename: string; csv: string }

/** Fila con datos = tiene al menos un salto de línea después del header. */
function csvHasRows(csv: string | undefined): csv is string {
  if (!csv) return false
  const trimmed = csv.trim()
  if (!trimmed) return false
  return trimmed.indexOf('\n') >= 0
}

/**
 * Devuelve, para las tablas canónicas presentes y no vacías en `csv`, su CSV
 * tal cual. Las ausentes se omiten en silencio (no todas las corridas producen
 * todas las tablas).
 */
export function collectCanonicalCsvBundle(
  csv: Record<string, string> | null | undefined
): CanonicalNamedCsv[] {
  if (!csv) return []
  const out: CanonicalNamedCsv[] = []
  for (const t of CANONICAL_CSV_TABLES) {
    const text = csv[t.key]
    if (csvHasRows(text)) out.push({ key: t.key, filename: t.filename, csv: text })
  }
  return out
}

/** Qué claves canónicas están disponibles para exportar en esta corrida. */
export function availableCanonicalKeys(csv: Record<string, string> | null | undefined): Set<string> {
  return new Set(collectCanonicalCsvBundle(csv).map((f) => f.key))
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Descarga una tabla canónica suelta. Devuelve false si no hay datos. */
export function downloadCanonicalCsv(
  csv: Record<string, string> | null | undefined,
  key: string
): boolean {
  const bundle = collectCanonicalCsvBundle(csv)
  const file = bundle.find((f) => f.key === key)
  if (!file) return false
  triggerDownload(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }), file.filename)
  return true
}

/** Descarga todas las tablas canónicas disponibles en un ZIP. False si no hay ninguna. */
export function downloadCanonicalCsvZip(
  csv: Record<string, string> | null | undefined,
  zipName = 'tablas_canonicas_csv.zip'
): boolean {
  const bundle = collectCanonicalCsvBundle(csv)
  if (!bundle.length) return false
  const entries: Record<string, Uint8Array> = {}
  for (const f of bundle) entries[f.filename] = strToU8(f.csv)
  const zipped = zipSync(entries, { level: 6 })
  // Copiar a un ArrayBuffer propio para el Blob (evita el SharedArrayBuffer del view).
  const buf = zipped.slice()
  triggerDownload(new Blob([buf], { type: 'application/zip' }), zipName)
  return true
}
