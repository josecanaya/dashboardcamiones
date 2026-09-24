/**
 * Escritor del Excel del informe de logística.
 *
 * Toma la plantilla vinculada (`Datos_MANUAL.xlsx` + `vinculos.json`) y el paquete de datos
 * que calculó el dashboard, y produce un Excel nuevo listo para `actualizar.py`.
 *
 * ## Política de relleno (resuelve el «vacío conserva el contenido base»)
 *
 * `actualizar.py` conserva el contenido de la plantilla cuando una celda queda vacía. Eso es
 * correcto para títulos y para las series históricas, pero sería peligroso para un indicador
 * del período: un informe parcial mostraría la cifra del informe anterior como si fuera de
 * esta semana. Por eso cada gráfico tiene una política explícita:
 *
 * | Política     | Qué hace el escritor                                        |
 * |--------------|-------------------------------------------------------------|
 * | `current`    | escribe los valores del período; si falta alguno, **borra** todas las filas del gráfico y lo declara pendiente |
 * | `historical` | no toca la plantilla (serie ya presentada, se conserva)      |
 * | `pending`    | **borra** las filas y lo declara pendiente                   |
 *
 * Borrar es lo que impide que una cifra vieja pase por actual: la celda vacía hace que
 * `actualizar.py` conserve el gráfico base y lo informe como incompleto, y el control del
 * informe lo lista. Nunca se rellena con cero para «completar».
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import XLSX from 'xlsx'

/** Texto que reemplaza a un indicador de texto que no se pudo calcular. */
export const SIN_DATO = 's/d'

/** Aviso que se escribe sobre las cifras de un bloque que quedó sin datos. */
export const FALTAN_DATOS = 'FALTAN DATOS'

/**
 * Cifras de texto que acompañan a un gráfico. Si el gráfico queda pendiente, estas celdas se
 * marcan `FALTAN DATOS` en vez de dejarse vacías.
 *
 * Sin esto, un bloque pendiente quedaba invisible: `actualizar.py` conserva el gráfico base y
 * las cifras de la plantilla, y la diapositiva seguía mostrando los números del informe de
 * referencia como si fueran del período. Ahora se ve en la diapositiva que hay que atacarlo.
 */
export const CHART_TEXT_MARKERS = {}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function weekdayNameOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  return WEEKDAY_NAMES[d.getUTCDay()] ?? ''
}

/** Número que aparece en el nombre de una calle/equipo (`Calle 3`, `RicCal03`, `Volcable 2`). */
function numberIn(name) {
  const m = String(name ?? '').match(/(\d+)/)
  return m ? Number(m[1]) : null
}

/** Camiones de la calle número `n` dentro de una lista `porCalle`, o null si no está. */
function trucksForNumber(porCalle, n) {
  const hit = (porCalle ?? []).find((c) => numberIn(c.camara) === n)
  return hit ? hit.camiones : null
}

/**
 * Cero válido vs. dato faltante — la distinción que decide si un gráfico se publica.
 *
 * Si la sección de actividad tiene datos del período, una calle que no aparece en `porCalle`
 * es una calle que **no operó**: vale 0 y el gráfico se publica. Solo cuando la sección
 * entera falta (tabla ausente o vacía) el valor es desconocido y el gráfico queda pendiente.
 * Sin esta distinción, un domingo sin actividad en la calle 5 invalidaba el gráfico del día.
 */
function activityTrucks(section, porCalle, calleNumber) {
  if (!section || section.missing) return null
  if (calleNumber === null) return null
  return trucksForNumber(porCalle, calleNumber) ?? 0
}

/**
 * Recorridos de un circuito dentro de un producto. La plantilla rotula la categoría con el
 * código adelante (`R5 Volcable 1`, `R7 Terminal de embarque`), así que el código sale de ahí.
 *
 * Cero válido: si la sección ejecutiva tiene datos, un circuito que no aparece es un circuito
 * que no operó ese período (vale 0). Solo si falta la sección entera el valor es desconocido.
 */
function circuitCount(pkg, product, categoria) {
  const sec = pkg.ejecutivo
  if (!sec || sec.missing) return null
  const m = String(categoria ?? '').match(/^(R\d+|SL\d+)\b/i)
  if (!m) return null
  const code = m[1].toUpperCase()
  const list = sec.circuitosPorProducto?.[product] ?? []
  const hit = list.find((c) => String(c.code).toUpperCase() === code)
  return hit ? hit.count : 0
}

/** Camiones del día en una sección de actividad (null solo si la sección falta). */
function activityDayTotal(section, day) {
  if (!section || section.missing) return null
  const d = day ? section.porDia?.[day] : null
  if (!d) return null
  return d.camiones
}

/**
 * Catálogo de gráficos: política y resolución de cada fila.
 *
 * `resolve(pkg, ctx)` recibe `{ categoria, serie, dayByWeekday }` y devuelve el número, o
 * `null` si no se puede sostener. Un solo `null` invalida el gráfico entero (política
 * `current`), porque un gráfico a medias es peor que el gráfico base declarado incompleto.
 */
