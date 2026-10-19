/**
 * Vehículos fuera del sistema de camiones: patentes con formato válido (AAA999 / AA999AA) que leen las
 * cámaras y no figuran en la balanza (Excel MovimientosPorContrato de todo el histórico + SGC, camión y acoplado).
 *
 * Uso:
 *   node --import tsx scripts/estado-planta/vehiculos-sin-sistema.ts <desde> <hasta> [salida]
 *   node --import tsx scripts/estado-planta/vehiculos-sin-sistema.ts 2026-08-01 2026-10-14
 *
 * Por patente: capturas (lecturas de cámara, sin traseras excluidas), viajes (estadías por planta), días, horas
 * dentro (suma de entrada → salida en las estadías que tienen las dos lecturas; las que solo tienen la salida
 * no suman) y viajes por mes. Tipo por foto para las patentes clasificadas en el comité de
 * seguridad (camionetas-clasificacion.json); para el resto, tipo/marca más frecuente del export DSS si existe
 * (poco confiable: marca pickups como Sedan/SUV).
 * visitas.json: cada visita (planta, inicio, fin, minutos medidos, pasos [cámara, hh:mm]) de las patentes con ≥10 lecturas.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { normalizeRealEventPoint } from '../../src/etl-core/domain/eventNormalization.ts'
import { getEventOperationalInstantIso } from '../../src/services/live/liveEventTime.ts'
import { applyLiveCorrections, type LiveCorrectionsDocument } from '../../src/services/liveCorrections.ts'
import type { RealJourneyEventDto } from '../../src/etl-core/domain/journeyEvents.types'

const ROOT = resolve(import.meta.dirname, '..', '..')
const DATA = join(ROOT, 'data')
const [desde, hasta, outArg] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) {
  console.error('Uso: vehiculos-sin-sistema.ts <desde> <hasta> [salida]')
  process.exit(1)
}
const OUT = resolve(outArg ?? join(ROOT, 'reportes', 'logistica', 'vehiculos-sin-sistema', `${desde}_${hasta}`))
mkdirSync(OUT, { recursive: true })
const DAY_MS = 86_400_000
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const PLATE_RE = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/
const plateOf = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ---------- padrón de balanza
const padron = new Set<string>()
for (const d of readdirSync(join(DATA, 'movimientos')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = join(DATA, 'movimientos', d, 'movimientos.json')
  if (!existsSync(f)) continue
  for (const x of JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>[]) padron.add(plateOf(x.plate_normalized || x.patente_original))
}
const sgcRoot = join(DATA, 'sgc')
if (existsSync(sgcRoot)) for (const d of readdirSync(sgcRoot).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  const f = join(sgcRoot, d, 'ingresos.json')
  if (!existsSync(f)) continue
  for (const x of Object.values(JSON.parse(readFileSync(f, 'utf8')) as Record<string, Record<string, string>>)) {
    padron.add(plateOf(x.PATENTECAMION)); padron.add(plateOf(x.PATENTEACOPLADO))
  }
}

// ---------- cámaras
const seen = new Set<number | string>()
let raw: RealJourneyEventDto[] = []
for (let d = addDays(desde, -1); d <= addDays(hasta, 1); d = addDays(d, 1)) {
  const f = join(DATA, 'truckflow', d, 'event-list.json')
  if (!existsSync(f)) continue
  const doc = JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ''))
  for (const e of (Array.isArray(doc) ? doc : doc.records ?? []) as RealJourneyEventDto[]) {
    const k = (e as { id?: number }).id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`
    if (seen.has(k)) continue
    seen.add(k); raw.push(e)
  }
}
let corrections: LiveCorrectionsDocument | null = null
let corrSource = 'ninguna'
try {
  const res = await fetch(`http://127.0.0.1:${process.env.TRUCKFLOW_LOCAL_SERVER_PORT || '8787'}/api/truckflow/live/corrections`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  corrections = (await res.json()) as LiveCorrectionsDocument; corrSource = 'servidor local'
} catch {
  const f = join(ROOT, 'reportes', 'logistica', '2026-10-05_2026-10-11', 'comite-seguridad', 'correcciones-en-vivo.json')
  if (existsSync(f)) { corrections = JSON.parse(readFileSync(f, 'utf8')); corrSource = 'copia del comité 05–11/10' }
}
raw = applyLiveCorrections(raw, corrections).events

type Read = { plate: string; t: number; iso: string; day: string; site: 'ric' | 'sl' | '?'; device: string; logical: string; exit: boolean }
const H = 3600_000
const byPlate = new Map<string, Read[]>()
for (const e of raw) {
  const plate = plateOf(e.normalizedPlate || e.truckPlate)
  if (!PLATE_RE.test(plate) || padron.has(plate)) continue
  const iso = getEventOperationalInstantIso(e)
  const t = Date.parse(iso)
  if (!Number.isFinite(t) || iso.slice(0, 10) < desde || iso.slice(0, 10) > hasta) continue
  const pt = normalizeRealEventPoint(e)
  if (pt.logicalCode.includes('TRASERA_EXCLUIDA')) continue
  const dev = String(e.deviceCode ?? '')
  const site = pt.siteId === 'ricardone' || dev.startsWith('Ric') ? 'ric' : pt.siteId === 'san_lorenzo' || /^(SLZ|Ren)/.test(dev) ? 'sl' : '?'
  if (!byPlate.has(plate)) byPlate.set(plate, [])
  byPlate.get(plate)!.push({ plate, t, iso, day: iso.slice(0, 10), site, device: dev, logical: pt.logicalCode, exit: /EGRESO/.test(pt.logicalCode) || /Egreso|Egr|Salida/.test(dev) })
}

// ---------- tipo de vehículo
const CC = JSON.parse(readFileSync(join(ROOT, 'reportes', 'logistica', '2026-10-05_2026-10-11', 'comite-seguridad', 'fotos', 'camionetas-clasificacion.json'), 'utf8'))
const fotoTipo: Record<string, string> = Object.fromEntries(Object.entries(CC.patentes as Record<string, string>).map(([p, c]) => [p, CC.categorias[c]?.nombre ?? c]))
const dss = new Map<string, Map<string, number>>()
const dssRoot = join(DATA, 'dss-export')
if (existsSync(dssRoot)) for (const w of readdirSync(dssRoot)) {
  const f = join(dssRoot, w, 'capturas.csv')
  if (!existsSync(f)) continue
  const [head, ...rows] = readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  const h = head!.split(',')
  const [ip, it, im] = ['patente', 'tipo', 'marca'].map((k) => h.indexOf(k))
  for (const row of rows) {
    const c = row.split(',')
    const p = plateOf(c[ip!])
    if (!p) continue
    const k = [c[it!], c[im!]].filter((x) => x && x !== 'Unrecognized').join(' ')
    if (!k) continue
    if (!dss.has(p)) dss.set(p, new Map())
    dss.get(p)!.set(k, (dss.get(p)!.get(k) ?? 0) + 1)
  }
}
const dssTipo = (p: string) => { const m = dss.get(p); return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0] : '' }

// ---------- patrón de recorrido
const DEV_SHORT: Record<string, string> = {
  RicPreIngInFr: 'Preingreso', RicPreIngInTr: 'Preingreso', RicPreIngEgFr: 'Preingreso egr.', RicIngCamFrente: 'Ingreso Ric', RicEgrCamFrente: 'Egreso Ric',
  RicB1Ingreso: 'Bal.1 ing', RicB2Ingreso: 'Bal.2 ing', RicB3Ingreso: 'Bal.3 ing', RicB1Egreso: 'Bal.1 egr', RicB2Egreso: 'Bal.2 egr', RicB3Egreso: 'Bal.3 egr',
  RicS6Playa3: 'Playa 3', RicCalLiq: 'Calada líq.', SLZIngCamFrente: 'Ingreso SL', SLZBalIngFte: 'Bal. ingreso SL', SLZBalSC1Fte: 'Bal. SC1 SL', SLZBalSC2Fte: 'Bal. SC2 SL',
  SLZSalidaC1Fte: 'Portería SL', SLZSalidaC2Fte: 'Portería SL', SLZTK400: 'TK400 SL', SLZDescCam: 'Calado SL', SLZBalLiq1b: 'Bal. líq. 1 SL', SLZBalLiq2b: 'Bal. líq. 2 SL',
}
const devShort = (d: string) => DEV_SHORT[d] ?? (d.match(/S(\d)CargaLinea(\d)/) ? `Carga S${d.match(/S(\d)CargaLinea(\d)/)![1]} línea ${d.match(/S(\d)CargaLinea(\d)/)![2]}` : /C16Carga/.test(d) ? 'Carga Celda 16' : /C16Descarga/.test(d) ? 'Descarga Celda 16' : d.match(/^RicCal0?(\d)/) ? `Calada ${d.match(/^RicCal0?(\d)/)![1]}` : d.match(/Volcable(?:C)?(\d)/) ? `Volcable ${d.match(/Volcable(?:C)?(\d)/)![1]}${d.startsWith('SLZ') ? ' SL' : ''}` : d.replace(/^(Ric|SLZ)/, ''))
// Q1 22–04 · Q2 04–10 · Q3 10–16 · Q4 16–22 (operationalTurno)
const cuarto = (iso: string) => { const h = Number(iso.slice(11, 13)); return h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4' }
const OPER: [RegExp, string][] = [[/CALADA|SL_CALADA/, 'calada'], [/VOLCABLE/, 'volcable'], [/CARGA|CELDA16/, 'carga'], [/PLAYA/, 'playa'], [/LIQUIDO/, 'líquidos'], [/BALANZA/, 'balanza']]
type StayP = { site: string; start: number; end: number; iso: string; seq: string[]; logical: Set<string>; dur: number | null }
function patronDe(stays: StayP[], rs: Read[]) {
  const seqs = new Map<string, number>()
  for (const s of stays) { const k = `${s.site === 'ric' ? 'Ric' : 'SL'}: ${s.seq.join(' → ')}`; seqs.set(k, (seqs.get(k) ?? 0) + 1) }
  const top = [...seqs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => ({ seq: k, pct: Math.round((100 * n) / stays.length) }))
  const q: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
  for (const s of stays) q[cuarto(s.iso)]!++
  const finde = stays.filter((s) => [0, 6].includes(new Date(Date.parse(s.iso.slice(0, 10) + 'T12:00:00Z')).getUTCDay())).length
  let inter = 0
  for (let i = 1; i < stays.length; i++) if (stays[i]!.site !== stays[i - 1]!.site && stays[i]!.start - stays[i - 1]!.end <= 3 * H) inter++
  const oper: Record<string, number> = {}
  for (const s of stays) for (const [re, k] of OPER) if ([...s.logical].some((l) => re.test(l))) oper[k] = (oper[k] ?? 0) + 1
  const durs = stays.map((s) => s.dur).filter((d): d is number => d != null).sort((a, b) => a - b)
  const hs = stays.map((s) => Number(s.iso.slice(11, 13)) + Number(s.iso.slice(14, 16)) / 60).sort((a, b) => a - b)
  const pctl = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))]!
  const fmtH = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`
  // fotos: cámaras de frente (Fte / Frente / Fr) primero; de día (8–18 h operativas) primero, la más reciente primero
  // SLZSalidaC2Fte toma la cola (carril de ingreso): no cuenta como frente
  const FRENTE = /^(?!SLZSalidaC2Fte).*(Fte|Frente|Fr)$/
  // (si el vehículo nunca pasa por una de frente, p. ej. solo balanza 3 de Ricardone, quedan las otras al final)
  const fotos = [...rs].sort((a, b) => Number(!FRENTE.test(a.device)) - Number(!FRENTE.test(b.device))
    || Number(!(+a.iso.slice(11, 13) >= 8 && +a.iso.slice(11, 13) < 18)) - Number(!(+b.iso.slice(11, 13) >= 8 && +b.iso.slice(11, 13) < 18))
    || b.t - a.t).slice(0, 12).map((r) => ({ at: r.iso, device: r.device }))
  return { top, cuartos: q, findePct: Math.round((100 * finde) / stays.length), interplanta: inter, oper, medianaMin: durs.length ? Math.round(pctl(durs, 0.5) / 60000) : null,
    horaTipica: hs.length ? `${fmtH(pctl(hs, 0.25))}–${fmtH(pctl(hs, 0.75))}` : '', fotos }
}

// ---------- por patente
// Parecida a una patente de la balanza (una letra/dígito de diferencia): puede ser mala lectura de un camión.
const lev1 = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return d === 1 }
const padronValido = [...padron].filter((p) => PLATE_RE.test(p))
const MESES = [...new Set(Array.from({ length: 400 }, (_, i) => addDays(desde, i)).filter((d) => d <= hasta).map((d) => d.slice(0, 7)))]
const VISITAS: Record<string, unknown> = {}
const rows = [...byPlate].map(([patente, rs]) => {
  rs.sort((a, b) => a.t - b.t)
  // Estadías propias por planta (las journeys de TruckFlow juntan días y plantas en los livianos): arranca en
  // una lectura, termina en la cámara de salida (lecturas de salida a ≤15 min son la misma salida) o tras 16 h
  // sin lecturas. Medida = primera lectura que no es salida → salida.
  const porMes: Record<string, number> = Object.fromEntries(MESES.map((m) => [m, 0]))
  let ms = 0, viajes = 0, medidas = 0
  type Stay = { site: string; start: number; end: number; iso: string; endIso: string; seq: string[]; pasos: [string, string][]; logical: Set<string>; dur: number | null }
  const stays: Stay[] = []
  for (const site of ['ric', 'sl', '?'] as const) {
    let cur: { first: Read; last: number; entry: number | null; exit: number | null; reads: Read[] } | null = null
    const close = () => {
      if (!cur) return
      viajes++; porMes[cur.first.day.slice(0, 7)]!++
      const dur = cur.entry != null && cur.exit != null && cur.exit > cur.entry ? cur.exit - cur.entry : null
      if (dur != null) { ms += dur; medidas++ }
      const seq: string[] = []
      const pasos: [string, string][] = []
      // La portería SL lee en los dos sentidos: dos lecturas a 5 min o más son entrada y salida; más cerca, la misma pasada.
      let lastT = -Infinity
      for (const r of cur.reads) {
        const l = devShort(r.device)
        if (seq[seq.length - 1] !== l || r.t - lastT >= 5 * 60_000) { seq.push(l); pasos.push([l, r.iso.slice(11, 16)]); lastT = r.t }
      }
      stays.push({ site, start: cur.first.t, end: cur.last, iso: cur.first.iso, endIso: cur.reads[cur.reads.length - 1]!.iso, seq, pasos, logical: new Set(cur.reads.map((r) => r.logical)), dur })
      cur = null
    }
    if (site === 'sl') {
      // Portería SL (SLZSalidaC1/C2Fte) lee en los dos sentidos: una pasada abre la visita (ingreso) y la siguiente
      // la cierra (salida). Lecturas de portería a menos de 5 min son la misma pasada. Sin la segunda pasada en 16 h,
      // la visita queda con una sola toma y sin permanencia.
      let lastP = -Infinity
      for (const r of rs.filter((x) => x.site === 'sl')) {
        const isP = /^SLZSalidaC\dFte$/.test(r.device)
        if (cur && r.t - cur.last > 16 * H) close()
        if (isP && r.t - lastP < 5 * 60_000) { if (cur) { cur.last = r.t; cur.reads.push(r) } lastP = r.t; continue }
        if (!cur) { cur = { first: r, last: r.t, entry: isP ? r.t : null, exit: null, reads: [r] }; if (isP) lastP = r.t; continue }
        cur.last = r.t; cur.reads.push(r)
        if (cur.entry == null && !isP && !r.exit) cur.entry = r.t
        if (isP) { cur.exit = r.t; lastP = r.t; close() }
      }
      close()
      continue
    }
    for (const r of rs.filter((x) => x.site === site)) {
      const isExit = r.exit
      if (cur && (r.t - cur.last > 16 * H || (cur.exit != null && r.t - cur.exit > 15 * 60_000))) close()
      if (!cur) cur = { first: r, last: r.t, entry: null, exit: null, reads: [] }
      cur.last = r.t; cur.reads.push(r)
      if (isExit) cur.exit = r.t
      else if (cur.entry == null && cur.exit == null) cur.entry = r.t
    }
    close()
  }
  stays.sort((a, b) => a.start - b.start)
  const patron = rs.length >= 10 ? patronDe(stays, rs) : null
  if (rs.length >= 10) VISITAS[patente] = stays.map((s) => ({ planta: s.site, ini: s.iso, fin: s.endIso, min: s.dur == null ? null : Math.round(s.dur / 60000), pasos: s.pasos }))
  const sites = new Set(rs.map((r) => r.site).filter((s) => s !== '?'))
  const dev = new Map<string, number>()
  for (const r of rs) dev.set(r.device, (dev.get(r.device) ?? 0) + 1)
  const days = [...new Set(rs.map((r) => r.day))].sort()
  return { patente, tipo: fotoTipo[patente] ?? '', tipoDss: dssTipo(patente), enLista48: patente in fotoTipo, capturas: rs.length, viajes, estadiasMedidas: medidas,
    dias: days.length, parecida: rs.length >= 3 ? padronValido.filter((k) => lev1(k, patente)).slice(0, 3).join(' ') : '', horas: Math.round(ms / 360_000) / 10, porMes, primera: days[0], ultima: days[days.length - 1],
    zona: sites.size === 2 ? 'Ricardone y San Lorenzo' : sites.has('ric') ? 'Ricardone' : 'San Lorenzo',
    camaras: [...dev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(' / '), patron }
}).sort((a, b) => b.viajes - a.viajes || b.capturas - a.capturas)

const csv = (list: typeof rows) => '﻿' + ['patente;tipo_foto;tipo_dss;capturas;viajes;dias;horas_dentro;estadias_medidas;' + MESES.map((m) => `viajes_${m}`).join(';') + ';primera;ultima;zona;camaras_principales;parecida_a_balanza',
  ...list.map((r) => [r.patente, r.tipo, r.tipoDss, r.capturas, r.viajes, r.dias, String(r.horas).replace('.', ','), r.estadiasMedidas, ...MESES.map((m) => r.porMes[m]), r.primera, r.ultima, r.zona, r.camaras, r.parecida].join(';'))].join('\r\n')
writeFileSync(join(OUT, 'visitas.json'), JSON.stringify(VISITAS))
writeFileSync(join(OUT, 'vehiculos-sin-sistema.json'), JSON.stringify({ desde, hasta, padronPatentes: padron.size, correcciones: corrSource, meses: MESES, vehiculos: rows }, null, 1))
writeFileSync(join(OUT, 'lista-48.csv'), csv(rows.filter((r) => r.enLista48)))
writeFileSync(join(OUT, 'otros-sin-sistema.csv'), csv(rows.filter((r) => !r.enLista48 && r.viajes >= 3)))
console.log(`padrón ${padron.size} · patentes válidas sin sistema ${rows.length} · ≥3 viajes ${rows.filter((r) => r.viajes >= 3).length} · ≥10 viajes ${rows.filter((r) => r.viajes >= 10).length} · correcciones: ${corrSource} → ${OUT}`)
