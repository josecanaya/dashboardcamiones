import type { DssReferenceMetrics } from './powerBiCommitteeExecutive'

const KEY_ALIASES: Record<string, keyof DssReferenceMetrics> = {
  ingreso_frontal: 'ingreso_frontal',
  ingresos_frontales: 'ingreso_frontal',
  ingreso_operativo: 'ingreso_operativo',
  ingresos_operativos: 'ingreso_operativo',
  journeys: 'journeys',
  journey: 'journeys',
  circuitos_finales: 'circuitos_finales',
  circuitos_completos: 'circuitos_completos',
  circuitos_probables: 'circuitos_probables',
}

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Parsea CSV simple DSS: metric_key o metric_label + dss_count */
export function parseDssReferenceCsv(text: string): {
  metrics: DssReferenceMetrics
  errors: string[]
} {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const errors: string[] = []
  const metrics: DssReferenceMetrics = {}
  if (lines.length < 2) {
    return { metrics, errors: ['El CSV debe tener encabezado y al menos una fila.'] }
  }

  const headers = lines[0].split(/[,;]/).map((h) => normKey(h))
  const keyCol = headers.findIndex((h) => h === 'metric_key' || h === 'metric_label' || h === 'metric')
  const valCol = headers.findIndex((h) => h === 'dss_count' || h === 'valor' || h === 'count' || h === 'cantidad')

  if (keyCol < 0 || valCol < 0) {
    return {
      metrics,
      errors: ['Encabezados requeridos: metric_key (o metric_label) y dss_count.'],
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/)
    const rawKey = cols[keyCol]?.trim() ?? ''
    const rawVal = cols[valCol]?.trim() ?? ''
    const n = Number(rawVal.replace(/\s/g, ''))
    if (!rawKey) continue
    const mapped = KEY_ALIASES[normKey(rawKey)]
    if (!mapped) {
      errors.push(`Fila ${i + 1}: clave desconocida «${rawKey}».`)
      continue
    }
    if (!Number.isFinite(n)) {
      errors.push(`Fila ${i + 1}: valor no numérico «${rawVal}».`)
      continue
    }
    metrics[mapped] = n
  }

  return { metrics, errors }
}
