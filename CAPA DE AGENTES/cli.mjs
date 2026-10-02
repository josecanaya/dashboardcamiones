#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const CAPA = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(CAPA);
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv; const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new Error(`Argumento inesperado: ${rest[i]}`);
    const key = rest[i].slice(2); const val = rest[i + 1];
    if (!val || val.startsWith('--')) throw new Error(`Falta valor de --${key}`);
    options[key] = ['limit', 'timeOffsetMinutes'].includes(key) ? Number(val) : key === 'includeLegacy' ? val === 'true' : val; i++;
  }
  return { command, options };
}
export async function context({product, search, limit = 30} = {}) {
  const ctx = await read(path.join(CAPA, 'conocimiento/contexto.json'));
  const graph = await read(path.join(CAPA, 'conocimiento/grafo.json'));
  const key = String(product ?? '').toLowerCase();
  if (key && !ctx.products?.[key]) throw new Error(`Producto desconocido: ${key}`);
  const needles = [key, search].filter(Boolean).map(s => s.toLowerCase());
  let nodes = (graph.nodes ?? []).filter(n => !needles.length || needles.some(s => JSON.stringify(n).toLowerCase().includes(s)));
  const max = Math.max(1, Math.min(100, Number(limit) || 30)); nodes = nodes.slice(0, max);
  const ids = new Set(nodes.map(n => n.id));
  return { schemaVersion: 1, shared: ctx.shared, product: key ? ctx.products[key] : undefined,
    availableProducts: Object.keys(ctx.products ?? {}), indicadores: (ctx.indicadores ?? ctx.indicators ?? []).filter(r => !key || r.product === key || r.product === 'seguridad'),
    graph: { nodes, edges: (graph.edges ?? []).filter(e => ids.has(e.source) && ids.has(e.target)).slice(0, max * 3), totalNodes: graph.nodes?.length },
    note: 'Conocimiento con referencias; las cifras se consultan con query/report. Grafo acotado a contexto relevante.' };
}
export async function dispatch(command, options = {}) {
  if (command === 'context') return context(options);
  if (command === 'security') return (await import('./servicios/seguridad.mjs')).security(options);
  if (command === 'report') return (await import('./servicios/informes.mjs')).report(options);
  if (command === 'package') return (await import('./servicios/paquete.mjs')).getPackage(options);
  if (command === 'indicator') return (await import('./servicios/paquete.mjs')).indicator(options);
  if (command === 'pellet') return (await import('./servicios/pellet.mjs')).pellet(options);
  if (command === 'runs') {
    const dir = path.join(ROOT, 'runs/windows');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const windows = entries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(e.name)).map(e => e.name).sort();
    return { windows, note: 'Adaptador de descubrimiento; no ejecuta ni regenera ETL.' };
  }
  const names = { sources: 'sources', query: 'query', excel: 'readExcel', api: 'readApi', circuits: 'circuits', table: 'runTable' };
  if (names[command]) return (await import('./servicios/datos.mjs'))[names[command]](options);
  if (command !== 'help') throw new Error(`Comando desconocido: ${command}`);
  return { commands: ['context', 'sources', 'query', 'security', 'circuits', 'runs', 'table', 'excel', 'api', 'package', 'indicator', 'pellet', 'report'],
    examples: ['context --product soja', 'sources --from 2026-09-24 --to 2026-09-30',
      'query --from 2026-09-24 --to 2026-09-30 --product soja --limit 10',
      'security --from 2026-09-24 --to 2026-09-30 --plate HGC160',
      'report --from 2026-09-24 --to 2026-09-30 --type ambos'], folder: CAPA };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const {command, options} = parseArgs(process.argv.slice(2)); console.log(JSON.stringify(await dispatch(command, options), null, 2)); }
  catch(e) { console.error(JSON.stringify({error: e.message})); process.exitCode = 1; }
}
