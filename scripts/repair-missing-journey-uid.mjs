/**
 * Reparación de event-list.json cuando el export en la nube deja de mandar
 * `journeyUid` e `id` (null al 100%). Sin `journeyUid`, el ETL descarta el evento
 * (realJourneyEventsMapper: `if (!key) continue`) y el dashboard "ve" una fracción
 * de los camiones.
 *
 * Reconstruye un `journeyUid` sintético por (patente, presencia) replicando la regla
 * del upstream: el journeyUid se cierra cuando el camión SALE. Reglas (validadas contra
 * un día bueno, 2026-08-26: precisión ~93%, ~1801 journeys vs 1868 reales):
 *
 *  - Salida DURA (cierra siempre): cámaras de salida de San Lorenzo
 *    SLZSalidaC1Fte/Tras, SLZSalidaC2Fte/Tras.
 *  - Egreso Ricardone (RicEgrCamFrente/Traser + balanza egreso RicB1/B2/B3Egreso):
 *    NO cierra si el camión aparece en SLZ ingreso (SLZIngCam*) dentro de 5 h — es el
 *    mismo viaje Ric→SL (R7). Cierra sólo si no hay ingreso SL en esa ventana.
 *  - Fallback: hueco ≥ 6 h entre lecturas también corta (misma regla que el ETL).
 *
 * `id` (usado por el ETL como desempate al ordenar eventos, `a.id - b.id`) se reasigna
 * como entero creciente en orden temporal. El original se respalda en
 * `event-list.raw.json` (fuente pristina; el script re-repara desde ahí si existe).
 *
 * Uso:
 *   node scripts/repair-missing-journey-uid.mjs                 # días rotos por defecto
 *   node scripts/repair-missing-journey-uid.mjs 2026-09-01 ...  # días explícitos
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = path.resolve(__dirname, '..', 'data', 'truckflow')

const DEFAULT_DAYS = [
  '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01',
]

/** Cámaras de salida de San Lorenzo — cierran el journey siempre. */
const SL_EXIT = new Set(['SLZSalidaC1Fte', 'SLZSalidaC1Tras', 'SLZSalidaC2Fte', 'SLZSalidaC2Tras'])
/** Egreso Ricardone (portón + balanzas de egreso) — cierra sólo si no sigue a SL en 5 h. */
const RIC_EXIT = new Set(['RicEgrCamFrente', 'RicEgrCamTraser', 'RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso'])
/** Ingreso San Lorenzo — presencia que "continúa" un egreso Ricardone (Ric→SL). */
const SL_ING = new Set(['SLZIngCamFrente', 'SLZIngCamTrasera'])
/** Ingreso Ricardone — re-entrar a Ricardone arranca un nuevo ciclo (transile: salen y entran). */
const RIC_ING = new Set(['RicIngCamFrente', 'RicIngCamTrasera'])

const H5_MS = 5 * 3600_000
const H6_MS = 6 * 3600_000
const ID_BASE = 1_000_000_000 // ids sintéticos, claramente fuera del rango real (~5e5)
/**
 * Cuando el export se rompió (sin journeyUid/id) empezó también a mandar la MISMA cámara
 * repetida decenas de veces para una patente (spam de lecturas que el upstream deduplicaba:
 * en días buenos hay 0 pares consecutivos mismo-device). Sin deduplicar, esos journeys
 * quedan con 50+ eventos (los reales topean en ~11) y revientan la memoria del browser al
 * calcular los KPI por tramo. Se colapsa una lectura si repite el device de su predecesor
 * inmediato dentro de esta ventana.
 */
const DEDUP_SAME_DEVICE_WINDOW_MS = 15 * 60_000

function ts(e) {
  const t = Date.parse(e.occurredAt ?? e.recordedAt ?? '')
  return Number.isFinite(t) ? t : 0
}

/** ¿Es un evento de San Lorenzo? (cualquier cámara SLZ* o Renova Ren*). */
function isSlDevice(dev) {
  return /^SLZ|^Ren/.test(String(dev ?? ''))
}

/**
 * ¿Arranca un nuevo journey el evento `cur` respecto del anterior `prev` de la misma patente?
 * `segSawSl` = el segmento actual ya pasó por alguna cámara de San Lorenzo.
 *
 * Regla del upstream (confirmada por el usuario) — el viaje termina cuando el camión SALE de SL:
 *  - Salida SLZ SIEMPRE termina el journey (terminador duro).
 *  - Re-entrar a Ricardone (RicIng) arranca ciclo nuevo SOLO si el camión YA pasó por San Lorenzo
 *    (es una vuelta / transile). Si todavía no fue a SL, está cargando (pellet: pesa → re-entra →
 *    carga en tolvas por horas → recién ahí va a SL): NO cortar, es el mismo viaje.
 *  - Un SEGUNDO paso por SL en el mismo segmento = nueva visita → corta.
 *  - Egreso Ricardone cierra sólo si en 5 h NO aparece ni ingreso SL ni una re-entrada a Ricardone.
 *    Si re-entra, sigue activo (carga de pellet); no es un despacho que se fue.
 *  - Fallback: hueco ≥ 6 h.
 */
