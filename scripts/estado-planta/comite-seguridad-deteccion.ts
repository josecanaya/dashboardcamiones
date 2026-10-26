/**
 * Comité de Seguridad Nodo Sur — detección de casos a partir de las cámaras (y del Excel si está).
 * La maqueta la arma gen_comite_seguridad.py leyendo el datos.json que deja este script.
 *
 * Uso:
 *   node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts <desde> <hasta> [carpeta_salida]
 *   node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts 2026-10-05 2026-10-11
 * COMITE_DATA_ROOT=<carpeta data> permite leer los datos de otra copia del repo (p. ej. desde un worktree).
 *
 * Entradas:
 *   - data/truckflow/<día>/event-list.json, del día anterior al siguiente: la hora operativa es la de la
 *     cámara + 206 min (getEventOperationalInstantIso), así que el día operativo empieza en el archivo del
 *     día anterior.
 *   - Correcciones de patentes de «En vivo» (GET /api/truckflow/live/corrections, igual que el ETL). Si el
 *     servidor no está, usa la copia guardada en <salida>/correcciones-en-vivo.json.
 *   - data/movimientos/<día>/movimientos.json (Excel MovimientosPorContrato normalizado). Los días del
 *     período que falten quedan «pendientes de Excel»; todos los días disponibles forman el padrón de patentes.
 *
 * Salida: <salida>/datos.json y CSV de control por regla.
 *
 * Reglas (las del comité 24/09–04/10):
 *   - Vuelta a Ricardone: visita a Ricardone con calada → visita al puerto sin lectura de volcable →
 *     reingreso directo a Ricardone (ingreso o calada, sin pre-ingreso) antes de 12 h. Con Excel se confirma si no hay operación en el puerto para
 *     esa visita; sin Excel queda como candidato.
 *   - Interplanta: egreso Ricardone → cámara de ingreso San Lorenzo, más de 20 min (norma; COMITE_INTERPLANTA_MIN) y hasta 2 h, sin lectura en la calada
 *     del puerto hasta la salida. Fuera líquidos (lecturas en puntos de líquidos de cualquiera de las plantas).
 *   - Dos calles: en una misma visita al puerto, lecturas de dos cámaras de volcable distintas.
 *   - Volcable declarado vs calle (solo con Excel): plataforma VOLCABLE PTO N y la cámara de la calle de
 *     esa visita no incluye la N.
 *   - Camionetas, utilitarios y traffics: patentes válidas con ≥10 viajes de cámara (journeys) en el período
 *     que no figuran en ningún Excel disponible.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { normalizeRealEventPoint } from '../../src/etl-core/domain/eventNormalization.ts'
import { getEventOperationalInstantIso } from '../../src/services/live/liveEventTime.ts'
import { applyLiveCorrections, type LiveCorrectionsDocument } from '../../src/services/liveCorrections.ts'
import type { RealJourneyEventDto } from '../../src/etl-core/domain/journeyEvents.types'

const ROOT = resolve(import.meta.dirname, '..', '..')
const DATA = resolve(process.env.COMITE_DATA_ROOT || join(ROOT, 'data'))
const [desde, hasta, outArg] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) {
  console.error('Uso: comite-seguridad-deteccion.ts <desde YYYY-MM-DD> <hasta YYYY-MM-DD> [salida]')
  process.exit(1)
}
const OUT = resolve(outArg ?? join(ROOT, 'reportes', 'logistica', `${desde}_${hasta}`, 'comite-seguridad'))
mkdirSync(OUT, { recursive: true })

const DAY_MS = 86_400_000
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => { const o: string[] = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o }
const PERIOD_DAYS = daysBetween(desde, hasta)
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const PLATE_RE = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/
const H = 3600_000

// ---------- cámaras
const camDays: string[] = []
const seen = new Set<number | string>()
let raw: RealJourneyEventDto[] = []
for (const d of daysBetween(addDays(desde, -1), addDays(hasta, 1))) {
  const f = join(DATA, 'truckflow', d, 'event-list.json')
  if (!existsSync(f)) continue
  if (PERIOD_DAYS.includes(d)) camDays.push(d)
  const recs = JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')).records as RealJourneyEventDto[]
  for (const e of recs) {
    const k = (e as { id?: number }).id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`
    if (seen.has(k)) continue
    seen.add(k)
    raw.push(e)
  }
}

// ---------- correcciones de En vivo
const corrFile = join(OUT, 'correcciones-en-vivo.json')
let corrections: LiveCorrectionsDocument | null = null
let corrSource = 'ninguna'
try {
  const port = process.env.TRUCKFLOW_LOCAL_SERVER_PORT || '8787'
  const res = await fetch(`http://127.0.0.1:${port}/api/truckflow/live/corrections`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  corrections = (await res.json()) as LiveCorrectionsDocument
  writeFileSync(corrFile, JSON.stringify(corrections))
  corrSource = 'servidor local'
} catch {
  if (existsSync(corrFile)) { corrections = JSON.parse(readFileSync(corrFile, 'utf8')); corrSource = 'copia guardada' }
  else console.warn('[aviso] sin correcciones de En vivo (servidor apagado y sin copia)')
}
const corrected = applyLiveCorrections(raw, corrections)
raw = corrected.events

type Read = { plate: string; t: number; day: string; hm: string; site: 'ric' | 'sl' | '?'; logical: string; device: string; uid: string }
const reads: Read[] = []
for (const e of raw) {
  const plate = String(e.normalizedPlate || e.truckPlate || '').trim().toUpperCase()
  if (!plate) continue
  const iso = getEventOperationalInstantIso(e)
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) continue
  const pt = normalizeRealEventPoint(e)
  if (pt.logicalCode.includes('TRASERA_EXCLUIDA')) continue
  const dev = String(e.deviceCode ?? '')
  const site = pt.siteId === 'ricardone' || dev.startsWith('Ric') ? 'ric' : pt.siteId === 'san_lorenzo' || /^(SLZ|Ren)/.test(dev) ? 'sl' : '?'
  reads.push({ plate, t, day: iso.slice(0, 10), hm: iso.slice(11, 16), site, logical: pt.logicalCode, device: dev, uid: String(e.journeyUid ?? '') })
}
reads.sort((a, b) => a.t - b.t)
const inPeriod = (r: { day: string }) => r.day >= desde && r.day <= hasta

const byPlate = new Map<string, Read[]>()
for (const r of reads) {
  if (!byPlate.has(r.plate)) byPlate.set(r.plate, [])
  byPlate.get(r.plate)!.push(r)
}

// Visitas: lecturas consecutivas en la misma planta; un hueco de más de 16 h abre otra visita.
type Visit = { site: 'ric' | 'sl'; reads: Read[]; start: number; end: number }
function visitsOf(list: Read[]): Visit[] {
  const out: Visit[] = []
  for (const r of list) {
    if (r.site === '?') continue
    const last = out[out.length - 1]
    if (last && last.site === r.site && r.t - last.end <= 16 * H) { last.reads.push(r); last.end = r.t; continue }
    out.push({ site: r.site, reads: [r], start: r.t, end: r.t })
  }
  return out
}
const has = (v: Visit, ...codes: string[]) => v.reads.some((r) => codes.includes(r.logical))
const CARGA_RIC = ['CARGA_S7', 'CARGA_S8', 'CELDA16_CARGA', 'PLAYA']
const first = (v: Visit, ...codes: string[]) => v.reads.find((r) => codes.includes(r.logical))
const lastOf = (v: Visit, ...codes: string[]) => [...v.reads].reverse().find((r) => codes.includes(r.logical))
// Líquidos: puntos de líquidos del puerto (Renova, OSL, balanzas de líquidos). RicCalLiq no cuenta: también
// pasan por ahí los transiles de pellet (p. ej. VJG112, 30/09).
const isLiquid = (v: Visit) => v.reads.some((r) => /^SL_LIQUIDO/.test(r.logical) || /^(Ren|SLZBalLiq)/.test(r.device))
// Grano: caló en Ricardone (camión de productor), o transile (Playa 3 / puntos de carga / calada de líquidos,
// por donde pasa el pellet). Los que solo tienen egreso (residuos, servicios) quedan afuera.
const isGrain = (ric: Visit) => has(ric, 'CALADA', 'LIQUIDO', ...CARGA_RIC)
const calle = (r: Read) => (r.device.match(/SLZVolcableC(\d)/) ?? [])[1] ?? ''
const firstByCalle = (vol: Read[]) => [...new Set(vol.map(calle))].map((c) => vol.find((r) => calle(r) === c)!).sort((a, b) => a.t - b.t)
const fmtDur = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m` }

// ---------- Excel
type Mov = { plate: string; planta: string; plataforma: string; producto: string; ingreso: number; salida: number; day: string; kg: string }
const movRoot = join(DATA, 'movimientos')
const excelDays: string[] = []
const excelAll: string[] = []
const knownPlates = new Set<string>()
const movsPeriod: Mov[] = []
const movsContraste: Mov[] = []   // período + el día siguiente, para cruzar casos con la balanza
const localMs = (s: string) => (s ? Date.parse(`${s}-03:00`) : NaN)
if (existsSync(movRoot)) {
  for (const d of readdirSync(movRoot).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    const f = join(movRoot, d, 'movimientos.json')
    if (!existsSync(f)) continue
    excelAll.push(d)
    const inP = PERIOD_DAYS.includes(d)
    if (inP) excelDays.push(d)
    for (const x of JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>[]) {
      const p = String(x.plate_normalized || x.patente_original || '').toUpperCase().trim()
      if (p) knownPlates.add(p)
      const mv = { plate: p, planta: x.planta_normalized, plataforma: x.platform_normalized || x.plataforma_original, producto: x.product_normalized || x.producto_original,
        ingreso: localMs(x.external_ingreso_at), salida: localMs(x.external_salida_at), day: d, kg: x.kgs_neto }
      if (inP) movsPeriod.push(mv)
      if (inP || d === addDays(hasta, 1)) movsContraste.push(mv)   // data/movimientos se parte por día de salida
    }
  }
}
const excelCovers = (day: string) => excelDays.includes(day)
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
const fmtOp = (o: Mov) => [cap(String(o.producto ?? '')), String(o.plataforma ?? '').replace(/^VOLCABLE_PTO_(\d)$/, 'Volcable $1')].filter(Boolean).join(' · ')
const portOps = (plate: string, a: number, b: number) =>
  movsPeriod.filter((m) => m.plate === plate && m.planta === 'TERMINAL_EMBARQUE' && Number.isFinite(m.ingreso) && m.ingreso <= b + 30 * 60000 && (Number.isFinite(m.salida) ? m.salida : m.ingreso) >= a - 30 * 60000)

let registry = new Set<string>()
try {
  const reg = JSON.parse(readFileSync(join(DATA, 'truck-registry', 'registry.json'), 'utf8'))
  registry = new Set((reg.entries ?? []).filter((x: { active?: boolean }) => x.active !== false).map((x: { plate: string }) => x.plate))
} catch { /* sin registro */ }

