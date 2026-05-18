/**
 * Dos `requestAnimationFrame` seguidos: deja que el navegador pinte entrada y animaciones antes de trabajo pesado.
 */
export async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(() => resolve()))
    } else {
      globalThis.setTimeout(() => resolve(), 0)
    }
  })
}
