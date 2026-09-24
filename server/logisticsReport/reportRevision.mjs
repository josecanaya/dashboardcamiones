/**
 * Escritura de una revisión del informe de logística.
 *
 * La usan el endpoint del dashboard (`router.mjs`) y el armado sin navegador
 * (`scripts/build-report-package.ts`). Está en un solo lugar para que las dos vías produzcan
 * exactamente la misma revisión: mismo Excel, mismo control, mismo `ULTIMA.txt`.
 *
 * Cada llamada crea una revisión NUEVA: nunca pisa un informe anterior ni la plantilla.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { aplicarExclusiones, buildReportWorkbook } from './reportWorkbook.mjs'

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Rutas fijas del informe dentro del proyecto. */
export function reportPaths(projectRoot) {
  const reportsRoot = path.join(projectRoot, 'reportes', 'logistica')
  return {
    reportsRoot,
    templatePath: path.join(reportsRoot, 'prueba_manual', 'Datos_MANUAL.xlsx'),
    vinculosPath: path.join(reportsRoot, 'prueba_manual', 'vinculos.json'),
  }
}

export async function nextRevisionDir(periodDir) {
  let entries = []
  try {
    entries = await fs.readdir(periodDir)
  } catch {
    entries = []
  }
  let max = 0
  for (const e of entries) {
    const m = e.match(/^revision-(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const n = max + 1
  return { name: `revision-${String(n).padStart(3, '0')}`, number: n }
}

/** Error con código estable, para que el endpoint responda el mismo status que antes. */
export class RevisionError extends Error {
  constructor(code, detail, status = 500) {
    super(detail ?? code)
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/**
 * Valida el paquete, arma el Excel y escribe la revisión con su control.
 *
 * Devuelve lo mismo que respondía el endpoint, más `control` completo.
 */
export async function writeReportRevision({ projectRoot, pkg: paqueteRecibido }) {
  let pkg = paqueteRecibido
  if (!pkg || typeof pkg !== 'object') throw new RevisionError('missing_paquete', null, 400)
  const from = String(pkg.periodo?.from ?? '')
  const to = String(pkg.periodo?.to ?? '')
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) {
    throw new RevisionError('invalid_period', `${from} → ${to}`, 400)
  }

  const { reportsRoot, templatePath, vinculosPath } = reportPaths(projectRoot)
  try {
    await fs.access(templatePath)
  } catch {
    throw new RevisionError('template_missing', templatePath)
  }

  const periodDir = path.join(reportsRoot, `${from}_${to}`)
  const { name: revisionName, number: revisionNumber } = await nextRevisionDir(periodDir)
  const revisionDir = path.join(periodDir, revisionName)

  // Días descartados del período (decisión editorial, con motivo): mismo criterio que el sync.
  let exclusiones = []
  try {
    exclusiones = JSON.parse(await fs.readFile(path.join(periodDir, 'exclusiones.json'), 'utf8'))
  } catch {
    exclusiones = []
  }
  pkg = aplicarExclusiones(pkg, exclusiones)

  let built
  try {
    built = await buildReportWorkbook({ templatePath, vinculosPath, pkg })
  } catch (err) {
    // Un fallo del exportador NO invalida el procesamiento: se informa y el dashboard
    // conserva su resultado.
    throw new RevisionError('export_failed', String(err?.message ?? err))
  }

  try {
    await fs.mkdir(revisionDir, { recursive: true })
    const xlsxPath = path.join(revisionDir, 'Datos.xlsx')
    await fs.writeFile(xlsxPath, built.buffer)
    // Se guarda el paquete tal como lo calculó el dashboard: las exclusiones se aplican al
    // leerlo, así una revisión no queda con el día borrado y el criterio se puede revisar.
    await fs.writeFile(path.join(revisionDir, 'paquete.json'), JSON.stringify(paqueteRecibido, null, 2), 'utf8')
    const control = {
      generadoEl: new Date().toISOString(),
      revision: revisionNumber,
      periodo: pkg.periodo,
      fuentes: pkg.fuentes,
      politicaDia: pkg.controles?.politicaDia,
      cobertura: {
        graficos: {
          total: built.detalle.graficos.total,
          completados: built.detalle.graficos.completados.length,
          pendientes: built.detalle.graficos.pendientes.length,
          conservadosHistoricos: built.detalle.graficos.conservados.length,
        },
        textos: built.detalle.textos,
      },
      pendientes: [
        ...(pkg.controles?.pendientes ?? []),
        ...built.detalle.graficos.pendientes.map((p) => ({ id: p.id, reason: p.reason, slide: p.slide })),
      ],
      advertencias: pkg.controles?.advertencias ?? [],
      exclusiones,
      graficos: built.detalle.graficos,
      estado: 'para_revision_del_usuario',
    }
    await fs.writeFile(path.join(revisionDir, 'control.json'), JSON.stringify(control, null, 2), 'utf8')
    await fs.writeFile(path.join(periodDir, 'ULTIMA.txt'), `${revisionDir}\n`, 'utf8')

    return {
      ok: true,
      periodo: { from, to },
      revision: revisionNumber,
      revisionDir,
      xlsxPath,
      controlPath: path.join(revisionDir, 'control.json'),
      cobertura: control.cobertura,
      pendientes: control.pendientes,
      advertencias: control.advertencias,
      control,
    }
  } catch (err) {
    throw new RevisionError('write_failed', String(err?.message ?? err))
  }
}
