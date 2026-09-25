/**
 * Conclusiones de soja (lámina 18), escritas desde el paquete en cada corrida.
 *
 * Antes eran texto manual y el sync no las tocaba: la semana nueva salía con las cifras de la
 * anterior («las conclusiones están desactualizadas», comité 25/09). Ahora se arman con los
 * mismos números de las láminas 7–17.
 *
 * Criterio de redacción (ver memoria del proyecto «conclusiones comité»): hechos y números,
 * nada de obviedades; una caída de volumen se marca «a validar con planta», no como dato
 * incompleto; si una regla no encuentra nada que decir, el párrafo no se escribe.
 *
 * El texto lleva `**negrita**`; `pedidosConclusiones` lo convierte en rangos con estilo.
 */
import { playaOsl } from '../server/logisticsReport/reportWorkbook.mjs'

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const dia = (f) => `${NOMBRES_DIA[new Date(`${f}T00:00:00Z`).getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`
const n0 = (v) => Math.round(v).toLocaleString('es-AR')
const hm = (min) => {
  const m = Math.round(min)
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

const TRAMOS_NOMBRE = {
  'INGRESO→PREINGRESO': 'el ingreso',
  'PREINGRESO→CALADA': 'Playa 1',
  'CALADA→EGRESO': 'la salida de Ricardone',
  'EGRESO→SL_INGRESO': 'el traslado interplanta',
  'SL_INGRESO→SL_BALANZA_INGRESO': 'Playa OSL',
  'SL_BALANZA_INGRESO→SL_VOLCABLE': 'la descarga',
  'SL_VOLCABLE→SL_EGRESO': 'el egreso de San Lorenzo',
}

/** Minutos de un tramo en un bloque (período o día), con Playa OSL medida o deducida. */
function minutosTramo(bloque, key) {
  if (key === 'SL_INGRESO→SL_BALANZA_INGRESO') return playaOsl(bloque)?.min ?? null
  const t = (bloque?.tramos ?? []).find((x) => x.key === key)
  return t && t.n > 0 && typeof t.mediaMin === 'number' ? t.mediaMin : null
}

/**
 * @param paquete  paquete del informe, ya con exclusiones aplicadas
 * @param comparativo  `{ antes, ahora, contra }` del histórico (null si no hay semana previa)
 * @returns párrafos con `**negrita**`
 */
export function conclusionesSoja(paquete, comparativo) {
  const soja = paquete.tiempos?.soja
  const p = soja?.periodo
  if (!p || typeof p.tiempoMedioMin !== 'number') return []
  const parrafos = []

  // 1. Tiempo medio y comparación con la semana anterior.
  let uno = `El circuito R7 promedió **${n0(p.tiempoMedioMin)} minutos (${hm(p.tiempoMedioMin)})** puerta a puerta sobre **${n0(p.camiones)} camiones**`
  if (comparativo && typeof comparativo.antes === 'number' && comparativo.antes > 0) {
    const d = Math.round(p.tiempoMedioMin) - comparativo.antes
    const pct = Math.round((Math.abs(d) / comparativo.antes) * 100)
    uno +=
      d === 0
        ? `, igual que la semana del ${comparativo.contra}.`
        : `, **${Math.abs(d)} minutos ${d < 0 ? 'menos' : 'más'} (${d < 0 ? '−' : '+'}${pct} %)** que la semana del ${comparativo.contra} (${comparativo.antes} min).`
  } else uno += '.'
  parrafos.push(uno)

  // 2. Dónde se va el tiempo: las dos esperas en playa.
  const playa1 = minutosTramo(p, 'PREINGRESO→CALADA')
  const osl = playaOsl(p)
  if (playa1 !== null && osl) {
    const pct = Math.round(((playa1 + osl.min) / p.tiempoMedioMin) * 100)
    let dos = `Las esperas en **Playa 1 de Ricardone (${n0(playa1)} min)** y **Playa OSL (${n0(osl.min)} min)** suman el **${pct} %** del ciclo.`
    if (osl.estimado) dos += ' Playa OSL se calcula por diferencia porque la cámara de ingreso a San Lorenzo no registra lecturas.'
    parrafos.push(dos)
  }

  // 3. Día más lento (con el tramo que lo explica) y día más ágil.
  const dias = Object.entries(soja.porDia ?? {})
    .filter(([, d]) => typeof d?.tiempoMedioMin === 'number' && (d.camiones ?? 0) > 0)
    .map(([f, d]) => ({ f, d }))
  if (dias.length >= 3) {
    const orden = [...dias].sort((a, b) => b.d.tiempoMedioMin - a.d.tiempoMedioMin)
    const lento = orden[0]
    const agil = orden[orden.length - 1]
    let causa = null
    for (const key of Object.keys(TRAMOS_NOMBRE)) {
      const vDia = minutosTramo(lento.d, key)
      const vSem = minutosTramo(p, key)
      if (vDia === null || vSem === null) continue
      const exceso = vDia - vSem
      if (!causa || exceso > causa.exceso) causa = { key, vDia, exceso }
    }
    let tres = `El **${dia(lento.f)}** fue el día más lento, con **${n0(lento.d.tiempoMedioMin)} min**`
    if (causa && causa.exceso >= 15) {
      tres += `, por ${TRAMOS_NOMBRE[causa.key]} (**${n0(causa.vDia)} min**, ${n0(causa.exceso)} más que el promedio semanal)`
    }
    tres += `; el más ágil, el **${dia(agil.f)}**, con **${n0(agil.d.tiempoMedioMin)} min**.`
    // Si los días de más volumen son también los más lentos, es la conexión que importa.
    const porVolumen = [...dias].sort((a, b) => b.d.camiones - a.d.camiones).slice(0, 2).map((x) => x.f)
    const porTiempo = orden.slice(0, 2).map((x) => x.f)
    if (porVolumen.every((f) => porTiempo.includes(f))) {
      tres += ' Los dos días de mayor volumen fueron también los dos más lentos.'
    }
    parrafos.push(tres)
  }

  // 4. Caída de volumen: días por debajo de la mitad del día pico → validar con planta.
  const conVolumen = Object.entries(soja.porDia ?? {})
    .map(([f, d]) => ({ f, n: d?.camiones ?? 0 }))
    .sort((a, b) => a.f.localeCompare(b.f))
  if (conVolumen.length >= 3) {
    const pico = conVolumen.reduce((a, b) => (b.n > a.n ? b : a))
    const bajos = conVolumen.filter((x) => x.n < pico.n * 0.5)
    if (bajos.length && bajos.length < conVolumen.length) {
      const min = Math.min(...bajos.map((x) => x.n))
      const max = Math.max(...bajos.map((x) => x.n))
      const idx = bajos.map((b) => conVolumen.findIndex((x) => x.f === b.f))
      const contiguos = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
      const lista = bajos.map((b) => `el **${dia(b.f)}** (${n0(b.n)})`)
      const cuando =
        bajos.length === 1
          ? `El **${dia(bajos[0].f)}** registró **${n0(min)} camiones**, menos de`
          : contiguos
            ? `Del **${dia(bajos[0].f)} al ${dia(bajos[bajos.length - 1].f)}** el volumen quedó entre **${n0(min)} y ${n0(max)} camiones diarios**, menos de`
            : `${[lista.slice(0, -1).join(', '), lista.at(-1)].join(' y ').replace(/^el/, 'El')} quedaron por debajo de`
      parrafos.push(
        `${cuando} la mitad que el ${dia(pico.f)} (${n0(pico.n)}): validar con planta si hubo un inconveniente operativo o un cambio en la programación de arribos.`,
      )
    }
  }
  return parrafos
}

/** Pedidos de Slides que escriben los párrafos en el cuadro de conclusiones, con negritas. */
export function pedidosConclusiones(objectId, parrafos, { size = 12, color = '06245F' } = {}) {
  const rgb = (hex) => {
    const n = parseInt(hex, 16)
    return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 }
  }
  let texto = ''
  const negritas = []
  parrafos.forEach((p, i) => {
    if (i) texto += '\n'
    for (const [k, trozo] of p.split('**').entries()) {
      if (k % 2 === 1) negritas.push([texto.length, texto.length + trozo.length])
      texto += trozo
    }
  })
  return [
    { deleteText: { objectId, textRange: { type: 'ALL' } } },
    { insertText: { objectId, text: texto, insertionIndex: 0 } },
    {
      updateTextStyle: {
        objectId,
        textRange: { type: 'ALL' },
        style: {
          fontFamily: 'Inter',
          fontSize: { magnitude: size, unit: 'PT' },
          bold: false,
          foregroundColor: { opaqueColor: { rgbColor: rgb(color) } },
        },
        fields: 'fontFamily,fontSize,bold,foregroundColor',
      },
    },
    {
      updateParagraphStyle: {
        objectId,
        textRange: { type: 'ALL' },
        style: { alignment: 'START', spaceBelow: { magnitude: 10, unit: 'PT' }, lineSpacing: 115 },
        fields: 'alignment,spaceBelow,lineSpacing',
      },
    },
    ...negritas.map(([a, b]) => ({
      updateTextStyle: {
        objectId,
        textRange: { type: 'FIXED_RANGE', startIndex: a, endIndex: b },
        style: { bold: true },
        fields: 'bold',
      },
    })),
  ]
}
