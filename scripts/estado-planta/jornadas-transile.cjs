// Jornadas de los camiones del transile (pellet R30/31/32 y soja R29): cuántas horas seguidas trabaja cada camión y cuántos viajes hace.
// Uso: node scripts/estado-planta/jornadas-transile.cjs <excel_ops_compuesta.json> <salida.json> <desde> <hasta>
// Viaje = una carga en Ricardone de la planilla (ingreso → salida Ricardone). Jornada = viajes seguidos del mismo camión
// sin un corte de más de CORTE h entre una salida de Ricardone y el ingreso siguiente (descanso o fin del turno).
// Fin de la jornada = salida de Ricardone del último viaje + lo que tarda en llegar y descargar en el puerto (PUERTO min).
const fs = require('fs')
const [opsPath, outPath, desde, hasta] = process.argv.slice(2)
const H = 3600000, CORTE = +(process.env.CORTE || 4)
const ts = s => (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(String(s || '')) ? Date.parse(String(s).slice(0, 19) + '-03:00') : null)
const T = JSON.parse(fs.readFileSync(opsPath)).rows
const PUERTO = { pellet: 17 + 208, soja: 11 + 93 }   // interplanta + San Lorenzo (lámina de tramos de cada circuito)
const CIRC = { pellet: c => /^R3[012]$/.test(c || ''), soja: c => c === 'R29' }
const out = { desde, hasta, corteHoras: CORTE, circuitos: {} }
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null }
const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null
for (const [k, isC] of Object.entries(CIRC)) {
  const seen = new Set(), V = []
  for (const r of T) {
    if (seen.has(r.external_operation_id)) continue
    seen.add(r.external_operation_id)
    if (!isC(r.resolved_executive_circuit_code) || r.planta_normalized !== 'RICARDONE' || r.movement_type !== 'EGRESO') continue
    if (/^(.)\1+$/.test(r.plate_normalized || '') || r.source_date < desde || r.source_date > hasta) continue
    const a = ts(r.external_ingreso_at), b = ts(r.external_salida_at)
    if (a && b && b >= a) V.push({ p: r.plate_normalized, a, b, dia: r.source_date })
  }
  const byP = {}
  for (const v of V) (byP[v.p] ??= []).push(v)
  const J = []
  for (const [p, L] of Object.entries(byP)) {
    L.sort((x, y) => x.a - y.a)
    let cur = null
    for (const v of L) {
      if (!cur || v.a - cur.ultimaSalida > CORTE * H) { cur = { p, ini: v.a, ultimaSalida: v.b, viajes: 0 }; J.push(cur) }
      cur.viajes++; cur.ultimaSalida = Math.max(cur.ultimaSalida, v.b)
    }
  }
  for (const j of J) j.horas = +((j.ultimaSalida + PUERTO[k] * 60000 - j.ini) / H).toFixed(1)
  const byV = {}
  for (const j of J) (byV[j.viajes] ??= []).push(j.horas)
  const dias = [...new Set(V.map(v => v.dia))].sort()
  const porDia = Object.fromEntries(dias.map(d => { const r = V.filter(v => v.dia === d); const c = new Set(r.map(v => v.p)).size; return [d, { viajes: r.length, camiones: c, viajesPorCamion: +(r.length / c).toFixed(1) }] }))
  out.circuitos[k] = {
    viajes: V.length, camiones: Object.keys(byP).length, jornadas: J.length, dias,
    horasJornada: { media: mean(J.map(j => j.horas)), p50: pct(J.map(j => j.horas), 0.5), p90: pct(J.map(j => j.horas), 0.9), max: Math.max(...J.map(j => j.horas)) },
    jornadasMas12h: J.filter(j => j.horas > 12).length, jornadasMas15h: J.filter(j => j.horas > 15).length,
    porViajes: Object.fromEntries(Object.entries(byV).map(([n, h]) => [n, { jornadas: h.length, horasMedia: mean(h), horasMax: Math.max(...h) }])),
    viajesPorJornada: mean(J.map(j => j.viajes)),
    viajesPorCamionOperativo: mean(Object.values(byP).map(L => L.length)),
    porDia,
  }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
for (const [k, v] of Object.entries(out.circuitos)) {
  console.log(k, 'viajes', v.viajes, 'camiones', v.camiones, 'jornadas', v.jornadas, 'horas', JSON.stringify(v.horasJornada), '>12h', v.jornadasMas12h, '>15h', v.jornadasMas15h, 'viajes/jornada', v.viajesPorJornada, 'viajes/camión', v.viajesPorCamionOperativo)
  console.log('   por viajes en la jornada', JSON.stringify(v.porViajes))
  console.log('   por día', JSON.stringify(v.porDia))
}
