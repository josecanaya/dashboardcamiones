/**
 * Cruce cartas de porte ARCA ↔ cámaras TruckFlow ↔ Sistema de camiones, día por día.
 *
 * A) Cartas cuyo camión debía llegar en el período (partida declarada dentro del período): ¿alguna
 *    cámara leyó el chasis o el acoplado entre partida −12 h y partida +72 h? (la partida declarada
 *    no es confiable: hay camiones que entran antes, ver memoria carta-porte-arca-en-vivo).
 *    exacta = misma patente; aproximada = 1 carácter distinto; sin lectura = ninguna cámara.
 * B) Patentes que leyeron las cámaras en el período y no tienen carta (ni exacta ni a 1 carácter):
 *    se buscan en el Sistema de camiones (ingreso −3 h … salida +3 h).
 * C) Las que no están ni en cartas ni en el Sistema: se listan con cámaras, horas y atributos.
 *
 * Solo patentes con formato válido (AAA999, AA999AA): el resto son lecturas rotas (LPR_MALFUNCTION).
 *
 * Uso: node scripts/cruce-cartas-camaras/cruce.mjs --desde 2026-09-29 --hasta 2026-09-29
 *  → reportes/cruce-cartas-camaras/<desde>_<hasta>/cruce.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { loadReads, plateKey } from '../cruce-sistema-truckflow/lecturas.mjs'
import { loadMovimientos, arMs, arIso } from '../cruce-sistema-truckflow/sistema.mjs'

const root = resolve(import.meta.dirname, '../..')
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined)
const desde = arg('--desde')
const hasta = arg('--hasta') ?? desde
if (!desde) throw new Error('Falta --desde YYYY-MM-DD')

const H = 3600_000
const t0 = arMs(`${desde}T00:00:00`)
const t1 = arMs(`${hasta}T00:00:00`) + 24 * H
const VALIDA = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/
const VICENTIN = '30500959629'

/** Distancia de Hamming para patentes del mismo largo (lecturas con 1 carácter cambiado). */
const casi = (a, b) => {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false
  return d === 1
}

// --- Cartas -------------------------------------------------------------------------------
const cartas = JSON.parse(readFileSync(join(root, 'data/arca/arca_consignment_notes.json'), 'utf8'))
  .filter((c) => c.destination?.cuit === VICENTIN || c.origin?.cuit === VICENTIN)
  .map((c) => {
    const partida = Date.parse(c.departure_time?.$date)
    return {
      ctg: c.ctg,
      estado: c.arca_state_code,
      partida,
      // Medido 29/09: hay camiones que entran 19 h antes de la partida declarada y otros 3 días después.
      desde: partida - 48 * H,
      hasta: partida + 120 * H,
      patentes: (c.transport?.plates ?? []).map(plateKey).filter(Boolean),
      grano: c.load?.grain_code,
      plantaDestino: c.destination?.plant?.$numberLong,
      turno: c.transport?.turn_code ?? '',
      interno: c.origin?.cuit === VICENTIN,
    }
  })

// --- Lecturas de cámara -------------------------------------------------------------------
const reads = loadReads().filter((r) => r.t >= t0 - 48 * H && r.t < t1 + 120 * H && VALIDA.test(r.plate))
const porPatente = new Map()
for (const r of reads) {
  if (!porPatente.has(r.plate)) porPatente.set(r.plate, [])
  porPatente.get(r.plate).push(r)
}

// --- A) cartas del período contra cámaras --------------------------------------------------
const delPeriodo = cartas.filter((c) => c.partida >= t0 && c.partida < t1)
const resumenLecturas = (rs) => ({
  primera: arIso(rs[0].t),
  camaras: [...new Set(rs.map((r) => r.dev))],
  n: rs.length,
})
const cartasRes = delPeriodo.map((c) => {
  let exacta = []
  for (const p of c.patentes) for (const r of porPatente.get(p) ?? []) if (r.t >= c.desde && r.t <= c.hasta) exacta.push(r)
  exacta.sort((a, b) => a.t - b.t)
  let aprox = []
  if (!exacta.length) {
    for (const [p, rs] of porPatente) {
      const original = c.patentes.find((q) => casi(q, p))
      if (!original) continue
      for (const r of rs) if (r.t >= c.desde && r.t <= c.hasta) aprox.push({ ...r, original })
    }
    aprox.sort((a, b) => a.t - b.t)
  }
  return {
    ctg: c.ctg,
    estado: c.estado,
    partida: arIso(c.partida),
    patentes: c.patentes,
    grano: c.grano,
    plantaDestino: c.plantaDestino,
    interno: c.interno,
    resultado: exacta.length ? 'exacta' : aprox.length ? 'aproximada' : 'sin_lectura',
    lectura: exacta.length ? resumenLecturas(exacta) : aprox.length ? { ...resumenLecturas(aprox), leidaComo: [...new Set(aprox.map((r) => r.plate))] } : null,
  }
})

