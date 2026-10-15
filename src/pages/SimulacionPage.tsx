/**
 * Simulación · repetición de un día real de Ricardone y el puerto.
 * La página vive en public/simulador/ (la genera `npm run sim:build` con las cámaras y el Excel);
 * acá ocupa exactamente el alto que deja el shell: la página se acomoda a ese alto, sin doble scroll.
 */
export function SimulacionPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <iframe
        title="Simulación de un día de planta"
        src="/simulador/index.html"
        className="h-full min-h-0 w-full flex-1 rounded-xl border-0 bg-[#0E1A16]"
      />
    </div>
  )
}