export const CHART_CATALOG = {
  // La calidad de lectura LPR (D05_G1 / D28_G1) se retiró del informe por decisión del
  // negocio: no se usa. Al no tener entrada en el catálogo caen en `unused` y sus bloques
  // se eliminaron de la plantilla, así que no quedan cifras del informe de referencia
  // colgadas en las diapositivas 5 y 28.

  // —— Distribución por circuito (recorridos de cámara clasificados) ——
  D05_G2: {
    policy: 'current',
    source: 'ejecutivo.circuitosPorProducto.SOJA',
    resolve: (pkg, { categoria }) => circuitCount(pkg, 'SOJA', categoria),
  },
  D28_G2: {
    policy: 'current',
    source: 'ejecutivo.circuitosPorProducto.GIRASOL',
    resolve: (pkg, { categoria }) => circuitCount(pkg, 'GIRASOL', categoria),
  },

  // —— Series históricas ya presentadas: se conservan ——
  D17_G1: { policy: 'historical', note: 'histórico por tramo soja (informes ya presentados)' },
  D17_G2: { policy: 'historical', note: 'histórico total soja (informes ya presentados)' },
  D31_G1: { policy: 'historical', note: 'histórico por tramo girasol (informes ya presentados)' },
  D31_G2: { policy: 'historical', note: 'histórico total girasol (informes ya presentados)' },

  // —— Tiempos ——
  D15_G1: {
    policy: 'current',
    source: 'tiempos.soja',
    resolve: (pkg, { categoria, serie, dayByWeekday }) => {
      const t = pkg.tiempos?.soja
      if (!t?.plantsPublishable) return null
      const day = dayByWeekday.get(categoria)
      const d = day ? t.porDia?.[day] : null
      if (!d) return null
      if (serie === 'Ricardone') return d.ricMediaMin
      // Con la espera en playa deducida donde la cámara de ingreso SL no midió: sin eso la
      // barra de San Lorenzo salía corta justo los días en que la cámara estaba caída.
      if (serie === 'San Lorenzo') return slCorregido(d)?.min ?? null
      return null
    },
  },
  D16_G1: {
    policy: 'current',
    source: 'tiempos.soja',
    resolve: (pkg, { categoria, serie, dayByWeekday }) => {
      // Volumen por cuarto: es un conteo, no depende de la verosimilitud de los tiempos.
      const t = pkg.tiempos?.soja
      if (!t) return null
      const day = dayByWeekday.get(categoria)
      const d = day ? t.porDia?.[day] : null
      if (!d) return null
      const v = d.porCuarto?.[serie]
      return typeof v === 'number' ? v : null
    },
  },
  D16_G2: {
    policy: 'current',
    source: 'tiempos.soja',
    resolve: (pkg, { categoria, dayByWeekday }) => {
      const t = pkg.tiempos?.soja
      if (!t?.doorToDoorPublishable) return null
      const day = dayByWeekday.get(categoria)
      const d = day ? t.porDia?.[day] : null
      return d ? d.tiempoMedioMin : null
    },
  },
  D20_G1: {
    policy: 'current',
    source: 'tiempos.pellet',
    resolve: (pkg, { categoria, dayByWeekday }) => {
      const t = pkg.tiempos?.pellet
      if (!t) return null
      const day = dayByWeekday.get(categoria)
      const d = day ? t.porDia?.[day] : null
      return d ? d.camiones : null
    },
  },
  D25_G1: {
    policy: 'current',
    source: 'tiempos.pellet',
    // Pellet mueve pocos camiones y San Lorenzo suele quedar sin ninguna medición en el día.
    // Con todo-o-nada ese hueco tiraba el gráfico entero y la lámina mostraba las barras del
    // informe de referencia. Acá una planta sin muestra queda como barra vacía, que es lo
    // cierto. Es seguro porque la plantilla no trae valores para este gráfico: una celda
    // vacía no tiene ninguna cifra vieja que reponer.
    allowPartial: true,
    resolve: (pkg, { categoria, serie, dayByWeekday }) => {
      const t = pkg.tiempos?.pellet
      if (!t?.plantsPublishable) return null
      const day = dayByWeekday.get(categoria)
      const d = day ? t.porDia?.[day] : null
      if (!d) return null
      if (serie === 'Ricardone') return d.ricMediaMin
      // Con la espera en playa deducida donde la cámara de ingreso SL no midió: sin eso la
      // barra de San Lorenzo salía corta justo los días en que la cámara estaba caída.
      if (serie === 'San Lorenzo') return slCorregido(d)?.min ?? null
      return null
    },
  },

  // —— Calada ——
  D35_G1: {
    policy: 'current',
    source: 'actividad.calada_ricardone',
    resolve: (pkg, { categoria }) => {
      const sec = pkg.actividad?.calada_ricardone
      return activityTrucks(sec, sec?.periodo?.porCalle, numberIn(categoria))
    },
  },
  D50_G1: {
    policy: 'current',
    source: 'actividad.calada_ricardone_liquidos',
    resolve: (pkg, { categoria, dayByWeekday }) =>
      activityDayTotal(pkg.actividad?.calada_ricardone_liquidos, dayByWeekday.get(categoria)),
  },
  D51_G1: {
    policy: 'current',
    source: 'actividad.calada_san_lorenzo',
    resolve: (pkg, { categoria, dayByWeekday }) =>
      activityDayTotal(pkg.actividad?.calada_san_lorenzo, dayByWeekday.get(categoria)),
  },

  // —— Descargas ——
  D53_G1: {
    policy: 'current',
    source: 'actividad.volcable_ricardone',
    resolve: (pkg, { categoria }) => {
      const sec = pkg.actividad?.volcable_ricardone
      return activityTrucks(sec, sec?.periodo?.porCalle, numberIn(categoria))
    },
  },
  D53_G2: {
    policy: 'current',
    source: 'actividad.volcable_ricardone',
    resolve: (pkg, { categoria, serie, dayByWeekday }) => {
      const sec = pkg.actividad?.volcable_ricardone
      const day = dayByWeekday.get(categoria)
      const d = day ? sec?.porDia?.[day] : null
      return d ? activityTrucks(sec, d.porCalle, numberIn(serie)) : null
    },
  },
  D55_G1: {
    policy: 'current',
    source: 'actividad.silos_ricardone',
    resolve: (pkg, { categoria, dayByWeekday }) =>
      activityDayTotal(pkg.actividad?.silos_ricardone, dayByWeekday.get(categoria)),
  },
  D57_G1: {
    policy: 'current',
    source: 'actividad.volcable_san_lorenzo',
    resolve: (pkg, { categoria, dayByWeekday }) =>
      activityDayTotal(pkg.actividad?.volcable_san_lorenzo, dayByWeekday.get(categoria)),
  },
  D58_G1: {
    policy: 'current',
    source: 'actividad.volcable_san_lorenzo',
    resolve: (pkg, { categoria }) => {
      const sec = pkg.actividad?.volcable_san_lorenzo
      return activityTrucks(sec, sec?.periodo?.porCalle, numberIn(categoria))
    },
  },
}

