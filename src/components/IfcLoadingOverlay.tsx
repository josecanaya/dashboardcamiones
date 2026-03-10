interface IfcLoadingOverlayProps {
  loadingStage?: string
  loadingProgress?: number | null
  /** Si true, usa fondo blanco (popup). Si false, fondo blanco por defecto. */
  variant?: 'fullscreen' | 'inline'
}

export function IfcLoadingOverlay({ loadingStage, loadingProgress, variant = 'fullscreen' }: IfcLoadingOverlayProps) {
  const isInline = variant === 'inline'
  return (
    <div
      className={`flex items-center justify-center bg-white backdrop-blur-sm ${
        isInline ? 'absolute inset-0 z-10 rounded-xl' : 'absolute inset-0 z-20'
      }`}
    >
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <img
            src="/logo_sinfondo.png"
            alt="Truckflow"
            className="h-20 w-auto max-w-[200px] object-contain"
          />
          <div className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-0 w-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-violet-500"
                style={{
                  animation: `triangleBounce 1s ease-in-out infinite`,
                  animationDelay: `${i * 250}ms`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="w-64 space-y-2 text-center">
          <p className="font-medium text-slate-700">{loadingStage ?? "Cargando..."}</p>
          {loadingProgress != null && (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">{loadingProgress}%</p>
            </>
          )}
          {loadingProgress == null && (
            <p className="text-xs text-slate-500">Preparando...</p>
          )}
        </div>
      </div>
      <style>{`
        @keyframes triangleBounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
