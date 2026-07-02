import { useCallback, useMemo, useState } from 'react'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'
import {
  loadTransilePlateAliases,
  loadUserTransilePlateAliasesOnly,
  removeUserTransilePlateAlias,
  upsertUserTransilePlateAlias,
  type TransilePlateAliasEntry,
} from '../etlWorkbench/transilePlateAliases'

type Props = {
  patentesEnCohorte: string[]
  disabled?: boolean
}

function parseVariantsLine(line: string): string[] {
  return line
    .split(/[,;|/\s]+/)
    .map((s) => normalizePlateStrict(s))
    .filter(Boolean)
}

export function TransilePlateAliasesPanel({ patentesEnCohorte, disabled }: Props) {
  const [revision, setRevision] = useState(0)
  const [draftCanon, setDraftCanon] = useState('')
  const [draftVariants, setDraftVariants] = useState('')
  const [status, setStatus] = useState('')

  const userEntries = useMemo(
    () => loadUserTransilePlateAliasesOnly(),
    [revision]
  )
  const effective = useMemo(() => loadTransilePlateAliases(), [revision])

  const userCanonSet = useMemo(
    () => new Set(userEntries.map((e) => normalizePlateStrict(e.canonical))),
    [userEntries]
  )

  const suggestions = useMemo(() => {
    const inDb = new Set(effective.map((e) => normalizePlateStrict(e.canonical)))
    return [...new Set(patentesEnCohorte.map((p) => normalizePlateStrict(p)).filter(Boolean))]
      .filter((p) => !inDb.has(p))
      .sort()
      .slice(0, 12)
  }, [patentesEnCohorte, effective])

  const bump = useCallback(() => setRevision((r) => r + 1), [])

  const addEntry = () => {
    const canonical = normalizePlateStrict(draftCanon)
    const ocr_variants = parseVariantsLine(draftVariants)
    if (!canonical) return
    upsertUserTransilePlateAlias({ canonical, ocr_variants })
    bump()
    setStatus(`Guardado ${canonical} (${ocr_variants.length} variantes). Ejecutá Transform.`)
    setDraftCanon('')
    setDraftVariants('')
  }

  const removeUserEntry = (canonical: string) => {
    removeUserTransilePlateAlias(canonical)
    bump()
    setStatus(`Quitada entrada de usuario para ${canonical}.`)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm">
      <p className="text-xs font-semibold text-slate-800">Base de patentes (lecturas OCR en Volcable)</p>
      <p className="mt-1 text-[11px] text-slate-600">
        Cada guardado <strong>suma</strong> variantes a esa patente y <strong>no borra</strong> las demás.
        Solo variantes listadas acá (más la patente exacta). Transform después de guardar.
      </p>
      {status ?
        <p className="mt-1 text-[11px] text-emerald-800">{status}</p>
      : null}

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="text"
          disabled={disabled}
          placeholder="Patente Excel (ej. UUL425)"
          className="min-w-[8rem] rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          value={draftCanon}
          onChange={(e) => setDraftCanon(e.target.value)}
        />
        <input
          type="text"
          disabled={disabled}
          placeholder="Variantes: IIL425, IL425"
          className="min-w-[12rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-mono"
          value={draftVariants}
          onChange={(e) => setDraftVariants(e.target.value)}
        />
        <button
          type="button"
          disabled={disabled || !normalizePlateStrict(draftCanon)}
          className="rounded bg-violet-700 px-3 py-1 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-50"
          onClick={addEntry}
        >
          Guardar / actualizar
        </button>
      </div>

      {suggestions.length > 0 ?
        <p className="mt-2 text-[11px] text-slate-500">
          En cohorte sin alias:{' '}
          {suggestions.map((p) => (
            <button
              key={p}
              type="button"
              className="mr-1 font-mono text-violet-700 underline"
              onClick={() => setDraftCanon(p)}
            >
              {p}
            </button>
          ))}
        </p>
      : null}

      <ul className="mt-3 space-y-1.5 text-xs">
        {effective.map((e) => {
          const canon = normalizePlateStrict(e.canonical)
          const isUser = userCanonSet.has(canon)
          return (
            <li
              key={canon}
              className="flex flex-wrap items-start justify-between gap-2 rounded border border-white bg-white px-2 py-1.5"
            >
              <div>
                <span className="font-mono font-bold">{e.canonical}</span>
                <span className="text-slate-500"> → </span>
                <span className="font-mono text-slate-700">
                  {e.ocr_variants.length ? e.ocr_variants.join(', ') : '—'}
                </span>
                {!isUser ?
                  <span className="ml-1 text-[10px] text-slate-400">(ejemplo de fábrica)</span>
                : null}
              </div>
              {isUser ?
                <button
                  type="button"
                  disabled={disabled}
                  className="text-[11px] text-red-600 hover:underline"
                  onClick={() => removeUserEntry(canon)}
                >
                  Quitar
                </button>
              : null}
            </li>
          )
        })}
      </ul>
      {userEntries.length > 0 ?
        <p className="mt-2 text-[10px] text-slate-500">
          Guardadas por vos: {userEntries.length} patente(s) en este navegador.
        </p>
      : null}
    </div>
  )
}
