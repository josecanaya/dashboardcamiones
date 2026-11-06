// Informe de uno o varios días del replay por capas (scripts/replay-capas-dia.mjs): qué resolvió cada capa del
// reconocedor, qué quedó suelto o en alerta (por motivo, nodo y patente) y cómo quedó el lote (vínculo).
// Uso: node scripts/informe-capas-dias.mjs <carpeta capas día 1> [<carpeta día 2> …] [--salida informe.md]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const iSal = args.indexOf('--salida')
const salida = iSal >= 0 ? args.splice(iSal, 2)[1] : null
const dias = args.map((dir) => ({ dir, ...JSON.parse(fs.readFileSync(path.join(dir, 'capas.json'), 'utf8')) }))
if (!dias.length) throw new Error('Uso: node scripts/informe-capas-dias.mjs <carpeta> [<carpeta> …] [--salida informe.md]')

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—')
const fecha = (d) => d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7)
const CAPAS = [
  ['2', 'Capa 2 · ¿quién es? (comparación exacta)'],
  ['leida', 'Leída por recorrido de cámaras'],
  ['3.1', 'Capa 3.1 · patentes parecidas, lote y vínculo'],
  ['3.2', 'Capa 3.2 · metadatos (marca, color)'],
  ['3.3', 'Capa 3.3 · banco de corregidas'],
  ['3.4', 'Capa 3.4 · IA por imagen'],
  ['lectura_erronea', 'Lectura errónea confirmada (ilegible junto a un paso guardado)'],
  ['4', 'Capa 4 · alerta'],
]
const col = (f) => dias.map(f)
const fila = (celdas) => `| ${celdas.join(' | ')} |`
const encabezado = (titulo) => [fila([titulo, ...dias.map(fecha)]), fila(['---', ...dias.map(() => '---:')])]

const L = [`# Reconocimiento por capas · ${dias.map(fecha).join(' y ')}`, '']
L.push(`Replay de cada día por el recorrido acordado (\`docs/RECONOCEDOR_RECORRIDO_CAPTURA.md\`), con \`scripts/replay-capas-dia.mjs\`. Cada paso (frontal + trasera + repeticiones de un vehículo en un nodo) termina en una sola capa.`, '')

// 1 · Resumen por capa
L.push('## 1 · Dónde terminó cada paso', '', ...encabezado('Capa'))
for (const [k, nombre] of CAPAS) {
  if (!dias.some((d) => d.porCapa?.[k])) continue
  L.push(fila([nombre, ...col((d) => `${d.porCapa?.[k] ?? 0} (${pct(d.porCapa?.[k] ?? 0, d.pasos)})`)]))
}
L.push(fila(['**Total de pasos**', ...col((d) => `**${d.pasos}**`)]), '')

// 2 · Detalle por regla dentro de cada capa
L.push('## 2 · Con qué regla resolvió cada capa', '', ...encabezado('Capa · regla'))
const detalles = [...new Set(dias.flatMap((d) => Object.keys(d.porDetalle ?? {})))]
const orden = (k) => CAPAS.findIndex(([c]) => k.startsWith(c + ' ·'))
detalles.sort((a, b) => orden(a) - orden(b) || dias.reduce((s, d) => s + (d.porDetalle[b] ?? 0) - (d.porDetalle[a] ?? 0), 0))
for (const k of detalles) L.push(fila([k, ...col((d) => d.porDetalle?.[k] ?? 0)]))
L.push('')

// 3 · Correcciones: a qué base vuelven (toda corrección vuelve a la capa 2)
if (dias.some((d) => d.correccionesVuelvenA)) {
  L.push('## 3 · Las correcciones vuelven a la capa 2 contra…', '', ...encabezado('Base'))
  for (const k of [...new Set(dias.flatMap((d) => Object.keys(d.correccionesVuelvenA ?? {})))]) L.push(fila([k, ...col((d) => d.correccionesVuelvenA?.[k] ?? 0)]))
  L.push('', '«nadie»: la patente corregida no está en ninguna base; queda como camión sin registro.', '')
}

// 4 · Lo que quedó suelto
L.push('## 4 · Qué quedó suelto (capa 4)', '')
const alertas = (d) => d.pasosDetalle.filter((p) => p.capa === '4')
L.push(...encabezado('Motivo'))
for (const m of [...new Set(dias.flatMap((d) => alertas(d).map((p) => p.detalle)))]) L.push(fila([m, ...col((d) => alertas(d).filter((p) => p.detalle === m).length)]))
L.push(fila(['**Total**', ...col((d) => `**${alertas(d).length}**`)]), '')

