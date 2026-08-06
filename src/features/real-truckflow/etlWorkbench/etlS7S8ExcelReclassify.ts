/**
 * Reconciliación excel-first de los recorridos que pasan por las cámaras nuevas
 * S7/S8 (Ricardone) y que la clasificación lado-cámara no puede resolver sola.
 *
 * Contexto: un recorrido con calada + balanzas + un punto S7/S8 (DESCARGA_S7,
 * CARGA_S7, CARGA_S8) pero SIN cámara de silo (Celda 16 / Volcable) cae a
 * `RS_REC`/`RS_DESP` en `finalCircuitScoring` porque no hay strong-point que
 * mapee a un R-code. La cámara sola NO alcanza para decidir R3 vs R4 (ni el
 * resto): esa distinción la da la PLATAFORMA del Excel operativo (igual que R7).
 *
 * Por eso la reconciliación es **excel-first**: se arma un mapa
 * patente → circuito inferido desde la plataforma (`inferCircuitFromExternalMovimiento`)
 * y, para un recorrido RS_REC/RS_DESP que pasó por S7/S8, se toma el circuito del
 * Excel. Si el Excel no lo resuelve, el recorrido queda como estaba (no se adivina).
 *
 * Módulo leaf: solo depende de la inferencia por plataforma y del tipo de mov.
 */
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'

/** Puntos lógicos de las cámaras nuevas S7/S8 que habilitan la reconciliación. */
export const S7S8_GATE_POINTS = new Set(['DESCARGA_S7', 'CARGA_S7', 'CARGA_S8'])

/**
 * Circuitos ejecutivos que un recorrido S7/S8 puede tomar. Se limita a los
 * destinos plausibles de esas cámaras (silos Kepler + transiles + carga Chief)
 * para no reasignar por error a un circuito que no corresponde al punto físico.
 */
export const S7S8_TARGET_CIRCUITS = new Set([
  'R3',
  'R4',
  'R11',
  'R12',
  'R21',
  'R22',
  'R23',
  'R24',
])

/** Códigos ejecutivos lado-cámara "sin destino resuelto" que se reconcilian. */
export const S7S8_RECONCILABLE_CODES = new Set(['RS_REC', 'RS_DESP', 'SIN_PUNTO'])

type MovForPlateMap = Pick<
  ExternalMovimientoContratoNormalized,
  'plate_normalized' | 'patente_original'
> &
  Parameters<typeof inferCircuitFromExternalMovimiento>[0]

/**
 * Mapa patente → circuito ejecutivo (excel-first) construido desde los movimientos
 * del Excel. Solo retiene circuitos dentro de {@link S7S8_TARGET_CIRCUITS}; ante
 * varias plataformas para la misma patente, gana la de mayor frecuencia.
 */
export function buildS7S8CircuitByPlate(
  movs: readonly MovForPlateMap[] | null | undefined
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const mov of movs ?? []) {
    const plate = normalizePlateStrict(String(mov.plate_normalized ?? mov.patente_original ?? ''))
    if (!plate) continue
    const inferred = inferCircuitFromExternalMovimiento(mov)
    const code = inferred?.circuit_code
    if (!code || !S7S8_TARGET_CIRCUITS.has(code)) continue
    let byCode = counts.get(plate)
    if (!byCode) {
      byCode = new Map<string, number>()
      counts.set(plate, byCode)
    }
    byCode.set(code, (byCode.get(code) ?? 0) + 1)
  }

  const out = new Map<string, string>()
  for (const [plate, byCode] of counts) {
    let bestCode = ''
    let bestCount = -1
    for (const [code, count] of byCode) {
      if (count > bestCount) {
        bestCount = count
        bestCode = code
      }
    }
    if (bestCode) out.set(plate, bestCode)
  }
  return out
}

/**
 * Circuito excel-first para un recorrido RS_REC/RS_DESP que pasó por S7/S8.
 * Devuelve el R-code del Excel, o `null` si no aplica (no es reconciliable, no
 * pasó por S7/S8, o el Excel no tiene la patente). No adivina: sin Excel, `null`.
 */
export function resolveS7S8ExcelFirstCircuitCode(input: {
  currentExecutiveCode: string
  logicalCodes: Iterable<string>
  plate: string
  circuitByPlate: Map<string, string>
}): string | null {
  if (!S7S8_RECONCILABLE_CODES.has(input.currentExecutiveCode)) return null
  let passedS7S8 = false
  for (const code of input.logicalCodes) {
    if (S7S8_GATE_POINTS.has(String(code))) {
      passedS7S8 = true
      break
    }
  }
  if (!passedS7S8) return null
  const plate = normalizePlateStrict(input.plate)
  if (!plate) return null
  return input.circuitByPlate.get(plate) ?? null
}