// Los 7 gráficos «Calada por calle · <día>» y «Puerto por equipo · <día>» comparten resolución:
// la categoría es la calle/equipo y el día viene en el título del gráfico.
const CALADA_DAY_CHARTS = {
  D36_G1: 'Jueves',
  D38_G1: 'Viernes',
  D40_G1: 'Sábado',
  D42_G1: 'Domingo',
  D44_G1: 'Lunes',
  D46_G1: 'Martes',
  D48_G1: 'Miércoles',
}
const PUERTO_DAY_CHARTS = {
  D59_G1: 'Jueves',
  D61_G1: 'Viernes',
  D63_G1: 'Sábado',
  D65_G1: 'Domingo',
  D67_G1: 'Lunes',
  D69_G1: 'Martes',
  D71_G1: 'Miércoles',
}
/**
 * Día de la semana que representa cada gráfico «de un solo día».
 *
 * Su categoría es la calle o el equipo, no el día: el día está en el título. Sin este mapa
 * no se puede saber que un gráfico entero corresponde a una jornada que todavía no ocurrió.
 */
export const CHART_WEEKDAY = { ...CALADA_DAY_CHARTS, ...PUERTO_DAY_CHARTS }

for (const [id, weekday] of Object.entries(CALADA_DAY_CHARTS)) {
  CHART_CATALOG[id] = {
    policy: 'current',
    source: 'actividad.calada_ricardone',
    resolve: (pkg, { categoria, dayByWeekday }) => {
      const sec = pkg.actividad?.calada_ricardone
      const day = dayByWeekday.get(weekday)
      const d = day ? sec?.porDia?.[day] : null
      return d ? activityTrucks(sec, d.porCalle, numberIn(categoria)) : null
    },
  }
}
for (const [id, weekday] of Object.entries(PUERTO_DAY_CHARTS)) {
  CHART_CATALOG[id] = {
    policy: 'current',
    source: 'actividad.volcable_san_lorenzo',
    resolve: (pkg, { categoria, dayByWeekday }) => {
      const sec = pkg.actividad?.volcable_san_lorenzo
      const day = dayByWeekday.get(weekday)
      const d = day ? sec?.porDia?.[day] : null
      return d ? activityTrucks(sec, d.porCalle, numberIn(categoria)) : null
    },
  }
}

/**
 * Celdas de texto que SÍ son indicadores del período. El resto de las 782 entradas de
 * `vinculos.texts` son títulos, ejes y rótulos: se dejan vacías a propósito para que la
 * plantilla conserve su texto original.
 *
 * Si un indicador de esta lista no se puede calcular se escribe `s/d` en vez de dejarlo
 * vacío: dejarlo vacío conservaría la cifra del informe de referencia.
 */
/**
 * Los cuatro KPI que encabezan cada sección de actividad, desde la misma sección del
 * paquete que alimenta su gráfico.
 *
 * Es lo que evita el peor defecto del informe: estos números vivían solo en la plantilla,
 * así que una semana nueva mostraba el pico y el total de la semana anterior junto a un
 * gráfico ya actualizado.
 *
 * `promedio` se acompaña de su denominador explícito (`horasConActividad`) porque «promedio
 * por hora» es ambiguo: no es lo mismo dividir por las 168 horas de la semana que por las
 * horas en que hubo actividad. El informe usa la segunda y ahora lo dice.
 */
function kpiFields(seccion) {
  const periodOf = (pkg) => pkg.actividad?.[seccion]?.periodo
  return {
    [`kpi.${seccion}.pico`]: (pkg) => numberOrNull(periodOf(pkg)?.picoCamiones),
    [`kpi.${seccion}.ventana`]: (pkg) => periodOf(pkg)?.picoLabel ?? null,
    [`kpi.${seccion}.total`]: (pkg) => numberOrNull(periodOf(pkg)?.camiones),
    [`kpi.${seccion}.promedio`]: (pkg) => {
      const p = periodOf(pkg)
      if (p?.promedioPorHora === undefined || p?.promedioPorHora === null) return null
      const horas = p.horasConActividad
      // El denominador se declara porque «promedio por hora» es ambiguo (¿168 horas o las
      // horas con actividad?), pero corto: el recuadro es chico.
      return horas ? `${decimalEs(p.promedioPorHora)}
(${horas} h activas)` : decimalEs(p.promedioPorHora)
    },
  }
}

/**
 * Los mismos KPI que `kpiFields`, pero de un solo día (láminas diarias de calada y volcables).
 *
 * Salen del modelo de actividad del día, que el paquete exporta desde que se agregó la serie
 * horaria. Un día fuera del período devuelve null: `s/d`, nunca la cifra de la plantilla.
 */
function kpiDiaFields(seccion, dia) {
  const diaDe = (pkg, ctx) => {
    const fecha = ctx?.dayByWeekday?.get(dia)
    return fecha ? pkg.actividad?.[seccion]?.porDia?.[fecha] ?? null : null
  }
  return {
    [`kpi.${seccion}.${dia}.pico`]: (pkg, ctx) => numberOrNull(diaDe(pkg, ctx)?.picoCamiones),
    [`kpi.${seccion}.${dia}.ventana`]: (pkg, ctx) => diaDe(pkg, ctx)?.picoLabel || null,
    [`kpi.${seccion}.${dia}.total`]: (pkg, ctx) => numberOrNull(diaDe(pkg, ctx)?.camiones),
    [`kpi.${seccion}.${dia}.promedio`]: (pkg, ctx) => {
      // Solo la cifra: el recuadro diario es chico y no entra el denominador. El criterio es el
      // mismo que el semanal (horas con actividad del día) y está declarado en la lámina semanal.
      const d = diaDe(pkg, ctx)
      return typeof d?.promedioPorHora === 'number' ? decimalEs(d.promedioPorHora) : null
    },
  }
}

const DIAS_SEMANA = ['Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles']

/** Decimal con coma, como se escribe en el informe (`20,3`, no `20.3`). */
function decimalEs(v) {
  return String(round1(v)).replace('.', ',')
}

/** Número, o null si no se puede sostener (lo que hace que se escriba `s/d`). */
function numberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Orden de los siete tramos del circuito R7 tal como los dibuja la plantilla, de izquierda
 * a derecha. El diagrama no rotula cada número con su tramo, así que la correspondencia es
 * posicional y tiene que quedar declarada en un solo lugar.
 */
