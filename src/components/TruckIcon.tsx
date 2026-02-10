// Camión top-down: rectángulo principal (caja), cabina marcada, ruedas sugeridas.
// Monocromático, sin 3D. Cabina adelante (dir. de avance).
export function TruckIcon() {
  return (
    <g transform="translate(-20,-8)">
      {/* Caja principal (acoplado) — atrás */}
      <rect x="0" y="2" width="24" height="12" rx="1" fill="#1e293b" stroke="#334155" strokeWidth="1" />
      {/* Cabina — adelante */}
      <rect x="24" y="4" width="10" height="8" rx="1" fill="#0f172a" stroke="#334155" strokeWidth="1" />
      {/* Ruedas */}
      <circle cx="6" cy="14" r="2" fill="none" stroke="#475569" strokeWidth="1" />
      <circle cx="18" cy="14" r="2" fill="none" stroke="#475569" strokeWidth="1" />
      <circle cx="30" cy="14" r="2" fill="none" stroke="#475569" strokeWidth="1" />
    </g>
  )
}
