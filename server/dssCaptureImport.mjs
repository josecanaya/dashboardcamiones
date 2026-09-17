// Importa capturas de patente ya exportadas por DSS Client (Vehicle Search →
// Export). El flujo manual que reemplaza:
//
//   1. Persona: en DSS Client, busca un vehículo/patente y exporta el recorrido
//      → queda un .zip en la carpeta de exportación (por defecto
//      `C:\Users\Public\DSS Client\`) con dos fotos por parada (Plate Image +
//      Scene Image) y un .xlsx que mapea cada foto a Device Name + Capture Time.
//   2. Esta pieza: lee esos .zip, y el cliente (Anomalías) cruza cada fila por
//      `deviceCode` + hora contra el recorrido del camión y escribe la foto en
//      el mismo IndexedDB que ya usa la carga manual (arrastrar y soltar). El
//      componente que la muestra (`CameraSlot`) no cambia: sigue leyendo por su
//      storageKey de siempre, sea cual sea el origen de la imagen.
//
// Por qué el paso 1 sigue siendo manual: DSS no expone la búsqueda de vehículo
// por API en este build (ver docs/POC_DSS_LIVE.md — varios endpoints del mismo
// namespace no están disponibles). Un export amplio (todas las patentes, sin
// filtro) SÍ es posible, pero DSS lo devuelve sin fotos ni hora real (columnas
// vacías, Capture Time en 00:00:00) — no sirve como fuente de evidencia. Solo
// el export acotado (una patente, o una búsqueda puntual) trae las fotos.
//
// Formato de archivo: sin dependencias nuevas — `fflate` (zip) y `xlsx` (hoja)
// ya son dependencias del proyecto.

import fs from 'node:fs'
import path from 'node:path'
import { unzipSync } from 'fflate'
import * as XLSX from 'xlsx'

/** Carpeta donde DSS Client deja los .zip exportados (configurable por env). */
const DEFAULT_EXPORT_DIR = 'C:\\Users\\Public\\DSS Client'

const EXPECTED_HEADER = [
  'Device Name',
  'Channel Id',
  'Channel Name',
  'Organization',
  'Plate No.',
  'Confidence Level',
]

/** @typedef {{ deviceName: string, plate: string, captureTimeIso: string, plateImage: string, sceneImage: string }} CaptureRow */

/** Convierte "2026-09-11 22:12:57" (hora local de la planta, -03:00) a ISO real. */
function toIsoArgentina(sheetDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(sheetDate ?? '').trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s}-03:00`
}

/**
 * Lee un .zip de export y devuelve sus filas con foto (las que no tienen
 * `Capture Image` completo se descartan: son de un export amplio sin fotos,
 * no de un recorrido puntual, y no hay nada útil que mostrar).
 * @param {Buffer} zipBuffer
 * @returns {CaptureRow[]}
 */
function parseCaptureZip(zipBuffer) {
  const entries = unzipSync(new Uint8Array(zipBuffer))
  const xlsxName = Object.keys(entries).find((n) => n.toLowerCase().endsWith('.xlsx'))
  if (!xlsxName) return []

  const wb = XLSX.read(entries[xlsxName], { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const header = (rows[0] ?? []).map(String)
  if (EXPECTED_HEADER.some((col) => !header.includes(col))) return []

  const idx = (col) => header.indexOf(col)
  const iDevice = idx('Device Name')
  const iPlate = idx('Plate No.')
  const iPlateImg = idx('Plate Image')
  const iCaptureImg = idx('Capture Image')
  const iTime = idx('Capture Time')

  /** @type {CaptureRow[]} */
  const out = []
  for (const r of rows.slice(1)) {
    const plateImage = String(r[iPlateImg] ?? '').trim()
    const sceneImage = String(r[iCaptureImg] ?? '').trim()
    if (!plateImage && !sceneImage) continue // export amplio: sin fotos, no sirve
    if (!entries[plateImage] && !entries[sceneImage]) continue // filas del manifiesto sin archivo real en el zip
    const iso = toIsoArgentina(r[iTime])
    if (!iso) continue
    out.push({
      deviceName: String(r[iDevice] ?? '').trim(),
      plate: String(r[iPlate] ?? '').trim().toUpperCase(),
      captureTimeIso: iso,
      plateImage,
      sceneImage,
    })
  }
  return out
}

export function createDssCaptureImportRouter({ exportDir } = {}) {
  const dir = exportDir || process.env.DSS_CAPTURE_EXPORT_DIR?.trim() || DEFAULT_EXPORT_DIR

  /** @type {Map<string, { mtimeMs: number, size: number, rows: CaptureRow[] }>} */
  const cache = new Map()

  function listZips() {
    let names
    try {
      names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.zip'))
    } catch {
      return []
    }
    return names
  }

  /** Relee y parsea solo los .zip nuevos o modificados desde la última vez. */
  function refreshCache() {
    const seen = new Set()
    for (const name of listZips()) {
      seen.add(name)
      const full = path.join(dir, name)
      let stat
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      const cached = cache.get(name)
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) continue
      try {
        const rows = parseCaptureZip(fs.readFileSync(full))
        cache.set(name, { mtimeMs: stat.mtimeMs, size: stat.size, rows })
      } catch (e) {
        console.warn(`[dss-capture-import] no se pudo leer ${name}: ${e.message}`)
      }
    }
    // Zips borrados: sacarlos de la caché para no ofrecer imágenes que ya no están.
    for (const name of [...cache.keys()]) if (!seen.has(name)) cache.delete(name)
  }

  /** GET /api/truckflow/dss-captures/list — filas con foto de todos los .zip disponibles. */
  function list(req, res) {
    refreshCache()
    const out = []
    for (const [zip, entry] of cache) {
      for (const row of entry.rows) out.push({ zip, ...row })
    }
    res.json({ exportDir: dir, zipCount: cache.size, rows: out })
  }

  /** GET /api/truckflow/dss-captures/image?zip=...&file=... — bytes crudos de una foto. */
  function image(req, res) {
    const { zip, file } = req.query
    if (!zip || !file || typeof zip !== 'string' || typeof file !== 'string') {
      return res.status(400).json({ error: 'faltan parámetros zip/file' })
    }
    // Nombre de archivo, no de ruta: sin separadores, para no salir de la carpeta configurada.
    if (zip.includes('/') || zip.includes('\\') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ error: 'nombre de archivo inválido' })
    }
    const full = path.join(dir, zip)
    let buf
    try {
      buf = fs.readFileSync(full)
    } catch {
      return res.status(404).json({ error: `no se encontró ${zip} en ${dir}` })
    }
    let entries
    try {
      entries = unzipSync(new Uint8Array(buf), { filter: (e) => e.name === file })
    } catch (e) {
      return res.status(500).json({ error: `zip corrupto o ilegible: ${e.message}` })
    }
    const bytes = entries[file]
    if (!bytes) return res.status(404).json({ error: `${file} no está en ${zip}` })
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=86400') // el zip no cambia una vez exportado
    res.send(Buffer.from(bytes))
  }

  return { list, image }
}
