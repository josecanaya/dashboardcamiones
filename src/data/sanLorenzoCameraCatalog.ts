/**
 * Catálogo operativo de cámaras San Lorenzo (Puerto).
 * Fuente única para normalización ETL, mapa de sectores y apoyo a circuitos Ricardone (R7, RS_*).
 *
 * Instaladas: 6 frontales + 6 traseras (excluidas del ETL principal) = 12 físicas.
 * S2/S3/S4: referencia planificada, no instaladas aún.
 */

export type SanLorenzoCameraDef = {
  deviceCode: string
  sectorCode: string
  logicalSector: string
  logicalCode: string
  label: string
  /** Cámara trasera / excluida del frente operativo ETL */
  rearExcluded?: boolean
  /** Punto fuerte para corroborar circuito */
  strongPoint?: boolean
  /** false = planificada pero sin lecturas en planta */
  installed?: boolean
}

/** Alias Truckflow → deviceCode canónico del catálogo. */
const DEVICE_ALIASES: Record<string, string> = {
  slzbalingfte: 'SLZBalIngFte',
  slzbalingtras: 'SLZBalIngTras',
}

function normDeviceKey(deviceCode: string): string {
  return String(deviceCode ?? '').trim().toLowerCase()
}

export const SAN_LORENZO_CAMERAS: readonly SanLorenzoCameraDef[] = [
  // —— S0 Ingreso ——
  {
    deviceCode: 'SLZIngCamFrente',
    sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
    logicalSector: 'S0',
    logicalCode: 'SL_INGRESO',
    label: 'Ingreso San Lorenzo (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZIngCamTrasera',
    sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
    logicalSector: 'S0',
    logicalCode: 'SL_INGRESO_TRASERA_EXCLUIDA',
    label: 'Ingreso San Lorenzo (trasera)',
    rearExcluded: true,
    installed: true,
  },
  // —— S1 Balanza ingreso ——
  {
    deviceCode: 'SLZBalIngFte',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
    logicalSector: 'S1',
    logicalCode: 'SL_BALANZA_INGRESO',
    label: 'Balanza ingreso San Lorenzo (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZBalIngTras',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
    logicalSector: 'S1',
    logicalCode: 'SL_BALANZA_INGRESO_TRASERA_EXCLUIDA',
    label: 'Balanza ingreso San Lorenzo (trasera)',
    rearExcluded: true,
    installed: true,
  },
  // —— S2 Calada ——
  {
    deviceCode: 'SLZCalCam',
    sectorCode: 'PUERTO_SAN_LORENZO_CALADA',
    logicalSector: 'S2',
    logicalCode: 'SL_CALADA',
    label: 'Calada San Lorenzo',
    installed: true,
  },
  // —— S3 Enlace ——
  {
    deviceCode: 'SLZEnlace31Cam',
    sectorCode: 'PUERTO_SAN_LORENZO_ENLACE_S3',
    logicalSector: 'S3',
    logicalCode: 'SL_ENLACE',
    label: 'Enlace S1–S3',
    installed: true,
  },
  // —— S4 Descarga ——
  {
    deviceCode: 'SLZDescCam',
    sectorCode: 'PUERTO_SAN_LORENZO_DESCARGA',
    logicalSector: 'S4',
    logicalCode: 'SL_DESCARGA',
    label: 'Descarga San Lorenzo',
    installed: true,
  },
  // —— S5 Balanza salida (2 celdas / básculas) ——
  {
    deviceCode: 'SLZBalSC1Fte',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
    logicalSector: 'S5',
    logicalCode: 'SL_BALANZA_SALIDA',
    label: 'Balanza salida SC1 (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZBalSC1Tras',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
    logicalSector: 'S5',
    logicalCode: 'SL_BALANZA_SALIDA_TRASERA_EXCLUIDA',
    label: 'Balanza salida SC1 (trasera)',
    rearExcluded: true,
    installed: true,
  },
  {
    deviceCode: 'SLZBalSC2Fte',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
    logicalSector: 'S5',
    logicalCode: 'SL_BALANZA_SALIDA',
    label: 'Balanza salida SC2 (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZBalSC2Tras',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
    logicalSector: 'S5',
    logicalCode: 'SL_BALANZA_SALIDA_TRASERA_EXCLUIDA',
    label: 'Balanza salida SC2 (trasera)',
    rearExcluded: true,
    installed: true,
  },
  // —— S7 Egreso (2 salidas) ——
  {
    deviceCode: 'SLZSalidaC1Fte',
    sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    logicalSector: 'S7',
    logicalCode: 'SL_EGRESO',
    label: 'Egreso San Lorenzo C1 (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZSalidaC1Tras',
    sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    logicalSector: 'S7',
    logicalCode: 'SL_EGRESO_TRASERA_EXCLUIDA',
    label: 'Egreso San Lorenzo C1 (trasera)',
    rearExcluded: true,
    installed: true,
  },
  {
    deviceCode: 'SLZSalidaC2Fte',
    sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    logicalSector: 'S7',
    logicalCode: 'SL_EGRESO',
    label: 'Egreso San Lorenzo C2 (frente)',
    strongPoint: true,
    installed: true,
  },
  {
    deviceCode: 'SLZSalidaC2Tras',
    sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    logicalSector: 'S7',
    logicalCode: 'SL_EGRESO_TRASERA_EXCLUIDA',
    label: 'Egreso San Lorenzo C2 (trasera)',
    rearExcluded: true,
    installed: true,
  },
] as const