// --- B/C) patentes leídas en el período sin carta ------------------------------------------
const movs = loadMovimientos().filter((m) => m.ing < t1 + 48 * H && (m.sal || m.ing) > t0 - 48 * H)
const cartaQueCubre = (p, t) => cartas.find((c) => t >= c.desde && t <= c.hasta && c.patentes.includes(p))
const cartaCasi = (p, t) => cartas.find((c) => t >= c.desde && t <= c.hasta && c.patentes.some((q) => casi(q, p)))
const movQueCubre = (p, t, cmp) =>
  movs.find((m) => [m.plate, m.acoplado].some((q) => q && cmp(q, p)) && t >= m.ing - 3 * H && t <= (Number.isFinite(m.sal) ? m.sal : m.ing + 24 * H) + 3 * H)

const sinCarta = []
for (const [p, rs] of porPatente) {
  const delDia = rs.filter((r) => r.t >= t0 && r.t < t1)
  if (!delDia.length) continue
  const t = delDia[0].t
  if (cartaQueCubre(p, t) || cartaCasi(p, t)) continue
  const exacto = movQueCubre(p, t, (a, b) => a === b)
  const mov = exacto ?? movQueCubre(p, t, casi)
  const attrs = delDia.find((r) => r.cat || r.brand || r.color) ?? {}
  sinCarta.push({
    patente: p,
    primera: arIso(t),
    ultima: arIso(delDia.at(-1).t),
    lecturas: delDia.length,
    camaras: [...new Set(delDia.map((r) => r.dev))],
    tipo: attrs.cat ?? '',
    marca: attrs.brand ?? '',
    color: attrs.color ?? '',
    sistema: mov
      ? {
          coincidencia: exacto ? 'exacta' : 'aproximada',
          patenteSistema: mov.plate,
          acoplado: mov.acoplado,
          planta: mov.planta,
          mov: mov.mov,
          producto: mov.producto,
          ingreso: arIso(mov.ing),
          salida: arIso(mov.sal),
          fuente: mov.fuente,
        }
      : null,
  })
}
sinCarta.sort((a, b) => a.primera.localeCompare(b.primera))

// --- Quiénes son los que no están ni en cartas ni en el Sistema ----------------------------
// Registro de flota (copia local; la base Supabase es la viva). Livianos según el atributo DSS.
const registro = new Map(
  JSON.parse(readFileSync(join(root, 'data/truck-registry/registry.json'), 'utf8')).entries.map((e) => [plateKey(e.plate), e]),
)
const LIVIANOS = new Set(['SaloonCar', 'PassengerCar', 'Pickup', 'SUV', 'MPV', 'Microbus', 'MidPassengerCar'])
/** Cámaras de adentro de Ricardone (silos, volcables, playa 3, calada): sin pasar por accesos. */
const INTERNA_RIC = /^Ric(S\d|Volcable|Cal)/
const historia = new Map()
for (const m of loadMovimientos()) {
  for (const q of [m.plate, m.acoplado]) {
    if (!q) continue
    const h = historia.get(q) ?? { veces: 0, ultima: 0, producto: '', planta: '' }
    h.veces++
    if (m.ing > h.ultima) Object.assign(h, { ultima: m.ing, producto: m.producto, planta: m.planta })
    historia.set(q, h)
  }
}
for (const s of sinCarta) {
  if (s.sistema) continue
  const reg = registro.get(s.patente)
  const h = historia.get(s.patente)
  s.sistemaOtroDia = h ? { veces: h.veces, ultima: arIso(h.ultima), producto: h.producto, planta: h.planta } : null
  s.registro = reg ? { categoria: reg.category, etiqueta: reg.label ?? '' } : null
  const rs = porPatente.get(s.patente).filter((r) => r.t >= t0 && r.t < t1)
  const unaPasada = s.camaras.length === 1 && rs.at(-1).t - rs[0].t <= 5 * 60_000
  s.grupo = reg
    ? 'registrado'
    : LIVIANOS.has(s.tipo)
      ? 'liviano'
      : s.camaras.every((c) => /Tras/.test(c))
        ? 'solo_trasera'
        : s.camaras.every((c) => INTERNA_RIC.test(c))
          ? 'interno_ricardone'
          : unaPasada
            ? 'una_pasada'
            : s.camaras.every((c) => /^RicB3/.test(c))
              ? 'balanza_3_ricardone'
              : 'camion_sin_papeles'
}

// --- Cartas sin lectura: ¿el Sistema registra su CTG? (el Excel trae CTG hasta el 14/10) --------
const sinLectura = new Set(cartasRes.filter((c) => c.resultado !== 'exacta').map((c) => c.ctg))
const dirMov = join(root, 'data/movimientos')
for (const d of readdirSync(dirMov).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= desde)) {
  const f = join(dirMov, d, 'movimientos.json')
  if (!sinLectura.size || !existsSync(f)) continue
  const raw = JSON.parse(readFileSync(f, 'utf8'))
  for (const r of Array.isArray(raw) ? raw : (raw.rows ?? raw.movimientos ?? [])) {
    const ctg = String(r.ctg ?? '')
    if (!sinLectura.has(ctg)) continue
    const c = cartasRes.find((x) => x.ctg === ctg)
    c.sistema = { patente: r.plate_normalized, planta: r.planta_normalized, ingreso: r.external_ingreso_at, salida: r.external_salida_at, producto: r.product_normalized }
  }
}

