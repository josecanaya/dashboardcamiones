// Mapa de planta — zonas físicas (vista top-down)
// Cada estación es un rectángulo en el piso. El centro es donde para el camión.
export interface Zone {
  x: number
  y: number
  w: number
  h: number
}

/** Solo nodos del circuito oficial: A Ingreso, B Balanza 1, C Calada, D Descarga, E Balanza 2, F Egreso, G Espera. */
export const ZONES: Record<string, Zone> = {
  A: { x: 20, y: 180, w: 90, h: 60 },
  B: { x: 180, y: 180, w: 100, h: 60 },
  C: { x: 350, y: 180, w: 100, h: 60 },
  D: { x: 550, y: 175, w: 120, h: 70 },
  E: { x: 730, y: 180, w: 100, h: 60 },
  F: { x: 890, y: 180, w: 90, h: 60 },
  G: { x: 380, y: 280, w: 140, h: 70 },
}

// Centro de cada zona (posición del camión al parar)
export const WAYPOINTS: Record<string, { x: number; y: number }> = Object.fromEntries(
  Object.entries(ZONES).map(([id, z]) => [id, { x: z.x + z.w / 2, y: z.y + z.h / 2 }])
)

// Path suave entre dos centros (bezier)
function qPath(x1: number, y1: number, x2: number, y2: number, curvature = 0.15): string {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = midX + -dy * curvature
  const cy = midY + dx * curvature
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

export function buildPathForSequence(
  seq: string[],
  stepToNode: (s: string) => string
): string {
  const paths: string[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    const from = stepToNode(seq[i])
    const to = stepToNode(seq[i + 1])
    const p1 = WAYPOINTS[from]
    const p2 = WAYPOINTS[to]
    if (p1 && p2) {
      paths.push(qPath(p1.x, p1.y, p2.x, p2.y))
    }
  }
  return paths.join(" ")
}

/** Ángulo de la tangente (radianes). El camión siempre mira hacia adelante. */
export function getPathAngleAt(pathEl: SVGPathElement | null, progress: number): number {
  if (!pathEl) return 0
  const len = pathEl.getTotalLength()
  if (len === 0) return 0
  const t = Math.max(0.001, Math.min(0.999, progress))
  const p1 = pathEl.getPointAtLength(t * len)
  const p2 = pathEl.getPointAtLength(Math.min(1, t + 0.02) * len)
  return Math.atan2(p2.y - p1.y, p2.x - p1.x)
}
