import type {
  PreliminaryCircuitClassification,
  RealJourneyEventDto,
  ReconstructedRealJourney,
} from './realJourneyEvents.types'



export type PreliminaryCircuitResult = PreliminaryCircuitClassification



export const DESCARTADO_CODES = [

  'DESCARTADO_PATENTE_INVALIDA',

  'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE',

  'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE',

  'DESCARTADO_PREINGRESO_CAMARAS_INCOMPLETAS',

  'DESCARTADO_INGRESO_CAMARAS_INCOMPLETAS',

  'DESCARTADO_EGRESO_CAMARAS_INCOMPLETAS',

] as const



export const PRELIM_CIRCUIT_CODES = [

  'CIRCUITO_CELDA16_DESCARGA',

  'CIRCUITO_CELDA16_CARGA',

  'CIRCUITO_VOLCABLE_1_2',

  'CIRCUITO_LIQUIDO',

  'CIRCUITO_SAN_LORENZO',

  'DESPACHO_SIN_PUNTO_INSTRUMENTADO',

  'TRANSILE_VOLCABLE_BALANZA',

  'REGISTRO_INCOMPLETO',

] as const



/** Todos los códigos de selector (clasificación observable + descartes fuera de KPIs). */

export const OBSERVABLE_JOURNEY_CODES = [

  ...DESCARTADO_CODES,

  ...PRELIM_CIRCUIT_CODES,

] as const



export type PreliminaryCircuitCode = (typeof PRELIM_CIRCUIT_CODES)[number]



/** Cámaras de egreso donde el solo-egreso suele ser ruta / detección aislada. */

export const RIC_EGRESO_ROUTE_DEVICE_CODES = new Set([

  'RicEgrCamFrente',

  'RicEgrCamTraser',

  'RicEgrCamTrasera',

])



export const RIC_INGRESO_ROUTE_DEVICE_CODES = new Set(['RicIngCamFrente', 'RicIngCamTrasera'])



const RIC_LOGICAL = new Set([

  'INGRESO',

  'PREINGRESO',

  'PREINGRESO_EGRESO',

  'EGRESO',

  'BALANZA_INGRESO',

  'BALANZA_EGRESO',

  'BALANZA',

  'VOLCABLE',

  'CELDA16_CARGA',

  'CELDA16_DESCARGA',

  'CALADA',

  'LIQUIDO',

])



function collapseConsecutiveEqual(seq: string[]): string[] {

  const out: string[] = []

  for (const x of seq) {

    if (out.length === 0 || out[out.length - 1] !== x) out.push(x)

  }

  return out

}



function distinctRicLogical(seq: string[]): Set<string> {

  const s = new Set<string>()

  for (const c of seq) {

    if (RIC_LOGICAL.has(c)) s.add(c)

  }

  return s

}



function isOrderedSubsequence(seq: string[], pattern: string[]): boolean {

  let j = 0

  for (let i = 0; i < seq.length && j < pattern.length; i++) {

    if (seq[i] === pattern[j]) j++

  }

  return j === pattern.length

}



function hasContiguousRun(seq: string[], run: string[]): boolean {

  if (run.length === 0) return true

  if (seq.length < run.length) return false

  for (let i = 0; i <= seq.length - run.length; i++) {

    let ok = true

    for (let k = 0; k < run.length; k++) {

      if (seq[i + k] !== run[k]) {

        ok = false

        break

      }

    }

    if (ok) return true

  }

  return false

}



function countCode(seq: string[], code: string): number {

  return seq.filter((c) => c === code).length

}



function hasAnyBalanza(has: (c: string) => boolean): boolean {

  return has('BALANZA_INGRESO') || has('BALANZA_EGRESO') || has('BALANZA')

}

const REAR_EXCLUDED_LOGICAL_POINTS = new Set([
  'INGRESO_TRASERA_EXCLUIDA',
  'PREINGRESO_TRASERA_EXCLUIDA',
  'EGRESO_TRASERA_EXCLUIDA',
])

function countExcludedRearLogicalPoints(seq: string[]): number {
  return seq.filter((code) => REAR_EXCLUDED_LOGICAL_POINTS.has(code)).length
}

function missingExpectedPoints(seq: string[], expected: string[]): string[] {
  const present = new Set(seq)
  return expected.filter((point) => !present.has(point))
}

function countEvidencePoints(has: (c: string) => boolean): number {
  const routeStart = has('INGRESO') || has('PREINGRESO')
  return [
    routeStart,
    has('CALADA'),
    has('BALANZA_INGRESO'),
    has('BALANZA_EGRESO'),
    has('EGRESO') || has('PREINGRESO_EGRESO'),
  ].filter(Boolean).length
}



function deviceRouteHintEgreso(deviceCodes: string[]): boolean {

  return deviceCodes.some((d) => RIC_EGRESO_ROUTE_DEVICE_CODES.has((d ?? '').trim()))

}



function deviceRouteHintIngreso(deviceCodes: string[]): boolean {

  return deviceCodes.some((d) => RIC_INGRESO_ROUTE_DEVICE_CODES.has((d ?? '').trim()))

}