export const TRAMOS_R7 = [
  'INGRESO→PREINGRESO',
  'PREINGRESO→CALADA',
  'CALADA→EGRESO',
  'EGRESO→SL_INGRESO',
  'SL_INGRESO→SL_BALANZA_INGRESO',
  'SL_BALANZA_INGRESO→SL_VOLCABLE',
  'SL_VOLCABLE→SL_EGRESO',
]

/** `363` minutos → `(6 hs 3 m)`, el formato que usa la plantilla debajo del tiempo total. */
function horasYMinutos(min) {
  const t = Math.round(min)
  const h = Math.floor(t / 60)
  const m = t % 60
  return m === 0 ? `(${h} hs)` : `(${h} hs ${m} m)`
}

/**
 * Los diecinueve valores de una lámina del día a día de soja, desde `tiempos.soja.porDia`.
 *
 * Es la sección que más cifras viejas arrastraba: ocho láminas de números escritos a mano en
 * la plantilla que nadie actualizaba, al lado de un diagrama que parecía del período.
 *
 * Un día fuera del período (la semana en curso) devuelve null en todo: el escritor lo pasa a
 * `s/d` en vez de dejar la cifra de la semana anterior.
 */
/**
 * Descarta días de los tiempos de un producto y recalcula su semana sin ellos.
 *
 * Para cuando un día no es confiable por un problema operativo conocido (p.ej. 23/09: fallas
 * de cámaras en Ricardone, que llevaron el tiempo medio de girasol a 19 h). Es una decisión
 * editorial del informe, así que vive en `exclusiones.json` del período, con su motivo, y
 * queda declarada en el control — no se esconde en el código.
 *
 * El semanal se recalcula ponderando cada día por su muestra (`n`), que reproduce EXACTO el
 * promedio del paquete cuando no se excluye nada (validado: girasol 526,11 = 526,11). Solo
 * toca tiempos: los volúmenes (camiones, circuitos) no se descartan.
 *
 * @param exclusiones `[{ producto: 'girasol', dia: '2026-09-23', motivo: '…' }]`
 */
export function aplicarExclusiones(pkg, exclusiones = []) {
  if (!exclusiones?.length) return pkg
  const out = structuredClone(pkg)
  for (const producto of new Set(exclusiones.map((e) => e.producto))) {
    const t = out.tiempos?.[producto]
    if (!t?.porDia) continue
    const fuera = new Set(exclusiones.filter((e) => e.producto === producto).map((e) => e.dia))
    const dias = Object.entries(t.porDia).filter(([d]) => !fuera.has(d)).map(([, v]) => v)
    for (const d of fuera) delete t.porDia[d]
    t.periodo = recalcularSemana(dias, t.periodo)
  }
  out.controles = {
    ...(out.controles ?? {}),
    exclusiones: [...(out.controles?.exclusiones ?? []), ...exclusiones],
  }
  return out
}

/** Media ponderada por muestra; null si ningún día midió. */
function ponderada(dias, valor, muestra) {
  let suma = 0
  let peso = 0
  for (const d of dias) {
    const v = valor(d)
    const n = muestra(d)
    if (typeof v === 'number' && n > 0) {
      suma += v * n
      peso += n
    }
  }
  return peso ? { media: suma / peso, n: peso } : null
}

function recalcularSemana(dias, periodo) {
  const tramos = (periodo?.tramos ?? []).map((tr) => {
    const de = (d) => (d.tramos ?? []).find((x) => x.key === tr.key)
    const r = ponderada(dias, (d) => de(d)?.mediaMin, (d) => de(d)?.n ?? 0)
    return { ...tr, mediaMin: r?.media ?? null, n: r?.n ?? 0 }
  })
  const sumaPlanta = (planta) => {
    const medidos = tramos.filter((x) => x.planta === planta && x.n > 0)
    return medidos.length ? medidos.reduce((a, x) => a + x.mediaMin, 0) : null
  }
  const total = ponderada(dias, (d) => d.tiempoMedioMin, (d) => d.tiempoMedioN ?? 0)
  const puente = ponderada(dias, (d) => d.bridgeMediaMin, (d) => d.bridgeN ?? 0)
  const porCuarto = {}
  for (const d of dias) {
    for (const [q, v] of Object.entries(d.porCuarto ?? {})) porCuarto[q] = (porCuarto[q] ?? 0) + (v ?? 0)
  }
  const suma = (k) => dias.reduce((a, d) => a + (d[k] ?? 0), 0)
  return {
    ...periodo,
    camiones: suma('camiones'),
    tiempoMedioMin: total?.media ?? null,
    tiempoMedioN: total?.n ?? 0,
    porCuarto,
    ricMediaMin: sumaPlanta('RICARDONE'),
    ricTramos: tramos.filter((x) => x.planta === 'RICARDONE' && x.n > 0).length,
    ricN: suma('ricN'),
    slMediaMin: sumaPlanta('SAN_LORENZO'),
    slTramos: tramos.filter((x) => x.planta === 'SAN_LORENZO' && x.n > 0).length,
    slN: suma('slN'),
    bridgeMediaMin: puente?.media ?? null,
    bridgeN: puente?.n ?? 0,
    tramos,
  }
}

/** Espera en playa de San Lorenzo (Playa OSL): el tramo que mide la cámara de ingreso SL. */
export const TRAMO_PLAYA_OSL = 'SL_INGRESO→SL_BALANZA_INGRESO'
/** El tramo siguiente, de la misma planta: sirve de referencia de cuántos camiones se midieron. */
const TRAMO_TRAS_PLAYA_OSL = 'SL_BALANZA_INGRESO→SL_VOLCABLE'

/**
 * Espera en playa San Lorenzo, medida o deducida.
 *
 * La cámara de ingreso a San Lorenzo estuvo caída del 18/09 en adelante: el tramo quedó sin
 * muestra (n = 0) y el promedio de San Lorenzo se veía artificialmente corto, porque le
 * faltaba justamente la espera más larga. Cuando la cámara no alcanza, se deduce por
 * diferencia: tiempo total del día menos la suma del resto de los tramos.
 *
 * Cuándo se deduce: si el tramo tiene menos de la mitad de mediciones que el siguiente de la
 * misma planta. Eso cubre los días sin cámara y también el total semanal, que si no quedaba
 * medido solo con los camiones de los días en que andaba.
 *
 * Es una ESTIMACIÓN y se marca como tal: el total y cada tramo promedian poblaciones
 * distintas. Validado el 17/09, con la cámara andando: da 159 contra 131 medidos (~+28 min).
 * Si falta cualquier otro tramo, no se deduce (la resta sería falsa) y queda sin dato.
 */
