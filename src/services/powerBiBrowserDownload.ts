/**
 * Capa: exportación Power BI — descargas en navegador (DOM / Blob / File System Access).
 * Importar solo desde UI; CLI debe usar powerBiEtlExportBuilder + fs.
 */

import {
  buildPowerBiZipDownloadName,
  zipPowerBiNamedCsvSync,
  type PowerBiNamedCsv,
  type PowerBiZipFilenameVariant,
} from './powerBiEtlExportBuilder'

export type TriggerPowerBiZipDownloadOptions = {
  variant?: PowerBiZipFilenameVariant
  /** Si se define, prevalece sobre `variant`. */
  zipFilename?: string
}

function triggerAnchorDownloadZip(zipped: Uint8Array, downloadName: string): void {
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/**
 * Un solo archivo CSV (`<a download>`). Pensado para navegadores que bloquean varias descargas simultáneas.
 */
export function triggerSinglePowerBiCsvDownload(file: PowerBiNamedCsv): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 180_000)
}

/**
 * Dispara todas las descargas en **un mismo turno síncrono** dentro del handler de `click` del usuario.
 * Si se llama tras un `await` (microtarea/async), Chromium suele bloquear descargas automáticas: para comité usar
 * «preparar» en un clic y este método en **otro clic** siguiente.
 *
 * Revoca cada `blob:` tras un tiempo prudencial (la descarga sigue activa por el mismo origen hasta completarse).
 */
export function triggerCommitteeCsvDownloadsSync(files: PowerBiNamedCsv[]): void {
  if (typeof window === 'undefined') return
  if (files.length === 0) return

  for (const f of files) {
    triggerSinglePowerBiCsvDownload(f)
  }
}

/**
 * Un único archivo ZIP por export. Preferimos `showSaveFilePicker` cuando existe (Chrome/Edge):
 * permite guardar tras compilar el ZIP sin políticas antisíncronos de las descargas automáticas.
 * Otros navegadores: fallback con `<a download>` (podría estar bloqueado según configuración).
 * @param opts `variant`: prefijo del nombre del ZIP (`committee` por defecto en descargas genéricas).
 */
export async function triggerBrowserDownloadsSequential(
  files: PowerBiNamedCsv[],
  opts?: TriggerPowerBiZipDownloadOptions
): Promise<void> {
  if (typeof window === 'undefined') return

  const downloadName = opts?.zipFilename ?? buildPowerBiZipDownloadName(new Date(), opts?.variant ?? 'committee')

  const wf = typeof window !== 'undefined' ? (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> }) : null

  if (wf && typeof wf.showSaveFilePicker === 'function') {
    try {
      const handle = await wf.showSaveFilePicker({
        suggestedName: downloadName,
        types: [{ description: 'ZIP — Power BI ETL', accept: { 'application/zip': ['.zip'] } }],
      })
      const zipped = zipPowerBiNamedCsvSync(files)
      const writable = await handle.createWritable()
      await writable.write(zipped)
      await writable.close()
      return
    } catch (e) {
      const name = (e as { name?: string })?.name
      if (name === 'AbortError') return
    }
  }

  const zipped = zipPowerBiNamedCsvSync(files)
  triggerAnchorDownloadZip(zipped, downloadName)
}

/** Alias: ZIP modo debug (`powerbi-etl-debug_…`). */
export async function triggerPowerBiDebugDownloadsSequential(files: PowerBiNamedCsv[]): Promise<void> {
  return triggerBrowserDownloadsSequential(files, { variant: 'debug' })
}

/**
 * Genera ZIP y dispara descarga en el mismo turno síncrono (conserva user activation).
 * Preferible al flujo asíncrono con `triggerPowerBiDebugDownloadsSequential` dentro de handlers que ya hicieron `await`.
 */
export function downloadPowerBiNamedCsvZipSync(
  files: PowerBiNamedCsv[],
  opts?: TriggerPowerBiZipDownloadOptions
): void {
  if (typeof window === 'undefined') return
  const zipped = zipPowerBiNamedCsvSync(files)
  const downloadName =
    opts?.zipFilename ?? buildPowerBiZipDownloadName(new Date(), opts?.variant ?? 'committee')
  triggerAnchorDownloadZip(zipped, downloadName)
}