const RIC_SECTOR_PREINGRESO_U = 'RICARDONE_PREINGRESO'

const RIC_SECTOR_INGRESO_U = 'RICARDONE_INGRESO_CAMIONES'

const RIC_SECTOR_EGRESO_U = 'RICARDONE_EGRESO_CAMIONES'



const RIC_PREINGRESO_FRONT_DEVICES = new Set(['RicPreIngInFr'])

const RIC_PREINGRESO_REAR_DEVICES = new Set(['RicPreIngInTr'])



const RIC_INGRESO_FRONT_DEVICES = new Set(['RicIngCamFrente'])

const RIC_INGRESO_REAR_DEVICES = new Set(['RicIngCamTrasera', 'RicIngCamTraser'])



const RIC_EGRESO_FRONT_DEVICES = new Set(['RicEgrCamFrente'])

const RIC_EGRESO_REAR_DEVICES = new Set(['RicEgrCamTraser', 'RicEgrCamTrasera'])



type RicSectorCameraGap = 'PREINGRESO' | 'INGRESO' | 'EGRESO'



/** Si hay eventos en un sector de ruta Ricardone, exige al menos un device frontal y uno trasero en ese sector. */

function ricardoneSectorCameraGap(events: RealJourneyEventDto[] | undefined): RicSectorCameraGap | null {

  if (!events?.length) return null



  const checks: Array<{

    gap: RicSectorCameraGap

    sectorU: string

    fronts: Set<string>

    rears: Set<string>

  }> = [

    {

      gap: 'PREINGRESO',

      sectorU: RIC_SECTOR_PREINGRESO_U,

      fronts: RIC_PREINGRESO_FRONT_DEVICES,

      rears: RIC_PREINGRESO_REAR_DEVICES,

    },

    {

      gap: 'INGRESO',

      sectorU: RIC_SECTOR_INGRESO_U,

      fronts: RIC_INGRESO_FRONT_DEVICES,

      rears: RIC_INGRESO_REAR_DEVICES,

    },

    {

      gap: 'EGRESO',

      sectorU: RIC_SECTOR_EGRESO_U,

      fronts: RIC_EGRESO_FRONT_DEVICES,

      rears: RIC_EGRESO_REAR_DEVICES,

    },

  ]



  for (const { gap, sectorU, fronts, rears } of checks) {

    const subset = events.filter((e) => (e.sectorCode ?? '').trim().toUpperCase() === sectorU)

    if (subset.length === 0) continue

    let hasFront = false

    let hasRear = false

    for (const e of subset) {

      const d = (e.deviceCode ?? '').trim()

      if (fronts.has(d)) hasFront = true

      if (rears.has(d)) hasRear = true

    }

    if (!hasFront || !hasRear) return gap

  }

  return null

}



function discardOperationalForRicSectorCameraGap(
  gap: RicSectorCameraGap
): PreliminaryCircuitClassification & { isDiscardedOperational: boolean } {

  switch (gap) {

    case 'PREINGRESO':

      return {

        preliminaryCircuitCode: 'DESCARTADO_PREINGRESO_CAMARAS_INCOMPLETAS',

        preliminaryCircuitName: 'Descartado — preingreso sin par de cámaras (frente y trasera)',

        preliminaryCircuitConfidence: 'alta',

        preliminaryCircuitReason:

          'En RICARDONE_PREINGRESO no hay lectura RicPreIngInFr y RicPreIngInTr en el mismo journey; la trasera sola puede corresponder a paso por playa/cercanía sin ingreso real a preingreso.',

        isDiscardedOperational: true,

      }

    case 'INGRESO':

      return {

        preliminaryCircuitCode: 'DESCARTADO_INGRESO_CAMARAS_INCOMPLETAS',

        preliminaryCircuitName: 'Descartado — ingreso sin par de cámaras (frente y trasera)',

        preliminaryCircuitConfidence: 'alta',

        preliminaryCircuitReason:

          'En RICARDONE_INGRESO_CAMIONES no coinciden frente y trasera (RicIngCamFrente y RicIngCamTrasera); posible detección parcial de ruta.',

        isDiscardedOperational: true,

      }

    case 'EGRESO':

      return {

        preliminaryCircuitCode: 'DESCARTADO_EGRESO_CAMARAS_INCOMPLETAS',

        preliminaryCircuitName: 'Descartado — egreso sin par de cámaras (frente y trasera)',

        preliminaryCircuitConfidence: 'alta',

        preliminaryCircuitReason:

          'En RICARDONE_EGRESO_CAMIONES no coinciden frente y trasera (RicEgrCamFrente y RicEgrCamTraser/Trasera); posible detección parcial de ruta.',

        isDiscardedOperational: true,

      }

  }

}



/** Después del primer EGRESO ricardino hay al menos un SL_INGRESO en el mismo journey. */

function hasSlIngresoAfterEgreso(logicalCodes: string[]): boolean {

  for (let i = 0; i < logicalCodes.length; i++) {

    if (logicalCodes[i] !== 'EGRESO') continue

    for (let j = i + 1; j < logicalCodes.length; j++) {

      if (logicalCodes[j] === 'SL_INGRESO') return true

    }

  }

  return false

}