export function playaOsl(slice) {
  const tramos = slice?.tramos ?? []
  const t = tramos.find((x) => x.key === TRAMO_PLAYA_OSL)
  if (!t) return null
  const siguiente = tramos.find((x) => x.key === TRAMO_TRAS_PLAYA_OSL)
  const cubierto = t.n > 0 && (!siguiente || !(siguiente.n > 0) || t.n >= 0.5 * siguiente.n)
  if (cubierto && typeof t.mediaMin === 'number') return { min: t.mediaMin, estimado: false }
  if (typeof slice?.tiempoMedioMin !== 'number') return null
  let resto = 0
  for (const x of tramos) {
    if (x.key === TRAMO_PLAYA_OSL) continue
    if (!(x.n > 0) || typeof x.mediaMin !== 'number') return null
    resto += x.mediaMin
  }
  const min = slice.tiempoMedioMin - resto
  return min > 0 ? { min, estimado: true } : null
}

/**
 * Tiempo en San Lorenzo con la espera en playa corregida: la suma de sus tramos, usando la
 * Playa OSL medida o deducida. Sin deducción posible, el promedio del paquete tal cual.
 */
export function slCorregido(slice) {
  const osl = playaOsl(slice)
  if (!osl?.estimado) {
    return typeof slice?.slMediaMin === 'number' ? { min: slice.slMediaMin, estimado: false } : null
  }
  let min = osl.min
  for (const x of slice.tramos ?? []) {
    if (x.planta !== 'SAN_LORENZO' || x.key === TRAMO_PLAYA_OSL) continue
    if (x.n > 0 && typeof x.mediaMin === 'number') min += x.mediaMin
  }
  return { min, estimado: true }
}

/** Marca de valor estimado: «≈183». Se usa en los textos; los gráficos llevan el número. */
const marca = (estimado) => (estimado ? '≈' : '')

function diaSojaFields(dia) {
  const diaDe = (pkg, ctx) => {
    const fecha = ctx?.dayByWeekday?.get(dia)
    return fecha ? { fecha, d: pkg.tiempos?.soja?.porDia?.[fecha] } : { fecha: null, d: null }
  }
  const campos = {
    [`dia.${dia}.titulo`]: (pkg, ctx) => {
      const { fecha } = diaDe(pkg, ctx)
      return fecha ? `Circuito R7 | ${dia} ${shortDate(fecha)}` : null
    },
    [`dia.${dia}.fecha`]: (pkg, ctx) => {
      const { fecha } = diaDe(pkg, ctx)
      return fecha ? shortDate(fecha) : null
    },
    [`dia.${dia}.camiones`]: (pkg, ctx) => numberOrNull(diaDe(pkg, ctx).d?.camiones),
    [`dia.${dia}.total_min`]: (pkg, ctx) => {
      const v = diaDe(pkg, ctx).d?.tiempoMedioMin
      return typeof v === 'number' ? `${Math.round(v)} Min` : null
    },
    [`dia.${dia}.total_hs`]: (pkg, ctx) => {
      const v = diaDe(pkg, ctx).d?.tiempoMedioMin
      return typeof v === 'number' ? horasYMinutos(v) : null
    },
    [`dia.${dia}.ricardone_min`]: (pkg, ctx) => {
      const v = diaDe(pkg, ctx).d?.ricMediaMin
      return typeof v === 'number' ? `${Math.round(v)} min` : null
    },
    [`dia.${dia}.ricardone_hs`]: (pkg, ctx) => {
      const v = diaDe(pkg, ctx).d?.ricMediaMin
      return typeof v === 'number' ? horasYMinutos(v) : null
    },
    [`dia.${dia}.san_lorenzo_min`]: (pkg, ctx) => {
      const v = slCorregido(diaDe(pkg, ctx).d)
      return v ? `${marca(v.estimado)}${Math.round(v.min)} min` : null
    },
    [`dia.${dia}.san_lorenzo_hs`]: (pkg, ctx) => {
      const v = slCorregido(diaDe(pkg, ctx).d)
      return v ? horasYMinutos(v.min).replace('(', `(${marca(v.estimado)}`) : null
    },
  }
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
    campos[`dia.${dia}.cuarto.${q}`] = (pkg, ctx) => {
      const v = diaDe(pkg, ctx).d?.porCuarto?.[q]
      return typeof v === 'number' ? `${v} camiones` : null
    }
  }
  TRAMOS_R7.forEach((key, i) => {
    campos[`dia.${dia}.tramo.${i + 1}`] = (pkg, ctx) => {
      const d = diaDe(pkg, ctx).d
      if (key === TRAMO_PLAYA_OSL) {
        const v = playaOsl(d)
        return v ? (v.estimado ? `≈${Math.round(v.min)}` : Math.round(v.min)) : null
      }
      const tramo = (d?.tramos ?? []).find((t) => t.key === key)
      return tramo && typeof tramo.mediaMin === 'number' ? Math.round(tramo.mediaMin) : null
    }
  })
  return campos
}

/** Tramos de pellet (R30/31/32) en el orden del diagrama de las láminas 22–24. */
export const TRAMOS_PELLET = [
  'INGRESO→PREINGRESO',
  'PREINGRESO→LIQUIDO',
  'LIQUIDO→BALANZA_INGRESO',
  'BALANZA_INGRESO→PLAYA',
  'PLAYA→BALANZA_EGRESO',
  'BALANZA_EGRESO→SL_INGRESO',
  'SL_INGRESO→SL_BALANZA_INGRESO',
  'SL_BALANZA_INGRESO→SL_VOLCABLE',
  'SL_VOLCABLE→SL_EGRESO',
]

