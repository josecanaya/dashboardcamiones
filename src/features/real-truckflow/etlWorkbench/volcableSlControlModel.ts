/**
 * Control dedicado del volcable de San Lorenzo: por calle (VOLCABLE_PTO_1…5), cuántos camiones que
 * el Excel dice que descargaron ahí (filas INGRESO) fueron efectivamente leídos por la cámara de esa
 * calle (SLZVolcableC1…5) y cuáles NO registró (para control DSS).
 *
 * Señal limpia: el universo son SOLO los camiones de volcable (no todo R7), así no hay ruido de
 * camiones que descargaron en otro punto. Deriva de los `detailRows` de R7 ya calculados
 * (`captures['volcable_slz']`) cruzados por CTG|patente contra las filas INGRESO del Excel.
 */
import type { CircuitCameraComparativa } from './excelCameraComparativaWorkbench'
import {
  filterVolcableSlIngresoMovimientos,
  sanLorenzoVolcableCalleFromPlatform,
} from './etlSanLorenzoVolcableActivity'
import { extractCtgFromOperationId } from './auditExcelCameraMatrix'
import {
  movimientoInSalidaDayRange,
  type MovimientoContratoLike,
} from './auditExcelMovimientosSource'

export type VolcableNoLeidoRow = {
  ctg: string
  patente: string
  ingreso: string
  salida: string
  /** true si el camión está en el universo R7 auditado (tiene detalle de cámara). */
  enUniverso: boolean
}

export type VolcableCalleControl = {
  calle: string
  device: string
  totalExcel: number
  leidosCamara: number
  noLeidos: number
  pctLeido: number
  noLeidosSample: VolcableNoLeidoRow[]
}

export type VolcableSlControlModel = {
  totalExcel: number
  leidosCamara: number
  noLeidos: number
  pctLeido: number
  /** Filas INGRESO volcable sin calle detectable en la plataforma. */
  sinCalle: number
  calles: VolcableCalleControl[]
}

const NO_LEIDO_SAMPLE_CAP = 100

function pctLeido(leidos: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((leidos / total) * 10000) / 100
}

function calleNumber(calle: string): string {
  const m = calle.match(/(\d+)/)
  return m ? m[1]! : ''
}

/**
 * @param r7 Comparativa del circuito R7 (universo volcable). Si falta, no hay lectura de cámara.
 * @param movimientos Movimientos por contrato parseados del Excel normalizado.
 * @param range Ventana de egreso para alinear con el universo auditado.
 */
export function buildVolcableSlControlModel(
  r7: CircuitCameraComparativa | null | undefined,
  movimientos: readonly MovimientoContratoLike[],
  range?: { fromDay?: string; toDay?: string }
): VolcableSlControlModel {
  // Captura de cámara por camión (ctg|patente) desde el detalle R7 ya auditado.
  const captureByKey = new Map<string, boolean>()
  for (const dr of r7?.calibration.detailRows ?? []) {
    captureByKey.set(`${dr.ctg}|${dr.patente}`, Boolean(dr.captures['volcable_slz']))
  }

  const volMovs = filterVolcableSlIngresoMovimientos(movimientos).filter((m) =>
    movimientoInSalidaDayRange(m, range?.fromDay, range?.toDay)
  )

  const byCalle = new Map<string, VolcableCalleControl>()
  const seen = new Set<string>()
  let sinCalle = 0

  for (const m of volMovs) {
    const calle = sanLorenzoVolcableCalleFromPlatform(m.platform_normalized || m.plataforma_original)
    if (!calle) {
      sinCalle += 1
      continue
    }
    // Misma clave que arma `movimientoToExcelOperation`: ctg canónico + patente trim (sin upper).
    const plate = String(m.plate_normalized ?? '').trim()
    if (!plate) continue
    const ctg = extractCtgFromOperationId(String(m.external_operation_id ?? ''), m.ctg)
    const key = `${ctg}|${plate}`
    if (seen.has(key)) continue // una fila por camión
    seen.add(key)

    let entry = byCalle.get(calle)
    if (!entry) {
      entry = {
        calle,
        device: `SLZVolcableC${calleNumber(calle)}`,
        totalExcel: 0,
        leidosCamara: 0,
        noLeidos: 0,
        pctLeido: 0,
        noLeidosSample: [],
      }
      byCalle.set(calle, entry)
    }

    entry.totalExcel += 1
    const enUniverso = captureByKey.has(key)
    const leido = captureByKey.get(key) === true
    if (leido) {
      entry.leidosCamara += 1
    } else {
      entry.noLeidos += 1
      if (entry.noLeidosSample.length < NO_LEIDO_SAMPLE_CAP) {
        entry.noLeidosSample.push({
          ctg,
          patente: plate,
          ingreso: String(m.external_ingreso_at ?? '').trim(),
          salida: String(m.external_salida_at ?? '').trim(),
          enUniverso,
        })
      }
    }
  }

  const calles = [...byCalle.values()]
    .map((c) => ({ ...c, pctLeido: pctLeido(c.leidosCamara, c.totalExcel) }))
    .sort((a, b) => a.calle.localeCompare(b.calle, 'es', { numeric: true }))

  const totalExcel = calles.reduce((a, c) => a + c.totalExcel, 0)
  const leidosCamara = calles.reduce((a, c) => a + c.leidosCamara, 0)

  return {
    totalExcel,
    leidosCamara,
    noLeidos: totalExcel - leidosCamara,
    pctLeido: pctLeido(leidosCamara, totalExcel),
    sinCalle,
    calles,
  }
}
