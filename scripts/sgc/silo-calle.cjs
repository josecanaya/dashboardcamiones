// Cruce Depósito 1 (SGC) × calle de volcable vista por cámara, por día. Uso: node silo-calle.cjs [hora]
const fs = require('fs'), path = require('path')
const ROOT = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data'
const vol = {}
for (const d of fs.readdirSync(ROOT + '/truckflow').filter((x) => /^2026-10-(1[5-9]|2)/.test(x))) {
  for (const f of ['event-list', 'alert-list']) {
    let a; try { a = JSON.parse(fs.readFileSync(`${ROOT}/truckflow/${d}/${f}.json`, 'utf8')) } catch { continue }
    for (const r of a.records || []) {
      const m = /SLZVolcableC(\d)/.exec(r.deviceCode || ''); const p = r.truckPlate
      if (!m || !p || f === 'alert-list') continue
      const t = Date.parse(r.occurredAt) + 206 * 60000
      ;(vol[p] = vol[p] || []).push([t, m[1]])
    }
  }
}
const rows = []
for (const d of fs.readdirSync(ROOT + '/sgc').filter((x) => /^2026-10-(1[6-9]|2)/.test(x))) {
  const a = JSON.parse(fs.readFileSync(`${ROOT}/sgc/${d}/ingresos.json`, 'utf8'))
  for (const r of Object.values(a)) {
    if (r.PLANTA !== 'TERMINAL DE EMBARQUE' || !r.DEPOSITO1 || !r.FECHASALIDA) continue
    const i = Date.parse(r.FECHAINGRESO + '-03:00'), s = Date.parse(r.FECHASALIDA + '-03:00')
    const vs = (vol[r.PATENTECAMION] || []).filter(([t]) => t >= i && t <= s + 1800e3).sort((a, b) => a[0] - b[0])
    const calles = [...new Set(vs.map((v) => v[1]))]
    if (calles.length !== 1) continue   // solo una calle leída: sin ambigüedad
    const t = vs[0][0]; const dia = new Date(t - 3 * 3600e3).toISOString().slice(0, 10); const hora = new Date(t - 3 * 3600e3).toISOString().slice(11, 13)
    rows.push({ dia, hora, silo: r.DEPOSITO1.replace('SILO ', 'S'), calle: calles[0], prod: r.PRODUCTO })
  }
}
const modo = process.argv[2]
const key = (x) => modo === 'hora' ? `${x.dia} ${x.hora}h` : x.dia
const g = {}
for (const x of rows) { const k = key(x); (g[k] = g[k] || {}); const kk = `${x.silo}→C${x.calle}`; g[k][kk] = (g[k][kk] || 0) + 1 }
for (const k of Object.keys(g).sort()) console.log(k.padEnd(14), Object.entries(g[k]).sort().map(([a, b]) => `${a}:${b}`).join('  '))
console.log('filas', rows.length, 'productos', [...new Set(rows.map((r) => r.prod))].join(','))