/** Tramos de girasol (R5+R6) en el orden del diagrama de la lámina 30. */
export const TRAMOS_GIRASOL = [
  'INGRESO→PREINGRESO',
  'PREINGRESO→CALADA',
  'CALADA→BALANZA_INGRESO',
  'BALANZA_INGRESO→PLAYA',
  'PLAYA→VOLCABLE',
  'VOLCABLE→BALANZA_EGRESO',
]

/**
 * Campos de un diagrama de tiempos por tramo (título aparte): tramos, total, promedio por
 * planta y camiones.
 *
 * `bloque` resuelve el objeto de tiempos que corresponde (el período o un día): el mismo
 * diagrama se usa para el resumen semanal y para cada jornada, y solo cambia de dónde sale.
 */
function diagramaFields(prefijo, tramos, bloque) {
  const min = (v) => (typeof v === 'number' ? `${Math.round(v)} Min` : null)
  const minPlanta = (v) => (typeof v === 'number' ? `${Math.round(v)} min` : null)
  const hs = (v) => (typeof v === 'number' ? horasYMinutos(v) : null)
  const campos = {
    [`${prefijo}.camiones`]: (pkg, ctx) => numberOrNull(bloque(pkg, ctx)?.camiones),
    [`${prefijo}.total_min`]: (pkg, ctx) => min(bloque(pkg, ctx)?.tiempoMedioMin),
    [`${prefijo}.total_hs`]: (pkg, ctx) => hs(bloque(pkg, ctx)?.tiempoMedioMin),
    [`${prefijo}.ricardone_min`]: (pkg, ctx) => minPlanta(bloque(pkg, ctx)?.ricMediaMin),
    [`${prefijo}.ricardone_hs`]: (pkg, ctx) => hs(bloque(pkg, ctx)?.ricMediaMin),
    [`${prefijo}.san_lorenzo_min`]: (pkg, ctx) => {
      const v = slCorregido(bloque(pkg, ctx))
      return v ? `${marca(v.estimado)}${minPlanta(v.min)}` : null
    },
    [`${prefijo}.san_lorenzo_hs`]: (pkg, ctx) => {
      const v = slCorregido(bloque(pkg, ctx))
      return v ? hs(v.min).replace('(', `(${marca(v.estimado)}`) : null
    },
  }
  tramos.forEach((key, i) => {
    campos[`${prefijo}.tramo.${i + 1}`] = (pkg, ctx) => {
      if (key === TRAMO_PLAYA_OSL) {
        const v = playaOsl(bloque(pkg, ctx))
        return v ? (v.estimado ? `≈${Math.round(v.min)}` : Math.round(v.min)) : null
      }
      const t = (bloque(pkg, ctx)?.tramos ?? []).find((x) => x.key === key)
      // Un tramo sin muestra (n = 0) llega con media 0: no es «0 minutos», es «no se midió».
      return t && t.n > 0 && typeof t.mediaMin === 'number' ? Math.round(t.mediaMin) : null
    }
  })
  return campos
}

const periodoDe = (producto) => (pkg) => pkg.tiempos?.[producto]?.periodo

/** Día de un producto por nombre de día de la semana, o null si ese día no está en el período. */
const diaDe = (producto, dia) => (pkg, ctx) => {
  const fecha = ctx?.dayByWeekday?.get(dia)
  return fecha ? pkg.tiempos?.[producto]?.porDia?.[fecha] ?? null : null
}

/** Título de una lámina diaria: el día y su fecha real, o null si el día no ocurrió. */
function tituloDia(plantilla, dia) {
  return (pkg, ctx) => {
    const fecha = ctx?.dayByWeekday?.get(dia)
    return fecha ? `${plantilla} | ${dia} ${shortDate(fecha)}` : null
  }
}

/**
 * Inicio y fin del operativo de pellet: el primer y el último día con camiones.
 *
 * El operativo no ocupa la semana entera, así que no son las fechas del período. Se toman
 * de los días con movimiento real.
 */
function operativoPellet(pkg) {
  const dias = Object.entries(pkg.tiempos?.pellet?.porDia ?? {})
    .filter(([, d]) => (d?.camiones ?? 0) > 0)
    .map(([fecha]) => fecha)
    .sort()
  return dias.length ? { inicio: dias[0], fin: dias[dias.length - 1] } : null
}

/**
 * Una fila de la tabla «Actividad semanal por sede y tipo de calada» (lámina 34).
 *
 * Mismos números que los KPI de cada sección (35, 50, 51), en una sola tabla: horas con
 * actividad, camiones por hora y total. Sin esto la tabla seguía con las cifras del informe
 * de referencia al lado de láminas ya actualizadas.
 */
function filaCalada(prefijo, seccion) {
  const p = (pkg) => pkg.actividad?.[seccion]?.periodo
  return {
    [`calada.${prefijo}.horas`]: (pkg) => numberOrNull(p(pkg)?.horasConActividad),
    [`calada.${prefijo}.camiones_h`]: (pkg) =>
      typeof p(pkg)?.promedioPorHora === 'number' ? decimalEs(p(pkg).promedioPorHora) : null,
    [`calada.${prefijo}.camiones`]: (pkg) => numberOrNull(p(pkg)?.camiones),
  }
}