/**

 * Secuencia típica de puntos físicos en Ricardone (sectorCode como proxy de ubicación/cámara)

 * asociada a cada circuito preliminar para la tabla de agregados.

 */

export function preliminaryCircuitTypicalSectorPath(preliminaryCircuitCode: string): string {

  switch (preliminaryCircuitCode) {
    case 'CIRCUITO_CELDA16_DESCARGA':
      return 'INGRESO → PREINGRESO → CALADA → BALANZA ingreso → CELDA16_DESCARGA → BALANZA egreso → EGRESO'
    case 'CIRCUITO_CELDA16_CARGA':
      return 'INGRESO → PREINGRESO → CALADA → BALANZA ingreso → CELDA16_CARGA → BALANZA egreso → EGRESO'
    case 'CIRCUITO_VOLCABLE_1_2':
      return 'INGRESO → PREINGRESO → CALADA → BALANZA ingreso → VOLCABLE → BALANZA egreso → EGRESO'
    case 'CIRCUITO_LIQUIDO':
      return 'INGRESO → PREINGRESO → CALADA → LIQUIDO → BALANZA ingreso → BALANZA egreso'
    case 'CIRCUITO_SAN_LORENZO':
      return 'INGRESO/PREINGRESO → CALADA opcional → EGRESO (sin punto de descarga Ricardone)'
    case 'DESPACHO_SIN_PUNTO_INSTRUMENTADO':
      return 'Ingreso/preingreso/calada/balanza/egreso sin Celda 16, Volcable ni Líquidos'
    case 'TRANSILE_VOLCABLE_BALANZA':
      return 'VOLCABLE → BALANZA (sin ingreso inicial claro)'
    case 'REGISTRO_INCOMPLETO':
      return '(registro insuficiente para clasificar con cámaras actuales)'

    case 'PRELIM_RIC_LOOP_BALANZA':

      return (

        'RICARDONE_INGRESO / PREINGRESO → RICARDONE_BALANZA (múltiples ingreso/egreso balanza o patrón ida‑vuelta‑ida‑vuelta)'

      )

    case 'PRELIM_RIC_DESCARGA_VOLCABLE':

      return (

        'RICARDONE_INGRESO → PREINGRESO → BALANZA ingreso → VOLCABLE → BALANZA egreso (± EGRESO planta)'

      )

    case 'PRELIM_RIC_LIQUIDO_PROBABLE':

      return 'INGRESO → PREINGRESO → BALANZA ingreso → BALANZA egreso → EGRESO (sin VOLCABLE)'

    case 'PRELIM_RIC_DESCARGA_NO_VOLCABLE':

      return 'INGRESO → PREINGRESO → BALANZA ingreso → BALANZA egreso (sin VOLCABLE; EGRESO opcional en datos)'

    case 'PRELIM_RIC_CALADA_A_SAN_LORENZO':

      return 'INGRESO → PREINGRESO → EGRESO (sin balanza/volcable en journey)'

    case 'PRELIM_RIC_INGRESO_EGRESO_VALIDO':

      return 'INGRESO → EGRESO (solo esos puntos Ricardone observados)'

    case 'PRELIM_RIC_PREINGRESO_EGRESO_VALIDO':

      return 'PREINGRESO → EGRESO (sin ingreso formal captado)'

    case 'PRELIM_RIC_INGRESO_BALANZA_VALIDO':

      return 'INGRESO → Balanza (sin EGRESO captado en journey)'

    case 'PRELIM_RIC_PREINGRESO_BALANZA_VALIDO':

      return 'PREINGRESO → Balanza (± otros puntos no cubiertos por patrones previos)'

    case 'PRELIM_RIC_TRANSILE_VOLCABLE_BALANZA':

      return 'VOLCABLE → BALANZA_EGRESO (movimiento interno / transile probable)'

    case 'PRELIM_RIC_A_SAN_LORENZO':

      return 'INGRESO/PREINGRESO → EGRESO (± SL_INGRESO)'

    case 'PRELIM_RIC_LIQUIDO':

      return 'BALANZA_INGRESO → BALANZA_EGRESO → EGRESO (sin volcable/celda)'

    case 'PRELIM_RIC_SALIDA_S10_SOLIDO':

      return 'Combinaciones de ingreso/preingreso/balanza para despacho sólido'

    case 'PRELIM_RIC_VOLCABLE':

      return 'VOLCABLE con evidencia operativa asociada (ingreso/preingreso/balanza/egreso)'

    case 'PRELIM_RIC_CELDA_16':

      return 'CELDA_16 con evidencia operativa asociada'

    case 'PRELIM_SOLO_VOLCABLE':

      return 'RICARDONE_VOLCABLE_1|2'

    case 'PRELIM_INCOMPLETO':

      return '(sin patrón preliminar fijo con las cámaras actuales)'

    case 'DESCARTADO_PATENTE_INVALIDA':

      return '(journey sólo lecturas OCR no válidas)'

    case 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE':

      return 'Solo EGRESO Ricardone (posible paso por ruta / cámara aislada)'

    case 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE':

      return 'Solo INGRESO Ricardone (posible paso por ruta / cámara aislada)'

    case 'DESCARTADO_PREINGRESO_CAMARAS_INCOMPLETAS':

      return 'Preingreso Ricardone sin par frente/trasera (RicPreIngInFr + RicPreIngInTr)'

    case 'DESCARTADO_INGRESO_CAMARAS_INCOMPLETAS':

      return 'Ingreso Ricardone sin par frente/trasera'

    case 'DESCARTADO_EGRESO_CAMARAS_INCOMPLETAS':

      return 'Egreso Ricardone sin par frente/trasera'

    default:

      return '—'

  }

}



