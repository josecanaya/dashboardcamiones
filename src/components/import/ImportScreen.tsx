import { useState, useCallback, useMemo } from 'react'
import { useSite } from '../../context/SiteContext'
import { useData } from '../../context/DataContext'
import type { SiteId } from '../../domain/sites'
import type { NormalizedEvent } from '../../domain/events'
import type { ParsedFile } from '../../import/types'
import type { ColumnMapping } from '../../import/types'
import { parseCSV } from '../../import/readers'
import { parseXLSX, hashHeaders } from '../../import/readers'
import { getStoredMapping, setStoredMapping, mapRowsToNormalizedEvents } from '../../import/columnMapper'
import { getDefaultMapping, isStandardEventStreamHeaders } from '../../import/defaultMapping'
import { validateMapping } from '../../import/validation'
import { isEventStreamFile, buildRawEventRowsFromFile } from '../../import/eventStreamImport'
import { validateTrip } from '../../validation'
import type { TripValidationStatus } from '../../validation'
import { Dropzone } from './Dropzone'
import { ColumnMapper } from './ColumnMapper'

const SAMPLE_FILES: { url: string; siteId: SiteId }[] = [
  { url: '/samples/ricardone.csv', siteId: 'ricardone' },
  { url: '/samples/san_lorenzo.csv', siteId: 'san_lorenzo' },
  { url: '/samples/avellaneda.csv', siteId: 'avellaneda' },
]

export interface ImportScreenProps {
  onProcessSuccess?: () => void
}

