/**
 * Fila normalizada del Excel "Movimientos por Contrato" (contrato de datos, sin lógica).
 *
 * Vive en `etl-core/domain` porque la consumen tanto los reportes de etl-core
 * (`reports/transileExternoCiclo`, `reports/transileInternoVolcable`) como la capa
 * `features/real-truckflow/etlWorkbench`. Antes se definía arriba en etlWorkbench y
 * `domain/pipelineTypes` la re-exportaba **hacia abajo→arriba**, lo que cerraba el ciclo
 * `pipelineTypes → etlExcelFirstMerge → etlPlatformCircuitInference → transileExternoCiclo → pipelineTypes`.
 *
 * `etlWorkbench/etlExternalMovimientosContrato` la re-exporta para no romper imports existentes.
 */
export type ExternalMovimientoContratoNormalized = {
  external_operation_id: string
  source_file: string
  source_date: string
  planta_original: string
  planta_normalized: string
  mov_original: string
  mov: string
  movement_type: string
  movement_type_detail: string
  patente_original: string
  plate_normalized: string
  contrato: string
  cliente_contrato: string
  ingreso_id: string
  comprob: string
  cp_remito: string
  ctg: string
  cupo: string
  entregado_por_a: string
  localidad_proc_dest: string
  fecha_ing_original: string
  hora_ing_original: string
  fecha_calado_original: string
  hora_calado_original: string
  fecha_sal_original: string
  hora_sal_original: string
  external_ingreso_at: string
  external_calado_at: string
  external_salida_at: string
  cod_prod: string
  producto_original: string
  product_normalized: string
  plataforma_original: string
  platform_normalized: string
  plataforma_manual: string
  kgs_bruto: string
  kgs_tara: string
  kgs_neto: string
  kgs_neto_neto: string
  humedad: string
  observaciones: string
  observacion_calidad: string
  es_de_vuelta_original: string
  es_de_vuelta: boolean
  normalization_warnings: string
  external_sl_balanza_entrada_at: string
  external_sl_balanza_salida_at: string
  tiempos_entre_pasos_source_file: string
  tiempos_entre_pasos_match: string
}