export type OperationalJourneyClassification = PreliminaryCircuitClassification & {

  isDiscardedOperational: boolean

}



/**

 * Orden: descartes solo punto → cobertura de cámaras por sector → LOOP → DESCARGA_VOLCABLE → LÍQUIDO → NO_VOLCABLE → CALADA_SL →

 * mínimos Ingreso/Egreso y Preingreso/Egreso → Ingreso/Balanza → Preingreso/Balanza → SOLO_VOLCABLE → INCOMPLETO.

 * Se excluye inter‑journey (SL dentro de 12 h) aquí; aplicar {@link enrichCaladaSanLorenzoConfidence} después.

 */

export function classifyOperationalPreliminaryCircuit(

  j: Pick<ReconstructedRealJourney, 'logicalCodeSequence' | 'deviceCodeSequence' | 'normalizedPlate'> &
    Partial<Pick<ReconstructedRealJourney, 'events'>>

): OperationalJourneyClassification {

  const full = [...j.logicalCodeSequence]

  const col = collapseConsecutiveEqual(full)

  const dr = distinctRicLogical(full)

  const devices = j.deviceCodeSequence ?? []



  const has = (code: string) => dr.has(code)

  const hasIngreso = has('INGRESO')

  const hasPreingreso = has('PREINGRESO')

  const hasEgreso = has('EGRESO')

  const hasVolcable = has('VOLCABLE')

  const bi = countCode(full, 'BALANZA_INGRESO')

  const be = countCode(full, 'BALANZA_EGRESO')

  const hasBalanzaAny = hasAnyBalanza(has)

  const hasCelda16Descarga = has('CELDA16_DESCARGA')
  const hasCelda16Carga = has('CELDA16_CARGA')
  const hasLiquid = has('LIQUIDO')
  const hasSlAfter = hasSlIngresoAfterEgreso(full)
  const noInstrumentedAction = !hasVolcable && !hasCelda16Carga && !hasCelda16Descarga && !hasLiquid
  const evidencePoints = countEvidencePoints(has)
  const excludedRearCameraEventsCount = countExcludedRearLogicalPoints(full)

  if (hasCelda16Descarga) {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'CELDA16_DESCARGA', 'BALANZA_EGRESO', 'EGRESO']
    return {
      preliminaryCircuitCode: 'CIRCUITO_CELDA16_DESCARGA',
      preliminaryCircuitName: 'Descarga Celda 16',
      preliminaryCircuitConfidence: isOrderedSubsequence(col, expected) ? 'alta' : 'media',
      preliminaryCircuitReason: 'Presencia de cámara CELDA16_DESCARGA; define descarga en Celda 16 aunque falten puntos intermedios.',
      preliminaryCircuitGroup: 'Descarga Celda 16',
      preliminaryCircuitVariant: 'CELDA16_DESCARGA',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: 'CELDA16_DESCARGA detectado en el recorrido.',
      isDiscardedOperational: false,
    }
  }

  if (hasCelda16Carga) {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO']
    return {
      preliminaryCircuitCode: 'CIRCUITO_CELDA16_CARGA',
      preliminaryCircuitName: 'Carga Celda 16',
      preliminaryCircuitConfidence: isOrderedSubsequence(col, expected) ? 'alta' : 'media',
      preliminaryCircuitReason: 'Presencia de cámara CELDA16_CARGA; define carga en Celda 16 aunque falten puntos intermedios.',
      preliminaryCircuitGroup: 'Carga Celda 16',
      preliminaryCircuitVariant: 'CELDA16_CARGA',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: 'CELDA16_CARGA detectado en el recorrido.',
      isDiscardedOperational: false,
    }
  }

  if (hasVolcable) {
    const volcableIndex = full.findIndex((code) => code === 'VOLCABLE')
    const nextBalanzaIndex = full.findIndex(
      (code, idx) => idx > volcableIndex && (code === 'BALANZA_EGRESO' || code === 'BALANZA_INGRESO')
    )
    const transile = !hasIngreso && !hasPreingreso && volcableIndex >= 0 && nextBalanzaIndex > volcableIndex
    const expected = transile
      ? ['VOLCABLE', 'BALANZA_EGRESO']
      : ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO']
    return {
      preliminaryCircuitCode: transile ? 'TRANSILE_VOLCABLE_BALANZA' : 'CIRCUITO_VOLCABLE_1_2',
      preliminaryCircuitName: transile ? 'Transile Volcable → Balanza' : 'Circuito a Volcable 1/2',
      preliminaryCircuitConfidence: isOrderedSubsequence(col, expected) ? 'alta' : 'media',
      preliminaryCircuitReason: transile
        ? 'VOLCABLE seguido de balanza sin secuencia clara de ingreso inicial.'
        : 'Presencia de cámara VOLCABLE; define acción operativa a Volcable 1/2.',
      preliminaryCircuitGroup: transile ? 'Transile Volcable → Balanza' : 'Volcable 1/2',
      preliminaryCircuitVariant: transile ? 'TRANSILE_VOLCABLE_BALANZA' : 'VOLCABLE_1_2',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: transile ? 'VOLCABLE antes de BALANZA sin INGRESO/PREINGRESO.' : 'VOLCABLE detectado en el recorrido.',
      isDiscardedOperational: false,
    }
  }

  if (hasLiquid && evidencePoints >= 1) {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO']
    return {
      preliminaryCircuitCode: 'CIRCUITO_LIQUIDO',
      preliminaryCircuitName: 'Circuito líquido',
      preliminaryCircuitConfidence: isOrderedSubsequence(col, expected) ? 'alta' : 'media',
      preliminaryCircuitReason: 'Presencia real de cámara LIQUIDO con evidencia mínima de recorrido.',
      preliminaryCircuitGroup: 'Circuito líquido',
      preliminaryCircuitVariant: 'LIQUIDO',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: 'LIQUIDO detectado en el recorrido; no se infiere sólo por balanza.',
      isDiscardedOperational: false,
    }
  }

  if ((hasIngreso || hasPreingreso) && hasEgreso && noInstrumentedAction && !hasBalanzaAny) {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO']
    return {
      preliminaryCircuitCode: 'CIRCUITO_SAN_LORENZO',
      preliminaryCircuitName: 'Circuito Ricardone → San Lorenzo',
      preliminaryCircuitConfidence: hasSlAfter ? 'alta' : 'media',
      preliminaryCircuitReason: hasSlAfter ? 'SL_INGRESO posterior al EGRESO Ricardone.' : 'Ingreso/preingreso + egreso sin balanza ni punto instrumentado.',
      preliminaryCircuitGroup: 'Ricardone → San Lorenzo',
      preliminaryCircuitVariant: hasSlAfter ? 'CON_SL_CONFIRMADO' : 'RICARDONE_ONLY',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: 'Recorrido compatible con Ricardone → San Lorenzo sin puntos de descarga Ricardone.',
      isDiscardedOperational: false,
    }
  }

  if (noInstrumentedAction && evidencePoints >= 2) {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'EGRESO']
    return {
      preliminaryCircuitCode: 'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
      preliminaryCircuitName: 'Despacho / descarga sin punto instrumentado',
      preliminaryCircuitConfidence: evidencePoints >= 4 ? 'alta' : evidencePoints === 3 ? 'media' : 'baja',
      preliminaryCircuitReason: 'Hay evidencia suficiente de recorrido, sin Celda 16, Volcable ni Líquido.',
      preliminaryCircuitGroup: 'Despacho / descarga sin punto instrumentado',
      preliminaryCircuitVariant: has('BALANZA_INGRESO') && has('BALANZA_EGRESO') ? 'BALANZA_INGRESO_EGRESO' : 'PARCIAL',
      missingExpectedPoints: missingExpectedPoints(full, expected),
      excludedRearCameraEventsCount,
      classificationReason: 'Al menos dos puntos operativos sin punto de descarga instrumentado.',
      isDiscardedOperational: false,
    }
  }

  return {
    preliminaryCircuitCode: 'REGISTRO_INCOMPLETO',
    preliminaryCircuitName: 'Registro incompleto',
    preliminaryCircuitConfidence: 'baja',
    preliminaryCircuitReason: 'No matchea ningún circuito Ricardone con evidencia suficiente.',
    preliminaryCircuitGroup: 'Registro incompleto',
    preliminaryCircuitVariant: 'SIN_PATRON_SUFICIENTE',
    missingExpectedPoints: [],
    excludedRearCameraEventsCount,
    classificationReason: 'Registro aislado o secuencia insuficiente para inferir circuito.',
    isDiscardedOperational: false,
  }



  /** 2–3 Descartes por ruido de ruta (solo un punto Ricardone observado). */

  if (dr.size === 1 && hasEgreso && !hasIngreso) {

    const hint = deviceRouteHintEgreso(devices)

    return {

      preliminaryCircuitCode: 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE',

      preliminaryCircuitName: 'Descartado — solo egreso (ruta probable)',

      preliminaryCircuitConfidence: hint ? 'alta' : 'media',

      preliminaryCircuitReason: hint

        ? 'Secuencia lógica sólo EGRESO Ricardone; además hay deviceCode típico de egreso (frente/trasera). Posible vehículo de paso o captura aislada.'

        : 'Secuencia lógica sólo EGRESO Ricardone sin ingreso ni otros puntos; se excluye del análisis operativo principal.',

      isDiscardedOperational: true,

    }

  }



  if (dr.size === 1 && hasIngreso && !hasEgreso) {

    const hint = deviceRouteHintIngreso(devices)

    return {

      preliminaryCircuitCode: 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE',

      preliminaryCircuitName: 'Descartado — solo ingreso (ruta probable)',

      preliminaryCircuitConfidence: hint ? 'alta' : 'media',

      preliminaryCircuitReason: hint

        ? 'Secuencia lógica sólo INGRESO Ricardone; deviceCode típico de ingreso. Posible vehículo de paso o captura aislada.'

        : 'Secuencia lógica sólo INGRESO Ricardone sin egreso ni otros puntos; se excluye del análisis operativo principal.',

      isDiscardedOperational: true,

    }

  }



  /** Cobertura frente + trasera por sector de ruta Ricardone (ej. preingreso solo RicPreIngInTr). */

  const camGap = ricardoneSectorCameraGap(j.events)

  if (camGap === 'PREINGRESO') return discardOperationalForRicSectorCameraGap('PREINGRESO')
  if (camGap === 'INGRESO') return discardOperationalForRicSectorCameraGap('INGRESO')
  if (camGap === 'EGRESO') return discardOperationalForRicSectorCameraGap('EGRESO')



  /** 4 LOOP BALANZA */

  if (

    (hasIngreso || hasPreingreso) &&

    (bi >= 2 ||

      be >= 2 ||

      hasContiguousRun(col, ['BALANZA_INGRESO', 'BALANZA_EGRESO', 'BALANZA_INGRESO', 'BALANZA_EGRESO']))

  ) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_LOOP_BALANZA',

      preliminaryCircuitName: 'Loop de balanza / posible transile, ajuste o recirculación',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Dos o más lecturas direccionadas de balanza o patrón ida‑vuelta‑ida‑vuelta consecutivo; con ingreso o preingreso.',

      isDiscardedOperational: false,

    }

  }



  /** 5 DESCARGA VOLCABLE */

  if (

    hasVolcable &&

    has('BALANZA_INGRESO') &&

    has('BALANZA_EGRESO') &&

    isOrderedSubsequence(col, ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'VOLCABLE', 'BALANZA_EGRESO'])

  ) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_DESCARGA_VOLCABLE',

      preliminaryCircuitName: 'Descarga en Volcable 1/2',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Cadena previa a volcable con balanza ingreso/egreso y lectura en volcable; EGRESO planta puede no estar en el journey.',

      isDiscardedOperational: false,

    }

  }



  /** 6 LÍQUIDO PROBABLE */

  if (

    !hasVolcable &&

    isOrderedSubsequence(col, ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'BALANZA_EGRESO', 'EGRESO'])

  ) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_LIQUIDO_PROBABLE',

      preliminaryCircuitName: 'Circuito probable de líquido o descarga no instrumentada con egreso',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Preingreso/balanza entrada‑salida y egreso Ricardone sin lectura en volcable en este journey.',

      isDiscardedOperational: false,

    }

  }



  /** 7 DESCARGA SIN VOLCABLE */

  if (

    !hasVolcable &&

    hasIngreso &&

    hasPreingreso &&

    has('BALANZA_INGRESO') &&

    has('BALANZA_EGRESO') &&

    isOrderedSubsequence(col, ['INGRESO', 'PREINGRESO', 'BALANZA_INGRESO', 'BALANZA_EGRESO'])

  ) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_DESCARGA_NO_VOLCABLE',

      preliminaryCircuitName: 'Descarga en planta sin punto de descarga instrumentado',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Balanza ingreso y egreso con preingreso; sin VOLCABLE en datos; puede existir o no EGRESO planta en el mismo journey.',

      isDiscardedOperational: false,

    }

  }



  /** 8 CALADA → San Lorenzo */

  if (

    hasIngreso &&

    hasPreingreso &&

    hasEgreso &&

    !hasBalanzaAny &&

    !hasVolcable &&

    isOrderedSubsequence(col, ['INGRESO', 'PREINGRESO', 'EGRESO'])

  ) {

    const alta = hasSlIngresoAfterEgreso(full)

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_CALADA_A_SAN_LORENZO',

      preliminaryCircuitName: 'Calada / derivación probable a San Lorenzo',

      preliminaryCircuitConfidence: alta ? 'alta' : 'media',

      preliminaryCircuitReason: alta

        ? 'Ingreso, preingreso y egreso sin balanza/volcable; además hay SL_INGRESO en el mismo journey tras el egreso Ricardone.'

        : 'Ingreso, preingreso y egreso sin balanza/volcable; confianza media si no hay SL enlazado en el mismo journey (revisar inter‑journey 12 h).',

      isDiscardedOperational: false,

    }

  }



  /** 9 Mínimo INGRESO → EGRESO (sólo esos códigos Ricardone) */

  if (

    hasIngreso &&

    hasEgreso &&

    dr.size === 2 &&

    dr.has('INGRESO') &&

    dr.has('EGRESO') &&

    isOrderedSubsequence(col, ['INGRESO', 'EGRESO'])

  ) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_INGRESO_EGRESO_VALIDO',

      preliminaryCircuitName: 'Ingreso → Egreso válido mínimo',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Sólo se observan ingreso y egreso Ricardone; puntos intermedios pueden no haber captado o no asociarse al mismo journey.',

      isDiscardedOperational: false,

    }

  }



  /** 10 PREINGRESO → EGRESO sin INGRESO */

  if (hasPreingreso && hasEgreso && !hasIngreso && dr.size === 2 && dr.has('PREINGRESO') && dr.has('EGRESO')) {

    return {

      preliminaryCircuitCode: 'PRELIM_RIC_PREINGRESO_EGRESO_VALIDO',

      preliminaryCircuitName: 'Preingreso → Egreso válido mínimo',

      preliminaryCircuitConfidence: 'media',

      preliminaryCircuitReason:

        'Egreso con preingreso/calada sin ingreso formal en datos; recorrido mínimo plausible con cámaras parciales.',

      isDiscardedOperational: false,

    }

  }



  /** 11 INGRESO → BALANZA sin EGRESO (sin preingreso para no solapar otros patrones) */

  if (hasIngreso && hasBalanzaAny && !hasEgreso && !hasPreingreso) {

    const okOrder =

      isOrderedSubsequence(col, ['INGRESO', 'BALANZA_INGRESO']) ||

      isOrderedSubsequence(col, ['INGRESO', 'BALANZA'])

    if (okOrder) {

      return {

        preliminaryCircuitCode: 'PRELIM_RIC_INGRESO_BALANZA_VALIDO',

        preliminaryCircuitName: 'Ingreso → Balanza válido parcial',

        preliminaryCircuitConfidence: 'media',

        preliminaryCircuitReason:

          'Llegada a balanza tras ingreso sin egreso en el mismo journey; puede faltar captura de salida o vinculación.',

        isDiscardedOperational: false,

      }

    }

  }



  /** 11b TRANSILE / movimiento interno: VOLCABLE -> BALANZA_EGRESO. */

  if (hasVolcable && has('BALANZA_EGRESO')) {

    const volcableIndex = full.findIndex((code) => code === 'VOLCABLE')

    const balanzaEgresoIndex = full.findIndex((code) => code === 'BALANZA_EGRESO')

    if (volcableIndex >= 0 && balanzaEgresoIndex > volcableIndex) {

      return {

        preliminaryCircuitCode: 'PRELIM_RIC_TRANSILE_VOLCABLE_BALANZA',

        preliminaryCircuitName: 'Transile / movimiento interno Volcable -> Balanza',

        preliminaryCircuitConfidence: 'media',

        preliminaryCircuitReason:

          'Detecta VOLCABLE seguido de BALANZA_EGRESO en el mismo journey, compatible con transile o movimiento interno.',

        isDiscardedOperational: false,

      }

    }

  }

  /** 12 PREINGRESO → BALANZA (sin ingreso; egreso opcional) */

  if (hasPreingreso && hasBalanzaAny && !hasIngreso) {

    const okOrder =

      isOrderedSubsequence(col, ['PREINGRESO', 'BALANZA_INGRESO']) ||

      isOrderedSubsequence(col, ['PREINGRESO', 'BALANZA'])

    if (okOrder && !hasEgreso && !hasVolcable) {

      return {

        preliminaryCircuitCode: 'PRELIM_RIC_PREINGRESO_BALANZA_VALIDO',

        preliminaryCircuitName: 'Preingreso → Balanza válido parcial',

        preliminaryCircuitConfidence: 'media',

        preliminaryCircuitReason:

          'Calada/preingreso a balanza sin ingreso formal ni egreso en journey; útil como recorrido parcial.',

        isDiscardedOperational: false,

      }

    }

  }



  /** 13 SOLO VOLCABLE */

  if (hasVolcable && !hasIngreso && !hasEgreso) {

    return {

      preliminaryCircuitCode: 'PRELIM_SOLO_VOLCABLE',

      preliminaryCircuitName: 'Detecciones solo en Volcable sin recorrido completo',

      preliminaryCircuitConfidence: 'baja',

      preliminaryCircuitReason: 'Lecturas en volcable sin ingreso ni egreso Ricardone en la secuencia; actividad de sector.',

      isDiscardedOperational: false,

    }

  }



  return {

    preliminaryCircuitCode: 'PRELIM_INCOMPLETO',

    preliminaryCircuitName: 'Recorrido incompleto no clasificable con cámaras actuales',

    preliminaryCircuitConfidence: 'baja',

    preliminaryCircuitReason:

      'No coincide con patrones preliminares ni con reglas de descarte por punto único; revisar cobertura de cámaras.',

    isDiscardedOperational: false,

  }

}



