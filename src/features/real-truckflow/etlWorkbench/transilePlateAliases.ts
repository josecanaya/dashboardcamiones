import { normalizePlateKey } from './auditSlCameraExcelCoverage'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'

export type TransilePlateAliasEntry = {
  /** Patente correcta (Excel / referencia). */
  canonical: string
  /** Lecturas habituales en Volcable que se suman a esa patente. */
  ocr_variants: string[]
  nota?: string
}

export const TRANSILE_PLATE_ALIASES_STORAGE_KEY = 'dashboard_transile_plate_aliases_v1'

/** Semillas conocidas; el usuario puede ampliar en la UI. */
export const DEFAULT_TRANSILE_PLATE_ALIASES: TransilePlateAliasEntry[] = [
  {
    canonical: 'UUL425',
    ocr_variants: ['IIL425', 'IL425', 'UUL42S', 'VUL425'],
    nota: 'U↔I / falta letra inicial',
  },
]

function normalizeEntry(e: TransilePlateAliasEntry): TransilePlateAliasEntry {
  const canonicalRaw = normalizePlateStrict(e.canonical)
  const canonical = looksLikeVolcablePlateKey(canonicalRaw) ? canonicalRaw : ''
  const ocr_variants = [
    ...new Set(
      e.ocr_variants
        .map((v) => normalizePlateStrict(v))
        .filter((v) => v && looksLikeVolcablePlateKey(v) && v !== canonical)
    ),
  ]
  return { ...e, canonical, ocr_variants }
}

export function mergeTransilePlateAliasLists(
  base: TransilePlateAliasEntry[],
  extra: TransilePlateAliasEntry[]
): TransilePlateAliasEntry[] {
  const byCanon = new Map<string, TransilePlateAliasEntry>()
  for (const raw of [...base, ...extra]) {
    const e = normalizeEntry(raw)
    if (!e.canonical) continue
    const prev = byCanon.get(e.canonical)
    if (!prev) {
      byCanon.set(e.canonical, e)
      continue
    }
    byCanon.set(e.canonical, {
      ...prev,
      ocr_variants: [...new Set([...prev.ocr_variants, ...e.ocr_variants])],
      nota: e.nota || prev.nota,
    })
  }
  return [...byCanon.values()].sort((a, b) => a.canonical.localeCompare(b.canonical))
}

export function loadTransilePlateAliases(): TransilePlateAliasEntry[] {
  try {
    if (typeof localStorage === 'undefined') {
      return mergeTransilePlateAliasLists(DEFAULT_TRANSILE_PLATE_ALIASES, [])
    }
    const raw = localStorage.getItem(TRANSILE_PLATE_ALIASES_STORAGE_KEY)
    if (!raw?.trim()) return mergeTransilePlateAliasLists(DEFAULT_TRANSILE_PLATE_ALIASES, [])
    const parsed = JSON.parse(raw) as TransilePlateAliasEntry[]
    if (!Array.isArray(parsed)) return mergeTransilePlateAliasLists(DEFAULT_TRANSILE_PLATE_ALIASES, [])
    return mergeTransilePlateAliasLists(DEFAULT_TRANSILE_PLATE_ALIASES, parsed)
  } catch {
    return mergeTransilePlateAliasLists(DEFAULT_TRANSILE_PLATE_ALIASES, [])
  }
}

/** Solo entradas guardadas por el usuario (sin semillas). */
export function loadUserTransilePlateAliasesOnly(): TransilePlateAliasEntry[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(TRANSILE_PLATE_ALIASES_STORAGE_KEY)
    if (!raw?.trim()) return []
    const parsed = JSON.parse(raw) as TransilePlateAliasEntry[]
    return Array.isArray(parsed) ? parsed.map(normalizeEntry) : []
  } catch {
    return []
  }
}

export function saveUserTransilePlateAliases(entries: TransilePlateAliasEntry[]): void {
  if (typeof localStorage === 'undefined') return
  const clean = mergeTransilePlateAliasLists([], entries)
  localStorage.setItem(TRANSILE_PLATE_ALIASES_STORAGE_KEY, JSON.stringify(clean))
}

/** Agrega o actualiza variantes sin borrar otras patentes guardadas. */
export function upsertUserTransilePlateAlias(entry: TransilePlateAliasEntry): TransilePlateAliasEntry[] {
  const canonical = normalizePlateStrict(entry.canonical)
  if (!canonical) return loadUserTransilePlateAliasesOnly()
  const current = loadUserTransilePlateAliasesOnly()
  const prev = current.find((e) => normalizePlateStrict(e.canonical) === canonical)
  const ocr_variants = [
    ...new Set([
      ...(prev?.ocr_variants ?? []),
      ...entry.ocr_variants.map((v) => normalizePlateStrict(v)).filter(Boolean),
    ]),
  ]
  const rest = current.filter((e) => normalizePlateStrict(e.canonical) !== canonical)
  const next = mergeTransilePlateAliasLists([], [...rest, { canonical, ocr_variants, nota: entry.nota }])
  saveUserTransilePlateAliases(next)
  return next
}

export function removeUserTransilePlateAlias(canonicalPlate: string): TransilePlateAliasEntry[] {
  const canonical = normalizePlateStrict(canonicalPlate)
  const next = loadUserTransilePlateAliasesOnly().filter(
    (e) => normalizePlateStrict(e.canonical) !== canonical
  )
  saveUserTransilePlateAliases(next)
  return next
}

export function ocrVariantKeysForCanonical(
  canonicalPlate: string,
  aliases: TransilePlateAliasEntry[]
): Set<string> {
  const canon = normalizePlateKey(canonicalPlate)
  const out = new Set<string>()
  for (const e of aliases) {
    if (normalizePlateKey(e.canonical) !== canon) continue
    for (const v of e.ocr_variants) {
      const k = normalizePlateKey(v)
      if (k && k !== canon) out.add(k)
    }
  }
  return out
}

export function looksLikeVolcablePlateKey(key: string): boolean {
  const k = normalizePlateStrict(key)
  if (k.length < 5 || k.length > 8) return false
  if (/^\d{1,2}:\d{2}$/.test(k)) return false
  if (!/[A-Z]/.test(k) || !/\d/.test(k)) return false
  return true
}
