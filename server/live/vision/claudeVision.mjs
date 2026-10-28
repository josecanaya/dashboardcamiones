/**
 * Capa 3, última instancia: Claude mira la captura dudosa y las fotos anteriores de cada camión
 * candidato y decide, imagen contra imagen, de cuál es (o de ninguno).
 *
 * Corre con el CLI de Claude Code por la suscripción con la que esté logueado (claude.ai, no API) y lo
 * más barato posible: una sola llamada, sin herramientas, con un prompt de sistema corto en lugar del
 * de Claude Code, y las fotos adjuntas en el mensaje (stream-json), recortadas y achicadas a 900 px.
 * Los candidatos van como A, B, C…: la IA no recibe sus patentes, decide por el vehículo.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findClaudeCli } from '../../etl-agent-chat.mjs'

const LETTERS = 'ABCDEFGH'
const TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS || 180_000)
/** Ancho de las fotos de escena que se mandan (las del DSS son de 2688 px). */
const SCENE_WIDTH = Number(process.env.VISION_SCENE_WIDTH || 900)
/** Franja negra de arriba con la fecha (el recorte de patente que imprime el DSS queda). */
const TOP_BAR = 0.04

const SYSTEM = 'Sos un perito que compara fotos de vehículos de cámaras de una planta de granos. Respondés solo con el JSON pedido.'

const INSTRUCTIONS = (candidates) => [
  'Una cámara capturó un vehículo y la patente quedó mal leída o en duda.',
  ...(candidates.length
    ? ['Decidí, mirando las imágenes, si ese vehículo es alguno de los camiones candidatos (fotos de lecturas anteriores de cada uno).', `Candidatos: ${candidates.join(', ')}.`]
    : ['No hay candidatos: leé la patente en la foto (escena y recorte) lo mejor que puedas y decí qué vehículo es. "eleccion" va "ninguno".']),
  '',
  'Compará el vehículo: forma y color de cabina, marca y modelo, deflector, franjas, calcos, logos, llantas,',
  'paragolpes, espejos, abolladuras, carga o acoplado, y los caracteres visibles de la patente. Las fotos son de',
  'cámaras y horas distintas (día/noche, frente/trasera): no descartes por eso. La patente leída puede estar mal.',
  'Si dos candidatos son igual de compatibles, respondé "ninguno" o confianza baja: errar es peor que no decidir.',
  '',
  'Patente argentina: AAA999 (vieja) o AA999AA (Mercosur). Si no se lee entera, dejala vacía.',
  'Tipo de vehículo: camion (camión o tractor de ruta con o sin acoplado), liviano (auto, pickup, utilitario, furgón),',
  'colectivo, maquinaria (pala cargadora, minicargadora, tractor agrícola, autoelevador) u otro.',
  '',
  'Respondé SOLO con este JSON:',
  '{"eleccion": "<letra o ninguno>", "confianza": <0 a 1 de la elección>, "patente_vista": "<la patente que leés en la captura, o vacío>", "confianza_patente": <0 a 1 de esa lectura>, "tipo": "<camion|liviano|colectivo|maquinaria|otro>", "motivo": "<una o dos frases con los rasgos que coinciden o difieren>"}',
].join('\n')

/** JSON final de la respuesta del modelo (puede venir con texto o bloque de código alrededor). */
export function parseVerdict(text) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0])
    const eleccion = String(v.eleccion ?? '').trim()
    const confianza = Number(v.confianza)
    return {
      eleccion: /^ninguno$/i.test(eleccion) ? null : eleccion.toUpperCase(),
      confianza: Number.isFinite(confianza) ? Math.max(0, Math.min(1, confianza)) : 0,
      patente: String(v.patente_vista ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      confianzaPatente: Number.isFinite(Number(v.confianza_patente)) ? Math.max(0, Math.min(1, Number(v.confianza_patente))) : null,
      tipo: ['camion', 'liviano', 'colectivo', 'maquinaria', 'otro'].includes(String(v.tipo ?? '').toLowerCase()) ? String(v.tipo).toLowerCase() : null,
      motivo: String(v.motivo ?? ''),
    }
  } catch {
    return null
  }
}