const DEVICE_MAP = new Map<string, SanLorenzoCameraDef>()
for (const cam of SAN_LORENZO_CAMERAS) {
  DEVICE_MAP.set(normDeviceKey(cam.deviceCode), cam)
}
for (const [alias, canonical] of Object.entries(DEVICE_ALIASES)) {
  const def = DEVICE_MAP.get(normDeviceKey(canonical))
  if (def) DEVICE_MAP.set(alias, def)
}

/** Fallback por sector cuando el evento no trae deviceCode conocido. */
const SECTOR_LOGICAL_FALLBACK: Record<string, { logicalSector: string; logicalCode: string; label: string }> = {
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: {
    logicalSector: 'S0',
    logicalCode: 'SL_INGRESO',
    label: 'Ingreso San Lorenzo',
  },
  PUERTO_SAN_LORENZO_BALANZA_INGRESO: {
    logicalSector: 'S1',
    logicalCode: 'SL_BALANZA_INGRESO',
    label: 'Balanza ingreso San Lorenzo',
  },
  PUERTO_SAN_LORENZO_BALANZA_SALIDA: {
    logicalSector: 'S5',
    logicalCode: 'SL_BALANZA_SALIDA',
    label: 'Balanza salida San Lorenzo',
  },
  PUERTO_SAN_LORENZO_EGRESO_CAMIONES: {
    logicalSector: 'S7',
    logicalCode: 'SL_EGRESO',
    label: 'Egreso San Lorenzo',
  },
}

export function lookupSanLorenzoCameraByDevice(deviceCode: string): SanLorenzoCameraDef | undefined {
  const key = normDeviceKey(deviceCode)
  return DEVICE_MAP.get(key) ?? DEVICE_MAP.get(DEVICE_ALIASES[key] ?? '')
}

export function lookupSanLorenzoSectorFallback(sectorCode: string):
  | { logicalSector: string; logicalCode: string; label: string }
  | undefined {
  return SECTOR_LOGICAL_FALLBACK[String(sectorCode ?? '').trim().toUpperCase()]
}

export function listSanLorenzoFrontDeviceCodes(): string[] {
  return SAN_LORENZO_CAMERAS.filter((c) => c.installed !== false && !c.rearExcluded).map((c) => c.deviceCode)
}

export function listSanLorenzoRearDeviceCodes(): string[] {
  return SAN_LORENZO_CAMERAS.filter((c) => c.rearExcluded).map((c) => c.deviceCode)
}

export function listSanLorenzoStrongDeviceCodes(): string[] {
  return SAN_LORENZO_CAMERAS.filter((c) => c.installed !== false && c.strongPoint && !c.rearExcluded).map(
    (c) => c.deviceCode
  )
}

export function listSanLorenzoInstalledCameras(): SanLorenzoCameraDef[] {
  return SAN_LORENZO_CAMERAS.filter((c) => c.installed !== false)
}

/** Secuencias operativas con cámaras instaladas hoy (S0→S1→S5→S7). */
export const SL_RECEPCION_SEQUENCES = {
  completa: ['S0', 'S1', 'S5', 'S7'],
  recalado: ['S0', 'S2', 'S1', 'S5', 'S7'],
  esperaPlaya: ['S0', 'S1', 'S5', 'S7'],
} as const
