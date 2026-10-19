/**
 * SGC (balanza Vicentin, vista Oracle) → filas `ExternalMovimientoContratoNormalized`,
 * el mismo contrato que producía el Excel de Movimientos por Contrato.
 *
 * La vista trae patente, producto, ingreso/salida, pesos, planta y NROINGRESO (= `ingreso_id`
 * del Excel); desde el 16/10 también humedad y condición del calado, depósito y baja. NO trae plataforma, mov, CTG, contrato ni es_de_vuelta; se completan así:
 * - mov: peso observado primero por el poller (solo tara = vino a cargar → E; solo bruto =
 *   vino a descargar → I); si no se vio, mayoría histórica del Excel por (planta, cod_prod).
 * - es_de_vuelta + ctg: transile = misma patente y producto, salida de Ricardone e ingreso al
 *   puerto dentro de TRANSILE_MAX_MIN; ambas patas comparten un ctg sintético `SGC_TR_<nro>`.
 * - plataforma: solo si el histórico la determina (≥ PLATFORM_MIN_SHARE). Volcables de puerto
 *   → `VOLCABLE_PTO_SGC` (circuito R7, sin calle: la calle sale de cámara). Si no, vacía y el
 *   circuito queda a cargo de las cámaras.
 * Cada campo inferido deja su marca en `normalization_warnings`.
 */

export const SGC_SOURCE_FILE = 'SGC_PROD.CamionesActivos24horas'
const TRANSILE_MAX_MIN = 180
const PLATFORM_MIN_SHARE = 0.9
const RICARDONE = 'RICARDONE'
const PUERTO = 'TERMINAL_EMBARQUE'

const PLANT_MAP = {
  'PLANTA SAN LORENZO': RICARDONE,
  'TERMINAL DE EMBARQUE': PUERTO,
  'PLANTA AVELLANEDA': 'AVELLANEDA',
  RENOPACK: 'RENOPACK',
}

const MOV_TYPE = { I: 'INGRESO', IA: 'INGRESO', E: 'EGRESO', EA: 'EGRESO', DI: 'DESPACHO', DE: 'DESPACHO' }

const snake = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '_')
export const normalizeSgcPlant = name => PLANT_MAP[String(name ?? '').trim().toUpperCase()] ?? snake(name)

const ddmmyyyy = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const hhmm = iso => (iso ? iso.slice(11, 16) : '')
const ms = iso => (iso ? Date.parse(iso) : NaN)
const kg = v => (v == null || v === '' ? '' : String(Math.round(Number(v))))

function share(counter) {
  const entries = Object.entries(counter).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, n]) => s + n, 0)
  return entries.length ? { value: entries[0][0], share: entries[0][1] / total, total } : null
}

/** Priors desde el histórico del Excel (filas con `source_file` distinto de SGC). */
export function buildSgcPriors(excelRows) {
  const mov = {}, platform = {}, product = {}
  const bump = (m, k, v) => ((m[k] ??= {})[v] = (m[k][v] ?? 0) + 1)
  for (const r of excelRows) {
    if (!r || r.source_file === SGC_SOURCE_FILE) continue
    const plant = r.planta_normalized, cod = r.cod_prod
    if (!plant || !cod) continue
    bump(mov, `${plant}|${cod}`, r.mov || 'I')
    const p = String(r.platform_normalized ?? '')
    bump(platform, `${plant}|${cod}|${r.mov || 'I'}|${r.es_de_vuelta ? 'V' : ''}`, p.startsWith('VOLCABLE_PTO_') ? 'VOLCABLE_PTO_SGC' : p)
    if (r.product_normalized) bump(product, cod, r.product_normalized)
  }
  const pick = m => Object.fromEntries(Object.entries(m).map(([k, c]) => [k, share(c)]))
  return { mov: pick(mov), platform: pick(platform), product: pick(product), rows: excelRows.length }
}