function startsNewJourney(prev, cur, plateEvents, curIdx, segSawSl) {
  // Salida SLZ: termina acá, sí o sí. Las lecturas de salida consecutivas (frente+trasera
  // de la misma salida física) quedan en el journey que cierra; el corte es antes del
  // siguiente evento que NO es salida.
  if (SL_EXIT.has(prev.deviceCode) && !SL_EXIT.has(cur.deviceCode)) return true
  if (RIC_ING.has(cur.deviceCode) && segSawSl) return true // re-entra a Ric tras ir a SL: nuevo ciclo.
  if (SL_ING.has(cur.deviceCode) && segSawSl) return true // segunda visita a SL.
  if (RIC_EXIT.has(prev.deviceCode)) {
    // Cierra sólo si en 5 h no hay ingreso SL NI re-entrada a Ricardone (si re-entra, sigue cargando).
    const t0 = ts(prev)
    for (let j = curIdx; j < plateEvents.length && ts(plateEvents[j]) - t0 <= H5_MS; j++) {
      const dv = plateEvents[j].deviceCode
      if (SL_ING.has(dv) || RIC_ING.has(dv)) return false // sigue el mismo viaje (Ric→SL o carga)
    }
    return true
  }
  if (ts(cur) - ts(prev) >= H6_MS) return true // fallback hueco largo
  return false
}

function repairDay(day) {
  const dir = path.join(DATA_ROOT, day)
  const file = path.join(dir, 'event-list.json')
  const backup = path.join(dir, 'event-list.raw.json')
  if (!existsSync(file)) {
    console.log(`[${day}] SIN ARCHIVO event-list.json — salteo`)
    return
  }

  // Fuente pristina: si ya hay backup, re-reparar desde él (idempotente).
  const src = existsSync(backup) ? backup : file
  const doc = JSON.parse(readFileSync(src, 'utf8'))
  const records = doc.records ?? doc.value ?? doc.data ?? []
  if (!Array.isArray(records) || records.length === 0) {
    console.log(`[${day}] sin records — salteo`)
    return
  }

  const nullUid = records.filter((e) => e.journeyUid == null).length
  if (nullUid === 0 && src === file) {
    console.log(`[${day}] journeyUid ya presente (${records.length} eventos) — nada que reparar`)
    return
  }

  // Backup del original una sola vez (preserva el crudo exacto de la nube).
  if (!existsSync(backup)) writeFileSync(backup, readFileSync(file, 'utf8'))

  // 1) Agrupar por patente y ordenar por tiempo (estable por índice original).
  const withIdx = records.map((e, i) => ({ e, i }))
  const byPlate = new Map()
  for (const it of withIdx) {
    const p = String(it.e.truckPlate ?? '').trim() || '__SIN_PATENTE__'
    if (!byPlate.has(p)) byPlate.set(p, [])
    byPlate.get(p).push(it)
  }

  let journeys = 0
  let splits = 0
  let dropped = 0
  let gid = 0 // id global de journey por archivo (único en los primeros 12 chars del uid)
  const kept = new Set() // eventos que sobreviven la deduplicación

  for (const [plate, items] of byPlate) {
    items.sort((a, b) => ts(a.e) - ts(b.e) || a.i - b.i)
    // 1a) Deduplicar spam: descartar una lectura que repite el device de su predecesor
    // inmediato dentro de la ventana (el upstream lo hacía; días buenos = 0 duplicados).
    const evs = []
    for (const it of items) {
      const prev = evs[evs.length - 1]
      if (prev && prev.deviceCode === it.e.deviceCode && ts(it.e) - ts(prev) < DEDUP_SAME_DEVICE_WINDOW_MS) {
        dropped++
        continue
      }
      evs.push(it.e)
      kept.add(it.e)
    }
    // 1b) Partir en journeys por la regla de cámaras de salida y estampar uid/seq.
    // El uid lleva un id global único ANTES de todo (SYN000123-...): el merge del ETL
    // trunca a 12 chars (etlJourneyMerge) y con el prefijo de fecha compartido todos los
    // uid colisionaban (`merged_SYN-2026-08-__SYN-2026-08-`), rompiendo el mapa journey→día.
    let seg = 1
    let seqInJourney = 0
    let segSawSl = false
    let currentUid = ''
    for (let k = 0; k < evs.length; k++) {
      if (k > 0 && startsNewJourney(evs[k - 1], evs[k], evs, k, segSawSl)) {
        seg++
        splits++
        seqInJourney = 0
        segSawSl = false
      }
      seqInJourney++
      if (seqInJourney === 1) {
        journeys++
        gid++
        currentUid = `SYN${String(gid).padStart(6, '0')}-${plate}-${day}-${seg}`
      }
      if (isSlDevice(evs[k].deviceCode)) segSawSl = true
      evs[k].journeyUid = currentUid
      evs[k].sequenceNumber = seqInJourney
    }
  }

  // 2) Solo los eventos que sobrevivieron la dedup, en su orden original.
  const keptRecords = records.filter((e) => kept.has(e))

  // 3) Reasignar id: entero creciente en orden temporal global (desempate estable).
  const ordered = keptRecords.map((e, i) => ({ e, i })).sort((a, b) => ts(a.e) - ts(b.e) || a.i - b.i)
  ordered.forEach((it, k) => {
    it.e.id = ID_BASE + k
  })

  doc.recordCount = keptRecords.length
  doc.records = keptRecords
  doc.repairedBy = 'repair-missing-journey-uid.mjs'
  doc.repairedAt = new Date().toISOString()

  writeFileSync(file, JSON.stringify(doc, null, 2))
  const plates = [...byPlate.keys()].filter((p) => p !== '__SIN_PATENTE__').length
  console.log(
    `[${day}] OK — ${keptRecords.length} eventos (${dropped} duplicados descartados de ${records.length}) | ` +
      `${plates} patentes | ${journeys} journeys sintéticos (${splits} cortes) | backup: event-list.raw.json`
  )
}

const days = process.argv.slice(2)
const targets = days.length ? days : DEFAULT_DAYS
console.log(`Reparando ${targets.length} día(s): ${targets.join(', ')}\n`)
for (const d of targets) repairDay(d)
console.log('\nListo. Re-corré el ETL de las ventanas afectadas para tomar los datos reparados.')
