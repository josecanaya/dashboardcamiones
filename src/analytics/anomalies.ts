/**
 * Tipos para alertas que llegan del microservicio.
 * No procesamos ni detectamos qué es una alerta aquí: el microservicio envía
 * el JSON ya procesado con las alertas listas para mostrar.
 */

export interface AlertItem {
  code: string
  message: string
  severity: 'warning' | 'error' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

/**
 * Formato esperado del payload de alertas desde el microservicio.
 * El microservicio procesa y envía las alertas ya clasificadas.
 */
export interface AlertsPayloadFromMicroservice {
  version?: string
  generatedAt?: string
  data: AlertItem[]
}

