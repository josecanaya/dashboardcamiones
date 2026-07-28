/**
 * Cede el control al navegador entre bloques de trabajo pesado, para que pinte entrada y
 * animaciones en lugar de congelarse.
 *
 * Usa doble `requestAnimationFrame` **solo si la página está visible**: Chrome no dispara rAF en
 * pestañas ocultas o minimizadas, así que los bucles que ceden con esto quedaban colgados
 * indefinidamente al cambiar de pestaña (cargar un período de ~25k eventos no terminaba nunca y
 * los botones quedaban deshabilitados). Con la página oculta no hay nada que pintar, así que se
 * cede con `setTimeout` y el trabajo sigue avanzando en segundo plano.
 */
export async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    const hidden =
      typeof globalThis.document !== 'undefined' &&
      globalThis.document.visibilityState === 'hidden'
    if (!hidden && typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(() => resolve()))
      return
    }
    globalThis.setTimeout(() => resolve(), 0)
  })
}