// --- Granos sin carta ----------------------------------------------------------------------
// Camión de granos = leído en calada de Ricardone, un volcable o la descarga de S7. Cuenta solo si la
// misma patente aparece en otra cámara de su visita (±24 h): las calles de calada y los volcables leen
// de costado y con poca luz, y una lectura suelta ahí es casi siempre otro camión (29/09: 9 de 9).
const GRANO = /^Ric(Cal0\d|Volcable|S7Desc)|^SLZVolcableC/
const GRANO_PRODUCTO = /^(SOJA|GIRASOL|MAIZ|MAÍZ|TRIGO|SORGO|CEBADA|CARTAMO|CÁRTAMO|ALGODON|ALGODÓN)$/
const granoSinCarta = []
let granoLecturaSuelta = 0
for (const [p, rs] of porPatente) {
  const enGrano = rs.filter((r) => r.t >= t0 && r.t < t1 && GRANO.test(r.dev))
  if (!enGrano.length) continue
  const t = enGrano[0].t
  if (cartaQueCubre(p, t) || cartaCasi(p, t)) continue
  const visita = rs.filter((r) => Math.abs(r.t - t) <= 24 * H)
  const otrasCamaras = [...new Set(visita.map((r) => r.dev))].filter((d) => !enGrano.some((g) => g.dev === d))
  if (!otrasCamaras.length) {
    granoLecturaSuelta++
    continue
  }
  const mov = movQueCubre(p, t, (a, b) => a === b)
  const attrs = visita.find((r) => r.cat || r.brand) ?? {}
  const camaras = [...new Set(visita.map((r) => r.dev))]
  // Pellet, cáscara, aceite y «productos varios» viajan sin carta de porte: el Sistema los explica.
  // El tipo del DSS falla con camiones (DGR440 pellet figuraba «SUV»): primero manda el Sistema.
  const clase = mov && !GRANO_PRODUCTO.test(mov.producto)
    ? 'explicado_por_sistema'
    : LIVIANOS.has(attrs.cat)
      ? 'liviano'
      : mov
        ? 'grano_con_sistema_sin_carta'
        : camaras.every((d) => !/PreIng|EgrCam|^SLZ|^Ren/.test(d))
          ? 'flota_interna_ricardone'
          : 'sospechoso'
  granoSinCarta.push({
    patente: p,
    clase,
    enGrano: [...new Set(enGrano.map((r) => `${arIso(r.t).slice(11)} ${r.dev}`))],
    visita: { desde: arIso(visita[0].t), hasta: arIso(visita.at(-1).t), camaras: [...new Set(visita.map((r) => r.dev))] },
    tipo: attrs.cat ?? '',
    marca: attrs.brand ?? '',
    sistema: mov ? { mov: mov.mov, producto: mov.producto, planta: mov.planta, ingreso: arIso(mov.ing), salida: arIso(mov.sal) } : null,
  })
}

const cuenta = (xs, f) => xs.reduce((o, x) => ((o[f(x)] = (o[f(x)] ?? 0) + 1), o), {})
const out = {
  periodo: { desde, hasta },
  generado: new Date().toISOString(),
  criterio: {
    ventanaCarta: 'partida declarada −48 h … +120 h',
    granos: 'leído en calada Ricardone, volcable o descarga S7, y la misma patente en otra cámara de la visita',
    ventanaSistema: 'ingreso −3 h … salida +3 h',
    aproximada: '1 carácter distinto',
  },
  resumen: {
    cartas: delPeriodo.length,
    cartasPorResultado: cuenta(cartasRes, (c) => c.resultado),
    patentesLeidasSinCarta: sinCarta.length,
    enSistema: sinCarta.filter((s) => s.sistema).length,
    niCartaNiSistema: sinCarta.filter((s) => !s.sistema).length,
    niCartaNiSistemaPorGrupo: cuenta(
      sinCarta.filter((s) => !s.sistema),
      (s) => s.grupo,
    ),
    sinCartaEnSistemaPorMov: cuenta(
      sinCarta.filter((s) => s.sistema),
      (s) => `${s.sistema.mov} ${s.sistema.producto}`,
    ),
  },
  granos: {
    sinCartaConfirmados: granoSinCarta.length,
    porClase: cuenta(granoSinCarta, (g) => g.clase),
    lecturasSueltasDescartadas: granoLecturaSuelta,
  },
  granoSinCarta,
  cartas: cartasRes,
  sinCartaEnSistema: sinCarta.filter((s) => s.sistema),
  niCartaNiSistema: sinCarta.filter((s) => !s.sistema),
}
const dir = join(root, 'reportes/cruce-cartas-camaras', `${desde}_${hasta}`)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'cruce.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out.resumen, null, 2))
console.log('→', join(dir, 'cruce.json'))
