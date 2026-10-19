// Pasa la evidencia completa (patente + recorrido + color/marca/tipo del DSS) por todas las lecturas abiertas
// de la bandeja (provisorio/pendiente sin decisión, en vivo y archivadas) y, con --apply, confirma como
// decisión automática las que dan ≥ 60 % a un candidato (criterio de operaciones 19/10).
// Uso: node scripts/aplicar-evidencia-pendientes.mjs [--apply] [--site ricardone|san_lorenzo] [--api http://127.0.0.1:8787]
import { AUTO_APPLY_PROBABILITY } from '../server/plantState/plateIdentification.mjs'

const arg = (k, fb) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : fb)
const APPLY = process.argv.includes('--apply')
const API = arg('--api', 'http://127.0.0.1:8787')
const SITES = arg('--site', null) ? [arg('--site')] : ['ricardone', 'san_lorenzo']
const getJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

const resolved = []
const stats = {}
for (const site of SITES) {
  const ids = await getJson(`${API}/api/truckflow/live/identifications?site=${site}`)
  const open = ids.items.filter((it) => ['provisorio', 'pendiente'].includes(it.level) && !it.decision && it.candidates?.length)
  const st = (stats[site] = { abiertos: open.length, aplicables: 0, bajoUmbral: 0, gana_otro: 0, errorDss: 0 })
  for (const it of open) {
    let ev
    try {
      ev = await getJson(`${API}/api/truckflow/live/identifications/${encodeURIComponent(it.fragmentKey)}/evidence?site=${site}`)
    } catch (e) {
      st.errorDss += 1
      continue
    }
    if (ev.dssError) st.errorDss += 1
    const t0 = [...(ev.candidates ?? [])].sort((a, b) => b.probability - a.probability)[0]
    console.error(`[${site}] ${it.readPlate} → ${t0?.plate ?? '—'} ${t0 ? Math.round(t0.probability * 100) : 0} %${ev.dssError ? ' (DSS: ' + ev.dssError + ')' : ''}`)
    const top = [...(ev.candidates ?? [])].sort((a, b) => b.probability - a.probability)[0]
    if (!top || top.probability < AUTO_APPLY_PROBABILITY) {
      if (top && (ev.otherProbability ?? 0) > top.probability) st.gana_otro += 1
      else st.bajoUmbral += 1
      continue
    }
    // Patente válida que la balanza conoce = camión real: la cámara pudo leer bien (TDC138 / TUC138 son dos camiones).
    // Y el elegido tiene que estar en la balanza: los internos de silos no pasan por balanza (LFT101 / LFT141).
    const topInBalanza = it.candidates.find((c) => c.plate === top.plate)?.inBalanza === true
    if (it.validFormat && (it.balanza?.readKnown !== false || !topInBalanza)) {
      st.validaConocida = (st.validaConocida ?? 0) + 1
      continue
    }
    // Camión fantasma: el elegido no está en la balanza y otro parecido sí (DSP63 → DSP630 era OSP630).
    if (!topInBalanza && (it.balanza?.similarInPlant ?? []).some((p) => p !== top.plate)) {
      st.fantasma = (st.fantasma ?? 0) + 1
      continue
    }
    st.aplicables += 1
    resolved.push({ site, fragmentKey: it.fragmentKey, readPlate: it.readPlate, plate: top.plate, journeyUid: top.journeyUid ?? null, probability: top.probability, node: it.nodeLabel, at: it.at, archived: Boolean(it.archived) })
  }
}
// Correcciones cruzadas (A → B y B → A): son dos camiones reales, no se aplica ninguna.
const pairs = new Set(resolved.map((r) => `${r.readPlate}>${r.plate}`))
const crossed = resolved.filter((r) => pairs.has(`${r.plate}>${r.readPlate}`))
for (const r of crossed) resolved.splice(resolved.indexOf(r), 1)
// Cadenas (LFT10 → LFT101 y LFT101 → LFT141): el destino también se corrige; esa lectura queda para revisión.
const reads = new Set(resolved.map((r) => r.readPlate))
const chained = resolved.filter((r) => reads.has(r.plate))
for (const r of chained) resolved.splice(resolved.indexOf(r), 1)
stats.encadenadas = chained.map((r) => `${r.readPlate}→${r.plate}`)
console.log(JSON.stringify({ ...stats, cruzadas: crossed.map((r) => `${r.readPlate}→${r.plate}`) }, null, 2))
for (const r of resolved) console.log(`${r.at.slice(0, 16)} ${r.site} ${r.node}: ${r.readPlate} → ${r.plate} (${Math.round(r.probability * 100)} %)${r.archived ? ' [archivado]' : ''}`)

if (APPLY) {
  let ok = 0
  const fails = []
  for (const r of resolved) {
    const res = await fetch(`${API}/api/truckflow/live/identifications/${encodeURIComponent(r.fragmentKey)}?site=${r.site}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        plate: r.plate,
        journeyUid: r.journeyUid,
        reason: `algoritmo (evidencia ${Math.round(r.probability * 100)} %): patente, recorrido y color/marca/tipo del DSS`,
        operator: 'Sistema · algoritmo',
        source: 'automatic_algorithm',
        rule: 'atributos_dss',
      }),
    })
    if (res.ok) ok += 1
    else fails.push(`${r.readPlate} ${res.status} ${await res.text()}`)
  }
  console.log(`aplicados ${ok} de ${resolved.length}`, fails.slice(0, 10))
}