export function ImportScreen({ onProcessSuccess }: ImportScreenProps = {}) {
  const { siteId } = useSite()
  const { runPipeline, runEventStreamPipeline, getVisitsBySite, visits, setLastLoadedFileName } = useData()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState<string | null>(null)
  const [processed, setProcessed] = useState(false)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [autoMappingDetected, setAutoMappingDetected] = useState(false)

  const loadSamples = useCallback(async () => {
    setError(null)
    setLoadingSamples(true)
    try {
      const allEvents: NormalizedEvent[] = []
      const sampleMapping: ColumnMapping = {
        timestamp: 'timestamp',
        event: 'event',
        location: 'location',
        visitId: 'visitId',
        plate: 'plate',
        docNumber: 'docNumber',
        product: 'product',
      }
      for (const { url, siteId: sid } of SAMPLE_FILES) {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`No se pudo cargar ${url}`)
        const text = await res.text()
        const result = parseCSV(text)
        const events = mapRowsToNormalizedEvents(result.rows, sid, sampleMapping)
        allEvents.push(...events)
      }
      runPipeline(allEvents)
      setProcessed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar muestras')
    } finally {
      setLoadingSamples(false)
    }
  }, [runPipeline])

  const handleFile = useCallback(async (f: File) => {
    setError(null)
    setProcessed(false)
    setAutoMappingDetected(false)
    setFile(f)
    const name = f.name.toLowerCase()
    try {
      let result: ParsedFile
      if (name.endsWith('.csv')) {
        const text = await f.text()
        result = parseCSV(text)
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await f.arrayBuffer()
        result = parseXLSX(buf)
      } else {
        setError('Formato no soportado. Usá .csv o .xlsx')
        setParsed(null)
        return
      }
      result.fileName = f.name
      setParsed(result)
      const hash = hashHeaders(result.headers)
      const stored = getStoredMapping(siteId, hash)
      if (stored) {
        setMapping(stored)
      } else {
        const defaults = getDefaultMapping(result.headers)
        if (Object.keys(defaults).length > 0) {
          setMapping(defaults)
        } else {
          setMapping({ timestamp: result.headers[0], event: result.headers[1] })
        }
      }
      setAutoMappingDetected(isStandardEventStreamHeaders(result.headers))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer el archivo')
      setParsed(null)
    }
  }, [siteId])

  const validation = useMemo(
    () => (parsed ? validateMapping(parsed, mapping) : { valid: false, errors: [] as string[], previewRows: [] }),
    [parsed, mapping]
  )

  const handleProcess = useCallback(() => {
    if (!parsed) return
    if (!validation.valid) {
      setError(validation.errors.join(' '))
      return
    }
    const eventStreamMode = isEventStreamFile(mapping)
    if (eventStreamMode) {
      const rawRows = buildRawEventRowsFromFile(parsed.rows, mapping, siteId)
      if (rawRows.length === 0) {
        setError('No se pudieron parsear filas como event-stream. Revisá que Fecha/hora y Evento tengan valores válidos.')
        return
      }
      runEventStreamPipeline(rawRows, siteId)
    } else {
      const events = mapRowsToNormalizedEvents(parsed.rows, siteId, mapping)
      if (events.length === 0) {
        setError('No se generaron eventos. Revisá el mapeo y que haya filas con fecha y evento.')
        return
      }
      runPipeline(events)
    }
    const hash = parsed.headers ? hashHeaders(parsed.headers) : ''
    setStoredMapping({ siteId, headerHash: hash, mapping, fileName: file?.name })
    setLastLoadedFileName(file?.name ?? null)
    setProcessed(true)
    setError(null)
    onProcessSuccess?.()
  }, [parsed, mapping, siteId, runPipeline, runEventStreamPipeline, file?.name, validation, setLastLoadedFileName, onProcessSuccess])

  const siteVisits = useMemo(() => getVisitsBySite(siteId), [getVisitsBySite, siteId, visits])
  const debugInfo = useMemo(() => {
    if (!processed || siteVisits.length === 0) return null
    const counts: Record<TripValidationStatus, number> = {
      VALID_IDEAL: 0,
      VALID_ACCEPTABLE: 0,
      VALID_NO_DISCHARGE: 0,
      INVALID: 0,
    }
    for (const v of siteVisits) {
      const r = validateTrip(v.events)
      counts[r.status] = (counts[r.status] ?? 0) + 1
    }
    const invalidList = siteVisits.filter((v) => validateTrip(v.events).status === 'INVALID').slice(0, 5)
    const invalidExamples = invalidList.map((v) => {
      const r = validateTrip(v.events)
      return {
        visitKey: v.visitId,
        visitId: v.visitId,
        plate: v.plate ?? '—',
        status: r.status,
        pathDisplay: r.pathDisplay || '—',
        explanation: r.explanation || '—',
        flags: r.flags.join(', ') || '—',
      }
    })
    return { counts, invalidExamples }
  }, [processed, siteVisits])

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Importar datos</h2>
        <p className="text-sm text-slate-500 mb-4">
          Subí un archivo CSV o Excel exportado del sistema de planta. Luego mapeá las columnas y procesá.
        </p>
        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={loadSamples}
            disabled={loadingSamples}
            className="rounded-lg border border-primary-500 text-primary-600 px-4 py-2 text-sm font-medium hover:bg-primary-50 disabled:opacity-50"
          >
            {loadingSamples ? 'Cargando…' : 'Cargar datos de ejemplo'}
          </button>
        </div>
        <Dropzone onFile={handleFile} />
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {processed && (
          <div className="mt-3 rounded-lg bg-success-100 border border-green-200 px-3 py-2 text-sm text-green-700">
            Datos procesados correctamente. Revisá Analítica y Simulador.
          </div>
        )}
        {debugInfo && (
          <div className="mt-4 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-200/60">
              <h4 className="text-sm font-semibold text-slate-800">Conteos por estado (TripResult)</h4>
            </div>
            <div className="p-3 flex flex-wrap gap-4 text-sm">
              <span>VALID_IDEAL: <strong>{debugInfo.counts.VALID_IDEAL}</strong></span>
              <span>VALID_ACCEPTABLE: <strong>{debugInfo.counts.VALID_ACCEPTABLE}</strong></span>
              <span>VALID_NO_DISCHARGE: <strong>{debugInfo.counts.VALID_NO_DISCHARGE}</strong></span>
              <span className="text-red-700">INVALID: <strong>{debugInfo.counts.INVALID}</strong></span>
            </div>
            {debugInfo.invalidExamples.length > 0 && (
              <>
                <div className="p-2 border-t border-slate-200 bg-slate-200/40">
                  <h5 className="text-xs font-semibold text-slate-700">Top 5 inválidos (visitKey, visitId, plate, status, pathDisplay, explanation, flags)</h5>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-200/30">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-600">visitKey / visitId</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-600">plate</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-600">pathDisplay</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-600">explanation</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-600">flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugInfo.invalidExamples.map((ex, i) => (
                        <tr key={i} className="border-t border-slate-200">
                          <td className="px-2 py-1.5 text-slate-700 font-mono">{ex.visitId}</td>
                          <td className="px-2 py-1.5 text-slate-600">{ex.plate}</td>
                          <td className="px-2 py-1.5 text-slate-600 font-mono max-w-[120px] truncate" title={ex.pathDisplay}>{ex.pathDisplay}</td>
                          <td className="px-2 py-1.5 text-slate-600 max-w-[200px] truncate" title={ex.explanation}>{ex.explanation}</td>
                          <td className="px-2 py-1.5 text-slate-500 max-w-[150px] truncate" title={ex.flags}>{ex.flags}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {parsed && (
        <>
          <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Vista previa (10 filas)</h3>
              <span className="text-xs text-slate-500">{parsed.fileName} · {parsed.rows.length} filas</span>
            </div>
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-700 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-slate-600 whitespace-nowrap max-w-[200px] truncate">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-6">
            {autoMappingDetected && (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                Mapeo detectado automáticamente (event stream). Podés ajustar columnas abajo si hace falta.
              </div>
            )}
            <ColumnMapper headers={parsed.headers} mapping={mapping} onChange={setMapping} />

            {!validation.valid && validation.errors.length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">
                {validation.errors.map((msg, i) => (
                  <p key={i}>{msg}</p>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
              <div className="p-2 border-b border-slate-200">
                <h4 className="text-xs font-semibold text-slate-600">Preview (10 filas) — Fecha parseada · Evento · ID visita · Patente</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-slate-600">Fecha/hora (parseado)</th>
                      <th className="px-3 py-1.5 text-left font-medium text-slate-600">Evento</th>
                      <th className="px-3 py-1.5 text-left font-medium text-slate-600">ID visita</th>
                      <th className="px-3 py-1.5 text-left font-medium text-slate-600">Patente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-slate-500 text-xs">Elegí Fecha/hora y Evento en el mapeo para ver el preview.</td>
                      </tr>
                    ) : (
                      validation.previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700 font-mono text-xs whitespace-nowrap">{row.occurredAt}</td>
                          <td className="px-3 py-1.5 text-slate-700 truncate max-w-[200px]">{row.eventType}</td>
                          <td className="px-3 py-1.5 text-slate-600 truncate max-w-[120px]">{row.visitId}</td>
                          <td className="px-3 py-1.5 text-slate-600 truncate max-w-[100px]">{row.plate}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleProcess}
                disabled={!validation.valid}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Procesar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