export const TEXT_FIELD_CATALOG = {
  // —— Tabla de calada semanal (lámina 34) ——
  ...filaCalada('ric_solida', 'calada_ricardone'),
  ...filaCalada('ric_liquida', 'calada_ricardone_liquidos'),
  ...filaCalada('sl', 'calada_san_lorenzo'),

  // —— Resúmenes semanales por producto ——
  ...diagramaFields('semana.soja', TRAMOS_R7, periodoDe('soja')),
  ...diagramaFields('semana.pellet', TRAMOS_PELLET, periodoDe('pellet')),
  ...diagramaFields('semana.girasol', TRAMOS_GIRASOL, periodoDe('girasol')),

  // —— Operativo de pellet (lámina 20) ——
  'pellet.operativo.inicio': (pkg) => {
    const o = operativoPellet(pkg)
    return o ? shortDate(o.inicio) : null
  },
  'pellet.operativo.fin': (pkg) => {
    const o = operativoPellet(pkg)
    return o ? shortDate(o.fin) : null
  },
  'pellet.operativo.camiones': (pkg) => {
    const n = pkg.tiempos?.pellet?.periodo?.camiones
    return typeof n === 'number' ? `Total volumen  
${n}
camiones` : null
  },
  // El paquete no trae toneladas: `s/d` antes que dejar las del informe de referencia.
  'pellet.operativo.toneladas': () => null,

  // —— Día a día de pellet (láminas 23 y 24) ——
  ...diagramaFields('dia.pellet.Lunes', TRAMOS_PELLET, diaDe('pellet', 'Lunes')),
  ...diagramaFields('dia.pellet.Martes', TRAMOS_PELLET, diaDe('pellet', 'Martes')),
  'dia.pellet.Lunes.titulo': tituloDia('Circuito R30/31/32', 'Lunes'),
  'dia.pellet.Martes.titulo': tituloDia('Circuito R30/31/32', 'Martes'),

  // —— Títulos de las láminas diarias de calada y volcables ——
  ...Object.fromEntries(
    ['Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles'].flatMap((dia) => [
      [`titulo.calada.${dia}`, tituloDia('Actividad Calada', dia)],
      [`titulo.volcables.${dia}`, tituloDia('Actividad Volcables', dia)],
    ]),
  ),

  ...diaSojaFields('Jueves'),
  ...diaSojaFields('Viernes'),
  ...diaSojaFields('Sábado'),
  ...diaSojaFields('Domingo'),
  ...diaSojaFields('Lunes'),
  ...diaSojaFields('Martes'),
  ...diaSojaFields('Miércoles'),

  ...Object.assign(
    {},
    ...DIAS_SEMANA.map((d) => kpiDiaFields('calada_ricardone', d)),
    ...DIAS_SEMANA.map((d) => kpiDiaFields('volcable_san_lorenzo', d)),
  ),

  ...kpiFields('calada_ricardone'),
  ...kpiFields('calada_ricardone_liquidos'),
  ...kpiFields('calada_san_lorenzo'),
  ...kpiFields('volcable_ricardone'),
  ...kpiFields('silos_ricardone'),
  ...kpiFields('volcable_san_lorenzo'),

  // El puerto muestra además el promedio por día, que no es un campo de la sección.
  'kpi.volcable_san_lorenzo.promedio_diario': (pkg) => {
    const p = pkg.actividad?.volcable_san_lorenzo?.periodo
    const dias = pkg.periodo?.dayCount
    if (!p || !dias || typeof p.camiones !== 'number') return null
    return Math.round(p.camiones / dias)
  },

  'period.label': (pkg) => `Período analizado: ${pkg.periodo.label}`,
  'period.start': (pkg) => shortDate(pkg.periodo.from),
  'period.end': (pkg) => shortDate(pkg.periodo.to),
  'period.days': (pkg) => String(pkg.periodo.dayCount),

  // Muestra por producto (D3). Denominador: **recorridos de cámara clasificados**, no
  // movimientos del Excel. «Líquidos» es el bucket ACEITE del resumen ejecutivo.
  'products.soja.count': (pkg) => productCount(pkg, 'SOJA'),
  'products.girasol.count': (pkg) => productCount(pkg, 'GIRASOL'),
  'products.liquidos.count': (pkg) => productCount(pkg, 'ACEITE'),
  'products.pellet.count': (pkg) => productCount(pkg, 'PELLET'),
  'sample.total': (pkg) => {
    const sec = pkg.ejecutivo
    if (!sec || sec.missing) return null
    const total = ['SOJA', 'GIRASOL', 'ACEITE', 'PELLET'].reduce(
      (a, p) => a + (sec.porProducto?.[p] ?? 0),
      0
    )
    return miles(total)
  },
  'sample.unit': () => 'camiones · recorridos de cámara clasificados',
}

function productCount(pkg, product) {
  const sec = pkg.ejecutivo
  if (!sec || sec.missing) return null
  const n = sec.porProducto?.[product]
  return typeof n === 'number' ? miles(n) : null
}

/** `2323` → `2.323`, como los rotula la presentación. */
function miles(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function shortDate(day) {
  return day && day.length >= 10 ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : String(day ?? '')
}

/**
 * Un día que todavía no ocurrió vale 0, no «falta el dato».
 *
 * En una semana en curso el informe se arma antes de que termine el ciclo: el miércoles de
 * un período jueves→martes no es un dato faltante, es una jornada inexistente. Tratarlo como
 * faltante invalidaba el gráfico entero y la plantilla conservaba las barras del informe
 * anterior, que es justo lo contrario de lo que se busca: dejaba pasar cifras viejas como
 * actuales. Con 0 el gráfico se publica y la jornada se ve vacía, que es la verdad.
 *
 * Solo aplica a los días fuera del período. Un día dentro del período sin dato sigue
 * invalidando el gráfico.
 *
 * Con el mapa de días vacío (período atípico: no arranca jueves, no se puede ubicar ningún
 * día en la plantilla) la regla NO aplica. Ahí la ausencia no significa «no ocurrió» sino
 * «no se sabe dónde va», y poner todo en 0 publicaría una semana entera de ceros falsos.
 */
function isWeekdayOutsidePeriod(name, dayByWeekday) {
  if (dayByWeekday.size === 0) return false
  return WEEKDAY_NAMES.includes(name) && !dayByWeekday.has(name)
}

function cellRef(col, row) {
  return `${col}${row}`
}

function setCell(ws, ref, value) {
  if (value === null || value === undefined || value === '') {
    delete ws[ref]
    return
  }
  ws[ref] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: String(value) }
}

function readCell(ws, ref) {
  const c = ws[ref]
  return c ? c.v : null
}

/**
 * Rellena la plantilla con el paquete y devuelve el buffer del Excel nuevo más el detalle de
 * qué quedó conectado y qué pendiente.
 */
