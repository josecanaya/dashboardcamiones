/**
 * Índice patente → plataforma declarada en el Excel, con la ventana temporal del
 * movimiento. Alimenta la regla de oro R11 (`PLATAFORMA_DISTINTA_A_DECLARADA`).
 *
 * Por qué existe: R11 es la única regla del set que cruza DOS fuentes independientes
 * (Excel de Movimientos por Contrato ↔ cámara de la calle del volcable). Para poder
 * compararlas hace falta saber, para cada paso de cámara, cuál era el movimiento del
 * Excel vigente en ese momento — no alcanza con la patente, porque una misma patente
 * hace varios viajes por día y puede tener declarada una calle distinta en cada uno.
 * Por eso el índice guarda la ventana `[external_ingreso_at, external_salida_at]` y la
 * regla elige el movimiento que cubre el evento observado.
 *
 * Solo se retienen los movimientos con plataforma `VOLCABLE_PTO_1..5`: son los únicos
 * donde el Excel declara un punto físico que la cámara distingue por device
 * (`SLZVolcableC1..5`). El resto de las plataformas no tiene cámara por calle, así que
 * una comparación no probaría nada.
 *
 * Los movimientos «de la vuelta» (`es_de_vuelta`) quedan afuera (pedido 2026-09-09): en
 * la pata de vuelta la plataforma declarada no describe dónde descarga ese camión, así
 * que compararla contra la cámara no prueba una contradicción real.
 *
 * Módulo leaf: solo depende del tipo del movimiento normalizado y del parser de fechas.
 */
import type { DeclaredPlatformMovement } from '../../../etl-core/domain/goldenAnomalyRules'
import { parseTimestampMs } from '../../../etl-core/domain/timestamps'
import { normalizePlateStrict } from '../../../services/circuitPlateOcr'

type MovForPlatformIndex = {
  plate_normalized?: string
  patente_original?: string
  platform_normalized?: string
  external_ingreso_at?: string
  external_salida_at?: string
  es_de_vuelta?: boolean | string
}

/** Plataformas comparables contra cámara: el volcable de puerto, calle por calle. */
const COMPARABLE_PLATFORM = /^VOLCABLE_PTO_[1-5]$/

/**
 * Mapa patente → movimientos con plataforma declarada comparable, ordenados por
 * inicio. Un movimiento sin hora de ingreso no entra: sin ventana no se puede
 * atribuir un evento de cámara sin riesgo de cruzar viajes distintos.
 */
export function buildDeclaredPlatformMovementsByPlate(
  movs: readonly MovForPlatformIndex[] | null | undefined
): Map<string, DeclaredPlatformMovement[]> {
  const out = new Map<string, DeclaredPlatformMovement[]>()
  for (const mov of movs ?? []) {
    if (isDeVuelta(mov.es_de_vuelta)) continue
    const platform = String(mov.platform_normalized ?? '').trim().toUpperCase()
    if (!COMPARABLE_PLATFORM.test(platform)) continue
    const plate = normalizePlateStrict(String(mov.plate_normalized ?? mov.patente_original ?? ''))
    if (!plate) continue
    const fromMs = parseTimestampMs(String(mov.external_ingreso_at ?? ''))
    if (!Number.isFinite(fromMs)) continue
    const salidaMs = parseTimestampMs(String(mov.external_salida_at ?? ''))
    const toMs = Number.isFinite(salidaMs) && salidaMs >= fromMs ? salidaMs : fromMs
    const list = out.get(plate)
    if (list) list.push({ platform, fromMs, toMs })
    else out.set(plate, [{ platform, fromMs, toMs }])
  }
  for (const list of out.values()) list.sort((a, b) => a.fromMs - b.fromMs)
  return out
}

/** `es_de_vuelta` llega como booleano del normalizador o como texto si se releyó del CSV. */
function isDeVuelta(value: boolean | string | undefined): boolean {
  if (value === true) return true
  const raw = String(value ?? '').trim().toLowerCase()
  return raw === 'true' || raw === 'si' || raw === 'sí' || raw === '1'
}