/** Foto de escena recortada y achicada (JPEG en base64); el recorte de patente va tal cual (es chico). */
async function imageBlock(file, kind) {
  if (kind === 'patente') return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(file).toString('base64') } }
  const { RawImage } = await import('@huggingface/transformers')
  const img = await RawImage.read(file)
  const top = Math.round(img.height * TOP_BAR)
  const cropped = await img.crop([0, top, img.width - 1, img.height - 1])
  const w = Math.min(SCENE_WIDTH, cropped.width)
  const small = await cropped.resize(w, Math.round((cropped.height * w) / cropped.width))
  // En Node RawImage solo sabe guardar a archivo (toBlob es del navegador).
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vision-'))
  try {
    const out = path.join(dir, 'escena.jpg')
    await small.save(out)
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(out).toString('base64') } }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function runClaude(content, { model, cli }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', model, '--tools', '', '--strict-mcp-config', '--system-prompt', SYSTEM,
      // En una carpeta vacía: dentro del repo el CLI sumaba CLAUDE.md y la memoria del proyecto (~12 000 tokens por consulta).
    ], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`claude: sin respuesta en ${TIMEOUT_MS / 1000} s`)) }, TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const result = out.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).find((e) => e?.type === 'result')
      if (!result) return reject(new Error(`claude salió con ${code}: ${(err || out).slice(0, 300)}`))
      if (result.is_error) return reject(new Error(`claude: ${String(result.result ?? '').slice(0, 200)}`))
      resolve({ text: result.result ?? '', costUsd: result.total_cost_usd ?? null, ms: result.duration_ms ?? null, usage: result.usage ?? null })
    })
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`)
    child.stdin.end()
  })
}

/**
 * @param {{ scene?: string|null, plate?: string|null, label?: string }} capture rutas a la foto de escena y al recorte de patente
 * @param {{ id: string, images: { scene?: string|null, plate?: string|null, label?: string }[] }[]} candidates fotos anteriores de cada camión (id = patente, no se le muestra a la IA)
 * @returns {Promise<{ choice: string|null, confidence: number, seenPlate: string|null, seenPlateConfidence: number|null, vehicleType: string|null, reason: string, letters: Record<string, string>, costUsd: number|null, ms: number|null, raw: string }>}
 */
export async function decideByImage(capture, candidates, { model = process.env.VISION_MODEL || 'opus', cli = findClaudeCli() } = {}) {
  const content = []
  const add = async (file, kind, label) => {
    if (!file) return
    content.push({ type: 'text', text: label })
    content.push(await imageBlock(file, kind))
  }
  await add(capture.scene, 'escena', `Vehículo a identificar, foto completa${capture.label ? ` (${capture.label})` : ''}:`)
  await add(capture.plate, 'patente', 'Vehículo a identificar, recorte de la patente:')
  const letters = {}
  for (const [i, c] of candidates.slice(0, LETTERS.length).entries()) {
    const L = LETTERS[i]
    letters[L] = c.id
    for (const [k, img] of c.images.entries()) {
      await add(img.scene, 'escena', `Candidato ${L}, lectura anterior ${k + 1}, foto completa${img.label ? ` (${img.label})` : ''}:`)
      await add(img.plate, 'patente', `Candidato ${L}, lectura anterior ${k + 1}, recorte de la patente:`)
    }
  }
  content.push({ type: 'text', text: INSTRUCTIONS(Object.keys(letters)) })
  const r = await runClaude(content, { model, cli })
  const v = parseVerdict(r.text)
  const choice = v?.eleccion && letters[v.eleccion] ? letters[v.eleccion] : null
  return { choice, confidence: v ? v.confianza : 0, seenPlate: v?.patente ?? null, seenPlateConfidence: v?.confianzaPatente ?? null, vehicleType: v?.tipo ?? null, reason: v?.motivo ?? "sin respuesta válida", letters, costUsd: r.costUsd, ms: r.ms, usage: r.usage, raw: r.text }
}
