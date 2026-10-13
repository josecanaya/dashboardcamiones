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
 *   - Interplanta: egreso Ricardone → cámara de ingreso San Lorenzo, más de 30 min y hasta 2 h, sin lectura en la calada
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
      if (inP) movsPeriod.push({ plate: p, planta: x.planta_normalized, plataforma: x.platform_normalized || x.plataforma_original, producto: x.product_normalized || x.producto_original,
        ingreso: localMs(x.external_ingreso_at), salida: localMs(x.external_salida_at), day: d, kg: x.kgs_neto })
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
        if (inPeriod(egr) && grano && ((min > 30 && min <= 120 && has(v, 'SL_CALADA')) || (min >= 25 && min <= 30)))
          cercanos.push({ dia: ddmm(egr.day), salida: egr.hm, patente: plate, min, motivo: min > 30 ? 'caló en el puerto' : 'entre 25 y 30 min', _t: egr.t })
        if (inPeriod(egr) && min > 30 && min <= 120 && !has(v, 'SL_CALADA') && grano) {
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
const sinExcel: { patente: string; viajes: number; dias: number; zona: string; camaras: string; parecida: string; registro: boolean }[] = []
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
    parecida: known.filter((k) => lev1(k, plate)).slice(0, 3).join(' '), registro: registry.has(plate) })
}
sinExcel.sort((a, b) => b.viajes - a.viajes || a.patente.localeCompare(b.patente))
// Igual que el comité anterior: entran también las parecidas a una patente del Excel y las del registro
// de particulares (quedan marcadas en el CSV).
const camionetas = sinExcel.filter((x) => x.viajes >= 10)

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
  viajeNormalRicSLmin: median(viajesRicSL),
  vueltas: strip(vueltas), interplanta: strip(interplanta), interplantaCercanos: strip(cercanos), dosCalles: strip(dosCalles), declarado: strip(declarado),
  camionetas: { umbral: 10, lista: camionetas, sinExcelTotal: sinExcel.length,
    parecidas: camionetas.filter((x) => x.parecida).map((x) => `${x.patente}~${x.parecida}`),
    enRegistro: camionetas.filter((x) => x.registro).map((x) => x.patente) },
}
writeFileSync(join(OUT, 'datos.json'), JSON.stringify(datos, null, 1))
const csv = (rows: Record<string, unknown>[]) => '﻿' + (rows.length ? [Object.keys(rows[0]!).join(';'), ...rows.map((r) => Object.values(r).map((v) => String(v ?? '')).join(';'))].join('\n') : '') + '\n'
writeFileSync(join(OUT, 'patentes-sin-excel.csv'), csv(sinExcel.map((x) => ({ patente: x.patente, viajes: x.viajes, dias: x.dias, zona: x.zona, camaras_principales: x.camaras, parecida_a_excel: x.parecida, registro_particular: x.registro ? 'sí' : '' }))))
writeFileSync(join(OUT, 'interplanta.csv'), csv(datos.interplanta))
writeFileSync(join(OUT, 'vueltas-ricardone.csv'), csv(datos.vueltas.map((v) => ({ patente: v.patente, dia: v.dia, estado: v.estado, min_puerto: v.minPuerto, hasta: v.hastaTxt, descarga_posterior: v.descargaPosterior, lecturas: (v.lecturas as string[]).join(' | ') }))))
console.log(`período ${desde}..${hasta} · cámaras ${camDays.length}/${PERIOD_DAYS.length} días · Excel ${excelDays.length}/${PERIOD_DAYS.length} días · correcciones ${corrected.renamed} renombradas / ${corrected.dropped} descartadas (${corrSource})`)
console.log(`vueltas ${vueltas.length} · interplanta ${interplanta.length} · dos calles ${dosCalles.length} · declarado≠calle ${declarado.length} · camionetas ≥10 ${camionetas.length} (sin Excel ≥3 viajes: ${sinExcel.length}) · viaje normal ${datos.viajeNormalRicSLmin} min`)
console.log(OUT)