/** Empareja las patas de transile Ricardone (salida) → puerto (ingreso). Devuelve Map nro → {ctg, leg}. */
export function pairTransiles(records) {
  const out = new Map()
  const puerto = records
    .filter(r => normalizeSgcPlant(r.PLANTA) === PUERTO)
    .sort((a, b) => ms(a.FECHAINGRESO) - ms(b.FECHAINGRESO))
  const used = new Set()
  const ric = records
    .filter(r => normalizeSgcPlant(r.PLANTA) === RICARDONE && r.FECHASALIDA)
    .sort((a, b) => ms(a.FECHASALIDA) - ms(b.FECHASALIDA))
  for (const r of ric) {
    const t = ms(r.FECHASALIDA)
    const match = puerto.find(p => {
      if (used.has(p.NROINGRESO) || p.PATENTECAMION !== r.PATENTECAMION || p.PRODUCTOCODIGO !== r.PRODUCTOCODIGO) return false
      const dt = (ms(p.FECHAINGRESO) - t) / 60000
      return dt >= -30 && dt <= TRANSILE_MAX_MIN
    })
    if (!match) continue
    used.add(match.NROINGRESO)
    const ctg = `SGC_TR_${r.NROINGRESO}`
    out.set(r.NROINGRESO, { ctg, leg: 'E' })
    out.set(match.NROINGRESO, { ctg, leg: 'I' })
  }
  return out
}

/** Columnas que Vicentin puede sumar a la vista (docs/sgc/PEDIDO_COLUMNAS_VISTA.md): si vienen, mandan. */
const opt = (rec, ...keys) => {
  for (const k of keys) if (rec[k] != null && String(rec[k]).trim() !== '') return String(rec[k]).trim()
  return ''
}
const truthy = v => ['SI', 'S', 'TRUE', 'VERDADERO', 'V', 'X', '1'].includes(String(v).trim().toUpperCase())
const PLATFORM_FIX = { 'KEPLER 1 P': 'KEPPLER_1', 'KEPPLER 1 P': 'KEPPLER_1', 'KEPLER 1': 'KEPPLER_1', 'KEPLER 2': 'KEPPLER_2', 'CELDA 16-4': 'CELDA_16' }
const normalizePlatform = raw => PLATFORM_FIX[raw.toUpperCase()] ?? snake(raw)

function inferMov(rec, plant, priors, transile) {
  const declared = opt(rec, 'MOV').toUpperCase()
  if (MOV_TYPE[declared]) return { mov: declared, how: 'SGC_MOV_DECLARED' }
  if (transile) return { mov: transile.leg, how: 'SGC_MOV_TRANSILE' }
  if (rec.firstWeight === 'tara') return { mov: 'E', how: 'SGC_MOV_FROM_FIRST_WEIGHT' }
  if (rec.firstWeight === 'bruto') return { mov: 'I', how: 'SGC_MOV_FROM_FIRST_WEIGHT' }
  const prior = priors.mov[`${plant}|${rec.PRODUCTOCODIGO}`]
  if (prior) return { mov: prior.value, how: 'SGC_MOV_FROM_HISTORY' }
  return { mov: 'I', how: 'SGC_MOV_DEFAULT' }
}

