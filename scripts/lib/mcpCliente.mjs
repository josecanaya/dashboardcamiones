/**
 * Cliente MCP mínimo (Streamable HTTP) para el servidor local de Google Slides/Sheets
 * (`mcp-google-slides/`, puerto 8790). Mismo protocolo que usa `sync-informe-slides.mjs`.
 */
import process from 'node:process'

const MCP = process.env.MCP_BASE ?? 'http://127.0.0.1:8790/mcp'

let sesion = null
let siguienteId = 1

async function rpc(method, params) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (sesion) headers['mcp-session-id'] = sesion
  const res = await fetch(MCP, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: siguienteId++, method, params }),
  })
  const nueva = res.headers.get('mcp-session-id')
  if (nueva) sesion = nueva
  const texto = await res.text()
  const linea = texto.split('\n').find((l) => l.startsWith('data:'))
  if (!linea) throw new Error(`Respuesta inesperada del MCP: ${texto.slice(0, 200)}`)
  return JSON.parse(linea.slice(5))
}

export async function conectar(nombre = 'informe') {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: nombre, version: '1' },
  })
  await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sesion,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })
}

export async function tool(nombre, args) {
  const r = await rpc('tools/call', { name: nombre, arguments: args })
  const texto = r.result?.content?.[0]?.text
  if (texto === undefined) throw new Error(`${nombre}: ${JSON.stringify(r).slice(0, 300)}`)
  const datos = JSON.parse(texto)
  if (datos.error) throw new Error(`${nombre}: ${datos.error.code} ${datos.error.message}`)
  return datos
}
