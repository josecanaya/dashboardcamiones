/**
 * Índice patente → horas de calado registradas en el Excel de Movimientos por Contrato.
 * Alimenta la regla de oro R12 (`VOLCABLE_SIN_CALADA_RIC`).
 *
 * Por qué existe: R12 mide una **doble ausencia** — el camión descargó en el volcable de
 * Ricardone (evento positivo), la cámara `RicCal*` no lo vio (silencio de una fuente) Y el
 * operario de balanza tampoco anotó la hora de calado en el Excel (silencio de la otra).
 * Sin cruzar contra el Excel, la cámara sola daba ~29 falsos positivos por semana: el 93 %
 * de los «sin calada» tenían hora de calado registrada por el operario y eran fallas de OCR
 * (patente confundida con la marca «SCANIA» o «IVECO», caracteres mal leídos, luces altas,
 * verificado manualmente el 2026-09-10).
 *
 * Solo se retienen los movimientos con `external_calado_at` no vacío: si el Excel no anotó
 * la hora, esa fila no aporta evidencia positiva del calado y por eso no cuenta como cruce
 * a favor.
 *
 * Módulo leaf: solo depende del tipo del movimiento normalizado y del parser de fechas.
 */
import type { DeclaredCaladaMovement } from '../../../etl-core/domain/goldenAnomalyRules'
import { parseTimestampMs } from '../../../etl-core/domain/timestamps'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'

type MovForCaladaIndex = {
  plate_normalized?: string
  patente_original?: string
  external_calado_at?: string
}

/**
 * Mapa patente → horas de calado registradas por el operario, ordenadas por instante.
 */
export function buildDeclaredCaladaMovementsByPlate(
  movs: readonly MovForCaladaIndex[] | null | undefined
): Map<string, DeclaredCaladaMovement[]> {
  const out = new Map<string, DeclaredCaladaMovement[]>()
  for (const mov of movs ?? []) {
    const raw = String(mov.external_calado_at ?? '').trim()
    if (!raw) continue
    const caladoMs = parseTimestampMs(raw)
    if (!Number.isFinite(caladoMs)) continue
    const plate = normalizePlateStrict(String(mov.plate_normalized ?? mov.patente_original ?? ''))
    if (!plate) continue
    const list = out.get(plate)
    if (list) list.push({ caladoMs })
    else out.set(plate, [{ caladoMs }])
  }
  for (const list of out.values()) list.sort((a, b) => a.caladoMs - b.caladoMs)
  return out
}