L.push('### Por nodo', '', ...encabezado('Nodo (planta)'))
const nodo = (p) => `${p.nodo} (${p.site === 'ricardone' ? 'Ric' : 'SL'})`
const nodos = [...new Set(dias.flatMap((d) => alertas(d).map(nodo)))].sort((a, b) => dias.reduce((s, d) => s + alertas(d).filter((p) => nodo(p) === b).length - alertas(d).filter((p) => nodo(p) === a).length, 0))
for (const n of nodos) L.push(fila([n, ...col((d) => alertas(d).filter((p) => nodo(p) === n).length || '')]))
L.push('')

for (const d of dias) {
  const sinReg = alertas(d).filter((p) => p.detalle === 'sin registro')
  const porPatente = new Map()
  for (const p of sinReg) {
    const k = p.final || p.leida
    const o = porPatente.get(k) ?? { pasos: 0, nodos: new Set(), horas: [] }
    o.pasos++
    o.nodos.add(p.nodo)
    o.horas.push(new Date(Date.parse(p.at) - 3 * 3600_000).toISOString().slice(11, 16))
    porPatente.set(k, o)
  }
  if (porPatente.size) {
    L.push(`### Sin registro el ${fecha(d)}: ${porPatente.size} patentes, ${sinReg.length} pasos`, '')
    L.push('Patente válida que no está en cartas, bases ni SGC. Las de 2 o más nodos son vehículos reales que recorren la planta.', '')
    L.push('| Patente | Pasos | Nodos | Primera–última |', '|---|---:|---|---|')
    for (const [k, o] of [...porPatente].sort((a, b) => b[1].nodos.size - a[1].nodos.size || b[1].pasos - a[1].pasos)) L.push(`| ${k} | ${o.pasos} | ${[...o.nodos].join(', ')} | ${o.horas.sort()[0]}–${o.horas.sort().at(-1)} |`)
    L.push('')
  }
  const dudosas = alertas(d).filter((p) => p.detalle === 'lectura dudosa')
  if (dudosas.length) {
    L.push(`### Lecturas dudosas el ${fecha(d)}: ${dudosas.length}`, '', 'Hay candidatos, pero ninguno alcanza para asignar solo.', '')
    L.push('| Hora | Nodo | Leyó | Candidatos |', '|---|---|---|---|')
    for (const p of dudosas) L.push(`| ${new Date(Date.parse(p.at) - 3 * 3600_000).toISOString().slice(11, 16)} | ${nodo(p)} | ${p.leida} | ${(p.candidatos ?? []).slice(0, 3).map((c) => (typeof c === 'string' ? c : c.plate ?? c.patente)).join(', ')} |`)
    L.push('')
  }
}

// 5 · Lote (vínculo): cómo quedaron los viajes esperados
if (dias.some((d) => d.loteVinculo)) {
  L.push('## 5 · El lote: viajes esperados y sus pasos', '')
  L.push('Cada viaje que se esperaba (por carta de porte, base sin carta o SGC) y el estado de sus pasos: leído por cámara, reconstruido con una captura asignada por el vínculo, deducido (sin captura, entre dos lecturas), en curso o faltante.', '')
  for (const universo of ['carta', 'base', 'sgc']) {
    if (!dias.some((d) => d.loteVinculo?.[universo])) continue
    L.push(...encabezado(`Universo: ${universo === 'carta' ? 'cartas de porte' : universo === 'base' ? 'base sin carta' : 'SGC'}`))
    for (const k of ['viajes', 'camara', 'reconstruido', 'deducido', 'por_carta', 'en_curso', 'falta']) {
      if (!dias.some((d) => d.loteVinculo?.[universo]?.[k])) continue
      L.push(fila([k.replace('_', ' '), ...col((d) => {
        const u = d.loteVinculo?.[universo] ?? {}
        const pasos = Object.entries(u).filter(([x]) => x !== 'viajes').reduce((s, [, v]) => s + v, 0)
        return k === 'viajes' ? (u.viajes ?? 0) : `${u[k] ?? 0} (${pct(u[k] ?? 0, pasos)})`
      })]))
    }
    L.push('')
  }
}

const out = salida ?? path.join(dias[0].dir, '..', `informe-capas-${dias.map((d) => d.dia).join('_')}.md`)
fs.writeFileSync(out, L.join('\n') + '\n')
console.log(`→ ${out}`)
