/**
 * Layout del plano operativo. Una zona es el ESPACIO ENTRE PUNTOS donde el camión
 * espera, no la cámara que lo leyó. El `zoneId` es el mismo que emite el reductor
 * (server/plantState/plantGraph.mjs), así el mapa y la tabla hablan el mismo idioma.
 *
 * El plano se dibuja sobre la vista cenital real (`basePlan`): esa imagen es una
 * capa fija que no se redibuja ni se recorta. Todo lo interactivo va encima, y las
 * posiciones son PORCENTAJES del ancho y alto de esa imagen, así los puntos no se
 * corren cuando cambia el tamaño de la ventana.
 */
export type PlantZoneShape = {
  /** Id de zona del grafo: Z0, Z1, Z2… */
  zoneId: string
  label: string
  /** Rectángulo legado del diagrama anterior. Se conserva para compatibilidad. */
  x?: number
  y?: number
  w?: number
  h?: number
  /**
   * Límite real dibujado sobre la imagen cenital. Las coordenadas son porcentajes
   * de `basePlan`, igual que los puntos, para que no se desalineen al redimensionar.
   */
  polygonPercent?: { xPercent: number; yPercent: number }[]
  /** sectorCode del catálogo vivo. Se mantiene separado del nombre visible. */
  sectorCode?: string
  /** Color de identidad del sector; el estado operativo se muestra aparte. */
  color?: string
  labelAnchor?: [number, number]
  /** Cámaras del punto que drena la zona — las que sirven para verificar. */
  cameras: string[]
  /**
   * Cortes del monitor en vivo cuando la zona tiene cámaras de naturalezas distintas
   * (ej. calada de sólidos vs. calada líquida): cada grupo abre su propia grilla.
   * Sin `cameraGroups` el monitor abre `cameras` en una sola grilla.
   */
  cameraGroups?: { label: string; devices: string[] }[]
}

/** La vista cenital de la planta: capa fija, tal cual la entregó operaciones. */
export type PlantBasePlan = {
  image: string
  width: number
  height: number
  note?: string
}

/** Familia del punto — define el color del marcador, no su estado. */
export type PlantPointTone =
  | 'acceso'
  | 'calada'
  | 'balanza'
  | 'celda16'
  | 'volcable'
  | 'playa3'
  | 'silos'

/** Qué se hace en el punto: mira, controla u opera. */
export type PlantPointType = 'camera' | 'camera-group' | 'control-point' | 'operation'

/** Grupo de transmisiones que abre un punto en el monitor en vivo. */
export type PlantCameraGroup = { label: string; devices: string[] }

/**
 * Punto de control sobre el plano. `xPercent`/`yPercent` son relativos a la imagen
 * de `basePlan`, nunca píxeles.
 */
export type PlantPoint = {
  /** Código del punto tal como aparece en las secuencias de circuito: S0, S2-LIQ, S9-V1… */
  id: string
  label: string
  /** sectorCode del catálogo en vivo — abre el panel de sector. */
  sectorCode: string
  /** Zona visual que contiene al punto. Es una asociación explícita y editable. */
  zoneId?: string
  type: PlantPointType
  tone: PlantPointTone
  xPercent: number
  yPercent: number
  cameraGroup: PlantCameraGroup
}

/** Geometría editable del camino físico entre dos puntos del circuito. */
export type PlantTramo = {
  id: string
  fromPointId: string
  toPointId: string
  /** Puntos intermedios; los extremos siguen siendo las cámaras/puntos. */
  viaPercent: { xPercent: number; yPercent: number }[]
}

export type PlantLayout = {
  rev: string
  viewBox: [number, number, number, number]
  metersPerUnit: number
  zones: PlantZoneShape[]
  baseImage?: string
  basePlan?: PlantBasePlan
  points?: PlantPoint[]
  tramos?: PlantTramo[]
  /** Cámaras del catálogo que todavía no tienen posición confirmada en el plano. */
  unplacedCameras?: { device: string; sectorCode: string; reason: string }[]
  /** Pasos que aparecen en las secuencias de circuito y todavía no tienen posición. */
  unplacedSteps?: { code: string; label: string }[]
}
