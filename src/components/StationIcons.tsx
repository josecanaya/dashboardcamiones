// Iconos para estaciones — retornan <g> para embeber en SVG
const strokeProps = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

export function IconGate() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M4 4v16h16V4" />
      <path d="M4 12h16" />
      <path d="M10 8v8M14 8v8" />
    </g>
  )
}

export function IconScale() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="m3 9 9-7 9 7v12H3V9z" />
      <path d="M12 6v4" />
      <path d="M9 14h6" />
    </g>
  )
}

export function IconLab() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M9 3v6l6-3-6-3Z" />
      <path d="M9 3l6 3v6l-6-3V3Z" />
      <path d="M3 15h18v4H3z" />
    </g>
  )
}

export function IconDecision() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <path d="m4.93 4.93 2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </g>
  )
}

export function IconSilo() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M12 2v20" />
      <path d="M8 6h8v12H8z" />
      <path d="M4 18h16" />
      <path d="M6 14h4M14 14h4" />
    </g>
  )
}

export function IconExit() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </g>
  )
}

export function IconParking() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 8v8M15 8v4M9 12h6" />
    </g>
  )
}

export function IconWarning() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </g>
  )
}

export function IconShield() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </g>
  )
}

export function IconTube() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <circle cx="12" cy="12" r="4" />
      <path d="M8 8l4-4 4 4M8 16l4 4 4-4M16 8l4 4-4 4M8 8l-4 4 4 4" />
    </g>
  )
}

export function IconRepeat() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </g>
  )
}

export function IconFork() {
  return (
    <g fill="none" {...strokeProps} transform="scale(0.7) translate(-12,-12)">
      <path d="M12 2v8" />
      <path d="M8 10v6l4 4 4-4v-6" />
      <path d="M8 10l4-4 4 4" />
    </g>
  )
}

/** Solo circuito oficial A..G. */
export const STATION_ICONS: Record<string, () => JSX.Element> = {
  A: IconGate,
  B: IconScale,
  C: IconLab,
  D: IconSilo,
  E: IconScale,
  F: IconExit,
  G: IconParking,
}