/** Convierte un ingreso SGC cerrado (con salida) en fila de movimientos. */
export function sgcRecordToMovimiento(rec, priors, transile) {
  const plant = normalizeSgcPlant(rec.PLANTA)
  const warnings = []
  const { mov, how } = inferMov(rec, plant, priors, transile)
  warnings.push(how)
  const vueltaDeclared = opt(rec, 'ESDEVUELTA', 'ES_DE_VUELTA')
  const vuelta = vueltaDeclared ? truthy(vueltaDeclared) : Boolean(transile)
  if (!vueltaDeclared && vuelta) warnings.push('SGC_TRANSILE_PAIRED')
  const platformRaw = opt(rec, 'PLATAFORMA')
  let platform = platformRaw ? normalizePlatform(platformRaw) : ''
  if (!platform) {
    const pPrior = priors.platform[`${plant}|${rec.PRODUCTOCODIGO}|${mov}|${vuelta ? 'V' : ''}`]
    platform = pPrior && pPrior.share >= PLATFORM_MIN_SHARE ? pPrior.value : ''
    warnings.push(platform ? 'SGC_PLATFORM_FROM_HISTORY' : 'SGC_PLATFORM_UNKNOWN')
  }
  const calado = opt(rec, 'FECHACALADO')
  // Desde el 16/10 la vista trae calado (HUMEDAD, CONDICION), depósito de carga/descarga y BAJA.
  const condicion = opt(rec, 'CONDICION')
  if (condicion === 'RECHAZADO') warnings.push('SGC_RECHAZADO')
  const baja = opt(rec, 'BAJA') !== ''
  if (baja) warnings.push('SGC_BAJA')
  const deposito = [opt(rec, 'DEPOSITO1'), opt(rec, 'DEPOSITO2')].filter(Boolean).join(' / ')
  const product = priors.product[rec.PRODUCTOCODIGO]?.value ?? String(rec.PRODUCTO ?? '').toUpperCase().replace(/\./g, '').trim()
  const ing = rec.FECHAINGRESO, sal = rec.FECHASALIDA
  return {
    external_operation_id: `SGC_${rec.NROINGRESO}`,
    source_file: SGC_SOURCE_FILE,
    source_date: (sal ?? ing).slice(0, 10),
    planta_original: rec.PLANTA ?? '',
    planta_normalized: plant,
    mov_original: opt(rec, 'MOV'),
    mov,
    movement_type: MOV_TYPE[mov] ?? 'INGRESO',
    movement_type_detail: mov,
    patente_original: rec.PATENTECAMION ?? '',
    plate_normalized: snake(rec.PATENTECAMION).replace(/[^A-Z0-9]/g, ''),
    patente_acoplado: rec.PATENTEACOPLADO ?? '',
    contrato: opt(rec, 'CONTRATO'),
    cliente_contrato: opt(rec, 'CLIENTECONTRATO'),
    ingreso_id: String(rec.NROINGRESO),
    comprob: opt(rec, 'COMPROBANTE'),
    cp_remito: opt(rec, 'CPREMITO'),
    ctg: opt(rec, 'CTG') || (transile?.ctg ?? ''),
    cupo: opt(rec, 'CUPO'),
    entregado_por_a: opt(rec, 'ENTREGADOPOR'),
    localidad_proc_dest: opt(rec, 'LOCALIDAD'),
    fecha_ing_original: ddmmyyyy(ing),
    hora_ing_original: hhmm(ing),
    fecha_calado_original: ddmmyyyy(calado),
    hora_calado_original: hhmm(calado),
    fecha_sal_original: ddmmyyyy(sal),
    hora_sal_original: hhmm(sal),
    external_ingreso_at: ing ?? '',
    external_calado_at: calado,
    external_salida_at: sal ?? '',
    cod_prod: rec.PRODUCTOCODIGO ?? '',
    producto_original: rec.PRODUCTO ?? '',
    product_normalized: product,
    plataforma_original: platformRaw,
    platform_normalized: platform,
    plataforma_manual: opt(rec, 'PLATAFORMAMANUAL'),
    kgs_bruto: kg(rec.PESOBRUTO),
    kgs_tara: kg(rec.PESOTARA),
    kgs_neto: kg(rec.PESONETO),
    kgs_neto_neto: kg(rec.PESONETONETO),
    humedad: opt(rec, 'HUMEDAD'),
    observaciones: opt(rec, 'OBSERVACIONES'),
    observacion_calidad: opt(rec, 'OBSERVACIONCALIDAD') || condicion,
    condicion,
    deposito,
    baja,
    es_de_vuelta_original: vueltaDeclared || (vuelta ? 'SGC_TRANSILE' : ''),
    es_de_vuelta: vuelta,
    normalization_warnings: warnings.join(';'),
    external_sl_balanza_entrada_at: '',
    external_sl_balanza_salida_at: '',
    tiempos_entre_pasos_source_file: '',
    tiempos_entre_pasos_match: '',
  }
}