// ---------- reglas
type Item = { hora: string; punto: string; t: number }
const vueltas: Record<string, unknown>[] = []
// Norma del comité: el viaje Ricardone → puerto no debe pasar de 20 min (antes se usaba 30).
const UMBRAL_INTER = Number(process.env.COMITE_INTERPLANTA_MIN || 20)
const interplanta: { dia: string; salida: string; patente: string; tipo: string; descarga: string; min: number; ingresoSL: string; salidaSL: string; _t: number }[] = []
const viajesRicSL: number[] = []
const cercanos: { dia: string; salida: string; patente: string; min: number; motivo: string; _t: number }[] = []
const dosCalles: Record<string, unknown>[] = []
const declarado: Record<string, unknown>[] = []
const LBL: Record<string, string> = { PREINGRESO: 'Pre-ingreso', CALADA: 'Calada', EGRESO: 'Egreso', INGRESO: 'Ingreso',
  SL_INGRESO: 'Ingreso', SL_BALANZA_INGRESO: 'Balanza', SL_BALANZA_SALIDA: 'Balanza salida', SL_EGRESO: 'Egreso', SL_CALADA: 'Calado' }

for (const [plate, list] of byPlate) {
  if (!PLATE_RE.test(plate)) continue
  const vs = visitsOf(list)
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i]!
    if (v.site !== 'sl') continue
    const prev = i > 0 && vs[i - 1]!.site === 'ric' ? vs[i - 1]! : undefined

    // Interplanta (y viaje normal Ric → SL)
    if (prev) {
      // Salida de Ricardone = último egreso o balanza de egreso. Si después hay Playa 3 o carga, el camión
      // siguió adentro y su salida real no se leyó (transile de pellet: el Excel lo confirma, p. ej. UWX998
      // 01/10 salió 10:43 y no 10:01): ese viaje no se mide.
      const egr0 = lastOf(prev, 'EGRESO', 'BALANZA_EGRESO')
      const egr = egr0 && !prev.reads.some((r) => r.t > egr0.t && CARGA_RIC.includes(r.logical)) ? egr0 : undefined
      const ing = first(v, 'SL_INGRESO')
      if (egr && ing && ing.t > egr.t) {
        const min = Math.round((ing.t - egr.t) / 60000)
        if (min < 120) viajesRicSL.push(min)
        const calles = [...new Set(v.reads.filter((r) => r.logical === 'SL_VOLCABLE').map(calle))]
        // Solo calada de líquidos en Ricardone: cuenta como pellet únicamente si descargó en un volcable.
        const liqOnly = !has(prev, 'CALADA', ...CARGA_RIC)
        const grano = !isLiquid(v) && isGrain(prev) && !(liqOnly && !calles.length)
        if (inPeriod(egr) && grano && ((min > UMBRAL_INTER && min <= 120 && has(v, 'SL_CALADA')) || (min >= UMBRAL_INTER - 5 && min <= UMBRAL_INTER)))
          cercanos.push({ dia: ddmm(egr.day), salida: egr.hm, patente: plate, min, motivo: min > UMBRAL_INTER ? 'caló en el puerto' : `entre ${UMBRAL_INTER - 5} y ${UMBRAL_INTER} min`, _t: egr.t })
        if (inPeriod(egr) && min > UMBRAL_INTER && min <= 120 && !has(v, 'SL_CALADA') && grano) {
          interplanta.push({ dia: ddmm(egr.day), salida: egr.hm, patente: plate, min, ingresoSL: ing.hm, salidaSL: (lastOf(v, 'SL_EGRESO') ?? v.reads[v.reads.length - 1]!).hm,
            tipo: has(prev, 'CALADA') ? 'Calada en Ricardone' : 'Transile', descarga: calles.length ? `Volcable ${calles.join(' y ')}` : 'Sin volcable leído', _t: egr.t })
        }
      }
    }

    // Calles: dos calles en la misma visita, y volcable declarado vs calle (con Excel)
    const vol = v.reads.filter((r) => r.logical === 'SL_VOLCABLE')
    const cs = [...new Set(vol.map(calle))]
    if (cs.length >= 2 && inPeriod(vol[0]!)) {
      const ops = portOps(plate, v.start, v.end)
      dosCalles.push({ patente: plate, dia: ddmm(vol[0]!.day), calles: firstByCalle(vol).map((r) => ({ calle: calle(r), hora: r.hm })), involucraC5: cs.includes('5'),
        excel: excelCovers(vol[0]!.day) ? (ops.map(fmtOp).join(' / ') || 'Sin operación') : null, _t: vol[0]!.t })
    }
    if (cs.length && inPeriod(vol[0]!) && excelCovers(vol[0]!.day)) {
      for (const o of portOps(plate, v.start, v.end)) {
        const n = (String(o.plataforma).match(/VOLCABLE_PTO_(\d)/) ?? [])[1]
        if (n && !cs.includes(n)) declarado.push({ patente: plate, dia: ddmm(o.day), excel: `${cap(o.producto)} · Volcable ${n}`, calles: firstByCalle(vol).map((r) => ({ calle: calle(r), hora: r.hm })), involucraC5: n === '5' || cs.includes('5'), _t: vol[0]!.t })
      }
    }

    // Vuelta a Ricardone
    const ric1 = vs[i + 1]?.site === 'ric' ? vs[i + 1]! : undefined
    if (!prev || !ric1) continue
    if (!has(prev, 'CALADA') || has(prev, ...CARGA_RIC) || isLiquid(v) || vol.length) continue
    // La vuelta entra directo (ingreso / calada) en menos de 12 h. Si entra por el pre-ingreso es una carga
    // nueva: en 30/09–04/10 los tres casos así (OJD684, OKH237 ×2) tenían descarga en el Excel.
    if (!['INGRESO', 'CALADA', 'BALANZA_INGRESO'].includes(ric1.reads[0]!.logical)) continue
    if (new Set(v.reads.map((r) => r.logical)).size < 2) continue
    if (ric1.start - v.end > 12 * H) continue
    const slIn = v.reads[0]!
    if (!inPeriod(slIn)) continue
    const next = vs[i + 2]?.site === 'sl' ? vs[i + 2] : undefined
    const nextVol = next && first(next, 'SL_VOLCABLE')
    const nextOut = next && lastOf(next, 'SL_EGRESO')
    const nextCal = next && first(next, 'SL_CALADA')
    const ops = portOps(plate, v.start, v.end)
    const estado = !excelCovers(slIn.day) ? 'pendiente_excel' : ops.length ? 'descartado_excel' : 'confirmado_excel'
    const pick = (vv: Visit, codes: string[], lastFirst = false) => {
      const o: Item[] = []
      for (const c of codes) { const r = lastFirst ? lastOf(vv, c) : first(vv, c); if (r) o.push({ hora: r.hm, punto: LBL[c] ?? c, t: r.t }) }
      return o.sort((a, b) => a.t - b.t)
    }
    const calR1 = ric1.reads.filter((r) => r.logical === 'CALADA').filter((r, k, a) => k === 0 || r.t - a[k - 1]!.t > 20 * 60000)
    const g1 = pick(prev, ['CALADA', 'EGRESO'], true)
    const g2 = pick(v, ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_EGRESO'])
    const g2b = g2.length > 3 ? [g2[0]!, ...g2.slice(-2)] : g2
    const g3 = [...pick(ric1, ['INGRESO', 'PREINGRESO']).slice(0, 1), ...calR1.slice(0, 2).map((r, k) => ({ hora: r.hm, punto: `${k + 2}.ª calada`, t: r.t }))].sort((a, b) => a.t - b.t)
    const g4: Item[] = next ? [nextCal, nextVol, nextOut].filter(Boolean).map((r) => ({ hora: r!.hm, punto: r === nextVol ? `Volcable ${calle(r!)}` : LBL[r!.logical] ?? r!.logical, t: r!.t })).slice(-2) : []
    const slOut = lastOf(v, 'SL_EGRESO', 'SL_BALANZA_SALIDA') ?? v.reads[v.reads.length - 1]!
    const hastaRef = nextVol ?? nextOut
    vueltas.push({
      patente: plate, dia: ddmm(slIn.day), estado, _t: slIn.t,
      minPuerto: Math.round((v.end - v.start) / 60000), puertoTxt: fmtDur(v.end - v.start),
      hastaTxt: hastaRef ? fmtDur(hastaRef.t - slOut.t) : null, hastaLbl: nextVol ? 'hasta descargar' : nextOut ? 'hasta salir del puerto de nuevo' : null,
      balanzaSalida: has(v, 'SL_BALANZA_SALIDA'), caladasVuelta: calR1.length, descargaPosterior: nextVol ? `Volcable ${calle(nextVol)}` : null,
      grupos: [{ planta: 'ric', items: g1 }, { planta: 'sl', items: g2b }, { planta: 'ric', items: g3 }, ...(g4.length ? [{ planta: 'sl', items: g4 }] : [])]
        .map((g) => ({ planta: g.planta, items: g.items.map(({ hora, punto }) => ({ hora, punto })) })),
      excel: excelCovers(slIn.day) ? ops.map(fmtOp) : null,
      producto: next ? (portOps(plate, next.start, next.end).map((o) => cap(o.producto))[0] ?? null) : null,
      lecturas: [...prev.reads, ...v.reads, ...ric1.reads, ...(next?.reads ?? [])].map((r) => `${r.day} ${r.hm} ${r.device}`),
    })
  }
}

