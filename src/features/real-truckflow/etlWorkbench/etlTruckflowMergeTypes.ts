/**
 * Tipo de journey Truckflow usado como entrada del merge contra Movimientos por Contrato.
 *
 * Vive en un módulo leaf (no importa nada del workbench) para cortar el ciclo
 * `etlPlatformCircuitInference ↔ etlTruckflowMovimientosMerge`: la inferencia solo
 * necesitaba el tipo, y el merge necesita funciones de la inferencia.
 *
 * `etlTruckflowMovimientosMerge` lo re-exporta para no romper imports existentes.
 */
export type TruckflowJourneyForMerge = {
  journey_uid: string
  plate_original: string
  plate_normalized: string
  start_time: string
  end_time: string
  duration_min: number
  plant_scope: string
  circuit_code: string
  circuit_label: string
  executive_status: string
  valid_detail: string
  observed_sequence: string
  expected_sequence: string
  matched_sequence_name: string
  matched_variation_name: string
  coverage_percent: number
  has_strong_point: boolean
  useful_events_count: number
  anomaly_real: boolean
  anomaly_type: string
  anomaly_origin_plant: string
  anomaly_leg: string
  committee_reason: string
}
