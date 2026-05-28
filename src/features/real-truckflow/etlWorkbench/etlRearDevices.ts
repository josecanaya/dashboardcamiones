/** Cámaras traseras / excluidas del frente principal (normalizado: trim + lowercase). */

import { listSanLorenzoRearDeviceCodes } from '../../../data/sanLorenzoCameraCatalog'

const RAW_REAR_DEVICES = [
  'RicIngCamTrasera',
  'RicEgrCamTraser',
  'RicPreIngInTr',
  'RicPreIngEgTr',
  'RicB1Egreso',
  'RicB2Ingreso',
  'RicB3Egreso',
  ...listSanLorenzoRearDeviceCodes(),
] as const
const SET = new Set(RAW_REAR_DEVICES.map((d) => d.trim().toLowerCase()))

export function isEtlRearCameraDevice(deviceCode: unknown): boolean {
  if (typeof deviceCode !== 'string') return false
  return SET.has(deviceCode.trim().toLowerCase())
}

export function listEtlRearDeviceCodes(): readonly string[] {
  return RAW_REAR_DEVICES
}
