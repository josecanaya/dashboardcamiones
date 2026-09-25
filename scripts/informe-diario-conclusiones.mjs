/**
 * Resumen comparable de un día y conclusiones del informe diario.
 *
 * Mismo criterio que las conclusiones del semanal (`informe-conclusiones.mjs`): hechos y
 * números, nada de obviedades; un día de volumen muy bajo se marca «a validar con planta», no
 * como dato incompleto; si una regla no encuentra nada que decir, el párrafo no se escribe.
 *
 * La comparación es contra el **promedio de los días anteriores con informe** (hasta 7), y
 * solo se hace con 3 días o más: con menos, la base no sostiene una variación.
 */
import { playaOsl } from '../server/logisticsReport/reportWorkbook.mjs'

export const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const diaLargo = (f) => `${NOMBRES_DIA[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
export const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('es-AR') : 's/d')
export const hm = (min) => {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
/** Días mínimos de historial para publicar una variación. */
export const MIN_HISTORIAL = 3

export const TRAMOS_SOJA = [
  { key: 'INGRESO→PREINGRESO', corto: 'Ingreso', nombre: 'el ingreso' },
  { key: 'PREINGRESO→CALADA', corto: 'Playa 1', nombre: 'Playa 1' },
  { key: 'CALADA→EGRESO', corto: 'Salida Ric.', nombre: 'la salida de Ricardone' },
  { key: 'EGRESO→SL_INGRESO', corto: 'Interplanta', nombre: 'el traslado interplanta' },
  { key: 'SL_INGRESO→SL_BALANZA_INGRESO', corto: 'Playa OSL', nombre: 'Playa OSL' },
  { key: 'SL_BALANZA_INGRESO→SL_VOLCABLE', corto: 'Descarga', nombre: 'la descarga' },
  { key: 'SL_VOLCABLE→SL_EGRESO', corto: 'Egreso SL', nombre: 'el egreso de San Lorenzo' },
]

/** Minutos de un tramo, con Playa OSL medida o deducida (misma regla que el semanal). */
export function minutosTramo(bloque, key) {
  if (key === 'SL_INGRESO→SL_BALANZA_INGRESO') return playaOsl(bloque)?.min ?? null
  const t = (bloque?.tramos ?? []).find((x) => x.key === key)
  return t && t.n > 0 && typeof t.mediaMin === 'number' ? t.mediaMin : null
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Métricas comparables de un día (lo que se guarda como historial). */
export function resumenDia(paquete, diario) {
  const soja = paquete.tiempos?.soja
  const r7 = soja?.doorToDoorPublishable ? soja.periodo : null
  const act = (id) => (paquete.actividad?.[id]?.missing ? null : num(paquete.actividad?.[id]?.periodo?.camiones))
  return {
    dia: diario.dia,
    movimientos: diario.movimientos?.missing ? null : num(diario.movimientos?.total),
    toneladas: diario.movimientos?.missing || !num(diario.movimientos?.kgNetos) ? null : diario.movimientos.kgNetos / 1000,
    recorridos: paquete.ejecutivo?.missing ? null : num(paquete.ejecutivo?.recorridosEnPeriodo),
    r7Min: num(r7?.tiempoMedioMin),
    r7N: num(r7?.camiones),
    tramos: Object.fromEntries(TRAMOS_SOJA.map((t) => [t.key, soja?.plantsPublishable ? minutosTramo(soja.periodo, t.key) : null])),
    caladaRic: act('calada_ricardone'),
    caladaLiq: act('calada_ricardone_liquidos'),
    caladaSl: act('calada_san_lorenzo'),
    volcRic: act('volcable_ricardone'),
    silos: act('silos_ricardone'),
    volcSl: act('volcable_san_lorenzo'),
    anomalias: num(diario.anomalias?.total),
    demorados: (diario.demorados ?? []).reduce((s, d) => s + d.casos.length, 0),
  }
}

/** Promedio de una métrica sobre el historial; null si hay menos de `MIN_HISTORIAL` días con dato. */
export function promedio(historial, leer) {
  const vals = historial.map(leer).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (vals.length < MIN_HISTORIAL) return null
  return { media: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }
}

/** Variación contra el promedio: `{ d, pct, media, n }` o null. */
export function variacion(valor, historial, leer) {
  const p = promedio(historial, leer)
  if (!p || typeof valor !== 'number' || p.media <= 0) return null
  const d = valor - p.media
  return { d, pct: Math.round((d / p.media) * 100), media: p.media, n: p.n }
}

/**
 * @param paquete  paquete del día, con exclusiones aplicadas
 * @param diario   bloques diarios (`diario.json`)
 * @param historial  `resumenDia` de los días anteriores (el más reciente primero)
 * @returns párrafos con `**negrita**`
 */
export function conclusionesDia(paquete, diario, historial) {
  const hoy = resumenDia(paquete, diario)
  const parrafos = []
  const base = (v) => `promedio de los ${v.n} días anteriores`

  // 1. Volumen del día contra el historial.
  if (typeof hoy.movimientos === 'number') {
    const v = variacion(hoy.movimientos, historial, (h) => h.movimientos)
    const m = diario.movimientos
    let t = `Se registraron **${n0(hoy.movimientos)} movimientos** en el Excel (${n0(m.ingresos)} ingresos y ${n0(m.egresos)} egresos)`
    if (v && v.pct <= -50) {
      t += `, **${Math.abs(v.pct)} % menos** que el ${base(v)} (${n0(v.media)}): validar con planta si hubo un inconveniente operativo o un cambio en la programación de arribos.`
    } else if (v && Math.abs(v.pct) >= 20) {
      t += `, **${v.pct > 0 ? '+' : '−'}${Math.abs(v.pct)} %** frente al ${base(v)} (${n0(v.media)}).`
    } else if (v) {
      t += `, en línea con el ${base(v)} (${n0(v.media)}).`
    } else t += '.'
    parrafos.push(t)
  }

  // 2. Soja R7: tiempo puerta a puerta y el tramo que explica la diferencia.
  if (typeof hoy.r7Min === 'number') {
    const v = variacion(hoy.r7Min, historial, (h) => h.r7Min)
    let t = `El circuito R7 promedió **${n0(hoy.r7Min)} min (${hm(hoy.r7Min)})** puerta a puerta sobre **${n0(hoy.r7N)} camiones**`
    if (v && Math.abs(v.d) >= 10) {
      t += `, **${n0(Math.abs(v.d))} min ${v.d > 0 ? 'más' : 'menos'}** que el ${base(v)} (${n0(v.media)} min)`
      let causa = null
      for (const tr of TRAMOS_SOJA) {
        const pv = promedio(historial, (h) => h.tramos?.[tr.key])
        const x = hoy.tramos[tr.key]
        if (!pv || typeof x !== 'number') continue
        const exceso = (x - pv.media) * Math.sign(v.d)
        if (!causa || exceso > causa.exceso) causa = { tr, x, media: pv.media, exceso }
      }
      if (causa && causa.exceso >= 10) {
        t += `; la diferencia está en ${causa.tr.nombre} (**${n0(causa.x)} min** contra ${n0(causa.media)} habituales)`
      }
      t += '.'
    } else if (v) t += `, similar al ${base(v)} (${n0(v.media)} min).`
    else t += '.'
    parrafos.push(t)

    const playa1 = hoy.tramos['PREINGRESO→CALADA']
    const osl = playaOsl(paquete.tiempos.soja.periodo)
    if (typeof playa1 === 'number' && osl) {
      const pct = Math.round(((playa1 + osl.min) / hoy.r7Min) * 100)
      let t2 = `Las esperas en **Playa 1 (${n0(playa1)} min)** y **Playa OSL (${n0(osl.min)} min)** explican el **${pct} %** del ciclo.`
      if (osl.estimado) t2 += ' Playa OSL se calcula por diferencia: la cámara de ingreso a San Lorenzo no registra lecturas.'
      parrafos.push(t2)
    }
  }

  // 3. Pico de calada en Ricardone.
  const cal = paquete.actividad?.calada_ricardone
  if (cal && !cal.missing && cal.periodo?.picoCamiones > 0) {
    const hora = String(cal.periodo.picoLabel ?? '').match(/(\d{2})h/)?.[1]
    const q = paquete.tiempos?.soja?.periodo?.porCuarto ?? {}
    const totalQ = Object.values(q).reduce((a, b) => a + (b ?? 0), 0)
    const [qTop, qN] = Object.entries(q).sort((a, b) => b[1] - a[1])[0] ?? []
    let t = `La calada de Ricardone atendió **${n0(cal.periodo.camiones)} camiones**, con el pico a las **${hora ?? '?'} h (${n0(cal.periodo.picoCamiones)})**`
    if (totalQ > 0 && qN / totalQ >= 0.35) {
      const franja = { Q1: '22 a 4 h', Q2: '4 a 10 h', Q3: '10 a 16 h', Q4: '16 a 22 h' }[qTop]
      t += `; el **${qTop} (${franja})** concentró el **${Math.round((qN / totalQ) * 100)} %** de los ingresos de soja R7`
    }
    parrafos.push(`${t}.`)
  }

  // 4. Anomalías de conducta y demorados.
  const an = diario.anomalias
  const dem = (diario.demorados ?? []).filter((d) => d.casos.length)
  const partes = []
  if (an?.total) {
    const reglas = an.porRegla.map((r) => `${r.code}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')
    partes.push(`**${an.total} ${an.total === 1 ? 'camión' : 'camiones'} con anomalía de conducta** (${reglas})`)
  }
  for (const d of dem) {
    const [a, b] = d.tramo.split('→')
    const nombre = { 'CALADA→EGRESO': 'calada y egreso de Ricardone', 'EGRESO→SL_INGRESO': 'egreso de Ricardone e ingreso a San Lorenzo' }[d.tramo] ?? `${a} y ${b}`
    const peor = d.casos[0]
    partes.push(`**${d.casos.length} demorados** más de ${d.umbralMin} min entre ${nombre} (el mayor, ${peor.plate} con ${n0(peor.minutos)} min)`)
  }
  if (partes.length) {
    const t = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join('; ')} y ${partes.at(-1)}`
    parrafos.push(`${t.charAt(0).toUpperCase()}${t.slice(1)}.`)
  } else if (an) {
    parrafos.push('Sin anomalías de conducta ni demorados sobre el umbral.')
  }
  return parrafos
}

const NOMBRE_PRODUCTO = { SOJA: 'Soja', GIRASOL: 'Girasol', MAIZ: 'Maíz', ACEITE: 'Aceites', PELLET: 'Pellet', OTROS: 'Otros productos' }
const horaPico = (valores) => {
  let i
  valores.forEach((v, k) => {
    if (v > 0 && (i === undefined || v > valores[i])) i = k
  })
  return i
}

/**
 * Lo destacado del día para la portada: 3 a 4 líneas cortas, con la cifra en negrita.
 *
 * Parte del Excel (volumen, producto, horario) y suma la corrida solo donde aporta (tiempo de
 * la soja al puerto, camiones para revisar). Nunca menciona cámaras ni calidad de lectura.
 */
export function destacadosDia(paquete, diario, historial) {
  const m = diario.movimientos
  const out = []
  if (!m || m.missing || !m.total) return out
  const v = variacion(m.total, historial, (h) => h.movimientos)
  if (v && v.pct <= -50) out.push(`Día de **bajo volumen: ${Math.abs(v.pct)} % menos camiones** que el promedio. Validar con planta.`)
  else if (v && Math.abs(v.pct) >= 15) out.push(`**${Math.abs(v.pct)} % ${v.pct > 0 ? 'más' : 'menos'} camiones** que el promedio de los últimos días (${n0(v.media)}).`)

  const [top] = Object.entries(m.kgPorProducto ?? {}).sort((a, b) => b[1] - a[1])
  if (top && m.kgNetos > 0) {
    out.push(`**${NOMBRE_PRODUCTO[top[0]] ?? top[0]}** movió **${n0(top[1] / 1000)} t** en ${n0(m.porProducto?.[top[0]] ?? 0)} camiones, el **${Math.round((top[1] / m.kgNetos) * 100)} %** del día.`)
  }
  const hi = horaPico(m.ingresosPorHora ?? [])
  const hs = horaPico(m.salidasPorHora ?? [])
  if (hi !== undefined && hs !== undefined) {
    out.push(`Más ingresos a las **${String(hi).padStart(2, '0')} h (${n0(m.ingresosPorHora[hi])})** y más salidas a las **${String(hs).padStart(2, '0')} h (${n0(m.salidasPorHora[hs])})**.`)
  }
  const soja = paquete.tiempos?.soja
  if (soja?.doorToDoorPublishable && typeof soja.periodo?.tiempoMedioMin === 'number') {
    const t = soja.periodo.tiempoMedioMin
    const vt = variacion(t, historial, (h) => h.r7Min)
    let l = `La soja tardó **${hm(t)}** de Ricardone al puerto`
    if (vt && Math.abs(vt.d) >= 10) l += `, **${n0(Math.abs(vt.d))} min ${vt.d < 0 ? 'menos' : 'más'}** que el promedio`
    out.push(`${l}.`)
  }
  return out.slice(0, 4)
}