// ---------- camionetas / utilitarios sin Excel
const lev1 = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false
  return d === 1
}
const known = [...knownPlates].filter((p) => PLATE_RE.test(p))
const sinExcel: { patente: string; viajes: number; dias: number; zona: string; camaras: string; parecida: string; registro: boolean; porCamara: Record<string, number>; fotos: { device: string; at: string; hora: string; dia: string }[] }[] = []
// Foto de cada vehículo para la ficha «Vehículos Permitidos» (fotos-recorridos.cjs las baja del DSS): de día y en
// cámaras de frente, primero las de cada planta que mejor muestran el vehículo.
const FOTO_PREF = ['RicIngCamFrente', 'RicEgrCamFrente', 'SLZBalLiq2b', 'SLZIngCamFrente', 'RicPreIngInFr', 'SLZSalidaC1Fte', 'SLZBalIngFte', 'SLZTK400', 'SLZSalidaC2Fte']
for (const [plate, list] of byPlate) {
  if (!PLATE_RE.test(plate) || knownPlates.has(plate)) continue
  const rs = list.filter(inPeriod)
  if (!rs.length) continue
  const viajes = new Set(rs.map((r) => r.uid || r.day)).size
  if (viajes < 3) continue
  const sites = new Set(rs.map((r) => r.site).filter((s) => s !== '?'))
  const dev = new Map<string, number>()
  for (const r of rs) dev.set(r.device, (dev.get(r.device) ?? 0) + 1)
  sinExcel.push({ patente: plate, viajes, dias: new Set(rs.map((r) => r.day)).size,
    zona: sites.size === 2 ? 'Ricardone y San Lorenzo' : sites.has('ric') ? 'Ricardone' : 'San Lorenzo',
    camaras: [...dev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(' / '),
    parecida: known.filter((k) => lev1(k, plate)).slice(0, 3).join(' '), registro: registry.has(plate),
    porCamara: Object.fromEntries(dev),
    fotos: (() => {   // hasta 2 lecturas de día (10–17 h operativas), una por planta, en la cámara preferida
      const dia_ = rs.filter((r) => r.hm >= '10:00' && r.hm <= '17:00')
      const rank = (r: Read) => { const i = FOTO_PREF.indexOf(r.device); return i < 0 ? 99 : i }
      const out: Read[] = []
      for (const site of ['ric', 'sl'] as const) {
        const best = [...(dia_.length ? dia_ : rs)].filter((r) => r.site === site).sort((a, b) => rank(a) - rank(b) || b.t - a.t)[0]
        if (best && rank(best) < 99) out.push(best)
      }
      return out.map((r) => ({ device: r.device, at: new Date(r.t).toISOString(), hora: r.hm, dia: ddmm(r.day) }))
    })() })
}
sinExcel.sort((a, b) => b.viajes - a.viajes || a.patente.localeCompare(b.patente))
// Igual que el comité anterior: entran también las parecidas a una patente del Excel y las del registro
// de particulares (quedan marcadas en el CSV).
const camionetas = sinExcel.filter((x) => x.viajes >= 10)

// ---------- balanza (SGC) y ETL: lo que las reglas de cámaras solas no ven
// data/sgc/<día>/ingresos.json = la vista SGC por NROINGRESO; PLANTA SAN LORENZO es la fábrica de Ricardone
// (server/sgc/sgcMovimientos.mjs). Horas del SGC en hora local.
const NOMBRE: Record<string, string> = {
  INGRESO: 'Ingreso', PREINGRESO: 'Pre-ingreso', CALADA: 'Calada', EGRESO: 'Egreso', BALANZA_INGRESO: 'Balanza ingreso', BALANZA_EGRESO: 'Balanza egreso',
  PLAYA: 'Playa 3', VOLCABLE: 'Volcable', LIQUIDO: 'Calada líquidos', SL_INGRESO: 'Ingreso puerto', SL_CALADA: 'Calada puerto',
  SL_BALANZA_INGRESO: 'Balanza puerto', SL_VOLCABLE: 'Volcable', SL_BALANZA_SALIDA: 'Balanza salida puerto', SL_EGRESO: 'Salida puerto', UNKNOWN: 'Cámara sin punto',
}
const nombre = (r: Read) => (r.logical === 'SL_VOLCABLE' && calle(r) ? `Volcable ${calle(r)}` : NOMBRE[r.logical] ?? r.logical.replace(/_/g, ' ').toLowerCase())
const recorrido = (rs: Read[]) => rs.filter((r, i) => i === 0 || nombre(r) !== nombre(rs[i - 1]!)).map((r) => `${nombre(r)} ${r.hm}`)
const sgcRaw: Record<string, Record<string, any>> = {}
for (const d of daysBetween(addDays(desde, -1), addDays(hasta, 2))) {
  const f = join(DATA, 'sgc', d, 'ingresos.json')
  if (existsSync(f)) Object.assign(sgcRaw, JSON.parse(readFileSync(f, 'utf8')))
}
const sgcPeriodo = Object.values(sgcRaw).filter((r) => { const d = String(r.FECHAINGRESO ?? '').slice(0, 10); return d >= desde && d <= hasta })
const plantaSgc = (p: string) => (/TERMINAL/.test(p) ? 'Puerto' : /SAN LORENZO/.test(p) ? 'Ricardone' : p.replace(/^PLANTA /, '').toLowerCase())
const hmLocal = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`
// 1 · Entraron y salieron sin peso (grano y aceite en Ricardone o el puerto): rechazo o pasado de kilos. Las cámaras
// dicen qué hizo adentro y si después fue al puerto (12 h).
const sinPesar = sgcPeriodo
  .filter((r) => r.FECHASALIDA && !(Number(r.PESONETO) > 0) && /SOJA|GIRASOL|ACEITE|MAIZ|TRIGO/.test(r.PRODUCTO) && /SAN LORENZO|TERMINAL/.test(r.PLANTA))
  .map((r) => {
    const ing = localMs(r.FECHAINGRESO), sal = localMs(r.FECHASALIDA)
    const plates = [r.PATENTECAMION, r.PATENTEACOPLADO].map((p) => String(p ?? '').toUpperCase()).filter(Boolean)
    const rs = plates.flatMap((p) => byPlate.get(p) ?? []).sort((a, b) => a.t - b.t)
    const adentro = rs.filter((x) => x.t >= ing - H && x.t <= sal + 0.5 * H)
    const despues = rs.filter((x) => x.t > sal + 0.5 * H && x.t <= sal + 12 * H)
    const puerto = despues.filter((x) => x.site === 'sl')
    const volc = puerto.filter((x) => x.logical === 'SL_VOLCABLE')
    const planta = plantaSgc(r.PLANTA)
    // fue al puerto con un ingreso propio de la terminal (otro NROINGRESO): operación del sistema, no alerta (AA400OA 22/10)
    const conIngreso = Object.values(sgcRaw).find((o) => o.PATENTECAMION === r.PATENTECAMION && /TERMINAL/.test(o.PLANTA) && localMs(o.FECHAINGRESO) > ing && localMs(o.FECHAINGRESO) < sal + 12 * H)
    const destino = planta === 'Puerto' ? '' : !puerto.length ? 'No fue al puerto' : conIngreso ? `Fue al puerto con su ingreso de la terminal (${hmLocal(conIngreso.FECHAINGRESO).slice(-5)})`
      : volc.length ? `Fue al puerto y descargó (${nombre(volc[0]!)} ${volc[0]!.hm})` : `Fue al puerto (${puerto[0]!.hm}) sin lectura de volcable`
    return { _t: ing, patente: r.PATENTECAMION, producto: String(r.PRODUCTO).toLowerCase(), planta, ingreso: hmLocal(r.FECHAINGRESO), salida: hmLocal(r.FECHASALIDA),
      minutos: Math.round((sal - ing) / 60000), brutoKg: r.PESOBRUTO ?? null, nroIngreso: r.NROINGRESO,
      adentro: adentro.length ? recorrido(adentro).slice(0, 6).join(' → ') : 'Sin lecturas de cámara', destino, alerta: Boolean(puerto.length && planta === 'Ricardone' && !conIngreso) }
  })
// 1b · Pasado de kilos por balanza: ingreso de grano al puerto que sale sin peso (la balanza lo rechaza), vuelve a
// Ricardone a bajar el excedente y entra de nuevo al puerto con otro NROINGRESO y peso (21/10: BMF567, JJV417, UMT456).
// Sin segundo ingreso todavía = rechazado, a seguir. El segundo bruto dice a cuánto tuvo que bajar.
const sgcTodo = Object.values(sgcRaw)
const pasadosKg = sgcPeriodo
  .filter((r) => /TERMINAL/.test(r.PLANTA) && r.FECHASALIDA && !(Number(r.PESONETO) > 0) && /^(SOJA|GIRASOL|MAIZ|TRIGO)/.test(r.PRODUCTO))   // grano, no aceite
  .map((r) => {
    const ing = localMs(r.FECHAINGRESO), sal = localMs(r.FECHASALIDA)
    const otro = sgcTodo.filter((o) => o.PATENTECAMION === r.PATENTECAMION && o.NROINGRESO !== r.NROINGRESO && localMs(o.FECHAINGRESO) > sal && localMs(o.FECHAINGRESO) < sal + 24 * H)
      .sort((a, b) => localMs(a.FECHAINGRESO) - localMs(b.FECHAINGRESO))[0]
    const rs = byPlate.get(String(r.PATENTECAMION).toUpperCase()) ?? []
    const hasta2 = otro ? localMs(otro.FECHAINGRESO) : sal + 12 * H
    const primero = rs.filter((x) => x.t >= ing - H && x.t <= sal + 0.5 * H)
    const enRic = rs.filter((x) => x.t > sal && x.t < hasta2 && x.site === 'ric')
    const segundo = otro ? rs.filter((x) => x.t >= localMs(otro.FECHAINGRESO) - H && x.t <= localMs(otro.FECHASALIDA) + 0.5 * H && x.site === 'sl') : []
    return { _t: ing, patente: r.PATENTECAMION, producto: String(r.PRODUCTO).toLowerCase(), primerIngreso: hmLocal(r.FECHAINGRESO), primeraSalida: hmLocal(r.FECHASALIDA),
      primerViaje: primero.length ? recorrido(primero.filter((x) => x.site === 'sl')).join(' → ') || recorrido(primero).slice(-3).join(' → ') : 'Sin lecturas de cámara',
      ricardone: enRic.length ? recorrido(enRic).slice(0, 5).join(' → ') : 'Sin lecturas en Ricardone',
      segundoIngreso: otro ? hmLocal(otro.FECHAINGRESO) : null, segundaSalida: otro?.FECHASALIDA ? hmLocal(otro.FECHASALIDA) : null,
      brutoFinalKg: otro?.PESOBRUTO ?? null, netoFinalKg: otro?.PESONETO ?? null, segundoViaje: recorrido(segundo).slice(-3).join(' → '),
      estado: !otro ? 'sin_reingreso' : enRic.length ? 'volvio_a_ricardone' : 'reingreso_sin_ricardone',
      ...visitasCompletas([r.PATENTECAMION, r.PATENTEACOPLADO], ing - 2 * H, (otro?.FECHASALIDA ? localMs(otro.FECHASALIDA) : sal + 12 * H) + H, [ing - H, sal + 0.5 * H]) }
  })
// Recorrido completo de un camión en una ventana: lecturas de la patente o el acoplado y, del algoritmo por lote
// (outputs/demostracion_lote), los pasos reconstruidos (captura sin patente legible asignada) y deducidos (sin captura).
function lotePunto(n: string): string | undefined { return ({
  'ricardone:Ingreso': 'Ingreso', 'ricardone:Pre ingreso': 'Pre-ingreso', 'ricardone:Calada': 'Calada', 'ricardone:Salida 2': 'Egreso',
  'san_lorenzo:Ingreso': 'Ingreso puerto', 'san_lorenzo:Balanza Ingreso': 'Balanza puerto', 'san_lorenzo:Plataformas Volcables': 'Volcable',
  'san_lorenzo:Balanza Egreso': 'Balanza salida puerto', 'san_lorenzo:Egreso': 'Salida puerto',
  } as Record<string, string>)[n] }
function pasosLote(placa: string, desdeMs: number, hastaMs: number) {
  const dir = join(resolve(DATA, '..'), 'outputs', 'demostracion_lote')
  const out: { t: number | null; planta: 'ric' | 'sl'; punto: string; estado: 'reconstruida' | 'deducida'; leyo: string; viaje: number; device: string }[] = []
  let viaje = 0
  // una sola corrida del lote: la que cubre el día y termina más tarde (varias corridas repiten los mismos viajes)
  const dia = new Date(desdeMs + 2 * H - 3 * H).toISOString().slice(0, 10)
  const cubre = (existsSync(dir) ? readdirSync(dir) : []).map((n) => n.match(/^lote_semana_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json$/))
    .filter((m): m is RegExpMatchArray => !!m && m[1]! <= dia && m[2]! >= dia).sort((a, b) => b[2]!.localeCompare(a[2]!))
  for (const f of cubre.slice(0, 1).map((m) => m[0])) {
    const L = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    for (const c of (L.porCamion as any[]).filter((k) => k.plate === placa && Date.parse(k.ing) >= desdeMs && Date.parse(k.ing) <= hastaMs)) {
      viaje++
      for (const p of c.pasosDetalle as any[]) {
        if (p.estado !== 'reconstruida' && !String(p.estado).startsWith('deducida')) continue
        const vol = (String(p.device ?? '').match(/SLZVolcableC(\d)/) ?? [])[1]
        out.push({ t: p.t ? Date.parse(p.t) : null, planta: String(p.node).startsWith('ricardone') ? 'ric' : 'sl',
          punto: vol ? `Volcable ${vol}` : lotePunto(p.node) ?? String(p.node).split(':')[1]!, estado: p.estado === 'reconstruida' ? 'reconstruida' : 'deducida', leyo: p.read ?? '', viaje, device: String(p.device ?? '') })
      }
    }
  }
  return out
}
// sinDescarga: ventana del ingreso que la balanza no pesó; ahí el algoritmo no puede ubicar una descarga (JJV417 21/10 08:38)
function visitasCompletas(placas: unknown[], desdeMs: number, hastaMs: number, sinDescarga?: [number, number]) {
  type Item = { t: number; punto: string; hora: string; dia: string; estado: 'camara' | 'reconstruida'; leyo?: string; device: string; at: string }   // device + at: para pedir la foto al DSS
  const pl = placas.map((p) => String(p ?? '').toUpperCase()).filter(Boolean)
  const items: (Item & { planta: 'ric' | 'sl' })[] = pl.flatMap((p) => byPlate.get(p) ?? [])
    .filter((x) => x.t >= desdeMs && x.t <= hastaMs && x.site !== '?')
    .map((x) => ({ t: x.t, planta: x.site as 'ric' | 'sl', punto: nombre(x), hora: x.hm, dia: ddmm(x.day), estado: 'camara' as const, leyo: x.plate, device: x.device, at: new Date(x.t).toISOString() }))
  const lote = pl[0] ? pasosLote(pl[0], desdeMs, hastaMs) : []
  const hmL = (ms: number) => new Date(ms - 3 * H).toISOString()
  for (const p of lote) if (p.estado === 'reconstruida' && p.t && !(sinDescarga && p.punto.startsWith('Volcable') && p.t >= sinDescarga[0] && p.t <= sinDescarga[1])) items.push({ t: p.t, planta: p.planta, punto: p.punto, hora: hmL(p.t).slice(11, 16), dia: ddmm(hmL(p.t).slice(0, 10)), estado: 'reconstruida', leyo: p.leyo, device: p.device, at: new Date(p.t).toISOString() })
  items.sort((a, b) => a.t - b.t)
  const out: { planta: 'ric' | 'sl'; items: Item[] }[] = []
  for (const x of items) {
    let v = out[out.length - 1]
    if (!v || v.planta !== x.planta) { v = { planta: x.planta, items: [] }; out.push(v) }
    const ult = v.items[v.items.length - 1]
    if (ult && ult.punto === x.punto) continue
    const { planta: _p, ...it } = x
    v.items.push(it)
  }
  return { visitas: out, deducidos: lote.filter((p) => p.estado === 'deducida').map((p) => ({ viaje: p.viaje, planta: p.planta, punto: p.punto })) }
}
// 2 · Anomalías de comportamiento del ETL (final_circuits.anomaly_kind_reason) en las corridas semanales que cubren el período
const ETL_MOTIVOS: Record<string, string> = {
  SL_VISITA_RELAMPAGO_SIN_OPERAR: 'Visita relámpago al puerto sin operar',
  RIC_REINGRESO_RAPIDO_NO_PELLET: 'Reingreso rápido a Ricardone',
  SL_RIC_2H_ERROR_DESTINO_NO_PELLET: 'Del puerto a Ricardone en menos de 2 h (error de destino)',
}
const etlCasos: { _t: number; patente: string; dia: string; motivo: string; circuito: string; lecturas: string }[] = []
let lunes = new Date(Date.parse(`${desde}T12:00:00Z`)); lunes = new Date(lunes.getTime() - ((lunes.getUTCDay() + 6) % 7) * DAY_MS)
for (let l = lunes.toISOString().slice(0, 10); l <= hasta; l = addDays(l, 7)) {
  const f = join(resolve(DATA, '..'), 'runs', 'windows', `${l}_${addDays(l, 6)}`, 'tables', 'final_circuits.json')
  if (!existsSync(f)) continue
  const t = JSON.parse(readFileSync(f, 'utf8')); const rows: Record<string, any>[] = Array.isArray(t) ? t : t.rows
  for (const x of rows) {
    const motivo = ETL_MOTIVOS[x.anomaly_kind_reason]
    if (!motivo) continue
    // recorridos unidos por el ETL: merged_<prefijo uid>__<prefijo uid>
    const uid = String(x.journey_uid), partes = uid.startsWith('merged_') ? uid.slice(7).split('__') : [uid]
    const rs = (byPlate.get(String(x.normalized_plate)) ?? reads).filter((r) => partes.some((pp) => r.uid === pp || (uid.startsWith('merged_') && r.uid.startsWith(pp))))
    if (!rs.length || !inPeriod(rs[0]!)) continue
    etlCasos.push({ _t: rs[0]!.t, patente: x.normalized_plate, dia: ddmm(rs[0]!.day), motivo, circuito: x.executive_circuit_code || '', lecturas: recorrido(rs).slice(0, 8).join(' → '),
      ...contraste(String(x.normalized_plate), rs[0]!.t, rs[rs.length - 1]!.t, motivo) })
  }
}
// Cada caso del ETL contra el sistema (movimientos de balanza: SGC o Excel), el algoritmo por lote
// (outputs/demostracion_lote/lote_semana_<desde>_<hasta>.json, scripts/demostracion/lote.mjs) y lo que se
// decidió en En vivo (data/plant-state-manual-overrides.json).
function contraste(patente: string, t0: number, t1: number, motivo: string) {
  const hmL = (ms: number) => new Date(ms - 3 * H).toISOString().slice(11, 16)
  const ops = movsContraste.filter((o) => o.plate === patente && (o.salida || o.ingreso) >= t0 - 12 * H && o.ingreso <= t1 + 12 * H)   // ±12 h: el ingreso puede ser horas después del recorrido marcado (AD549AY 21/10)
  const cerca = [...ops].sort((a, b) => Math.abs(a.ingreso - t0) - Math.abs(b.ingreso - t0)).slice(0, 2).sort((a, b) => a.ingreso - b.ingreso)   // los dos movimientos más cercanos al recorrido
  const sistema = cerca.length ? cerca.map((o) => `${o.planta === 'RICARDONE' ? 'Ricardone' : 'Puerto'} · ${cap(String(o.producto ?? ''))} · ${hmL(o.ingreso)}–${o.salida ? hmL(o.salida) : '?'}${Number(o.kg) ? ` · ${Number(o.kg).toLocaleString('es-AR')} kg` : ''}`).join('; ') : ''
  const loteDir = join(resolve(DATA, '..'), 'outputs', 'demostracion_lote')
  let lote = '', loteCirc = '', reconstruyo: string[] = []
  for (const f of existsSync(loteDir) ? readdirSync(loteDir).filter((n) => /^lote_semana_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json$/.test(n)) : []) {
    const [a, b] = f.slice(12, -5).split('_'); const dia = new Date(t0 - 3 * H).toISOString().slice(0, 10)
    if (dia < a! || dia > b!) continue
    const L = JSON.parse(readFileSync(join(loteDir, f), 'utf8'))
    const c = (L.porCamion as any[]).find((k) => k.plate === patente && Math.abs(Date.parse(k.ing) - t0) < 12 * H)
    if (!c) { lote = 'No está en el lote (no es camión del sistema)'; continue }
    loteCirc = c.circuit
    reconstruyo = (c.pasosDetalle as any[]).filter((p) => p.estado === 'reconstruida').map((p) => `${String(p.node).split(':')[1]!.replace('Plataformas Volcables', 'volcable')} ${hmL(Date.parse(p.t))}`)
    lote = `Circuito ${c.circuit}: ${c.camara} pasos leídos, ${c.reconstruida} reconstruidos, ${c.deducida} deducidos, ${c.falta} faltan` + (reconstruyo.length ? ` (reconstruyó ${reconstruyo.join(', ')})` : '')
    break
  }
  const ovf = join(DATA, 'plant-state-manual-overrides.json')
  const ovPlantas = existsSync(ovf) ? Object.values(JSON.parse(readFileSync(ovf, 'utf8')) as Record<string, Record<string, any>>) : []   // { ricardone: {patente: …}, san_lorenzo: … }
  const ov = ovPlantas.map((pl) => pl?.[patente]).find((x) => x?.reason) ?? null
  const enVivo = ov?.reason ? `En vivo: ${String(ov.reason).toLowerCase()}` : ''
  const descargo = reconstruyo.some((r) => /Volcable/i.test(r))
  const conclusion = ops.length
    ? (/relámpago/.test(motivo) && descargo ? `Descargó: está en el sistema y el algoritmo le asigna la lectura de ${reconstruyo.find((r) => /Volcable/i.test(r))}` : `Operación del sistema${loteCirc ? ` (circuito ${loteCirc})` : ''}: el ETL cortó el recorrido`)
    : enVivo ? `Fuera del sistema · ${enVivo}` : 'Fuera del sistema: vehículo sin movimiento de balanza, identificar'
  return { sistema: sistema || 'No figura', lote: lote || 'Sin corrida del lote para ese día', enVivo, conclusion, esCaso: !ops.length && !enVivo }
}
// 3 · Brutos de más de 52,5 t en la balanza (corte provisorio: el comité define el criterio de «pasado de kilos»)
const BRUTO_MAX = 52500
const pesados = sgcPeriodo.filter((r) => Number(r.PESOBRUTO) > BRUTO_MAX && /SAN LORENZO|TERMINAL/.test(r.PLANTA)).map((r) => ({ _t: localMs(r.FECHAINGRESO), patente: r.PATENTECAMION,
  producto: String(r.PRODUCTO).toLowerCase(), planta: plantaSgc(r.PLANTA), dia: hmLocal(r.FECHAINGRESO).slice(0, 5), brutoKg: r.PESOBRUTO, netoKg: r.PESONETO ?? null }))
const conPeso = sgcPeriodo.filter((r) => Number(r.PESOBRUTO) > 0 && /SAN LORENZO|TERMINAL/.test(r.PLANTA)).length   // Nodo Sur: Ricardone y puerto

// Recorrido completo (cámaras + algoritmo) para las fichas del comité: interplanta y dos calles alrededor del caso;
// vehículos sin sistema, su día con más lecturas (los 5 con más viajes).
for (const x of [...interplanta, ...dosCalles] as Record<string, any>[]) Object.assign(x, visitasCompletas([x.patente], Number(x._t) - 4 * H, Number(x._t) + 6 * H))
for (const x of camionetas.slice(0, 5) as Record<string, any>[]) {
  const rs = byPlate.get(x.patente) ?? []
  const porDia = new Map<string, number>(); for (const r of rs) porDia.set(r.day, (porDia.get(r.day) ?? 0) + 1)
  const dia = [...porDia.entries()].filter(([d]) => PERIOD_DAYS.includes(d)).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!dia) continue
  const d0 = rs.find((r) => r.day === dia)!.t
  x.diaEjemplo = ddmm(dia)
  Object.assign(x, visitasCompletas([x.patente], d0 - H, d0 + 24 * H))
}

// ---------- salida
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : null }
const byT = (a: { _t: unknown }, b: { _t: unknown }) => Number(a._t) - Number(b._t)
const strip = <T extends { _t?: unknown }>(a: T[]) => a.sort(byT).map(({ _t, ...x }) => x)
const datos = {
  generado: new Date().toISOString(),
  periodo: { desde, hasta, dias: PERIOD_DAYS },
  fuentes: {
    camaras: camDays, camarasFaltantes: PERIOD_DAYS.filter((d) => !camDays.includes(d)),
    excel: excelDays, excelFaltante: PERIOD_DAYS.filter((d) => !excelDays.includes(d)),
    padronExcel: excelAll.length ? `${ddmm(excelAll[0]!)} al ${ddmm(excelAll[excelAll.length - 1]!)}` : null, padronPatentes: knownPlates.size,
    correcciones: { origen: corrSource, reglas: corrected.rules, renombradas: corrected.renamed, descartadas: corrected.dropped },
    lecturasPeriodo: reads.filter(inPeriod).length,
    lecturasPorDia: Object.fromEntries(PERIOD_DAYS.map((d) => [d, reads.filter((r) => r.day === d).length])),
  },
  viajeNormalRicSLmin: median(viajesRicSL), umbralInterplantaMin: UMBRAL_INTER,
  vueltas: strip(vueltas), interplanta: strip(interplanta), interplantaCercanos: strip(cercanos), dosCalles: strip(dosCalles), declarado: strip(declarado),
  camionetas: { umbral: 10, lista: camionetas, sinExcelTotal: sinExcel.length,
    parecidas: camionetas.filter((x) => x.parecida).map((x) => `${x.patente}~${x.parecida}`),
    enRegistro: camionetas.filter((x) => x.registro).map((x) => x.patente) },
  balanza: { sinPesar: strip(sinPesar), pasadosKg: strip(pasadosKg), pesados: strip(pesados), brutoMaxKg: BRUTO_MAX, ingresosConPeso: conPeso, ingresosSgc: sgcPeriodo.length },
  etl: strip(etlCasos),
}
writeFileSync(join(OUT, 'datos.json'), JSON.stringify(datos, null, 1))
const csv = (rows: Record<string, unknown>[]) => '﻿' + (rows.length ? [Object.keys(rows[0]!).join(';'), ...rows.map((r) => Object.values(r).map((v) => String(v ?? '')).join(';'))].join('\n') : '') + '\n'
writeFileSync(join(OUT, 'patentes-sin-excel.csv'), csv(sinExcel.map((x) => ({ patente: x.patente, viajes: x.viajes, dias: x.dias, zona: x.zona, camaras_principales: x.camaras, parecida_a_excel: x.parecida, registro_particular: x.registro ? 'sí' : '' }))))
writeFileSync(join(OUT, 'interplanta.csv'), csv(datos.interplanta))
writeFileSync(join(OUT, 'vueltas-ricardone.csv'), csv(datos.vueltas.map((v) => ({ patente: v.patente, dia: v.dia, estado: v.estado, min_puerto: v.minPuerto, hasta: v.hastaTxt, descarga_posterior: v.descargaPosterior, lecturas: (v.lecturas as string[]).join(' | ') }))))
console.log(`período ${desde}..${hasta} · cámaras ${camDays.length}/${PERIOD_DAYS.length} días · Excel ${excelDays.length}/${PERIOD_DAYS.length} días · correcciones ${corrected.renamed} renombradas / ${corrected.dropped} descartadas (${corrSource})`)
console.log(`vueltas ${vueltas.length} · interplanta ${interplanta.length} · dos calles ${dosCalles.length} · declarado≠calle ${declarado.length} · camionetas ≥10 ${camionetas.length} (sin Excel ≥3 viajes: ${sinExcel.length}) · viaje normal ${datos.viajeNormalRicSLmin} min`)
console.log(OUT)
