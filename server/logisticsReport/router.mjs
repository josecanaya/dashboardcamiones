/**
 * Endpoint del informe de logística: recibe el paquete que calculó el dashboard, escribe el
 * Excel del período y deja el control de la corrida junto a él.
 *
 * Cada ejecución crea una **revisión nueva**: nunca pisa un informe anterior ni la plantilla.
 * Layout:
 *
 * ```
 * reportes/logistica/<from>_<to>/
 *   revision-001/
 *     Datos.xlsx        ← entrada de actualizar.py
 *     paquete.json      ← datos calculados, con su procedencia
 *     control.json      ← período, corridas, rulesVersion, cobertura, pendientes
 *   ULTIMA.txt          ← ruta de la última revisión
 * ```
 */
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DAY_RE, RevisionError, writeReportRevision } from './reportRevision.mjs'

export function createLogisticsReportRouter({ projectRoot }) {
  const router = express.Router()
  const reportsRoot = path.join(projectRoot, 'reportes', 'logistica')

  /** Genera una revisión nueva del informe para el período del paquete. */
  router.post('/api/reportes/logistica', async (req, res) => {
    try {
      const r = await writeReportRevision({ projectRoot, pkg: req.body?.paquete })
      const { control: _control, ...respuesta } = r
      return res.json(respuesta)
    } catch (err) {
      if (err instanceof RevisionError) {
        return res.status(err.status).json({ error: err.code, detail: err.detail ?? undefined })
      }
      return res.status(500).json({ error: 'write_failed', detail: String(err?.message ?? err) })
    }
  })

  /** Lista las revisiones guardadas de un período. */
  router.get('/api/reportes/logistica', async (req, res) => {
    const from = String(req.query.from ?? '')
    const to = String(req.query.to ?? '')
    if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
      return res.status(400).json({ error: 'invalid_period' })
    }
    const periodDir = path.join(reportsRoot, `${from}_${to}`)
    let entries = []
    try {
      entries = await fs.readdir(periodDir)
    } catch {
      return res.json({ periodo: { from, to }, revisiones: [] })
    }
    const revisiones = []
    for (const e of entries.filter((x) => /^revision-\d+$/.test(x)).sort()) {
      let control = null
      try {
        control = JSON.parse(await fs.readFile(path.join(periodDir, e, 'control.json'), 'utf8'))
      } catch {
        control = null
      }
      revisiones.push({
        nombre: e,
        dir: path.join(periodDir, e),
        xlsxPath: path.join(periodDir, e, 'Datos.xlsx'),
        generadoEl: control?.generadoEl ?? null,
        cobertura: control?.cobertura ?? null,
        pendientes: control?.pendientes?.length ?? null,
      })
    }
    return res.json({ periodo: { from, to }, revisiones })
  })

  return router
}