export async function buildReportWorkbook({ templatePath, vinculosPath, pkg }) {
  const vinculos = JSON.parse(await fs.readFile(vinculosPath, 'utf8'))
  const wb = XLSX.readFile(templatePath, { cellStyles: true })

  // El mapa día→fecha se arma también para una **semana en curso** (arranca jueves pero
  // todavía no llegó al miércoles): los días que ya están se ubican en su lugar de la
  // plantilla y los gráficos de un solo día se publican. Los que necesitan la semana
  // completa quedan pendientes por la regla de todo-o-nada, sin rellenarse con cero.
  // Solo un período atípico (que no arranca jueves) se queda sin mapa.
  const dayByWeekday = new Map()
  if (!pkg.periodo.atipico) {
    for (const d of pkg.periodo.days) dayByWeekday.set(weekdayNameOf(d), d)
  }

  const filled = []
  const pendientes = []
  const preserved = []
  const unused = []
  /** Labels de texto a marcar «FALTAN DATOS» porque su gráfico quedó pendiente. */
  const markFaltanDatos = new Set()
  const markPending = (id) => {
    for (const label of CHART_TEXT_MARKERS[id] ?? []) markFaltanDatos.add(label)
  }

  // —— Gráficos ——
  for (const g of vinculos.charts) {
    const spec = CHART_CATALOG[g.id]
    const ws = wb.Sheets[g.sheet]
    if (!ws) continue

    if (!spec) {
      // Gráfico retirado del informe: se vacían sus celdas para no arrastrar los valores
      // del informe de referencia, y se declara para que el control lo muestre.
      for (let r = g.start; r <= g.end; r++) setCell(ws, cellRef('C', r), null)
      unused.push({ id: g.id, slide: g.slide, reason: 'retirado del informe: no se usa' })
      continue
    }

    if (spec.policy === 'historical') {
      preserved.push({ id: g.id, slide: g.slide, reason: spec.note })
      continue
    }

    if (spec.policy === 'pending') {
      for (let r = g.start; r <= g.end; r++) setCell(ws, cellRef('C', r), null)
      pendientes.push({ id: g.id, slide: g.slide, reason: spec.note })
      markPending(g.id)
      continue
    }

    // policy === 'current'
    const values = []
    let missingRow = null
    let zeroedDays = 0
    // Un gráfico «de un solo día» cuya jornada no ocurrió va entero a 0.
    const chartDay = CHART_WEEKDAY[g.id]
    const chartDayOutside = chartDay ? isWeekdayOutsidePeriod(chartDay, dayByWeekday) : false

    for (let r = g.start; r <= g.end; r++) {
      const categoria = readCell(ws, cellRef('A', r))
      const serie = readCell(ws, cellRef('B', r))
      const catName = String(categoria ?? '')

      if (chartDayOutside || isWeekdayOutsidePeriod(catName, dayByWeekday)) {
        values.push({ row: r, value: 0 })
        zeroedDays += 1
        continue
      }

      let v = null
      try {
        v = spec.resolve(pkg, { categoria: catName, serie: String(serie ?? ''), dayByWeekday })
      } catch {
        v = null
      }
      if (v === null || v === undefined || !Number.isFinite(Number(v))) {
        if (spec.allowPartial) {
          values.push({ row: r, value: null })
          continue
        }
        missingRow = missingRow ?? { row: r, categoria, serie }
        break
      }
      values.push({ row: r, value: Number(v) })
    }

    // Un gráfico parcial sin ningún valor real no es parcial: es un gráfico sin datos.
    const sinMedir = values.filter((x) => x.value === null).length
    if (spec.allowPartial && !missingRow && sinMedir === values.length) {
      missingRow = { row: g.start, categoria: 'todas', serie: 'todas' }
    }

    if (missingRow) {
      // Un gráfico incompleto no se publica a medias: se vacía entero para que la plantilla
      // no deje pasar cifras viejas, y se declara pendiente.
      for (let r = g.start; r <= g.end; r++) setCell(ws, cellRef('C', r), null)
      pendientes.push({
        id: g.id,
        slide: g.slide,
        reason:
          `sin dato para ${JSON.stringify(missingRow.categoria)} / ${JSON.stringify(missingRow.serie)}` +
          (spec.source ? ` (fuente ${spec.source})` : ''),
      })
      markPending(g.id)
      continue
    }

    for (const { row, value } of values) setCell(ws, cellRef('C', row), value === null ? null : round1(value))
    filled.push({
      id: g.id,
      slide: g.slide,
      values: values.length - sinMedir,
      source: spec.source ?? '',
      ...(sinMedir ? { celdasSinMedicion: sinMedir } : {}),
      // Se declara para que el control del informe diga qué jornadas salieron en 0 por no
      // haber ocurrido, y nadie las lea como «ese día no operó».
      ...(zeroedDays ? { diasFueraDelPeriodoEnCero: zeroedDays } : {}),
    })
  }

  // —— Textos ——
  const textsWs = wb.Sheets.Textos
  let textsFilled = 0
  let textsSinDato = 0
  let textsFaltanDatos = 0
  const textsStatic = []
  if (textsWs) {
    for (const t of vinculos.texts) {
      if (markFaltanDatos.has(t.label)) {
        // La cifra existe en la plantilla pero es del informe de referencia: se tapa con el
        // aviso para que la diapositiva no la muestre como si fuera del período.
        setCell(textsWs, t.cell, FALTAN_DATOS)
        textsFaltanDatos += 1
        continue
      }
      const resolver = TEXT_FIELD_CATALOG[t.label]
      if (!resolver) {
        // Rótulo estático: se deja vacío a propósito (la plantilla conserva el original).
        textsStatic.push(t.label)
        continue
      }
      let value = null
      try {
        value = resolver(pkg, { dayByWeekday })
      } catch {
        value = null
      }
      if (value === null || value === undefined || value === '') {
        setCell(textsWs, t.cell, SIN_DATO)
        textsSinDato += 1
        pendientes.push({ id: `texto.${t.label}`, slide: t.slide, reason: 'indicador sin dato en el período' })
      } else {
        setCell(textsWs, t.cell, value)
        textsFilled += 1
      }
    }
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return {
    buffer,
    detalle: {
      graficos: {
        completados: filled,
        pendientes,
        conservados: preserved,
        retirados: unused,
        total: vinculos.charts.length,
      },
      textos: {
        conectados: textsFilled,
        sinDato: textsSinDato,
        faltanDatos: textsFaltanDatos,
        estaticos: textsStatic.length,
        total: vinculos.texts.length,
      },
    },
  }
}

function round1(v) {
  return Math.round(v * 10) / 10
}

export { weekdayNameOf }
