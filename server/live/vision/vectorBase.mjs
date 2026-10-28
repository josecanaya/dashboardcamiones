/**
 * Base vectorial de imágenes de vehículos: cada foto de escena del DSS se convierte en un vector
 * (DINOv2 small, en la CPU con @huggingface/transformers) para buscar, entre las fotos anteriores de
 * cada camión candidato, las que más se parecen a la captura dudosa. Con eso se arma lo que mira
 * Claude Opus (claudeVision.mjs) y se ordena a los candidatos antes de preguntarle.
 *
 * La foto entera se parece por el fondo (misma cámara = mismo galpón): se saca la franja de arriba
 * (hora y recorte de patente que imprime el DSS) y cada parche de la imagen pesa según cuánto se
 * aparta del fondo de esa cámara (promedio de los parches en ese lugar en todas sus fotos).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const MODEL = 'Xenova/dinov2-small'
/** Franja de arriba con la hora, la patente leída y el recorte de la patente. */
const TOP_CROP = 0.18

let extractorPromise = null
async function extractor() {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline, env }) => {
      env.cacheDir = path.join(ROOT, 'data', 'vision', 'modelos')
      return pipeline('image-feature-extraction', MODEL, { dtype: 'q8' })
    })
  }
  return extractorPromise
}

const norm = (v) => {
  let s = 0
  for (const x of v) s += x * x
  s = Math.sqrt(s) || 1
  return v.map((x) => x / s)
}
export const cosine = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Vectores de una foto: `cls` (la imagen entera), `patches` (16×16 parches de 384) para pesar contra el fondo.
 * @param {string} file ruta a la foto de escena
 */
export async function embedImage(file) {
  const { RawImage } = await import('@huggingface/transformers')
  const img = await RawImage.read(file)
  const top = Math.round(img.height * TOP_CROP)
  const cropped = await img.crop([0, top, img.width - 1, img.height - 1])
  const out = await (await extractor())(cropped)
  const [, n, d] = out.dims
  const data = out.data
  const tok = (i) => Array.from(data.subarray(i * d, (i + 1) * d))
  const patches = []
  for (let i = 1; i < n; i++) patches.push(norm(tok(i)))
  return { cls: norm(tok(0)), patches }
}

/** Fondo de una cámara: promedio de cada parche en sus fotos. */
export function cameraBackground(patchSets) {
  if (!patchSets.length) return null
  const n = patchSets[0].length
  const d = patchSets[0][0].length
  const bg = Array.from({ length: n }, () => new Array(d).fill(0))
  for (const ps of patchSets) for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) bg[i][k] += ps[i][k] / patchSets.length
  return bg.map(norm)
}

/**
 * Vector del vehículo: promedio de los parches pesado por cuánto se apartan del fondo de la cámara.
 * Sin fondo (cámara con pocas fotos) es el promedio simple de los parches.
 */
export function vehicleVector(patches, background = null) {
  const d = patches[0].length
  const acc = new Array(d).fill(0)
  for (let i = 0; i < patches.length; i++) {
    const w = background ? Math.max(0, 1 - cosine(patches[i], background[i])) ** 2 : 1
    for (let k = 0; k < d; k++) acc[k] += w * patches[i][k]
  }
  return norm(acc)
}