/**

 * Ajusta confianza de PRELIM_RIC_CALADA_A_SAN_LORENZO si para la misma patente aparece SL_INGRESO

 * dentro de `windowMs` tras el último EGRESO Ricardone (`eventsUnfiltered`: incluye SL).

 */

export function enrichCaladaSanLorenzoConfidence(

  journeys: ReconstructedRealJourney[],

  eventsAllPlants: { occurredAt: string; normalizedPlate?: string; sectorCode?: string }[],

  windowMs: number

): ReconstructedRealJourney[] {

  type Ev = { t: number; plate: string; sl: boolean }

  const evs: Ev[] = []

  for (const e of eventsAllPlants) {

    const plate = String(e.normalizedPlate ?? '').trim()

    if (!plate) continue

    const ts = new Date(e.occurredAt).getTime()

    if (!Number.isFinite(ts)) continue

    const sc = (e.sectorCode ?? '').trim().toUpperCase()

    evs.push({ t: ts, plate, sl: sc === 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES' })

  }

  evs.sort((a, b) => a.t - b.t)



  function hasSlSoonAfter(plate: string, afterT: number): boolean {

    for (const row of evs) {

      if (row.plate !== plate || !row.sl) continue

      if (row.t >= afterT && row.t - afterT <= windowMs) return true

    }

    return false

  }



  return journeys.map((j) => {

    if (j.preliminaryCircuitCode !== 'CIRCUITO_SAN_LORENZO') return j



    let lastRicEgT = -1

    const seq = j.logicalCodeSequence

    for (let i = 0; i < seq.length; i++) {

      if (seq[i] !== 'EGRESO') continue

      const ev = j.events[i]

      if (!ev) continue

      const t = new Date(ev.occurredAt).getTime()

      if (Number.isFinite(t)) lastRicEgT = Math.max(lastRicEgT, t)

    }



    const plate = (j.normalizedPlate ?? '').trim()

    const hit = plate && lastRicEgT > 0 && hasSlSoonAfter(plate, lastRicEgT)

    const conf = hit ? 'alta' : 'media'



    const reason =

      (hit

        ? 'Misma patente con ingreso San Lorenzo dentro de la ventana temporal tras egreso Ricardone.'

        : j.preliminaryCircuitReason) ?? ''



    return {

      ...j,

      preliminaryCircuitConfidence: conf,

      preliminaryCircuitReason:

        hit && reason

          ? `Confianza ajustada: ${reason}`

          : j.preliminaryCircuitReason,

    }

  })

}



/** @deprecated usar classifyOperationalPreliminaryCircuit */

export function classifyPreliminaryRealCircuit(

  j: Pick<ReconstructedRealJourney, 'logicalCodeSequence' | 'deviceCodeSequence' | 'normalizedPlate'> &
    Partial<Pick<ReconstructedRealJourney, 'events'>>

): PreliminaryCircuitClassification {

  const x = classifyOperationalPreliminaryCircuit(j)

  const { isDiscardedOperational: _i, ...rest } = x

  return rest

}



export type PreliminaryCircuitDailyRow = {

  day: string

  preliminaryCircuitCode: string

  preliminaryCircuitName: string

  journeyCount: number

  uniquePlateCount: number

  meanDurationMinutes: number

  p90DurationMinutes: number

  pctOfDayJourneys: number

}



/**

 * Agregados por día y circuito observable (solo diagnóstico; incluye PRELIM y DESCARTADO_*).

 * Por defecto solo journeys que {@link ReconstructedRealJourney.feedsOperationalAnalytics};

 * pasar `onlyOperationalUseful=true` para excluir descartados y SL opcional más adelante.

 */

export function buildPreliminaryCircuitDailySummary(

  journeys: ReconstructedRealJourney[],

  opts?: { includeDiscarded?: boolean }

): PreliminaryCircuitDailyRow[] {

  const includeDiscarded = opts?.includeDiscarded === true

  const list =

    includeDiscarded ? journeys : journeys.filter((j) => !j.isDiscardedOperational)



  const byDay = new Map<string, ReconstructedRealJourney[]>()

  for (const j of list) {

    const d = j.day

    if (!d) continue

    if (!byDay.has(d)) byDay.set(d, [])

    byDay.get(d)!.push(j)

  }



  const daysSorted = [...byDay.keys()].sort((a, b) => a.localeCompare(b))

  const rows: PreliminaryCircuitDailyRow[] = []



  for (const day of daysSorted) {

    const dayList = byDay.get(day)!

    const dayTotal = dayList.length



    const byCircuit = new Map<string, ReconstructedRealJourney[]>()

    for (const j of dayList) {

      const code = j.preliminaryCircuitCode

      if (!byCircuit.has(code)) byCircuit.set(code, [])

      byCircuit.get(code)!.push(j)

    }



    const codes = [...byCircuit.keys()].sort((a, b) => a.localeCompare(b))

    for (const preliminaryCircuitCode of codes) {

      const group = byCircuit.get(preliminaryCircuitCode)!

      const preliminaryCircuitName = group[0]?.preliminaryCircuitName ?? ''

      const plates = new Set(group.map((g) => (g.plate ?? '').trim()).filter(Boolean))

      const durations = [...group.map((g) => g.durationMinutes)].sort((a, b) => a - b)

      const sum = durations.reduce((s, x) => s + x, 0)

      const mean = durations.length ? sum / durations.length : 0

      const p90Idx = durations.length ? Math.max(0, Math.ceil(durations.length * 0.9) - 1) : 0

      const p90DurationMinutes = durations.length ? durations[p90Idx] : 0



      rows.push({

        day,

        preliminaryCircuitCode,

        preliminaryCircuitName,

        journeyCount: group.length,

        uniquePlateCount: plates.size,

        meanDurationMinutes: Math.round(mean * 10) / 10,

        p90DurationMinutes,

        pctOfDayJourneys: dayTotal > 0 ? group.length / dayTotal : 0,

      })

    }

  }



  return rows

}


